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
- **Security review fixes** (`docs/CODE_REVIEW_2026-11-03_multi-family.md`):
  - The parent-PIN gate on kids' devices actually asks for the PIN, and fails
    closed (K1).
  - Pairing signs the parent out on the kid's device (K2).
  - Sign-up confirms the email address; admin rights need a confirmed
    address and follow `ADMIN_EMAILS` live (H1, L6).
  - Real client IPs behind Cloudflare; spoofed `X-Forwarded-For` is ignored
    (H2).
  - Parallel PIN guesses can't race the lockout (H3).
  - Bulk import: YouTube lookups outside DB transactions, 4 at a time, at most
    50 links, longer timeouts (M1).
  - Accepting an invitation is atomic; one membership per person per family
    (M2, migration `0003`).
  - Sign-in returns to the invitation page (M3).
  - The nightly check stops instead of hiding everything when YouTube
    throttles (M4).
  - Unpairing or re-pairing revokes the old device key (M5).
  - Smaller fixes L1–L12: empty updates are 400, duplicate races are 409,
    single-escaped emails, no inline script (CSP), dedicated service user,
    and more.
  - Deploy: `.env` is no longer sourced by bash (K3); restore notes (L7).
- **Review round 2** (`docs/CODE_REVIEW_2026-11-03_multi-family_round2.md`):
  - On a kid's device every return to the kids' page signs the parent out
    (R2-1).
  - Sign-up takes no password: the password is chosen from the emailed link,
    so nobody can register someone else's address with a password they know
    (R2-4, stronger than the suggested fix). Unfinished sign-ups are removed
    after a week.
  - The dev outbox needs `DEV_OUTBOX=true` (refused in production) and answers
    only this machine (R2-2).
  - Import shows only our own error messages (R2-3); deploy and comment nits
    (R2-5, R2-6).
- **Review round 3** (`docs/CODE_REVIEW_2026-11-03_multi-family_round3.md`):
  - Kid profiles have an explicit "all categories" setting (migration `0004`).
    Deleting a restricted kid's last category, or choosing none, means **no
    videos**, never all; the console warns and names affected kids (R3-1).
  - At most one password-link email per address every 2 minutes, from sign-up
    and "forgot password" (R3-2).
  - Password-link tokens and invitation ids are masked in API and nginx logs
    (R3-3), including `/parent?next=…` (R3-6) and nginx's error log for
    password links when the API is down (R3-7).
  - Runbook for a Cloudflare Origin certificate + "Full (strict)", and an
    optional firewall-rule printer (R3-4, owner action).
  - The console signs out when its page closes on a paired device (R2-7);
    nits (R3-5).
- **Easier first setup:** "Set up this device" opens the Kids page with a short
  guide (add a kid, then "Use this device"; warns when there are no videos),
  and signing in returns to the page it was opened on. Password fields have a
  show/hide (eye) button, and choosing a password asks for it twice.
- **Turkish and English everywhere,** chosen per device (defaults to the
  device language; switchable in the console header, Settings, and the
  on-device panel's Theme tab): kids' page, parent console, on-device parent
  panel, server error messages, and emails (sent in the language of the
  device that triggered them).
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
