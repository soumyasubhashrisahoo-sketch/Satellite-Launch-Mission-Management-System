import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import land110 from 'world-atlas/land-110m.json';
import { Area, AreaChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../../store/useAuthStore';
import { useFetch } from '../../utils/useFetch';
import { openTelemetrySocket } from '../../services/telemetrySocket';
import { num, timeAgo } from '../../utils/format';
import type { LiveReading } from '../../types';

const DEG = Math.PI / 180;
const TILT = 0.38;
const STATUS_COLOR: Record<string, string> = { online: '#34d399', standby: '#fbbf24', offline: '#94a3b8', decommissioned: '#f87171' };
const ORBIT_R: Record<string, number> = { LEO: 1.1, MEO: 1.32, GEO: 1.6, HEO: 1.75 };
const ORBIT_SPEED: Record<string, number> = { LEO: 0.32, MEO: 0.13, GEO: 0.05, HEO: 0.08 };

/** Land mask: draw the world on a hidden equirectangular canvas, then sample it on a lat/lon grid -> dot list. */
function buildLandDots(): [number, number][] {
  const W = 720, H = 360;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const proj = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  geoPath(proj, ctx)(feature(land110 as any, (land110 as any).objects.land) as any);
  ctx.fill();
  const px = ctx.getImageData(0, 0, W, H).data;
  const dots: [number, number][] = [];
  for (let lat = -84; lat <= 84; lat += 1.6)
    for (let lon = -180; lon < 180; lon += 1.6 / Math.max(0.25, Math.cos(lat * DEG))) {
      const x = Math.floor(((lon + 180) / 360) * W), y = Math.floor(((90 - lat) / 180) * H);
      if (px[(y * W + x) * 4 + 3] > 100) dots.push([lat, lon]);
    }
  return dots;
}

/* ---------- small HUD building blocks ---------- */
const Panel = ({ title, sub, children, className = '' }: { title: string; sub?: string; children: ReactNode; className?: string }) => (
  <section className={`relative border border-cyan-400/20 bg-[#070d18]/80 p-3 ${className}`}>
    <span className="absolute -left-px -top-px h-3 w-3 border-l-2 border-t-2 border-cyan-300" />
    <span className="absolute -right-px -top-px h-3 w-3 border-r-2 border-t-2 border-cyan-300" />
    <span className="absolute -bottom-px -left-px h-3 w-3 border-b-2 border-l-2 border-cyan-300" />
    <span className="absolute -bottom-px -right-px h-3 w-3 border-b-2 border-r-2 border-cyan-300" />
    <div className="mb-2 flex items-baseline justify-between">
      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{title}</h3>
      {sub && <span className="text-[10px] text-slate-500">{sub}</span>}
    </div>
    {children}
  </section>
);
const Stat = ({ label, value, tone = 'text-white' }: { label: string; value: ReactNode; tone?: string }) => (
  <div><div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div><div className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</div></div>
);
const sevColor: Record<string, string> = { critical: 'text-red-400', warning: 'text-amber-300', info: 'text-sky-300' };
const tip = { contentStyle: { background: '#0b1424', border: '1px solid rgba(34,211,238,.3)', borderRadius: 4, color: '#e2e8f0', fontSize: 12 } };

export default function CommandCenterPage() {
  const token = useAuth((s) => s.token)!;
  const { data, reload, error } = useFetch<any>('/command-center');
  const [live, setLive] = useState(false);
  const [feed, setFeed] = useState<LiveReading[]>([]);
  const [clock, setClock] = useState(new Date());
  const [hover, setHover] = useState<any>(null);

  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setInterval(reload, 15000); return () => clearInterval(t); }, [reload]);
  useEffect(() => openTelemetrySocket(token, (m) => setFeed((f) => [m, ...f].slice(0, 8)), setLive), [token]);

  /* ---------- globe ---------- */
  const wrap = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<any>(null);
  const hits = useRef<{ x: number; y: number; s: any }[]>([]);
  const rot = useRef(-78);                       // start centred on India
  const drag = useRef<{ x: number; rot: number } | null>(null);
  const dots = useMemo(buildLandDots, []);
  dataRef.current = data;

  const ready = !!data;
  useEffect(() => {
    const canvas = cvs.current, box = wrap.current;
    if (!ready || !canvas || !box) return;
    const ctx = canvas.getContext('2d')!;
    let w = 0, h = 0, raf = 0, last = performance.now();
    const resize = () => {
      const r = box.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      w = r.width; h = r.height; canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize); ro.observe(box); resize();

    const frame = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      if (!drag.current) rot.current += dt * 5;
      const t = now / 1000, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.34;
      const project = (lat: number, lon: number, s = 1) => {
        const p = lat * DEG, l = (lon + rot.current) * DEG;
        const x = Math.cos(p) * Math.sin(l), y = Math.sin(p), z = Math.cos(p) * Math.cos(l);
        const y2 = y * Math.cos(TILT) - z * Math.sin(TILT), z2 = y * Math.sin(TILT) + z * Math.cos(TILT);
        return { x: cx + R * s * x, y: cy - R * s * y2, z: z2 };
      };
      ctx.clearRect(0, 0, w, h);

      // atmosphere + sphere
      const glow = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.3);
      glow.addColorStop(0, 'rgba(34,211,238,0.28)'); glow.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.3, 0, 7); ctx.fill();
      const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      body.addColorStop(0, '#0f2a44'); body.addColorStop(1, '#040912');
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(103,232,249,.55)'; ctx.lineWidth = 1.2; ctx.stroke();

      // graticule
      ctx.lineWidth = 0.6;
      const line = (pts: { x: number; y: number; z: number }[]) => {
        ctx.beginPath(); let pen = false;
        for (const q of pts) { if (q.z > 0) { pen ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); pen = true; } else pen = false; }
        ctx.stroke();
      };
      ctx.strokeStyle = 'rgba(148,196,230,.20)';
      for (let lat = -60; lat <= 60; lat += 30) line(Array.from({ length: 73 }, (_, i) => project(lat, -180 + i * 5)));
      for (let lon = -180; lon < 180; lon += 30) line(Array.from({ length: 37 }, (_, i) => project(-90 + i * 5, lon)));

      // land dots
      for (const [lat, lon] of dots) {
        const q = project(lat, lon);
        if (q.z <= 0) continue;
        ctx.fillStyle = `rgba(190,230,255,${0.25 + q.z * 0.6})`;
        ctx.fillRect(q.x - 0.8, q.y - 0.8, 1.7, 1.7);
      }

      const d = dataRef.current;
      const sats: any[] = d?.satellites ?? [], stations: any[] = d?.ground_stations ?? [];

      // ground stations (real coordinates from the database)
      const stPos = new Map<number, { x: number; y: number; z: number }>();
      for (const g of stations) {
        const q = project(+g.latitude, +g.longitude); stPos.set(g.id, q);
        if (q.z <= 0) continue;
        const pulse = (t * 0.8 + g.id * 0.37) % 1;
        ctx.strokeStyle = `rgba(250,204,21,${0.7 * (1 - pulse)})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(q.x, q.y, 3 + pulse * 12, 0, 7); ctx.stroke();
        ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(q.x, q.y, 2.6, 0, 7); ctx.fill();
        if (q.z > 0.35) { ctx.fillStyle = 'rgba(253,230,138,.85)'; ctx.font = '10px system-ui'; ctx.fillText(g.name.split(' ')[0], q.x + 7, q.y - 6); }
      }

      // satellites on illustrative orbits
      const placed: { x: number; y: number; z: number; s: any; vis: boolean }[] = [];
      sats.forEach((s) => {
        const sc = ORBIT_R[s.orbit] ?? 1.3;
        const inc = (s.orbit === 'GEO' ? 0 : s.orbit === 'MEO' ? 55 : 50 + ((s.id * 37) % 48)) * DEG;
        const raan = ((s.id * 53) % 360) * DEG;
        const th = ((s.id * 97) % 360) * DEG + t * (ORBIT_SPEED[s.orbit] ?? 0.1);
        const at = (a: number) => {
          let X = Math.cos(a), Y = Math.sin(a) * Math.cos(inc), Z = Math.sin(a) * Math.sin(inc);
          const X2 = X * Math.cos(raan) - Y * Math.sin(raan), Y2 = X * Math.sin(raan) + Y * Math.cos(raan);
          const x = X2, y = Z, z = Y2;                                   // world (z north) -> screen frame (y north)
          const y2 = y * Math.cos(TILT) - z * Math.sin(TILT), z2 = y * Math.sin(TILT) + z * Math.cos(TILT);
          return { x: cx + R * sc * x, y: cy - R * sc * y2, z: z2, hidden: z2 < 0 && Math.hypot(sc * x, sc * y2) < 1 };
        };
        ctx.lineWidth = 0.6;
        let prev = at(0);
        for (let i = 1; i <= 64; i++) {                                   // faint orbit ring
          const q = at((i / 64) * Math.PI * 2);
          if (!prev.hidden && !q.hidden) { ctx.strokeStyle = `rgba(125,211,252,${q.z > 0 ? 0.13 : 0.05})`; ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
          prev = q;
        }
        const p = at(th);
        placed.push({ ...p, s, vis: !p.hidden });
      });
      hits.current = [];
      for (const p of placed) {
        if (!p.vis) continue;
        const col = STATUS_COLOR[p.s.status] ?? '#fff', low = +p.s.battery_pct < 20 && p.s.status !== 'decommissioned';
        const st = stPos.get(p.s.ground_station_id);
        if (st && st.z > 0 && p.s.status === 'online') {                 // downlink beam
          ctx.strokeStyle = 'rgba(52,211,153,.22)'; ctx.setLineDash([3, 5]); ctx.lineDashOffset = -t * 12;
          ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
        }
        if (low) { ctx.strokeStyle = 'rgba(248,113,113,.8)'; ctx.beginPath(); ctx.arc(p.x, p.y, 6 + 3 * Math.abs(Math.sin(t * 3)), 0, 7); ctx.stroke(); }
        ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(p.x, p.y, p.z > 0 ? 3 : 2.2, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
        hits.current.push({ x: p.x, y: p.y, s: p.s });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [dots, ready]);

  const onMove = (e: React.PointerEvent) => {
    const r = cvs.current!.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (drag.current) rot.current = drag.current.rot + (e.clientX - drag.current.x) * 0.4;
    const hit = hits.current.find((h) => Math.hypot(h.x - x, h.y - y) < 9);
    setHover(hit ? { ...hit.s, x, y } : null);
  };

  if (error) return <p className="text-red-500">{error}</p>;
  if (!data) return <p className="text-slate-500">Loading command center...</p>;
  const { kpis, fleet, by_orbit, launches, missions, alerts, weekly, battery_trend, contacts, ground_stations } = data;

  return (
    <div className="-m-8 min-h-[calc(100vh-57px)] bg-[#03060d] p-4 text-slate-200"
      style={{ backgroundImage: 'linear-gradient(rgba(34,211,238,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,.04) 1px,transparent 1px)', backgroundSize: '32px 32px' }}>
      {/* top bar */}
      <div className="mb-3 flex items-center justify-between border-b border-cyan-400/30 pb-2">
        <h1 className="text-xl font-semibold tracking-[0.25em] text-white">ORBITALOPS <span className="text-cyan-300">GLOBAL COMMAND CENTER</span></h1>
        <div className="flex items-center gap-4 text-xs">
          <span className={`flex items-center gap-1.5 ${live ? 'text-emerald-400' : 'text-slate-500'}`}><span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'}`} />{live ? 'LIVE TELEMETRY' : 'OFFLINE'}</span>
          <span className="tabular-nums text-slate-400">{clock.toUTCString().slice(5, 25)} UTC</span>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)_300px]">
        {/* LEFT */}
        <div className="space-y-3">
          <Panel title="Fleet status" sub={`${fleet.total} satellites`}>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Online" value={fleet.online} tone="text-emerald-400" />
              <Stat label="Standby" value={fleet.standby} tone="text-amber-300" />
              <Stat label="Offline" value={fleet.offline} tone="text-slate-400" />
              <Stat label="Low battery" value={fleet.low_battery} tone={fleet.low_battery ? 'text-red-400' : 'text-white'} />
            </div>
            <div className="mt-3 text-[11px] text-slate-400">Fleet average battery <span className="font-semibold text-white">{fleet.avg_battery}%</span></div>
          </Panel>
          <Panel title="Mission totals">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Total launches" value={kpis.total_launches} />
              <Stat label="Success rate" value={`${kpis.success_rate}%`} tone="text-emerald-400" />
              <Stat label="Ground stations" value={kpis.ground_stations} />
              <Stat label="Open alerts" value={kpis.open_alerts} tone={kpis.open_alerts ? 'text-red-400' : 'text-white'} />
            </div>
          </Panel>
          <Panel title="Fleet by orbit" sub="count / avg battery">
            {by_orbit.map((o: any) => (
              <div key={o.orbit} className="mb-2 last:mb-0">
                <div className="mb-0.5 flex justify-between text-xs"><span>{o.orbit}</span><span className="text-slate-400">{o.count} sats - {o.avg_battery}%</span></div>
                <div className="h-1.5 bg-white/10"><div className="h-full bg-cyan-400" style={{ width: `${(o.count / fleet.total) * 100}%` }} /></div>
              </div>))}
          </Panel>
          <Panel title="7-day activity" sub="launches / transmissions / alerts">
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={weekly}><XAxis dataKey="label" stroke="#64748b" fontSize={10} tickLine={false} /><YAxis hide /><Tooltip {...tip} />
                <Line dataKey="transmissions" stroke="#a78bfa" dot={false} strokeWidth={1.6} /><Line dataKey="launches" stroke="#38bdf8" dot={false} strokeWidth={1.6} />
                <Line dataKey="alerts" stroke="#fbbf24" dot={false} strokeWidth={1.6} /></LineChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        {/* CENTRE: globe */}
        <div className="relative min-h-[560px]" ref={wrap}>
          <canvas ref={cvs} className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
            onPointerDown={(e) => { drag.current = { x: e.clientX, rot: rot.current }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
            onPointerUp={() => (drag.current = null)} onPointerLeave={() => setHover(null)} onPointerMove={onMove} />
          {hover && (
            <div className="pointer-events-none absolute z-10 border border-cyan-400/40 bg-[#07101e]/95 px-3 py-2 text-xs" style={{ left: hover.x + 14, top: hover.y + 14 }}>
              <div className="font-semibold text-white">{hover.code} - {hover.name}</div>
              <div className="text-slate-400">{hover.orbit} - {num(hover.altitude_km)} km - battery {num(hover.battery_pct)}%</div>
              <div style={{ color: STATUS_COLOR[hover.status] }}>{hover.status} - signal {hover.signal_label}</div>
            </div>)}
          <div className="pointer-events-none absolute bottom-2 left-2 text-[10px] text-slate-500">
            <span className="text-emerald-400">●</span> online <span className="ml-2 text-amber-300">●</span> standby <span className="ml-2 text-slate-400">●</span> offline <span className="ml-2 text-yellow-300">●</span> ground station - drag to rotate
          </div>
        </div>

        {/* RIGHT */}
        <div className="space-y-3">
          <Panel title="Open alerts" sub={`${alerts.length} shown`}>
            {alerts.length === 0 ? <p className="text-xs text-slate-500">All clear.</p> : alerts.map((a: any) => (
              <div key={a.id} className="mb-2 border-l-2 border-current pl-2 last:mb-0" style={{ color: a.severity === 'critical' ? '#f87171' : '#fcd34d' }}>
                <div className={`text-xs font-semibold ${sevColor[a.severity]}`}>{a.title} - {a.satellite}</div>
                <div className="text-[11px] text-slate-400">{timeAgo(a.created_at)}</div>
              </div>))}
          </Panel>
          <Panel title="Active missions">
            {missions.map((m: any) => (
              <div key={m.code} className="mb-2 last:mb-0">
                <div className="mb-0.5 flex justify-between text-xs"><span>{m.code} {m.name}</span><span className="text-slate-400">{m.phase ?? m.status}</span></div>
                <div className="h-1.5 bg-white/10"><div className="h-full bg-sky-400" style={{ width: `${m.progress}%` }} /></div>
              </div>))}
          </Panel>
          <Panel title="Launches" sub="upcoming and recent">
            <table className="w-full text-[11px]"><tbody>{launches.slice(0, 6).map((l: any) => (
              <tr key={l.code} className="border-t border-white/5"><td className="py-1 font-semibold">{l.code}</td><td className="text-slate-400">{l.vehicle}</td>
                <td className={`text-right ${l.status === 'scheduled' ? 'text-sky-300' : l.status === 'failure' ? 'text-red-400' : 'text-emerald-400'}`}>{l.status}</td></tr>))}</tbody></table>
          </Panel>
          <Panel title="Fleet battery trend" sub="daily average %">
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={battery_trend}><XAxis dataKey="label" stroke="#64748b" fontSize={9} tickLine={false} /><YAxis hide domain={['auto', 'auto']} /><Tooltip {...tip} />
                <Area dataKey="avg_battery" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.15} strokeWidth={1.6} /></AreaChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      </div>

      {/* bottom: stations + live ticker */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Panel title="Ground station network" sub={`${contacts.total_7d} contacts - ${contacts.success_pct}% success (7d)`}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3">
            {ground_stations.map((g: any) => (
              <div key={g.id} className="flex justify-between"><span className="truncate">{g.name}</span><span className={+g.contact_success < 90 ? 'text-amber-300' : 'text-emerald-400'}>{g.contact_success ?? '-'}%</span></div>))}
          </div>
        </Panel>
        <Panel title="Live telemetry feed" sub={`${num(data.telemetry_last_hour)} readings in the last hour`}>
          {feed.length === 0 ? <p className="text-[11px] text-slate-500">Waiting for readings...</p> : (
            <div className="space-y-0.5 font-mono text-[11px] text-slate-300">{feed.map((f, i) => (
              <div key={i} className="flex justify-between"><span className="text-cyan-300">{f.code}</span><span>alt {num(f.altitude_km, 1)} km</span><span>bat {num(f.battery_pct, 1)}%</span><span>{num(f.signal_dbm)} dBm</span></div>))}</div>)}
        </Panel>
      </div>
    </div>
  );
}