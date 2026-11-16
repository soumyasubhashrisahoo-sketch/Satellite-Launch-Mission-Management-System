CREATE OR REPLACE VIEW v_command_center AS
SELECT jsonb_build_object(
  'generated_at', now(),

  'kpis', (SELECT to_jsonb(k) FROM v_dashboard_kpis k),

  'fleet', (SELECT jsonb_build_object(
              'total', count(*),
              'online', count(*) FILTER (WHERE status = 'online'),
              'standby', count(*) FILTER (WHERE status = 'standby'),
              'offline', count(*) FILTER (WHERE status = 'offline'),
              'decommissioned', count(*) FILTER (WHERE status = 'decommissioned'),
              'low_battery', count(*) FILTER (WHERE battery_pct < 20),
              'avg_battery', round(avg(battery_pct), 1))
              FROM satellites WHERE deleted_at IS NULL),

  'by_orbit', (SELECT COALESCE(jsonb_agg(jsonb_build_object('orbit', orbit, 'count', n, 'avg_battery', b) ORDER BY orbit), '[]'::jsonb)
                 FROM (SELECT orbit, count(*) AS n, round(avg(battery_pct), 1) AS b
                         FROM satellites WHERE deleted_at IS NULL GROUP BY orbit) o),

  'satellites', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'id', d.id, 'code', d.code, 'name', d.name, 'orbit', d.orbit, 'status', d.status,
                    'battery_pct', d.battery_pct, 'altitude_km', d.altitude_km, 'signal_label', d.signal_label,
                    'ground_station_id', s.ground_station_id) ORDER BY d.code), '[]'::jsonb)
                   FROM v_satellite_details d JOIN satellites s ON s.id = d.id),

  'ground_stations', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'id', g.id, 'name', g.name, 'country', g.country, 'region', g.region,
                    'latitude', g.latitude, 'longitude', g.longitude,
                    'satellites', (SELECT count(*) FROM satellites s WHERE s.ground_station_id = g.id AND s.deleted_at IS NULL),
                    'contact_success', (SELECT round(100.0 * count(*) FILTER (WHERE cl.success) / NULLIF(count(*), 0), 1)
                                          FROM contact_logs cl WHERE cl.ground_station_id = g.id AND cl.started_at > now() - interval '7 days')
                  ) ORDER BY g.name), '[]'::jsonb)
                  FROM ground_stations g WHERE g.is_active),

  'launches', (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', code, 'vehicle', vehicle, 'site', site,
                    'launch_date', launch_date, 'status', status) ORDER BY launch_date DESC), '[]'::jsonb)
                 FROM (SELECT l.code, v.name AS vehicle, l.site, l.launch_date, l.status
                         FROM launches l JOIN launch_vehicles v ON v.id = l.vehicle_id
                        ORDER BY l.launch_date DESC LIMIT 7) x),

  'missions', (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', m.code, 'name', m.name, 'status', m.status,
                    'progress', fn_mission_progress(m.id),
                    'phase', (SELECT p.name FROM mission_phases p WHERE p.mission_id = m.id AND p.status = 'in_progress' ORDER BY p.seq LIMIT 1))
                    ORDER BY m.start_date DESC), '[]'::jsonb)
                 FROM missions m WHERE m.status IN ('active', 'upcoming')),

  'alerts', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', a.id, 'severity', a.severity, 'title', a.title,
                    'message', a.message, 'satellite', s.code, 'created_at', a.created_at) ORDER BY a.created_at DESC), '[]'::jsonb)
               FROM (SELECT * FROM alerts WHERE NOT acknowledged ORDER BY created_at DESC LIMIT 6) a
               JOIN satellites s ON s.id = a.satellite_id),

  'weekly', (SELECT jsonb_agg(jsonb_build_object('label', to_char(day, 'Dy'),
                    'launches', (SELECT count(*) FROM launches WHERE launch_date::date = day AND launch_date <= now()),
                    'transmissions', (SELECT count(*) FROM contact_logs WHERE started_at::date = day),
                    'alerts', (SELECT count(*) FROM alerts WHERE created_at::date = day)) ORDER BY day)
               FROM (SELECT d::date AS day FROM generate_series((current_date - 6)::timestamp, current_date::timestamp, interval '1 day') d) days),

  'battery_trend', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', to_char(day, 'Mon DD'), 'avg_battery', b) ORDER BY day), '[]'::jsonb)
                      FROM (SELECT day, round(avg(avg_battery), 1) AS b FROM mv_daily_telemetry_stats
                             WHERE day > current_date - 7 GROUP BY day) t),

  'contacts', (SELECT jsonb_build_object('total_7d', count(*),
                    'success_pct', round(100.0 * count(*) FILTER (WHERE success) / NULLIF(count(*), 0), 1))
                 FROM contact_logs WHERE started_at > now() - interval '7 days'),

  'telemetry_last_hour', (SELECT count(*) FROM telemetry WHERE recorded_at > now() - interval '1 hour')
) AS overview;

GRANT SELECT ON v_command_center TO orbital_admin, orbital_operator, orbital_viewer;