-- One-time database setup. Run as the postgres superuser:
--   sudo -u postgres psql -v pw="'<strong password>'" -f deploy/setup-db.sql
--
-- The app's user is an ordinary role (no SUPERUSER, no BYPASSRLS) and owns
-- its own database, so migrations can create tables and row-level security
-- (FORCE'd in migrations/0001_rls.sql) applies to it.
CREATE ROLE kiddietube LOGIN PASSWORD :pw NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE DATABASE kiddietube OWNER kiddietube;
REVOKE ALL ON DATABASE kiddietube FROM PUBLIC;
\connect kiddietube
ALTER SCHEMA public OWNER TO kiddietube;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

-- Staging (optional): same pattern
-- CREATE ROLE kiddietube_staging LOGIN PASSWORD '<other password>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
-- CREATE DATABASE kiddietube_staging OWNER kiddietube_staging;
