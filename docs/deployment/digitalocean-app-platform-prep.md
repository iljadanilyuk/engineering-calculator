# DigitalOcean App Platform Deployment Prep

Date: 2026-07-11
Task: PZK-014
Status: preparation only
DigitalOcean Project: `engineering-calculator`
Project ID: `e0c43cc8-3ea8-4c16-a390-738e56d9c3e3`

No DigitalOcean App Platform app, Managed PostgreSQL cluster, Spaces bucket, Droplet, DNS record, domain attachment, or other paid resource has been created for PZK-014. This runbook is safe preparation only. Do not run `doctl apps create`, `doctl apps update`, create databases, create Spaces, create Droplets, or change DNS until the user separately approves provisioning and DNS work.

## Provider Docs Checked

Official DigitalOcean documentation checked on 2026-07-11:

- App Spec reference: https://docs.digitalocean.com/products/app-platform/reference/app-spec/
- App Platform domains: https://docs.digitalocean.com/products/app-platform/how-to/manage-domains/
- App Platform databases: https://docs.digitalocean.com/products/app-platform/how-to/manage-databases/
- App Platform environment variables and bindable variables: https://docs.digitalocean.com/products/app-platform/how-to/use-environment-variables/
- App Platform health checks: https://docs.digitalocean.com/products/app-platform/how-to/manage-health-checks/
- App Platform Bun buildpack: https://docs.digitalocean.com/products/app-platform/reference/buildpacks/bun/

Current provider facts that matter for this repo:

- App specs can define apps as YAML for `doctl apps spec validate` and later create/update flows.
- App Platform database specs support PostgreSQL versions `15`, `16`, `17`, and `18`; this project must pin `version: "18"` because the Prisma schema uses database-generated `uuidv7()`.
- App Platform exposes bindable variables such as `${_self.PUBLIC_URL}`, `${db.DATABASE_URL}`, and `${db.DATABASE_PRIVATE_URL}`. Private database URLs are only available when the app and database share the same VPC.
- App Platform does not support adding DNSSEC-enabled domains to apps. DNSSEC status is a preflight blocker.
- Domains with restrictive CAA records must allow both `letsencrypt.org` and `pki.goog` for App Platform certificates.
- Bun buildpack can pin Bun with `BUN_VERSION`, `.bun-version`, or `.runtime.bun.txt`; this repo pins `1.3.14` with `.bun-version` and static-site build env.

## Release Boundary

Provisioning remains blocked until all of these are true:

- User approves the expected paid resources.
- Base production domain is confirmed.
- Registrar access is confirmed.
- DNSSEC status is checked and a user-approved DNSSEC path exists.
- Exact production region is confirmed. Draft specs default to `fra`; override with `DO_APP_REGION` if the owner chooses another region.
- Latest release commit is pushed to the intended branch.
- Draft specs are generated into `.scratch/deploy` and validated with `doctl apps spec validate`.

The future create command must include the Project ID:

```bash
doctl apps create --project-id e0c43cc8-3ea8-4c16-a390-738e56d9c3e3 --spec .scratch/deploy/backend-app.yaml
```

This example is not authorization to run it.

## App Platform Shape

The committed draft templates intentionally use three App Platform apps, each with one active component. This keeps custom domains and build-time env simple while the product is small. If future work consolidates them into one multi-component app, re-check ingress routing, domains, env scoping, and pricing before applying a spec.

| Surface | Draft spec | Component | Future host | Build/run |
| --- | --- | --- | --- | --- |
| Backend/API | `.do/backend-app.yaml.example` | `services[0].name: api` | `api.<production-domain>` | Dockerfile `backend/Dockerfile`, `PORT=8080`, `/health` checks, `bun run start` from Docker CMD |
| Admin webapp | `.do/webapp-static-app.yaml.example` | `static_sites[0].name: webapp` | `admin.<production-domain>` | `bun install --frozen-lockfile && bun run build:webapp`, output `webapp/dist`, catch-all `index.html` |
| Public website | `.do/website-static-app.yaml.example` | `static_sites[0].name: website` | `www.<production-domain>` | `bun install --frozen-lockfile && bun run build:website`, output `website/dist` |
| Database | backend spec `databases[0]` | Managed PostgreSQL | attached to backend app | `engine: PG`, `version: "18"`, `production: true` |

Static sites are build-time configured. Any change to `VITE_API_URL`, `PUBLIC_API_URL`, `PUBLIC_WEBAPP_URL`, or `PUBLIC_WEBSITE_URL` requires rebuilding/redeploying the static site.

## Draft Spec Workflow

Committed files under `.do/*.yaml.example` are templates only. Concrete specs must be generated only into `.scratch/deploy`, which is not committed:

```bash
export DO_GITHUB_REPO=iljadanilyuk/engineering-calculator
export DO_PROJECT_SLUG=poznyak-engineering-calculator
export DO_GIT_BRANCH=main
export DO_APP_REGION=fra
export JWT_SECRET="$(openssl rand -hex 32)"
```

Bootstrap order after explicit provisioning approval:

```bash
# 1. Backend draft with self API URL and placeholder browser origins.
bun run deploy:do:specs backend-initial
doctl apps spec validate .scratch/deploy/backend-app.yaml

# 2. Webapp draft after backend default ingress exists.
export DO_BACKEND_URL=https://<api-default-ingress-or-api-custom-domain>
bun run deploy:do:specs webapp
doctl apps spec validate .scratch/deploy/webapp-static-app.yaml

# 3. Website draft after webapp default ingress exists.
export DO_WEBAPP_URL=https://<admin-default-ingress-or-admin-custom-domain>
bun run deploy:do:specs website
doctl apps spec validate .scratch/deploy/website-static-app.yaml

# 4. Backend final draft after all public origins are known.
export DO_WEBSITE_URL=https://<www-default-ingress-or-www-custom-domain>
export DO_BACKEND_URL=https://<api-default-ingress-or-api-custom-domain>
bun run deploy:do:specs backend-final
doctl apps spec validate .scratch/deploy/backend-app.yaml
```

For the custom-domain cutover, use final values:

```bash
DO_BACKEND_URL=https://api.<production-domain>
DO_WEBAPP_URL=https://admin.<production-domain>
DO_WEBSITE_URL=https://www.<production-domain>
```

Do not accept real leads while final URL env vars still point at `placeholder.invalid`, `localhost`, or temporary `*.ondigitalocean.app` origins. Proposal HTML/PDF snapshots are immutable and can permanently embed these URLs.

## Runtime Versions

- Backend Docker image: `oven/bun:1.3.14`.
- Static-site Bun buildpack: `BUN_VERSION=1.3.14` plus root `.bun-version`.
- Website Node requirement: `website/package.json` requires `node >=22.12.0`.
- Local and production database major: PostgreSQL 18.
- PDF renderer: backend Dockerfile installs Playwright Chromium with `bun x playwright install --with-deps chromium`.

Before production provisioning, validate that App Platform build logs show the expected Bun/Node versions and that the backend can render a PDF in the deployed image.

## Backend Runtime Env

Backend App Platform service env:

| Key | Scope | Type | Value |
| --- | --- | --- | --- |
| `PORT` | run time | general | `8080` |
| `NODE_ENV` | run time | general | `production` |
| `DATABASE_URL` | run time | secret | `${<db-component>.DATABASE_URL}` for baseline; consider `${<db-component>.DATABASE_PRIVATE_URL}` after validating same-VPC private connectivity |
| `JWT_SECRET` | run time | secret | random 32+ chars, never the example placeholder |
| `CORS_ORIGINS` | run time | general | `https://www.<production-domain>` |
| `AUTH_CORS_ORIGINS` | run time | general | `https://admin.<production-domain>` |
| `PUBLIC_API_URL` | run time | general | `https://api.<production-domain>` |
| `PUBLIC_WEBSITE_URL` | run time | general | `https://www.<production-domain>` |
| `PUBLIC_WEBAPP_URL` | run time | general | `https://admin.<production-domain>` |
| `ACCESS_TOKEN_TTL_SECONDS` | run time | general | `900` |
| `REFRESH_TOKEN_TTL_DAYS` | run time | general | `30` |
| `COOKIE_SECURE` | run time | general | `true` |
| `TRUST_PROXY_HEADERS` | run time | general | `true` |
| `TELEGRAM_BOT_TOKEN` | run time | secret | add only after approved internal chat is confirmed |
| `TELEGRAM_CHAT_ID` | run time | secret | add only after approved internal chat is confirmed |
| `PDF_CHROMIUM_EXECUTABLE_PATH` | run time | general/secret not needed | set only if the deployed image cannot discover Chromium |

Do not put backend secrets, database URLs, JWT secrets, Telegram values, or storage keys in frontend build env.

## Frontend Build Env

Webapp static site:

| Key | Scope | Value |
| --- | --- | --- |
| `BUN_VERSION` | build time | `1.3.14` |
| `VITE_API_URL` | build time | `https://api.<production-domain>` |

Website static site:

| Key | Scope | Value |
| --- | --- | --- |
| `BUN_VERSION` | build time | `1.3.14` |
| `PUBLIC_API_URL` | build time | `https://api.<production-domain>` |
| `PUBLIC_WEBAPP_URL` | build time | `https://admin.<production-domain>` |
| `PUBLIC_WEBSITE_URL` | build time | `https://www.<production-domain>` |

## Prisma Migration Flow

The backend app spec includes a pre-deploy job named `migrate`:

```bash
bun run prisma:deploy
```

Operational rules:

- Use `prisma migrate deploy` only. Do not run `prisma migrate dev` in production.
- Run migrations against the same Managed PostgreSQL 18 attachment as the backend.
- Check pre-deploy job logs for the exact migration list and confirm it ran once for the deployment.
- Take a manual backup or verified snapshot before destructive/data migrations.
- Create the first production admin only after migrations by running `bun run --cwd backend admin:create` from a protected console/job with `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and optional `ADMIN_DISPLAY_NAME`; then remove `ADMIN_PASSWORD`.

## Proposal/PDF Storage

V1 storage remains PostgreSQL-backed:

- `Proposal.htmlSnapshot` stores immutable HTML.
- `Proposal.pdfBytes` stores immutable PDF bytes.
- `Proposal.checksumSha256` verifies the PDF artifact.
- `Proposal.storageKey` records the planned logical key.
- `Calculation.calculationSnapshot` and `Proposal.calculationSnapshot` preserve prices, exchange rate, services, totals, and rendering inputs.

Rules:

- Do not write durable PDFs to App Platform filesystem.
- Do not regenerate old proposals from current services, prices, settings, or exchange rates.
- Backups and restore drills must include the `proposals` table and PDF byte recovery.
- DigitalOcean Spaces stays deferred until explicitly approved for larger media/file volumes.

## DNS Runbook

DNS remains at the current registrar. Do not move nameservers to DigitalOcean unless the user explicitly changes the decision. Do not add `domains[].zone` in app specs while registrar-managed DNS remains authoritative.

Required host plan:

| Host | Purpose | Registrar placeholder | Notes |
| --- | --- | --- | --- |
| `www.<production-domain>` | canonical public website | CNAME to App Platform alias, or A/AAAA records if DigitalOcean supplies them | Primary public host. Attach to website app. |
| `<production-domain>` apex | redirect to `www` | CNAME flattening/ALIAS/ANAME if registrar supports it, otherwise DigitalOcean-provided A/AAAA records | Attach apex only after DNSSEC/CAA preflight; configure redirect to `www`. |
| `admin.<production-domain>` | admin webapp | CNAME to App Platform alias | Attach to webapp static app. |
| `api.<production-domain>` | backend API | CNAME to App Platform alias | Attach to backend API app. |
| `_digitalocean...` or provider-supplied TXT | verification | TXT name/value copied from App Platform | Use exact name/value from dashboard/spec output. |
| `@` CAA | certificate authorization | preserve existing CAA, add required issuers if restrictive | Must allow `letsencrypt.org` and `pki.goog` when CAA exists. |

Before adding or changing records:

1. Export or screenshot existing registrar DNS zone.
2. Preserve MX, SPF, DKIM, DMARC, ownership verification TXT, analytics/search verification TXT, and unrelated A/AAAA/CNAME records.
3. Identify only conflicting old records for `@`, `www`, `admin`, or `api`.
4. Check DNSSEC. If enabled, stop until the owner approves disabling DNSSEC, using a different domain, or using a different proxy/domain approach compatible with App Platform.
5. Check CAA. If restrictive, update it to allow DigitalOcean App Platform certificate issuance.
6. Add App Platform custom domains after apps exist, then copy exact CNAME/A/AAAA/TXT targets into the registrar.
7. Wait for DNS/TLS propagation; DigitalOcean says propagation can take up to 72 hours.
8. Update final backend/frontend env vars to custom domains and redeploy static sites.

## TLS, CORS, Auth, And Proxy Checks

- App Platform terminates HTTPS for custom domains.
- Backend cookies must be `Secure`, `HttpOnly`, `SameSite=None`, and scoped to auth paths.
- `AUTH_CORS_ORIGINS` must contain only `https://admin.<production-domain>`.
- `CORS_ORIGINS` must contain public non-credentialed browser origins such as `https://www.<production-domain>`.
- No wildcard origins, empty origins, HTTP origins, or URL paths in CORS lists.
- `TRUST_PROXY_HEADERS=true` is allowed only behind App Platform or another explicitly trusted proxy.
- If Cloudflare or another CDN is later introduced, re-check forwarded host/IP headers, TLS mode, caching, and whether the custom domain should be attached to CDN instead of App Platform.

## Backup And Restore

Baseline:

- Use Managed PostgreSQL automated backups.
- Confirm exact backup retention and point-in-time restore options in the DigitalOcean dashboard before provisioning.
- Before destructive changes, create a manual backup/snapshot and record the backup timestamp.
- Keep restore notes after the first production DB exists.

Restore drill:

1. Restore to a non-production database.
2. Point a non-production backend at the restored database.
3. Run `bun run --cwd backend prisma:deploy` only if the target code revision needs it.
4. Verify admin login, lead list, proposal HTML, proposal PDF bytes, and checksum header.
5. Confirm restored immutable proposal links use expected final domains, not temporary bootstrap domains.

## Rollback Plan

Application rollback:

- Prefer reverting the faulty commit and letting App Platform redeploy from `main`.
- Record the previous known-good commit SHA in release notes.
- Use a DigitalOcean previous-deployment rollback only if compatible with the current database schema.

Database rollback:

- Prisma migrations are forward-only by default.
- Do not automatically roll back schema after a migration has run.
- If a destructive migration fails, stop writes, restore a verified backup to a new database, and repoint an approved rollback app only after the owner approves the data-loss window.

Static-site rollback:

- Redeploy a previous commit or revert the faulty commit.
- Rebuild after any URL env change because static bundles bake build-time env.

## Post-Deploy Smoke Checklist

Run only after resources are approved, provisioned, custom domains are attached, final env vars are deployed, and static sites are rebuilt:

- `https://api.<production-domain>/health` returns 200.
- Backend logs show `NODE_ENV=production`, `COOKIE_SECURE=true`, and no secret values printed.
- `GET /api/public/calculator-config` returns services and exchange-rate config from PostgreSQL.
- `https://www.<production-domain>` loads with working static assets.
- Calculator submission creates a lead with a real exchange-rate snapshot.
- Proposal HTML opens through `/api/public/proposals/{token}` with `Cache-Control: private, max-age=0, no-store` and `X-Robots-Tag: noindex, nofollow`.
- Proposal PDF opens through `/api/public/proposals/{token}/pdf`.
- `X-Proposal-Checksum-Sha256` matches the saved artifact checksum.
- Proposal HTML/PDF do not contain `localhost`, `placeholder.invalid`, or unwanted temporary `*.ondigitalocean.app` links after final cutover.
- `https://admin.<production-domain>` loads and route refreshes use `index.html` catch-all.
- Admin login works.
- Admin can change a lead status and save notes.
- Telegram disabled mode does not block lead submission.
- If Telegram is enabled, a test lead notification contains concise lead details, admin URL, and proposal/PDF URL without extra PII.
- App Platform pre-deploy migration job logs show migrations ran once for the deployed revision.
- Database backup status is healthy.

## Pre-Provisioning Checklist

- [ ] User approved paid resources.
- [ ] DigitalOcean Project ID is explicitly used: `e0c43cc8-3ea8-4c16-a390-738e56d9c3e3`.
- [ ] Base domain and registrar access confirmed.
- [ ] DNSSEC checked and resolved before App Platform domain attachment.
- [ ] CAA checked and compatible with `letsencrypt.org` and `pki.goog`.
- [ ] Existing MX/SPF/DKIM/DMARC/TXT records exported and preserved.
- [ ] Latest release commit pushed and branch is clean/in sync.
- [ ] Draft specs generated into `.scratch/deploy`.
- [ ] Draft specs validated with `doctl apps spec validate`.
- [ ] `JWT_SECRET` generated outside the repo and stored only as a deployment secret.
- [ ] PostgreSQL spec pins `version: "18"`.
- [ ] Backend final spec has `PUBLIC_API_URL`, `PUBLIC_WEBSITE_URL`, and `PUBLIC_WEBAPP_URL` set to final custom domains before real leads.
- [ ] Static sites rebuilt after final URL env changes.
