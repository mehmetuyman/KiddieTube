// One-time import of an existing Kiddie Tube list (the GitHub Pages version's
// Gist, or a videos.json file) into ONE family.
//
//   npm run import -w @kiddietube/api -- --family <familyId> --file ../web/public/videos.json [--dry-run]
//   GIST_TOKEN=... npm run import -w @kiddietube/api -- --family <familyId> --gist <gistId> [--dry-run]
//
// Categories are created with the emoji the old app showed; each video keeps
// its added date (so newest-first order is preserved) and hidden flag.
// Videos already in the family are skipped, so it is safe to re-run.
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { YOUTUBE_ID_RE } from '@kiddietube/shared'
import { eq } from 'drizzle-orm'
import { loadConfig } from '../config.ts'
import { openDb } from '../db/client.ts'
import { withFamily } from '../db/context.ts'
import * as s from '../db/schema.ts'
import { touch } from '../http/context.ts'
import { newId } from '../lib/crypto.ts'

/** The emoji the original app showed for its categories. */
export const LEGACY_EMOJI: Record<string, string> = {
  'Eğitim / Education': '🎓',
  'İslami İçerikler / Islamic Content': '🕌',
  'Tarım ve Bahçe / Agriculture & Gardening': '🌱',
  'Çocuk Şarkıları / Kids Songs': '🎵',
  'Su Sistemleri / Water Systems': '💧',
  'Çocuk Çizgi Film / Kids Cartoons': '🎬',
  'Gıda ve El İşi / Food & DIY': '🍴',
  'Sağlık ve Günlük Bilgiler / Health & Everyday Tips': '💊',
}

interface LegacyVideo {
  id: string
  title: string
  category: string
  channel?: string
  addedAt?: string
  hidden?: boolean
}

export function parseLegacyList(raw: unknown): LegacyVideo[] {
  const list = Array.isArray(raw) ? raw : (raw as { videos?: unknown })?.videos
  if (!Array.isArray(list)) throw new Error('Not a Kiddie Tube list (expected an array or { videos: [...] })')
  return list.filter(
    (v): v is LegacyVideo =>
      !!v && typeof v.id === 'string' && YOUTUBE_ID_RE.test(v.id) && typeof v.title === 'string' && typeof v.category === 'string',
  )
}

async function readSource(file?: string, gist?: string): Promise<unknown> {
  if (file) return JSON.parse(readFileSync(file, 'utf8'))
  if (!gist) throw new Error('Pass --file <path> or --gist <id>')
  const token = process.env.GIST_TOKEN
  const res = await fetch(`https://api.github.com/gists/${gist}`, {
    headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (!res.ok) throw new Error(`Gist read failed (${res.status})`)
  const files = (await res.json()).files as Record<string, { content: string; truncated?: boolean; raw_url?: string }>
  const f = files['kiddietube-videos.json'] ?? Object.values(files)[0]
  if (!f) throw new Error('The gist has no files')
  const content = f.truncated && f.raw_url ? await (await fetch(f.raw_url)).text() : f.content
  return JSON.parse(content)
}

async function main() {
  const { values } = parseArgs({
    options: { family: { type: 'string' }, file: { type: 'string' }, gist: { type: 'string' }, 'dry-run': { type: 'boolean' } },
  })
  if (!values.family) throw new Error('--family <familyId> is required (see the Settings page URL or /api/v1/me)')
  const videos = parseLegacyList(await readSource(values.file, values.gist))
  const categoryNames = [...new Set(videos.map((v) => v.category))]
  console.log(`Source: ${videos.length} videos in ${categoryNames.length} categories.`)

  const config = loadConfig()
  const handle = await openDb(config.DATABASE_URL, { migrate: !config.DATABASE_URL?.startsWith('postgres') })
  try {
    const [fam] = await handle.db.select({ name: s.organization.name }).from(s.organization).where(eq(s.organization.id, values.family))
    if (!fam) throw new Error(`No family with id ${values.family}`)
    console.log(`Target family: ${fam.name}${values['dry-run'] ? ' (dry run: nothing will be written)' : ''}`)

    const summary = await withFamily(handle.db, values.family, async (tx) => {
      const existingCats = await tx.select().from(s.category)
      const existingVids = new Set((await tx.select({ y: s.video.youtubeId }).from(s.video)).map((r) => r.y))
      const catId = new Map(existingCats.map((c) => [c.name, c.id]))
      let createdCats = 0
      let order = existingCats.reduce((m, c) => Math.max(m, c.sortOrder), -1)
      for (const name of categoryNames) {
        if (catId.has(name)) continue
        const id = newId('cat_')
        catId.set(name, id)
        createdCats++
        if (!values['dry-run']) await tx.insert(s.category).values({ id, familyId: values.family!, name, emoji: LEGACY_EMOJI[name] ?? '📺', sortOrder: ++order })
      }
      let added = 0
      let skipped = 0
      for (const v of videos) {
        if (existingVids.has(v.id)) {
          skipped++
          continue
        }
        existingVids.add(v.id)
        added++
        if (values['dry-run']) continue
        const when = v.addedAt && !Number.isNaN(Date.parse(v.addedAt)) ? new Date(v.addedAt) : undefined
        await tx.insert(s.video).values({
          id: newId('vid_'),
          familyId: values.family!,
          youtubeId: v.id,
          title: v.title,
          channel: v.channel ?? null,
          categoryId: catId.get(v.category) ?? null,
          hidden: v.hidden === true,
          ...(when ? { createdAt: when, updatedAt: when } : {}),
        })
      }
      if (!values['dry-run']) await touch(tx, values.family!, null, 'import', 'video', null, { added, skipped, createdCats })
      return { createdCats, added, skipped }
    })
    console.log(`Categories created: ${summary.createdCats}. Videos added: ${summary.added}. Already present (skipped): ${summary.skipped}.`)
  } finally {
    await handle.close()
  }
}

// run only as a script (not when imported by tests)
if (process.argv[1] && /import-list\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(`Import failed: ${(e as Error).message}`)
    process.exit(1)
  })
}
