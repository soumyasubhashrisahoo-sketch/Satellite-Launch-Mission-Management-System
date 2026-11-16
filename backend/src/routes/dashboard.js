import { Router } from 'express';
import { withUser } from '../db.js';
import { wrap } from '../middleware/auth.js';

const r = Router();
r.get('/', wrap(async (req, res) => {
  res.json(await withUser(req.user, async (c) => {
    const q = async (sql, p) => (await c.query(sql, p)).rows;
    const kpis = (await q('SELECT * FROM v_dashboard_kpis'))[0];
    const satellites = await q(`SELECT * FROM v_satellite_details ORDER BY (status = 'online') DESC, code LIMIT 6`);
    const weekly = await q(
      `WITH days AS (SELECT d::date AS day FROM generate_series((current_date - 6)::timestamp, current_date::timestamp, interval '1 day') d)
       SELECT to_char(day, 'Dy') AS label, day,
              (SELECT count(*) FROM launches WHERE launch_date::date = day AND launch_date <= now())::int AS launches,
              (SELECT count(*) FROM contact_logs WHERE started_at::date = day)::int AS transmissions,
              (SELECT count(*) FROM alerts WHERE created_at::date = day)::int AS alerts
         FROM days ORDER BY day`);
    const alerts = await q(`SELECT a.*, s.code FROM alerts a JOIN satellites s ON s.id = a.satellite_id WHERE NOT a.acknowledged ORDER BY a.created_at DESC LIMIT 4`);

    // "AI insights": rule-based analytics computed in SQL
    const insights = [];
    for (const s of await q(`SELECT code, battery_pct FROM satellites WHERE deleted_at IS NULL AND status <> 'decommissioned' AND battery_pct < 30 ORDER BY battery_pct LIMIT 2`))
      insights.push({ level: 'warning', title: `Battery low on ${s.code}: ${s.battery_pct}%`, detail: 'Power conservation mode recommended' });
    for (const s of await q(`SELECT code, fn_orbit_decay_rate(id) AS rate FROM satellites WHERE orbit = 'LEO' AND status = 'online' AND deleted_at IS NULL ORDER BY 2 LIMIT 1`))
      if (s.rate !== null && +s.rate < -0.5) insights.push({ level: 'critical', title: `Orbit decay on ${s.code}: ${s.rate} km/day`, detail: 'Linear regression over last 24h of telemetry' });
    const trend = (await q(`SELECT round((SELECT avg(avg_battery) FROM mv_daily_telemetry_stats WHERE day = current_date), 1) AS today,
                                   round((SELECT avg(avg_battery) FROM mv_daily_telemetry_stats WHERE day = current_date - 6), 1) AS week_ago`))[0];
    if (trend.today && trend.week_ago)
      insights.push({ level: +trend.today >= +trend.week_ago ? 'good' : 'info', title: `Fleet battery avg ${trend.today}% (${trend.week_ago}% a week ago)`, detail: 'From mv_daily_telemetry_stats materialized view' });
    for (const l of await q(`SELECT l.code, v.name AS vehicle, l.launch_date FROM launches l JOIN launch_vehicles v ON v.id = l.vehicle_id WHERE l.status = 'scheduled' ORDER BY l.launch_date LIMIT 1`))
      insights.push({ level: 'info', title: `Next launch ${l.code} on ${l.vehicle}`, detail: new Date(l.launch_date).toUTCString() });
    return { kpis, satellites, weekly, alerts, insights };
  }));
}));
export default r;
