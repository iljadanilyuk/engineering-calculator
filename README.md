# Poznyak Engineering Calculator

Full-stack calculator for engineering design commercial offers for `ИП Позняк`.

The project is scaffolded from the Vibe template (`https://github.com/di-sukharev/vibe`) and keeps the template's monorepo shape:

- `website` - public Astro surface for the landing page and calculator.
- `webapp` - React/Vite admin cabinet for services, leads, and settings.
- `backend` - Hono API with Prisma/PostgreSQL, auth, proposal generation, and integrations.
- `packages/contracts` - shared Zod contracts and API/domain types.

Mobile is deferred. DigitalOcean deployment is deferred until the deployment decision gate is approved in `task.md`.

Domain DNS decision: keep DNS at the current registrar. After a DigitalOcean app exists, add the required CNAME/A records at the registrar to point the production domain or subdomain to the DigitalOcean app target. Do not move nameservers to DigitalOcean unless that decision changes explicitly.

## Product Direction

The first product version should let public users calculate an indicative design-work offer, submit name and phone, and download a polished PDF proposal. Admin users should manage services/prices, review submitted calculations, change lead statuses, and use the app as a lightweight mini-CRM.

Important project choices are tracked in [task.md](task.md). The current brand placeholder is `ИП Позняк`.

## Local Setup

Install dependencies:

```bash
bun install
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
```

Apply Prisma migrations:

```bash
bun run --cwd backend prisma:migrate
```

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
- `bun run test:contracts` - run shared contract tests.
- `bun run test:backend:unit` - run backend unit tests.
- `bun run test:backend:integration` - run DB-backed backend integration tests.
- `bun run test:webapp` - run webapp tests.
- `bun run e2e:webapp` - run the Playwright webapp smoke flow.

## Environment

Root `.env.example` defines Docker Compose database settings. `backend/.env.example` defines API runtime settings and placeholders for future integrations.

No production secrets should be committed. Real values belong in local `.env` files or the chosen deployment secret store.

Planned v1 env areas:

- PostgreSQL: `DATABASE_URL`, `TEST_DATABASE_URL`
- Auth/session: `JWT_SECRET`, token TTLs, cookie flags
- Public URLs/CORS: `CORS_ORIGINS`, later proposal/admin/public URLs
- Telegram notifications: bot token and approved internal chat ID
- PDF/proposal storage: persistent local volume, object storage, or another approved durable store
- Public contacts: phone/email/Telegram shown on the public page and PDF

## Verification For PZK-001

The scaffold task is considered healthy when these checks pass or are explicitly documented:

```bash
bun install
bun run typecheck
bun run build
bun run test:contracts
bun run test:backend:unit
bun run test:webapp
```

For backend smoke checks:

```bash
docker info
docker compose up -d postgres
bun run dev:backend
```

For browser surface smoke checks:

```bash
bun run dev:webapp
bun run dev:website
```

## GitHub

Repository: `https://github.com/iljadanilyuk/engineering-calculator`

Current local status:

- `origin` is configured as `https://github.com/iljadanilyuk/engineering-calculator.git`.
- `main` tracks `origin/main`.
- The original Vibe template remote is not configured.

## Template Attribution

This project is derived from the Vibe Coding Template by Dima Sukharev. Keep `LICENSE` and `NOTICE` with the template attribution when distributing this derivative.
