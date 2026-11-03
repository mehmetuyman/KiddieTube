// Test harness: a real app on a fresh in-memory PGlite database (running as a
// non-superuser, so row-level security is enforced), a captured mailer and a
// stubbed YouTube lookup.
import type { FastifyInstance, InjectOptions } from 'fastify'
import { buildApp } from '../app.ts'
import { loadConfig } from '../config.ts'
import { openDb, type DbHandle } from '../db/client.ts'
import type { Mail, Mailer } from '../email.ts'

export const ADMIN_EMAIL = 'admin@example.com'
export const PASSWORD = 'correct-horse-battery'

export interface Harness {
  app: FastifyInstance
  db: DbHandle
  outbox: Mail[]
  close(): Promise<void>
}

export async function createHarness(): Promise<Harness> {
  const config = loadConfig({ NODE_ENV: 'test', BASE_URL: 'http://localhost:5173', ADMIN_EMAILS: ADMIN_EMAIL } as NodeJS.ProcessEnv)
  const db = await openDb(undefined) // in-memory
  const outbox: Mail[] = []
  const mailer: Mailer = { outbox, send: async (m) => void outbox.push(m) }
  const { app } = await buildApp({
    config,
    db: db.db,
    mailer,
    fetchMeta: async (id) => (id.startsWith('x') ? null : { title: `Title of ${id}`, channel: 'Stub Channel' }),
  })
  await app.ready()
  return { app, db, outbox, close: async () => (await app.close(), await db.close()) }
}

/** A signed-in client: keeps the session cookie between requests. */
export class Client {
  cookie = ''
  constructor(private h: Harness) {}

  async req(method: InjectOptions['method'], url: string, payload?: unknown, headers: Record<string, string> = {}) {
    const res = await this.h.app.inject({
      method,
      url,
      payload: payload as InjectOptions['payload'],
      headers: { origin: 'http://localhost:5173', ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
    })
    const setCookie = res.headers['set-cookie']
    if (setCookie) {
      const list = Array.isArray(setCookie) ? setCookie : [setCookie]
      const jar = new Map(this.cookie.split('; ').filter(Boolean).map((c) => c.split('=') as [string, string]))
      for (const c of list) {
        const [pair] = c.split(';')
        const [k, ...v] = pair.split('=')
        jar.set(k, v.join('='))
      }
      this.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
    }
    return { status: res.statusCode, body: res.body ? safeJson(res.body) : null, headers: res.headers }
  }

  signUp(email: string, name = email.split('@')[0]) {
    return this.req('POST', '/api/auth/sign-up/email', { email, password: PASSWORD, name })
  }
  signIn(email: string, password = PASSWORD) {
    return this.req('POST', '/api/auth/sign-in/email', { email, password })
  }
}

const safeJson = (s: string) => {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

/** Admin signs up, creates a family; returns the client and family id. */
export async function adminWithFamily(h: Harness, name = 'Admin Family') {
  const admin = new Client(h)
  const su = await admin.signUp(ADMIN_EMAIL, 'Admin')
  if (su.status !== 200) throw new Error(`admin sign-up failed: ${su.status} ${JSON.stringify(su.body)}`)
  const fam = await admin.req('POST', '/api/v1/families', { name })
  if (fam.status !== 201) throw new Error(`create family failed: ${fam.status} ${JSON.stringify(fam.body)}`)
  return { admin, familyId: fam.body.id as string }
}

/** Admin invites `email` to create their own family; they sign up and create it. */
export async function invitedFamily(h: Harness, admin: Client, email: string, name: string) {
  const inv = await admin.req('POST', '/api/v1/admin/family-invites', { email })
  if (inv.status !== 201) throw new Error(`invite failed: ${inv.status}`)
  const mail = h.outbox.findLast((m) => m.to === email)!
  const token = /invite=([A-Za-z0-9_-]+)/.exec(mail.text)![1]
  const c = new Client(h)
  const su = await c.signUp(email)
  if (su.status !== 200) throw new Error(`invited sign-up failed: ${su.status} ${JSON.stringify(su.body)}`)
  const fam = await c.req('POST', '/api/v1/families', { name, inviteToken: token })
  if (fam.status !== 201) throw new Error(`invited family failed: ${fam.status} ${JSON.stringify(fam.body)}`)
  return { client: c, familyId: fam.body.id as string }
}
