-- 03_views.sql | VIEW, MATERIALIZED VIEW, DISTINCT ON, CASE, FILTER, REFRESH CONCURRENTLY
CREATE VIEW v_satellite_details AS
SELECT s.id, s.code, s.name, s.norad_id, s.orbit, s.status, s.battery_pct, s.altitude_km, s.signal_dbm, s.temperature_c,
       CASE WHEN s.signal_dbm IS NULL THEN 'Unknown' WHEN s.signal_dbm >= -65 THEN 'Strong'
            WHEN s.signal_dbm >= -75 THEN 'Good' WHEN s.signal_dbm >= -85 THEN 'Stable' ELSE 'Weak' END AS signal_label,
       s.last_contact, s.specs, gs.name AS ground_station, l.code AS launch_code, s.created_at
  FROM satellites s
  LEFT JOIN ground_stations gs ON gs.id = s.ground_station_id
  LEFT JOIN launches l ON l.id = s.launch_id
 WHERE s.deleted_at IS NULL;

CREATE VIEW v_dashboard_kpis AS
SELECT (SELECT count(*) FROM satellites WHERE status = 'online' AND deleted_at IS NULL)::int AS active_satellites,
       (SELECT count(*) FROM satellites WHERE deleted_at IS NULL AND created_at > now() - interval '7 days')::int AS new_satellites_week,
       (SELECT count(*) FROM launches)::int AS total_launches,
       (SELECT count(*) FROM launches WHERE launch_date > now() - interval '30 days' AND launch_date <= now())::int AS launches_30d,
       (SELECT round(100.0 * count(*) FILTER (WHERE status = 'success')
               / NULLIF(count(*) FILTER (WHERE status IN ('success','failure')), 0), 1) FROM launches) AS success_rate,
       (SELECT count(*) FROM alerts WHERE NOT acknowledged)::int AS open_alerts,
       (SELECT count(*) FROM ground_stations WHERE is_active)::int AS ground_stations;

CREATE VIEW v_latest_telemetry AS
SELECT DISTINCT ON (satellite_id) * FROM telemetry ORDER BY satellite_id, recorded_at DESC;

CREATE MATERIALIZED VIEW mv_daily_telemetry_stats AS
SELECT satellite_id, date_trunc('day', recorded_at)::date AS day, count(*) AS readings,
       round(avg(battery_pct), 2) AS avg_battery, min(battery_pct) AS min_battery,
       round(avg(altitude_km), 2) AS avg_altitude, round(avg(temperature_c), 2) AS avg_temperature
  FROM telemetry GROUP BY satellite_id, date_trunc('day', recorded_at)::date;
CREATE UNIQUE INDEX uq_mv_daily ON mv_daily_telemetry_stats (satellite_id, day);
