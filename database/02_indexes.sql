-- 02_indexes.sql | B-tree composite, BRIN, partial, GIN (JSONB), covering (INCLUDE)
CREATE INDEX idx_telemetry_sat_time  ON telemetry (satellite_id, recorded_at DESC);
CREATE INDEX idx_telemetry_time_brin ON telemetry USING BRIN (recorded_at);
CREATE INDEX idx_alerts_open         ON alerts (created_at DESC) WHERE NOT acknowledged;
CREATE INDEX idx_alerts_sat          ON alerts (satellite_id);
CREATE INDEX idx_sat_specs_gin       ON satellites USING GIN (specs jsonb_path_ops);
CREATE INDEX idx_sat_status          ON satellites (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_sat_station         ON satellites (ground_station_id);
CREATE INDEX idx_launches_date       ON launches (launch_date DESC) INCLUDE (code, status);
CREATE INDEX idx_contacts_time       ON contact_logs (started_at);
CREATE INDEX idx_contacts_sat        ON contact_logs (satellite_id, started_at);
CREATE INDEX idx_audit_table_time    ON audit_log (table_name, changed_at DESC);
