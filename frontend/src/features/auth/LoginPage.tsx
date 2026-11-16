import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Moon, Satellite, Sun } from 'lucide-react';
import { api, errMsg } from '../../services/api';
import { useAuth } from '../../store/useAuthStore';
import { useTheme } from '../../store/useThemeStore';
import { Field, Notice } from '../../components/ui';

const demo = [
  { label: 'Admin', email: 'admin@orbitalops.com', password: 'admin123' },
  { label: 'Operator', email: 'operator@orbitalops.com', password: 'operator123' },
  { label: 'Viewer', email: 'viewer@orbitalops.com', password: 'viewer123' },
];

export default function LoginPage() {
  const { token, login } = useAuth();
  const { dark, toggle } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  if (token) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    try { const { data } = await api.post('/auth/login', { email, password }); login(data.token, data.user); }
    catch (err) { setError(errMsg(err)); }
  }
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <button className="btn-ghost absolute right-4 top-4" onClick={toggle}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
      <div className="card w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2 text-xl font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 text-white"><Satellite size={20} /></span> OrbitalOps
        </div>
        <h1 className="mb-1 text-2xl font-semibold">Mission control</h1>
        <p className="mb-5 text-sm text-slate-500">Sign in to monitor satellites, launches and telemetry</p>
        {error && <Notice kind="error">{error}</Notice>}
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Password"><input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <button className="btn-primary w-full">Sign in</button>
        </form>
        <div className="mt-6 border-t border-slate-200 pt-4 dark:border-white/10">
          <p className="mb-2 text-xs text-slate-500">Demo accounts (click to fill)</p>
          <div className="flex gap-2">{demo.map((d) => (
            <button key={d.label} className="btn-ghost flex-1 !px-2 !py-1.5 text-xs" onClick={() => { setEmail(d.email); setPassword(d.password); }}>{d.label}</button>))}
          </div>
        </div>
      </div>
    </div>
  );
}
