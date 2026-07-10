# DigitalOcean Deployment Decision Gate

Date: 2026-07-10
Task: PZK-013
DigitalOcean Project: `engineering-calculator`
Project ID: `e0c43cc8-3ea8-4c16-a390-738e56d9c3e3`
Project environment: Development
Current DigitalOcean resources in this Project: 0

No DigitalOcean App Platform app, Managed PostgreSQL cluster, Spaces bucket, Droplet, DNS record, or other paid resource was created for PZK-013. This document is a decision record only.

## Decision

Use DigitalOcean App Platform for production:

- `backend` as one App Platform web service built from `backend/Dockerfile`.
- `website` as an App Platform Static Site while it remains fully prerendered.
- `webapp` as an App Platform Static Site.
- DigitalOcean Managed PostgreSQL 18 for production data.
- Generated proposal HTML snapshots and PDF bytes stored in PostgreSQL for v1.

Reject Droplet + Docker Compose for the first production launch. A Droplet is cheaper on paper, but it makes the owner responsible for OS patching, Docker updates, firewalling, TLS renewal, reverse proxy config, PostgreSQL operations, backups, restore drills, monitoring, rollback, and incident response. App Platform plus Managed PostgreSQL better matches this small product's current need: predictable Git-based deployment with less server administration.

## Resource Boundary

PZK-013 does not approve spend.

Future provisioning remains blocked until the user explicitly confirms paid resource creation. When provisioning is approved, App Platform resources must be created under Project ID `e0c43cc8-3ea8-4c16-a390-738e56d9c3e3`, for example with `doctl apps create --project-id e0c43cc8-3ea8-4c16-a390-738e56d9c3e3 --spec <spec.yaml>`.

DigitalOcean Projects are organizational containers. The Project itself is free; billing starts from resources such as app services, managed databases, Spaces, Droplets, outbound transfer overages, and add-ons.

## Architecture Shape

Preferred production shape:

| Surface | DigitalOcean shape | Notes |
| --- | --- | --- |
| Public website | App Platform Static Site | Build from repo root with `bun install --frozen-lockfile && bun run build:website`; output `website/dist`. |
| Admin webapp | App Platform Static Site | Build from repo root with `bun install --frozen-lockfile && bun run build:webapp`; output `webapp/dist`; React catch-all must be enabled. |
| Backend/API | App Platform web service | Build with `backend/Dockerfile`; `PORT=8080`; `/health` checks; one `apps-s-1vcpu-1gb` starter instance. |
| Database | DigitalOcean Managed PostgreSQL 18 | Required because Prisma schema uses database-generated `uuidv7()` primary keys. Do not use App Platform dev database for production. |
| Proposal/PDF storage | PostgreSQL v1 | Current code persists immutable HTML snapshots and `pdfBytes` in `Proposal`; DB backups therefore cover proposals. |
| Object storage | Deferred | Add DigitalOcean Spaces only when PDF/media volume, public CDN delivery, uploads, or large project examples justify it. |

Keep backend, website, and webapp as separate App Platform apps/components only if that keeps custom domains and build env simpler. If they are combined into one paid App Platform app later, re-check routing, static-site pricing, and env scoping before deployment.

## Database

Use DigitalOcean Managed PostgreSQL 18 in the same region as the backend.

Production defaults:

- PostgreSQL major version: 18.
- Starter size: Basic Regular 1 GiB / 1 vCPU, single node.
- App Platform should bind `DATABASE_URL` or `DATABASE_PRIVATE_URL` instead of committing credentials.
- Production DB URLs must require TLS. The backend already normalizes `sslmode=require` for Prisma's PostgreSQL adapter.
- App Platform dev database is rejected for production because it is not the durable, backed-up production database path.

Operational rules:

- Apply existing migrations with `bun run --cwd backend prisma:deploy`.
- Do not run `prisma migrate dev` in production.
- Take a manual backup or verified snapshot before destructive migrations or data migrations.
- Keep proposal artifacts immutable. Do not regenerate old offers from current prices/settings during restore or rollback.
- Create the first production admin only from a protected one-off job/console with `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and optional `ADMIN_DISPLAY_NAME`, then remove `ADMIN_PASSWORD`.

## Proposal And PDF Storage

Current implementation stores:

- immutable proposal HTML snapshot in `Proposal.htmlSnapshot`;
- immutable PDF bytes in `Proposal.pdfBytes`;
- checksum in `Proposal.checksumSha256`;
- planned object key in `Proposal.storageKey`;
- calculation snapshot in both `Calculation` and `Proposal`.

For v1, keep this DB-backed strategy because it avoids introducing Spaces before the product has confirmed file volume. It is durable as long as Managed PostgreSQL backups and restore drills cover the `proposals` table.

Risks and limits:

- PDF bytes increase database size and backup size.
- Large future sample PDFs, images, uploads, or CDN-delivered media should move to Spaces.
- App Platform container filesystem must remain temporary only. Never store durable generated PDFs there.
- If Spaces is introduced later, keep DB snapshots as source of truth and store object key/checksum/public or presigned access metadata in PostgreSQL.

## Runtime Versions

Current repo expectations:

- Backend runtime: Bun via `backend/Dockerfile`.
- Backend Docker image currently starts from `oven/bun:1`; PZK-014 should pin or record the exact Bun image tag/digest before production.
- Website build requires Node `>=22.12.0` by `website/package.json`.
- PostgreSQL: 18+ required by native `uuidv7()`.
- PDF generation: Chromium/headless browser is required. `backend/Dockerfile` runs `bun x playwright install --with-deps chromium`.
- Backend production env: `NODE_ENV=production`, `COOKIE_SECURE=true`, `TRUST_PROXY_HEADERS=true`.

PZK-014 must verify DigitalOcean's build/runtime output for Bun, Node, Prisma Client generation, and Chromium PDF generation before real traffic.

## Health Checks And Smoke Checks

App Platform liveness/readiness:

- Backend health path: `/health`.
- Keep `/health` process-only and fast. It is suitable for App Platform liveness.

Post-deploy smoke checks must go beyond `/health`:

- backend `/health` returns 200;
- database-backed public calculator config loads;
- public website loads from the production domain;
- lead submission saves a calculation;
- proposal HTML opens by token and has `no-store`/`noindex`;
- proposal PDF opens and checksum header matches the saved artifact;
- admin login works;
- admin can change a lead status;
- Telegram failure does not block lead submission when Telegram is misconfigured or unreachable;
- migrations have run exactly once for the deployed revision.

Do not accept real leads on temporary `*.ondigitalocean.app` URLs. Proposal snapshots embed public/API/admin URLs; wrong bootstrap URLs can become durable artifacts.

## Environment Variables

Backend runtime:

- `DATABASE_URL` as a secret from Managed PostgreSQL binding.
- `JWT_SECRET` as a secret, at least 32 random characters, not the example placeholder.
- `CORS_ORIGINS=https://www.<domain>` after domain cutover.
- `AUTH_CORS_ORIGINS=https://admin.<domain>`.
- `ACCESS_TOKEN_TTL_SECONDS=900`.
- `REFRESH_TOKEN_TTL_DAYS=30`.
- `COOKIE_SECURE=true`.
- `TRUST_PROXY_HEADERS=true`.
- `PUBLIC_API_URL=https://api.<domain>`.
- `PUBLIC_WEBSITE_URL=https://www.<domain>`.
- `PUBLIC_WEBAPP_URL=https://admin.<domain>`.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` only after the approved internal chat is confirmed.
- `PDF_CHROMIUM_EXECUTABLE_PATH` only if production needs a non-default Chromium executable.
- `SPACES_*` variables only if Spaces is explicitly approved later.

Website build-time:

- `PUBLIC_API_URL=https://api.<domain>`.
- `PUBLIC_WEBAPP_URL=https://admin.<domain>`.
- `PUBLIC_WEBSITE_URL=https://www.<domain>`.

Webapp build-time:

- `VITE_API_URL=https://api.<domain>`.

Do not place backend secrets, database URLs, JWT secrets, Telegram secrets, or storage keys in frontend build env.

## Domain And DNS Strategy

DNS management stays at the current registrar. Do not move nameservers to DigitalOcean unless the user explicitly changes this decision.

Chosen hostname pattern:

- Canonical public website: `www.<production-domain>`.
- Apex/root domain: redirect to `www.<production-domain>` after both hosts are attached and TLS is valid.
- Admin webapp: `admin.<production-domain>`.
- Backend/API: `api.<production-domain>`.
- Future Spaces CDN or public files, if approved: `files.<production-domain>` or `cdn.<production-domain>`.

The exact base domain is still an open user decision. No DNS cutover can happen until the base domain and registrar access are confirmed.

Domain attach sequence:

1. Create App Platform app(s) only after paid provisioning is approved.
2. Add custom domain(s) in App Platform.
3. Copy DigitalOcean-provided CNAME/A/AAAA/TXT records.
4. Add those records at the registrar.
5. Preserve existing MX, SPF, DKIM, DMARC, verification TXT, and unrelated DNS records.
6. Remove only conflicting old A/AAAA/CNAME records for the same host.
7. Wait for DNS and TLS propagation.
8. Update backend and frontend env vars to final custom-domain origins.
9. Redeploy static sites so build-time URLs are baked correctly.
10. Run the post-domain smoke checklist before accepting real leads.

Prefer CNAME records for `www`, `admin`, and `api` when DigitalOcean provides CNAME targets. For apex/root, do not assume plain CNAME support; use registrar-supported CNAME flattening/ALIAS/ANAME or DigitalOcean-provided A/AAAA records.

TLS and DNS blockers:

- Check CAA records before App Platform certificate issuance. If restrictive, allow the CA DigitalOcean/App Platform uses at that time.
- DNSSEC is a PZK-014 preflight blocker. DigitalOcean App Platform currently does not support adding DNSSEC-enabled domains to apps; check the domain's DNSSEC state and current DigitalOcean support before attaching domains, and get explicit owner approval before disabling DNSSEC or choosing a different domain/proxy approach.
- Keep wildcard verification TXT records current only if wildcards are introduced later.
- Preserve email records and existing TXT verification records.

## HTTPS And Proxy Assumptions

App Platform terminates HTTPS for custom domains. Backend traffic arrives through DigitalOcean's trusted proxy.

Required backend production settings:

- `COOKIE_SECURE=true`.
- `TRUST_PROXY_HEADERS=true`.
- `AUTH_CORS_ORIGINS` contains only the admin webapp origin.
- `CORS_ORIGINS` contains only public browser origins that call non-credentialed public API routes.
- No wildcard CORS origins.
- No HTTP production origins.
- No URL paths in CORS origin lists.

If a Cloudflare or external CDN layer is introduced later, treat it as a separate architecture change and re-check trusted proxy, original IP, host header, TLS, and caching behavior.

## Backups And Restore

Baseline:

- Use Managed PostgreSQL automated backups for routine recovery.
- Confirm the exact backup retention, point-in-time restore capability, and restore procedure in the DigitalOcean dashboard before provisioning.
- Take manual backups/snapshots before destructive migrations, bulk imports, or cleanup scripts.
- Store restore notes in the deployment runbook after the first production DB exists.

Restore drill target:

- Restore a backup to a non-production database.
- Run `prisma:deploy` only if needed for the target revision.
- Verify admin login, lead list, proposal HTML, proposal PDF bytes, and checksums.

Because v1 proposals are stored in PostgreSQL, DB backup quality directly controls proposal recovery.

## Rollback Plan

Application rollback:

- Prefer reverting the bad Git commit and letting App Platform redeploy from `main`.
- If DigitalOcean exposes a prior successful deployment rollback for the app, it may be used only when it is compatible with the current database schema.
- Keep the previous known-good commit SHA in release notes.

Database rollback:

- Forward-only Prisma migrations are the default.
- Do not automatically roll back database schema after a migration has run.
- For destructive migration failures, stop writes, restore a verified backup to a new database, point a rollback app at that restored database only after approval, and document data loss window.

Static-site rollback:

- Redeploy previous commit or revert the faulty commit.
- Remember that `VITE_API_URL`, `PUBLIC_API_URL`, `PUBLIC_WEBAPP_URL`, and `PUBLIC_WEBSITE_URL` are build-time values and require a rebuild.

## Monitoring And Logging

Baseline:

- Enable App Platform alerts for deployment failures and domain failures.
- Use App Platform logs for backend startup, request errors, migration job output, and Telegram notification failures.
- Monitor Managed PostgreSQL CPU, memory, connections, disk usage, and backup status.
- Monitor App Platform CPU, memory, restarts, deployment failures, health-check failures, and outbound transfer.
- Keep application logs free of secrets and avoid printing full Telegram tokens, database URLs, JWTs, or lead payload dumps.

PZK-014 should add a small post-deploy verification checklist and record where production logs/alerts are reviewed.

## Expected Monthly Cost

Pricing checked on 2026-07-10 against DigitalOcean pricing pages. Verify again before provisioning.

Starter App Platform path:

- Backend App Platform shared container, `apps-s-1vcpu-1gb`: about `$12.00/mo`.
- DigitalOcean Managed PostgreSQL Basic Regular 1 GiB / 1 vCPU: about `$15.15/mo`.
- Website and webapp as static-only App Platform apps/components: likely `$0/mo` if within current static-site free allowances, otherwise subject to App Platform static-site pricing and transfer overages.
- Total baseline before taxes and overages: about `$27.15/mo`.

Optional later additions:

- DigitalOcean Spaces Standard Storage: about `$5.00/mo` for the base subscription.
- App Platform outbound transfer over allowance: billed per GiB.
- Larger backend, extra backend instances, workers, cron jobs, dedicated egress IPs, Valkey, Spaces CDN/custom file domains, or higher database tiers add cost.

Rejected Droplet path:

- A 2 GiB / 1 vCPU Droplet is about `$12.00/mo`, plus backups/snapshots if enabled.
- It avoids Managed PostgreSQL cost only by moving database operations onto the Droplet.
- Operational risk is higher for this project than the saved monthly cost.

## PZK-014 Deployment Prep Checklist

Before provisioning:

- Confirm exact base domain and registrar access.
- Confirm the user explicitly approves paid resources and expected monthly baseline.
- Confirm production region, recommended `fra` unless the owner chooses another region.
- Check whether the chosen domain has DNSSEC enabled and verify current App Platform DNSSEC support before custom-domain attachment.
- Update App Platform DB spec to pin PostgreSQL `version: "18"` and add a generator/test assertion.
- Ensure future `doctl apps create` examples include `--project-id e0c43cc8-3ea8-4c16-a390-738e56d9c3e3`.
- Decide whether the first launch keeps DB-backed proposal PDFs or adds Spaces from day one.
- Pin or record exact Bun backend image/runtime.
- Verify App Platform static-site builds with website Node `>=22.12.0`.
- Prepare production env values and secrets outside the repo.
- Generate specs only into `.scratch/deploy` from a clean, pushed release branch.
- Validate specs with `doctl apps spec validate` before create/update.
- Do not run `doctl apps create`, create DBs, create Spaces, create Droplets, or change DNS until the user separately approves paid provisioning.

After provisioning but before real leads:

- Attach custom domains.
- Add registrar DNS records without moving nameservers.
- Preserve MX/SPF/DKIM/DMARC/TXT records.
- Update all final URL env vars.
- Redeploy website and webapp to bake final build-time URLs.
- Run the full smoke checklist.
- Verify proposal snapshots contain final custom-domain URLs.

## Sources Checked

- DigitalOcean App Platform pricing: https://www.digitalocean.com/pricing/app-platform
- DigitalOcean Managed Databases pricing: https://www.digitalocean.com/pricing/managed-databases
- DigitalOcean Spaces pricing: https://www.digitalocean.com/pricing/spaces-object-storage
- DigitalOcean Droplet pricing: https://www.digitalocean.com/pricing/droplets
- DigitalOcean App Platform docs: https://docs.digitalocean.com/products/app-platform/
- DigitalOcean App Spec reference: https://docs.digitalocean.com/products/app-platform/reference/app-spec/
- DigitalOcean custom domains docs: https://docs.digitalocean.com/products/app-platform/how-to/manage-domains/
- DigitalOcean Spaces docs: https://docs.digitalocean.com/products/spaces/
