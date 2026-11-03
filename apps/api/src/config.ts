// Runtime configuration from environment variables (validated at startup).
import { z } from 'zod'

/** "true"/"1"/"yes"/"on" -> true; anything else -> false. (z.coerce.boolean would turn "false" into true.) */
const envBool = (fallback: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (v === undefined ? fallback : typeof v === 'boolean' ? v : ['true', '1', 'yes', 'on'].includes(v.trim().toLowerCase())))

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
  /**
   * Addresses of the reverse proxy whose X-Forwarded-* headers are believed
   * (comma-separated IPs/CIDRs), or "false". Never "trust everyone": a client
   * could then pick its own IP and dodge the rate limits [review H2].
   */
  TRUST_PROXY: z
    .string()
    .default('127.0.0.1')
    .transform((v) => v.trim())
    .refine((v) => v.toLowerCase() !== 'true', 'list the proxy addresses (e.g. 127.0.0.1) instead of "true"')
    .transform((v) => (['', 'false', '0', 'no', 'off'].includes(v.toLowerCase()) ? false : v)),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Tests/dev only: answer video lookups locally instead of calling YouTube. */
  FAKE_YOUTUBE_META: envBool(false),
  /** Tests/dev only: expose captured emails at /api/v1/dev/outbox (loopback only). */
  DEV_OUTBOX: envBool(false),
})

export type Config = z.infer<typeof schema> & { adminEmails: string[] }

/** An instance administrator per ADMIN_EMAILS (checked on every request, never stored). */
export const isInstanceAdmin = (config: Pick<Config, 'adminEmails'>, email: string) => config.adminEmails.includes(email.toLowerCase())

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
    if (c.FAKE_YOUTUBE_META) throw new Error('FAKE_YOUTUBE_META is not allowed in production')
    if (c.DEV_OUTBOX) throw new Error('DEV_OUTBOX is not allowed in production')
  }
  return {
    ...c,
    adminEmails: c.ADMIN_EMAILS.split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  }
}
