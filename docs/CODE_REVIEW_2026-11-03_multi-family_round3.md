# Code review, round 3: `feature/multi-family`

- **State reviewed:** `e783728` (after the round-1 and round-2 fixes). The working tree has only the reviewer's edit to the round-2 doc.
- **Earlier rounds:** [round 1](CODE_REVIEW_2026-11-03_multi-family.md), [round 2](CODE_REVIEW_2026-11-03_multi-family_round2.md). Everything in them is resolved, except R2-7, an optional nit that is carried over below.
- **Scope:** a fresh pass over the whole branch as it stands now, focused on behaviour that only shows up at runtime. Suspicions were confirmed by running a real app in memory (`createHarness()` + `app.inject`, scripts outside the repo, nothing committed).
- **Checks run:**
  - `npm run typecheck`, `npm run lint`: clean.
  - `npm test`: API 43/43, web 40/40.
  - `npm run test:e2e:server`: 3/3.
  - `npx playwright test` (GitHub Pages build): 26 passed, 4 skipped.

**Verdict: fix R3-1 before families start using kid profiles.** It is a content-control bug in a kids' app. The rest is low priority. The phone test can go ahead meanwhile, since R3-1 doesn't affect it unless you delete categories.

Use IDs `[review R3-n]` in commit messages and tests, as before.

---

## Confirmed by probing (no change needed)

- **The R2-4 sign-up block can't be bypassed through path tricks.** `POST` to `/api/auth/sign-up/email`, `//sign-up/email`, `sign-up%2Femail`, `SIGN-UP/email`, `./sign-up/email`, `x/../sign-up/email` and `sign-up/email/` all return 404, and the "squatter" can't sign in afterwards. (Better Auth doesn't route the variants the regex lets through.) The `databaseHooks` invite-only check remains a second layer.
- The new `next` handling (`/api/v1/signup`, `nextPath`) only produces same-app paths. A `/\evil.com`-style value can't navigate away: `history.pushState` refuses cross-origin URLs.

---

## High

### R3-1. Deleting a restricted kid's last allowed category gives that kid every category

- `apps/api/migrations/0000_init.sql`: `kid_profile_category.category_id … ON DELETE cascade`
- `apps/api/src/routes/feed.ts:26-29`: `const restrict = allowed.length > 0 // no rows = everything`
- Same rule in `apps/api/src/routes/content.ts` (`setProfileCategories`) and in the console: `apps/web/src/parent/strings.ts:128` "(none selected = all)"

A kid profile is "restricted" only while it has at least one `kid_profile_category` row. Deleting a category cascades away its link rows, so a profile whose only allowed category is deleted ends up with **zero rows, which means unrestricted**. I reproduced it:

```
profile "Baby" allowed: [Toddler songs]
feed before:  categories [Toddler songs]
DELETE the "Toddler songs" category
feed after:   categories [Teen stuff], videos [bbbbbbbbbbb, aaaaaaaaaaa]
```

The toddler's tablet now shows the teenager's category, plus every uncategorised video, including the ones that were just "Toddler songs". No parent saw a warning. The same thing happens in the console when a parent unticks the last chip, meaning "this kid should see nothing for now", and saves: the profile silently becomes "everything".

**Fix:**
1. Make restriction explicit. Add `kid_profile.all_categories boolean NOT NULL DEFAULT true`. In the migration, set it to `false` for every profile that currently has rows.
2. In the feed: `if (!profile.allCategories)`, show only linked categories (possibly none). Zero rows with `allCategories = false` means an **empty** feed, not everything.
3. API and shared schema: `createKidProfileBody` / `updateKidProfileBody` take `allCategories`. The feed and the profile list return it.
4. Console (`EditProfile`): a clear "All categories" toggle. When it's off, the chips choose; with none chosen, show "This kid will see no videos". The profile list shows "No categories" instead of "All categories".
5. Category delete: when profiles lose their last category, return or show a notice ("Baby now sees no videos").
6. Tests:
   - API: a restricted profile, delete its only category → the feed has no categories and no videos.
   - API: `PATCH` with `categoryIds: []` and `allCategories: false` → empty feed.
   - Web or e2e: the "none selected" warning.

---

## Low

### R3-2. `/api/v1/signup` can flood an address with "choose your password" emails

`apps/api/src/routes/families.ts:35-51`

The route is rate-limited to 10 requests per minute **per client IP**. It calls `ctx.auth.api.requestPasswordReset` on the server side, which skips Better Auth's own per-request limits. For any address that may register (the admin address, which is public, or any invited address), anyone can trigger a fresh email every 6 seconds from each IP they control. That spams the person and burns the Resend quota, which you share with EmlakPro.

**Fix:** a per-address cooldown. Before calling `requestPasswordReset`, check whether a reset token for that user was created within the last ~2 minutes (the `verification` table, `identifier` = `reset-password:<token>` with `value` = user id, or simply a small `last_link_sent_at` column). If so, skip sending but still answer `{ sent: true }`, so nothing is revealed.

### R3-3. Password-link tokens end up in logs

The "choose your password" and reset links are `GET /api/auth/reset-password/<token>?callbackURL=…`. The token sits in the **path**, so it is written to nginx's access log and to Fastify's request log (`req.url`). Tokens are valid for an hour, and the logs are readable by the server's admin users. The same applies to `/join?invite=<token>` in the nginx log.

**Fix:**
- nginx: `location ^~ /api/auth/reset-password/ { access_log off; … }` (keep the `proxy_*` lines) and the same for `= /join`; or a `log_format` that drops the path for these.
- Fastify: a `serializers.req` that replaces `/reset-password/<anything>` with `/reset-password/[token]` and drops query strings on `/join` and `/accept`.

### R3-4. [Ops] Cloudflare doesn't authenticate the origin, and the origin is reachable directly

`deploy/README.md:22-24`

SSL mode **Full** with a self-signed origin certificate means Cloudflare accepts *any* certificate from the origin, so the Cloudflare-to-home-server leg isn't protected against interception. Also, nothing documents that port 443 only accepts Cloudflare. A visitor who finds the home IP can skip Cloudflare entirely (no WAF or DDoS protection; the real-IP snippet then just uses their own address, which is fine).

**Fix:**
- Install a free **Cloudflare Origin CA** certificate on nginx and switch the zone to **Full (strict)**. This affects `tinyapps.dev` too, so check the other apps.
- Optionally firewall 443 to Cloudflare's IP ranges (`ufw` rules generated from the same list as `kiddietube-cloudflare-realip.conf`), or use Authenticated Origin Pulls.

---

## Nits

- **R3-5.** `apps/api/src/routes/families.ts:28`: the `/** The signed-in parent and the families they belong to. */` comment now sits above the **signup** route's comment instead of above `GET /api/v1/me`. Move it down (the same slip as R2-6). In the same file, `../lib/i18n.ts` is imported twice (`langOf`, then `INVITE_ONLY`); merge the two imports.
- **R2-7 (carried over).** On a paired device, the parent session ends only when the kids' page loads. A console left open in a normal browser tab, or closed without going back, keeps the session until the kids' page next opens. Optionally sign out on `pagehide` from the console when `getPairing()` is set (`navigator.sendBeacon` to `/api/auth/sign-out`).

---

## Not issues (checked, recorded so they aren't re-raised)

- The kids' page sends one `POST /api/auth/sign-out` per launch on paired devices. Several kids' devices behind one home IP stay far below the 30/min limit on `/api/auth/*`.
- `pruneUnfinishedAccounts` can't remove a real parent: unconfirmed accounts can't sign in, so they can't be members, owners or inviters. Foreign keys only null `video.added_by` / `family_invite.invited_by`, or cascade sessions.
- Hardened systemd units: `PrivateTmp=true` gives `tsx` a writable temp directory under `ProtectSystem=strict`.
- The import route's nginx `location ~` takes precedence over the `/api/` prefix as intended. It doesn't include the header snippet, which is fine for JSON (helmet sets API headers).
- Export by any parent (not just owners) includes member emails and the audit log. That's an acceptable product choice; mention it in the privacy text if you write one.

---

## Resolution (2026-11-03)

| ID | Fix | Test |
|---|---|---|
| R3-1 | `kid_profile.all_categories` (migration `0004`; profiles that have category rows become restricted; the UPDATE runs with `app.system` on because the table has forced RLS). The feed restricts by the flag, and restricted with no categories means an empty feed. The API takes and returns `allCategories`; for older clients, a non-empty `categoryIds` restricts and an empty one keeps the current mode. Deleting a category returns `{ emptiedProfiles }`; the console alerts with the names. `EditProfile` has an "All categories" checkbox, and when it's off with none picked, a "will see no videos" warning; the list says "No categories: sees no videos". | API: delete last category → empty feed + `emptiedProfiles`; PATCH `[]` with and without the flag; **migration statements run as the app role under RLS** (fails without the system-mode line). Server e2e: the warning appears and disappears. |
| R3-2 | `linkRecentlySent()`: if a `reset-password:*` verification row for the user is under 2 minutes old, nothing is sent and the usual answer is returned. Applied to `/api/v1/signup` **and** Better Auth's `request-password-reset` ("forgot password", same abuse). | API: 5 sign-ups + 3 resets → 1 email |
| R3-3 | API: the request log serializer logs only method, masked URL, host and IP (`redactUrl`: `/reset-password/[token]`, the query strings of `/join`, `/accept`, `/reset-password`). nginx: `log_format kiddietube_redacted` with a `map` of the same masks and no Referer (same-origin Referers would repeat the URLs). | unit `logging.test.ts`; runtime check: an injected request's log line has no token |
| R3-4 | Owner action, documented: "Cloudflare origin hardening" in `deploy/README.md` (Origin CA certificate for all tinyapps.dev server blocks → Full (strict)), plus `deploy/cloudflare-ufw.sh`, which **prints** ufw rules from the same ranges as the real-IP snippet. A comment in `kiddietube.conf` points there. | — |
| R3-5 | Comment moved above `GET /api/v1/me`; the i18n imports are merged. | — |
| R2-7 | The console registers a `pagehide` handler on paired devices that sends a sign-out beacon. Side effect, documented in ARCHITECTURE: on a kid's device, reloading the console (e.g. switching its language) asks for the password again. | server e2e: console reload → sign-in screen (fails with the handler disabled). The story now waits 10 s before its third sign-in, because Better Auth limits sign-ins per client. |

**Also corrected:** the round-1 resolution said the H3 test fails without the fix. Re-checked on the full suite, it doesn't, because PGlite runs one transaction at a time. The round-1 file has a correction note. The R3-1 migration check above was run on the full suite.
