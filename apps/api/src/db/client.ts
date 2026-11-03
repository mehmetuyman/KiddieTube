// Database connection: PostgreSQL in production, embedded PGlite (real
// Postgres compiled to WASM) for development and tests, so no database server
// needs to be installed to work on the app.
import { fileURLToPath } from 'node:url'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from './schema.ts'

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export interface DbHandle {
  db: Db
  close(): Promise<void>
}

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url))

/** Role the app runs as inside PGlite: not a superuser, so row-level security applies. */
const PGLITE_APP_ROLE = 'kiddietube_app'

export async function openDb(databaseUrl: string | undefined, opts: { migrate?: boolean } = {}): Promise<DbHandle> {
  if (databaseUrl?.startsWith('postgres')) {
    const { Pool } = await import('pg')
    const { drizzle } = await import('drizzle-orm/node-postgres')
    const { migrate } = await import('drizzle-orm/node-postgres/migrator')
    const pool = new Pool({ connectionString: databaseUrl, max: 10 })
    const db = drizzle(pool, { schema, casing: 'snake_case' })
    if (opts.migrate) await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
    return { db: db as unknown as Db, close: () => pool.end() }
  }

  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const { migrate } = await import('drizzle-orm/pglite/migrator')
  const dataDir = databaseUrl?.startsWith('pglite:') ? databaseUrl.slice('pglite:'.length) : undefined
  const client = new PGlite(dataDir || undefined) // no dir = in-memory
  const db = drizzle(client, { schema, casing: 'snake_case' })
  if (opts.migrate !== false) await migrate(db, { migrationsFolder: MIGRATIONS_DIR })

  // Switch to a non-superuser role so RLS is enforced exactly as in production.
  await client.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PGLITE_APP_ROLE}') THEN
        CREATE ROLE ${PGLITE_APP_ROLE} NOLOGIN;
      END IF;
    END $$;
    GRANT USAGE ON SCHEMA public TO ${PGLITE_APP_ROLE};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${PGLITE_APP_ROLE};
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${PGLITE_APP_ROLE};
    SET ROLE ${PGLITE_APP_ROLE};
  `)
  return { db: db as unknown as Db, close: () => client.close() }
}
