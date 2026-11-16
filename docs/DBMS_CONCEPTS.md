# DBMS concepts covered and where to find them

| Concept | Where |
|---|---|
| DDL, data types, ENUM, DOMAIN (`percentage`) | `database/01_schema.sql` |
| PK, FK with ON DELETE RESTRICT / CASCADE / SET NULL, UNIQUE, CHECK, NOT NULL | `01_schema.sql` |
| 3NF design, lookup tables, M:N with composite key (`mission_satellites`) | `01_schema.sql`, `docs/er_diagram.png` |
| JSONB column (`satellites.specs`) + GIN index + containment query `@>` | `01_schema.sql`, `02_indexes.sql`, SQL Explorer: *JSONB* |
| Soft delete (`deleted_at`) | `01_schema.sql`, `routes/satellites.js` |
| Declarative RANGE partitioning (monthly `telemetry`) + partition-creation function + pruning | `01_schema.sql`, SQL Explorer: *Partition pruning*, test T37 |
| Indexes: composite, partial, BRIN, GIN, covering (INCLUDE), expression (lower(email)) | `02_indexes.sql` |
| Views, DISTINCT ON, CASE | `03_views.sql` |
| Materialized view + REFRESH CONCURRENTLY (unique index) | `03_views.sql`, `src/realtime.js` |
| PL/pgSQL functions, SQL functions, regression aggregate `regr_slope` (orbit decay) | `04_functions_triggers.sql` |
| Stored PROCEDURE with row lock (`sp_complete_launch`), `SELECT ... FOR UPDATE` | `04_functions_triggers.sql` |
| UPSERT `ON CONFLICT DO UPDATE` | `fn_advance_phase` |
| Triggers: BEFORE/AFTER, row-level, WHEN clause, column-specific (`UPDATE OF`) | `04_functions_triggers.sql` |
| Business-rule triggers (immutable completed missions, no reactivating decommissioned satellites) | same |
| Auto-alerts from telemetry (trigger inserts into `alerts`) | `fn_telemetry_after_insert` |
| Audit trail (SECURITY DEFINER trigger -> `audit_log`) | `fn_audit` |
| LISTEN / NOTIFY -> WebSocket live streaming | `fn_telemetry_after_insert`, `src/realtime.js` |
| Transactions: BEGIN / COMMIT / ROLLBACK per request, atomic launch+satellite insert, savepoints in tests | `src/db.js`, `routes/launches.js`, `runTests.js` |
| Roles, GRANT / REVOKE, least privilege, column-level GRANT (no password hash access) | `05_security.sql` |
| `SET LOCAL ROLE` per request (database enforces permissions, not just Node) | `src/db.js` |
| Password hashing in the DB (pgcrypto `crypt` / `gen_salt('bf')`) | `06_seed.sql`, `routes/auth.js` |
| Window functions, CTE, recursive CTE, ROLLUP, LATERAL, set operations (EXCEPT), FILTER/HAVING, EXISTS, EXPLAIN | `src/routes/concepts.js` (shown live in the **SQL Explorer** page) |
| date_bin time bucketing for time-series | `routes/misc.js` |
| Testing: valid / invalid / boundary / security cases | `backend/scripts/runTests.js`, `docs/TEST_RESULTS.md` |

## Architecture note
Your diagram uses Kafka for streaming. This project keeps the same flow
(Satellites -> Ground Station/Telemetry ingestion -> TimescaleDB-style time-series -> API -> Frontend + live stream) but implements the
streaming leg with PostgreSQL's own **LISTEN/NOTIFY** and a WebSocket gateway in Express, and the time-series store with **native partitioned tables**.
That keeps the whole project inside PostgreSQL, which is what a DBMS capstone is about. The `src/realtime.js` simulator plays the role of the satellites.
