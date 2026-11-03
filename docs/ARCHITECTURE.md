# Kiddie Tube — Architecture

How the system fits together. Decisions and their reasons are in
[adr/](adr/); the plan and progress in [ROADMAP.md](ROADMAP.md).

## Two builds of one web app

| | GitHub Pages build | Server mode (`kids.tinyapps.dev`) |
|---|---|---|
| Build flags | default (`BASE_PATH=/KiddieTube/`) | `VITE_SERVER_MODE=true BASE_PATH=/` |
| Families | one | many, isolated |
| Data | bundled `videos.json`, device cache, optional GitHub Gist sync | Kiddie Tube API + PostgreSQL |
| Parent UI | pop-up panel (`components/ParentPanel.tsx`) | parent console pages (`src/parent/`) |

The kids' experience (grid, player, categories, themes, language) is shared.

## Components

```
 Kid's device (installed PWA)                        Home server (Ubuntu, systemd)
┌──────────────────────────────────────┐  HTTPS   ┌──────────────────────────────────────┐
│ Service worker: app shell + fonts    │◀────────▶│ nginx  kids.tinyapps.dev             │
│ Kids' page  ─ reads ─▶ stored feed   │          │   /        static apps/web/dist      │
│   (localStorage: pairing, feed,      │          │   /api/*   → 127.0.0.1:3007          │
│    theme, language, speed)           │          │                                      │
│ Parent console (lazy-loaded)         │          │ kiddietube.service (Fastify, Node 20)│
│ YouTube iframe (youtube-nocookie) ───┼──▶ YouTube│   Better Auth · Drizzle · zod        │
└──────────────────────────────────────┘          │ PostgreSQL 16  (db + role kiddietube)│
                                                   └──────────────────────────────────────┘
```

## Repository

| Path | What |
|---|---|
| `apps/web/src/App.tsx` | kids' page; routes to the console in server mode |
| `apps/web/src/components/` | player (`YouTubeWrapper`), grid, banners, legacy parent panel |
| `apps/web/src/parent/` | parent console pages (server mode) |
| `apps/web/src/server/` | API client, device pairing + offline feed sync |
| `apps/web/src/lib/` | themes, i18n, legacy store, hooks |
| `apps/api/src/app.ts` | Fastify app: plugins, auth mount, routes |
| `apps/api/src/routes/` | `families` (members, invites, admin, export/delete), `content` (categories, videos, kids, devices, PIN), `feed` |
| `apps/api/src/db/` | Drizzle schema, client (Postgres/PGlite), family context |
| `apps/api/migrations/` | SQL migrations (`0001_rls.sql` = row-level security) |
| `packages/shared/` | zod schemas + types shared by web and API |
| `deploy/` | systemd unit, nginx, `deploy.sh`, runbook |

## Tenancy and security model

- **Family = Better Auth organization.** Every family-owned table carries
  `family_id`.
- **Two layers of isolation.** Routes check membership (`requireMember`), then
  run queries inside `withFamily(db, familyId, …)`, which sets
  `app.family_id` for the transaction. **Forced row-level security** makes
  PostgreSQL itself hide and refuse other families' rows, even for a query
  without a `WHERE` clause. Tests prove both layers (and fail if RLS is
  bypassed).
- The API **refuses to start** as a superuser/BYPASSRLS database role, since
  RLS wouldn't apply.
- `withSystem()` (cross-family) is used only to resolve a device key and for
  instance-admin lists (names and sizes, never content).
- **Parents:** email + password (Better Auth), HttpOnly session cookies,
  rate-limited sign-in, password reset by email. **Invite-only** sign-up.
- **Kids:** no accounts. A device is **paired** to a kid profile; it holds a
  random 256-bit key (stored server-side only as SHA-256) and sends it as
  `Authorization: Device <key>`. Revoking stops it immediately.
- **Parent PIN:** scrypt-hashed; 5 misses lock it for 5 minutes. Gates the
  console on kids' devices.
- **Instance admin** (`ADMIN_EMAILS`) invites people to create their *own*
  family and is not a member of it.
- Every change is written to `audit_log` and bumps the family's feed version.
- nginx sets CSP (self + YouTube only), HSTS etc.; the API adds helmet
  headers, rate limits, uniform errors without stack traces, and redacts
  credentials from logs.

## Key flows

**Pairing a device:** a parent signs in on the kid's device → Kids → *Use this
device* → `POST /families/:id/devices` returns the key once → stored with the
pairing on the device → first feed sync.

**Offline-first feed:** the kids' page renders the stored feed immediately,
then `GET /api/v1/feed` with `If-None-Match` (4 s timeout) on open, on return
to the foreground and every 10 minutes. `304` = unchanged; `401` = revoked
(device shows "set up this device"); unreachable = keep using the stored
copy. Videos stream from YouTube, so a sleeping home server doesn't affect
playback.

**Updates:** the service worker downloads a new version in the background and
the app shows *"New version — Update"*; nothing changes until tapped.

## Testing

| Suite | Runs | Where |
|---|---|---|
| Web unit (Vitest, jsdom) | data logic, themes, i18n | `apps/web/src/**/*.test.ts` |
| API integration (Vitest + PGlite, RLS enforced) | auth, isolation, content, devices/feed, PIN, members, export/delete, config | `apps/api/src/**/*.test.ts` |
| E2E, GitHub Pages build (Playwright) | desktop Chrome, Android Chromium, iPhone WebKit; YouTube stubbed | `apps/web/e2e/` |
| E2E, server mode | real API + server-mode build: setup → pairing → offline | `apps/web/e2e-server/` |

CI runs all of them on every PR and before every deploy of the GitHub Pages
build.
