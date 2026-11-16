-- 06_seed.sql | Realistic sample data (24 satellites, 128 launches, 12 ground stations, 7 days of telemetry)
INSERT INTO users (name, email, password_hash, role) VALUES
 ('Jordan Doe','admin@orbitalops.com',    crypt('admin123',    gen_salt('bf')), 'admin'),
 ('Alex Kim',  'operator@orbitalops.com', crypt('operator123', gen_salt('bf')), 'operator'),
 ('Jane Doe',  'viewer@orbitalops.com',   crypt('viewer123',   gen_salt('bf')), 'viewer');

INSERT INTO ground_stations (name, country, region, latitude, longitude) VALUES
 ('Bengaluru ISTRAC','India','regional',12.9716,77.5946),('Lucknow GS','India','regional',26.8467,80.9462),
 ('Port Blair GS','India','regional',11.6234,92.7265),('Svalbard SvalSat','Norway','global',78.2298,15.4078),
 ('Kourou','French Guiana','global',5.1600,-52.6500),('Wallops','USA','global',37.9402,-75.4664),
 ('Perth','Australia','global',-31.9505,115.8605),('Santiago','Chile','global',-33.4489,-70.6693),
 ('Hartebeesthoek','South Africa','global',-25.8900,27.6850),('Troll Antarctica','Antarctica','global',-72.0114,2.5350),
 ('Fairbanks','USA','global',64.8378,-147.7164),('Singapore GS','Singapore','global',1.3521,103.8198);

INSERT INTO launch_vehicles (name, manufacturer, payload_capacity_kg) VALUES
 ('PSLV-C60','ISRO',1750),('GSLV Mk II','ISRO',2700),('Falcon 9','SpaceX',22800),('Vega-C','Arianespace',2300),('Electron','Rocket Lab',300);

INSERT INTO launches (code, vehicle_id, site, launch_date, status)
SELECT 'L-' || lpad(i::text, 3, '0'), 1 + i % 5,
       (ARRAY['Sriharikota','Vandenberg','Kourou'])[1 + i % 3],
       now() - ((127 - i) * interval '12 hours'),
       CASE WHEN i % 57 = 0 THEN 'failure' ELSE 'success' END::launch_status
  FROM generate_series(1, 126) i;
INSERT INTO launches (code, vehicle_id, site, launch_date, status) VALUES
 ('L-127', 1, 'Sriharikota', now() + interval '3 days',  'scheduled'),
 ('L-128', 3, 'Vandenberg',  now() + interval '10 days', 'scheduled');

INSERT INTO satellites (code, name, norad_id, orbit, status, altitude_km, launch_id, ground_station_id, specs)
SELECT 'SAT-' || lpad(i::text, 3, '0'),
       CASE i WHEN 7 THEN 'Kepler-B' WHEN 12 THEN 'Orion-X' ELSE 'Sentinel-' || i END,
       48000 + i,
       (CASE WHEN i % 6 = 0 THEN 'GEO' WHEN i % 6 = 1 THEN 'MEO' ELSE 'LEO' END)::orbit_type,
       (CASE WHEN i % 11 = 0 THEN 'standby' ELSE 'online' END)::sat_status,
       CASE WHEN i % 6 = 0 THEN 35786 WHEN i % 6 = 1 THEN 2020 ELSE 480 + (i * 3) % 60 END,
       i, 1 + i % 12,
       jsonb_build_object('payload', (ARRAY['Optical Imager','AIS Receiver','SAR','Comms Relay'])[1 + i % 4],
                          'power_w', 300 + (i % 5) * 30, 'mass_kg', 150 + i * 12)
  FROM generate_series(1, 24) i;
UPDATE satellites SET created_at = now() - interval '30 days';
UPDATE satellites SET created_at = now() - interval '2 days' WHERE code IN ('SAT-023','SAT-024');
UPDATE satellites SET specs = specs || jsonb_build_object('nominal_km', altitude_km);

INSERT INTO telemetry (satellite_id, recorded_at, altitude_km, battery_pct, signal_dbm, temperature_c, velocity_kms)
SELECT s.id, t, s.altitude_km + (random() - 0.5) * 0.6,
       LEAST(100, GREATEST(25, 70 + 25 * sin(extract(epoch FROM t) / 43200 + s.id) + (random() - 0.5) * 3)),
       -60 - random() * 20, 20 + 3 * sin(extract(epoch FROM t) / 21600 + s.id) + random(),
       CASE s.orbit WHEN 'LEO' THEN 7.6 WHEN 'MEO' THEN 3.9 ELSE 3.07 END + random() * 0.1
  FROM satellites s CROSS JOIN generate_series(now() - interval '7 days', now() - interval '10 minutes', interval '1 hour') t;

-- match the dashboard screenshots
UPDATE satellites SET orbit='LEO', altitude_km=512,   battery_pct=87, status='online',  signal_dbm=-58 WHERE code='SAT-012';
UPDATE satellites SET orbit='MEO', altitude_km=2020,  battery_pct=72, status='online',  signal_dbm=-68 WHERE code='SAT-007';
UPDATE satellites SET orbit='LEO', altitude_km=498,   battery_pct=45, status='standby', signal_dbm=-78 WHERE code='SAT-019';
UPDATE satellites SET orbit='GEO', altitude_km=35786, battery_pct=92, status='online',  signal_dbm=-60 WHERE code='SAT-003';
UPDATE satellites SET orbit='LEO', altitude_km=504,   battery_pct=18, status='offline', signal_dbm=-92 WHERE code='SAT-021';
UPDATE satellites SET specs = specs || jsonb_build_object('nominal_km', altitude_km) WHERE code IN ('SAT-012','SAT-007','SAT-019','SAT-003','SAT-021');

INSERT INTO contact_logs (satellite_id, ground_station_id, started_at, duration_s, success)
SELECT 1 + floor(random() * 24)::int, 1 + floor(random() * 12)::int, now() - random() * interval '7 days',
       120 + floor(random() * 500)::int, random() < 0.93
  FROM generate_series(1, 700);

INSERT INTO missions (code, name, objective, status, start_date, owner_id) VALUES
 ('M-007','Kepler-B','Earth observation and maritime tracking','active',    current_date - 120, 2),
 ('M-012','Orion-X','Technology demonstrator, LEO relay',      'active',    current_date - 60,  2),
 ('M-003','GEO-Relay','Geostationary communications relay',    'completed', current_date - 400, 1),
 ('M-015','Aurora','Polar ice monitoring',                     'upcoming',  current_date + 20,  1);
UPDATE missions SET end_date = current_date - 30 WHERE code = 'M-003';
INSERT INTO mission_satellites (mission_id, satellite_id, role)
SELECT m.id, s.id, 'primary' FROM (VALUES ('M-007','SAT-007'),('M-012','SAT-012'),('M-003','SAT-003'),('M-015','SAT-015')) v(mc, sc)
  JOIN missions m ON m.code = v.mc JOIN satellites s ON s.code = v.sc;
INSERT INTO mission_satellites SELECT m.id, s.id, 'secondary' FROM missions m, satellites s WHERE m.code='M-007' AND s.code='SAT-019';

INSERT INTO mission_phases (mission_id, seq, name, status, completed_at)
SELECT m.id, p.seq, p.name,
       CASE WHEN m.code = 'M-003' OR p.seq <= v.done THEN 'completed' WHEN p.seq = v.done + 1 AND m.code <> 'M-015' THEN 'in_progress' ELSE 'pending' END,
       CASE WHEN m.code = 'M-003' OR p.seq <= v.done THEN now() - interval '20 days' END
  FROM missions m
  JOIN (VALUES ('M-007',3),('M-012',2),('M-003',5),('M-015',0)) v(mc, done) ON v.mc = m.code
  CROSS JOIN (VALUES (1,'Pre-launch'),(2,'Launch'),(3,'LEO Burn'),(4,'Orbit Insertion'),(5,'Operational')) p(seq, name);

INSERT INTO mission_progress (mission_id, log_date, progress_pct)
SELECT (SELECT id FROM missions WHERE code = 'M-007'), current_date - 7 + i::int, v
  FROM unnest(ARRAY[58,76,76,85,90,92,92]) WITH ORDINALITY u(v, i);
INSERT INTO mission_progress (mission_id, log_date, progress_pct)
SELECT (SELECT id FROM missions WHERE code = 'M-012'), current_date - 7 + i::int, v
  FROM unnest(ARRAY[30,34,38,41,45,47,50]) WITH ORDINALITY u(v, i);

INSERT INTO alerts (satellite_id, severity, title, message, acknowledged, acknowledged_by, created_at)
SELECT 1 + i % 24, (ARRAY['info','warning','critical'])[1 + i % 3]::alert_severity, 'Signal Degradation',
       'Signal margin dropped below threshold during pass.', TRUE, 2, now() - random() * interval '7 days'
  FROM generate_series(1, 40) i;
INSERT INTO alerts (satellite_id, severity, title, message, created_at)
SELECT s.id, 'critical', 'Orbit Decay', 'Altitude trending down -2.1km/day. Re-entry risk elevated. Recommended: boost maneuver required.', now() - interval '12 minutes'
  FROM satellites s WHERE code = 'SAT-006';
INSERT INTO alerts (satellite_id, severity, title, message, created_at)
SELECT s.id, 'warning', 'Battery Low', 'Battery at 18% and dropping. Below safe threshold 20%. Power conservation mode suggested.', now() - interval '34 minutes'
  FROM satellites s WHERE code = 'SAT-021';

REFRESH MATERIALIZED VIEW mv_daily_telemetry_stats;
SELECT setval(pg_get_serial_sequence('launches','id'), 128);
