// Everything route handlers need, created once per server (or per test).
import { fromNodeHeaders } from 'better-auth/node'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { FastifyRequest } from 'fastify'
import type { Role } from '@kiddietube/shared'
import type { Auth } from '../auth.ts'
import { isInstanceAdmin, type Config } from '../config.ts'
import type { Db } from '../db/client.ts'
import { withSystem, type Tx } from '../db/context.ts'
import * as s from '../db/schema.ts'
import type { Mailer } from '../email.ts'
import { sha256 } from '../lib/crypto.ts'
import type { YouTubeMeta } from '../lib/youtube.ts'
import { forbidden, unauthorized } from './errors.ts'

export interface AppContext {
  config: Config
  db: Db
  auth: Auth
  mailer: Mailer
  fetchMeta: (youtubeId: string) => Promise<YouTubeMeta | null>
}

export interface SessionUser {
  id: string
  email: string
  name: string
  isAdmin: boolean
}

/** Signed-in parent, or 401. */
export async function requireUser(ctx: AppContext, req: FastifyRequest): Promise<SessionUser> {
  const session = await ctx.auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  if (!session) throw unauthorized()
  const u = session.user
  // Derived on every request (not stored), so removing an address from
  // ADMIN_EMAILS takes effect at once; only a verified address counts.
  return { id: u.id, email: u.email, name: u.name, isAdmin: u.emailVerified && isInstanceAdmin(ctx.config, u.email) }
}

export async function requireAdmin(ctx: AppContext, req: FastifyRequest): Promise<SessionUser> {
  const user = await requireUser(ctx, req)
  if (!user.isAdmin) throw forbidden('Instance administrators only')
  return user
}

/** Map Better Auth's stored role to ours. */
export const toRole = (r: string): Role => (r === 'owner' ? 'owner' : 'parent')

/** Signed-in member of `familyId` (optionally with one of `roles`), or 401/403. */
export async function requireMember(
  ctx: AppContext,
  req: FastifyRequest,
  familyId: string,
  roles?: Role[],
): Promise<{ user: SessionUser; role: Role }> {
  const user = await requireUser(ctx, req)
  const rows = await ctx.db
    .select({ role: s.member.role })
    .from(s.member)
    .where(and(eq(s.member.organizationId, familyId), eq(s.member.userId, user.id)))
    .limit(1)
  // Same answer whether the family doesn't exist or isn't theirs: no probing.
  if (!rows.length) throw forbidden('Not a member of this family')
  const role = toRole(rows[0].role)
  if (roles && !roles.includes(role)) throw forbidden('Requires the owner role')
  return { user, role }
}

export interface DeviceAuth {
  deviceId: string
  familyId: string
  kidProfileId: string
}

/** Paired device from `Authorization: Device <key>`, or 401. Revoked keys are rejected. */
export async function requireDevice(ctx: AppContext, req: FastifyRequest): Promise<DeviceAuth> {
  const header = req.headers.authorization ?? ''
  const m = /^Device\s+([A-Za-z0-9_-]{20,})$/.exec(header)
  if (!m) throw unauthorized('Device key required')
  const keyHash = sha256(m[1])
  const found = await withSystem(ctx.db, async (tx) => {
    const rows = await tx
      .select({ id: s.device.id, familyId: s.device.familyId, kidProfileId: s.device.kidProfileId })
      .from(s.device)
      .where(and(eq(s.device.keyHash, keyHash), isNull(s.device.revokedAt)))
      .limit(1)
    if (rows.length) await tx.update(s.device).set({ lastSeenAt: new Date() }).where(eq(s.device.id, rows[0].id))
    return rows[0]
  })
  if (!found) throw unauthorized('Unknown or revoked device')
  return { deviceId: found.id, familyId: found.familyId, kidProfileId: found.kidProfileId }
}

/** Record a change and bump the family's feed version so devices re-sync. */
export async function touch(
  tx: Tx,
  familyId: string,
  userId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  details?: unknown,
) {
  await tx.insert(s.auditLog).values({ familyId, userId, action, entity, entityId, details: details ?? null })
  await tx
    .insert(s.familyState)
    .values({ familyId, feedVersion: 2 })
    .onConflictDoUpdate({ target: s.familyState.familyId, set: { feedVersion: sqlIncrement() } })
}

const sqlIncrement = () => sql`${s.familyState.feedVersion} + 1`
