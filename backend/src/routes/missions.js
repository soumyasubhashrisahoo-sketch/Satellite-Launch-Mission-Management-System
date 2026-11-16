import { Router } from 'express';
import { withUser } from '../db.js';
import { requireRole, wrap } from '../middleware/auth.js';

const r = Router();
r.get('/', wrap(async (req, res) => {
  res.json(await withUser(req.user, async (c) => (await c.query(
    `SELECT m.*, fn_mission_progress(m.id) AS progress,
            (SELECT name FROM mission_phases WHERE mission_id = m.id AND status = 'in_progress' ORDER BY seq LIMIT 1) AS current_phase,
            (SELECT json_agg(json_build_object('id', s.id, 'code', s.code, 'name', s.name, 'status', s.status, 'battery_pct', s.battery_pct, 'last_contact', s.last_contact))
               FROM mission_satellites ms JOIN satellites s ON s.id = ms.satellite_id WHERE ms.mission_id = m.id) AS satellites
       FROM missions m WHERE ($1::text IS NULL OR m.status::text = $1) ORDER BY m.start_date DESC`, [req.query.status || null])).rows));
}));

r.get('/:id', wrap(async (req, res) => {
  const out = await withUser(req.user, async (c) => {
    const q = async (sql, p) => (await c.query(sql, p)).rows;
    const mission = (await q('SELECT m.*, fn_mission_progress(m.id) AS progress FROM missions m WHERE id = $1', [req.params.id]))[0];
    if (!mission) return null;
    return {
      mission,
      phases: await q('SELECT * FROM mission_phases WHERE mission_id = $1 ORDER BY seq', [req.params.id]),
      details: (await q(
        `SELECT s.code, s.name, s.orbit, s.altitude_km, s.battery_pct, s.status, s.specs, lv.name AS vehicle
           FROM mission_satellites ms JOIN satellites s ON s.id = ms.satellite_id
           LEFT JOIN launches l ON l.id = s.launch_id LEFT JOIN launch_vehicles lv ON lv.id = l.vehicle_id
          WHERE ms.mission_id = $1 ORDER BY (ms.role = 'primary') DESC LIMIT 1`, [req.params.id]))[0],
      chart: await q(
        `SELECT to_char(d.day, 'Dy') AS label, mp.progress_pct AS progress,
                (SELECT round(100.0 * count(*) FILTER (WHERE cl.success) / NULLIF(count(*), 0), 1)
                   FROM contact_logs cl JOIN mission_satellites ms ON ms.satellite_id = cl.satellite_id
                  WHERE ms.mission_id = $1 AND cl.started_at::date = d.day::date) AS contact_success
           FROM generate_series((current_date - 6)::timestamp, current_date::timestamp, interval '1 day') AS d(day)
           LEFT JOIN mission_progress mp ON mp.mission_id = $1 AND mp.log_date = d.day::date ORDER BY d.day`, [req.params.id]),
    };
  });
  out ? res.json(out) : res.status(404).json({ error: 'Mission not found' });
}));

// new mission + default phases + satellite links in one transaction
r.post('/', requireRole('admin', 'operator'), wrap(async (req, res) => {
  const b = req.body;
  const row = await withUser(req.user, async (c) => {
    const n = (await c.query('SELECT coalesce(max(id), 0) + 1 AS n FROM missions')).rows[0].n;
    const m = (await c.query(`INSERT INTO missions (code, name, objective, start_date, owner_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.code || 'M-' + String(n).padStart(3, '0'), b.name, b.objective || null, b.start_date, req.user.id])).rows[0];
    await c.query(`INSERT INTO mission_phases (mission_id, seq, name) SELECT $1, seq, name
                     FROM (VALUES (1,'Pre-launch'),(2,'Launch'),(3,'LEO Burn'),(4,'Orbit Insertion'),(5,'Operational')) p(seq, name)`, [m.id]);
    for (const sid of b.satellite_ids || [])
      await c.query('INSERT INTO mission_satellites (mission_id, satellite_id) VALUES ($1, $2)', [m.id, sid]);
    return m;
  });
  res.status(201).json(row);
}));

r.post('/:id/advance', requireRole('admin', 'operator'), wrap(async (req, res) => {
  await withUser(req.user, (c) => c.query('SELECT fn_advance_phase($1)', [req.params.id]));
  res.json({ ok: true });
}));
export default r;
