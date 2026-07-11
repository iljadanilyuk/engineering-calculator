# Poznyak Engineering Calculator

Full-stack calculator for engineering design commercial offers for `ИП Позняк`.

The project is scaffolded from the Vibe template (`https://github.com/di-sukharev/vibe`) and keeps the template's monorepo shape:

- `website` - public Astro surface for the landing page, calculator, project examples, and public proposal links.
- `webapp` - React/Vite admin cabinet for services, leads, statuses, notes, proposal links, and settings.
- `backend` - Hono API with Prisma/PostgreSQL, auth, proposal/PDF generation, Telegram notifications, and integrations.
- `packages/contracts` - shared Zod contracts and API/domain types.

Mobile is deferred. DigitalOcean deployment is deferred until the deployment preparation/provisioning gates are explicitly approved.

DigitalOcean Project: `engineering-calculator` (`e0c43cc8-3ea8-4c16-a390-738e56d9c3e3`) exists as an organizational container only. DigitalOcean billing is based on actual team/account resource usage, not the number of Projects. This Project currently contains no paid resources.

Domain DNS decision: keep DNS at the current registrar. After a DigitalOcean app exists, add the required App Platform CNAME/A/AAAA/TXT records at the registrar to point the production domain or subdomain to the DigitalOcean app target. Do not move nameservers to DigitalOcean unless that decision changes explicitly. See [docs/deployment/digitalocean-decision-gate.md](docs/deployment/digitalocean-decision-gate.md) for the domain cutover checklist, including apex vs `www`, API/admin hostnames, CORS/public URL env updates, and preserving MX/SPF/DKIM/DMARC records.

PZK-013 selected the production deployment shape: DigitalOcean App Platform plus DigitalOcean Managed PostgreSQL 18, with `website` and `webapp` as static sites, `backend` as one App Platform service, and generated proposal/PDF artifacts stored in PostgreSQL for v1. See [docs/deployment/digitalocean-decision-gate.md](docs/deployment/digitalocean-decision-gate.md). This is documentation only; no App Platform app, database, Spaces bucket, Droplet, DNS record, or other paid resource has been created.

PZK-014 prepared safe draft App Platform templates and the concrete DNS/deployment runbook in [docs/deployment/digitalocean-app-platform-prep.md](docs/deployment/digitalocean-app-platform-prep.md). These are preparation artifacts only; they were not applied to DigitalOcean.

## Product Direction

The first product version should let public users calculate an indicative design-work offer, submit name and phone, and download a polished PDF proposal. Admin users should manage services/prices, review submitted calculations, change lead statuses, and use the app as a lightweight mini-CRM.

Important project choices are tracked in [task.md](task.md). The current brand placeholder is `ИП Позняк`.

## Local Setup

Prerequisites:

- Bun, using the committed `bun.lock`.
- Docker Desktop or Docker Engine with Compose v2 for local PostgreSQL and DB-backed tests.
- Git.
- Playwright Chromium for browser E2E, installed with `bun run --cwd webapp e2e:install` when needed.

Install dependencies:

```bash
bun install --frozen-lockfile
```

For backend/API work, Docker Compose provides local PostgreSQL. Check Docker before relying on the database:

```bash
docker compose version
docker info
```

Start local PostgreSQL:

```bash
docker compose up -d postgres
```

Create local env files from examples:

```powershell
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
Copy-Item webapp/.env.example webapp/.env
Copy-Item website/.env.example website/.env
```

Apply Prisma migrations:

```bash
bun run --cwd backend prisma:migrate
```

Create the first admin account locally after migrations:

```powershell
$env:ADMIN_EMAIL="owner@example.com"
$env:ADMIN_PASSWORD="<strong local password>"
$env:ADMIN_DISPLAY_NAME="Owner"
bun run --cwd backend admin:create
Remove-Item Env:ADMIN_PASSWORD
```

`admin:create` hashes the password before writing to PostgreSQL and refuses to create a second admin by default. Public self-registration is disabled; admin login uses `POST /api/auth/login`.

Run active surfaces in separate terminals:

```bash
bun run dev:backend
bun run dev:webapp
bun run dev:website
```

Default local URLs:

- Backend API: `http://localhost:3000`
- Webapp/admin: Vite default from the terminal output, usually `http://localhost:5173`
- Website: Astro default from the terminal output, usually `http://localhost:4321`

## Workspace Commands

- `bun run dev` - start all workspace projects in parallel.
- `bun run dev:backend` - start the backend API.
- `bun run dev:webapp` - start the React admin webapp.
- `bun run dev:website` - start the public Astro website.
- `bun run typecheck` - run TypeScript checks across workspaces.
- `bun run build` - build/check all workspaces.
- `bun run test` - run deploy/script tests, contracts, backend tests, and webapp tests.
- `bun run test:deploy` - run deployment/spec and repository env tests.
- `bun run test:contracts` - run shared contract tests.
- `bun run test:backend` - run backend unit and integration tests.
- `bun run test:backend:unit` - run backend unit tests.
- `bun run test:backend:integration` - run DB-backed backend integration tests.
- `bun run test:webapp` - run webapp tests.
- `bun run smoke:backend:docker` - build/smoke the backend Docker image against the test DB.
- `bun run e2e:webapp` - run the Playwright webapp smoke flow.
- `bun run deploy:do:specs` - generate validated DigitalOcean App Platform specs into `.scratch/deploy` only.

## Environment

Root `.env.example` defines Docker Compose database settings. `backend/.env.example` defines API runtime settings and placeholders for future integrations. `webapp/.env.example` and `website/.env.example` define frontend build-time URLs.

No production secrets should be committed. Real values belong in local `.env` files or the chosen deployment secret store.

Planned v1 env areas:

- PostgreSQL: `DATABASE_URL`, `TEST_DATABASE_URL`
- Auth/session: `JWT_SECRET`, token TTLs, `COOKIE_SECURE`, `TRUST_PROXY_HEADERS`
- First admin setup: one-off `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_DISPLAY_NAME`
- Public URLs/CORS: `CORS_ORIGINS` for public browser API origins, `AUTH_CORS_ORIGINS` for admin webapp cookie/auth origins, `PUBLIC_API_URL` for proposal/PDF links, `PUBLIC_WEBSITE_URL` for public page/example links inside proposal snapshots, and `PUBLIC_WEBAPP_URL` for admin detail links
- Telegram notifications: `TELEGRAM_BOT_TOKEN` and approved internal `TELEGRAM_CHAT_ID`; leave either blank to skip notifications safely
- PDF/proposal storage: persistent local volume, object storage, or another approved durable store
- Public contacts: phone/email/Telegram shown on the public page and PDF

Frontend env files are build-time configuration:

- `webapp/.env`: `VITE_API_URL=http://localhost:3000`
- `website/.env`: `PUBLIC_API_URL=http://localhost:3000`, `PUBLIC_WEBAPP_URL=http://localhost:5173`, and `PUBLIC_WEBSITE_URL=http://localhost:4321`

Do not put backend secrets, Telegram tokens, database URLs, JWT secrets, or storage keys into frontend env files.

## Verification

```bash
bun install --frozen-lockfile
bun run typecheck
bun run build
bun run test:deploy
bun run test:contracts
bun run test:backend:unit
bun run test:backend:integration
bun run test:webapp
```

Database-backed and browser checks require Docker:

```bash
docker compose version
docker info
bun run --cwd webapp e2e:install
bun run e2e:webapp
bun run smoke:backend:docker
```

Repository hygiene checks before handoff or deploy:

```bash
git remote -v
git status --short --branch
git log --oneline --decorate -n 20
git ls-files -o --exclude-standard
git diff --check
```

Manual no-secrets check used for handoff:

```bash
rg --files -g ".env*" -g "!node_modules/**" -g "!.git/**" -g "!.scratch/**"
rg -n --pcre2 "(ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]+PRIVATE KEY-----)" -g "!node_modules/**" -g "!.git/**" -g "!.scratch/**" -g "!bun.lock" -g "!*.svg"
```

## GitHub

Repository: `https://github.com/iljadanilyuk/engineering-calculator`

Current local status:

- `origin` is configured as `https://github.com/iljadanilyuk/engineering-calculator.git`.
- `main` tracks `origin/main`.
- Current handoff commit before PZK-012 was `c048c29 Complete PZK-011 project examples`.
- The original Vibe template remote is not configured.

Branch and commit convention:

- `main` is the current handoff branch and the deployment source branch used by docs/spec generation unless a future task explicitly changes it.
- Current task workflow commits completed work directly to `main` after the mandatory `task.md` review gate passes.
- Use one final commit per PZK task when practical, named like `Complete PZK-012 GitHub preparation`.
- If future work switches to PR branches, use `pzk-###-short-scope` from `main` and merge without rewriting published history.
- Do not rewrite the existing pushed history. Early setup docs between PZK-001 and PZK-002 remain as accepted historical commits; PZK task commits from PZK-002 onward are kept task-oriented.

CI:

- `.github/workflows/ci.yml` runs on pull requests and pushes to `main`/`master`.
- It installs dependencies with `bun install --frozen-lockfile`, then runs typecheck, build, deploy/script tests, contract tests, webapp tests, backend tests, Playwright browser install, and the webapp E2E smoke flow.

## Deployment Notes

No DigitalOcean paid resources, apps, databases, Spaces buckets, or DNS records have been created for this product. PZK-013 is complete as a decision record and PZK-014 is deploy-prep only; provisioning remains behind a separate explicit user approval.

Use [docs/deployment/digitalocean-decision-gate.md](docs/deployment/digitalocean-decision-gate.md) for the selected deployment shape, [docs/deployment/digitalocean-app-platform-prep.md](docs/deployment/digitalocean-app-platform-prep.md) for the PZK-014 App Platform/DNS prep checklist, [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the broader deployment runbook, [docs/LOCAL_DATABASE.md](docs/LOCAL_DATABASE.md) for local PostgreSQL, [docs/TESTING.md](docs/TESTING.md) for verification details, and [docs/STORAGE.md](docs/STORAGE.md) when generated files or media need persistent storage.

## Template Attribution

This project is derived from the Vibe Coding Template by Dima Sukharev. Keep `LICENSE` and `NOTICE` with the template attribution when distributing this derivative.
