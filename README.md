# OrbitalOps - Satellite Mission Control (DBMS Capstone)

PostgreSQL-centred full-stack app: **PostgreSQL -> Node.js/Express (+WebSocket) -> React + Vite + TypeScript + Tailwind**, with dark and light themes.
Screens: Dashboard, Satellites, Launches, Missions, Ground Stations, Live Telemetry, Alerts and a **SQL Explorer** that demonstrates DBMS concepts live.

## Run it in VS Code
Requirements: Node 18+, PostgreSQL 15+ (works with 18).

```bash
npm run setup          # installs backend + frontend dependencies
# edit backend/.env -> put YOUR postgres password in DATABASE_URL (default: postgres:postgres@localhost:5432/orbitalops)
npm run db:init        # creates the database and runs database/01..06 *.sql
npm run dev:backend    # terminal 1  -> http://localhost:4000  (also starts the telemetry simulator)
npm run dev:frontend   # terminal 2  -> http://localhost:5173
```
`npm run db:reset` rebuilds the database. `npm run test:db` runs 37 database tests and rewrites `docs/TEST_RESULTS.md`.

| Login | Password | Role | Can do |
|---|---|---|---|
| admin@orbitalops.com | admin123 | admin | everything, incl. archive satellites, add ground stations, read audit log |
| operator@orbitalops.com | operator123 | operator | register satellites, schedule/complete launches, run missions, acknowledge alerts |
| viewer@orbitalops.com | viewer123 | viewer | read-only |

## Structure
```
orbitalops/
  database/    01_schema 02_indexes 03_views 04_functions_triggers 05_security 06_seed (.sql)
  backend/     src/{server,db,realtime}.js  src/routes/*  src/middleware/auth.js  scripts/{initDb,runTests}.js
  frontend/    src/{components,features/*,services,store,types,utils}
  docs/        er_diagram.png  DBMS_CONCEPTS.md  TEST_RESULTS.md
```
Feature-based frontend: one folder per screen under `src/features`; `services/api.ts` (axios) and `services/telemetrySocket.ts` (WebSocket); Zustand stores for theme and auth.

## How the pieces connect
* Every API call runs in **one transaction** as the user's PostgreSQL role (`SET LOCAL ROLE orbital_admin|operator|viewer`): `COMMIT` on success, `ROLLBACK` on any error. The database, not just Node, decides what each role may do.
* The telemetry simulator inserts readings; a trigger updates the satellite, raises alerts (battery < 20%, LEO altitude < 400 km) and calls `pg_notify`; the API `LISTEN`s and pushes to browsers over WebSocket (Telemetry page, green LIVE badge).
* See `docs/DBMS_CONCEPTS.md` for a concept -> file map to use in your viva.

## Troubleshooting
* `password authentication failed` -> fix the password in `backend/.env`. `connection refused` -> start the PostgreSQL service.
* Set `SIMULATE=false` in `backend/.env` to stop generating live telemetry.
