// Parent authentication with Better Auth: email + password, sessions in
// HttpOnly cookies, password reset by email. Families, memberships and
// invitations are implemented by this app (routes/families.ts) on top of it.
//
// Sign-up is invite-only: an email may register only if it is an instance
// admin (ADMIN_EMAILS), has an unused family invite, or has a pending
// invitation into an existing family.
//
// Sign-up never takes a password [review R2-4]. POST /api/v1/signup creates
// the account with a random password nobody knows and emails a "choose your
// password" link (Better Auth's reset flow). Choosing it proves the address,
// which marks it confirmed; unconfirmed accounts can't sign in. So whoever
// owns the inbox always sets the password, and someone who registers another
// person's address first gains nothing and blocks nothing.
import { betterAuth } from 'better-auth'
import { langOf } from './lib/i18n.ts'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { and, eq, gt, isNull, like } from 'drizzle-orm'
import { isInstanceAdmin, type Config } from './config.ts'
import type { Db } from './db/client.ts'
import { withSystem } from './db/context.ts'
import * as schema from './db/schema.ts'
import { emails, type Mailer } from './email.ts'

/** May this email create an account? (instance admin, unused family invite, or pending invitation) */
export async function mayRegister(db: Db, config: Config, email: string): Promise<boolean> {
  if (isInstanceAdmin(config, email)) return true
  const now = new Date()
  return withSystem(db, async (tx) => {
    const fi = await tx
      .select({ id: schema.familyInvite.id })
      .from(schema.familyInvite)
      .where(
        and(
          eq(schema.familyInvite.email, email.toLowerCase()),
          isNull(schema.familyInvite.usedAt),
          gt(schema.familyInvite.expiresAt, now),
        ),
      )
      .limit(1)
    if (fi.length) return true
    const mi = await tx
      .select({ id: schema.invitation.id })
      .from(schema.invitation)
      .where(
        and(
          eq(schema.invitation.email, email.toLowerCase()),
          eq(schema.invitation.status, 'pending'),
          gt(schema.invitation.expiresAt, now),
        ),
      )
      .limit(1)
    return mi.length > 0
  })
}

/** One "choose your password" / reset email per address per this long [review R3-2]. */
export const LINK_COOLDOWN_MS = 2 * 60 * 1000

/**
 * Was a password link sent to this address within the cooldown? (Better Auth
 * stores each link as a verification row `reset-password:<token>` holding the
 * user id.) Callers skip sending but answer as usual, revealing nothing.
 */
export async function linkRecentlySent(db: Db, email: string): Promise<boolean> {
  const [u] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email.toLowerCase()))
  if (!u) return false
  const recent = await db
    .select({ id: schema.verification.id })
    .from(schema.verification)
    .where(
      and(
        eq(schema.verification.value, u.id),
        like(schema.verification.identifier, 'reset-password:%'),
        gt(schema.verification.createdAt, new Date(Date.now() - LINK_COOLDOWN_MS)),
      ),
    )
    .limit(1)
  return recent.length > 0
}

export function createAuth(db: Db, config: Config, mailer: Mailer) {
  return betterAuth({
    appName: 'Kiddie Tube',
    baseURL: config.BASE_URL,
    basePath: '/api/auth',
    secret: config.AUTH_SECRET,
    trustedOrigins: [config.BASE_URL],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      // The address must be proven (by choosing the password from the emailed
      // link) before the account can sign in [review H1, R2-4].
      requireEmailVerification: true,
      autoSignIn: false,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      // The same link serves both: finishing a new account, or a reset.
      sendResetPassword: async ({ user, url }, request) => {
        const lang = langOf(request?.headers)
        await mailer.send(user.emailVerified ? emails.passwordReset(user.email, url, lang) : emails.finishSignUp(user.email, url, lang))
      },
      // Choosing a password from the emailed link proves the address.
      onPasswordReset: async ({ user }) => {
        if (!user.emailVerified) await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, user.id))
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh daily
    },
    user: {
      additionalFields: {
        isAdmin: { type: 'boolean', defaultValue: false, input: false },
      },
    },
    rateLimit: { enabled: config.NODE_ENV !== 'test', window: 60, max: 30 },
    advanced: {
      cookiePrefix: 'kt',
      useSecureCookies: config.BASE_URL.startsWith('https://'),
      // nginx (deploy/nginx/kiddietube.conf) sets these to the real client IP;
      // used for per-client rate limits on sign-in and password reset
      ipAddress: { ipAddressHeaders: ['x-real-ip'] },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const email = user.email.toLowerCase()
            if (!(await mayRegister(db, config, email))) return false // invite-only
            // admin rights are not stored: requireAdmin checks ADMIN_EMAILS on every request
            return { data: { ...user, email } }
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
