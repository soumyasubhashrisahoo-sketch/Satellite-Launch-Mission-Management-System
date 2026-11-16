-- =====================================================================
-- 04_functions_triggers.sql
-- Concepts: PL/pgSQL, stored PROCEDURE, BEFORE/AFTER row triggers, WHEN clause, audit trail,
--           LISTEN/NOTIFY, RAISE EXCEPTION, UPSERT, SELECT..FOR UPDATE, regression aggregate
-- =====================================================================
CREATE FUNCTION fn_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_sat_updated BEFORE UPDATE ON satellites FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE FUNCTION fn_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO audit_log (table_name, operation, row_id, old_data, new_data, changed_by)
  VALUES (TG_TABLE_NAME, TG_OP, to_jsonb(CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END) ->> 'id',
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END, CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END,
          COALESCE(NULLIF(current_setting('app.user', true), ''), session_user));
  RETURN NULL;
END $$;
CREATE TRIGGER trg_audit_sat_ins_del AFTER INSERT OR DELETE ON satellites FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_sat_upd AFTER UPDATE ON satellites FOR EACH ROW            -- ignore noisy telemetry updates
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.name IS DISTINCT FROM NEW.name OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_missions AFTER INSERT OR UPDATE OR DELETE ON missions FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_launches AFTER INSERT OR UPDATE OR DELETE ON launches FOR EACH ROW EXECUTE FUNCTION fn_audit();

-- finished missions are immutable
CREATE FUNCTION fn_mission_status_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('completed','aborted') THEN
    RAISE EXCEPTION 'Mission % is already % and cannot change status', OLD.code, OLD.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_mission_guard BEFORE UPDATE OF status ON missions FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION fn_mission_status_guard();

-- a decommissioned satellite cannot be re-activated
CREATE FUNCTION fn_sat_status_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Satellite % is decommissioned and cannot become %', OLD.code, NEW.status USING ERRCODE = 'check_violation';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_sat_guard BEFORE UPDATE OF status ON satellites FOR EACH ROW
  WHEN (OLD.status = 'decommissioned' AND NEW.status <> 'decommissioned') EXECUTE FUNCTION fn_sat_status_guard();

-- live telemetry: sync satellite row, raise alerts, push NOTIFY to the Node API (-> WebSocket)
CREATE FUNCTION fn_telemetry_after_insert() RETURNS trigger AS $$
DECLARE v_code TEXT; v_orbit orbit_type;
BEGIN
  UPDATE satellites SET battery_pct = NEW.battery_pct, altitude_km = NEW.altitude_km, signal_dbm = NEW.signal_dbm,
         temperature_c = NEW.temperature_c, last_contact = NEW.recorded_at
   WHERE id = NEW.satellite_id AND (last_contact IS NULL OR last_contact <= NEW.recorded_at)
   RETURNING code, orbit INTO v_code, v_orbit;
  IF v_code IS NOT NULL AND NEW.recorded_at > now() - interval '5 minutes' THEN
    IF NEW.battery_pct < 20 AND NOT EXISTS
       (SELECT 1 FROM alerts WHERE satellite_id = NEW.satellite_id AND title = 'Battery Low' AND NOT acknowledged) THEN
      INSERT INTO alerts (satellite_id, severity, title, message)
      VALUES (NEW.satellite_id, 'warning', 'Battery Low', format('%s battery at %s%%. Power conservation mode suggested.', v_code, NEW.battery_pct));
    END IF;
    IF v_orbit = 'LEO' AND NEW.altitude_km < 400 AND NOT EXISTS
       (SELECT 1 FROM alerts WHERE satellite_id = NEW.satellite_id AND title = 'Orbit Decay' AND NOT acknowledged) THEN
      INSERT INTO alerts (satellite_id, severity, title, message)
      VALUES (NEW.satellite_id, 'critical', 'Orbit Decay', format('%s altitude at %s km. Boost maneuver required.', v_code, NEW.altitude_km));
    END IF;
    PERFORM pg_notify('telemetry', json_build_object('satellite_id', NEW.satellite_id, 'code', v_code,
      'recorded_at', NEW.recorded_at, 'altitude_km', NEW.altitude_km, 'battery_pct', NEW.battery_pct,
      'signal_dbm', NEW.signal_dbm, 'temperature_c', NEW.temperature_c, 'velocity_kms', NEW.velocity_kms)::text);
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_telemetry_ai AFTER INSERT ON telemetry FOR EACH ROW EXECUTE FUNCTION fn_telemetry_after_insert();

-- linear-regression based orbit decay rate (km/day) over the last 24 h
CREATE FUNCTION fn_orbit_decay_rate(p_sat INT) RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT round((regr_slope(altitude_km, extract(epoch FROM recorded_at)) * 86400)::numeric, 3)
    FROM telemetry WHERE satellite_id = p_sat AND recorded_at > now() - interval '24 hours'
$$;

CREATE FUNCTION fn_mission_progress(p_mission_id INT) RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(round(100.0 * (count(*) FILTER (WHERE status = 'completed') + 0.5 * count(*) FILTER (WHERE status = 'in_progress'))
                        / NULLIF(count(*), 0), 1), 0) FROM mission_phases WHERE mission_id = p_mission_id
$$;

CREATE FUNCTION fn_advance_phase(p_mission INT) RETURNS void AS $$
DECLARE v_cur INT; v_status mission_status;
BEGIN
  SELECT status INTO v_status FROM missions WHERE id = p_mission FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mission % not found', p_mission; END IF;
  IF v_status IN ('completed','aborted') THEN RAISE EXCEPTION 'Mission is already %', v_status USING ERRCODE = 'check_violation'; END IF;
  SELECT seq INTO v_cur FROM mission_phases WHERE mission_id = p_mission AND status = 'in_progress' ORDER BY seq LIMIT 1 FOR UPDATE;
  IF v_cur IS NULL THEN
    UPDATE mission_phases SET status = 'in_progress' WHERE mission_id = p_mission
       AND seq = (SELECT min(seq) FROM mission_phases WHERE mission_id = p_mission AND status = 'pending');
  ELSE
    UPDATE mission_phases SET status = 'completed', completed_at = now() WHERE mission_id = p_mission AND seq = v_cur;
    UPDATE mission_phases SET status = 'in_progress' WHERE mission_id = p_mission AND seq = v_cur + 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM mission_phases WHERE mission_id = p_mission AND status <> 'completed') THEN
    UPDATE missions SET status = 'completed', end_date = GREATEST(current_date, start_date) WHERE id = p_mission;
  ELSE
    UPDATE missions SET status = 'active' WHERE id = p_mission AND status = 'upcoming';
  END IF;
  INSERT INTO mission_progress (mission_id, log_date, progress_pct) VALUES (p_mission, current_date, fn_mission_progress(p_mission))
  ON CONFLICT (mission_id, log_date) DO UPDATE SET progress_pct = EXCLUDED.progress_pct;      -- UPSERT
END $$ LANGUAGE plpgsql;

-- stored procedure: finish a launch and update its satellites in one atomic unit
CREATE PROCEDURE sp_complete_launch(p_launch_id INT, p_success BOOLEAN) LANGUAGE plpgsql AS $$
DECLARE v_status launch_status;
BEGIN
  SELECT status INTO v_status FROM launches WHERE id = p_launch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Launch % not found', p_launch_id; END IF;
  IF v_status <> 'scheduled' THEN RAISE EXCEPTION 'Launch % is already %', p_launch_id, v_status USING ERRCODE = 'check_violation'; END IF;
  UPDATE launches SET status = (CASE WHEN p_success THEN 'success' ELSE 'failure' END)::launch_status WHERE id = p_launch_id;
  UPDATE satellites SET status = (CASE WHEN p_success THEN 'online' ELSE 'decommissioned' END)::sat_status
   WHERE launch_id = p_launch_id AND deleted_at IS NULL;
END $$;
