// Family scoping. Every query on family-owned tables runs inside
// withFamily(), which sets `app.family_id` for the transaction; PostgreSQL's
// row-level security (migrations/0001_rls.sql) then hides every other
// family's rows, even if a query forgets a WHERE clause.
import { sql } from 'drizzle-orm'
import type { Db } from './client.ts'

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export function withFamily<T>(db: Db, familyId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.family_id', ${familyId}, true)`)
    return fn(tx)
  })
}

/**
 * Cross-family access, for the few operations that legitimately need it:
 * resolving a device key (before its family is known) and instance-admin
 * screens. Keep usages rare and reviewed.
 */
export function withSystem<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.system', 'on', true)`)
    return fn(tx)
  })
}
