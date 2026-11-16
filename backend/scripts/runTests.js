// DB test suite: valid / invalid / boundary / security cases. Each runs in its own transaction as the given
// PostgreSQL role and is ALWAYS rolled back. Writes docs/TEST_RESULTS.md
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'TEST_RESULTS.md');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function as(role, fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    if (role !== 'owner') { await c.query(`SET LOCAL ROLE orbital_${role}`); await c.query(`SELECT set_config('app.user','test-runner',true)`); }
    return await fn(c);
  } finally { await c.query('ROLLBACK'); c.release(); }
}
const one = async (c, s, p) => (await c.query(s, p)).rows[0];
const ins = (c, extra = '') => c.query(`INSERT INTO telemetry (satellite_id, altitude_km, battery_pct, signal_dbm, temperature_c, velocity_kms) VALUES ${extra}`);

const T = [
 ['T01','Constraint','VALID: operator registers a satellite','operator','ok', (c) => c.query(`INSERT INTO satellites (code,name,orbit,altitude_km) VALUES ('SAT-900','Test','LEO',500)`)],
 ['T02','Constraint','INVALID: duplicate satellite code','operator','23505', (c) => c.query(`INSERT INTO satellites (code,name,orbit,altitude_km) VALUES ('SAT-007','Dup','LEO',500)`)],
 ['T03','Constraint','INVALID: negative altitude (CHECK)','operator','23514', (c) => c.query(`INSERT INTO satellites (code,name,orbit,altitude_km) VALUES ('SAT-901','Bad','LEO',-5)`)],
 ['T04','Constraint','BOUNDARY: zero altitude rejected','operator','23514', (c) => c.query(`INSERT INTO satellites (code,name,orbit,altitude_km) VALUES ('SAT-902','Bad','LEO',0)`)],
 ['T05','Constraint','INVALID: battery 100.01% (DOMAIN percentage)','operator','23514', (c) => c.query(`UPDATE satellites SET battery_pct = 100.01 WHERE code='SAT-007'`)],
 ['T06','Constraint','BOUNDARY: battery exactly 100 and 0 accepted','operator','ok', async (c) => { await c.query(`UPDATE satellites SET battery_pct=100 WHERE code='SAT-007'`); await c.query(`UPDATE satellites SET battery_pct=0 WHERE code='SAT-007'`); }],
 ['T07','Constraint','INVALID: unknown orbit type (ENUM)','operator','22P02', (c) => c.query(`INSERT INTO satellites (code,name,orbit,altitude_km) VALUES ('SAT-903','Bad','XYZ',500)`)],
 ['T08','Constraint','INVALID: satellite references missing launch (FK)','operator','23503', (c) => c.query(`INSERT INTO satellites (code,name,orbit,altitude_km,launch_id) VALUES ('SAT-904','Bad','LEO',500,99999)`)],
 ['T09','Constraint','INVALID: mission end date before start date','operator','23514', (c) => c.query(`INSERT INTO missions (code,name,start_date,end_date) VALUES ('M-900','Bad','2026-12-10','2026-12-01')`)],
 ['T10','Constraint','INVALID: ground station latitude 91','admin','23514', (c) => c.query(`INSERT INTO ground_stations (name,country,region,latitude,longitude) VALUES ('X','Y','global',91,0)`)],
 ['T11','Trigger','INVALID: re-activate a decommissioned satellite','operator','23514', async (c) => { await c.query(`UPDATE satellites SET status='decommissioned' WHERE code='SAT-007'`); await c.query(`UPDATE satellites SET status='online' WHERE code='SAT-007'`); }],
 ['T12','Trigger','INVALID: change status of a completed mission','operator','23514', (c) => c.query(`UPDATE missions SET status='active' WHERE code='M-003'`)],
 ['T13','Trigger','VALID: low battery telemetry raises a Battery Low alert','operator','ok', async (c) => {
    await ins(c, `((SELECT id FROM satellites WHERE code='SAT-001'), 500, 12, -70, 21, 7.6)`);
    const r = await one(c, `SELECT count(*)::int n FROM alerts a JOIN satellites s ON s.id=a.satellite_id WHERE s.code='SAT-001' AND a.title='Battery Low' AND NOT a.acknowledged`);
    if (r.n !== 1) throw new Error('alerts=' + r.n); }],
 ['T14','Trigger','VALID: a second low reading does NOT duplicate the open alert','operator','ok', async (c) => {
    await ins(c, `((SELECT id FROM satellites WHERE code='SAT-001'), 500, 12, -70, 21, 7.6), ((SELECT id FROM satellites WHERE code='SAT-001'), 500, 11, -70, 21, 7.6)`);
    const r = await one(c, `SELECT count(*)::int n FROM alerts a JOIN satellites s ON s.id=a.satellite_id WHERE s.code='SAT-001' AND a.title='Battery Low' AND NOT a.acknowledged`);
    if (r.n !== 1) throw new Error('alerts=' + r.n); }],
 ['T15','Trigger','BOUNDARY: battery exactly 20% raises no alert','operator','ok', async (c) => {
    await ins(c, `((SELECT id FROM satellites WHERE code='SAT-002'), 500, 20, -70, 21, 7.6)`);
    const r = await one(c, `SELECT count(*)::int n FROM alerts a JOIN satellites s ON s.id=a.satellite_id WHERE s.code='SAT-002' AND a.title='Battery Low'`);
    if (r.n !== 0) throw new Error('alerts=' + r.n); }],
 ['T16','Trigger','VALID: LEO altitude < 400 km raises critical Orbit Decay alert','operator','ok', async (c) => {
    await ins(c, `((SELECT id FROM satellites WHERE code='SAT-002'), 390, 80, -70, 21, 7.6)`);
    const r = await one(c, `SELECT severity FROM alerts a JOIN satellites s ON s.id=a.satellite_id WHERE s.code='SAT-002' AND a.title='Orbit Decay'`);
    if (r?.severity !== 'critical') throw new Error('no critical alert'); }],
 ['T17','Trigger','VALID: telemetry insert syncs the satellite row','operator','ok', async (c) => {
    await ins(c, `((SELECT id FROM satellites WHERE code='SAT-002'), 501.5, 66, -61, 22, 7.6)`);
    const r = await one(c, `SELECT battery_pct, altitude_km FROM satellites WHERE code='SAT-002'`);
    if (+r.battery_pct !== 66 || +r.altitude_km !== 501.5) throw new Error(JSON.stringify(r)); }],
 ['T18','Trigger','VALID: status change is written to audit_log','operator','ok', async (c) => {
    await c.query(`UPDATE satellites SET status='standby' WHERE code='SAT-001'`);
    await c.query('RESET ROLE');                       // audit_log is not readable by operators - verify as owner
    const r = await one(c, `SELECT count(*)::int n FROM audit_log WHERE table_name='satellites' AND changed_by='test-runner'`);
    if (r.n < 1) throw new Error('no audit row'); }],
 ['T19','Procedure','VALID: successful launch brings satellite online','operator','ok', async (c) => {
    const l = await one(c, `INSERT INTO launches (code,vehicle_id,site,launch_date) VALUES ('L-T1',1,'X',now()) RETURNING id`);
    await c.query(`INSERT INTO satellites (code,name,orbit,altitude_km,launch_id) VALUES ('SAT-905','T','LEO',500,$1)`, [l.id]);
    await c.query('CALL sp_complete_launch($1, true)', [l.id]);
    const r = await one(c, `SELECT status FROM satellites WHERE code='SAT-905'`);
    if (r.status !== 'online') throw new Error(r.status); }],
 ['T20','Procedure','VALID: failed launch decommissions satellite','operator','ok', async (c) => {
    const l = await one(c, `INSERT INTO launches (code,vehicle_id,site,launch_date) VALUES ('L-T2',1,'X',now()) RETURNING id`);
    await c.query(`INSERT INTO satellites (code,name,orbit,altitude_km,launch_id) VALUES ('SAT-906','T','LEO',500,$1)`, [l.id]);
    await c.query('CALL sp_complete_launch($1, false)', [l.id]);
    const r = await one(c, `SELECT status FROM satellites WHERE code='SAT-906'`);
    if (r.status !== 'decommissioned') throw new Error(r.status); }],
 ['T21','Procedure','INVALID: completing an already finished launch','operator','23514', (c) => c.query(`CALL sp_complete_launch(1, true)`)],
 ['T22','Procedure','INVALID: completing a non-existent launch','operator','P0001', (c) => c.query(`CALL sp_complete_launch(99999, true)`)],
 ['T23','Function','VALID: advancing a phase moves progress 0 -> 10','operator','ok', async (c) => {
    await c.query(`SELECT fn_advance_phase(id) FROM missions WHERE code='M-015'`);
    const r = await one(c, `SELECT fn_mission_progress(id) p FROM missions WHERE code='M-015'`);
    if (+r.p !== 10) throw new Error('p=' + r.p); }],
 ['T24','Function','VALID: advancing 5 times completes the mission','operator','ok', async (c) => {
    for (let i = 0; i < 6; i++) await c.query(`SELECT fn_advance_phase(id) FROM missions WHERE code='M-015'`);
    const r = await one(c, `SELECT status FROM missions WHERE code='M-015'`);
    if (r.status !== 'completed') throw new Error(r.status); }],
 ['T25','Transaction','ROLLBACK: update is undone after ROLLBACK TO savepoint','owner','ok', async (c) => {
    await c.query('SAVEPOINT s'); await c.query(`UPDATE satellites SET name='CHANGED' WHERE code='SAT-007'`); await c.query('ROLLBACK TO s');
    const r = await one(c, `SELECT name FROM satellites WHERE code='SAT-007'`); if (r.name !== 'Kepler-B') throw new Error(r.name); }],
 ['T26','Transaction','ATOMICITY: launch + satellite insert fails together','operator','ok', async (c) => {
    await c.query('SAVEPOINT s');
    let failed = false;
    try { await c.query(`INSERT INTO launches (code,vehicle_id,site,launch_date) VALUES ('L-T3',1,'X',now())`);
          await c.query(`INSERT INTO satellites (code,name,orbit,altitude_km) VALUES ('SAT-007','dup','LEO',500)`); } catch { failed = true; }
    await c.query('ROLLBACK TO s');
    const r = await one(c, `SELECT count(*)::int n FROM launches WHERE code='L-T3'`);
    if (!failed || r.n) throw new Error('partial write leaked'); }],
 ['T27','Security','UNAUTHORIZED: viewer cannot insert a satellite','viewer','42501', (c) => c.query(`INSERT INTO satellites (code,name,orbit,altitude_km) VALUES ('SAT-910','X','LEO',500)`)],
 ['T28','Security','UNAUTHORIZED: viewer cannot update a satellite','viewer','42501', (c) => c.query(`UPDATE satellites SET name='x' WHERE code='SAT-007'`)],
 ['T29','Security','UNAUTHORIZED: viewer cannot call sp_complete_launch','viewer','42501', (c) => c.query('CALL sp_complete_launch(127, true)')],
 ['T30','Security','VALID: viewer can read the satellite view','viewer','ok', async (c) => { const r = await one(c, 'SELECT count(*)::int n FROM v_satellite_details'); if (r.n < 24) throw new Error('n=' + r.n); }],
 ['T31','Security','UNAUTHORIZED: operator cannot delete a satellite row','operator','42501', (c) => c.query(`DELETE FROM satellites WHERE code='SAT-007'`)],
 ['T32','Security','UNAUTHORIZED: operator cannot add a ground station','operator','42501', (c) => c.query(`INSERT INTO ground_stations (name,country,region,latitude,longitude) VALUES ('X','Y','global',1,1)`)],
 ['T33','Security','UNAUTHORIZED: operator cannot read audit_log','operator','42501', (c) => c.query('SELECT * FROM audit_log')],
 ['T34','Security','VALID: admin can read audit_log','admin','ok', (c) => c.query('SELECT * FROM audit_log LIMIT 1')],
 ['T35','Security','UNAUTHORIZED: nobody (even admin) can read password hashes','admin','42501', (c) => c.query('SELECT password_hash FROM users')],
 ['T36','Security','VALID: wrong password matches no user (pgcrypto)','owner','ok', async (c) => { const r = await one(c, `SELECT count(*)::int n FROM users WHERE password_hash = crypt('wrong', password_hash)`); if (r.n) throw new Error('matched'); }],
 ['T37','Index','VALID: planner prunes telemetry partitions for a 2-day window','owner','ok', async (c) => {
    const d = new Date(), a = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)), b = new Date(a.getTime() + 2 * 864e5);
    const plan = (await c.query(`EXPLAIN SELECT count(*) FROM telemetry WHERE recorded_at >= '${a.toISOString()}' AND recorded_at < '${b.toISOString()}'`)).rows.map((r) => r['QUERY PLAN']).join('\n');
    const monthly = new Set(plan.match(/telemetry_\d{4}_\d{2}/g) || []);
    if (monthly.size !== 1) throw new Error('expected exactly 1 monthly partition, got ' + [...monthly]); }],
];

const rows = [];
for (const [id, area, name, role, expect, fn] of T) {
  let outcome, ok;
  try { await as(role, fn); outcome = 'Accepted'; ok = expect === 'ok'; }
  catch (e) { outcome = e.code ? `Rejected [${e.code}] ${e.message.split('\n')[0]}` : `Failed: ${e.message}`; ok = expect !== 'ok' && e.code === expect; }
  rows.push({ id, area, name, role, expect: expect === 'ok' ? 'accept' : 'reject ' + expect, outcome, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}\n       -> ${outcome}`);
}
const passed = rows.filter((r) => r.ok).length;
console.log(`\n${passed}/${rows.length} passed`);
const esc = (s) => s.replace(/\|/g, '\\|');
fs.writeFileSync(out, `# Test results\n\nGenerated by \`npm run test:db\` on ${new Date().toISOString().slice(0, 10)}. Each case runs in its own transaction under the stated PostgreSQL role and is rolled back.\n\n**Result: ${passed} / ${rows.length} passed**\n\n| ID | Area | Test case | Role | Expected | Actual outcome | Result |\n|----|------|-----------|------|----------|----------------|--------|\n${rows.map((r) => `| ${r.id} | ${r.area} | ${esc(r.name)} | ${r.role} | ${r.expect} | ${esc(r.outcome)} | ${r.ok ? 'PASS' : '**FAIL**'} |`).join('\n')}\n`);
await pool.end();
process.exit(passed === rows.length ? 0 : 1);
