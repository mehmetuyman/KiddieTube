# Kiddie Tube — Roadmap: multi-family, self-hosted

Status: **in progress** — Phases 0–1 done; 2–4 partly (see checklists); go-live waits on DNS + Resend (§8) · Owner: Mehmet · Last updated: 2026-11-03

This document is the plan for moving Kiddie Tube from a single-family static
site (GitHub Pages + a GitHub Gist) to a small, self-hosted, multi-family
application at **`https://kids.tinyapps.dev`**, built to a professional
standard. It's the source of truth for the phases below; tick tasks off as
they land.

---

## 1. Goals

1. **Self-hosted** on the home server, at the subdomain `kids.tinyapps.dev`.
2. **Multiple families**, fully isolated. A new family starts **empty**: it
   never sees another family's lists, the bundled default list, or anyone's
   customisations.
3. **Works when the server is down.** The home server can be unplugged; an
   installed app must keep playing the family's list. Updates arrive when the
   server is back, with an "update available" prompt.
4. **Professional quality**: tests, CI, reviewed PRs, migrations, backups,
   monitoring, security basics, documentation.

**Non-goals (for now):** public sign-up, native app-store apps, payments.

### Keep running meanwhile
The current GitHub Pages site (`mehmetuyman.github.io/KiddieTube/`) keeps
working unchanged until the new one is live and the family has moved over.
After that it's retired, and the repo can be made private.

---

## 2. Decisions

| Topic | Decision | Why |
|---|---|---|
| Address | `kids.tinyapps.dev` (subdomain) | Separate browser origin from the other `tinyapps.dev` apps: storage, cookies and scripts can't leak between apps. Simpler PWA scope. |
| Email | Resend, from `noreply@tinyapps.dev` | Same provider and pattern as EmlakPro (`src/lib/email.ts`). Needs `tinyapps.dev` verified in Resend. |
| Name | Kiddie Tube | Kept. Note: YouTube's API/branding terms discourage names confusable with YouTube; low risk for private use, revisit before any wider release. Name lives in config/manifest. |
| Frontend | Vite + React + TypeScript, installable PWA | Offline-first app that must run without its server; a single-page app is the right fit (not Next.js). |
| API | Fastify + TypeScript (Node 20) | Small memory footprint (~60–80 MB) on a 2-core / 3.7 GB box already running three Next.js apps. |
| Database | PostgreSQL 16 (existing), Drizzle ORM; PGlite for dev/tests | Already on the server; Drizzle for first-class PGlite + SQL-first RLS (ADR-0002, replaces Prisma). Own DB + own DB user. |
| Auth | Better Auth (email + password, email codes / magic link, passkeys; organization plugin) | Framework-agnostic, works with Fastify + Prisma; organizations map to families + roles + invitations. |
| Tenancy | One shared database, every row scoped by `familyId`, enforced in the API **and** by PostgreSQL row-level security | A few families with small lists; far simpler than database-per-tenant (EmlakPro's choice, which suits it). |
| Hosting | systemd service + nginx, **no Docker** | Matches every other app on the server. |
| Deploy | `deploy.sh` (pull → `npm ci` → test → build → migrate → restart → health check → rollback on failure); later a self-hosted GitHub runner | Consistent with `update-projects`, with guard rails. |
| Repo layout | npm workspaces: `apps/web`, `apps/api`, `packages/shared` | One repo, shared types/validation between web and API. |

---

## 3. Home server — conventions to follow

Observed on `ubuntu@192.168.0.28` (Ubuntu 24.04, 2 cores, 3.7 GB RAM, Node 20,
PostgreSQL 16, nginx, systemd, Uptime Kuma at `/status`).

| Item | Kiddie Tube value |
|---|---|
| Code | `/opt/kiddietube` (git clone) |
| Service | `kiddietube.service` (`User=ubuntu`, `EnvironmentFile=/opt/kiddietube/.env`, `Restart=on-failure`), enabled at boot |
| Port | next free, bound to **127.0.0.1** only (e.g. `127.0.0.1:3007`) |
| nginx | new `server` block for `kids.tinyapps.dev`: static web app from `apps/web/dist`, `/api/` proxied to the service |
| Database | `kiddietube` DB + `kiddietube` DB user (not the shared `crmuser`) |
| Staging | second instance: `kiddietube-staging.service`, DB `kiddietube_staging`, `kids-staging.tinyapps.dev` |
| Backups | add `pg_dump -Fc kiddietube` and `/opt/kiddietube/.env` to `/opt/server-configs/backup.sh` |
| Monitoring | Uptime Kuma HTTP check on `https://kids.tinyapps.dev/api/health` |
| Docs | rows in `/opt/COMMANDS.md`; unit + nginx config committed to `/opt/server-configs` |
| DNS | `kids` (and `kids-staging`) record in Cloudflare, proxied (orange cloud) |

### Server notes (outside this project — owner's call)
- Ports 3003–3006 and 5000 listen on all interfaces (reachable from the home
  network, bypassing nginx). Binding them to `127.0.0.1` closes that.
- nginx uses a self-signed certificate behind Cloudflare. A free Cloudflare
  Origin certificate + SSL mode "Full (strict)" makes the Cloudflare→home leg
  verified.
- `tinyapps.dev` points at the home IP via dynamic DNS (not a tunnel); keep
  the record proxied so the IP stays hidden.
- `backup.sh` wasn't in the user crontab; confirm it runs on a schedule.

---

## 4. Architecture

```
 Phone / tablet (installed PWA)                       Home server
 ┌────────────────────────────────┐   HTTPS   ┌───────────────────────────────┐
 │ App shell (precached)          │◀────────▶│ nginx  kids.tinyapps.dev      │
 │ Local store (IndexedDB):       │           │  ├─ /        → apps/web/dist  │
 │  family list, profile, device  │           │  └─ /api/    → Fastify :3007  │
 │  key, theme, speed             │           │                 │             │
 │ YouTube iframe (nocookie) ─────┼──▶ YouTube│           PostgreSQL 16       │
 └────────────────────────────────┘           └───────────────────────────────┘
```

### 4.1 Offline-first rules
1. The **app shell** is precached by the service worker; the app opens with
   no server.
2. The **family's list lives on the device** (IndexedDB). The app always
   renders from the local copy first, then syncs in the background with a
   short timeout (≈3 s). Server down → kids notice nothing; videos stream from
   YouTube.
3. **Devices are paired once** to a kid profile and keep a long-lived,
   revocable **device key**; watching never needs a login, online or offline.
4. **Parent edits need the server.** While it's unreachable, the parent
   console shows "Server offline — changes paused". (Offline edit queue: later,
   if wanted.)
5. **Updates:** a new app version shows a "New version — tap to update" banner
   on next open (service worker in prompt mode). Web Push (iOS 16.4+ for
   installed apps) is an optional extra later; it can't work while the server
   is down anyway.
6. List changes made by a parent reach devices on their next sync.

### 4.2 Data model (first cut)

| Table | Key fields |
|---|---|
| `family` | id, name, createdAt |
| `user` | id, email, name, passwordHash/passkeys (Better Auth tables) |
| `membership` | familyId, userId, role (`owner` \| `parent`) |
| `invitation` | familyId, email, role, token, expiresAt |
| `kid_profile` | id, familyId, name, avatar, defaultTheme |
| `device` | id, familyId, kidProfileId, name, keyHash, lastSeenAt, revokedAt |
| `category` | id, familyId, name, emoji, color, sortOrder |
| `video` | id, familyId, youtubeId, title, channel, durationSec, hidden, addedBy, createdAt, status (`ok` \| `unavailable`) |
| `video_category` | videoId, categoryId, sortOrder |
| `profile_access` | kidProfileId, categoryId (which categories a profile sees; empty = all) |
| `audit_log` | familyId, userId, action, entity, entityId, at, details |
| `parent_pin` | familyId, pinHash (argon2), failedAttempts, lockedUntil |

Every family-owned table carries `familyId`; PostgreSQL row-level security
policies restrict rows to the family in the request context.

### 4.3 API (v1, REST, OpenAPI-documented)
- `POST /api/v1/devices/pair` (parent session → device key for a kid profile)
- `GET  /api/v1/feed` (device key → the profile's categories + videos, ETag)
- `GET/POST/PATCH/DELETE /api/v1/videos`, `/categories`, `/profiles`, `/devices`
- `POST /api/v1/videos/import` (playlist URL or list of links)
- `GET  /api/v1/health`
- Auth routes from Better Auth (`/api/auth/*`)
- Instance admin: `/api/v1/admin/families`, `/admin/invitations`

All input validated with zod schemas from `packages/shared`.

---

## 5. Security & privacy
- HTTPS everywhere; HSTS; strict Content-Security-Policy allowing only the
  YouTube embed and API.
- Sessions in `HttpOnly; Secure; SameSite=Lax` cookies; CSRF protection on
  state-changing requests; rate limits on login, PIN and invitation endpoints.
- Passwords and PINs hashed with argon2id; lockout after repeated failures.
- Device keys stored hashed; revocable per device ("lost tablet").
- No GitHub tokens or any third-party secrets in the browser (replaces the
  current Gist sync).
- Kids have **no accounts and no personal data**; watch history (if added) is
  family-private and opt-in. Family export and delete.
- Privacy-enhanced embeds (`youtube-nocookie.com`); fonts bundled (no Google
  Fonts / Bootstrap CDN requests).
- Invite-only families; instance admin approves.

---

## 6. Engineering standards
- TypeScript `strict` everywhere; ESLint; consistent formatting.
- **Tests:** Vitest (unit), React Testing Library (components), Playwright
  end-to-end on Chromium **and WebKit**, phone portrait/landscape, rotation
  and fullscreen flows (the iOS bugs fixed in v2.2.x), with the YouTube API
  stubbed for deterministic runs.
- **CI on every PR:** lint, typecheck, unit, build, e2e. Dependency updates
  via Renovate/Dependabot; CodeQL scanning.
- **Releases:** semantic versions + `CHANGELOG.md`; `master` = production.
- **Ops:** health endpoint, structured logs (pino → journald), Uptime Kuma,
  error tracking (self-hosted GlitchTip, optional), nightly DB backups with a
  tested restore.
- **Docs:** `README.md`, `docs/ARCHITECTURE.md`, ADRs in `docs/adr/`, runbook
  `docs/RUNBOOK.md` (deploy, backup, restore, rotate secrets).

---

## 7. Phases

### Phase 0 — Foundations (no behaviour change)
- [x] Restructure into npm workspaces: current app → `apps/web`
- [x] Base path configurable at build time (`/KiddieTube/` for GitHub Pages,
      `/` for `kids.tinyapps.dev`)
- [x] ESLint (TypeScript + React hooks rules)
- [x] Vitest unit tests for the existing data logic (`videoStore`, `theme`)
- [x] Playwright e2e with stubbed YouTube: load, play, parent panel
      add/hide, themes, pinned bar, landscape→portrait fullscreen flow;
      Chromium + WebKit, phone sizes
- [x] CI workflow on PRs (lint, typecheck, unit, build, e2e)
- [ ] GitHub Pages deploy keeps working from the new layout (verify on merge)
- [x] This roadmap + ADR-0001 (stack decisions)

### Phase 1 — Server MVP (on a branch; current site stays live)
- [x] `apps/api`: Fastify, config, logging, health endpoint, error handling
- [x] Database schema + migrations (§4.2) — Drizzle + PGlite, see ADR-0002; row-level security policies
- [x] Better Auth: parent sign-in (email + password, reset by email), sessions
- [x] Families, memberships, kid profiles, device pairing + device keys
- [x] Categories and videos CRUD; YouTube metadata via oEmbed (server-side)
- [x] `packages/shared`: zod schemas + types used by web and API
- [x] Web: kid mode reads the device's local store; background sync with
      the API; "server offline" handling
- [x] Web: parent console as real pages (videos, categories, profiles,
      devices) replacing the pop-up panel
- [x] One-time import of the current family's list (from the Gist) into
      **our family only**
- [x] Server setup files: DB + user, `.env`, systemd unit, nginx server block,
      `deploy.sh` with health check + rollback (`deploy/`, prepared, not yet run)
- [ ] Go live at `kids.tinyapps.dev`; pair our devices (owner: DNS + Resend first)

### Phase 2 — Hardening
- [ ] Staging instance (`kids-staging.tinyapps.dev`)
- [ ] Backups in `backup.sh`; restore tested; Uptime Kuma check
- [x] Security headers / CSP, rate limits, audit log
- [x] "Update available" prompt; service worker caching review
- [ ] Player refactor into React components + hooks (no DOM lookups by id);
      component tests
- [ ] Stylesheet split per component (keep theme tokens)
- [x] Bundle fonts; drop Bootstrap CDN (verified: no visual change)
- [x] `docs/ARCHITECTURE.md`, runbook (`deploy/README.md`), `CHANGELOG.md`

### Phase 3 — Other families
- [x] Instance admin: invite families, list families (disable: not yet)
- [x] Invitations by email (Resend, `noreply@tinyapps.dev`)
- [x] Parent roles (owner / parent); member management
- [x] Turkish / English kids' UI (i18n; console still English); categories remain family-defined
- [x] Family data export + delete
- [x] Onboarding: 'Get started' checklist for an empty family
- [ ] Optional starter-pack suggestions (never copied from another family)

### Phase 4 — Extras (pick as needed)
- [x] Separate lists per kid profile (category restriction per profile)
- [ ] Screen-time limits and bedtime lock
- [ ] Parent-only watch history (opt-in)
- [x] Nightly check for deleted/private videos (`kiddietube-check.timer`)
- [ ] Playlist import (needs a YouTube Data API key)
- [ ] Play-through a category; cover YouTube end-screen suggestions
- [ ] Web Push for "new videos" / "update available"
- [ ] Self-hosted GitHub Actions runner → auto-deploy staging on merge

### Then
- [ ] Move all family devices to `kids.tinyapps.dev`
- [ ] Retire the GitHub Pages site; make the repo private

---

## 8. Owner to-dos (outside the code)
- [ ] Cloudflare: add `kids` (and later `kids-staging`) DNS records, proxied
- [ ] Resend: verify `tinyapps.dev`, so mail can come from
      `noreply@tinyapps.dev`
- [ ] Confirm `backup.sh` runs on a schedule
- [ ] Optional server hardening from §3 "Server notes"
