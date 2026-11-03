import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withFamily } from '../db/context.ts'
import * as s from '../db/schema.ts'
import { ADMIN_EMAIL, Client, adminWithFamily, createHarness, invitedFamily, type Harness } from './harness.ts'

let h: Harness
beforeAll(async () => {
  h = await createHarness()
})
afterAll(async () => {
  await h.close()
})

describe('health', () => {
  it('reports ok', async () => {
    const r = await new Client(h).req('GET', '/api/v1/health')
    expect(r).toMatchObject({ status: 200, body: { status: 'ok' } })
  })
})

describe('sign-up is invite-only', () => {
  it('rejects an email with no invitation', async () => {
    const r = await new Client(h).signUp('stranger@example.com')
    expect(r.status).toBeGreaterThanOrEqual(400)
  })

  it('accepts an instance admin email, who can create a family', async () => {
    const { admin, familyId } = await adminWithFamily(h, 'First Family')
    const me = await admin.req('GET', '/api/v1/me')
    expect(me.body.user).toMatchObject({ email: ADMIN_EMAIL, isAdmin: true })
    expect(me.body.families).toEqual([{ id: familyId, name: 'First Family', role: 'owner' }])
  })

  it('a non-admin without an invite cannot create a family', async () => {
    const admin = new Client(h)
    await admin.signIn(ADMIN_EMAIL)
    await admin.req('POST', '/api/v1/admin/family-invites', { email: 'carol@example.com' })
    const carol = new Client(h)
    expect((await carol.signUp('carol@example.com')).status).toBe(200)
    const r = await carol.req('POST', '/api/v1/families', { name: 'Sneaky' })
    expect(r.status).toBe(403)
  })
})

describe('families are isolated', () => {
  let a: Client, famA: string, b: Client, famB: string

  beforeAll(async () => {
    a = new Client(h)
    await a.signIn(ADMIN_EMAIL)
    famA = (await a.req('POST', '/api/v1/families', { name: 'Family A' })).body.id
    ;({ client: b, familyId: famB } = await invitedFamily(h, a, 'bob@example.com', 'Family B'))
    await a.req('POST', `/api/v1/families/${famA}/videos`, { url: 'https://youtu.be/aaaaaaaaaaa' })
    await b.req('POST', `/api/v1/families/${famB}/videos`, { url: 'https://youtu.be/bbbbbbbbbbb' })
  })

  it('a new family starts empty', async () => {
    const { client, familyId } = await invitedFamily(h, a, 'dana@example.com', 'Family D')
    const vids = await client.req('GET', `/api/v1/families/${familyId}/videos`)
    expect(vids.body).toEqual([])
    const cats = await client.req('GET', `/api/v1/families/${familyId}/categories`)
    expect(cats.body).toEqual([])
  })

  it('the inviting admin is not a member of the invited family', async () => {
    const r = await a.req('GET', `/api/v1/families/${famB}/videos`)
    expect(r.status).toBe(403)
  })

  it("the API refuses another family's data", async () => {
    expect((await b.req('GET', `/api/v1/families/${famA}/videos`)).status).toBe(403)
    expect((await b.req('POST', `/api/v1/families/${famA}/videos`, { url: 'ccccccccccc' })).status).toBe(403)
    const own = await b.req('GET', `/api/v1/families/${famB}/videos`)
    expect(own.body.map((v: { youtubeId: string }) => v.youtubeId)).toEqual(['bbbbbbbbbbb'])
  })

  it('the database itself hides other families (row-level security), even without a WHERE clause', async () => {
    const seenFromA = await withFamily(h.db.db, famA, (tx) => tx.select({ y: s.video.youtubeId }).from(s.video))
    expect(seenFromA.map((r) => r.y)).toEqual(['aaaaaaaaaaa'])
    // no family context at all: nothing is visible
    const unscoped = await h.db.db.select({ y: s.video.youtubeId }).from(s.video)
    expect(unscoped).toEqual([])
  })

  it('the database refuses to write a row into another family', async () => {
    await expect(
      withFamily(h.db.db, famA, (tx) =>
        tx.insert(s.category).values({ id: 'cat_evil', familyId: famB, name: 'x', emoji: '🙂' }),
      ),
    ).rejects.toThrow()
  })

  it('a device paired in one family cannot read another family', async () => {
    const p = await b.req('POST', `/api/v1/families/${famB}/profiles`, { name: 'Kid B' })
    const pair = await b.req('POST', `/api/v1/families/${famB}/devices`, { kidProfileId: p.body.id, name: 'Tablet' })
    const feed = await new Client(h).req('GET', '/api/v1/feed', undefined, { authorization: `Device ${pair.body.deviceKey}` })
    expect(feed.body.videos.map((v: { youtubeId: string }) => v.youtubeId)).toEqual(['bbbbbbbbbbb'])
    const pinCheck = await new Client(h).req('POST', `/api/v1/families/${famA}/pin/verify`, { pin: '1234' }, {
      authorization: `Device ${pair.body.deviceKey}`,
    })
    expect(pinCheck.status).toBe(404)
  })

  it('instance admin sees family names and sizes, never their content', async () => {
    const r = await a.req('GET', '/api/v1/admin/families')
    expect(r.status).toBe(200)
    expect(r.body.find((f: { id: string }) => f.id === famB)).toMatchObject({ name: 'Family B', members: 1 })
    expect(JSON.stringify(r.body)).not.toContain('bbbbbbbbbbb')
  })
})

describe('content', () => {
  let c: Client, fam: string
  beforeAll(async () => {
    c = new Client(h)
    await c.signIn(ADMIN_EMAIL)
    fam = (await c.req('POST', '/api/v1/families', { name: 'Content Family' })).body.id
  })
  const url = (p: string) => `/api/v1/families/${fam}${p}`

  it('categories: create, order, rename, delete', async () => {
    const one = await c.req('POST', url('/categories'), { name: 'Songs', emoji: '🎵' })
    const two = await c.req('POST', url('/categories'), { name: 'Cartoons', emoji: '🎬' })
    expect([one.body.sortOrder, two.body.sortOrder]).toEqual([0, 1])
    const re = await c.req('POST', url('/categories/reorder'), { ids: [two.body.id, one.body.id] })
    expect(re.body.map((x: { name: string }) => x.name)).toEqual(['Cartoons', 'Songs'])
    const ren = await c.req('PATCH', url(`/categories/${one.body.id}`), { name: 'Kids Songs' })
    expect(ren.body.name).toBe('Kids Songs')
    expect((await c.req('DELETE', url(`/categories/${two.body.id}`))).status).toBe(204)
  })

  it('videos: add by link (title looked up), duplicates rejected, edit, hide, delete', async () => {
    const add = await c.req('POST', url('/videos'), { url: 'https://www.youtube.com/watch?v=ddddddddddd' })
    expect(add.status).toBe(201)
    expect(add.body).toMatchObject({ youtubeId: 'ddddddddddd', title: 'Title of ddddddddddd', channel: 'Stub Channel', hidden: false })
    expect((await c.req('POST', url('/videos'), { url: 'ddddddddddd' })).status).toBe(409)
    expect((await c.req('POST', url('/videos'), { url: 'not a link' })).status).toBe(400)
    // lookup fails: needs a title, then it's added as available
    expect((await c.req('POST', url('/videos'), { url: 'xxxxxxxxxxx' })).status).toBe(400)
    const manual = await c.req('POST', url('/videos'), { url: 'xxxxxxxxxxx', title: 'Typed by hand' })
    expect(manual.body).toMatchObject({ title: 'Typed by hand', status: 'ok' })

    const hid = await c.req('PATCH', url(`/videos/${add.body.id}`), { hidden: true })
    expect(hid.body.hidden).toBe(true)
    expect((await c.req('DELETE', url(`/videos/${manual.body.id}`))).status).toBe(204)
  })

  it('bulk import reports per-link results', async () => {
    const r = await c.req('POST', url('/videos/import'), { urls: ['eeeeeeeeeee', 'ddddddddddd', 'nope'] })
    expect(r.body.results.map((x: { ok: boolean }) => x.ok)).toEqual([true, false, false])
  })

  it('rejects categories from another family', async () => {
    const { familyId: other, client: oc } = await invitedFamily(h, c, 'erin@example.com', 'Erin Family')
    const cat = await oc.req('POST', `/api/v1/families/${other}/categories`, { name: 'Theirs', emoji: '🐳' })
    const r = await c.req('POST', url('/videos'), { url: 'fffffffffff', categoryId: cat.body.id })
    expect(r.status).toBe(400)
  })

  it('validation errors are uniform', async () => {
    const r = await c.req('POST', url('/categories'), { name: '', emoji: '' })
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('validation_failed')
  })
})

describe('devices and the offline feed', () => {
  let c: Client, fam: string, key: string, deviceId: string, songs: string
  beforeAll(async () => {
    c = new Client(h)
    await c.signIn(ADMIN_EMAIL)
    fam = (await c.req('POST', '/api/v1/families', { name: 'Feed Family' })).body.id
    songs = (await c.req('POST', `/api/v1/families/${fam}/categories`, { name: 'Songs', emoji: '🎵' })).body.id
    const other = (await c.req('POST', `/api/v1/families/${fam}/categories`, { name: 'Science', emoji: '🔬' })).body.id
    await c.req('POST', `/api/v1/families/${fam}/videos`, { url: 'ggggggggggg', categoryId: songs })
    await c.req('POST', `/api/v1/families/${fam}/videos`, { url: 'hhhhhhhhhhh', categoryId: other })
    const hidden = await c.req('POST', `/api/v1/families/${fam}/videos`, { url: 'iiiiiiiiiii', categoryId: songs })
    await c.req('PATCH', `/api/v1/families/${fam}/videos/${hidden.body.id}`, { hidden: true })
    const kid = await c.req('POST', `/api/v1/families/${fam}/profiles`, { name: 'Ali', avatar: '🦁', categoryIds: [songs] })
    const pair = await c.req('POST', `/api/v1/families/${fam}/devices`, { kidProfileId: kid.body.id, name: 'Phone' })
    expect(pair.status).toBe(201)
    key = pair.body.deviceKey
    deviceId = pair.body.device.id
  })
  const dev = () => ({ authorization: `Device ${key}` })

  it('serves only the profile’s categories and visible videos', async () => {
    const r = await new Client(h).req('GET', '/api/v1/feed', undefined, dev())
    expect(r.status).toBe(200)
    expect(r.body.profile).toMatchObject({ name: 'Ali', avatar: '🦁' })
    expect(r.body.categories.map((x: { name: string }) => x.name)).toEqual(['Songs'])
    expect(r.body.videos.map((v: { youtubeId: string }) => v.youtubeId)).toEqual(['ggggggggggg'])
  })

  it('answers 304 until something changes', async () => {
    const first = await new Client(h).req('GET', '/api/v1/feed', undefined, dev())
    const etag = first.headers.etag as string
    const same = await new Client(h).req('GET', '/api/v1/feed', undefined, { ...dev(), 'if-none-match': etag })
    expect(same.status).toBe(304)
    await c.req('POST', `/api/v1/families/${fam}/videos`, { url: 'jjjjjjjjjjj', categoryId: songs })
    const changed = await new Client(h).req('GET', '/api/v1/feed', undefined, { ...dev(), 'if-none-match': etag })
    expect(changed.status).toBe(200)
    expect(changed.body.videos[0].youtubeId).toBe('jjjjjjjjjjj') // newest first
  })

  it('rejects missing, wrong and revoked keys', async () => {
    expect((await new Client(h).req('GET', '/api/v1/feed')).status).toBe(401)
    expect((await new Client(h).req('GET', '/api/v1/feed', undefined, { authorization: 'Device ' + 'x'.repeat(43) })).status).toBe(401)
    await c.req('POST', `/api/v1/families/${fam}/devices/${deviceId}/revoke`)
    expect((await new Client(h).req('GET', '/api/v1/feed', undefined, dev())).status).toBe(401)
  })

  it('stores only a hash of the device key', async () => {
    const rows = await withFamily(h.db.db, fam, (tx) => tx.execute(sql`select key_hash from device`))
    expect(JSON.stringify(rows)).not.toContain(key)
  })
})

describe('parent PIN', () => {
  it('verifies, locks out after 5 misses, and can be removed', async () => {
    const c = new Client(h)
    await c.signIn(ADMIN_EMAIL)
    const fam = (await c.req('POST', '/api/v1/families', { name: 'Pin Family' })).body.id
    const pin = (p: string) => c.req('POST', `/api/v1/families/${fam}/pin/verify`, { pin: p })

    expect((await pin('0000')).body).toEqual({ ok: true }) // no PIN set
    expect((await c.req('PUT', `/api/v1/families/${fam}/pin`, { pin: '12' })).status).toBe(400)
    await c.req('PUT', `/api/v1/families/${fam}/pin`, { pin: '2468' })
    expect((await pin('2468')).body).toEqual({ ok: true })
    for (let i = 0; i < 4; i++) expect((await pin('1111')).body).toEqual({ ok: false })
    expect((await pin('1111')).body).toEqual({ ok: false }) // 5th miss -> locked
    expect((await pin('2468')).status).toBe(429)
    await c.req('PUT', `/api/v1/families/${fam}/pin`, { pin: null })
    expect((await c.req('GET', `/api/v1/families/${fam}/pin`)).body).toEqual({ set: false })
  })
})

describe('members', () => {
  it('owner invites a second parent by email; they sign up, accept, and can manage; non-owners cannot invite', async () => {
    const owner = new Client(h)
    await owner.signIn(ADMIN_EMAIL)
    const fam = (await owner.req('POST', '/api/v1/families', { name: 'Shared Family' })).body.id
    const inv = await owner.req('POST', `/api/v1/families/${fam}/invitations`, { email: 'partner@example.com' })
    expect(inv.status).toBe(201)
    const mail = h.outbox.findLast((m) => m.to === 'partner@example.com')!
    expect(mail.subject).toContain('Shared Family')

    const partner = new Client(h)
    expect((await partner.signUp('partner@example.com')).status).toBe(200) // allowed by the pending invite
    const acc = await partner.req('POST', `/api/v1/invitations/${inv.body.id}/accept`)
    expect(acc.body).toMatchObject({ id: fam, role: 'parent' })
    expect((await partner.req('POST', `/api/v1/families/${fam}/categories`, { name: 'Ours', emoji: '🏠' })).status).toBe(201)
    expect((await partner.req('POST', `/api/v1/families/${fam}/invitations`, { email: 'x@example.com' })).status).toBe(403)

    const members = await owner.req('GET', `/api/v1/families/${fam}/members`)
    expect(members.body.members.map((m: { role: string }) => m.role).sort()).toEqual(['owner', 'parent'])
  })
})

describe('legacy list import format', () => {
  it('accepts the bundled videos.json and the gist document format, dropping invalid entries', async () => {
    const { parseLegacyList, LEGACY_EMOJI } = await import('../scripts/import-list.ts')
    const { readFileSync } = await import('node:fs')
    const seed = parseLegacyList(JSON.parse(readFileSync(new URL('../../../web/public/videos.json', import.meta.url), 'utf8')))
    expect(seed).toHaveLength(65)
    expect(Object.keys(LEGACY_EMOJI).length).toBeGreaterThan(5)
    const doc = parseLegacyList({ version: 2, videos: [{ id: 'aaaaaaaaaaa', title: 't', category: 'c', hidden: true }, { id: 'bad', title: 't', category: 'c' }] })
    expect(doc.map((v) => v.id)).toEqual(['aaaaaaaaaaa'])
  })
})

describe('family export and deletion', () => {
  it('exports only this family, without secrets; deletion needs the owner and the exact name, and removes everything', async () => {
    const owner = new Client(h)
    await owner.signIn(ADMIN_EMAIL)
    const fam = (await owner.req('POST', '/api/v1/families', { name: 'Export Family' })).body.id
    const cat = await owner.req('POST', `/api/v1/families/${fam}/categories`, { name: 'Songs', emoji: '🎵' })
    await owner.req('POST', `/api/v1/families/${fam}/videos`, { url: 'kkkkkkkkkkk', categoryId: cat.body.id })
    const kid = await owner.req('POST', `/api/v1/families/${fam}/profiles`, { name: 'Zeynep' })
    const pair = await owner.req('POST', `/api/v1/families/${fam}/devices`, { kidProfileId: kid.body.id, name: 'Tab' })
    await owner.req('PUT', `/api/v1/families/${fam}/pin`, { pin: '1357' })

    const exp = await owner.req('GET', `/api/v1/families/${fam}/export`)
    expect(exp.status).toBe(200)
    expect(exp.headers['content-disposition']).toMatch(/attachment; filename="kiddietube-export-family-/)
    expect(exp.body).toMatchObject({ format: 'kiddietube-family-export', family: { name: 'Export Family' } })
    expect(exp.body.videos.map((v: { youtubeId: string }) => v.youtubeId)).toEqual(['kkkkkkkkkkk'])
    expect(exp.body.devices[0]).not.toHaveProperty('keyHash')
    const text = JSON.stringify(exp.body)
    expect(text).not.toContain(pair.body.deviceKey)
    expect(text).not.toContain('scrypt$')
    expect(text).not.toContain('aaaaaaaaaaa') // another family's video

    // a non-owner parent can export but not delete
    const inv = await owner.req('POST', `/api/v1/families/${fam}/invitations`, { email: 'coparent@example.com' })
    const co = new Client(h)
    await co.signUp('coparent@example.com')
    await co.req('POST', `/api/v1/invitations/${inv.body.id}/accept`)
    expect((await co.req('GET', `/api/v1/families/${fam}/export`)).status).toBe(200)
    expect((await co.req('DELETE', `/api/v1/families/${fam}`, { confirmName: 'Export Family' })).status).toBe(403)

    expect((await owner.req('DELETE', `/api/v1/families/${fam}`, { confirmName: 'export family' })).status).toBe(400)
    expect((await owner.req('DELETE', `/api/v1/families/${fam}`, { confirmName: 'Export Family' })).status).toBe(204)

    // everything is gone, including rows only visible across families
    const { withSystem } = await import('../db/context.ts')
    const left = await withSystem(h.db.db, async (tx) => ({
      videos: (await tx.select().from(s.video).where(sql`family_id = ${fam}`)).length,
      devices: (await tx.select().from(s.device).where(sql`family_id = ${fam}`)).length,
      audit: (await tx.select().from(s.auditLog).where(sql`family_id = ${fam}`)).length,
      members: (await tx.select().from(s.member).where(sql`organization_id = ${fam}`)).length,
    }))
    expect(left).toEqual({ videos: 0, devices: 0, audit: 0, members: 0 })
    expect((await new Client(h).req('GET', '/api/v1/feed', undefined, { authorization: `Device ${pair.body.deviceKey}` })).status).toBe(401)
    expect((await owner.req('GET', '/api/v1/me')).body.families.some((f: { id: string }) => f.id === fam)).toBe(false)
  })
})
