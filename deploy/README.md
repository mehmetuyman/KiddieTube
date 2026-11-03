# Deploying Kiddie Tube to the home server

Target: `https://kids.tinyapps.dev` on `ubuntu@192.168.0.28` (Ubuntu 24.04,
nginx, PostgreSQL 16, systemd), following the conventions of the other apps in
`/opt` (see `/opt/COMMANDS.md`). Nothing here runs automatically; each step is
done once by hand, then `deploy.sh` handles updates.

| Piece | Location on the server |
|---|---|
| Code | `/opt/kiddietube` (git clone) |
| Secrets | `/opt/kiddietube/.env` (from `deploy/env.example`, `chmod 600`) |
| API service | `kiddietube.service` → `127.0.0.1:3007`, runs as the `kiddietube` system user |
| Web app | `/opt/kiddietube/apps/web/dist` (static, served by nginx) |
| nginx | `/etc/nginx/sites-available/kiddietube` + `snippets/kiddietube-headers.conf` + `snippets/kiddietube-cloudflare-realip.conf` |
| Database | `kiddietube` DB, owned by the ordinary `kiddietube` user |
| Deploy log | `/var/log/kiddietube-deploy.log` |
| Nightly video check | `kiddietube-check.timer` → `journalctl -u kiddietube-check` |
| Pre-deploy DB backups | `/var/backups/kiddietube/` (last 5) |

## Before you start (owner)

1. **DNS:** done 2026-11-03: `kids` CNAME → `tinyapps.dev`, proxied. SSL/TLS
   mode is **Full** (the origin certificate is self-signed; "Full (strict)"
   would reject it).
2. **Email:** `tinyapps.dev` must show **Verified** in Resend (its DNS records
   are already in Cloudflare). Sign-up needs it: new accounts choose their
   password from a link sent by email.

## First-time setup

```bash
# 1. Code
sudo mkdir -p /opt/kiddietube && sudo chown ubuntu:ubuntu /opt/kiddietube
git clone git@github.com:mehmetuyman/KiddieTube.git /opt/kiddietube

# 2. Database: an ordinary role (the API refuses to start as a superuser,
#    because row-level security would not apply)
sudo -u postgres psql -v pw="'$(openssl rand -base64 24)'" -f /opt/kiddietube/deploy/setup-db.sql
#    -> put that same password into DATABASE_URL in .env

# 3. Secrets (values with spaces or <> in double quotes, like EMAIL_FROM)
cp /opt/kiddietube/deploy/env.example /opt/kiddietube/.env
chmod 600 /opt/kiddietube/.env
nano /opt/kiddietube/.env      # DATABASE_URL, AUTH_SECRET (openssl rand -base64 48), RESEND_API_KEY

# 4. Service, under its own unprivileged user (reads the code, can't change it)
sudo useradd --system --no-create-home --shell /usr/sbin/nologin kiddietube
sudo cp /opt/kiddietube/deploy/kiddietube.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable kiddietube

# 4b. Nightly video availability check (03:30; catches up after the laptop was off)
sudo cp /opt/kiddietube/deploy/kiddietube-check.service /opt/kiddietube/deploy/kiddietube-check.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kiddietube-check.timer

# 5. nginx
sudo cp /opt/kiddietube/deploy/nginx/kiddietube-headers.conf /opt/kiddietube/deploy/nginx/kiddietube-cloudflare-realip.conf /etc/nginx/snippets/
sudo cp /opt/kiddietube/deploy/nginx/kiddietube.conf /etc/nginx/sites-available/kiddietube
sudo ln -s /etc/nginx/sites-available/kiddietube /etc/nginx/sites-enabled/kiddietube
sudo nginx -t && sudo systemctl reload nginx

# 6. Deploy log + first deploy (installs, tests, builds, migrates, starts)
sudo touch /var/log/kiddietube-deploy.log && sudo chown ubuntu:ubuntu /var/log/kiddietube-deploy.log
sudo mkdir -p /var/backups/kiddietube && sudo chown ubuntu:ubuntu /var/backups/kiddietube
/opt/kiddietube/deploy/deploy.sh                              # master
/opt/kiddietube/deploy/deploy.sh origin/feature/multi-family  # or a branch, to test it first
```

`deploy.sh` restarts the service with `sudo systemctl restart kiddietube`; allow
that without a password if you want hands-off deploys:
`echo 'ubuntu ALL=(root) NOPASSWD: /bin/systemctl restart kiddietube' | sudo tee /etc/sudoers.d/kiddietube`.

## After the first deploy

1. Open `https://kids.tinyapps.dev/join`, sign up with your `ADMIN_EMAILS`
   address, open the link in the email to choose your password, sign in, then
   create your family. (Only the owner of the inbox can set the password, so
   nobody else can claim the admin address.)
2. Import the current list into **your family only** (family id: Settings
   page, or `GET /api/v1/me`):
   ```bash
   cd /opt/kiddietube && set -a && . ./.env && set +a
   GIST_TOKEN=<token> npm run import -w @kiddietube/api -- --family <familyId> --gist <gistId> --dry-run
   GIST_TOKEN=<token> npm run import -w @kiddietube/api -- --family <familyId> --gist <gistId>
   ```
   (Or `--file apps/web/public/videos.json` for the bundled list.)
3. On each kid's device: open `https://kids.tinyapps.dev`, **Set up this
   device**, sign in, Kids → add the kid → **Use this device**. Install it to
   the home screen. Then set a parent PIN (Settings).
4. Backups: the nightly server backup (`/etc/cron.d/server-backup`, 20:00,
   runs `/usr/local/bin/backup.sh`) already dumps **every** database, so the
   `kiddietube` DB is included automatically. Only the secrets need adding, in
   section "2. App .env files" of `/usr/local/bin/backup.sh` (and the copy in
   `/opt/server-configs`, which is older than the live script):
   ```bash
   cp /opt/kiddietube/.env "$WORK/env/kiddietube.env"
   ```
5. Uptime Kuma: HTTP monitor on `https://kids.tinyapps.dev/api/v1/health`.
6. Copy `kiddietube.service` and the nginx files into `/opt/server-configs`
   and add Kiddie Tube to `/opt/COMMANDS.md`.

## Updating

```bash
/opt/kiddietube/deploy/deploy.sh             # latest master
/opt/kiddietube/deploy/deploy.sh v3.0.1      # a specific tag
```

## Restore

A failed deploy rolls back the **code** automatically, but not the
**database**: migrations that already ran stay applied. Migrations are
written to be backward-compatible with the previous release (add, don't
rename or drop, in the same release), so the rolled-back code keeps working.
If a migration itself is the problem, restore the dump `deploy.sh` took just
before it:

```bash
sudo systemctl stop kiddietube
pg_restore --clean --if-exists -d "$DATABASE_URL" /var/backups/kiddietube/pre-deploy-<when>.dump
/opt/kiddietube/deploy/deploy.sh <previous tag or commit>
```

## Cloudflare origin hardening (owner; affects all of tinyapps.dev)

Today Cloudflare's SSL mode is **Full** and the origin uses a self-signed
certificate, so Cloudflare encrypts to the server but doesn't check *who*
answers, and anyone who finds the home IP can reach nginx directly
(skipping Cloudflare's protection). To close both [review R3-4]:

1. **Origin certificate:** Cloudflare → tinyapps.dev → SSL/TLS → Origin
   Server → *Create certificate* (hostnames `tinyapps.dev`, `*.tinyapps.dev`,
   15 years). Save it as `/etc/nginx/ssl/cf-origin.pem` and the key as
   `/etc/nginx/ssl/cf-origin.key` (`chmod 600`).
2. Point **every** server block that uses `self.crt` at the new files (the
   other apps too), `sudo nginx -t && sudo systemctl reload nginx`, check each
   site still loads.
3. Switch SSL/TLS mode to **Full (strict)**; check each site again.
4. Optional: let only Cloudflare reach port 443. `deploy/cloudflare-ufw.sh`
   prints the ufw rules from the same ranges as the real-IP snippet; review
   and run them yourself. (SSH on the LAN is unaffected.)

## Notes

- **Client IPs behind Cloudflare:** `snippets/kiddietube-cloudflare-realip.conf`
  makes `$remote_addr` the visitor (from `CF-Connecting-IP`, believed only from
  Cloudflare's ranges). nginx overwrites `X-Forwarded-For`, and the API trusts
  only `127.0.0.1` (`TRUST_PROXY`), so clients can't pick their own IP to
  dodge rate limits. Refresh the ranges from https://www.cloudflare.com/ips/
  now and then.
- **Staging:** same steps with `kiddietube-staging` (service, port 3008, DB
  `kiddietube_staging`, host `kids-staging.tinyapps.dev`).
- **Logs:** `journalctl -u kiddietube -f` (credentials are redacted).
