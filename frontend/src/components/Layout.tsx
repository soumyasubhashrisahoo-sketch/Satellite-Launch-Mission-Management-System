import { FormEvent, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Globe, LayoutDashboard, LogOut, Moon, Radio, Rocket, Satellite, Search, Sun, Target, Activity } from 'lucide-react';import { useAuth } from '../store/useAuthStore';
import { useTheme } from '../store/useThemeStore';
import { api } from '../services/api';
import { Badge } from './ui';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/command-center', label: 'Command Center', icon: Globe},
  { to: '/satellites', label: 'Satellites', icon: Satellite },
  { to: '/launches', label: 'Launches', icon: Rocket },
  { to: '/missions', label: 'Missions', icon: Target },
  { to: '/ground-stations', label: 'Ground Stations', icon: Radio },
  { to: '/telemetry', label: 'Telemetry', icon: Activity },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(0);
  useEffect(() => { api.get('/alerts', { params: { ack: 'false' } }).then((r) => setOpen(r.data.length)).catch(() => {}); }, [loc.pathname]);

  const search = (e: FormEvent) => { e.preventDefault(); navigate(`/satellites?q=${encodeURIComponent(q)}`); };

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0d1526]">
        <div className="mb-8 flex items-center gap-2 px-2 text-lg font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-white"><Satellite size={18} /></span> OrbitalOps
        </div>
        <div className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">General</div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${isActive
                ? 'bg-blue-600/10 text-blue-600 dark:bg-white/10 dark:text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5'}`}>
              <Icon size={18} />{label}
              {to === '/alerts' && open > 0 && <span className="ml-auto rounded-full bg-red-500 px-1.5 text-xs text-white">{open}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 pt-4 dark:border-white/10">
          <div className="mb-3 px-2">
            <div className="truncate text-sm font-medium">{user!.name}</div>
            <div className="mb-1 truncate text-xs text-slate-500">{user!.email}</div>
            <Badge tone={user!.role === 'admin' ? 'blue' : user!.role === 'operator' ? 'green' : 'gray'}>{user!.role}</Badge>
          </div>
          <button className="btn-ghost w-full" onClick={logout}><LogOut size={16} />Log out</button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-slate-200 px-8 py-3 dark:border-white/10">
          <form onSubmit={search} className="relative max-w-xl flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input !rounded-full !pl-9" placeholder="Search satellites..." value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <button className="btn-ghost !rounded-full !px-3" onClick={toggle} aria-label="Toggle theme">{dark ? <Sun size={16} /> : <Moon size={16} />}{dark ? 'Light' : 'Dark'}</button>
          <NavLink to="/alerts" className="relative p-2" aria-label="Alerts"><Bell size={20} />{open > 0 && <span className="absolute right-0 top-0 rounded-full bg-red-500 px-1 text-[10px] text-white">{open}</span>}</NavLink>
        </header>
        <main className="min-w-0 flex-1 p-8"><Outlet /></main>
      </div>
    </div>
  );
}
