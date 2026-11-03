# Changelog

All notable changes. Versions follow [semantic versioning](https://semver.org/).

## 3.0.0 — unreleased

The multi-family, self-hosted version (`kids.tinyapps.dev`, "server mode").
The GitHub Pages build keeps working as before.

### Added
- **Server mode:** Kiddie Tube API (Fastify, PostgreSQL, Better Auth) and a
  parent console.
  - **Families** fully isolated, by both the API and PostgreSQL row-level
    security. New families start empty.
  - **Invite-only parent accounts:** password reset by email; co-parents
    invited by email; owner and parent roles.
  - **Kid profiles**, each optionally limited to chosen categories, with a
    default theme.
  - **Device pairing:** a kid's device is linked to a profile, and can be
    revoked if lost.
  - **Offline-first kids' page:** it keeps working when the server is down.
  - **Parent PIN,** checked by the server, with lockout after repeated misses.
  - **Categories** with emoji and ordering. **Videos:** add by link (title
    looked up on the server), bulk import, hide, edit, delete.
  - **Family data export and permanent deletion.**
  - **Instance admin:** invite families; see family names and sizes, never
    their content.
  - **One-time import** of the existing list (Gist or `videos.json`) into
    one family.
- **"New version — Update" banner:** updates wait for a tap.
- **Turkish/English kids' page,** chosen from the device language and
  switchable per device.
- **Deployment for the home server:** systemd unit, nginx with CSP,
  `deploy.sh` with a pre-migration backup, health check and automatic
  rollback, and a runbook.
- **Quality:** ESLint; unit tests (web), integration tests (API, RLS
  enforced) and end-to-end tests on desktop Chrome, Android and iPhone
  WebKit, plus a server-mode end-to-end suite. CI on every PR; deploys
  gated on CI.

### Changed
- npm workspaces: `apps/web`, `apps/api`, `packages/shared`.
- Fonts bundled; Bootstrap and Google Fonts CDNs removed. A computed-style
  comparison showed the look unchanged.
- YouTube player uses privacy-enhanced mode (`youtube-nocookie.com`).
- Build base path is configurable (`BASE_PATH`).

### Fixed
- The pause-screen image path no longer depends on the `/KiddieTube/` base.
- Installed app now caches its fonts for offline use.

## 2.2.1 — 2026-09-30

### Fixed
- iOS: player buttons stopped responding after leaving fullscreen by
  rotating back to portrait.

## 2.2.0 — 2026-09-30

### Added
- Newest videos first; hide/unhide videos; playback speed; four themes
  (Sunny default, Ocean, Candy, Classic); pinned compact header and
  category bar; slim landscape bar.

### Fixed
- Deep-review fixes: Gist sync data loss, CI deploy, PWA manifest,
  iOS fullscreen/rotation, overlays covering the top bar, long-press text
  selection, and more (see mehmetuyman/KiddieTube#1).
