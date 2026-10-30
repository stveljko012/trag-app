-- Trag's role and database in the existing Traccar Postgres. Safe to re-run: missing objects are
-- created, and the password is (re)set to the one entered.
--
-- Run interactively (\prompt needs a terminal, so not with `< trag-db.sql`):
--   docker compose cp deploy/trag-db.sql db:/tmp/trag-db.sql
--   docker compose exec db psql -U traccar -d traccar -f /tmp/trag-db.sql
-- Then in trag.env: DATABASE_URL=postgres://trag:<password>@db:5432/trag

\set ON_ERROR_STOP on
\prompt 'Password for role trag: ' pw

SELECT format('CREATE ROLE trag LOGIN PASSWORD %L', :'pw')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'trag') \gexec

-- Also sets the password when the role already existed.
SELECT format('ALTER ROLE trag LOGIN PASSWORD %L', :'pw') \gexec

SELECT 'CREATE DATABASE trag OWNER trag'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'trag') \gexec

\echo 'OK: role and database trag exist'
