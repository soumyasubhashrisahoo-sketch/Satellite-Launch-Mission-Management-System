import { Router } from 'express';
import { withUser } from '../db.js';
import { wrap } from '../middleware/auth.js';

const r = Router();

r.get('/', wrap(async (req, res) => {
  res.json(await withUser(req.user, async (c) => {
    const q = async (sql, p) => (await c.query(sql, p)).rows;

    // ---- KPIs (reuses the dashboard view) ----
    const base = (await q('SELECT * FROM v_dashboard_kpis'))[0];
    const stationCount = (await q('SELECT count(*)::int AS n FROM ground_stations WHERE is_active'))[0].n;
    const kpis = {
      total_launches: base.total_launches,
      success_rate: base.success_rate,
      open_alerts: base.open_alerts,
      ground_stations: stationCount,
    };

    // ---- Fleet summary ----
    const fleet = (await q(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE status = 'online')::int  AS online,
             count(*) FILTER (WHERE status = 'standby')::int AS standby,
             count(*) FILTER (WHERE status = 'offline')::int AS offline,
             count(*) FILTER (WHERE battery_pct < 20 AND status <> 'decommissioned')::int AS low_battery,
             COALESCE(round(avg(battery_pct), 1), 0)::float AS avg_battery
        FROM satellites WHERE deleted_at IS NULL`))[0];

    const by_orbit = await q(`
      SELECT orbit, count(*)::int AS count, round(avg(battery_pct), 1)::float AS avg_battery
        FROM satellites WHERE deleted_at IS NULL
       GROUP BY orbit ORDER BY orbit`);

    // ---- Satellites for the globe ----
    const satellites = await q(`
      SELECT s.id, s.code, s.name, s.orbit, s.status, s.altitude_km, s.battery_pct,
             s.ground_station_id, v.signal_label
        FROM satellites s
        JOIN v_satellite_details v ON v.id = s.id
       WHERE s.deleted_at IS NULL
       ORDER BY s.code`);

    // ---- Ground stations (last 7 days of contacts) ----
    const ground_stations = await q(`
      SELECT g.id, g.name, g.latitude, g.longitude,
             round(100.0 * count(*) FILTER (WHERE cl.success) / NULLIF(count(cl.id), 0), 1)::float AS contact_success
        FROM ground_stations g
        LEFT JOIN contact_logs cl ON cl.ground_station_id = g.id AND cl.started_at >= now() - interval '7 days'
       WHERE g.is_active
       GROUP BY g.id ORDER BY g.name`);

    const contacts = (await q(`
      SELECT count(*)::int AS total_7d,
             COALESCE(round(100.0 * count(*) FILTER (WHERE success) / NULLIF(count(*), 0), 1), 0)::float AS success_pct
        FROM contact_logs WHERE started_at >= now() - interval '7 days'`))[0];

    // ---- Launches, missions, alerts ----
    const launches = await q(`
      SELECT l.code, v.name AS vehicle, l.status
        FROM launches l JOIN launch_vehicles v ON v.id = l.vehicle_id
       ORDER BY l.launch_date DESC LIMIT 6`);

    const missions = await q(`
      SELECT m.code, m.name, m.status,
             COALESCE((SELECT p.progress_pct FROM mission_progress p WHERE p.mission_id = m.id ORDER BY p.log_date DESC LIMIT 1), 0)::float AS progress,
             (SELECT ph.name FROM mission_phases ph WHERE ph.mission_id = m.id AND ph.status = 'in_progress' ORDER BY ph.seq LIMIT 1) AS phase
        FROM missions m WHERE m.status = 'active'
       ORDER BY m.start_date LIMIT 5`);

    const alerts = await q(`
      SELECT a.id, a.severity, a.title, a.created_at, s.code AS satellite
        FROM alerts a JOIN satellites s ON s.id = a.satellite_id
       WHERE NOT a.acknowledged
       ORDER BY a.created_at DESC LIMIT 5`);

    // ---- Charts ----
    const weekly = await q(`
      WITH days AS (SELECT d::date AS day FROM generate_series((current_date - 6)::timestamp, current_date::timestamp, interval '1 day') d)
      SELECT to_char(day, 'Dy') AS label, day,
             (SELECT count(*) FROM launches WHERE launch_date::date = day AND launch_date <= now())::int AS launches,
             (SELECT count(*) FROM contact_logs WHERE started_at::date = day)::int AS transmissions,
             (SELECT count(*) FROM alerts WHERE created_at::date = day)::int AS alerts
        FROM days ORDER BY day`);

    const battery_trend = await q(`
      SELECT to_char(day, 'Dy') AS label, round(avg(avg_battery), 1)::float AS avg_battery
        FROM mv_daily_telemetry_stats
       WHERE day >= current_date - 6
       GROUP BY day ORDER BY day`);

    const telemetry_last_hour = (await q(
      `SELECT count(*)::int AS n FROM telemetry WHERE recorded_at >= now() - interval '1 hour'`))[0].n;

    return { kpis, fleet, by_orbit, satellites, ground_stations, contacts, launches, missions, alerts, weekly, battery_trend, telemetry_last_hour };
  }));
}));

export default r;
