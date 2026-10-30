-- Trag's role and database, for a SQL client/IDE (DataGrip, DBeaver, ...) connected to the
-- Traccar Postgres as its superuser. For psql use trag-db.sql instead.
--
-- 1. Replace <password> below (e.g. from `openssl rand -hex 24`). Do not save the file with it.
-- 2. Turn on auto-commit: CREATE DATABASE cannot run inside a transaction.
-- 3. Run the statements one by one. Safe to re-run; CREATE DATABASE then fails with
--    "already exists", which can be ignored.
-- Then in trag.env: DATABASE_URL=postgres://trag:<password>@db:5432/trag

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'trag') THEN
    CREATE ROLE trag LOGIN;
  END IF;
END $$;

-- Also sets the password when the role already existed.
ALTER ROLE trag LOGIN PASSWORD '<password>';

CREATE DATABASE trag OWNER trag;
