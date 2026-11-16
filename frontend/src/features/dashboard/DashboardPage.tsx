import { Link } from 'react-router-dom';
import { Rocket, Satellite, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFetch } from '../../utils/useFetch';
import { useChartTheme } from '../../utils/chart';
import { num, timeAgo } from '../../utils/format';
import { Badge, Card, KpiCard, PageHeader, statusTone, TableWrap } from '../../components/ui';

const sigTone: Record<string, string> = { Strong: 'text-emerald-500', Good: 'text-blue-500', Stable: 'text-amber-500', Weak: 'text-red-500', Unknown: 'text-slate-400' };
const dot: Record<string, string> = { critical: 'bg-red-500', warning: 'bg-amber-500', good: 'bg-emerald-500', info: 'bg-blue-500' };

export default function DashboardPage() {
  const { data, loading, error } = useFetch<any>('/dashboard');
  const { axis, tip } = useChartTheme();
  if (loading) return <p className="text-slate-500">Loading...</p>;
  if (error || !data) return <p className="text-red-500">{error}</p>;
  const { kpis, satellites, weekly, insights, alerts } = data;

  return (
    <>
      <PageHeader title="Main Dashboard" sub={`Overview of satellite operations and metrics - updated ${new Date().toUTCString().slice(17, 22)} UTC`} />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <KpiCard icon={<Satellite size={18} />} label="Active Satellites" value={kpis.active_satellites} tone="green" hint={`+${kpis.new_satellites_week} this week`} />
        <KpiCard icon={<Rocket size={18} />} label="Total Launches" value={kpis.total_launches} hint={`+${kpis.launches_30d} in the last 30 days`} />
        <KpiCard icon={<ShieldCheck size={18} />} label="Launch Success" value={`${kpis.success_rate}%`} tone="green" hint={`${kpis.open_alerts} open alerts`} />
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Satellite Details" sub="Active and monitoring"
          action={<Link to="/satellites" className="btn-ghost !py-1 text-xs">View all</Link>}>
          <TableWrap>
            <thead><tr>{['Name', 'Orbit', 'Status', 'Battery', 'Altitude', 'Signal'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>{satellites.map((s: any) => (
              <tr key={s.id} className="row">
                <td className="td font-semibold">{s.code}</td><td className="td">{s.orbit}</td>
                <td className="td"><Badge tone={statusTone(s.status)}>{s.status}</Badge></td>
                <td className={`td ${+s.battery_pct < 20 ? 'font-semibold text-red-500' : ''}`}>{num(s.battery_pct)}%</td>
                <td className="td">{num(s.altitude_km)} km</td>
                <td className={`td font-medium ${sigTone[s.signal_label]}`}>{s.signal_label}</td>
              </tr>))}
            </tbody>
          </TableWrap>
        </Card>
        <Card title="AI Insights" action={<Sparkles size={18} className="text-blue-500" />}>
          <ul className="space-y-4">{insights.map((i: any, k: number) => (
            <li key={k} className="flex gap-3 text-sm">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[i.level]}`} />
              <div><div className="font-medium">{i.title}</div><div className="text-xs text-slate-500">{i.detail}</div></div>
            </li>))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="7-Day Comparison Chart" sub="Launches vs Transmissions vs Telemetry Alerts">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={weekly}>
              <CartesianGrid stroke="#94a3b8" strokeOpacity={0.15} />
              <XAxis dataKey="label" {...axis} /><YAxis {...axis} /><Tooltip {...tip} /><Legend />
              <Line dataKey="launches" name="Launches" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line dataKey="transmissions" name="Transmissions" stroke="#a855f7" strokeWidth={2} dot={false} />
              <Line dataKey="alerts" name="Telemetry Alerts" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Open alerts" action={<Link to="/alerts" className="text-xs text-blue-500 hover:underline">All alerts</Link>}>
          {alerts.length === 0 ? <p className="text-sm text-slate-500">All clear.</p> : (
            <ul className="space-y-3">{alerts.map((a: any) => (
              <li key={a.id} className="flex items-start gap-3 text-sm">
                <TriangleAlert size={16} className={a.severity === 'critical' ? 'text-red-500' : 'text-amber-500'} />
                <div><div className="font-medium">{a.title} - {a.code}</div><div className="text-xs text-slate-500">{timeAgo(a.created_at)}</div></div>
              </li>))}
            </ul>)}
        </Card>
      </div>
    </>
  );
}
