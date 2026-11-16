import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { useAuth } from './store/useAuthStore';
import { useTheme } from './store/useThemeStore';
import LoginPage from './features/auth/LoginPage';
import DashboardPage from './features/dashboard/DashboardPage';
import SatellitesPage from './features/satellites/SatellitesPage';
import LaunchesPage from './features/launches/LaunchesPage';
import MissionsPage from './features/missions/MissionsPage';
import GroundStationsPage from './features/groundstations/GroundStationsPage';
import TelemetryPage from './features/telemetry/TelemetryPage';
import AlertsPage from './features/alerts/AlertsPage';
import CommandCenterPage from './features/command/CommandCenterPage';


const Protected = () => (useAuth((s) => s.token) ? <Outlet /> : <Navigate to="/login" replace />);

export default function App() {
  const dark = useTheme((s) => s.dark);
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="command-center" element={<CommandCenterPage />} />
          <Route path="satellites" element={<SatellitesPage />} />
          <Route path="launches" element={<LaunchesPage />} />
          <Route path="missions" element={<MissionsPage />} />
          <Route path="ground-stations" element={<GroundStationsPage />} />
          <Route path="telemetry" element={<TelemetryPage />} />
          <Route path="alerts" element={<AlertsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
