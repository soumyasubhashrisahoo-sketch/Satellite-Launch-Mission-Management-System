import { useEffect, useState } from 'react';
import { Check, Circle, Plus } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, errMsg } from '../../services/api';
import { useAuth } from '../../store/useAuthStore';
import { useFetch } from '../../utils/useFetch';
import { useChartTheme } from '../../utils/chart';
import { fmtDate, num, timeAgo } from '../../utils/format';
import { Badge, Card, Empty, Field, Modal, Notice, PageHeader, statusTone } from '../../components/ui';

const tabs = ['active', 'completed', 'upcoming'] as const;

export default function MissionsPage() {
  const canEdit = useAuth((s) => s.user)!.role !== 'viewer';
  const { axis, tip } = useChartTheme();
  const [tab, setTab] = useState<(typeof tabs)[number]>('active');
  const list = useFetch<any[]>('/missions', { status: tab });
  const [selId, setSelId] = useState<number | null>(null);
  const detail = useFetch<any>(selId ? `/missions/${selId}` : null);
  const sats = useFetch<any[]>('/satellites');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ start_date: new Date().toISOString().slice(0, 10) });
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => { if (list.data) setSelId(list.data[0]?.id ?? null); }, [list.data?.length, tab]);
  const refresh = () => { list.reload(); detail.reload(); };

  async function advance() {
    try { await api.post(`/missions/${selId}/advance`); setMsg({ kind: 'success', text: 'Phase advanced.' }); refresh(); }
    catch (e) { setMsg({ kind: 'error', text: errMsg(e) }); }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { await api.post('/missions', { ...form, satellite_ids: form.sat ? [+form.sat] : [] }); setMsg({ kind: 'success', text: 'Mission created with 5 default phases (single transaction).' }); setTab('upcoming'); list.reload(); }
    catch (err) { setMsg({ kind: 'error', text: errMsg(err) }); }
    setOpen(false);
  }
  const d = detail.data;

  return (
    <>
      <PageHeader title="Missions">
        <div className="flex gap-1 rounded-lg bg-slate-200/60 p-1 dark:bg-white/5">
          {tabs.map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${tab === t ? 'bg-white shadow dark:bg-[#111a2e]' : 'text-slate-500'}`}>{t}</button>)}
        </div>
        {canEdit && <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} />New Mission</button>}
      </PageHeader>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          <p className="text-sm text-slate-500">{tab[0].toUpperCase() + tab.slice(1)} Missions • {list.data?.length ?? 0}</p>
          {!list.data?.length && <Card><Empty /></Card>}
          {list.data?.map((m) => (
            <button key={m.id} onClick={() => setSelId(m.id)} className={`card block w-full text-left transition ${selId === m.id ? '!border-blue-500 ring-1 ring-blue-500/40' : ''}`}>
              <div className="flex items-center justify-between"><div className="text-lg font-semibold">{m.code} {m.name}</div><Badge tone={statusTone(m.status)}>{m.status}</Badge></div>
              <p className="mt-1 text-sm text-slate-500">{m.current_phase ? `${m.current_phase} • ` : ''}{m.satellites?.map((s: any) => `${s.code} ${s.status}`).join(', ') || 'No satellites'}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded bg-slate-200 dark:bg-white/10"><div className="h-full bg-blue-500" style={{ width: `${m.progress}%` }} /></div>
              <p className="mt-1 text-xs text-slate-500">{num(m.progress, 1)}% complete</p>
            </button>))}
        </div>

        <Card className="lg:col-span-3" title={d ? `Selected Mission Details - ${d.mission.code} ${d.mission.name}` : 'Selected Mission Details'}
          action={d && <Badge tone={statusTone(d.mission.status)}>{d.mission.status}</Badge>}>
          {!d ? <Empty text="Select a mission." /> : (<>
            <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
              {[['Launch Vehicle', d.details?.vehicle], ['Orbit', d.details && `${d.details.orbit} ${num(d.details.altitude_km)}km`],
                ['Payload', d.details?.specs?.payload], ['Power', d.details?.specs?.power_w && `${d.details.specs.power_w}W • ${num(d.details.battery_pct)}%`],
                ['Started', fmtDate(d.mission.start_date)], ['Objective', d.mission.objective]].map(([k, v]) => (
                <div key={k as string}><div className="text-xs text-slate-500">{k}</div><div className="font-semibold">{v || '-'}</div></div>))}
            </div>
            <div className="mb-2 flex items-center justify-between"><div className="text-sm text-slate-500">Mission Phase Timeline</div>
              {canEdit && d.mission.status !== 'completed' && d.mission.status !== 'aborted' && <button className="btn-ghost !py-1 text-xs" onClick={advance}>Advance phase</button>}</div>
            <ol className="flex flex-wrap gap-x-6 gap-y-3">{d.phases.map((p: any) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                {p.status === 'completed' ? <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-white"><Check size={14} /></span>
                  : <Circle size={24} className={p.status === 'in_progress' ? 'text-blue-500' : 'text-slate-400'} />}
                <div><div className="font-medium">{p.name}</div><div className={`text-xs ${p.status === 'in_progress' ? 'text-blue-500' : 'text-slate-500'}`}>{p.status === 'completed' ? `Completed ${timeAgo(p.completed_at)}` : p.status === 'in_progress' ? 'In progress' : 'Pending'}</div></div>
              </li>))}
            </ol>
          </>)}
        </Card>
      </div>

      <Card className="mt-4" title="7-Day Mission Comparison Chart" sub="Mission Progress vs Contact Success (%)">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={(d?.chart || []).map((c: any) => ({ ...c, progress: c.progress == null ? null : +c.progress, contact_success: c.contact_success == null ? null : +c.contact_success }))}>
            <CartesianGrid stroke="#94a3b8" strokeOpacity={0.15} /><XAxis dataKey="label" {...axis} /><YAxis {...axis} domain={[0, 100]} /><Tooltip {...tip} /><Legend />
            <Line dataKey="progress" name="Mission Progress" stroke="#3b82f6" strokeWidth={2} connectNulls />
            <Line dataKey="contact_success" name="Contact Success" stroke="#94a3b8" strokeWidth={2} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {open && (
        <Modal title="New mission" onClose={() => setOpen(false)}>
          <form onSubmit={create} className="grid grid-cols-2 gap-3">
            <Field label="Name"><input className="input" required onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Start date"><input className="input" type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
            <div className="col-span-2"><Field label="Objective"><input className="input" onChange={(e) => setForm({ ...form, objective: e.target.value })} /></Field></div>
            <div className="col-span-2"><Field label="Primary satellite"><select className="input" onChange={(e) => setForm({ ...form, sat: e.target.value })}><option value="">None</option>{sats.data?.map((s) => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}</select></Field></div>
            <div className="col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary">Create</button></div>
          </form>
        </Modal>)}
    </>
  );
}
