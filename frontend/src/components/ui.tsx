import { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Card({ title, sub, action, children, className = '' }:
  { title?: string; sub?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {sub && <p className="text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function KpiCard({ icon, label, value, hint, tone = 'blue' }:
  { icon: ReactNode; label: string; value: ReactNode; hint?: string; tone?: 'blue' | 'green' | 'amber' | 'red' }) {
  const tones = { blue: 'text-blue-500', green: 'text-emerald-500', amber: 'text-amber-500', red: 'text-red-500' };
  return (
    <div className="card">
      <div className={`mb-3 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400`}>
        <span className={tones[tone]}>{icon}</span>{label}
      </div>
      <div className="text-3xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  green: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  red: 'bg-red-500/15 text-red-600 dark:text-red-400',
  blue: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  gray: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
};
export const Badge = ({ tone = 'gray', children }: { tone?: string; children: ReactNode }) => (
  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badgeTones[tone]}`}>{children}</span>
);
export const statusTone = (s: string) =>
  ({ online: 'green', success: 'green', active: 'green', completed: 'blue', standby: 'amber', scheduled: 'blue', upcoming: 'blue',
     warning: 'amber', info: 'blue', critical: 'red', failure: 'red', offline: 'gray', decommissioned: 'red', scrubbed: 'gray', aborted: 'red' } as Record<string, string>)[s] || 'gray';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block text-sm">
    <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
    {children}
  </label>
);

export const Notice = ({ kind, children }: { kind: 'error' | 'success'; children: ReactNode }) => (
  <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${kind === 'error'
    ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>{children}</div>
);

export const PageHeader = ({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {sub && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </div>
);

export const TableWrap = ({ children }: { children: ReactNode }) => <div className="overflow-x-auto"><table className="w-full">{children}</table></div>;
export const Empty = ({ text = 'No records found.' }: { text?: string }) => <p className="py-8 text-center text-sm text-slate-500">{text}</p>;
