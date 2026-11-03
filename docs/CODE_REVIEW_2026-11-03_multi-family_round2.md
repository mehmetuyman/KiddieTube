# Code review, round 2: `feature/multi-family`

- **Verifies:** commit `280e744` "fix: address code review 2026-11-03", against [CODE_REVIEW_2026-11-03_multi-family.md](CODE_REVIEW_2026-11-03_multi-family.md) and its resolution table.
- **Checks run:**
  - `npm run typecheck`, `npm run lint`: clean.
  - `npm test`: API 41/41 (incl. the new `[K1] [H1] [H3] [M2] [M4] [L1–L3]` tests), web 40/40.
  - `npm run test:e2e:server`: 3/3, incl. the K1/K2 PIN and sign-out flow, and sign-up through the emailed confirmation link.
  - A GitHub Pages build (`BASE_PATH` default): `theme-prepaint.js` is emitted as `/KiddieTube/theme-prepaint.js` and is in the service worker's precache, so the L4 change works on both builds.
  - I did not run the GitHub-Pages Playwright suite (`npm run test:e2e`).

**Verdict: all 23 round-1 findings are fixed. Fix R2-1 before the phone test**, because it reopens K2 in normal use. R2-2 is recommended; the rest can follow.

---

## Part A: verification of round 1

| ID | Status | Notes |
|---|---|---|
| K1 | **Fixed** | New device-authorised `GET /api/v1/device/pin`. The gate fails closed (offline or other errors show a message). Covered by API and e2e tests. |
| K2 | **Fixed for pairing**, see **R2-1** | Pairing signs the parent out and reloads to the kids' page. A later sign-in on the same device still stays. |
| K3 | **Fixed** | `deploy.sh` reads only `DATABASE_URL`; migrations run with `node --env-file`; `EMAIL_FROM` is quoted in `env.example`. |
| H1 | **Fixed** | `requireEmailVerification`, no auto sign-in, confirmation email in TR/EN. Admin = confirmed email in `ADMIN_EMAILS`, worked out per request. A small leftover is noted as R2-4. |
| H2 | **Fixed** | Cloudflare real-IP snippet, `X-Forwarded-For $remote_addr` (overwritten), `TRUST_PROXY=127.0.0.1` (`true` refused), Better Auth reads `x-real-ip` only. |
| H3 | **Fixed** | `SELECT … FOR UPDATE` inside the verify transaction. The test fires 20 parallel guesses. |
| M1 | **Fixed** | Lookups happen outside transactions, 4 at a time; one short transaction per insert; 50-link cap (shared constant); 2-minute client timeout; 120 s nginx location. See R2-3 for error messages. |
| M2 | **Fixed** | Migration `0003` dedupes, then adds a unique index. Accept uses a conditional `UPDATE … WHERE status='pending' RETURNING` plus `ON CONFLICT DO NOTHING`. |
| M3 | **Fixed** | `?next=` is carried through sign-in. `nextPath` accepts only same-app paths (`/…`, not `//…`). |
| M4 | **Fixed** | Circuit breaker: with ≥10 checked and >20% newly unavailable, nothing is written and the run exits non-zero. |
| M5 | **Fixed** | Unpair and re-pair revoke the previous key (best effort). |
| L1–L3 | **Fixed** | Non-empty refinements; unique violation → 409; the family name is escaped once. |
| L4 | **Fixed (different approach, fine)** | External `theme-prepaint.js`; the CSP no longer has `'unsafe-inline'` for scripts. |
| L5 | **Fixed** | Dedicated `kiddietube` user, `ProtectSystem=strict`, extra hardening. |
| L6 | **Fixed** | Via H1. The `is_admin` column is unused but kept; OK. |
| L7–L12 | **Fixed** | Restore docs, the Get-started "done" flag, `Join` navigates in an effect, a confirm before removing the PIN, index keys + deduped links, and `useResource` drops stale responses. Settings now reuses it. |

---

## Part B: new findings

### R2-1. [High] A parent who signs in again on a kid's device stays signed in for 30 days

- `apps/web/src/parent/ParentConsole.tsx:65` (the logo goes back to `/`) and `:191` ("Kids view")
- `apps/web/src/App.tsx` (`KidsPage`)

K2 is fixed for the moment of pairing. But the documented way to manage the family *from* a kid's device is: long-press → PIN → **sign in**. Leaving the console through "Kids view" or the logo only calls `navigate('/')`; the session stays for the full 30 days. From then on the child can open `/parent` (bookmark, back button, URL bar), or long-press and enter nothing if no PIN is set, and is inside the console signed in as the parent. That is the K2 problem again, through the normal "change something on the tablet" flow.

`ARCHITECTURE.md` now says "a kid's device holds only its device key", which is only true until the next sign-in there.

**Fix:** on a **paired** device, the parent session must not outlive the console visit.
- **Simplest robust option:** in `KidsPage`, when `SERVER_MODE && getPairing()`, call `authApi.signOut()` once on mount (silently; it's a no-op without a session). Every way back to the kids' page then ends the parent session: Kids view, the logo, a reload, the back button or reopening the app.
- Optionally also sign out from the console's "Kids view" before navigating, and show a short "Signed out on this device" note there.
- Add an e2e step: on a paired device, sign in through the PIN → "Kids view" → open `/parent` → the sign-in screen is shown.

### R2-2. [Medium] The dev outbox endpoint publishes password-reset and confirmation links without auth

`apps/api/src/app.ts:119-120`

`GET /api/v1/dev/outbox` is registered whenever `NODE_ENV !== 'production'` and `RESEND_API_KEY` is unset. It returns every captured email, including **password-reset and email-confirmation URLs**, to anyone. Production is safe (`NODE_ENV=production` in the unit). But a staging or dev instance reachable from the network (the README mentions an optional staging database) with `NODE_ENV` left at its default `development` and no Resend key lets anyone take over any account by requesting a reset and reading the link.

**Fix:** require an explicit opt-in, e.g. `DEV_OUTBOX=true` in config (refused in production by `loadConfig`, like `FAKE_YOUTUBE_META`), set only by the e2e and dev scripts. Optionally also answer only requests from loopback.

### R2-3. [Low] Bulk import shows raw database errors to the parent

`apps/api/src/routes/content.ts:256` and `:275`

Both catch blocks report `(e as Error).message` for **any** error. For a non-`HttpError`, e.g. the chosen category deleted by another parent in the middle of the import (foreign-key violation), or the database restarting, that is Drizzle's `Failed query: insert into "video" … params: …`, which then appears in the console's results list.

**Fix:** use the message only for `HttpError`. Otherwise log the error and use the translated `'Something went wrong'`.

### R2-4. [Low] Unconfirmed squatted accounts still block the real owner

`apps/api/src/auth.ts` (sign-up hook + `emailVerification.sendOnSignIn: true`)

After H1, nobody can *use* someone else's address. But anyone can still register an invited address first, unconfirmed. The real person then gets "an account with this email already exists" at sign-up, and must find "forgot password" on the sign-in page to recover. Also, whoever set that password can make the server re-send confirmation emails to the victim on every sign-in attempt (rate-limited, but still mail in someone else's inbox).

**Fix (pick one):**
- When sign-up hits an existing **unconfirmed** account, replace it (delete the stale user and create the new one).
- Or at least make the console's error say "check your email or use Forgot password", and delete unconfirmed accounts older than the confirmation link's lifetime (24 h), e.g. in the nightly job.

### R2-5. [Nit] A missing `DATABASE_URL` triggers the rollback before the friendly message

`deploy/deploy.sh`

Under `set -o pipefail`, if `.env` has no `DATABASE_URL` line, the `grep` in `DATABASE_URL=$(grep … | …)` fails and the `ERR` trap rolls back before the friendly `[ -n "$DATABASE_URL" ] || log …` line runs. Append `|| true` inside the substitution so the check and its message are reached.

### R2-6. [Nit] Doc comment above the wrong function

`apps/web/src/server/device.ts:85`

The comment "Ask the server whether `pin` is this family's parent PIN" now sits above `revokeDevice`'s comment, not above `verifyPinWithDevice`. Move it down.

---

## Resolution (2026-11-03)

| ID | Fix | Test |
|---|---|---|
| R2-1 | On a paired device, the kids' page ends any parent session when it opens (`endParentSessionOnKidsDevice`), so every way back (Kids view, logo, reload, back button, reopening the app) signs the parent out. Opening the console from the kids' page waits for that sign-out, so the PIN leads to the sign-in screen. `ARCHITECTURE.md` updated. | server e2e: right PIN → sign-in screen; sign in → Kids view → `/parent` shows sign-in. Fails with the fix disabled. |
| R2-2 | `/api/v1/dev/outbox` exists only with `DEV_OUTBOX=true` (refused in production by `loadConfig`) and no Resend key, and answers only loopback clients. Set by the server e2e config; README dev command shows it. | config test |
| R2-3 | Import results use the message only for `HttpError`; anything else is logged and reported as the translated "Something went wrong". | API `[R2-3]` (category deleted mid-import → FK error not shown) |
| R2-4 | **Stronger than suggested.** While fixing it I found a worse variant: a squatter registers an invited (or the admin) address **with a password they choose**; the owner then receives a genuine confirmation email, and clicking it would confirm an account whose password the squatter knows. So sign-up no longer takes a password at all: `POST /api/v1/signup` (invite-only, rate-limited) creates the account with a random password and sends a "choose your password" link (Better Auth's reset flow, which keeps `next`). `onPasswordReset` marks the address confirmed; unconfirmed accounts can't sign in. Signing up again for an existing address just sends a fresh link, so nothing is blocked. Better Auth's own `/sign-up/*` and `/verify-email` are closed (404). Unfinished sign-ups are removed after a week by the nightly job. | API `[H1, R2-4]` (direct sign-up closed; squatter can't sign in; owner signs up again and finishes), `[R2-4]` prune; server e2e signs up through the emailed link |
| R2-5 | `\|\| true` inside the substitution; verified that a `.env` without `DATABASE_URL` reaches the message instead of the rollback. | manual bash check |
| R2-6 | Comment moved above `verifyPinWithDevice`. | — |
