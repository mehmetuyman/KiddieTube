# Deploying Kiddie Tube to the home server

Target: `https://kids.tinyapps.dev` on `ubuntu@192.168.0.28` (Ubuntu 24.04,
nginx, PostgreSQL 16, systemd), following the conventions of the other apps in
`/opt` (see `/opt/COMMANDS.md`). Nothing here runs automatically; each step is
done once by hand, then `deploy.sh` handles updates.

| Piece | Location on the server |
|---|---|
| Code | `/opt/kiddietube` (git clone) |
| Secrets | `/opt/kiddietube/.env` (from `deploy/env.example`, `chmod 600`) |
| API service | `kiddietube.service` → `127.0.0.1:3007` |
| Web app | `/opt/kiddietube/apps/web/dist` (static, served by nginx) |
| nginx | `/etc/nginx/sites-available/kiddietube` + `snippets/kiddietube-headers.conf` |
| Database | `kiddietube` DB, owned by the ordinary `kiddietube` user |
| Deploy log | `/var/log/kiddietube-deploy.log` |
| Pre-deploy DB backups | `/var/backups/kiddietube/` (last 5) |

## Before you start (owner)

1. **DNS:** in Cloudflare, add `kids` → same target as `tinyapps.dev`, proxied
   (orange cloud).
2. **Email:** verify `tinyapps.dev` in Resend (adds a few DNS records) so mail
   can come from `noreply@tinyapps.dev`.

## First-time setup

```bash
# 1. Code
sudo mkdir -p /opt/kiddietube && sudo chown ubuntu:ubuntu /opt/kiddietube
git clone git@github.com:mehmetuyman/KiddieTube.git /opt/kiddietube

# 2. Database: an ordinary role (the API refuses to start as a superuser,
#    because row-level security would not apply)
sudo -u postgres psql -v pw="'$(openssl rand -base64 24)'" -f /opt/kiddietube/deploy/setup-db.sql
#    -> put that same password into DATABASE_URL in .env

# 3. Secrets
cp /opt/kiddietube/deploy/env.example /opt/kiddietube/.env
chmod 600 /opt/kiddietube/.env
nano /opt/kiddietube/.env      # DATABASE_URL, AUTH_SECRET (openssl rand -base64 48), RESEND_API_KEY

# 4. Service
sudo cp /opt/kiddietube/deploy/kiddietube.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable kiddietube

# 5. nginx
sudo cp /opt/kiddietube/deploy/nginx/kiddietube-headers.conf /etc/nginx/snippets/
sudo cp /opt/kiddietube/deploy/nginx/kiddietube.conf /etc/nginx/sites-available/kiddietube
sudo ln -s /etc/nginx/sites-available/kiddietube /etc/nginx/sites-enabled/kiddietube
sudo nginx -t && sudo systemctl reload nginx

# 6. Deploy log + first deploy (installs, tests, builds, migrates, starts)
sudo touch /var/log/kiddietube-deploy.log && sudo chown ubuntu:ubuntu /var/log/kiddietube-deploy.log
sudo mkdir -p /var/backups/kiddietube && sudo chown ubuntu:ubuntu /var/backups/kiddietube
/opt/kiddietube/deploy/deploy.sh
```

`deploy.sh` restarts the service with `sudo systemctl restart kiddietube`; allow
that without a password if you want hands-off deploys:
`echo 'ubuntu ALL=(root) NOPASSWD: /bin/systemctl restart kiddietube' | sudo tee /etc/sudoers.d/kiddietube`.

## After the first deploy

1. Open `https://kids.tinyapps.dev/join`, sign up with your `ADMIN_EMAILS`
   address, create your family.
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
4. Add to `/opt/server-configs/backup.sh`:
   ```bash
   sudo -u postgres pg_dump -Fc kiddietube > "$WORK/db/kiddietube.dump"
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

```bash
sudo systemctl stop kiddietube
pg_restore --clean --if-exists -d "$DATABASE_URL" /var/backups/kiddietube/pre-deploy-<when>.dump
/opt/kiddietube/deploy/deploy.sh <previous tag or commit>
```

## Notes

- **Client IPs behind Cloudflare:** for per-client rate limits, nginx should
  see the real client IP. Configure nginx's real-IP module for Cloudflare
  (`set_real_ip_from` Cloudflare ranges, `real_ip_header CF-Connecting-IP`), so
  `$remote_addr` is the visitor rather than Cloudflare.
- **Staging:** same steps with `kiddietube-staging` (service, port 3008, DB
  `kiddietube_staging`, host `kids-staging.tinyapps.dev`).
- **Logs:** `journalctl -u kiddietube -f` (credentials are redacted).
