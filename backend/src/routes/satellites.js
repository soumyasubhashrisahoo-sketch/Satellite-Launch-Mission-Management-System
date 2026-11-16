import { Router } from 'express';
import { withUser } from '../db.js';
import { requireRole, wrap } from '../middleware/auth.js';

const r = Router();
r.get('/', wrap(async (req, res) => {
  const { q, status } = req.query;
  res.json(await withUser(req.user, async (c) => (await c.query(
    `SELECT * FROM v_satellite_details
      WHERE ($1::text IS NULL OR code ILIKE '%' || $1 || '%' OR name ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR status::text = $2)
      ORDER BY code`, [q || null, status || null])).rows));
}));

r.get('/:id', wrap(async (req, res) => {
  const row = await withUser(req.user, async (c) => (await c.query(
    `SELECT d.*, (SELECT json_agg(json_build_object('code', m.code, 'name', m.name, 'status', m.status))
                    FROM mission_satellites ms JOIN missions m ON m.id = ms.mission_id WHERE ms.satellite_id = d.id) AS missions,
            fn_orbit_decay_rate(d.id) AS decay_km_per_day
       FROM v_satellite_details d WHERE d.id = $1`, [req.params.id])).rows[0]);
  row ? res.json(row) : res.status(404).json({ error: 'Satellite not found' });
}));

r.post('/', requireRole('admin', 'operator'), wrap(async (req, res) => {
  const b = req.body;
  const row = await withUser(req.user, async (c) => (await c.query(
    `INSERT INTO satellites (code, name, norad_id, orbit, status, altitude_km, ground_station_id, specs)
     VALUES ($1,$2,$3,$4,COALESCE($5,'standby'),$6,$7, jsonb_build_object('payload', $8::text, 'nominal_km', $6::numeric)) RETURNING *`,
    [b.code, b.name, b.norad_id || null, b.orbit, b.status || null, b.altitude_km, b.ground_station_id || null, b.payload || 'Unspecified'])).rows[0]);
  res.status(201).json(row);
}));

r.put('/:id', requireRole('admin', 'operator'), wrap(async (req, res) => {
  const b = req.body;
  const row = await withUser(req.user, async (c) => (await c.query(
    `UPDATE satellites SET name = COALESCE($2, name), status = COALESCE($3::sat_status, status),
            ground_station_id = COALESCE($4, ground_station_id) WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [req.params.id, b.name, b.status, b.ground_station_id])).rows[0]);
  row ? res.json(row) : res.status(404).json({ error: 'Satellite not found' });
}));

r.delete('/:id', requireRole('admin'), wrap(async (req, res) => {          // soft delete
  await withUser(req.user, (c) => c.query('UPDATE satellites SET deleted_at = now() WHERE id = $1', [req.params.id]));
  res.status(204).end();
}));
export default r;
