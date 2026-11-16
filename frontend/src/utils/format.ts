export const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
export const fmtDateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
export const hhmm = (s: string) => new Date(s).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const num = (v: any, d = 0) => Number(v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
export function timeAgo(s?: string | null) {
  if (!s) return 'never';
  const m = Math.max(0, Math.round((Date.now() - new Date(s).getTime()) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}
