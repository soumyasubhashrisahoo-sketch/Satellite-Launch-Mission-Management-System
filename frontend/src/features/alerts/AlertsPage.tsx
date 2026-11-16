import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { api, errMsg } from '../../services/api';
import { useAuth } from '../../store/useAuthStore';
import { useFetch } from '../../utils/useFetch';
import { timeAgo } from '../../utils/format';
import { Card, Empty, Notice, PageHeader } from '../../components/ui';

const style: Record<string, string> = {
  critical: 'border-red-500/50 bg-red-500/5', warning: 'border-amber-500/50 bg-amber-500/5', info: 'border-blue-500/40 bg-blue-500/5' };
const text: Record<string, string> = { critical: 'text-red-500', warning: 'text-amber-500', info: 'text-blue-500' };

export default function AlertsPage() {
  const canAck = useAuth((s) => s.user)!.role !== 'viewer';
  const [show, setShow] = useState('false');
  const { data, reload, error } = useFetch<any[]>('/alerts', { ack: show === 'all' ? undefined : show });
  const [msg, setMsg] = useState('');
  async function ack(id: number) { try { await api.patch(`/alerts/${id}/ack`); reload(); } catch (e) { setMsg(errMsg(e)); } }

  return (
    <>
      <PageHeader title="Alerts" sub="Raised automatically by database triggers on incoming telemetry">
        <select className="input !w-auto" value={show} onChange={(e) => setShow(e.target.value)}>
          <option value="false">Open</option><option value="true">Acknowledged</option><option value="all">All</option>
        </select>
      </PageHeader>
      {(msg || error) && <Notice kind="error">{msg || error}</Notice>}
      {!data?.length ? <Card><Empty text="No alerts." /></Card> : (
        <div className="grid gap-3 lg:grid-cols-2">{data.map((a) => (
          <div key={a.id} className={`rounded-xl border p-4 ${a.acknowledged ? 'border-slate-200 opacity-60 dark:border-white/10' : style[a.severity]}`}>
            <div className="mb-1 flex items-center justify-between">
              <div className={`flex items-center gap-2 font-semibold ${text[a.severity]}`}><TriangleAlert size={18} />{a.title} <span className="text-xs uppercase">{a.severity}</span></div>
              {canAck && !a.acknowledged && <button className="btn-ghost !py-1 text-xs" onClick={() => ack(a.id)}>Acknowledge</button>}
            </div>
            <p className="text-sm">{a.message}</p>
            <p className="mt-2 text-xs text-slate-500">{timeAgo(a.created_at)} • {a.satellite}{a.acknowledged ? ' • acknowledged' : ''}</p>
          </div>))}
        </div>)}
    </>
  );
}
