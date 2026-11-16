import { Router } from 'express';
import { pool, withUser } from '../db.js';
import { requireRole, wrap } from '../middleware/auth.js';

export const groundStations = Router();
groundStations.get('/', wrap(async (req, res) => {
  res.json(await withUser(req.user, async (c) => (await c.query(
    `SELECT g.*, count(DISTINCT s.id)::int AS satellites,
            count(cl.id)::int AS contacts_7d,
            round(100.0 * count(cl.id) FILTER (WHERE cl.success) / NULLIF(count(cl.id), 0), 1) AS contact_success
       FROM ground_stations g
       LEFT JOIN satellites s ON s.ground_station_id = g.id AND s.deleted_at IS NULL
       LEFT JOIN contact_logs cl ON cl.ground_station_id = g.id AND cl.started_at > now() - interval '7 days'
      GROUP BY g.id ORDER BY g.name`)).rows));
}));
groundStations.post('/', requireRole('admin'), wrap(async (req, res) => {
  const b = req.body;
  res.status(201).json(await withUser(req.user, async (c) => (await c.query(
    `INSERT INTO ground_stations (name, country, region, latitude, longitude) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [b.name, b.country, b.region, b.latitude, b.longitude])).rows[0]));
}));

export const alerts = Router();
alerts.get('/', wrap(async (req, res) => {
  res.json(await withUser(req.user, async (c) => (await c.query(
    `SELECT a.*, s.code AS satellite FROM alerts a JOIN satellites s ON s.id = a.satellite_id
      WHERE ($1::text IS NULL OR a.acknowledged = ($1 = 'true')) AND ($2::int IS NULL OR a.satellite_id = $2::int)
      ORDER BY a.acknowledged, a.created_at DESC LIMIT 100`, [req.query.ack || null, req.query.satellite_id || null])).rows));
}));
alerts.patch('/:id/ack', requireRole('admin', 'operator'), wrap(async (req, res) => {
  const row = await withUser(req.user, async (c) => (await c.query(
    `UPDATE alerts SET acknowledged = TRUE, acknowledged_by = $2 WHERE id = $1 RETURNING *`, [req.params.id, req.user.id])).rows[0]);
  row ? res.json(row) : res.status(404).json({ error: 'Alert not found' });
}));

export const telemetry = Router();
telemetry.get('/:id', wrap(async (req, res) => {            // 15-minute buckets (date_bin) over the last N hours
  const hours = Math.min(Number(req.query.hours) || 24, 168);
  res.json(await withUser(req.user, async (c) => (await c.query(
    `SELECT date_bin('15 minutes', recorded_at, TIMESTAMPTZ '2000-01-01') AS t,
            round(avg(altitude_km), 2) AS altitude_km, round(avg(battery_pct), 2) AS battery_pct,
            round(avg(signal_dbm), 1) AS signal_dbm, round(avg(temperature_c), 2) AS temperature_c, round(avg(velocity_kms), 3) AS velocity_kms
       FROM telemetry WHERE satellite_id = $1 AND recorded_at > now() - make_interval(hours => $2::int) GROUP BY 1 ORDER BY 1`,
    [req.params.id, hours])).rows));
}));
telemetry.get('/:id/weekly', wrap(async (req, res) => {
  res.json(await withUser(req.user, async (c) => (await c.query(
    `SELECT to_char(day, 'Mon DD') AS label, avg_altitude AS altitude, avg_battery AS battery, avg_temperature AS temperature
       FROM mv_daily_telemetry_stats WHERE satellite_id = $1 AND day > current_date - 7 ORDER BY day`, [req.params.id])).rows));
}));
telemetry.get('/:id/latest', wrap(async (req, res) => {
  res.json(await withUser(req.user, async (c) => (await c.query(
    `SELECT * FROM telemetry WHERE satellite_id = $1 ORDER BY recorded_at DESC LIMIT 1`, [req.params.id])).rows[0] || null));
}));
// refresh needs table ownership -> run as the owner, after the app-level admin check
telemetry.post('/refresh-stats', requireRole('admin'), wrap(async (_req, res) => {
  await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_telemetry_stats');
  res.json({ ok: true });
}));
