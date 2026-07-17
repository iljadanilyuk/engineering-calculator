# Poznyak Engineering Calculator - Task Tracker

Date: 2026-07-08
Workspace: `E:\vc\poznyak-engineering-calculator`

## 1. Project Goal

Build a small full-stack application for calculating commercial offers for engineering design work, mainly heating and related engineering networks.

The product must serve two audiences:

- Public users: homeowners or clients who need to quickly calculate an indicative commercial offer and download a PDF after leaving name and phone.
- Internal users/admin: the owner/team who can edit services and prices, review submitted calculations, change lead statuses, and use the tool as a lightweight mini-CRM.

The current HTML prototype is only a source reference, not the final architecture:

- `E:\vc\рабочка\raschet-proektnyh-rabot (2).html`

Sample project PDFs to use as portfolio/example assets:

- `E:\vc\bella\primer_proekt_vk.pdf`
- `E:\vc\bella\proekt_primer_ov.pdf`

## 2. Scaffold And Stack

Use the Vibe portal template as the base:

- Template: `https://github.com/di-sukharev/vibe`
- Preferred project slug: `poznyak-engineering-calculator`
- Expected surfaces:
  - `website`: public, indexable landing/calculator page.
  - `webapp`: authenticated admin cabinet.
  - `backend`: API, persistence, auth, PDF generation, Telegram notifications.
  - `packages/contracts`: shared API shapes and validation schemas.

Preferred template patterns:

- Bun
- Hono backend
- Prisma
- PostgreSQL
- Zod contracts
- TanStack Query/Form/Router where applicable
- Astro for public website
- React for admin webapp
- Docker Compose for local dependencies
- Playwright or equivalent browser verification for public and admin flows

Calculation logic must live in a shared pure domain module with tests, so website, admin previews, backend validation, and PDF generation all use the same rules.

Do not add production dependencies, cloud resources, paid services, or hosted automation without explicit user approval.

## 3. Product Scope

### Public Page

Required sections:

- First screen: clear offer + calculator.
- Calculator:
  - Area input.
  - Service selection.
  - Mixed pricing support:
    - price per square meter;
    - fixed price;
    - optional future formulas.
  - Main prices shown in Belarusian rubles.
  - USD shown only as a smaller secondary reference.
  - Use the Belarusian ruble symbol/mark where technically safe; confirm the exact production glyph/notation before final launch.
  - Default formatting draft:
    - BYN primary: `1 250 Br` or confirmed Belarusian ruble mark.
    - USD secondary: `~385 $`.
    - No BYN cents in public totals unless explicitly needed.
    - Use Russian-style thousands separators.
    - PDF/browser fallback may use `BYN` if the chosen symbol does not render reliably.
- Name and phone are required before PDF download.
- PDF commercial offer is generated after lead submission.
- Lead is saved with calculation details and a link to the generated commercial offer.
- Telegram notification is sent after successful submission when Telegram env vars are configured.

Landing structure:

- Offer and calculator.
- Examples of projects.
- What is included in the design work.
- Work stages.
- FAQ.
- Contacts.

Visual direction:

- Light, strict engineering bureau interface.
- Clear grid, calm typography, restrained accents.
- No overloaded cards or mixed blocks.
- The calculator must feel like the primary working tool, not a decorative landing widget.

### Admin Cabinet

Required screens:

- Login by email/password.
- Services/prices:
  - Add service.
  - Edit service.
  - Delete or archive service.
  - Enable/disable service visibility.
  - Configure calculation type: fixed, per square meter, or future formula.
  - Base prices are entered in USD.
- Leads/calculations:
  - Table of submitted calculations.
  - Name.
  - Phone.
  - Date/time.
  - Area.
  - Selected services.
  - Total in BYN.
  - Secondary total in USD.
  - Link to generated PDF/commercial offer.
  - Status dropdown.
  - Notes/comment field if simple to include.
  - Search/filter by status, phone, name, and date if practical for v1.
- Settings:
  - USD/BYN exchange rate source or manual override.
  - Telegram bot token/chat ID as documented env vars for v1.
  - Contact details shown in PDF/public page.

Lead statuses for v1:

- New
- Contacted
- In progress
- Won
- Lost
- Spam/Test

CRM status rules:

- New submissions default to `New`.
- Status values must be enforced by DB/API validation, not only by UI labels.
- Each lead stores current status and `statusUpdatedAt`.
- If simple to include, store status history; otherwise at minimum update timestamp and current admin notes.
- `Spam/Test` should be excluded from active lead counts by default.
- Notes/comments are internal admin-only fields.

## 4. PDF Commercial Offer

PDF must be a polished commercial offer, not a raw browser print.

Hard limits:

- Maximum 2 pages.
- Page 1: immediate value for the client.
  - Client name/object if provided.
  - Date and offer number/id.
  - Area and selected services.
  - Clear total in BYN.
  - Small USD reference.
  - Payment terms and validity note.
- Page 2: trust and sales support.
  - Short explanation of what is included.
  - Links or QR codes to sample projects.
  - Short process/stages.
  - Contact block.

The PDF should remain readable on mobile after download and printable on A4.

## 5. Data Model Draft

Entities:

- User
  - id
  - email
  - password hash or auth provider id
  - role
- Service
  - id
  - title
  - description
  - pricingType: `fixed` | `per_sqm` | `formula`
  - priceUsdCents or decimal
  - pricingRule/config
  - formulaVersion where relevant
  - isActive
  - sortOrder
  - createdAt
  - updatedAt
- Calculation
  - id
  - publicToken or slug
  - clientName
  - clientPhone
  - areaSqm
  - selectedServicesSnapshot
  - exchangeRate
  - totalUsd
  - totalByn
  - pdfUrl
  - status
  - notes
  - utm/referrer fields where available
  - createdAt
  - updatedAt
- Proposal
  - id
  - calculationId
  - publicToken or slug
  - offerNumber
  - templateVersion
  - pdfUrl
  - storageKey
  - checksum
  - htmlSnapshot or render data
  - createdAt
- AppSetting
  - key
  - value
- ProjectExample
  - id
  - title
  - description
  - fileUrl
  - coverImageUrl if available
  - isPublic
  - sortOrder
- AuditLog, if practical
  - id
  - actorId
  - action
  - entityType
  - entityId
  - metadata
  - createdAt

Important: calculations must store service snapshots, not only service IDs, so old commercial offers stay stable after price edits.

Important: avoid floating point money math. Store USD prices as cents or a precise decimal type and round BYN consistently in one shared calculation module.

Important: public proposal/PDF links must use unguessable tokens. Do not expose sequential IDs publicly. Token-protected links can be opened by the client; admin-only detail links require authentication. Private files must not be discoverable by path guessing.

Important: generated proposals are immutable artifacts. Admin should open the exact original PDF/render snapshot created for that lead, never a regenerated document based on current services, current prices, current settings, or current exchange rates.

## 6. Currency Rules

- Admin enters base service prices in USD.
- Public page and PDFs show BYN as the primary price.
- USD appears as a secondary reference in smaller text.
- The exchange rate can come from NBRB or manual admin override.
- Store the exact exchange rate used for each calculation.
- Changing the exchange rate later must not change previously generated offers.
- If the rate is missing or stale, show a clear admin/public warning and use the configured fallback instead of silently using an old hardcoded value.

## 7. Telegram Notifications

Telegram notification should include:

- Lead name.
- Phone.
- Area.
- Total BYN.
- Small USD total.
- Selected services.
- Link to admin calculation detail.
- Link to generated PDF if available.

Notification must not block lead creation. If Telegram fails, save the lead and log/report the notification error.

For v1, Telegram bot token and chat ID should be environment variables, not admin-editable fields. If a later version makes Telegram secrets editable in the admin UI, require encryption at rest, masked display, no token echo in API responses, and audit logging.

Telegram messages include personal data, so keep the message concise and send only to the approved internal chat.

## 8. Deployment Target

Target:

- GitHub repository as a standalone project.
- DigitalOcean deployment as a separate app/resources grouped under a dedicated DigitalOcean Project.

DigitalOcean billing/project decision:

- DigitalOcean Projects are organizational groupings, not separate paid subscriptions.
- Billing is accrued at the team/account level based on actual resources used, regardless of how many Projects exist.
- A new DigitalOcean Project named `engineering-calculator` was created on 2026-07-08 for organization only.
- DigitalOcean Project ID: `e0c43cc8-3ea8-4c16-a390-738e56d9c3e3`.
- Environment: `Development`.
- Resources at organizer creation time: none.
- Current resources after PZK-015: three DigitalOcean App Platform apps and one Managed PostgreSQL 18 cluster. Spaces, Droplets, Valkey, and additional paid resources remain not created.
- When creating future DigitalOcean App Platform resources for this product, pass this Project ID explicitly so resources do not land in the default project by accident.
- Moving resources between Projects is separate approved work and does not stop billing for those resources; deleting or scaling down resources is what changes resource billing.

Deployment preparation:

- Keep environment variables documented in `.env.example`.
- Use Docker/Compose-compatible local setup.
- Include clear README setup steps.
- Do not hardcode secrets.
- Plan for persistent PostgreSQL and persistent/generated PDF storage.
- Decide explicitly between DigitalOcean App Platform and Droplet + Docker Compose before production deployment.
- Do not rely on ephemeral filesystem storage for generated PDFs. Use persistent volume, object storage, database-backed proposal HTML, or DigitalOcean Spaces/S3-compatible storage.
- Prisma migrations must run predictably during deploy.
- Verify Bun/Node/runtime versions and monorepo build paths on the selected DigitalOcean target.
- If server-side PDF rendering uses Chromium/headless browser tooling, include the required Linux/Docker dependencies.

Deployment decision gate:

- Before creating cloud resources, choose and document DigitalOcean App Platform vs Droplet + Docker Compose.
- Document database choice, generated PDF/proposal storage, migrations, health checks, env vars, runtime versions, domain/HTTPS/proxy assumptions, backups, rollback plan, and expected monthly cost/risk.
- Domain DNS decision: keep DNS management at the current registrar. After the DigitalOcean app exists, add the required CNAME/A records at the registrar to point the domain or subdomain to the DigitalOcean app target. Do not move nameservers to DigitalOcean unless the user explicitly changes this decision.
- Use DigitalOcean App Platform's self-managed/custom domain path where the registrar keeps DNS control. Do not add `domains[].zone` in App Platform specs unless the user explicitly decides to move DNS management to DigitalOcean.
- Domain attach sequence:
  - create the DigitalOcean app first;
  - add the custom domain(s) in App Platform;
  - copy DigitalOcean-provided CNAME/A/AAAA/TXT records;
  - add those records at the registrar;
  - allow DNS/TLS propagation time.
- Define hostnames before cutover. The project may have separate website, webapp/admin, and backend surfaces; one hostname cannot cleanly point to multiple separate App Platform apps.
- For apex/root domains, avoid assuming plain CNAME support. Use CNAME flattening/ALIAS/ANAME if the registrar supports it, or DigitalOcean-provided A/AAAA records. Prefer CNAME for subdomains.
- Decide canonical `www` vs apex before launch. If both should work, add both in App Platform and registrar DNS, then redirect one to the canonical host.
- After custom domains are live, update deployment env vars such as backend CORS origins, API/public URLs, website webapp links, and proposal URLs. `*.ondigitalocean.app` URLs are bootstrap/interim values only.
- Watch TLS/DNS blockers: preserve or adjust CAA records to allow DigitalOcean's certificate issuers, check DNSSEC compatibility, and keep wildcard verification TXT records current if wildcards are used.
- Preserve existing registrar DNS records such as MX, SPF, DKIM, DMARC, and existing verification TXT records. Remove only conflicting old A/AAAA/CNAME records for the same host during cutover.
- Treat Cloudflare/external CDN and Spaces CDN file domains as separate DNS/certificate flows if they are introduced later.
- Get explicit user approval before provisioning or changing paid cloud resources.

Before relying on Docker locally, check:

```powershell
docker info
```

If Docker Desktop is unavailable, report the blocker and use a safe non-Docker fallback only when appropriate.

## 9. Review And Execution Protocol

This protocol is mandatory for every new task in this project.

### Before Each Task

Start a sub-agent:

- Model: `gpt-5.5`
- Reasoning: `xhigh`
- In this Codex environment, use `multi_agent_v1.spawn_agent` when available.
- Purpose:
  - describe likely pitfalls;
  - list important edge-cases;
  - flag potentially problematic implementation areas.

Use the result to adjust the implementation plan before editing.

### After Each Task

Start one or more code-review sub-agents:

- Model: `gpt-5.5`
- Reasoning: `xhigh`
- In this Codex environment, use `multi_agent_v1.spawn_agent` when available.
- Each reviewer must:
  - rate the implementation from 1 to 10;
  - list required changes;
  - identify test/verification gaps.

Do not leave the review loop until at least one reviewer gives `9.5/10` or higher.

After receiving the required rating:

- Apply all reviewer changes that are agreed with.
- Run the relevant verification.
- Mark the task as done in this file.
- Record review scores/results in this file or a dedicated review log.
- If reviewer-driven changes are material, run another focused review before committing.
- Commit the completed task, including code/docs and tracker status together.
- Move to the next open task.

If sub-agent tools are unavailable in a future window, stop and tell the user that the mandatory review workflow is blocked.

This is intentional. Do not silently replace the required `gpt-5.5 xhigh` review gate with a weaker process unless the user explicitly approves a fallback in that future window.

## 10. Task List

### PZK-000 - Project Task File

Status: complete

Goal:

- Create this `task.md` with requirements, architecture, risks, and execution workflow.

Done when:

- The document exists in the project folder.
- It captures the public/admin/PDF/lead/Telegram/GitHub/DigitalOcean requirements.
- It includes the mandatory sub-agent review workflow.

### PZK-001 - Scaffold Vibe Project

Status: complete

Goal:

- Clone/use the Vibe template.
- Rename project/package identifiers to `poznyak-engineering-calculator`.
- Detach template remote unless intentionally contributing upstream.
- Add initial README and `.env.example`.

Acceptance criteria:

- Local install works.
- Basic website, webapp, and backend scripts run.
- Repo is initialized locally.
- No production secrets are committed.
- Verification commands/scripts are documented.

Completion notes:

- Vibe template cloned to a temporary folder and merged into the existing local repository without copying template `.git`.
- Existing git history preserved; previous commit remains `43265b3 Add project task tracker`.
- Template source used: `https://github.com/di-sukharev/vibe` at `8562ffae2311` (`Add TanStack auth query mutations`).
- Project/package identifiers renamed to `poznyak-engineering-calculator`, `@poznyak-engineering-calculator/*`, and local database names `poznyak_engineering_calculator` / `poznyak_engineering_calculator_test`.
- `task.md` preserved.
- `README.md` and `.env.example` / `backend/.env.example` added for local setup, placeholders, and v1 integration notes.
- GitHub repository name recorded as `engineering-calculator`.
- GitHub repository URL: `https://github.com/iljadanilyuk/engineering-calculator`.
- Remote status: `origin` is configured as `https://github.com/iljadanilyuk/engineering-calculator.git`.
- Push status: `main` is pushed and tracks `origin/main`.
- Docker status after verification: project-specific Compose/smoke containers were stopped/removed.
- No paid DigitalOcean/cloud resources were created or changed.
- DigitalOcean Project organizer created later: `engineering-calculator` / `e0c43cc8-3ea8-4c16-a390-738e56d9c3e3`; at the time of this scaffold task it contained no resources. PZK-015 later added production App Platform apps and Managed PostgreSQL 18.

Verification:

- `bun install --frozen-lockfile` passed.
- `bun run typecheck` passed.
- `bun run build` passed; non-blocking warnings: Vite webapp chunk-size warning and inherited local `NODE_TLS_REJECT_UNAUTHORIZED=0` warning during Astro build.
- `bun run test:deploy` passed: 15/15.
- `bun run test:contracts` passed: 5/5.
- `bun run test:backend:unit` passed: 22/22.
- `bun run test:webapp` passed: 37/37.
- `bun run test:backend:integration` passed: 9/9 using Docker PostgreSQL test DB.
- Runtime smoke passed for backend `/health`, webapp `/`, and website `/` on temporary local ports.
- `bun run smoke:backend:docker` passed, including backend Docker image build, `/health`, and DB-backed auth smoke.
- `bun run e2e:webapp` passed: 2/2.
- Manual no-secrets scan run with `rg --pcre2`; findings were reviewed as false positives in SVG path data, lockfile hashes/package names, and documented `openssl rand` examples.

### PZK-002 - Shared Calculation Domain And Contracts

Status: complete

Goal:

- Implement the shared calculation module and API contracts before UI and PDF depend on them.

Acceptance criteria:

- Calculation logic is pure and covered by unit tests.
- Supports fixed and per-square-meter services.
- Uses cents/decimal money math and consistent BYN rounding.
- Stores/returns enough breakdown data for UI, backend, admin preview, and PDF.
- Zod/shared contracts exist for service, calculation, lead submission, and proposal shapes.
- Verification includes unit tests for normal, empty, fixed-only, per-square-meter, large-area, inactive-service, and rounding cases.

Completion notes:

- Added `packages/contracts/src/calculation.ts` as the shared pure calculation/domain module and exported it from `packages/contracts/src/index.ts`.
- Services support `fixed`, `per_sqm`, and future `formula` pricing; unsupported formula services are skipped with explicit breakdown metadata until formula evaluation is implemented.
- Calculation uses integer/BigInt math: USD cents, area hundredths, scaled USD/BYN rate, BYN cents, and one named BYN display rounding rule. JS floating point totals are not used as source of truth.
- Result payload includes immutable-friendly service snapshots, line items, skipped services, exchange-rate snapshot, totals, rounding policy, and calculation version for UI/backend/admin/PDF reuse.
- Added Zod contracts for engineering services, exchange-rate snapshots, calculation input/result, lead submission, and proposal artifacts.
- Proposal contract requires an unguessable public token and either immutable PDF artifact metadata with checksum or an immutable HTML snapshot.
- Hardened contracts with strict discriminated quantity shapes, reason-specific skipped-service shapes, HTTPS-only proposal URLs, and shared proposal artifact validation.
- Added unit tests for normal mixed calculation, empty selection, fixed-only, per-square-meter-only, large area, inactive service, unsupported formula service, rounding, BYN line-total reconciliation, contract negatives, lead submission, and proposal shapes.

Verification:

- `bun run test:contracts` passed: 16/16.
- `bun run --cwd packages/contracts typecheck` passed.
- `bun run typecheck` passed.

### PZK-DESIGN-001 - Public Calculator Visual Concept

Status: complete

Goal:

- Prepare a visual direction for the public calculator page before PZK-004 implementation.
- Produce one desktop PNG mockup that the user can open and evaluate for design direction.

Acceptance criteria:

- First screen shows `ИП Позняк`, offer copy, and a working-calculator visual.
- Page structure covers object parameters, service selection, live BYN/USD result summary, included project work, object examples, process stages, lead CTA, contacts, and future PDF/proposal state.
- Design brief exists at `docs/design/public-calculator-visual-brief.md`.
- Static preview source exists separately from production UI and does not wire backend/API behavior.
- Final PNG exists at `docs/design/public-calculator-concept.png`.
- No production UI/backend, DigitalOcean resources, paid cloud resources, or Codex plugin-layer changes are introduced.

Completion notes:

- Added `docs/design/public-calculator-visual-brief.md` with visual direction, grid/composition, palette, typography, shadcn/21st component recommendations, Heaton/GALF adaptation notes, NBRB BYN sign notes, questionnaire-flow notes, mobile notes, states for PZK-004, and screenshot command.
- Added `docs/design/public-calculator-concept.html` as a standalone static desktop preview source, outside the production `website` route.
- Generated `docs/design/public-calculator-concept.png` as a 1440px-wide full-page desktop mockup.
- The mockup uses fixture services/rate aligned with the shared calculation domain: area, selected services, `fixed` and `per_sqm` pricing, BYN primary total with a visual BYN graphic-mark approximation, USD secondary reference, future formula as `по запросу`, and future proposal/PDF state.
- After user feedback, revised the concept from the initial green calculator-first layout into a classic hero structure: headline, sub-offer, real design-work bullets, then a wider calculator workbench.
- Added project-symbol service rows, stronger calculator controls, downloadable PDF example actions for the known VK/OV sample projects, and a post-КП questionnaire flow based on the structure of `docs/design/Опросный лист.xlsx`.
- After follow-up user feedback, softened the v2 visual language, removed sharp corporate corners and public-facing internal warning copy, switched to a single sans-serif UI stack, aligned the calculator fixture with `docs/design/Стоимость проектных работ (1).xlsx`, and added valve-style section toggles as the primary interaction idea.
- After latest typography/identity feedback, produced a local v4 revision with a dark navy first screen, Google Fonts `Montserrat` + `IBM Plex Sans`, orange CTA/lever accent, classic hero order, client-facing bullets before the calculator, a simpler Excel-like calculator, lever-handle faucet switches instead of circular valves, and cleaner public copy.
- The filled XLSX questionnaire source contains example/client-like answers and is intentionally ignored rather than committed.
- The pricing XLSX source is also intentionally ignored rather than committed.
- Reviewer feedback corrected the fixture so visible BYN line totals reconcile with the displayed BYN total, added an explicit contacts section, and made PDF download controls credible static links.
- The v4 review gate passed with reviewer Poincare score `9.6/10` after the visible BYN total was reconciled to `3 143 Br` and the contact pattern was added without fake phone/email values.
- No backend/API, Astro production page, webapp, cloud resources, or Codex plugin-layer files were changed.

Verification:

- `bun x playwright screenshot --full-page --viewport-size=1440,2600 "file:///E:/vc/poznyak-engineering-calculator/docs/design/public-calculator-concept.html" docs/design/public-calculator-concept.png` passed.
- PNG dimension check passed: `1440 x 5281`.
- PDF page count check with `pypdf` passed: `primer_proekt_vk.pdf` 24 pages, `proekt_primer_ov.pdf` 39 pages.
- Visual inspection of `docs/design/public-calculator-concept.png` passed after regeneration.
- Initial post-task review gate passed with reviewer Bohr score `9.6/10`; v2 user-feedback review loop continued in the review log below.

### PZK-003 - Backend Data Model And Services API

Status: complete

Goal:

- Implement services, calculations, settings, and project examples persistence.
- Wire backend API to the shared calculation/contracts layer.

Acceptance criteria:

- Prisma schema and migrations exist.
- API validates inputs with shared contracts.
- Service snapshots are stored with each calculation.
- Public/client-submitted totals are never trusted; backend recalculates before saving and generating PDF.
- Money math uses cents/decimal, not JS floating point totals as the source of truth.
- Migration check and API persistence tests are run or documented.

Completion notes:

- Added Prisma models and migration for `services`, `calculations`, `proposals`, `app_settings`, and `project_examples`.
- Money, area, and totals are persisted as scaled integers/`BIGINT`: USD cents, BYN cents, rounded BYN rubles, area hundredths, and USD/BYN rate scaled by `10000`.
- Added DB checks for nonnegative money, positive area/rate, allowed lead statuses, public token format, proposal checksum format, and proposal artifact completeness.
- Added shared backend API contracts for service records, service mutations, exchange-rate settings, calculation save/record responses, project examples, and proposal artifact references.
- Added backend engineering routes under `/api/public/*` and `/api/admin/*`; admin routes use the existing bearer auth middleware.
- Public calculation saves validate with shared contracts, fetch current public services/rate from the database, recalculate through the shared calculation domain, ignore client-submitted fake totals/snapshots, and persist the recalculated immutable snapshot.
- Public calculation saves reject unavailable selected services before persistence, including missing IDs, inactive services, unsupported formula services, and active but non-public services.
- Saved calculations store service snapshots, skipped-service data, exchange-rate snapshot, calculation version, full calculation snapshot, totals, status, source metadata, and future proposal artifact references.
- Project-example persistence/API foundations were added without copying or committing source XLSX/PDF assets.
- No production public UI, lead-capture/PDF workflow, DigitalOcean resources, paid cloud resources, or Codex plugin-layer files were changed.

Verification:

- `bun run test:contracts` passed: 16/16.
- `bun run --cwd backend test:unit` passed: 22/22.
- `bun run --cwd backend test:integration` passed: 15/15, including `prisma migrate deploy` applying `20260516170057_init` and `20260708152036_pzk003_data_model_services_api` to a Docker PostgreSQL test DB.
- `bun run --cwd backend prisma:validate` passed.
- `bun run typecheck` passed.
- `git diff --check` passed with only expected Windows CRLF warnings.

### PZK-004 - Public Calculator MVP

Status: complete

Goal:

- Build the public landing/calculator page from the current HTML prototype and confirmed requirements.

Acceptance criteria:

- User can enter area, choose services, and see total in BYN with small USD reference.
- UI uses the shared calculation module/contracts rather than duplicated formulas.
- Layout works on desktop and mobile.
- Sections exist: offer, examples, included work, stages, FAQ, contacts.
- Visual style matches strict engineering bureau direction.
- Browser verification checks public calculator load, service toggles, total updates, and mobile layout.

Completion notes:

- Replaced the placeholder public `website` index with the PZK-DESIGN-001 v4 direction: dark navy engineering first screen, `ИП Позняк` identity, strict grid, `Montserrat` headings, `IBM Plex Sans` UI/body text, orange lever/switch signature, BYN primary totals, and USD secondary references.
- Added a working browser calculator for area input, service toggles, `fixed` services, and `per_sqm` services.
- Added `@poznyak-engineering-calculator/contracts` to the website workspace and uses the shared `calculateEngineeringOffer` domain in both the prerendered initial state and the client-side interactive recalculation path.
- Added fallback public services from the approved v4 pricing fixture and an optional `PUBLIC_API_URL` path that can read `GET /api/public/services`; unsupported/inactive/formula services are filtered from the public selector.
- Kept PZK-004 inside scope: no real lead submission, no `POST /api/public/calculations`, no PDF generation, no Telegram notification, no cloud/DigitalOcean changes, and no Bella/ads file changes.
- Added sections for offer/calculator, included work, examples/projects, stages, FAQ, and contacts.
- Displayed row BYN rubles are allocated from shared-domain BYN cents so visible breakdown rows reconcile with the shared-domain headline total.
- Service switch focus is restored after row re-render so keyboard users do not lose focus after toggling.

Verification:

- `bun run typecheck` passed.
- `bun run test:contracts` passed: 16/16.
- `bun run typecheck:website` passed.
- `bun run build:website` passed; non-blocking inherited local warning: `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- Browser verification passed against local Astro preview on `http://127.0.0.1:49321/` with `node .scratch\verify-public-calculator.mjs http://127.0.0.1:49321/`.
- Browser verification covered page load, desktop calculator rendering, area change from `180` to `200`, fixed-service price stability, per-square-meter price update, service toggle total update, no request to `/api/public/calculations`, lead shell non-submission status, visible BYN breakdown reconciliation with headline total, keyboard toggle focus restore, mobile `390px` layout without horizontal overflow, and desktop/mobile screenshots in `.scratch`.

### PZK-005 - Lead Capture And Calculation Save

Status: complete

Goal:

- Require name and phone before PDF generation.
- Save submitted calculations/leads.

Acceptance criteria:

- Invalid phone/name are handled with inline errors.
- Phone is normalized server-side and accepts Belarusian plus common international formats.
- Calculation persists with totals, selected service snapshot, rate, and source metadata.
- Public success state links to the generated PDF or offer page.
- Duplicate submissions are mitigated with idempotency, throttling, or sensible duplicate detection by session/phone/time window.
- Public lead endpoint has basic rate limiting and spam/abuse protection.
- Repeated PDF generation attempts are safe and do not create uncontrolled duplicate files.
- Personal data consent is implemented before public launch:
  - consent checkbox or clear submit text;
  - privacy/data handling link or note;
  - retention/deletion approach documented;
  - Telegram PII sharing limited to the approved internal chat.
- API/browser verification covers valid submission, invalid fields, duplicate attempt, and recalculation on server.

Completion notes:

- Added real public lead capture on the Astro calculator with required name, phone, consent checkbox, inline field errors, loading/error/success states, and idempotency reset when the calculation or contact fields change.
- Added `GET /api/public/calculator-config` so the public page can load the same services and exchange-rate snapshot used by backend persistence.
- Extended `POST /api/public/calculations` to normalize phone numbers server-side, recalculate totals from DB services and the current stored exchange-rate setting, persist immutable calculation snapshots/totals/service snapshots/source/referrer/UTM metadata, and create a pending proposal artifact without rendering a PDF.
- Added a token-protected pending offer page at `GET /api/public/proposals/{token}` and linked it from the public success state. Full PDF rendering remains PZK-006.
- Added idempotency keys, request fingerprints, duplicate fingerprints with DB uniqueness, a short duplicate window, and basic public submit throttling. Exact idempotent retries return the existing calculation; mismatched same-key replays are not throttle-exempt and return conflict/429 as appropriate.
- Split public submit responses from admin calculation records so public responses do not expose DB ids, idempotency keys, audit hashes, source/referrer/UTM, consent IP/user-agent, notes, status, storage keys, or checksums.
- Persisted consent evidence on calculations: accepted timestamp, consent version, exact accepted text, IP address, and user-agent. Website privacy/contact copy now reflects that submitted lead data is stored for offer preparation and that correction/deletion contact details must be finalized before public launch.
- Updated DigitalOcean static-site/backend spec templates and generator so `PUBLIC_API_URL` is baked into the website build and backend CORS includes both webapp and website origins in the documented deploy order.
- Added `website/.env.example` and updated backend/local setup examples so local public lead capture can call the backend API.

Verification:

- `docker info` passed before DB-backed verification.
- `bun run typecheck` passed.
- `bun run test:contracts` passed: 16/16.
- `bun run test:deploy` passed: 16/16.
- `bun run test:backend:unit` passed: 22/22.
- `bun run test:backend:integration` passed: 21/21 using Docker PostgreSQL test DB.
- `PUBLIC_API_URL=http://127.0.0.1:49380 bun run build:website` passed; non-blocking inherited local warning: `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- Browser verification passed with `node .scratch\verify-pzk005-lead-ui-file.mjs`.
- Browser verification covered inline invalid name/phone/consent errors with no POST, valid submit with changed area and service selection reflected in payload, UTM capture, success state using backend-normalized phone and backend totals, pending offer-page link, and mobile `390px` layout without horizontal overflow.

### PZK-006 - PDF Commercial Offer

Status: complete

Goal:

- Generate a polished 2-page commercial offer.

Acceptance criteria:

- PDF includes page 1 calculation summary and page 2 proof/examples/process/contact.
- Proposal artifact is immutable: stored PDF binary or immutable render snapshot, offer number, template/version, checksum/storage key, exchange rate, and service title/price snapshots.
- Previous PDFs remain stable after service price edits.
- Admin opens the exact original artifact created by a lead, never a regeneration from current prices/settings.
- Cyrillic fonts, page breaks, mobile readability, and A4 print layout are verified.
- Long service lists remain within 2 pages or degrade to a compact summary with details available in the admin/offer page.
- Public PDF/proposal access uses unguessable token-protected links, not sequential IDs or predictable file paths.
- Verification includes PDF fixture/manual check for Cyrillic, 2-page limit, and token-protected access.

Completion notes:

- Added commercial proposal generation in `backend/src/engineering/proposal.ts` with a self-contained immutable HTML snapshot and PDF artifact generation through Chromium CLI print-to-PDF.
- Proposal rows now store final artifact metadata: `offerNumber`, `templateVersion`, `storageKey`, `checksumSha256`, `pdfBytes`, `pdfByteSize`, `htmlSnapshot`, `publicToken`, and `calculationSnapshot`.
- Added migration `20260709143000_pzk006_pdf_proposal_artifacts` for DB-backed immutable PDF bytes and positive byte-size checks while preserving compatibility with older HTML-only proposal artifacts.
- Public proposal access now has token-protected HTML and PDF routes: `/api/public/proposals/{token}` and `/api/public/proposals/{token}/pdf`, with `noindex` and private `no-store` cache headers.
- Public calculation response distinguishes final `ready` proposals from legacy `html_only` artifacts, so old HTML-only rows do not expose broken PDF links.
- Website success state now links to the real proposal page and PDF after successful lead submission, instead of the PZK-005 pending placeholder.
- PDF page 1 includes client/object, date, offer number, area, selected services, reconciled BYN line totals, large BYN total, USD reference, payment terms, and validity date.
- PDF page 2 includes what is included, work stages, example-project links/placeholders, and a contact block.
- Displayed BYN service rows in the PDF use allocation logic so visible line totals reconcile with the headline rounded BYN total.
- Long service lists compact to the first 8 visible rows plus a remaining-sum row to keep the commercial offer within the 2-page A4 layout.
- Docker backend image now installs Playwright Chromium dependencies for PDF rendering; `PDF_CHROMIUM_EXECUTABLE_PATH` is documented as an optional production override.

Verification:

- `docker info` passed before DB/Docker-backed verification.
- `bun run typecheck` passed.
- `bun run test:contracts` passed: 16/16.
- `bun run test:backend:unit` passed: 25/25.
- `bun run test:backend:integration` passed: 23/23 using Docker PostgreSQL test DB.
- `bun run build:website` passed; non-blocking inherited local warning: `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- `bun run smoke:backend:docker` passed, including backend Docker image build with Chromium dependencies, `/health`, and DB-backed auth smoke.
- PDF fixture generated with `bun .scratch\render-pzk006-pdf.mjs`; `pdfinfo .scratch\pzk006-commercial-offer.pdf` reported `Pages: 2` and `Page size: 594.96 x 841.92 pts (A4)`.
- Manual PDF visual check from Poppler PNG previews confirmed Cyrillic rendering, readable A4 layout, page 1/page 2 content, and reconciled fixture totals: `643 + 290 + 347 + 289 + 347 = 1 916 BYN`.
- Browser verification passed with `node .scratch\verify-pzk006-browser.mjs`: submit lead -> success state -> open token-protected proposal HTML -> fetch token-protected PDF; mobile proposal HTML at `390px` had no horizontal overflow.

### PZK-007 - Admin Auth

Status: complete

Goal:

- Add secure admin login by email/password.

Acceptance criteria:

- Admin routes are protected.
- Passwords/secrets are not stored in plaintext.
- There is a documented first-admin setup flow.
- Login has rate limiting or equivalent brute-force protection.
- Session/cookie settings are safe behind the DigitalOcean HTTPS/proxy setup.
- Logout and 401/403 states are implemented.
- Verification covers login, logout, unauthorized access, and protected API access.

Completion notes:

- Added admin-only auth semantics with `UserRole` and default `member` users; admin login requires `role = admin`, and authenticated non-admin users receive `403` on admin-only surfaces.
- Removed public browser self-registration. First admin setup is a one-off `bun run --cwd backend admin:create` command that hashes the password with Argon2id, refuses unsafe duplicate/admin creation by default, and is documented in README/deployment notes.
- Protected existing `/api/admin/*` engineering routes with `requireAdmin` while keeping public calculator, lead submission, proposal HTML, and PDF routes public/token-protected as before.
- Added DB-backed login brute-force protection with hashed email/client buckets and atomic PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` increments for concurrent failures.
- Split public CORS and credentialed admin/auth CORS: `CORS_ORIGINS` is public/non-credentialed, `AUTH_CORS_ORIGINS` is admin webapp only, and secure cookie refresh/logout trusts only `AUTH_CORS_ORIGINS`.
- Added production safety validation for `COOKIE_SECURE=true`, proxy-header trust via `TRUST_PROXY_HEADERS`, secure auth no-store headers, logout, and clear 401/403/429 states.
- Added a login-only webapp admin entry shell, session bootstrap, logout behavior, forbidden state, and Playwright coverage for anonymous, invalid, valid, reload, logout, and anonymous protected API behavior.

Verification:

- `bun run typecheck` passed.
- `bun run test:contracts` passed: 16/16.
- `bun run test:deploy` passed: 16/16.
- `bun run test:backend:unit` passed: 30/30.
- `bun run test:backend:integration` passed: 27/27 using Docker PostgreSQL test DB.
- `bun run test:webapp` passed: 37/37.
- `bun run build:webapp` passed; non-blocking Vite chunk-size warning only.
- `bun run e2e:webapp` passed: 2/2, including protected admin shell/login/logout browser flow.
- `bun run smoke:backend:docker` passed with production-like secure cookie, `AUTH_CORS_ORIGINS`, proxy headers, migrations, first-admin setup, `/health`, and DB-backed admin login smoke.
- `git diff --check` passed; only expected Windows LF/CRLF warnings were printed.

### PZK-008 - Admin Services Management

Status: complete

Goal:

- Build admin CRUD for services and prices.

Acceptance criteria:

- Admin can add/edit/archive/reorder services.
- Supports fixed and per-square-meter pricing.
- Prices are entered in USD and previewed in BYN.
- Archive is preferred over hard delete for services used in previous calculations.
- Verification covers create, edit, archive, reorder, and public visibility changes.

Completion notes:

- Added admin service management in the protected React admin shell with service list, add/edit dialog, archive/restore action, public visibility switch, sort up/down controls, fixed/per-square-meter pricing, USD entry, and BYN preview from the configured exchange rate.
- Extended the webapp API client and React Query layer for service listing, creation, update/archive/visibility changes, transactional reorder, and exchange-rate reads.
- Added `PATCH /api/admin/services/reorder` with a shared contract and transactional backend implementation.
- Service archive remains soft: no hard delete was added. Archived/inactive services are forced to `isPublic = false`, including direct API create/update paths.
- Public service/config responses now return only active, public, supported `fixed`/`per_sqm` services. Formula services remain future scope: admin can see/archive/reorder them, but UI edit/public toggles are disabled and direct API pricing-type transitions into/out of `formula` are rejected.
- Fixed/per-square-meter services require positive USD cents at contract/API layer.
- Old calculations and PDFs remain immutable because existing calculation/proposal flows continue to read stored snapshots rather than current service rows.

Verification:

- `bun run typecheck` passed.
- `bun run --cwd webapp lint` passed.
- `bun run test:contracts` passed: 17/17.
- `bun run test:backend:unit` passed: 30/30.
- `bun run test:webapp` passed: 38/38.
- `bun run build:webapp` passed; non-blocking inherited Vite chunk-size warning remains.
- `docker info` passed before Docker-backed verification.
- `bun run test:backend:integration` passed: 28/28, including create service, edit service, archive service, archived republish prevention, inactive create normalization, reorder service, toggle public visibility, invalid price/type rejection, formula transition rejection, and public services excluding inactive/non-public/unsupported services.
- `bun run e2e:webapp` passed: 3/3, including protected admin login, create service, edit title/price, BYN preview, public visibility toggle, archive, reorder, formula row disabled state, and public calculator config reflecting active public supported services only.

### PZK-009 - Admin Leads Mini-CRM

Status: complete

Goal:

- Build submitted calculations/leads table and detail page.

Acceptance criteria:

- Admin can see all calculations.
- New submissions default to `New`.
- Status dropdown supports and persists the v1 statuses from this document.
- Status updates persist `statusUpdatedAt`; status history is included if practical.
- Admin can open the generated PDF/offer.
- Leads table includes name, phone, created date/time, area, status, total BYN, secondary USD total, and PDF/proposal link.
- Detail view includes selected service snapshot, exchange rate used, current status/status history, and notes/comment field.
- Search/filter by status, phone, name, and date is included if practical; otherwise document the v1 limitation.
- `Spam/Test` is excluded from active lead counts by default.
- Verification covers status change, notes save, filters/search where included, and opening original proposal artifact.

Completion notes:

- Added shared admin calculation/lead CRM contracts for lean list rows, list query filters, status counts, and status/notes updates.
- Added protected backend endpoints:
  - `GET /api/admin/calculations` with status, name, phone, search, date, limit, and offset filters.
  - `GET /api/admin/calculations/{id}` for immutable detail snapshots.
  - `PATCH /api/admin/calculations/{id}` for status and notes.
- Status values remain enforced by shared Zod contract and existing DB constraint. Status updates change `statusUpdatedAt` only when the status actually changes; notes-only saves preserve the status timestamp.
- Notes are internal admin-only text, trimmed to null/limited by contract, and are not exposed in public lead submit responses.
- New submissions continue to default to `new` / `New`.
- Admin list shows name, phone, created date/time, area, selected service summary, status dropdown, BYN total, secondary USD total, and original proposal/PDF link.
- Admin detail shows contact/object data, selected service snapshot, exchange rate used, full line-item breakdown, current status, `statusUpdatedAt`, notes editor, and original immutable proposal/PDF artifacts.
- Proposal artifacts are ordered deterministically by creation time and linked by saved proposal public token. Admin opens stored artifact routes (`/api/public/proposals/{token}` or `/pdf`) and does not regenerate from current services/prices.
- `Spam/Test` is excluded from active lead count by default while still visible through explicit status filtering.
- Added webapp routes `/app/leads` and `/app/leads/$leadId`, plus a dedicated React Query/API client layer for leads.
- Added simple pagination for the leads table so the UI reports rendered ranges accurately instead of hiding records beyond the current page.
- Date filters now validate real calendar dates, rejecting impossible values such as `2026-02-31` and `2026-99-99`.
- Status history table was not added in v1; current status, `statusUpdatedAt`, and notes are implemented as the v1 minimum.
- No Telegram notifications, cloud resources, Bella/ads files, Codex plugin-layer changes, pricing editor expansion, or public PDF generation changes were made.

Verification:

- `bun run typecheck` passed.
- `bun run --cwd webapp lint` passed.
- `bun run test:contracts` passed: 17/17, including admin CRM query/status/date contract validation.
- `bun run test:backend:unit` passed: 30/30.
- `docker info` passed before Docker-backed verification.
- `bun run test:backend:integration` passed: 29/29, including list leads, detail lead, status update, notes save, invalid status rejection, `statusUpdatedAt` behavior, `Spam/Test` active-count exclusion, filters/search/date validation, auth checks for admin calculation routes, and immutable proposal/PDF links.
- `bun run --cwd webapp test` passed: 40/40, including lead API client calls and pagination range behavior.
- `bun run build:webapp` passed; non-blocking inherited Vite chunk-size warning remains.
- `bun run e2e:webapp` passed: 4/4, including admin login, leads table, filter/search, detail view, status change, notes save, and opening the original PDF/proposal artifact.
- `git diff --check` passed; only expected Windows LF/CRLF working-copy warnings were printed.

### PZK-010 - Telegram Notifications

Status: complete

Goal:

- Send Telegram notification for each new submitted calculation.

Acceptance criteria:

- Notification contains lead/contact/total/selected-services/admin-link/pdf-link.
- Failed Telegram delivery does not break lead submission.
- Environment variables are documented.
- Token/chat ID are not exposed to the browser or returned by API responses.
- Verification covers successful notification and simulated Telegram failure.

Completion notes:

- Added backend-only Telegram lead notifications in `backend/src/notifications/telegram.ts`.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are parsed from backend env only; blank or partial config skips notification safely and logs one concise skip message.
- Added `PUBLIC_API_URL` for proposal/PDF links and `PUBLIC_WEBAPP_URL` for admin detail links; notification link construction uses configured backend runtime URLs, not browser headers/referrers.
- `EngineeringDataService.saveCalculation` sends notification only after a real newly-created calculation/proposal is committed. Idempotent replays and recent duplicate returns do not resend Telegram messages.
- Telegram API failures are caught and logged with sanitized errors; lead creation and proposal generation still return successfully.
- Notification text includes lead name, phone, area, BYN total, rounded USD reference, selected services, admin detail link, and proposal/PDF link. It intentionally omits object name, UTM/referrer, IP, user-agent, consent text, notes, hashes, and other extra personal/internal data.
- `createApp` accepts an injected `leadNotifier` for tests, so automated verification never calls the real Telegram API.
- Documented Telegram/runtime URL env in `backend/.env.example`, `README.md`, `backend/README.md`, and `docs/DEPLOYMENT.md`.
- No admin UI for Telegram secrets, encryption-at-rest work, DigitalOcean resources, Bella/ads files, Codex plugin-layer changes, or broad CRM/PDF refactors were added.

Verification:

- `bun test src/env.test.ts src/notifications/telegram.test.ts` passed: 10/10.
- `bun run --cwd backend typecheck` passed.
- `docker info` passed before Docker-backed verification.
- `bun run test:backend:unit` passed: 35/35, including env parsing and Telegram notifier unit tests.
- `bun run test:backend:integration` passed: 32/32, including successful Telegram notification after public lead submit, missing env skip, simulated Telegram failure preserving lead/proposal creation, idempotent/duplicate no-resend behavior, API response no secret exposure, and message links to admin detail plus proposal/PDF.
- `bun run typecheck` passed for backend, contracts, webapp, and website.
- `bun run test:contracts` passed: 17/17.
- First `bun run smoke:backend:docker` attempt exceeded the initial 5-minute command timeout during the cold Docker image build; the build process completed afterward.
- Re-run `bun run smoke:backend:docker` passed with Docker cache: backend `/health` and DB-backed auth smoke succeeded.
- `git diff --check` passed; only expected Windows LF/CRLF working-copy warnings were printed.

### PZK-011 - Project Examples

Status: complete

Goal:

- Add public project examples using provided PDFs.

Acceptance criteria:

- Example project PDFs are available from public page and/or PDF offer.
- Admin can manage examples if included in v1.
- Files are stored in a deploy-safe location.
- Verification covers public access to example links and PDF offer links.

Completion notes:

- Added two real public PDF examples as deploy-time static website assets:
  - `website/public/project-examples/proekt-primer-ov.pdf`: 39 pages, 5,607,314 bytes.
  - `website/public/project-examples/primer-proekt-vk.pdf`: 24 pages, 3,511,548 bytes.
- Source PDFs were inspected for size/page count before copying. Total committed PDF size is about 9.1 MB, which is acceptable for the current static website deploy shape. Future larger examples or editable media should move to the production storage plan decided in PZK-013/PZK-014.
- Added shared `publicProjectExampleAssets` metadata in contracts so the website and proposal renderer use the same public paths, titles, sizes, and page counts.
- Replaced the public website placeholder examples section with real PDF open/download links and unique accessible link labels.
- Extended ProjectExample URL contracts to allow either absolute HTTP(S) URLs or root-relative public paths, with regression coverage.
- Proposal generation now snapshots public example links into the immutable proposal HTML/PDF. Admin-managed public `ProjectExample` records are used when present; otherwise the static public assets are used as the fallback.
- Added `PUBLIC_WEBSITE_URL` backend runtime env support and DigitalOcean spec generation/validation so proposal snapshots can resolve static PDF paths to stable absolute website URLs.
- Preserved immutable proposal behavior: existing proposal HTML/PDF artifacts are served from stored snapshots and do not change when ProjectExample records are edited later.
- Minimal admin management UI was not added in PZK-011. The DB/API foundation from PZK-003 is used for proposal snapshots, while the public website examples remain deploy-time static assets in v1.
- No Bella/ads tasks were changed; the Bella PDFs were used only as source assets for this engineering-calculator task.
- PZK-017 update: the PZK-011 public-static delivery shape is no longer current. The same PDF assets now live under `backend/assets/project-examples` and are served only by tokenized backend routes after contact capture.

Verification:

- `docker info` passed before Docker-backed integration verification.
- `bun run typecheck` passed for backend, contracts, webapp, and website.
- `bun run test:contracts` passed: 18/18.
- `bun run test:backend:unit` passed: 36/36.
- `bun run test:backend:integration` passed: 33/33, including ProjectExample public/admin separation and immutable proposal snapshot coverage after example edits.
- `bun run test:webapp` passed: 40/40.
- `bun run test:deploy` passed: 16/16, including `PUBLIC_WEBSITE_URL` backend spec generation coverage.
- `bun run build:website` passed; the only warning was the existing local `NODE_TLS_REJECT_UNAUTHORIZED=0` warning.
- `git diff --check` passed; only expected Windows LF/CRLF working-copy warnings were printed.
- Browser/Chrome CLI verification passed for public page PDF links, HTTP PDF access with `%PDF-` responses, proposal page example links, generated PDF offer example references/links via `pdftotext`, and mobile public/proposal layout sanity.

### PZK-012 - GitHub Preparation

Status: complete

Goal:

- Prepare repository for GitHub handoff.

Acceptance criteria:

- Clean git history with commit-per-task convention.
- Remote setup/push status is documented.
- Branch naming is documented.
- README explains local setup, scripts, env vars, and deploy notes.
- `.env.example` is complete and contains no real secrets.
- `.gitignore` excludes secrets, build output, generated local artifacts, and local PDFs where appropriate.
- Secrets scan or manual no-secrets check is run/documented.
- Final verification commands/manual checks are documented.
- CI is added if practical; otherwise manual checks are explicit.

Completion notes:

- Prepared the repository for GitHub handoff without rewriting published history, touching DigitalOcean/cloud resources, Bella/ads files, or the Codex plugin layer.
- Updated `README.md` into a current handoff guide covering prerequisites, local setup, workspace scripts, env files, verification, no-secrets checks, GitHub remote/branch status, branch and commit conventions, CI, and deferred deployment notes.
- Documented the actual GitHub state: `origin` is `https://github.com/iljadanilyuk/engineering-calculator.git`, `main` tracks `origin/main`, the original Vibe template remote is not configured, and the PZK-012 starting commit was `c048c29 Complete PZK-011 project examples`.
- Documented the branch/commit convention: current handoff work is on `main`; task workflow commits completed PZK work directly to `main` after the mandatory review gate; future PR branches, if adopted, should use `pzk-###-short-scope`; do not rewrite the existing pushed history.
- Recorded the early history caveat instead of rewriting history: setup documentation commits between PZK-001 and PZK-002 remain accepted historical commits; PZK task commits from PZK-002 onward are task-oriented.
- Confirmed CI already exists at `.github/workflows/ci.yml`; it runs frozen install, typecheck, build, deploy/script tests, contract tests, webapp tests, backend tests, Playwright browser install, and webapp E2E on pull requests and pushes to `main`/`master`. No new CI workflow was needed for PZK-012.
- Aligned frontend env examples: `webapp/.env.example` now documents quoted `VITE_API_URL`, and `website/.env.example` includes `PUBLIC_API_URL`, `PUBLIC_WEBAPP_URL`, and `PUBLIC_WEBSITE_URL`.
- Reviewed root `.env.example` and `backend/.env.example`; required local database, auth/session, admin bootstrap, Spaces, PDF, Telegram, public URL, and contact placeholders are present and contain placeholders/blank values rather than real secrets.
- Updated `.gitignore` for generated local temp/download/export/proposal-output folders and `*.tmp` files while intentionally not ignoring all PDFs, because project PDFs may be committed as real project assets. PZK-017 later moved example delivery assets from public website static files to private backend assets.
- Aligned `AGENTS.md` and `CLAUDE.md` branch guidance with the current `main` handoff branch.

Verification:

- `git remote -v` confirmed `origin` fetch/push URL is `https://github.com/iljadanilyuk/engineering-calculator.git`.
- `git status --short --branch` confirmed `main...origin/main`; before edits the tree was clean, and after verification only intended PZK-012 files were modified.
- `git branch -vv` confirmed `main` tracks `origin/main` at `c048c29 Complete PZK-011 project examples`.
- `git log --oneline --decorate -n 20` reviewed current history and confirmed no history rewrite was needed or performed.
- `git ls-files -o --exclude-standard` returned no untracked files after the PZK-012 edits.
- `rg --files -g ".env*" -g "!node_modules/**" -g "!.git/**" -g "!.scratch/**"` returned only tracked examples: `.env.example`, `backend/.env.example`, `webapp/.env.example`, and `website/.env.example`.
- Strict manual no-secrets scan passed with no matches:
  - `rg -n --pcre2 "(ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]+PRIVATE KEY-----)" -g "!node_modules/**" -g "!.git/**" -g "!.scratch/**" -g "!bun.lock" -g "!*.svg"`.
- `docker info` passed; Docker Desktop/engine was available for DB-backed checks.
- `bun install --frozen-lockfile` passed with no dependency changes.
- `bun run typecheck` passed for backend, contracts, webapp, and website.
- `bun run build` passed. Non-blocking warnings: existing Vite webapp chunk-size warning and existing local `NODE_TLS_REJECT_UNAUTHORIZED=0` warning during Astro build.
- `bun run test:deploy` passed: 16/16.
- `bun run test:contracts` passed: 18/18.
- `bun run test:backend:unit` passed: 36/36.
- `bun run test:webapp` passed: 40/40.
- `bun run test:backend:integration` passed: 33/33.
- `bun run --cwd webapp e2e:install` passed.
- `bun run e2e:webapp` passed: 4/4.
- `bun run smoke:backend:docker` passed, including backend Docker image build, `/health`, and DB-backed auth smoke.
- `docker compose ps` showed no running project Compose services after verification.
- `git diff --check` passed; only expected Windows LF/CRLF working-copy warnings were printed.

### PZK-013 - DigitalOcean Deployment Decision Gate

Status: complete

Goal:

- Decide and document the production deployment shape before provisioning resources.

Acceptance criteria:

- App Platform vs Droplet + Docker Compose is chosen.
- Database, PDF/proposal storage, migrations, health checks, env vars, runtime versions, domain/HTTPS/proxy assumptions, backups, rollback plan, and expected monthly cost/risk are documented.
- Domain plan uses registrar-managed DNS with CNAME/A records pointing to the DigitalOcean app after it exists; nameserver migration to DigitalOcean is out of scope unless explicitly approved later.
- Exact production hostnames are chosen for public website, admin/webapp, and API before DNS cutover.
- Canonical `www` vs apex behavior is chosen and documented.
- Paid cloud resource creation remains blocked pending separate explicit user approval.

Completion notes:

- Added `docs/deployment/digitalocean-decision-gate.md` as the PZK-013 decision record.
- Selected DigitalOcean App Platform over Droplet + Docker Compose for first production launch.
- Selected DigitalOcean Managed PostgreSQL 18 for production data because the schema uses database-generated `uuidv7()`.
- Selected PostgreSQL-backed immutable proposal/PDF storage for v1. `Proposal.htmlSnapshot`, `Proposal.pdfBytes`, checksum, storage key, and calculation snapshots remain the durable source until Spaces is explicitly approved later.
- Deferred DigitalOcean Spaces to future media/file-volume needs; App Platform container filesystem remains temporary only.
- Documented `prisma:deploy` migration flow, `/health` plus post-deploy smoke checks, required backend/frontend env vars, runtime/Chromium notes, HTTPS/proxy assumptions, backups, restore, rollback, monitoring/logging, and expected monthly cost.
- Documented registrar-managed DNS with no nameserver migration. PZK-013 originally considered a `www`-primary public host pattern; PZK-015 production deployment later changed the canonical public host to apex `https://poznyak.by` per user direction.
- Documented DNS cutover safeguards for CAA, DNSSEC as a PZK-014 preflight blocker, TLS propagation, and preservation of MX/SPF/DKIM/DMARC/TXT records.
- Updated `README.md` and `docs/DEPLOYMENT.md` to point to the decision gate, require `--project-id e0c43cc8-3ea8-4c16-a390-738e56d9c3e3` for future App Platform creates, and align examples with the `www`/`admin`/`api` hostname pattern.
- Added a PZK-014 checklist covering domain confirmation, paid-resource approval, `fra` region confirmation, PostgreSQL 18 spec pinning, exact Bun runtime pinning, final env values, spec validation, and no provisioning before approval.
- No DigitalOcean App Platform app, Managed PostgreSQL cluster, Spaces bucket, Droplet, DNS record, or paid resource was created or changed.

Verification:

- PZK-013 pre-task `gpt-5.5 xhigh` review completed and recommendations incorporated.
- Post-task review round 1 rated 9.1/10; required DNSSEC blocker wording, project ID on all create examples, hostname example alignment, and README pointer cleanup. Changes incorporated.
- Focused post-task review round 2 rated 8.5/10; confirmed prior content fixes but required final tracker/bookkeeping and inclusion of the new decision doc in the final commit. This tracker update resolves the bookkeeping gap.
- Final focused post-task review round 3 rated 9.6/10; no required changes remained and PZK-013 gate cleared.
- `git diff --check` passed after documentation edits; Windows LF/CRLF working-copy warnings were printed for edited markdown files.
- Scoped no-secrets scan over changed docs/README found no secrets.
- `bun run typecheck` was not run because only markdown documentation changed and no code, env examples, package scripts, Docker, or deploy generator scripts were modified.
- Pricing was checked against DigitalOcean pricing pages on 2026-07-10 before documenting estimates.
- No `doctl apps create`, database, Spaces, Droplet, DNS, or other provisioning command was run in this task.

### PZK-014 - DigitalOcean Deployment Prep

Status: complete

Goal:

- Prepare deploy configuration and instructions for DigitalOcean.

Acceptance criteria:

- Required services and env vars are documented.
- Database and storage persistence plan is documented.
- Registrar-side DNS records are documented after the DigitalOcean app provides the target hostname/IP.
- App Platform custom-domain records and registrar records are documented without moving nameservers.
- Required post-domain env updates are documented for CORS/API/public/proposal URLs.
- Existing registrar records to preserve are listed before cutover.
- Health checks or smoke checks are defined.
- Runtime smoke path is documented:
  - public calculator loads;
  - lead submit works;
  - PDF/proposal generates and opens;
  - admin login works;
  - admin can change lead status;
  - Telegram failure does not break lead submission;
  - migrations run cleanly.
- Rollback and backup/restore notes are included.

Completion notes:

- Added `docs/deployment/digitalocean-app-platform-prep.md` as the concrete PZK-014 App Platform and registrar DNS prep runbook.
- Kept PZK-014 preparation-only: no App Platform app, Managed PostgreSQL cluster, Spaces bucket, Droplet, DNS record, domain attachment, or other paid DigitalOcean resource was created or updated.
- Documented the approved prep target shape as three safe draft App Platform apps/components: backend/API at `api.<domain>`, admin webapp static site at `admin.<domain>`, and a public website static site. PZK-014 used a `www`-primary placeholder pattern; PZK-015 later changed production canonical public host to apex `https://poznyak.by`.
- Documented the Managed PostgreSQL 18 attachment, Prisma `prisma:deploy` pre-deploy job, first-admin setup flow, backup/restore notes, rollback plan, CORS/auth/cookie/proxy settings, final public/API/admin URL settings, proposal/PDF URL immutability risks, and full post-deploy smoke checklist.
- Added registrar-side DNS runbook placeholders for public website, `www` redirect, `admin`, `api`, verification TXT, CAA, DNSSEC, TLS propagation, and preserving MX/SPF/DKIM/DMARC/existing TXT records. PZK-015 later applied apex canonical `https://poznyak.by` with `www` redirecting to apex.
- Updated `.do` App Platform draft templates so backend pins PostgreSQL `version: "18"`, sets `NODE_ENV=production`, includes `PUBLIC_API_URL`, `PUBLIC_WEBSITE_URL`, and `PUBLIC_WEBAPP_URL`, and uses generated provider-valid app names.
- Updated static-site draft templates to pin `BUN_VERSION=1.3.14`; added root `.bun-version`; pinned backend Docker runtime to `oven/bun:1.3.14`.
- Updated `scripts/prepare-do-specs.mjs` so the default region is `fra`, backend final specs require `DO_BACKEND_URL`, website specs can use a final `DO_WEBSITE_URL` or safe `${_self.PUBLIC_URL}` bootstrap fallback, and generated app names satisfy DigitalOcean's 32-character app-name limit.
- Updated deploy generator tests for PostgreSQL 18, backend public/admin/website URL env, Bun version pinning, safe bootstrap URL behavior, and provider app-name length.
- Updated `README.md`, `docs/DEPLOYMENT.md`, and `docs/deployment/digitalocean-decision-gate.md` to point to the PZK-014 runbook and preserve the no-provisioning boundary.
- DigitalOcean Project ID remains fixed for future provisioning: `engineering-calculator` / `e0c43cc8-3ea8-4c16-a390-738e56d9c3e3`.

Verification:

- PZK-014 pre-task `gpt-5.5 xhigh` review completed and recommendations incorporated.
- `bun run test:deploy` passed: 20/20.
- `bun run typecheck` passed.
- `docker info` confirmed Docker was running.
- `docker manifest inspect oven/bun:1.3.14` confirmed the pinned Bun image tag is available.
- `bun run smoke:backend:docker` passed, including backend Docker image build, `/health`, and DB-backed auth smoke.
- `docker compose ps` showed no running project Compose services after Docker smoke.
- Generated draft specs into `.scratch/deploy` using test-mode release-git-check bypass with safe `example.com` URLs because the current PZK-014 worktree was intentionally dirty before commit.
- `doctl apps spec validate` passed for generated backend, webapp, and website specs. No `doctl apps create`, `doctl apps update`, database, Spaces, Droplet, DNS, or other provisioning command was run.
- Generated final example specs were inspected with `rg`; no `REPLACE_WITH_`, `localhost`, or `placeholder.invalid` remained, and expected `region: fra`, PostgreSQL `version: "18"`, `NODE_ENV`, `PUBLIC_API_URL`, `PUBLIC_WEBSITE_URL`, `PUBLIC_WEBAPP_URL`, and `BUN_VERSION` entries were present.
- Scoped no-secrets scan returned no matches. Future validation with real secrets must not paste full `doctl apps spec validate` output because `doctl` echoes normalized secret env values.
- `git diff --check` passed with only expected Windows LF/CRLF working-copy warnings.
- Post-task review gate cleared with reviewer score 9.6/10 and no required changes.

### PZK-015 - Production DigitalOcean Deployment

Status: complete

Goal:

- Provision the approved DigitalOcean production resources, connect the production domain, bootstrap admins/settings, and verify the full public lead/proposal/admin flow.

Acceptance criteria:

- Paid DigitalOcean resources are created only after explicit user approval.
- Resources are assigned to the existing DigitalOcean Project `engineering-calculator`.
- Production domain uses registrar-managed DNS without moving nameservers to DigitalOcean.
- Canonical public website is `https://poznyak.by`; `www.poznyak.by` redirects to it.
- Backend API is available at `https://api.poznyak.by`.
- Admin webapp is available at `https://admin.poznyak.by`.
- Managed PostgreSQL 18 is online and migrations are applied.
- First admin accounts are created without committing passwords or secrets.
- Public calculator config loads real services and exchange rate.
- Public lead submit creates an immutable proposal HTML/PDF artifact.
- Admin can find the submitted lead and change its status.
- Telegram may remain disabled if bot token/chat env are not configured; missing Telegram env must not block lead creation.
- Temporary generated specs/secrets under `.scratch` are not committed.

Completion notes:

- User approved paid DigitalOcean resources for the `engineering-calculator` Project and provided the production domain `poznyak.by`.
- Created/used DigitalOcean Project `engineering-calculator` (`e0c43cc8-3ea8-4c16-a390-738e56d9c3e3`).
- Created DigitalOcean Managed PostgreSQL 18 cluster `engineering-calculator-pg` (`32baabc3-4906-4821-9079-0039916f72ad`) in `fra1`; assigned it to the Project.
- Created App Platform apps:
  - backend/API `engineering-calculator-api` (`80627a45-9b66-442e-8796-f60750a49efd`);
  - admin webapp `engineering-calculator-webapp` (`25facd71-0b33-4d55-881e-c706dea9bf48`);
  - public website `engineering-calculator-website` (`288490f4-26d6-4b90-a5ed-9c407c5797a3`).
- Connected final production URLs:
  - public website: `https://poznyak.by`;
  - admin webapp: `https://admin.poznyak.by`;
  - backend API: `https://api.poznyak.by`;
  - `https://www.poznyak.by` redirects to `https://poznyak.by`.
- Registrar DNS remains at HB.BY. The zone contains App Platform static ingress A/AAAA records for apex and CNAME records for `api`, `admin`, and `www`, all with 300-second TTL.
- App Platform domain validation initially left the apex certificate in a stale `1970` state. The website domain binding was safely removed/re-added through app spec updates, after which `poznyak.by` became `ACTIVE` with a valid certificate.
- Created two production admin accounts for the user-provided admin emails. Temporary passwords were handed off out-of-band only and were not committed.
- Bootstrapped production calculator data: manual USD/BYN rate `2.8668`, seven public services, and two public project examples.
- Telegram notifications are left disabled for launch because production `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` env is not configured in App Platform yet. Missing Telegram env was covered by existing backend behavior and does not block lead/proposal creation.
- Fixed backend Docker/App Platform Chromium discovery in `backend/src/engineering/proposal.ts` after production PDF generation exposed the runtime path difference. Commit `44ec043 Fix App Platform Chromium discovery` was pushed before the final smoke.
- Removed no production data except marking deployment smoke leads as `spam_test`; no Spaces bucket, Droplet, Valkey, or additional paid resource was created.

Verification:

- PZK-015 pre-task `gpt-5.5 xhigh` review completed and recommendations incorporated.
- `doctl` authenticated account was verified before provisioning.
- `doctl projects resources list e0c43cc8-3ea8-4c16-a390-738e56d9c3e3` confirmed the three apps and PostgreSQL cluster are assigned to the intended Project.
- `doctl apps spec validate` passed for backend, webapp, and website specs before app updates.
- DNS was verified against Google DNS and authoritative `ns1.hb.by`: apex A/AAAA, `api` CNAME, `admin` CNAME, and `www` CNAME resolve with TTL `300`.
- App Platform domains reached `ACTIVE` for `poznyak.by`, `www.poznyak.by`, `api.poznyak.by`, and `admin.poznyak.by`.
- HTTPS smoke passed:
  - `https://poznyak.by/` -> `200`;
  - `https://www.poznyak.by/` -> `301` to `https://poznyak.by/`;
  - `https://api.poznyak.by/health` -> `200`;
  - `https://api.poznyak.by/api/public/calculator-config` -> `200`;
  - `https://admin.poznyak.by/` -> `200`.
- Production full-flow smoke created a redacted public proposal token; proposal HTML returned `200`; proposal PDF returned `200` with `146289` bytes.
- The smoke lead was found through the admin API as calculation `019f6ef0-34eb-7809-b6a6-00dd582ef424` and updated to status `spam_test`.
- Hotfix verification before `44ec043`: `bun run typecheck:backend`, `bun run test:backend:unit`, `bun run test:deploy`, `bun run smoke:backend:docker`, and a Docker PDF render smoke passed.
- `git status --short --branch` was clean before deployment spec generation. Generated `.scratch/deploy` specs were not committed.
- PZK-015 post-task review gate cleared with reviewer Feynman score 9.7/10 and no required blockers.

### PZK-016 - Admin Russian UX And Workflow Audit

Status: complete

Goal:

- Translate the current admin webapp to Russian and make it feel like a practical working cabinet for this product, not a generic English technical dashboard.
- Audit and improve the admin UX for the owner's real workflows: leads, statuses, notes, proposal/PDF links, services, prices, and future handoff into project technical assignment and contract generation.
- Remove or replace uncomfortable horizontal-scroll table patterns, especially in leads and lead detail views, with responsive desktop/mobile layouts.

Scope:

- Webapp/admin UI only unless a small API-facing adjustment is required to preserve existing behavior.
- Keep current backend calculation, proposal/PDF, lead save, auth, DigitalOcean, DNS, env/secrets, and public website behavior unchanged.
- Future contract/TZ/Telegram-agent functionality should be considered in the information architecture, but not implemented in this task.

Task brief:

- `docs/design/admin-panel-russian-ux-task-2026-07-17.md`

Mandatory workflow:

- Before implementation, run a `gpt-5.5 xhigh` pre-task sub-agent for UX/i18n/refactor risks.
- After implementation, run `gpt-5.5 xhigh` review sub-agent(s).
- Do not mark complete until at least one reviewer scores `9.5/10` or higher.
- Update this tracker with completion notes, verification notes, and review log before commit.

Completion notes:

- Translated the protected admin shell, login/forbidden/loading states, service management, lead list, lead detail, status/notes/PDF controls, empty/loading/error states, and e2e-accessible labels to Russian.
- Kept backend/API enum values unchanged while localizing only UI labels for lead statuses, pricing types, filters, switches, buttons, and validation/auth messages.
- Reworked the admin shell terminology around `Заявки`, `Услуги и цены`, and future workflow placeholders for `Проекты/ТЗ` and `Договоры` without adding backend routes or future contract/Telegram features.
- Replaced the forced horizontal lead list table pattern with a desktop table plus mobile/tablet lead cards. The old `min-w-[1120px]` lead table and `min-w-[720px]` lead-detail breakdown were removed.
- Converted lead detail calculation breakdown into responsive structured rows, with contact, status, notes, КП/PDF, selected-service snapshot, and future workflow blocks kept distinct.
- Added responsive services mobile cards while preserving desktop service CRUD density, reorder controls, public visibility toggles, formula-row disabled state, archive/restore flow, and BYN preview behavior.
- Standardized admin display units to `м²`, `BYN`, and `USD`; dates remain formatted with `ru-RU`.
- Updated Playwright e2e selectors and assertions for Russian accessible names and added mobile no-horizontal-overflow checks for login, services, leads, and lead detail.
- Public website, backend calculation/domain logic, proposal/PDF generation, DigitalOcean/DNS/env/secrets, and Codex plugin layer were not changed.

Verification:

- PZK-016 pre-task `gpt-5.5 xhigh` review completed with UX/i18n/refactor risks incorporated.
- `docker info` passed before Docker-backed e2e/browser verification.
- `bun run typecheck` passed.
- `bun run --cwd webapp lint` passed.
- `bun run test:webapp` passed: 40/40.
- `bun run build:webapp` passed; inherited Vite chunk-size warning remains.
- `bun run e2e:webapp` passed: 5/5.
- Browser verification passed with a temporary Playwright spec using the e2e fixture stack: desktop login -> services -> leads -> lead detail; mobile 390px login -> services -> leads -> lead detail; PDF fetch returned `200`; every checked view satisfied `document.documentElement.scrollWidth <= window.innerWidth + 1`.
- Browser verification screenshots were saved under `.scratch`: `pzk016-desktop-login.png`, `pzk016-desktop-services.png`, `pzk016-desktop-leads.png`, `pzk016-desktop-lead-detail.png`, `pzk016-mobile-login.png`, `pzk016-mobile-services.png`, `pzk016-mobile-leads.png`, and `pzk016-mobile-lead-detail.png`.
- `git diff --check` passed with only expected LF/CRLF working-copy warnings.
- PZK-016 post-task review gate cleared with reviewer Herschel score 9.6/10 and no required blockers.

### PZK-017 - Lead-Gated Project Examples And Preliminary Offer Delivery

Status: Complete

Goal:

- Stop giving away project example PDFs anonymously from the public page.
- Capture client contact details before delivering example projects or preliminary offer artifacts.
- Preserve examples as trust/proof assets while turning them into a measurable lead source.

Task brief:

- `docs/design/public-conversion-questionnaire-roadmap-2026-07-17.md`

Scope:

- Replace direct public example download CTAs with a lead/contact capture flow.
- Save example requests as leads or lead events with source such as `example_request`.
- Deliver examples after contact capture by tokenized link, on-page success state, or a future Telegram delivery channel.
- Decide during implementation whether static public PDF files are acceptable for v1 or whether examples must move behind backend token-protected routes.
- Keep existing proposal/PDF immutability for old leads.

Out of scope:

- Full detailed questionnaire wizard.
- Telegram group listening agent.
- Contract generation.

Completion notes:

- Replaced anonymous public example PDF links on the Astro website with an inline lead-capture flow in the examples section.
- Moved the two real example PDFs out of `website/public/project-examples` into private backend assets under `backend/assets/project-examples`.
- Added `project_example_requests` persistence with idempotency, request fingerprint, normalized phone, consent snapshot, UTM/referrer, and source `example_request`.
- Added public backend routes:
  - `POST /api/public/project-example-requests` saves the contact and returns tokenized delivery links.
  - `GET /api/public/project-example-requests/{token}/examples/{slug}` serves the selected PDF with `Cache-Control: private, max-age=0, no-store` and `X-Robots-Tag: noindex, nofollow`.
- Added admin visibility on the leads page through a separate `Запросы примеров проектов` panel, showing source label `Запрос примера проекта`, contact, requested examples, and tokenized PDF links.
- Preserved the existing preliminary КП/proposal flow: contact is still required, totals are recalculated server-side, old proposal artifacts remain immutable, and fallback proposal proof cards no longer embed direct static example PDF URLs.
- Public project example metadata no longer exposes `fileUrl`, and newly generated КП proof cards no longer embed direct admin ProjectExample file URLs.
- The PZK-011 public-static PDF delivery shape is superseded for production by this PZK-017 backend-token route.

Verification:

- `bun run test:contracts` passed: 19/19.
- `bun run test:backend:unit` passed: 36/36.
- `bun run typecheck` passed across backend, contracts, webapp, and website.
- `bun run test:webapp` passed: 40/40.
- `bun run test:backend:integration` passed: 34/34, including tokenized example PDF delivery and admin visibility.
- `bun run build` passed; inherited Vite chunk-size warning and local TLS env warning remain.
- `website/dist/project-examples` is absent after build, and no old `project-examples/*.pdf` paths are present in the built website.
- `bun run --cwd backend prisma:validate` passed.
- Browser verification passed on temporary local backend/website ports: examples form submission returned `200/201`, success state exposed a tokenized PDF link, the tokenized PDF fetch returned `200`, and the old static `/project-examples/proekt-primer-ov.pdf` path returned `404`.
- Browser verification screenshot: `.scratch/pzk017-public-examples-success.png`.
- `git diff --check` passed with only expected LF/CRLF working-copy warnings.

### PZK-018 - Commercial Offer Choice Page

Status: Complete

Goal:

- Change the public `Получить коммерческое предложение` flow so a visitor who has configured the calculator chooses between a fast preliminary КП and a detailed questionnaire path.

Task brief:

- `docs/design/public-conversion-questionnaire-roadmap-2026-07-17.md`

Required flow:

- User selects area and project sections in the calculator.
- User clicks `Получить коммерческое предложение`.
- User lands on a choice page:
  - `Пройти подробный опросник` for a more accurate technical assignment and offer;
  - `Скачать предварительное КП` based on the calculator inputs.
- The preliminary КП path must still require name, phone, and consent before the proposal/PDF link is delivered.
- Backend must continue recalculating totals server-side and must not trust client-side totals.

Out of scope:

- Implementing the full questionnaire content.
- Telegram-only delivery as the sole path.
- Changing admin CRM beyond what is needed to display the new lead source/flow.

Implementation notes:

- Added the public `/offer/` choice page with two selectable scenarios:
  - `Скачать предварительное КП` opens the gated contact form;
  - `Выбрать подробный опросник` records the selected detailed flow and shows a next-stage placeholder without implementing PZK-019.
- Changed the calculator CTA to preserve area, selected service IDs, project type, and attribution metadata when navigating to `/offer/`.
- `/offer/` recovers from stale fallback service IDs after real public services load, while preserving a deliberate empty `services=` selection.
- Removed the old direct lead/proposal form from the public landing CTA so preliminary КП is requested only from the choice page after name, phone, and consent.
- The preliminary КП submit sends only `areaSqm` and `selectedServiceIds` in `calculation`; totals and proposal artifacts are still recalculated/generated by the backend public calculation flow.
- Added `public_offer_preliminary` source visibility for calculation leads in admin list/detail as `Предварительное КП`.

Verification:

- `bun run typecheck:website` passed.
- `bun run build:website` passed.
- `bun run test:contracts` passed.
- Browser smoke with mocked public API passed:
  - calculator state and UTM survived the `/offer/` transition;
  - detailed questionnaire choice revealed the future-stage note;
  - preliminary КП stayed gated by name, phone, and consent;
  - valid preliminary КП submit returned proposal/PDF links;
  - POST body contained no client totals/snapshots.
- Targeted race smoke passed: stale fallback service IDs in the `/offer/` query recover to the loaded public backend service defaults.

Review log:

- Curie pre-task review completed before implementation.
- Nash post-review: 9.2/10, required making the detailed questionnaire option selectable.
- Ramanujan post-review: 9.3/10, required recovering from fallback service IDs emitted before API config finished loading.
- Erdos final strict review: 9.5/10, required fixes none; gate cleared.

### PZK-019 - Detailed Questionnaire And Technical Assignment Wizard

Status: Complete

Goal:

- Turn `docs/design/Опросный лист.xlsx` into a step-by-step questionnaire that collects enough information to draft a technical assignment for engineering systems.

Task brief:

- `docs/design/public-conversion-questionnaire-roadmap-2026-07-17.md`

Required behavior:

- Questions are grouped by logical project sections.
- User sees progress toward completion.
- Questions provide answer options where possible.
- Each question supports:
  - selecting a predefined option;
  - entering a custom answer;
  - `Пока не знаю`;
  - `Пропустить`.
- Answers are saved incrementally and linked to a lead/project record.
- Admin can review the collected answers as a draft technical assignment.
- Filled/sample answers from the XLSX must not be exposed publicly if they contain real or client-like data.

Out of scope:

- Telegram group listening.
- Fully automated final technical assignment approval without admin review.
- Contract generation.

Implementation notes:

- Added a sanitized shared questionnaire contract in `packages/contracts/src/questionnaire.ts`, based on `docs/design/Опросный лист.xlsx` column A only.
- Added literal column-A option labels where predefined options are safe; open/ambiguous cases remain custom-answer questions with global `Пока не знаю` and `Пропустить` controls.
- Added `CalculationQuestionnaire` persistence linked one-to-one to `Calculation`, with incremental answer snapshots, consent evidence, source/referrer/UTM fields, and a dedicated Prisma migration.
- Added public questionnaire start/resume/autosave endpoints:
  - exact idempotency retries return the same session;
  - loose duplicate starts return `409` without exposing the existing token or answers;
  - public session responses omit client name and phone and use `no-store`/`noindex` headers.
- Added `/questionnaire/` on the public website and wired the detailed option from `/offer/` into the wizard.
- Added an admin lead detail draft-ТЗ card showing grouped answers, progress, unknown/skipped counts, and source/status context.
- Did not create or modify cloud resources, Codex plugin layer, Telegram bot behavior, admin redesign navigation, blog/cases, or contract generation.

Verification:

- `bun run --cwd backend prisma:validate` passed.
- `bun run typecheck` passed.
- `bun run test:contracts` passed: 23/23.
- `bun run test:backend:unit` passed: 36/36.
- `bun run test:backend:integration` passed: 35/35.
- `bun run test:webapp` passed: 40/40.
- `bun run build:website` passed.
- `bun run build:webapp` passed with the existing Vite large-chunk warning.
- `git diff --check` passed, with only standard CRLF working-copy warnings.
- Browser smoke was run against the static `/questionnaire/` page with a mocked public API; start/autosave/resume flow passed and confirmed the start payload did not include client-supplied totals or calculation snapshots.

Review log:

- Pre-task `gpt-5.5 xhigh` reviews completed:
  - Cicero flagged XLSX column-B privacy, no proposal/PDF/Telegram side effects, separate `/questionnaire/`, and admin draft-only scope.
  - Aquinas recommended a one-to-one questionnaire child record linked to `Calculation`, token-based resume, bounded JSON, and admin detail integration.
  - Curie recommended the `/offer/` detailed option leading to a separate wizard, progress UI, one-question flow, and no PZK-021 admin navigation expansion.
- Post-task reviewer Hegel, `gpt-5.5 xhigh`: 9.6/10; no required fixes, noted non-blocking concurrent autosave hardening.
- Post-task reviewer Franklin, `gpt-5.5 xhigh`: 8.1/10; required preventing loose duplicate starts from exposing an existing token/answers, removing literal XLSX filled-answer values from tests, and making predefined option labels column-A-only. Fixes incorporated.
- Focused reviewer Fermat, `gpt-5.5 xhigh`: 9.0/10; confirmed privacy fixes but required stricter literal option labels for source rows such as heating type, piping material, and ВРВ. Fixes incorporated.
- Focused reviewer Fermat continuation, `gpt-5.5 xhigh`: 9.6/10; required fixes none, gate cleared.

### PZK-020 - Telegram Delivery And Project Context Bot

Status: Pending

Goal:

- Use Telegram as an optional client delivery and project-context channel after contact capture, not as an anonymous replacement for the website lead flow.

Task brief:

- `docs/design/public-conversion-questionnaire-roadmap-2026-07-17.md`

Phase 1:

- Let a client receive example projects or preliminary КП through Telegram after contact capture.
- Link the Telegram chat/user to the lead when possible.
- Log successful/failed delivery in the admin-visible record.

Phase 2:

- Support a project Telegram group after the lead becomes a real project.
- Store relevant messages/files/voice transcripts where consent and bot permissions allow it.
- Produce a daily draft update for the technical assignment:
  - newly discovered facts;
  - open questions;
  - contradictions;
  - decisions requiring confirmation.
- Admin must review and accept changes before they become part of the working ТЗ.

Out of scope:

- Making Telegram the only way to receive a document.
- Automatically changing the final technical assignment without admin approval.
- Exposing Telegram bot secrets in frontend env, browser responses, or logs.

### PZK-021 - Admin Workspace V1 From Prototype

Status: Pending

Goal:

- Move the admin panel from a functional set of pages toward a unified working cabinet for leads, proposals, project context, future technical assignments, and future contracts.
- Use the new admin prototype as design direction, while deliberately reducing noise and avoiding premature implementation of every future entity.

Task brief:

- `docs/design/admin-workspace-v1-redesign-task-2026-07-17.md`

Prototype sources:

- `прототип/poznyak-admin-prototype-v1-package/poznyak-admin-prototype-v1-codex-task.md`
- `прототип/poznyak-admin-prototype-v1-package/poznyak-admin-prototype-v1.html`
- `прототип/poznyak-admin-prototype-v1-package/*.png`

Required behavior:

- Keep existing admin auth, services CRUD, leads list/detail, status update, notes, proposal/PDF links, and project-example request visibility working.
- Introduce a calmer admin shell with persistent desktop sidebar and responsive mobile navigation.
- Add a dashboard/workspace view based on existing data.
- Rework `Заявки и проекты` toward a pipeline/list experience without inventing unsupported persistent backend stages.
- Rework the lead detail as a project record that connects client, object, calculation, КП/PDF, notes, and future ТЗ/contract slots.
- Bring `Услуги и цены` into the same visual system without losing current service management behavior.

Out of scope:

- Contract generation from Word templates.
- Full questionnaire builder/client flow.
- Telegram group listener or AI extraction.
- New paid DigitalOcean resources, DNS, env, secrets, or public website changes.
- Backend schema expansion unless a blocker is explicitly found and reviewed.

### PZK-022 - Public Project Case Pages And Telegram Delivery

Status: Pending

Goal:

- Add public pages for completed/realized engineering project examples as trust-building content, while keeping full example delivery gated through contact capture and Telegram.

Required behavior:

- Public website has a `Реализованные проекты` section/listing.
- Each project case has a public detail page with:
  - project title and object type;
  - generalized location/area where appropriate;
  - initial task or client problem;
  - included engineering systems;
  - screenshots/fragments of project documentation;
  - captions explaining what each shown section solves for the client/builders.
- Case pages include a CTA such as `Получить пример проекта` / `Скачать пример`.
- CTA must route the user toward Telegram bot delivery when Telegram delivery is ready.
- Until Telegram delivery is fully ready, keep a lead-gated/token fallback and do not expose direct anonymous PDF downloads.
- Admin can create, edit, archive, publish, and reorder project case pages.
- Admin can upload/manage case screenshots, captions, and linked example assets.
- Public pages include basic SEO metadata and safe canonical URLs.
- Real client/project data must be sanitized before publication.

Dependencies / notes:

- Coordinate with PZK-020 for Telegram bot delivery.
- Can start with the existing lead-gated project example flow as a fallback.

Out of scope:

- Telegram group listener and daily ТЗ extraction.
- Publishing unsanitized client documents or personal data.
- Rebuilding proposal/PDF generation unless a blocker is explicitly found.

### PZK-023 - Blog And Admin Publishing

Status: Pending

Goal:

- Add a public blog/news/articles section and admin publishing workflow for project news, educational articles, and company updates.

Required behavior:

- Public website has a blog index page and article detail pages.
- Admin can create, edit, preview, publish, archive, and unpublish articles.
- Article model supports:
  - title;
  - slug;
  - excerpt;
  - body content;
  - cover image;
  - category/tags;
  - SEO title/description;
  - published date;
  - draft/published/archived status.
- Editing UI is in Russian and protected by existing admin auth.
- Public website shows only published articles.
- Content rendering is sanitized; no arbitrary script injection from admin article content.
- Basic SEO/Open Graph metadata are generated for published articles.

Out of scope:

- Public comments.
- Newsletter/subscription automation.
- AI article generation.
- External CMS migration unless separately approved.

### PZK-024 - Public Documentation Screenshot Lightbox

Status: Pending

Goal:

- Make current public landing screenshots from `Примеры проектной документации` clickable and viewable full-size without exposing the full downloadable example anonymously.

Required behavior:

- Clicking a preview screenshot opens a full-size modal/lightbox or equivalent viewer.
- Viewer works on desktop and mobile.
- Viewer supports keyboard accessibility:
  - `Esc` closes;
  - focus behavior is sensible;
  - image has alt text/caption.
- If several screenshots belong to one gallery, previous/next navigation should be supported.
- No horizontal page scroll should be introduced.
- Full PDF/example download remains gated through the existing lead/Telegram flow; only preview images open full-size.
- Browser verification covers desktop and mobile.

Out of scope:

- Admin CMS for project cases; covered by PZK-022.
- Telegram delivery; covered by PZK-020/PZK-022.
- Adding a large new library unless the existing stack cannot provide a reliable accessible viewer.

### PZK-025 - SEO, Social Preview, And Structured Data Foundation

Status: Complete

Goal:

- Improve how `https://poznyak.by/` and future public pages appear in messengers, search engines, and social previews.
- Add a proper preview image and structured metadata without changing the offer or lead flow.

Required behavior:

- Public website has production-ready metadata for the home page:
  - clear `title`;
  - concise `description`;
  - canonical URL;
  - `robots` meta where appropriate;
  - Open Graph tags for Telegram/Facebook/LinkedIn-style previews;
  - Twitter/X card tags;
  - stable absolute `og:url` and `og:image`.
- Add a high-quality social preview image for the public site:
  - sized for common link previews, preferably `1200x630`;
  - uses project-specific visual language, not a generic blank card;
  - includes brand/service context without tiny unreadable text;
  - committed under the website public assets.
- Add JSON-LD structured data where appropriate:
  - `Organization` or `LocalBusiness` / professional service profile;
  - `WebSite`;
  - `Service` for engineering system design;
  - `FAQPage` only if the visible FAQ content matches the structured data exactly.
- Add or verify:
  - `robots.txt`;
  - sitemap generation/static sitemap;
  - favicon/app icons consistency;
  - image alt text for important public images;
  - heading hierarchy on the public landing page.
- Establish metadata helpers or a simple convention so future pages from PZK-022/PZK-023 can set title, description, canonical, OG image, and schema cleanly.
- Verify link preview and SEO basics after deploy:
  - generated HTML contains expected meta tags and JSON-LD;
  - social preview image returns `200` with a cacheable content type;
  - production URL preview is refreshed/validated where available;
  - no direct anonymous project example PDF URLs are reintroduced.

Notes:

- This task should improve SEO basics and social previews; it is not a full SEO/content strategy.
- Use `SEO`, not `CEO`, in code/docs.

Out of scope:

- Writing a full blog/article content plan; covered by PZK-023.
- Public project case SEO templates beyond the reusable metadata convention; covered by PZK-022 when case pages are implemented.
- Paid advertising tracking changes.
- Google Search Console or external webmaster account setup unless separately approved.

Completion notes:

- Added reusable website SEO metadata helper in `website/src/lib/seo.ts`.
- Added a project-specific `1200x630` social preview image at `website/public/social-preview.jpg`.
- Home page now renders production canonical, robots, Open Graph, Twitter card metadata, and JSON-LD `ProfessionalService`, `WebSite`, `Service`, and `FAQPage`.
- Offer choice page now renders canonical/social metadata with `noindex,follow` so it can be shared without becoming an indexed public landing page.
- Added `robots.txt` and a static sitemap for `https://poznyak.by/`.
- Confirmed no direct anonymous public project-example PDF links were reintroduced.
- Messenger previews may keep the previous image-less cache until the updated deployment is live and the link is sent again or the messenger cache refreshes.

Verification notes:

- `bun run typecheck:website` passed.
- `bun run build:website` passed.
- `bun run test:deploy` passed, 20/20.
- Static built-output checks passed for canonical URLs, robots directives, OG/Twitter image metadata, JSON-LD presence, sitemap, and robots.txt.
- `social-preview.jpg` verified at `1200x630`.
- `git diff --check` passed with only expected Windows LF/CRLF warnings.

Review log:

- Pre-task sub-agent Jason, `gpt-5.5 xhigh`: flagged cache/absolute URL/FAQ/PDF leak/image-context risks before closeout.
- Post-task reviewer Jason, `gpt-5.5 xhigh`: 9.7/10, required fixes none, gate cleared.

## 11. Post-Launch Follow-Ups

These do not block the PZK-015 production launch, but should be resolved for polish, operations, or v2 work:

- Exact brand name to show: `ИП Позняк`, another name, or a future studio/bureau name?
- Exact contact phone/email/Telegram for production.
- Configure production Telegram env when notifications or PZK-020 client delivery should be turned on.
- Should PDF offers have an expiration period, for example 7 or 14 days?
- Should leads be exportable to CSV in v1?
- Exact BYN symbol/notation to use everywhere: confirm final glyph/mark before UI/PDF polish.
- Confirm privacy policy text and retention period for public lead data.
- Confirm whether public PDF/proposal links should expire or remain permanently accessible by token.
- Monitor first production billing after App Platform and Managed PostgreSQL settle, especially taxes/overages beyond the documented baseline.

## 12. Known Risks And Edge Cases

- Old offers must not change after service price, title, or exchange-rate edits.
- Phone validation must accept Belarusian and common international formats without rejecting valid clients.
- BYN rounding rules must be consistent between public UI, admin, backend, and PDF.
- PDF generation may differ between local and server environments; verify font rendering, page breaks, and Cyrillic support.
- Generated PDFs are DB-backed for v1; monitor PostgreSQL growth and move large future media or high-volume proposal files to Spaces only after explicit approval.
- Telegram API errors, bad bot tokens, or blocked chats must not break lead creation.
- Auth/session configuration must be safe behind DigitalOcean proxy/HTTPS.
- Public calculator should not trust client-side totals; backend must recalculate before saving/PDF.
- Admin delete should probably archive services instead of hard-deleting services used in old calculations.
- UTM/referrer should be captured where available for future lead quality analysis.

## 13. Review Log

Use this section, or a dedicated review log file if it grows too large, to record mandatory pre-task risk reviews and post-task code/document reviews.

- 2026-07-08 PZK-000 pre-task review: `gpt-5.5 xhigh` risk/edge-case review completed; recommendations incorporated into architecture, currency, PDF, Telegram, and deployment sections.
- 2026-07-08 PZK-000 post-task review round 1:
  - Reviewer Halley: 8.5/10; required tighter BYN formatting, CRM criteria, proposal access, privacy, Telegram secret handling, abuse protection, and deployment smoke criteria. Changes incorporated.
  - Reviewer Peirce: 7/10; required safer task sequencing, stronger PDF immutability, CRM status behavior, deployment gate, GitHub handoff criteria, commit-order fix, and concrete verification artifacts. Changes incorporated.
- 2026-07-08 PZK-000 post-task review round 2:
  - Reviewer Raman: 9.7/10; no remaining blocker for marking PZK-000 complete. PZK-000 marked complete.
  - Reviewer Erdos: 9.5/10; confirmed prior blockers are fixed and no required changes remain before completing PZK-000.
- 2026-07-08 PZK-001 pre-task review:
  - Reviewer Boole: `gpt-5.5 xhigh`; flagged scaffold/merge risks: do not copy template `.git`, preserve `task.md` and history, avoid mirror/delete copy modes, rename all workspace identifiers/imports, keep DigitalOcean work deferred, and do not invent a GitHub remote URL. Recommendations incorporated.
- 2026-07-08 PZK-001 post-task review round 1:
  - Reviewer Hilbert: 8/10; required tracker update, verification recording, commit after gate, remote/push status documentation, and recommended CI build plus Docker cleanup. Changes incorporated.
  - Reviewer Banach: 7/10; required fixing backend Dockerfile missing `mobile/package.json`, replacing visible template UI copy, and removing operational bootstrap/template wording. Changes incorporated.
- 2026-07-08 PZK-001 post-task review round 2:
  - Reviewer Sartre: 9.6/10; no implementation blockers. Required final tracker update before commit; confirmed verification coverage and no-secrets review are sufficient.
  - Reviewer Nash: 9.6/10; no scaffold/code-quality blockers. Confirmed PZK-001 can be marked complete after tracker update and commit.
- 2026-07-08 DigitalOcean Project organizer update:
  - Pre-task reviewer Helmholtz: recommended idempotent project creation, no paid resources, zero-resource verification, explicit future project ID usage, and separating Project organization from deployment/billing changes. Recommendations incorporated.
  - Post-task reviewer Sartre: 9.8/10; confirmed `engineering-calculator` Project existed as an organizer with no resources at that time, and documentation correctly stated billing is based on team/account resource usage rather than Project count. PZK-015 later added production resources to the same Project.
- 2026-07-08 PZK-002 pre-task review:
  - Reviewer Tesla: `gpt-5.5 xhigh`; flagged integer money/area scaling, unified BYN rounding, inactive/empty-service semantics, immutable-friendly snapshots, proposal-token safety, and keeping backend wiring for later tasks. Recommendations incorporated.
- 2026-07-08 PZK-002 post-task review round 1:
  - Reviewer Bernoulli: 9.5/10; no required code changes. Noted non-blocking gaps for unsupported formula skip tests and helper validation.
  - Reviewer Parfit: 8/10; required safe HTTPS URL validation, strict discriminated line-item quantities, reason-specific skipped-service schemas, immutable proposal artifact requirement, and matching tests. Changes incorporated.
- 2026-07-08 PZK-002 post-task review round 2:
  - Reviewer Confucius: 9.5/10; confirmed Parfit's required changes are resolved, no new required changes remain, and PZK-002 can be marked complete after tracker update.
- 2026-07-08 PZK-DESIGN-001 pre-task review:
  - Reviewer Galileo: `gpt-5.5 xhigh`; flagged that the task must remain a static design concept outside production UI/backend, use domain concepts from contracts, keep BYN primary and USD secondary, avoid paid cloud/plugin changes, and show calculator-first structure with future PDF state. Recommendations incorporated.
- 2026-07-08 PZK-DESIGN-001 post-task review round 1:
  - Reviewer Linnaeus: 9.1/10; required visible BYN line totals to reconcile with the displayed total and required an explicit contacts section. Changes incorporated.
  - Reviewer Socrates: 9.2/10; required an explicit contacts section and recording `PZK-DESIGN-001` in `task.md` before closure. Changes incorporated.
- 2026-07-08 PZK-DESIGN-001 post-task review round 2:
  - Reviewer Bohr: 9.6/10; confirmed BYN totals reconcile and contacts are present. Required tracker/review-log update before commit; this update records the final gate.
- 2026-07-08 PZK-DESIGN-001 v2 user-feedback pre-task review:
  - Reviewer Popper: `gpt-5.5 xhigh`; recommended classic hero hierarchy, real design-work bullets, project symbols instead of checkmarks, stronger calculator controls, post-КП questionnaire flow based on `Опросный лист.xlsx`, PDF example download actions, and avoiding commit/exposure of filled questionnaire answers. Recommendations incorporated.
- 2026-07-08 PZK-DESIGN-001 v2 post-task review round 1:
  - Reviewer Goodall: 9.2/10; required making `Скачать PDF` controls credible links, updating stale PNG dimensions in this tracker, ignoring the untracked filled questionnaire XLSX, and cleaning markdown trailing whitespace. Changes incorporated.
- 2026-07-08 PZK-DESIGN-001 v4 user-feedback pre-task review attempt:
  - `multi_agent_v1.spawn_agent` requested with `gpt-5.5 xhigh`, but failed with `collab spawn failed: agent thread limit reached`. Local v4 work proceeded without committing/pushing because the mandatory review gate is blocked.
- 2026-07-08 PZK-DESIGN-001 v4 post-task review attempt:
  - `multi_agent_v1.spawn_agent` requested with `gpt-5.5 xhigh`, but failed again with `collab spawn failed: agent thread limit reached`. The v4 PNG/brief/HTML remain local pending a reviewer score of `9.5/10` or explicit user-approved fallback.
- 2026-07-08 PZK-DESIGN-001 v4 post-task review round 2:
  - Reviewer Bernoulli: 9.2/10; required adding an explicit contact block and reconciling visible BYN totals. Changes incorporated.
  - Reviewer Poincare: 9.6/10; confirmed contacts are explicit, visible BYN totals reconcile to `3 143 Br`, PNG dimensions are `1440 x 5281`, and the static design concept is safe to commit/push after tracker cleanup.
- 2026-07-08 PZK-003 pre-task review:
  - Reviewer Hooke: `gpt-5.5 xhigh`; recommended BigInt/scaled integer DB storage, full calculation result snapshots, rejecting unavailable selected services before persistence, exchange-rate snapshots separate from settings, proposal artifact foundations, UUIDv7 consistency, and integration coverage through real PostgreSQL migrations. Recommendations incorporated.
- 2026-07-08 PZK-003 post-task review round 1:
  - Reviewer Gauss: 9.3/10; required treating active but non-public services as unavailable for public calculation saves and adding no-persistence coverage. Changes incorporated.
  - Reviewer Banach: 8.8/10; required the same hidden-service fix and review-log bookkeeping. Changes incorporated. Non-blocking recommendations included tightening weak response schemas and adding admin-auth/DB-constraint negative tests; these were also incorporated before round 2.
- 2026-07-08 PZK-003 post-task review round 2:
  - Reviewer Galileo: 9.6/10; confirmed hidden-service fix, server-side recalculation trust boundary, immutable snapshots, BigInt/scaled storage, exchange-rate snapshots, DB constraints, and PZK-003 scope. No required changes remained.
- 2026-07-09 PZK-004 pre-task review:
  - Reviewer Dirac: `gpt-5.5 xhigh`; warned not to call the save endpoint, noted the lack of public exchange-rate endpoint, required an intentional website dependency on shared contracts, flagged fixed/per_sqm rounding drift, responsive rebuild risks from the fixed-width concept, mobile service-row width, hidden/formula service handling, and local `file://`/PDF/Telegram scope traps. Recommendations incorporated.
- 2026-07-09 PZK-004 post-task review round 1:
  - Reviewer Harvey: 9.3/10; required visible BYN breakdown reconciliation with the headline total and a regression check. Changes incorporated.
  - Reviewer Meitner: 9.2/10; required the same BYN reconciliation plus service-switch focus restoration after row re-render; recommended explicit `aria-invalid` handling. Changes incorporated.
- 2026-07-09 PZK-004 focused post-task review round 2:
  - Reviewer Carver: 9.6/10; confirmed BYN row allocation reconciles to the shared-domain headline total, service switch focus is restored after toggling, and `aria-invalid` is set explicitly. No remaining required changes; PZK-004 gate cleared.
- 2026-07-09 PZK-005 pre-task review:
  - Reviewer Pasteur: `gpt-5.5 xhigh`; recommended idempotency in JSON body, server-side phone normalization, public services plus exchange-rate config, backend-only recalculation, pending proposal placeholder instead of PDF, duplicate/rate limiting, and API-backed browser verification. Recommendations incorporated.
- 2026-07-09 PZK-005 post-task review round 1:
  - Reviewer Plato: 8.0/10; required persisted consent evidence, idempotency fingerprint mismatch protection, safer idempotent retry/rate-limit behavior, and DB-backed duplicate race mitigation. Changes incorporated.
  - Reviewer Heisenberg: 8.2/10; required website/backend deploy wiring for `PUBLIC_API_URL` and CORS, privacy/contact copy alignment, idempotency reset on contact edits, and stronger browser verification. Changes incorporated.
- 2026-07-09 PZK-005 focused post-task review round 2:
  - Reviewer Darwin: 8.6/10; required minimizing public save responses, preventing same-key mismatched replay from bypassing throttling, and aligning persisted consent text with the UI copy. Changes incorporated.
  - Reviewer Dewey: 9.0/10; required a pending offer/PDF link or explicit pending state, fixing DigitalOcean deployment order around `DO_WEBSITE_URL`, closing the idempotency mismatch rate-limit hole, and making the privacy/deletion path less contradictory. Changes incorporated.
- 2026-07-09 PZK-005 focused post-task review round 3:
  - Reviewer Sartre: 9.6/10; confirmed public submit response minimization, rich admin records, pending proposal link/page, exact idempotent retry exemption, mismatched replay rate limiting, deployment sequence/env fixes, matching consent copy, and visible test coverage. No required changes remained; PZK-005 gate cleared.
- 2026-07-09 PZK-006 pre-task review:
  - Reviewer Euler: `gpt-5.5 xhigh`; flagged self-contained immutable snapshots, separate token-gated PDF route, final artifact before success, lack of server-side storage writer, Chromium/Docker runtime risk, no dynamic regeneration, compact long-service layout, Cyrillic/BYN verification, and public/admin data separation. Recommendations incorporated.
- 2026-07-09 PZK-006 post-task review round 1:
  - Reviewer Hubble: 9.2/10; required not exposing PDF links for legacy HTML-only proposal rows, adding private `no-store` cache headers on public HTML proposal pages, and regression coverage. Changes incorporated.
  - Reviewer Kant: 9.2/10; required PDF BYN line totals to reconcile with the headline total and automated coverage for that allocation. Changes incorporated.
- 2026-07-09 PZK-006 focused post-task review round 2:
  - Reviewer Dirac: 9.6/10; confirmed legacy HTML-only handling, no-store proposal HTML headers, PDF BYN row allocation, and regression tests. No required changes remained; PZK-006 gate cleared.
- 2026-07-09 PZK-007 pre-task review:
  - Reviewer Copernicus: `gpt-5.5 xhigh`; flagged public template registration as the main admin-takeover risk, recommended a one-off first-admin script instead of browser bootstrap, role-backed admin authorization, preserving public calculator routes, and updating tests that relied on registration. Recommendations incorporated.
- 2026-07-09 PZK-007 post-task review round 1:
  - Reviewer Ramanujan: 8.8/10; required shared/trusted production login rate limiting, explicit proxy-header trust boundary, and `403` OpenAPI responses for admin routes. Changes incorporated.
  - Reviewer Godel: 8.8/10; required production `COOKIE_SECURE=true` enforcement, direct `admin:create` safeguard tests, and `403` OpenAPI responses; recommended adding `ADMIN_CREATE_ALLOW_ADDITIONAL` to env examples. Changes incorporated.
- 2026-07-09 PZK-007 focused post-task review round 2:
  - Reviewer Averroes: 9.3/10; required atomic DB increments for login rate-limit buckets under concurrent failed-login bursts. Changes incorporated with PostgreSQL upsert and concurrent integration coverage.
  - Reviewer Fermat: 8.0/10; required splitting public CORS from credentialed admin/auth CORS, hardening login client buckets against spoofed headers/User-Agent rotation, atomic limiter increments, and no-store auth error headers. Changes incorporated.
- 2026-07-09 PZK-007 focused post-task review round 3:
  - Reviewer Pasteur: 9.6/10; confirmed credentialed CORS is limited to `AUTH_CORS_ORIGINS`, public website origins cannot refresh admin cookies into readable access tokens, admin routes are protected, the raw SQL limiter is atomic, and docs/templates are consistent. No required changes remained; PZK-007 gate cleared. Non-blocking hardening noted: consider stripping `refreshToken` from JSON responses whenever an `Origin` header is present or cookie-backed auth is used.
- 2026-07-09 PZK-008 pre-task review:
  - Reviewer Hypatia: `gpt-5.5 xhigh`; flagged service CRUD pitfalls around archive vs hard delete, `isActive`/`isPublic` invariants, transactional reorder, formula/future-service scope, USD cent parsing, missing exchange-rate preview state, and preserving calculation/PDF snapshots. Recommendations incorporated.
- 2026-07-09 PZK-008 post-task review round 1:
  - Reviewer Confucius: 8/10; required deriving `isPublic=false` whenever a service is inactive, including direct API create/update paths, adding regression coverage, and preventing formula rows from being edited/coerced in the admin UI. Changes incorporated.
  - Reviewer Volta: 8/10; found no required blockers for completion but recommended the same formula-row and inactive-create hardening, plus noting DB-level positive-price hardening as future work. Recommended changes incorporated.
- 2026-07-09 PZK-008 focused post-task review round 2:
  - Reviewer Mill: 9/10; confirmed archived service re-publication, inactive create, and formula UI controls were fixed. No required changes remained, but noted direct authenticated API could still convert formula rows into ordinary pricing types. Additional hardening was added.
  - Reviewer Pasteur: 9/10; confirmed admin CRUD, archive/restore, reorder, USD entry with BYN preview, public filtering, formula exclusion, and snapshot immutability. No required changes remained, but the 9.5 review gate was not yet cleared.
- 2026-07-09 PZK-008 final post-task review round 3:
  - Reviewer Hubble: 9.6/10; confirmed PZK-008 meets the task gate after direct API formula transition hardening. No required changes remained; PZK-008 gate cleared.
- 2026-07-10 PZK-009 pre-task review:
  - Reviewer Sagan: `gpt-5.5 xhigh`; flagged missing admin CRM list/update APIs, string status validation risk, preserving public-response privacy, deterministic proposal ordering for original artifacts, lean list rows, phone/date filter edge cases, `Spam/Test` active-count semantics, notes limits, and API-base-aware proposal links. Recommendations incorporated.
- 2026-07-10 PZK-009 post-task review round 1:
  - Reviewer Hilbert: 9.6/10; found no blocking issues and confirmed admin-only routes, status validation, status timestamp semantics, notes persistence, active-count exclusion, immutable proposal reads, and test coverage. Non-blocking gaps included stricter date validation, HTML-only label polish, and pagination beyond 100 rows.
  - Reviewer Dewey: 9.0/10; required real calendar-date validation and pagination/copy that does not imply more rows are rendered than the current page. Changes incorporated with contract/backend tests and webapp pagination range tests.
- 2026-07-10 PZK-009 focused post-task review round 2:
  - Reviewer Ptolemy: 9.6/10; confirmed pagination/copy, valid calendar-date filtering, and HTML-only proposal label fallback fixes. No required changes remained; PZK-009 gate cleared.
- 2026-07-10 PZK-010 pre-task review:
  - Reviewer Harvey: `gpt-5.5 xhigh`; flagged sending only for `created=true`, notifying after DB persistence and proposal creation, using the internal calculation record instead of the minimized public response, env-only Telegram secrets, absolute links from configured backend URLs, concise no-extra-PII text, sanitized logs, injectable notifier tests, and no duplicate/idempotent resend. Recommendations incorporated.
- 2026-07-10 PZK-010 post-task review round 1:
  - Reviewer McClintock: 9.6/10; no required changes. Confirmed notification happens only after a newly-created committed calculation/proposal, failures are caught without breaking lead submission, duplicates/idempotent replays do not notify, message content and omission of extra PII are covered, secrets remain env-only and absent from public responses, and docs are sufficient. Non-blocking gaps noted for raw network timeout/rejection hardening and missing public URL fallback tests; PZK-010 gate cleared.
- 2026-07-10 PZK-011 pre-task review:
  - Reviewer Halley: `gpt-5.5 xhigh`; flagged public/static PDF deploy-safety, proposal snapshot immutability, ProjectExample API reuse, admin-shell scope control, and source-PDF size/page checks. Recommendations incorporated.
- 2026-07-10 PZK-011 post-task review round 1:
  - Reviewer Zeno: 9.2/10; required wiring `PUBLIC_WEBSITE_URL` into backend DigitalOcean deployment specs and deploy tests before closure. Changes incorporated.
  - Reviewer Dewey: 8.3/10; required the same deploy env fix, committing the untracked contracts/PDF assets, unique accessible names for repeated PDF links, and tracker cleanup. Changes incorporated.
- 2026-07-10 PZK-011 focused post-task review round 2:
  - Reviewer Gibbs: 9.6/10; confirmed `PUBLIC_WEBSITE_URL` backend spec wiring, deploy validation/tests, unique PDF link accessible labels, immutable proposal snapshot coverage, and no remaining required changes. PZK-011 gate cleared.
- 2026-07-10 PZK-012 pre-task review:
  - Reviewer Aristotle: `gpt-5.5 xhigh`; flagged stale handoff docs, `master` vs actual `main` branch guidance, missing `webapp/.env` setup copy, missing `PUBLIC_WEBAPP_URL` in `website/.env.example`, already-present CI, no-secrets scan expectations, and the need to document accepted early non-task setup commits without rewriting published history. Recommendations incorporated.
- 2026-07-10 PZK-012 post-task review round 1:
  - Reviewer Noether: 9.6/10; found no implementation-blocking changes. Confirmed README handoff coverage, `.gitignore` local artifact coverage, agent branch guidance alignment, frontend env example consistency, CI documentation, git remote/branch state, and full provided verification. PZK-012 gate cleared; only final tracker update, commit, and push remained.
- 2026-07-10 PZK-013 pre-task review:
  - Reviewer Dalton: `gpt-5.5 xhigh`; recommended App Platform + Managed PostgreSQL 18, future `--project-id` usage, no real leads on bootstrap `*.ondigitalocean.app` URLs, region/runtime tightening, DB-backed proposal PDFs for v1, and smoke checks beyond `/health`. Recommendations incorporated.
- 2026-07-10 PZK-013 post-task review round 1:
  - Reviewer Kuhn: 9.1/10; required making DNSSEC a PZK-014 preflight blocker, adding `--project-id` to all App Platform create examples, aligning hostname examples to `www`/`admin`/`api`, and replacing the README `task.md` DNS pointer with the decision-gate document. Changes incorporated.
- 2026-07-10 PZK-013 focused post-task review round 2:
  - Reviewer Noether: 8.5/10; confirmed prior content fixes but required tracker reconciliation and including the new decision document in the final commit before handoff. Changes incorporated.
- 2026-07-10 PZK-013 final focused post-task review round 3:
  - Reviewer Ptolemy: 9.6/10; confirmed the staged tree satisfies PZK-013, the decision document is included, `task.md` is reconciled, DNSSEC/project-ID/hostname/README blockers are resolved, and no cloud provisioning artifacts are present. No required changes remained; PZK-013 gate cleared.
- 2026-07-11 PZK-014 pre-task review:
  - Reviewer Godel: `gpt-5.5 xhigh`; flagged missing backend `PUBLIC_API_URL`/`PUBLIC_WEBAPP_URL`, unpinned PostgreSQL 18 in the app spec, region default drift, loose Bun runtime pinning, need for concrete registrar DNS placeholders, separate-app shape clarity, `DATABASE_URL` vs `DATABASE_PRIVATE_URL` validation, and proposal/PDF smoke risks. Recommendations incorporated.
- 2026-07-11 PZK-014 post-task review round 1:
  - Reviewer Erdos: 9.6/10; confirmed draft App Platform specs/templates, PostgreSQL 18 pinning, runtime/env coverage, DNS runbook, rollback/backup/smoke checklists, Project ID usage, and explicit no-resource-creation language. No required changes remained; PZK-014 gate cleared after tracker update.
- 2026-07-17 PZK-015 pre-task review:
  - Reviewer Faraday: `gpt-5.5 xhigh`; flagged paid-resource approval, apex-vs-`www` canonical choice, DNSSEC/CAA checks, custom-domain env ordering, no real leads on temporary App Platform URLs, first-admin setup, Telegram optional env, and post-deploy smoke. Recommendations incorporated.
- 2026-07-17 PZK-015 production Chromium hotfix review:
  - Reviewer Sagan: 9.7/10; confirmed the App Platform Chromium discovery fix covered the deployed Playwright cache path and Docker PDF smoke produced a valid PDF. No required changes remained for the hotfix.
- 2026-07-17 PZK-015 post-task review rounds:
  - Reviewer Raman: 8.2/10; required removing stale no-resource deployment docs, updating PZK-014 runbook/current production guidance, replacing `www`-canonical `PUBLIC_WEBSITE_URL` examples with canonical public origin guidance, and redacting a live public proposal token. Changes incorporated.
  - Reviewer Franklin: 9.0/10; required updating `digitalocean-decision-gate.md` so the linked decision record did not contradict PZK-015 production state. Changes incorporated.
  - Reviewer McClintock: 9.2/10; required time-scoping old Project/no-resource statements, annotating PZK-014 `www` placeholder history as superseded by PZK-015 apex production, and reframing open launch questions as post-launch follow-ups. Changes incorporated.
  - Reviewer Ramanujan: 9.3/10; required fixing the top-level deployment target section that still said the Project had no resources. Changes incorporated.
  - Reviewer Feynman: 9.7/10; confirmed stale deployment phrases are gone from active wording, no production secrets are present, only the expected markdown files are modified, and PZK-015 gate is cleared.
- 2026-07-17 PZK-016 pre-task review:
  - Reviewer McClintock: `gpt-5.5 xhigh`; flagged e2e accessible-name churn, preserving API enum values while localizing labels, forced horizontal scroll in leads/detail, auth error localization boundaries, unit/currency consistency, and typography-policy risk. Recommendations incorporated.
- 2026-07-17 PZK-016 post-task review:
  - Reviewer Herschel: 9.6/10; confirmed Russian admin UI, API enum boundary preservation, removal of forced lead/detail horizontal-scroll patterns, mobile card layouts, PDF/status/notes/service CRUD coverage, and e2e/test updates. No required changes remained; PZK-016 gate cleared.
- 2026-07-17 PZK-017 post-task review round 1:
  - Reviewer Franklin: 9.0/10; no hard blockers, but flagged direct admin ProjectExample `fileUrl` leakage into new КП, public `/api/public/project-examples` exposing `fileUrl`, generic calculation-specific rate-limit wording for example requests, and unrelated design/prototype files needing to remain unstaged. Fixes incorporated before final review.
- 2026-07-17 PZK-017 focused post-task review round 2:
  - Reviewer Pauli: 9.6/10; confirmed public example summaries omit `fileUrl`, КП proof cards no longer emit direct PDF URLs, tokenized PDF delivery is behind saved contact requests, admin visibility is present, and unrelated landing V4/prototype files must remain outside the PZK-017 commit. No required blockers remained; PZK-017 gate cleared.
