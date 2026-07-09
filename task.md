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
- Current resources in this Project: none.
- No paid App Platform app, database, storage, Droplet, or other billable resource has been created for this calculator yet.
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
- DigitalOcean Project organizer created later: `engineering-calculator` / `e0c43cc8-3ea8-4c16-a390-738e56d9c3e3`; it currently contains no resources.

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

Status: pending

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

### PZK-006 - PDF Commercial Offer

Status: pending

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

### PZK-007 - Admin Auth

Status: pending

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

### PZK-008 - Admin Services Management

Status: pending

Goal:

- Build admin CRUD for services and prices.

Acceptance criteria:

- Admin can add/edit/archive/reorder services.
- Supports fixed and per-square-meter pricing.
- Prices are entered in USD and previewed in BYN.
- Archive is preferred over hard delete for services used in previous calculations.
- Verification covers create, edit, archive, reorder, and public visibility changes.

### PZK-009 - Admin Leads Mini-CRM

Status: pending

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

### PZK-010 - Telegram Notifications

Status: pending

Goal:

- Send Telegram notification for each new submitted calculation.

Acceptance criteria:

- Notification contains lead/contact/total/selected-services/admin-link/pdf-link.
- Failed Telegram delivery does not break lead submission.
- Environment variables are documented.
- Token/chat ID are not exposed to the browser or returned by API responses.
- Verification covers successful notification and simulated Telegram failure.

### PZK-011 - Project Examples

Status: pending

Goal:

- Add public project examples using provided PDFs.

Acceptance criteria:

- Example project PDFs are available from public page and/or PDF offer.
- Admin can manage examples if included in v1.
- Files are stored in a deploy-safe location.
- Verification covers public access to example links and PDF offer links.

### PZK-012 - GitHub Preparation

Status: pending

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

### PZK-013 - DigitalOcean Deployment Decision Gate

Status: pending

Goal:

- Decide and document the production deployment shape before provisioning resources.

Acceptance criteria:

- App Platform vs Droplet + Docker Compose is chosen.
- Database, PDF/proposal storage, migrations, health checks, env vars, runtime versions, domain/HTTPS/proxy assumptions, backups, rollback plan, and expected monthly cost/risk are documented.
- Domain plan uses registrar-managed DNS with CNAME/A records pointing to the DigitalOcean app after it exists; nameserver migration to DigitalOcean is out of scope unless explicitly approved later.
- Exact production hostnames are chosen for public website, admin/webapp, and API before DNS cutover.
- Canonical `www` vs apex behavior is chosen and documented.
- User explicitly approves paid cloud resource creation or changes.

### PZK-014 - DigitalOcean Deployment Prep

Status: pending

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

## 11. Open Questions

These do not block PZK-001, but should be resolved before final public launch:

- Exact brand name to show: `ИП Позняк`, another name, or a future studio/bureau name?
- Exact contact phone/email/Telegram for production.
- Should sample PDFs be public downloads immediately or gated by phone?
- Which Telegram chat should receive lead notifications?
- Should PDF offers have an expiration period, for example 7 or 14 days?
- Should admin support multiple users in v1 or only one owner account?
- Should leads be exportable to CSV in v1?
- Exact BYN symbol/notation to use everywhere: confirm final glyph/mark before UI/PDF polish.
- Confirm privacy policy text and retention period for public lead data.
- Confirm whether public PDF/proposal links should expire or remain permanently accessible by token.
- Confirm the exact production domain/subdomain and registrar account access before attaching it to DigitalOcean.

## 12. Known Risks And Edge Cases

- Old offers must not change after service price, title, or exchange-rate edits.
- Phone validation must accept Belarusian and common international formats without rejecting valid clients.
- BYN rounding rules must be consistent between public UI, admin, backend, and PDF.
- PDF generation may differ between local and server environments; verify font rendering, page breaks, and Cyrillic support.
- Generated PDFs need a stable storage strategy for DigitalOcean.
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
  - Post-task reviewer Sartre: 9.8/10; confirmed `engineering-calculator` Project exists, contains no resources, and documentation correctly states billing is based on team/account resource usage rather than Project count.
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
