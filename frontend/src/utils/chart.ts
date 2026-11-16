import { useTheme } from '../store/useThemeStore';

export function useChartTheme() {
  const dark = useTheme((s) => s.dark);
  return {
    axis: { stroke: '#94a3b8', fontSize: 12 },
    tip: { contentStyle: { background: dark ? '#111a2e' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,.1)' : '#e2e8f0'}`, borderRadius: 8, color: dark ? '#e2e8f0' : '#0f172a' } },
  };
}
