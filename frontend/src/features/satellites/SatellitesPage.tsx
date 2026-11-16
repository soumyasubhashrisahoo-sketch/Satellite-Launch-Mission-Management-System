import { FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { api, errMsg } from '../../services/api';
import { useAuth } from '../../store/useAuthStore';
import { useFetch } from '../../utils/useFetch';
import { fmtDateTime, num, timeAgo } from '../../utils/format';
import { Badge, Card, Empty, Field, Modal, Notice, PageHeader, statusTone, TableWrap } from '../../components/ui';

const sigTone: Record<string, string> = { Strong: 'text-emerald-500', Good: 'text-blue-500', Stable: 'text-amber-500', Weak: 'text-red-500', Unknown: 'text-slate-400' };

export default function SatellitesPage() {
  const role = useAuth((s) => s.user)!.role;
  const canEdit = role !== 'viewer';
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [status, setStatus] = useState('');
  const { data: rows, reload, error } = useFetch<any[]>('/satellites', { q: q || undefined, status: status || undefined });
  const { data: stations } = useFetch<any[]>('/ground-stations');
  const [sel, setSel] = useState<any>(null);
  const [add, setAdd] = useState(false);
  const [form, setForm] = useState<any>({ orbit: 'LEO' });
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  async function open(id: number) { setSel((await api.get(`/satellites/${id}`)).data); }
  async function create(e: FormEvent) {
    e.preventDefault();
    try { await api.post('/satellites', { ...form, altitude_km: +form.altitude_km, ground_station_id: form.ground_station_id ? +form.ground_station_id : null }); setMsg({ kind: 'success', text: 'Satellite registered.' }); reload(); }
    catch (err) { setMsg({ kind: 'error', text: errMsg(err) + ' (transaction rolled back)' }); }
    setAdd(false);
  }
  async function changeStatus(s: string) {
    try { await api.put(`/satellites/${sel.id}`, { status: s }); setMsg({ kind: 'success', text: `${sel.code} set to ${s}.` }); reload(); setSel(null); }
    catch (err) { setMsg({ kind: 'error', text: errMsg(err) }); setSel(null); }
  }
  async function remove() {
    try { await api.delete(`/satellites/${sel.id}`); setMsg({ kind: 'success', text: `${sel.code} archived (soft delete).` }); reload(); }
    catch (err) { setMsg({ kind: 'error', text: errMsg(err) }); }
    setSel(null);
  }

  return (
    <>
      <PageHeader title="Satellites" sub="Fleet inventory and live health">
        <input className="input !w-56" placeholder="Search code or name" value={q} onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {})} />
        <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option><option>online</option><option>standby</option><option>offline</option><option>decommissioned</option>
        </select>
        {canEdit && <button className="btn-primary" onClick={() => setAdd(true)}><Plus size={16} />Register</button>}
      </PageHeader>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      <Card>
        {!rows?.length ? <Empty /> : (
          <TableWrap>
            <thead><tr>{['Code', 'Name', 'Orbit', 'Status', 'Battery', 'Altitude', 'Signal', 'Ground station', 'Last contact'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>{rows.map((s) => (
              <tr key={s.id} className="row cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => open(s.id)}>
                <td className="td font-semibold">{s.code}</td><td className="td">{s.name}</td><td className="td">{s.orbit}</td>
                <td className="td"><Badge tone={statusTone(s.status)}>{s.status}</Badge></td>
                <td className="td"><div className="flex items-center gap-2"><div className="h-1.5 w-16 overflow-hidden rounded bg-slate-200 dark:bg-white/10"><div className={`h-full ${+s.battery_pct < 20 ? 'bg-red-500' : +s.battery_pct < 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${s.battery_pct}%` }} /></div>{num(s.battery_pct)}%</div></td>
                <td className="td">{num(s.altitude_km)} km</td><td className={`td font-medium ${sigTone[s.signal_label]}`}>{s.signal_label}</td>
                <td className="td">{s.ground_station || '-'}</td><td className="td text-slate-500">{timeAgo(s.last_contact)}</td>
              </tr>))}
            </tbody>
          </TableWrap>)}
      </Card>

      {sel && (
        <Modal title={`${sel.code} - ${sel.name}`} onClose={() => setSel(null)}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {[['Status', sel.status], ['Orbit', `${sel.orbit} ${num(sel.altitude_km)} km`], ['Battery', `${num(sel.battery_pct)}%`], ['Signal', `${sel.signal_dbm ?? '-'} dBm (${sel.signal_label})`],
              ['Temperature', `${sel.temperature_c ?? '-'} °C`], ['Launch', sel.launch_code || '-'], ['Ground station', sel.ground_station || '-'], ['Last contact', fmtDateTime(sel.last_contact)],
              ['Payload', sel.specs?.payload || '-'], ['Power', sel.specs?.power_w ? `${sel.specs.power_w} W` : '-'], ['Orbit decay (24h)', sel.decay_km_per_day == null ? '-' : `${sel.decay_km_per_day} km/day`],
              ['Missions', sel.missions?.map((m: any) => m.name).join(', ') || '-']].map(([k, v]) => (
              <div key={k}><span className="text-slate-500">{k}: </span><span className="font-medium">{v}</span></div>))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
            <Link className="btn-ghost" to="/telemetry" state={{ id: sel.id }}>Open telemetry</Link>
            {canEdit && <select className="input !w-auto" value="" onChange={(e) => e.target.value && changeStatus(e.target.value)}>
              <option value="">Set status...</option><option>online</option><option>standby</option><option>offline</option><option>decommissioned</option></select>}
            {role === 'admin' && <button className="btn-danger ml-auto" onClick={remove}><Trash2 size={15} />Archive</button>}
          </div>
        </Modal>)}

      {add && (
        <Modal title="Register satellite" onClose={() => setAdd(false)}>
          <form onSubmit={create} className="grid grid-cols-2 gap-3">
            <Field label="Code"><input className="input" required placeholder="SAT-030" onChange={set('code')} /></Field>
            <Field label="Name"><input className="input" required onChange={set('name')} /></Field>
            <Field label="Orbit"><select className="input" value={form.orbit} onChange={set('orbit')}><option>LEO</option><option>MEO</option><option>GEO</option><option>HEO</option></select></Field>
            <Field label="Altitude (km)"><input className="input" type="number" step="0.01" required onChange={set('altitude_km')} /></Field>
            <Field label="Payload"><input className="input" onChange={set('payload')} /></Field>
            <Field label="Ground station"><select className="input" onChange={set('ground_station_id')}><option value="">None</option>{stations?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
            <p className="col-span-2 text-xs text-slate-500">Negative altitude, duplicate codes and unknown orbit types are rejected by the database.</p>
            <div className="col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setAdd(false)}>Cancel</button><button className="btn-primary">Register</button></div>
          </form>
        </Modal>)}
    </>
  );
}
