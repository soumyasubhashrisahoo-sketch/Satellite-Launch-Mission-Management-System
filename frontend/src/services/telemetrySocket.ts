import type { LiveReading } from '../types';

/** WebSocket client for live telemetry (fed by PostgreSQL LISTEN/NOTIFY on the server). Auto-reconnects. */
export function openTelemetrySocket(token: string, onMsg: (m: LiveReading) => void, onState?: (live: boolean) => void) {
  let ws: WebSocket; let closed = false;
  const connect = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/telemetry?token=${token}`);
    ws.onopen = () => onState?.(true);
    ws.onmessage = (e) => onMsg(JSON.parse(e.data));
    ws.onclose = () => { onState?.(false); if (!closed) setTimeout(connect, 2000); };
  };
  connect();
  return () => { closed = true; ws.close(); };
}
