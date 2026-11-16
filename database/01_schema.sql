-- =====================================================================
-- 01_schema.sql | Tables, ENUMs, DOMAIN, constraints, partitioning
-- Concepts: DDL, 3NF, PK/FK/UNIQUE/CHECK/NOT NULL, ENUM, DOMAIN, composite PK (M:N),
--           JSONB, soft delete, declarative RANGE partitioning, ON DELETE actions
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role      AS ENUM ('admin','operator','viewer');
CREATE TYPE orbit_type     AS ENUM ('LEO','MEO','GEO','HEO');
CREATE TYPE sat_status     AS ENUM ('online','standby','offline','decommissioned');
CREATE TYPE launch_status  AS ENUM ('scheduled','success','failure','scrubbed');
CREATE TYPE mission_status AS ENUM ('upcoming','active','completed','aborted');
CREATE TYPE alert_severity AS ENUM ('info','warning','critical');
CREATE DOMAIN percentage AS NUMERIC(5,2) CHECK (VALUE >= 0 AND VALUE <= 100);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_users_email ON users (lower(email));       -- expression index

CREATE TABLE ground_stations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  country VARCHAR(80) NOT NULL,
  region VARCHAR(10) NOT NULL CHECK (region IN ('regional','global')),
  latitude NUMERIC(8,5) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(8,5) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE launch_vehicles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(60) NOT NULL UNIQUE,
  manufacturer VARCHAR(100) NOT NULL,
  payload_capacity_kg INT NOT NULL CHECK (payload_capacity_kg > 0)
);

CREATE TABLE launches (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  vehicle_id INT NOT NULL REFERENCES launch_vehicles(id) ON DELETE RESTRICT,
  site VARCHAR(100) NOT NULL,
  launch_date TIMESTAMPTZ NOT NULL,
  status launch_status NOT NULL DEFAULT 'scheduled',
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE satellites (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  norad_id INT UNIQUE,
  orbit orbit_type NOT NULL,
  status sat_status NOT NULL DEFAULT 'standby',
  battery_pct percentage NOT NULL DEFAULT 100,
  altitude_km NUMERIC(10,2) NOT NULL CHECK (altitude_km > 0),
  signal_dbm NUMERIC(6,2),
  temperature_c NUMERIC(6,2),
  launch_id INT REFERENCES launches(id) ON DELETE SET NULL,
  ground_station_id INT REFERENCES ground_stations(id) ON DELETE SET NULL,
  specs JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_contact TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ                                           -- soft delete
);

CREATE TABLE missions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  objective TEXT,
  status mission_status NOT NULL DEFAULT 'upcoming',
  start_date DATE NOT NULL,
  end_date DATE,
  owner_id INT REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT ck_mission_dates CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE TABLE mission_satellites (                                    -- M:N, composite PK
  mission_id INT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  satellite_id INT NOT NULL REFERENCES satellites(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL DEFAULT 'primary',
  PRIMARY KEY (mission_id, satellite_id)
);
CREATE TABLE mission_phases (
  id SERIAL PRIMARY KEY,
  mission_id INT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  seq INT NOT NULL CHECK (seq > 0),
  name VARCHAR(60) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
  completed_at TIMESTAMPTZ,
  UNIQUE (mission_id, seq)
);
CREATE TABLE mission_progress (
  mission_id INT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  progress_pct percentage NOT NULL,
  PRIMARY KEY (mission_id, log_date)
);

CREATE TABLE contact_logs (
  id SERIAL PRIMARY KEY,
  satellite_id INT NOT NULL REFERENCES satellites(id) ON DELETE CASCADE,
  ground_station_id INT NOT NULL REFERENCES ground_stations(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  duration_s INT NOT NULL CHECK (duration_s > 0),
  success BOOLEAN NOT NULL
);

-- Time-series table, partitioned by month
CREATE TABLE telemetry (
  id BIGSERIAL,
  satellite_id INT NOT NULL REFERENCES satellites(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  altitude_km NUMERIC(10,2) NOT NULL,
  battery_pct percentage NOT NULL,
  signal_dbm NUMERIC(6,2) NOT NULL,
  temperature_c NUMERIC(6,2) NOT NULL,
  velocity_kms NUMERIC(6,3) NOT NULL,
  PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);
CREATE TABLE telemetry_default PARTITION OF telemetry DEFAULT;

CREATE FUNCTION create_telemetry_partition(p_month DATE) RETURNS void AS $$
DECLARE v_from TIMESTAMPTZ := date_trunc('month', p_month::timestamptz);
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF telemetry FOR VALUES FROM (%L) TO (%L)',
                 'telemetry_' || to_char(v_from, 'YYYY_MM'), v_from, v_from + interval '1 month');
END $$ LANGUAGE plpgsql;
DO $$ BEGIN
  FOR i IN -2..3 LOOP PERFORM create_telemetry_partition((current_date + make_interval(months => i))::date); END LOOP;
END $$;

CREATE TABLE alerts (
  id SERIAL PRIMARY KEY,
  satellite_id INT NOT NULL REFERENCES satellites(id) ON DELETE CASCADE,
  severity alert_severity NOT NULL,
  title VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  row_id TEXT,
  old_data JSONB,
  new_data JSONB,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
