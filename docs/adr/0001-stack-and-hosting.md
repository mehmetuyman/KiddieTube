# ADR-0001: Stack and hosting for the multi-family version

- **Status:** Accepted
- **Date:** 2026-11-03
- **Context doc:** [ROADMAP.md](../ROADMAP.md)

## Context

Kiddie Tube is a static PWA on GitHub Pages; one family's list is synced
through a GitHub Gist, with a GitHub token stored in each browser. It is
moving to the owner's home server (`kids.tinyapps.dev`) and must serve a few
families with complete isolation, and keep working on installed devices when
that server is unplugged.

The home server (Ubuntu 24.04 laptop, 2 cores, 3.7 GB RAM) already runs three
Next.js apps, a Flask app and static sites as **systemd services behind
nginx**, with **PostgreSQL 16**, **Uptime Kuma**, and a backup script. There is
no Docker. EmlakPro sends email through **Resend** and uses **Prisma**.

## Decision

1. **Frontend:** keep Vite + React + TypeScript as an installable, offline-first
   single-page app. The kids' experience reads from a list stored on the
   device and syncs with the server in the background.
2. **API:** Fastify + TypeScript on Node 20, one small service bound to
   `127.0.0.1`.
3. **Database:** the existing PostgreSQL 16, with a dedicated database and
   database user; Prisma for schema and migrations.
4. **Tenancy:** a single shared database; every family-owned row carries
   `familyId`; the API scopes every query, and PostgreSQL row-level security
   enforces it as a second layer.
5. **Auth:** Better Auth (email + password, email codes / magic links,
   passkeys; organization plugin for families, roles and invitations).
   Kids have no accounts: devices are paired to a kid profile with a
   revocable device key.
6. **Email:** Resend, sending from `noreply@tinyapps.dev`.
7. **Hosting:** systemd service + nginx `server` block for `kids.tinyapps.dev`
   (a subdomain, for origin isolation from the other `tinyapps.dev` apps); no
   Docker.
8. **Repo:** npm workspaces (`apps/web`, `apps/api`, `packages/shared`).

## Alternatives considered

- **Next.js (like EmlakPro):** familiar, but the app must run with its server
  down; a Next.js app is server-first and heavier on a memory-constrained box.
- **Database-per-tenant (EmlakPro's plan):** strong isolation, but per-family
  migrations and backups are overkill for a few families with small lists.
  Row-level security gives a database-enforced boundary with one schema.
- **Docker Compose:** good isolation and portability, but it would be the only
  containerised app on a server whose conventions, docs and recovery guide are
  built around systemd.
- **Subfolder (`tinyapps.dev/kids/`):** consistent with the other apps, but it
  shares one browser origin (storage, cookies, scripts) with them.
- **Keep the GitHub Gist sync:** puts a GitHub token in every browser and
  can't isolate families.

## Consequences

- Offline-first must be designed in (local store, background sync, "server
  offline" state for parent edits, update prompt).
- One more systemd service, database, nginx server block and backup entry to
  maintain, following the existing conventions in `/opt/server-configs`.
- The current GitHub Pages site keeps running until families have moved.
