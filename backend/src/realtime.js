// PostgreSQL LISTEN/NOTIFY -> WebSocket fan-out, plus an optional telemetry simulator.
import pg from 'pg';
import { WebSocketServer } from 'ws';
import { pool } from './db.js';
import { verifyToken } from './middleware/auth.js';

export function attachRealtime(server) {
  const wss = new WebSocketServer({ server, path: '/ws/telemetry' });
  wss.on('connection', (ws, req) => {
    try { verifyToken(new URL(req.url, 'http://x').searchParams.get('token')); } catch { ws.close(4401, 'unauthorized'); }
  });

  const listener = new pg.Client({ connectionString: process.env.DATABASE_URL });
  listener.connect().then(() => listener.query('LISTEN telemetry')).catch((e) => console.error('LISTEN failed', e.message));
  listener.on('notification', (m) => wss.clients.forEach((c) => c.readyState === 1 && c.send(m.payload)));

  // keep the pre-aggregated materialized view fresh (CONCURRENTLY = readers are never blocked)
  setInterval(() => pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_telemetry_stats').catch(() => {}), 5 * 60 * 1000);

  if (process.env.SIMULATE !== 'false') {
    const every = Number(process.env.SIMULATE_EVERY_MS) || 4000;
    setInterval(() => pool.query(
      `INSERT INTO telemetry (satellite_id, altitude_km, battery_pct, signal_dbm, temperature_c, velocity_kms)
       SELECT id,
              altitude_km + ((specs->>'nominal_km')::numeric - altitude_km) * 0.2 + (random() - 0.5) * 0.3,
              CASE WHEN battery_pct < 15 THEN 90 ELSE GREATEST(5, LEAST(100, battery_pct + (random() - 0.5) * 0.4 - 0.003)) END,
              -60 - random() * 25, 20 + random() * 4,
              CASE orbit WHEN 'LEO' THEN 7.6 WHEN 'MEO' THEN 3.9 ELSE 3.07 END + random() * 0.1
         FROM satellites WHERE status = 'online' AND deleted_at IS NULL`).catch(() => {}), every);
    console.log(`Telemetry simulator running every ${every} ms`);
  }
}
