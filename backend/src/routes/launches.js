import { Router } from 'express';
import { withUser } from '../db.js';
import { requireRole, wrap } from '../middleware/auth.js';

const r = Router();
r.get('/', wrap(async (req, res) => {
  res.json(await withUser(req.user, async (c) => ({
    vehicles: (await c.query('SELECT * FROM launch_vehicles ORDER BY name')).rows,
    launches: (await c.query(
      `SELECT l.*, v.name AS vehicle, (SELECT count(*) FROM satellites s WHERE s.launch_id = l.id)::int AS satellites
         FROM launches l JOIN launch_vehicles v ON v.id = l.vehicle_id
        WHERE ($1::text IS NULL OR l.status::text = $1) ORDER BY l.launch_date DESC LIMIT 100`, [req.query.status || null])).rows,
  })));
}));

// Schedule a launch and (optionally) its payload satellite in ONE transaction
r.post('/', requireRole('admin', 'operator'), wrap(async (req, res) => {
  const b = req.body;
  const row = await withUser(req.user, async (c) => {
    const l = (await c.query(`INSERT INTO launches (code, vehicle_id, site, launch_date, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.code, b.vehicle_id, b.site, b.launch_date, req.user.id])).rows[0];
    if (b.satellite?.code)
      await c.query(`INSERT INTO satellites (code, name, orbit, altitude_km, launch_id, specs)
                     VALUES ($1,$2,$3,$4,$5, jsonb_build_object('nominal_km', $4::numeric))`,
        [b.satellite.code, b.satellite.name, b.satellite.orbit, b.satellite.altitude_km, l.id]);
    return l;
  });
  res.status(201).json(row);
}));

r.post('/:id/complete', requireRole('admin', 'operator'), wrap(async (req, res) => {
  await withUser(req.user, (c) => c.query('CALL sp_complete_launch($1, $2)', [req.params.id, !!req.body.success]));
  res.json({ ok: true });
}));
export default r;
