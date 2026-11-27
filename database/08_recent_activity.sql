-- =====================================================================
-- 08_recent_activity.sql
-- Fills the LAST 7 DAYS with mission progress and contact logs so these
-- show data instead of empty/zero:
--   * Missions page      -> "7-Day Mission Comparison Chart"
--   * Ground Stations    -> "Contacts (7d)" and "Success %"
-- Dates are relative to now(), so it works whenever you run it.
-- Safe to re-run: it never adds duplicates.
-- Run AFTER 01-07 (needs missions, mission_phases, satellites, etc.)
-- =====================================================================
BEGIN;

-- 1) MISSION PROGRESS: one row per active mission per day, ramping up
--    to the mission's current progress (computed from its phases).
--    UPSERT, so re-running just refreshes the values.
INSERT INTO mission_progress (mission_id, log_date, progress_pct)
SELECT m.id,
       d::date,
       round(fn_mission_progress(m.id) * (1 - (current_date - d::date) * 0.06), 1)
  FROM missions m
 CROSS JOIN generate_series(current_date - 6, current_date, interval '1 day') AS d
 WHERE m.status = 'active'
ON CONFLICT (mission_id, log_date)
DO UPDATE SET progress_pct = EXCLUDED.progress_pct;

-- 2) CONTACT LOGS: 3 contacts per day (every 8 hours) for every live
--    satellite that has a ground station, about 88% successful.
--    Skips any satellite that already has contacts in the last 7 days,
--    so running the script twice will not duplicate rows.
INSERT INTO contact_logs (satellite_id, ground_station_id, started_at, duration_s, success)
SELECT s.id,
       s.ground_station_id,
       d::date + g * interval '8 hours' + random() * interval '2 hours',
       (120 + random() * 480)::int,
       random() > 0.12
  FROM satellites s
 CROSS JOIN generate_series(current_date - 6, current_date, interval '1 day') AS d
 CROSS JOIN generate_series(0, 2) AS g
 WHERE s.deleted_at IS NULL
   AND s.ground_station_id IS NOT NULL
   AND d::date + g * interval '8 hours' < now()
   AND NOT EXISTS (SELECT 1 FROM contact_logs c
                    WHERE c.satellite_id = s.id
                      AND c.started_at > now() - interval '7 days');

COMMIT;

-- Quick check (each should return rows):
-- SELECT mission_id, log_date, progress_pct FROM mission_progress
--  WHERE log_date >= current_date - 6 ORDER BY mission_id, log_date;
-- SELECT ground_station_id, count(*) AS contacts,
--        round(100.0 * count(*) FILTER (WHERE success) / count(*), 1) AS success_pct
--   FROM contact_logs WHERE started_at > now() - interval '7 days'
--  GROUP BY ground_station_id;
