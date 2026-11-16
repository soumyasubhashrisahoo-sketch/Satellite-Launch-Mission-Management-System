import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Activity, Battery, Radio as Signal, Thermometer, TriangleAlert } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../../store/useAuthStore';
import { useFetch } from '../../utils/useFetch';
import { useChartTheme } from '../../utils/chart';
import { openTelemetrySocket } from '../../services/telemetrySocket';
import { hhmm, num, timeAgo } from '../../utils/format';
import type { LiveReading } from '../../types';
import { Card, Empty, PageHeader } from '../../components/ui';

function Mini({ title, unit, data, k, color }: { title: string; unit: string; data: any[]; k: string; color: string }) {
  const { axis, tip } = useChartTheme();
  return (
    <Card title={title} action={<span className="text-xs text-slate-500">{unit}</span>}>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data}>
          <defs><linearGradient id={`g-${k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={color} stopOpacity={0.35} /><stop offset="95%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid stroke="#94a3b8" strokeOpacity={0.15} /><XAxis dataKey="time" {...axis} minTickGap={40} /><YAxis {...axis} domain={['auto', 'auto']} width={48} />
          <Tooltip {...tip} /><Area dataKey={k} stroke={color} strokeWidth={2} fill={`url(#g-${k})`} />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}

export default function TelemetryPage() {
  const token = useAuth((s) => s.token)!;
  const loc = useLocation();
  const { axis, tip } = useChartTheme();
  const sats = useFetch<any[]>('/satellites');
  const [id, setId] = useState<number | null>((loc.state as any)?.id ?? null);
  const [hours, setHours] = useState(24);
  const [live, setLive] = useState(false);
  const [feed, setFeed] = useState<LiveReading[]>([]);
  const idRef = useRef<number | null>(null);

  useEffect(() => { if (!id && sats.data?.length) setId((sats.data.find((s) => s.status === 'online') || sats.data[0]).id); }, [sats.data]);
  useEffect(() => { idRef.current = id; setFeed([]); }, [id]);
  useEffect(() => openTelemetrySocket(token, (m) => { if (m.satellite_id === idRef.current) setFeed((f) => [m, ...f].slice(0, 30)); }, setLive), [token]);

  const series = useFetch<any[]>(id ? `/telemetry/${id}` : null, { hours });
  const weekly = useFetch<any[]>(id ? `/telemetry/${id}/weekly` : null);
  const alerts = useFetch<any[]>('/alerts', { ack: 'false', satellite_id: id || undefined });
  const sat = sats.data?.find((s) => s.id === id);
  const cur = feed[0] || (sat && { altitude_km: sat.altitude_km, battery_pct: sat.battery_pct, signal_dbm: sat.signal_dbm, temperature_c: sat.temperature_c });
  const data = (series.data || []).map((r) => ({ time: hhmm(r.t), altitude_km: +r.altitude_km, battery_pct: +r.battery_pct, temperature_c: +r.temperature_c, velocity_kms: +r.velocity_kms }));
  const first = series.data?.[0] && +series.data[0].altitude_km;

  return (
    <>
      <PageHeader title={`Telemetry - ${sat?.code ?? '...'}`} sub={sat ? `${sat.name} • ${sat.orbit} • last contact ${timeAgo(sat.last_contact)}` : ''}>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${live ? 'bg-emerald-500/15 text-emerald-500' : 'bg-slate-500/15 text-slate-500'}`}>
          <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-emerald-500' : 'bg-slate-400'}`} />{live ? 'LIVE' : 'OFFLINE'}</span>
        <select className="input !w-auto" value={id ?? ''} onChange={(e) => setId(+e.target.value)}>{sats.data?.map((s) => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}</select>
        <select className="input !w-auto" value={hours} onChange={(e) => setHours(+e.target.value)}>
          <option value={6}>Last 6h</option><option value={24}>Last 24h</option><option value={72}>Last 72h</option><option value={168}>Last 7d</option></select>
      </PageHeader>

      {cur && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[[<Activity size={18} />, 'Altitude', `${num(cur.altitude_km, 1)} km`, first ? `${(+cur.altitude_km - first >= 0 ? '+' : '')}${num(+cur.altitude_km - first, 2)} km vs window start` : ''],
            [<Battery size={18} />, 'Battery', `${num(cur.battery_pct, 1)}%`, +cur.battery_pct < 20 ? 'Below safe threshold' : 'Nominal'],
            [<Signal size={18} />, 'Signal', `${num(cur.signal_dbm, 0)} dBm`, +cur.signal_dbm > -75 ? 'Stable' : 'Weak'],
            [<Thermometer size={18} />, 'Temperature', `${num(cur.temperature_c, 1)}°C`, 'Nominal']].map(([icon, label, value, hint]: any) => (
            <div key={label} className="card"><div className="mb-2 flex items-center gap-2 text-sm text-slate-500"><span className="text-blue-500">{icon}</span>{label}</div>
              <div className="text-3xl font-semibold">{value}</div><div className="mt-1 text-xs text-slate-500">{hint}</div></div>))}
        </div>)}

      {!data.length && !series.loading ? <Card><Empty text="No telemetry in this window." /></Card> : (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <Mini title={`Altitude over ${hours}h`} unit="km" data={data} k="altitude_km" color="#3b82f6" />
          <Mini title={`Temperature over ${hours}h`} unit="°C" data={data} k="temperature_c" color="#f59e0b" />
          <Mini title={`Battery over ${hours}h`} unit="%" data={data} k="battery_pct" color="#ef4444" />
          <Mini title={`Velocity over ${hours}h`} unit="km/s" data={data} k="velocity_kms" color="#14b8a6" />
        </div>)}

      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="7-Day Telemetry Comparison Chart" sub="Altitude vs Battery vs Temperature (daily averages from a materialized view)">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={(weekly.data || []).map((w) => ({ ...w, altitude: +w.altitude, battery: +w.battery, temperature: +w.temperature }))}>
              <CartesianGrid stroke="#94a3b8" strokeOpacity={0.15} /><XAxis dataKey="label" {...axis} />
              <YAxis yAxisId="l" {...axis} domain={['auto', 'auto']} width={56} /><YAxis yAxisId="r" orientation="right" {...axis} />
              <Tooltip {...tip} /><Legend />
              <Line yAxisId="l" dataKey="altitude" name="Altitude (km)" stroke="#3b82f6" strokeWidth={2} />
              <Line yAxisId="r" dataKey="battery" name="Battery (%)" stroke="#f59e0b" strokeWidth={2} />
              <Line yAxisId="r" dataKey="temperature" name="Temperature (°C)" stroke="#eab308" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Live feed" sub="Pushed from PostgreSQL NOTIFY over WebSocket">
          {!feed.length ? <p className="text-sm text-slate-500">Waiting for readings...</p> : (
            <div className="max-h-60 overflow-auto"><table className="w-full text-xs">
              <thead><tr>{['Time', 'Alt', 'Batt', 'dBm'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>{feed.map((f, i) => <tr key={i} className="row"><td className="px-3 py-1.5">{new Date(f.recorded_at).toLocaleTimeString('en-GB')}</td><td className="px-3">{num(f.altitude_km, 1)}</td><td className="px-3">{num(f.battery_pct, 1)}</td><td className="px-3">{num(f.signal_dbm, 0)}</td></tr>)}</tbody>
            </table></div>)}
        </Card>
      </div>

      {!!alerts.data?.length && (
        <div className="grid gap-4 lg:grid-cols-2">{alerts.data.map((a) => (
          <div key={a.id} className={`rounded-xl border p-4 ${a.severity === 'critical' ? 'border-red-500/50 bg-red-500/5' : 'border-amber-500/50 bg-amber-500/5'}`}>
            <div className={`mb-1 flex items-center gap-2 font-semibold ${a.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`}><TriangleAlert size={18} />{a.title} {a.severity.toUpperCase()}</div>
            <p className="text-sm">{a.message}</p><p className="mt-2 text-xs text-slate-500">{timeAgo(a.created_at)} • {a.satellite}</p></div>))}
        </div>)}
    </>
  );
}
