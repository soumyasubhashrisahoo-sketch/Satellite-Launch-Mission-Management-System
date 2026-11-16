import { FormEvent, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, errMsg } from '../../services/api';
import { useAuth } from '../../store/useAuthStore';
import { useFetch } from '../../utils/useFetch';
import { Badge, Card, Empty, Field, Modal, Notice, PageHeader, TableWrap } from '../../components/ui';

export default function GroundStationsPage() {
  const isAdmin = useAuth((s) => s.user)!.role === 'admin';
  const { data: rows, reload, error } = useFetch<any[]>('/ground-stations');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ region: 'global' });
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  async function create(e: FormEvent) {
    e.preventDefault();
    try { await api.post('/ground-stations', { ...form, latitude: +form.latitude, longitude: +form.longitude }); setMsg({ kind: 'success', text: 'Ground station added.' }); reload(); }
    catch (err) { setMsg({ kind: 'error', text: errMsg(err) }); }
    setOpen(false);
  }
  return (
    <>
      <PageHeader title="Ground Stations" sub="Antenna network, assigned satellites and 7-day contact success">
        {isAdmin && <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} />Add station</button>}
      </PageHeader>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      <Card>
        {!rows?.length ? <Empty /> : (
          <TableWrap>
            <thead><tr>{['Station', 'Country', 'Region', 'Coordinates', 'Satellites', 'Contacts (7d)', 'Success'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>{rows.map((g) => (
              <tr key={g.id} className="row">
                <td className="td font-semibold">{g.name}</td><td className="td">{g.country}</td>
                <td className="td"><Badge tone={g.region === 'global' ? 'blue' : 'gray'}>{g.region}</Badge></td>
                <td className="td text-slate-500">{(+g.latitude).toFixed(2)}, {(+g.longitude).toFixed(2)}</td>
                <td className="td">{g.satellites}</td><td className="td">{g.contacts_7d}</td>
                <td className="td"><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded bg-slate-200 dark:bg-white/10"><div className={`h-full ${+g.contact_success < 90 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${g.contact_success || 0}%` }} /></div>{g.contact_success ?? '-'}%</div></td>
              </tr>))}
            </tbody>
          </TableWrap>)}
      </Card>
      {open && (
        <Modal title="Add ground station" onClose={() => setOpen(false)}>
          <form onSubmit={create} className="grid grid-cols-2 gap-3">
            <Field label="Name"><input className="input" required onChange={set('name')} /></Field>
            <Field label="Country"><input className="input" required onChange={set('country')} /></Field>
            <Field label="Region"><select className="input" value={form.region} onChange={set('region')}><option>global</option><option>regional</option></select></Field>
            <span />
            <Field label="Latitude"><input className="input" type="number" step="any" required onChange={set('latitude')} /></Field>
            <Field label="Longitude"><input className="input" type="number" step="any" required onChange={set('longitude')} /></Field>
            <div className="col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary">Add</button></div>
          </form>
        </Modal>)}
    </>
  );
}
