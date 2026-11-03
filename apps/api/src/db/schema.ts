// Domain schema. Families are Better Auth "organizations" (see auth-schema.ts);
// every family-owned table carries family_id, and PostgreSQL row-level
// security (migrations/0001_rls.sql) restricts rows to the family set for the
// current transaction (see db/context.ts).
import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { organization, user } from './auth-schema.ts'

export * from './auth-schema.ts'

const familyId = () =>
  text('family_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' })
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const category = pgTable(
  'category',
  {
    id: text('id').primaryKey(),
    familyId: familyId(),
    name: text('name').notNull(),
    emoji: text('emoji').notNull(),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('category_family_idx').on(t.familyId)],
)

export const video = pgTable(
  'video',
  {
    id: text('id').primaryKey(),
    familyId: familyId(),
    youtubeId: text('youtube_id').notNull(),
    title: text('title').notNull(),
    channel: text('channel'),
    categoryId: text('category_id').references(() => category.id, { onDelete: 'set null' }),
    hidden: boolean('hidden').notNull().default(false),
    status: text('status', { enum: ['ok', 'unavailable'] }).notNull().default('ok'),
    addedBy: text('added_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('video_family_youtube_uq').on(t.familyId, t.youtubeId),
    index('video_family_idx').on(t.familyId),
  ],
)

export const kidProfile = pgTable(
  'kid_profile',
  {
    id: text('id').primaryKey(),
    familyId: familyId(),
    name: text('name').notNull(),
    avatar: text('avatar'),
    defaultTheme: text('default_theme', { enum: ['sunny', 'ocean', 'candy', 'classic'] }),
    /** false = only the linked categories (kid_profile_category), possibly none. */
    allCategories: boolean('all_categories').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('kid_profile_family_idx').on(t.familyId)],
)

/** The categories a restricted kid profile (all_categories = false) sees. */
export const kidProfileCategory = pgTable(
  'kid_profile_category',
  {
    familyId: familyId(),
    kidProfileId: text('kid_profile_id')
      .notNull()
      .references(() => kidProfile.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => category.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.kidProfileId, t.categoryId] })],
)

export const device = pgTable(
  'device',
  {
    id: text('id').primaryKey(),
    familyId: familyId(),
    kidProfileId: text('kid_profile_id')
      .notNull()
      .references(() => kidProfile.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** sha256 of the device key; the key itself is only ever shown once. */
    keyHash: text('key_hash').notNull(),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('device_key_hash_uq').on(t.keyHash), index('device_family_idx').on(t.familyId)],
)

export const parentPin = pgTable('parent_pin', {
  familyId: text('family_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  pinHash: text('pin_hash').notNull(),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  /** How many times it has locked since the last correct PIN (lock time doubles each time). */
  lockouts: integer('lockouts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
})

/** Bumped on every change to a family's content; devices sync by it. */
export const familyState = pgTable('family_state', {
  familyId: text('family_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  feedVersion: integer('feed_version').notNull().default(1),
})

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    familyId: familyId(),
    userId: text('user_id'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    details: jsonb('details'),
    at: timestamp('at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('audit_family_at_idx').on(t.familyId, t.at)],
)

/**
 * Instance-level invitation to create a NEW family (sent by an instance
 * admin). Sign-up is invite-only: an email can register if it has an unused
 * family invite or a pending invitation into an existing family. The admin
 * does not become a member of the families they invite.
 */
export const familyInvite = pgTable(
  'family_invite',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('family_invite_email_idx').on(t.email), uniqueIndex('family_invite_token_uq').on(t.tokenHash)],
)

/** Family-owned tables protected by row-level security. */
export const FAMILY_TABLES = [
  'category',
  'video',
  'kid_profile',
  'kid_profile_category',
  'device',
  'parent_pin',
  'family_state',
  'audit_log',
] as const
