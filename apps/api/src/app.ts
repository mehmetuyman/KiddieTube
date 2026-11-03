// Builds the Fastify app. Kept separate from server.ts so tests can create
// an app with an in-memory database and inject requests without a socket.
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { sql } from 'drizzle-orm'
import Fastify, { type FastifyInstance } from 'fastify'
import { createAuth } from './auth.ts'
import type { Config } from './config.ts'
import type { Db } from './db/client.ts'
import { createMailer, type Mailer } from './email.ts'
import type { AppContext } from './http/context.ts'
import { errorHandler } from './http/errors.ts'
import { fetchYouTubeMeta, type YouTubeMeta } from './lib/youtube.ts'
import { contentRoutes } from './routes/content.ts'
import { familyRoutes } from './routes/families.ts'
import { feedRoutes } from './routes/feed.ts'

export interface BuildOptions {
  config: Config
  db: Db
  mailer?: Mailer
  fetchMeta?: (youtubeId: string) => Promise<YouTubeMeta | null>
}

export async function buildApp(opts: BuildOptions): Promise<{ app: FastifyInstance; ctx: AppContext }> {
  const { config, db } = opts
  const app = Fastify({
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 256 * 1024,
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: config.LOG_LEVEL,
            // never log credentials
            redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
          },
  })

  const mailer = opts.mailer ?? createMailer(config, (m) => app.log.info(m))
  const auth = createAuth(db, config, mailer)
  const ctx: AppContext = { config, db, auth, mailer, fetchMeta: opts.fetchMeta ?? ((id) => fetchYouTubeMeta(id)) }

  await app.register(helmet, {
    // JSON API only: the web app's CSP is set by nginx for the static files
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
  })
  await app.register(cookie)
  await app.register(rateLimit, {
    global: true,
    max: config.NODE_ENV === 'test' ? 10_000 : 300,
    timeWindow: '1 minute',
  })
  app.setErrorHandler(errorHandler)

  // Better Auth handles /api/auth/* (sign-up/in/out, sessions, password reset).
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    config: { rateLimit: { max: config.NODE_ENV === 'test' ? 10_000 : 30, timeWindow: '1 minute' } },
    async handler(req, reply) {
      const url = new URL(req.url, config.BASE_URL)
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.append(k, Array.isArray(v) ? v.join(', ') : String(v))
      const response = await auth.handler(
        new Request(url, { method: req.method, headers, body: req.body ? JSON.stringify(req.body) : undefined }),
      )
      reply.status(response.status)
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') reply.header(key, value)
      })
      const cookies = response.headers.getSetCookie()
      if (cookies.length) reply.header('set-cookie', cookies)
      return reply.send(response.body ? await response.text() : null)
    },
  })

  app.get('/api/v1/health', async (_req, reply) => {
    try {
      await db.execute(sql`select 1`)
      return { status: 'ok' }
    } catch {
      return reply.status(503).send({ status: 'db_unavailable' })
    }
  })

  await familyRoutes(app, ctx)
  await contentRoutes(app, ctx)
  await feedRoutes(app, ctx)

  return { app, ctx }
}
