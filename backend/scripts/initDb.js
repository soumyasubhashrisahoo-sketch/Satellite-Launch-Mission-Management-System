// Creates the database if needed and runs ../../database/*.sql in order. --reset rebuilds from scratch.
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'database');
const dbName = new URL(process.env.DATABASE_URL).pathname.slice(1);

const admin = new pg.Client({ connectionString: process.env.DATABASE_URL.replace(`/${dbName}`, '/postgres') });
await admin.connect();
if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName])).rowCount) {
  await admin.query(`CREATE DATABASE "${dbName}"`); console.log(`created database ${dbName}`);
}
await admin.end();

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (process.argv.includes('--reset')) { await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); console.log('schema reset'); }
if ((await db.query(`SELECT to_regclass('public.satellites') t`)).rows[0].t) {
  console.log('Database already initialised. Run "npm run db:reset" to rebuild it from scratch.'); await db.end(); process.exit(0);
}
for (const f of fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()) {
  await db.query(fs.readFileSync(path.join(dir, f), 'utf8')); console.log('ran', f);
}
await db.end();
console.log('Ready. Logins: admin@orbitalops.com/admin123, operator@orbitalops.com/operator123, viewer@orbitalops.com/viewer123');
