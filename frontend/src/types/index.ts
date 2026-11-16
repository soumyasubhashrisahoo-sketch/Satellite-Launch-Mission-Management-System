export type Role = 'admin' | 'operator' | 'viewer';
export interface User { id: number; name: string; email: string; role: Role }
export interface LiveReading {
  satellite_id: number; code: string; recorded_at: string; altitude_km: number;
  battery_pct: number; signal_dbm: number; temperature_c: number; velocity_kms: number;
}
