# Code review: `feature/multi-family` (v3.0.0, server mode)

- **Branch:** `feature/multi-family`, local only (no upstream). 23 commits on top of `master` (`d85f289`), from `3cbfa5a` to `0dfab63`. The working tree is clean.
- **Size:** 108 files, +19,523 / −2,512. Most of that is the lockfile and the Drizzle snapshots.
- **Reviewed in depth:**
  - **API:** the whole `apps/api` package (app, auth, config, DB client/context/schema, migrations + RLS, routes, scripts).
  - **Shared:** `packages/shared`.
  - **Server-mode web:** `App.tsx`, `server/*`, `router.ts`, all of `parent/*`, PWA config, `UpdateBanner`.
  - **Deployment:** `deploy/*` (nginx, systemd, `deploy.sh`, env, DB setup), CI workflows.
  - **Skimmed:** the legacy GitHub-Pages panel changes (mostly translated strings) and the player changes (`youtube-nocookie`, translated statuses).
- **Checks:** `npm run typecheck`, `npm run lint` and `npm test` all pass (API 33 tests, web 38 tests). I did not run the Playwright suites.

**Verdict: not ready to deploy.** Fix the 3 critical and 3 high findings first. The architecture is sound and well done (see "Strong points" at the end); most issues are at the edges of it: the PIN flow, sign-up and deployment.

Each finding has a file:line reference, a concrete scenario and a suggested fix. IDs are stable so the fix commits can reference them (e.g. `[review K1]`).

---

## Critical

### K1. The parent PIN is never asked: the "is a PIN set?" probe fails and fails open

- `apps/web/src/App.tsx:204-217` (`openParentConsole`)
- `apps/api/src/routes/content.ts:377` and `packages/shared/src/index.ts:129` (`verifyPinBody = { pin: z.string().min(1).max(8) }`)

On a paired device, a logo long-press first calls `verifyPinWithDevice('')` to learn whether a PIN is set. The route parses the body **before** anything else, and `''` fails `min(1)`, so the API answers **400** `validation_failed`. `request()` throws `ApiRequestError(400)`. The `catch` only stops on `429`; for everything else it falls through to `navigate('/parent')`. So:

1. **With a PIN set, the console opens without asking for it.** Every time.
2. Any other failure (500, offline, timeout) also opens the console. The comment assumes "offline" is the only case.

No test covers the device-side PIN flow: `api.test.ts` only verifies non-empty PINs, and `e2e-server/setup-flow.spec.ts` doesn't use a PIN.

**Fix:**
- Don't probe with `''`. Add a device-authorised `GET …/pin` (or reuse `GET /pin` with device auth) that returns `{ set }`, then prompt.
- Make the gate **fail closed**: open the console only on `{ ok: true }`. Offline and other errors should show a message.
- Add an e2e test: PIN set → long-press → prompt shown → wrong PIN refused → right PIN opens.

### K2. Pairing leaves the parent signed in on the kid's device, so the PIN gates nothing

- `apps/web/src/parent/FamilyPages.tsx:466-474` (`pairThisDevice`)
- `apps/web/src/App.tsx:52` (any path other than `/` renders the console)
- `apps/web/src/parent/ParentConsole.tsx` (no PIN check anywhere)

The documented flow is: a parent **signs in on the kid's device** → Kids → "Use this device". After pairing, the parent's Better Auth session cookie stays on that device for **30 days** (`auth.ts` `expiresIn`). The PIN is only checked in the kids' page long-press handler (K1). The console itself never checks it, and the API only needs the session cookie.

So even with K1 fixed, a child can reach full parent access by:
- opening `/parent` directly: the browser URL bar, a bookmark, or the "Kids view" → back button;
- calling the API with the cookie.

Full access means adding any YouTube video, changing or removing the PIN (any parent can, `content.ts:352`), inviting, exporting, or revoking devices.

**Fix (pick one, deliberately):**
- **(preferred)** After a successful pairing, **sign the parent out on that device** (`authApi.signOut()`) and say so ("This device now shows N's videos. Sign in again to manage the family."). The PIN then guards only the entry to the sign-in screen, which is fine.
- Or enforce the PIN for the console on paired devices. Client-only enforcement can't really protect a signed-in session, so it would need a short-lived server-issued "PIN unlocked" flag that `requireMember` checks for sessions on paired devices, which is much more work.

Document the chosen model in `ARCHITECTURE.md`. Today it says the PIN "gates the console on kids' devices", which isn't true.

### K3. `deploy.sh` always rolls back: sourcing `.env` fails on `EMAIL_FROM`

- `deploy/deploy.sh:54`: `set -a; . "$APP/.env"; set +a`
- `deploy/env.example:16`: `EMAIL_FROM=Kiddie Tube <noreply@tinyapps.dev>`

Bash parses `<…>` as redirections. I reproduced it:
`bash -c 'set -a; . ./env.example'` gives `line 16: syntax error near unexpected token 'newline'`.

Under `set -euo pipefail`, the failed `.` hits the `ERR` trap, so **every deploy runs the rollback** right after building. Even if it didn't abort, variables after line 16 (`ADMIN_EMAILS`, `TRUST_PROXY`, `LOG_LEVEL`) would not be set for the migration step. systemd's `EnvironmentFile=` parses the same file fine, which is why the problem doesn't show at runtime.

**Fix:**
- Quote it in `env.example` (`EMAIL_FROM="Kiddie Tube <noreply@tinyapps.dev>"`; systemd accepts double quotes) and note in `deploy/README.md` that values with spaces must be quoted.
- Better: don't source `.env` in bash at all. Read only `DATABASE_URL`, e.g. `DATABASE_URL=$(grep -E '^DATABASE_URL=' "$APP/.env" | cut -d= -f2-)`, and let `npm run db:migrate` load the rest through `loadConfig()` (or `node --env-file`).

---

## High

### H1. No email verification: anyone can claim the instance-admin address, or any invited address

- `apps/api/src/auth.ts:20-22` (`mayRegister`: admin emails may always register)
- `apps/api/src/auth.ts:98-102` (`isAdmin` set from the email at sign-up)
- `emailAndPassword` has no `requireEmailVerification`

Sign-up never proves that the person owns the email.

- **Admin takeover window:** from the first deploy until the owner signs up, **anyone** who knows or guesses `ADMIN_EMAILS` (it's the owner's public Gmail) can open `/join`, register that address, and become **instance admin** permanently. They could then invite families, see all family names and sizes, and keep the account. A later password reset by the real owner revokes their sessions, but the admin actions already happened.
- **Invite squatting:** any address with a pending invitation can be registered by someone else. They can't accept without the invitation id or token from the email, but they block the real person ("user already exists") until that person resets the password.

**Fix:** turn on email verification for sign-up (`emailAndPassword.requireEmailVerification: true` plus `emailVerification.sendVerificationEmail` through the existing mailer). Then:
- grant `isAdmin` only to verified accounts (check `emailVerified` in `requireAdmin`), **or** bootstrap the admin with a CLI script instead of public sign-up;
- let invitation acceptance and family creation require `emailVerified`.

Also see L6 (`isAdmin` is never revoked).

### H2. Client IPs can be spoofed, so rate limits are weak, and behind Cloudflare they are shared

- `apps/api/src/app.ts:30`: `trustProxy: config.TRUST_PROXY` (default `true`, meaning trust **every** hop)
- `deploy/nginx/kiddietube.conf:31`: `X-Forwarded-For $proxy_add_x_forwarded_for`
- `apps/api/src/auth.ts` `ipAddressHeaders: ['x-real-ip', 'x-forwarded-for']`

1. nginx **appends** to whatever `X-Forwarded-For` the client sent. With `trustProxy: true`, Fastify's `req.ip` is the **leftmost**, client-supplied entry. A client that sends a random `X-Forwarded-For` on every request gets a new identity each time, which bypasses the global `@fastify/rate-limit` (300/min) and the 30/min limit on `/api/auth/*`. That also makes the PIN brute force in H3 cheaper.
2. Cloudflare is in front (`deploy/README.md:22`), so `$remote_addr`, and therefore `X-Real-IP`, is the **Cloudflare edge IP**. Better Auth's sign-in and reset limits then count per edge, not per visitor. One abuser can trip the limit for everyone routed through that edge, while rotating edges gets around it. `deploy/README.md:114-117` notes the real-IP setup as a to-do; it needs to be a deploy blocker.

**Fix:**
- nginx: `set_real_ip_from <Cloudflare ranges>; real_ip_header CF-Connecting-IP;` and set `proxy_set_header X-Forwarded-For $remote_addr;` (overwrite, don't append).
- API: `trustProxy: '127.0.0.1'` (or `1`), not `true`.
- Better Auth: use `x-real-ip` only.

### H3. Parallel PIN guesses bypass the lockout

`apps/api/src/routes/content.ts:385-406`

The verify handler reads `parent_pin` with a plain `SELECT`, spends tens of milliseconds in `scrypt`, then writes `failedAttempts = row.failedAttempts + 1`. At READ COMMITTED, N concurrent wrong guesses all read the same count and all write `count + 1`, so the 5-miss lockout never triggers. A 4-digit PIN is 10,000 guesses. The device key is in the kid's own `localStorage`, so the "attacker" here is a curious child with a script, and H2 removes the per-IP brake.

**Fix:** lock the row (`.for('update')` on the select inside the `withFamily` transaction), or count atomically (`UPDATE … SET failed_attempts = failed_attempts + 1 … RETURNING`) before comparing. Add a test that fires ~20 wrong guesses with `Promise.all` and expects a lock.

---

## Medium

### M1. Bulk import: YouTube lookups run inside DB transactions, and the client gives up after 8 s

- `apps/api/src/routes/content.ts:162-221` (`addVideo` calls `ctx.fetchMeta`, with a 5 s timeout, **inside** `withFamily`)
- `apps/web/src/parent/FamilyPages.tsx:241-250` (default `request` timeout of 8 s)
- `deploy/nginx/kiddietube.conf` (`proxy_read_timeout 30s`)

Up to 500 links are processed one by one, each with an outbound HTTP call while a pooled connection (`max: 10`) holds an open transaction. Pasting about 20 or more links means:
- the console shows "Can't reach the server right now" (the client timeout is reported as `offline`) while the server keeps importing;
- nginx cuts the response at 30 s, so the parent never sees the per-link results;
- two parents importing at once can starve the pool.

**Fix:**
- Fetch metadata **before** opening the transaction, with limited concurrency (e.g. 4).
- Cap a request at ~50 links, or make import a background job with a progress poll.
- Give this call a longer client timeout and a progress message.

### M2. Accepting an invitation isn't atomic or idempotent, and memberships can be duplicated

- `apps/api/src/routes/families.ts:181-190`
- `member` has no unique `(organization_id, user_id)` (`migrations/0000_init.sql:112`)

The status is read outside the transaction, and the `UPDATE … SET status='accepted'` isn't conditional. A double click, or two tabs, inserts **two** `member` rows. A user who is already a member but accepts a second invitation (owners can re-invite; the "already a member" check runs only when the invite is sent) also gets a duplicate. Duplicates break the member list, the "last owner" check (`families.ts:201-205`) and `/me`.

**Fix:**
- Add a unique index on `member(organization_id, user_id)` in a new migration (dedupe first).
- In the transaction: `UPDATE invitation SET status='accepted' WHERE id=$1 AND status='pending' RETURNING …`; if no row comes back, return 404/409.
- Insert the member with `ON CONFLICT DO NOTHING`.

### M3. Existing users lose the invitation link when they sign in

`apps/web/src/parent/ParentConsole.tsx:363-384` (`Join`, `AcceptInvite`), and `SignUpForm`'s "I have an account" link (`:351-356`)

A signed-out visitor on `/accept?invitation=…` or `/join?invite=…` sees **only** the sign-up form. An existing parent (e.g. a member of another family) clicks "have an account". That calls `navigate('/parent')`, which drops the query string. After signing in they land on `/parent/videos`, possibly with no family, and the invitation is never accepted unless they find the email again.

**Fix:** pass a return path, e.g. `navigate('/parent?next=' + encodeURIComponent(location.pathname + location.search))`, and have `SignIn` go there after success. Or offer sign-in on the accept and join pages themselves.

### M4. The nightly check can hide a whole library when YouTube throttles

`apps/api/src/scripts/check-videos.ts:27`

`403` is treated as a definite "unavailable". YouTube also answers **403** (and sometimes 401) when it rate-limits or blocks a server IP. One bad night can mark every video unavailable, which empties every kid's feed until the next successful run.

**Fix:** add a circuit breaker. If more than, say, 20% of the checked ids (or more than N in a row) come back unavailable, abort without writing and log loudly. Optionally require two consecutive nights before flipping `ok → unavailable`.

### M5. Unpairing doesn't revoke the key, and re-pairing leaves the old device active

- `apps/web/src/parent/SettingsPages.tsx:283-296` ("Unpair this device" only calls `clearPairing()`)
- `FamilyPages.tsx:466-474` (pairing again overwrites the local key without revoking the previous device)

The server-side device stays valid, and the Devices page lists several active devices for one physical device. The parent is signed in at that moment, so both are easy to fix: call `POST …/devices/:id/revoke` for `getPairing().deviceId` before clearing or re-pairing (ignore 404).

---

## Low and nits

- **L1. Empty update body gives a 500.** `PATCH …/categories/:id` with `{}` reaches `tx.update(...).set({})`, so Drizzle throws "No values to set" and the client gets "Something went wrong". Refine `updateCategoryBody` (`packages/shared/src/index.ts:100`) to require at least one field, or answer 400. (The video PATCH always sets `updatedAt`, so it isn't affected.)
- **L2. Duplicate-video race gives a 500, not a 409.** `addVideo` checks, then inserts (`content.ts:165-184`). Two concurrent adds of the same link hit `video_family_youtube_uq`. Catch the unique violation and return `conflict('That video is already in the list')`.
- **L3. Family names are double-escaped in invite emails.** `emails.memberInvite` passes `` `Join ${esc(family)}` `` / `` `${esc(family)} ailesine katılın` `` as the title, and `layout()` escapes it again (`email.ts:142-146, 214, 225`), so "Ali & Ayşe" shows as `Ali &#38; Ayşe`. Pass the raw name to `layout`.
- **L4. CSP allows inline scripts.** `script-src … 'unsafe-inline'` exists only for the theme pre-paint snippet in `index.html`. Replace it with that script's `'sha256-…'` hash, which can be generated at build time.
- **L5. The service has write access to its own code.** It runs as `ubuntu` with `ReadWritePaths=/opt/kiddietube` (`deploy/kiddietube.service`), so a compromised API process could change its own code. The API needs no write access in production (Postgres, not PGlite). Use a dedicated system user, drop `ReadWritePaths` (or point it at an empty data dir), and add `ProtectSystem=strict`.
- **L6. Admin rights are never revoked.** `isAdmin` is decided once at sign-up (`auth.ts:101`) and stored. Removing an address from `ADMIN_EMAILS` doesn't revoke it. Derive it at request time from `config.adminEmails` (plus `emailVerified`, see H1) in `requireAdmin`.
- **L7. A failed deploy rolls back the code but not the database.** Migrations were already applied (`deploy.sh` rollback). The pre-deploy dump exists, so mention in `deploy/README.md` how to restore it, and make future migrations backward-compatible with the previous release.
- **L8. "Get started" keeps loading everything.** It loads 5 full lists (incl. all videos) on **every** console navigation, forever (`GetStarted.tsx:23-41`). Stop once all steps are done (remember that per family in `localStorage`), or add a small `GET …/summary` endpoint.
- **L9. `Join` navigates during render** (`ParentConsole.tsx:370`). Move it into an effect.
- **L10. One click removes the PIN.** With the PIN field empty, the button reads "Remove PIN" and removes it without confirmation (`SettingsPages.tsx:173-203`). Ask first.
- **L11. Duplicate React keys in import results.** They are keyed by `r.url` (`FamilyPages.tsx:262`), so a link pasted twice produces duplicate keys. Use the index, or dedupe the links before sending.
- **L12. Pages can show another family's data briefly.** `useResource` / `useLoad` don't clear data or ignore stale responses when `familyId` changes (`FamilyPages.tsx:20-36`, `SettingsPages.tsx:13-29`). For a moment, or after a slow response, a page can show the previous family's data.

---

## Strong points (keep these)

- **Two-layer tenancy that is actually enforced.** Every family table has `FORCE`d RLS keyed on a transaction-local setting (`set_config(..., true)`). The API refuses to start as a superuser or `BYPASSRLS` role. PGlite tests switch to a non-superuser role, so RLS is really exercised. Cross-family ids passed in request bodies are checked with `assertCategories` and the profile lookup, so foreign keys can't be used to link another family's rows.
- **Secrets are stored and sent correctly:**
  - Device keys and family-invite tokens are 256-bit random values, stored only as SHA-256.
  - PINs use scrypt with a per-PIN salt and a timing-safe compare.
  - Exports omit key and PIN hashes.
  - Logs redact `authorization`, `cookie` and `set-cookie`.
- **CSRF defence in depth:** `SameSite=Lax` cookies, Better Auth `trustedOrigins`, and an Origin check on state-changing `/api/v1` calls.
- **Offline-first sync is clean:** stored feed first, ETag/304, a 4 s timeout, `401` means unpaired, and other errors keep the stored copy.
- **Clear, honest docs:** ADRs, architecture and the deploy runbook. Test coverage of isolation, members, devices and export/delete is good; K1 and H3 are the gaps.

---

## Resolution (2026-11-03)

All findings are addressed on the same branch. Tests were added where a test
can show the fix; the K1 (end-to-end) and H3 (API) tests were checked by
re-introducing the bug and seeing them fail.

| ID | Fix | Test |
|---|---|---|
| K1 | New `GET /api/v1/device/pin` (device key) answers `{ set }`; the kids' page prompts only when set and opens the console only on a positive answer (offline/errors show a message). | API `[K1]`; server e2e: wrong PIN stays, right PIN opens, offline refuses |
| K2 | Preferred option: pairing signs the parent out on that device (and says so). Model documented in `ARCHITECTURE.md`. | server e2e: after pairing `/parent` shows sign-in |
| K3 | `deploy.sh` no longer sources `.env`: it reads only `DATABASE_URL`; migrations run with `node --env-file`. `env.example` quotes `EMAIL_FROM`; README notes quoting. | `bash -n`; manual parse check |
| H1 | `requireEmailVerification` + confirmation email (TR/EN); unconfirmed accounts can't sign in; the link signs in and returns to the invitation page. Admin = confirmed email in `ADMIN_EMAILS`, checked per request. | API `[H1]`; server e2e signs up through the emailed link |
| H2 | nginx: Cloudflare real-IP snippet (`CF-Connecting-IP` from CF ranges only), `X-Forwarded-For $remote_addr`. API: `TRUST_PROXY` defaults to `127.0.0.1` and refuses `true`. Better Auth uses `x-real-ip` only. | config test |
| H3 | `SELECT … FOR UPDATE` on `parent_pin` inside the verify transaction. | API `[H3]` (20 parallel guesses; fails without the fix) |
| M1 | Lookups before any transaction, 4 at a time; one short transaction per insert; max 50 links (shared constant, checked in the console too); 2-minute client timeout; nginx 120 s for the import route. | API `[L1, L2, M1]` |
| M2 | Migration `0003` dedupes and adds unique `member(organization_id, user_id)`; accept = conditional `UPDATE … WHERE status='pending' RETURNING` + `ON CONFLICT DO NOTHING`. | API `[M2]` (parallel + repeat accept) |
| M3 | "Sign in" from the join/accept pages carries `?next=`; sign-in returns there (same-app paths only). | web unit `router.test.ts` |
| M4 | Circuit breaker: with ≥10 checked and >20 % newly unavailable, nothing is written and the run exits non-zero. | API `[M4]` |
| M5 | Unpair and re-pair revoke the previous device key (best effort). | — (console action; covered by the e2e pairing path) |
| L1 | Update bodies must contain at least one field (400). | API |
| L2 | Unique violation on insert → 409. | API (parallel adds) |
| L3 | Raw family name passed to `layout()`. | API `[L3]` |
| L4 | **Different approach:** the pre-paint script moved to `public/theme-prepaint.js` (precached), so the CSP drops `'unsafe-inline'` for scripts with no hash to keep in sync. | web unit (no inline `<script>`) |
| L5 | Service and nightly check run as a dedicated `kiddietube` system user; `ProtectSystem=strict`, no writable paths, more systemd hardening. | — |
| L6 | See H1 (admin derived per request; the `is_admin` column is now unused, kept to avoid a migration for nothing). | API `[H1]` |
| L7 | README "Restore": code rolls back, DB doesn't; migrations stay backward-compatible; how to restore the pre-deploy dump. | — |
| L8 | The checklist remembers completion per family and stops loading. | — |
| L9 | `Join` navigates in an effect. | — |
| L10 | Removing the PIN asks first. | — |
| L11 | Import results keyed by index; links are de-duplicated before sending. | — |
| L12 | `useResource` clears data on family change and ignores stale responses; Settings reuses it. | — |
