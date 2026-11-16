-- 05_security.sql | Roles, GRANT/REVOKE (least privilege). Node switches role per request with SET LOCAL ROLE.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orbital_admin')    THEN CREATE ROLE orbital_admin NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orbital_operator') THEN CREATE ROLE orbital_operator NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orbital_viewer')   THEN CREATE ROLE orbital_viewer NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO orbital_admin, orbital_operator, orbital_viewer;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO orbital_admin, orbital_operator, orbital_viewer;
REVOKE ALL ON users FROM orbital_admin, orbital_operator, orbital_viewer;
REVOKE ALL ON audit_log FROM orbital_operator, orbital_viewer;
GRANT SELECT (id, name, email, role) ON users TO orbital_admin;          -- never the password hash

GRANT INSERT, UPDATE ON satellites, launches, missions, mission_phases, mission_satellites, mission_progress,
      alerts, contact_logs, telemetry TO orbital_operator;
GRANT INSERT, UPDATE, DELETE ON satellites, launches, missions, mission_phases, mission_satellites, mission_progress,
      alerts, contact_logs, telemetry, ground_stations, launch_vehicles TO orbital_admin;
GRANT INSERT, UPDATE (role) ON users TO orbital_admin;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO orbital_admin, orbital_operator;

REVOKE EXECUTE ON PROCEDURE sp_complete_launch(INT, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_advance_phase(INT) FROM PUBLIC;
GRANT EXECUTE ON PROCEDURE sp_complete_launch(INT, BOOLEAN) TO orbital_admin, orbital_operator;
GRANT EXECUTE ON FUNCTION fn_advance_phase(INT) TO orbital_admin, orbital_operator;
