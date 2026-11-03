// Types and validation shared by the web app and the API.
// Every request body the API accepts is parsed with one of these schemas.
import { z } from 'zod'

/* ---------------------------------------------------------------- */
/* YouTube                                                           */
/* ---------------------------------------------------------------- */

export const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/

export const youtubeId = z.string().regex(YOUTUBE_ID_RE, 'Not a YouTube video id')

/** Extract an 11-char YouTube video id from a URL, embed code, or bare id. */
export function parseYouTubeId(input: string): string | null {
  if (!input) return null
  const s = input.trim()
  if (YOUTUBE_ID_RE.test(s)) return s
  const patterns = [
    /youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|embed\/|shorts\/|live\/|v\/)([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /[?&]v=([A-Za-z0-9_-]{11})/,
  ]
  for (const re of patterns) {
    const m = s.match(re)
    if (m && m[1]) return m[1]
  }
  return null
}

/* ---------------------------------------------------------------- */
/* Primitives                                                        */
/* ---------------------------------------------------------------- */

export const id = z.string().min(1).max(64)
const name = z.string().trim().min(1).max(80)
const emoji = z.string().trim().min(1).max(16)
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #rrggbb colour')

export const THEME_IDS = ['sunny', 'ocean', 'candy', 'classic'] as const
export const themeId = z.enum(THEME_IDS)
export type ThemeId = z.infer<typeof themeId>

export const ROLES = ['owner', 'parent'] as const
export const role = z.enum(ROLES)
export type Role = z.infer<typeof role>

/* ---------------------------------------------------------------- */
/* Entities (as returned by the API)                                 */
/* ---------------------------------------------------------------- */

export const category = z.object({
  id,
  name,
  emoji,
  color: color.nullable(),
  sortOrder: z.number().int(),
})
export type Category = z.infer<typeof category>

export const video = z.object({
  id,
  youtubeId,
  title: z.string().max(300),
  channel: z.string().max(200).nullable(),
  categoryId: id.nullable(),
  hidden: z.boolean(),
  status: z.enum(['ok', 'unavailable']),
  createdAt: z.string(), // ISO
})
export type Video = z.infer<typeof video>

export const kidProfile = z.object({
  id,
  name,
  avatar: emoji.nullable(),
  defaultTheme: themeId.nullable(),
  /** Categories this profile sees; empty = all categories. */
  categoryIds: z.array(id),
})
export type KidProfile = z.infer<typeof kidProfile>

export const device = z.object({
  id,
  name,
  kidProfileId: id,
  createdAt: z.string(),
  lastSeenAt: z.string().nullable(),
  revoked: z.boolean(),
})
export type Device = z.infer<typeof device>

export const family = z.object({ id, name, role })
export type Family = z.infer<typeof family>

/* ---------------------------------------------------------------- */
/* Request bodies                                                    */
/* ---------------------------------------------------------------- */

export const createCategoryBody = z.object({ name, emoji, color: color.nullable().optional() })
export const updateCategoryBody = createCategoryBody.partial().extend({ sortOrder: z.number().int().optional() })
export const reorderBody = z.object({ ids: z.array(id).min(1).max(500) })

export const createVideoBody = z.object({
  /** A YouTube link or bare id. */
  url: z.string().trim().min(1).max(500),
  title: z.string().trim().max(300).optional(),
  categoryId: id.nullable().optional(),
})
export const updateVideoBody = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  categoryId: id.nullable().optional(),
  hidden: z.boolean().optional(),
})
export const importVideosBody = z.object({
  urls: z.array(z.string().trim().min(1).max(500)).min(1).max(500),
  categoryId: id.nullable().optional(),
})

export const createKidProfileBody = z.object({
  name,
  avatar: emoji.nullable().optional(),
  defaultTheme: themeId.nullable().optional(),
  categoryIds: z.array(id).max(200).optional(),
})
export const updateKidProfileBody = createKidProfileBody.partial()

export const pairDeviceBody = z.object({ kidProfileId: id, name })
export const setPinBody = z.object({ pin: z.string().regex(/^\d{4,8}$/, 'PIN must be 4–8 digits').nullable() })
export const verifyPinBody = z.object({ pin: z.string().min(1).max(8) })
export const createFamilyBody = z.object({ name })
export const inviteBody = z.object({ email: z.string().trim().email().max(200), role: role.default('parent') })

/* ---------------------------------------------------------------- */
/* Device feed: everything a paired device needs to work offline     */
/* ---------------------------------------------------------------- */

export const feed = z.object({
  /** Opaque version; changes whenever anything in the feed changes. */
  version: z.string(),
  generatedAt: z.string(),
  profile: z.object({ id, name, avatar: emoji.nullable(), defaultTheme: themeId.nullable() }),
  categories: z.array(category),
  videos: z.array(video.omit({ hidden: true, status: true })),
})
export type Feed = z.infer<typeof feed>

export const pairResult = z.object({
  device: device,
  /** Returned once; the device stores it. Sent as `Authorization: Device <key>`. */
  deviceKey: z.string(),
})
export type PairResult = z.infer<typeof pairResult>

/* ---------------------------------------------------------------- */
/* Errors                                                            */
/* ---------------------------------------------------------------- */

export const apiError = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
})
export type ApiError = z.infer<typeof apiError>

export const API_PREFIX = '/api/v1'
