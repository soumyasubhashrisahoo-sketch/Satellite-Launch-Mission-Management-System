import pg from 'pg';
import 'dotenv/config';

pg.types.setTypeParser(1082, (v) => v);          // DATE -> 'YYYY-MM-DD' string (no timezone shifts)
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const ROLE = { admin: 'orbital_admin', operator: 'orbital_operator', viewer: 'orbital_viewer' };

/** One transaction per request, executed as the caller's PostgreSQL role. COMMIT on success, ROLLBACK on any error. */
export async function withUser(user, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${ROLE[user.role]}`);
    await client.query(`SELECT set_config('app.user', $1, true)`, [user.email]);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
