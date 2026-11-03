// Runtime configuration from environment variables (validated at startup).
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(3007),
  /** Public origin of the app, e.g. https://kids.tinyapps.dev */
  BASE_URL: z.string().url().default('http://localhost:5173'),
  /** postgres://... in production; omitted or `pglite:<dir>` = embedded PGlite (dev/tests). */
  DATABASE_URL: z.string().optional(),
  AUTH_SECRET: z.string().min(32).default('dev-only-secret-change-me-dev-only-secret-change-me'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Kiddie Tube <noreply@tinyapps.dev>'),
  /** Comma-separated emails that are instance administrators. */
  ADMIN_EMAILS: z.string().default(''),
  /** Set when running behind nginx so client IPs / https are read correctly. */
  TRUST_PROXY: z.coerce.boolean().default(true),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
})

export type Config = z.infer<typeof schema> & { adminEmails: string[] }

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid configuration: ${msg}`)
  }
  const c = parsed.data
  if (c.NODE_ENV === 'production') {
    if (!c.DATABASE_URL?.startsWith('postgres')) throw new Error('DATABASE_URL (postgres://...) is required in production')
    if (c.AUTH_SECRET.startsWith('dev-only')) throw new Error('AUTH_SECRET must be set in production')
  }
  return {
    ...c,
    adminEmails: c.ADMIN_EMAILS.split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  }
}
