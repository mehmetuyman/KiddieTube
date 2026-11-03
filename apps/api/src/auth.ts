// Parent authentication with Better Auth: email + password, sessions in
// HttpOnly cookies, password reset by email. Families, memberships and
// invitations are implemented by this app (routes/families.ts) on top of it.
//
// Sign-up is invite-only: an email may register only if it is an instance
// admin (ADMIN_EMAILS), has an unused family invite, or has a pending
// invitation into an existing family.
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { and, eq, gt, isNull } from 'drizzle-orm'
import type { Config } from './config.ts'
import type { Db } from './db/client.ts'
import { withSystem } from './db/context.ts'
import * as schema from './db/schema.ts'
import { emails, type Mailer } from './email.ts'

export function createAuth(db: Db, config: Config, mailer: Mailer) {
  const isAdminEmail = (email: string) => config.adminEmails.includes(email.toLowerCase())

  async function mayRegister(email: string): Promise<boolean> {
    if (isAdminEmail(email)) return true
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
      autoSignIn: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await mailer.send(emails.passwordReset(user.email, url))
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
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const email = user.email.toLowerCase()
            if (!(await mayRegister(email))) return false // invite-only
            return { data: { ...user, email, isAdmin: isAdminEmail(email) } }
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
