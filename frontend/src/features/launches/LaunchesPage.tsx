import { FormEvent, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, errMsg } from '../../services/api';
import { useAuth } from '../../store/useAuthStore';
import { useFetch } from '../../utils/useFetch';
import { fmtDateTime } from '../../utils/format';
import { Badge, Card, Empty, Field, Modal, Notice, PageHeader, statusTone, TableWrap } from '../../components/ui';

export default function LaunchesPage() {
  const canEdit = useAuth((s) => s.user)!.role !== 'viewer';
  const [status, setStatus] = useState('');
  const { data, reload, error } = useFetch<any>('/launches', { status: status || undefined });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ withSat: false, orbit: 'LEO', altitude_km: 500 });
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/launches', { code: form.code, vehicle_id: +form.vehicle_id, site: form.site, launch_date: new Date(form.launch_date).toISOString(),
        satellite: form.withSat ? { code: form.sat_code, name: form.sat_name, orbit: form.orbit, altitude_km: +form.altitude_km } : undefined });
      setMsg({ kind: 'success', text: 'Launch scheduled (launch + satellite saved in one transaction).' }); reload();
    } catch (err) { setMsg({ kind: 'error', text: errMsg(err) + '  - transaction rolled back, nothing was saved.' }); }
    setOpen(false);
  }
  async function complete(id: number, success: boolean) {
    try { await api.post(`/launches/${id}/complete`, { success }); setMsg({ kind: 'success', text: `Launch marked ${success ? 'successful' : 'failed'}; payload satellites updated by stored procedure.` }); reload(); }
    catch (err) { setMsg({ kind: 'error', text: errMsg(err) }); }
  }

  return (
    <>
      <PageHeader title="Launches" sub="Launch history and schedule">
        <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option><option>scheduled</option><option>success</option><option>failure</option>
        </select>
        {canEdit && <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} />Schedule launch</button>}
      </PageHeader>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      <Card>
        {!data?.launches.length ? <Empty /> : (
          <TableWrap>
            <thead><tr>{['Code', 'Vehicle', 'Site', 'Date', 'Payloads', 'Status', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr></thead>
            <tbody>{data.launches.map((l: any) => (
              <tr key={l.id} className="row">
                <td className="td font-semibold">{l.code}</td><td className="td">{l.vehicle}</td><td className="td">{l.site}</td>
                <td className="td">{fmtDateTime(l.launch_date)}</td><td className="td">{l.satellites}</td>
                <td className="td"><Badge tone={statusTone(l.status)}>{l.status}</Badge></td>
                <td className="td text-right">{canEdit && l.status === 'scheduled' && (<>
                  <button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={() => complete(l.id, true)}>Mark success</button>{' '}
                  <button className="btn-danger !px-2.5 !py-1 text-xs" onClick={() => complete(l.id, false)}>Mark failure</button></>)}</td>
              </tr>))}
            </tbody>
          </TableWrap>)}
      </Card>
      {open && (
        <Modal title="Schedule launch" onClose={() => setOpen(false)}>
          <form onSubmit={create} className="grid grid-cols-2 gap-3">
            <Field label="Launch code"><input className="input" required placeholder="L-130" onChange={set('code')} /></Field>
            <Field label="Vehicle"><select className="input" required onChange={set('vehicle_id')}><option value="">Select</option>{data?.vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
            <Field label="Site"><input className="input" required onChange={set('site')} /></Field>
            <Field label="Date & time"><input className="input" type="datetime-local" required onChange={set('launch_date')} /></Field>
            <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.withSat} onChange={(e) => setForm({ ...form, withSat: e.target.checked })} />Also register the payload satellite</label>
            {form.withSat && (<>
              <Field label="Satellite code"><input className="input" required onChange={set('sat_code')} /></Field>
              <Field label="Satellite name"><input className="input" required onChange={set('sat_name')} /></Field>
              <Field label="Orbit"><select className="input" value={form.orbit} onChange={set('orbit')}><option>LEO</option><option>MEO</option><option>GEO</option></select></Field>
              <Field label="Altitude (km)"><input className="input" type="number" value={form.altitude_km} onChange={set('altitude_km')} /></Field>
            </>)}
            <div className="col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary">Schedule</button></div>
          </form>
        </Modal>)}
    </>
  );
}
