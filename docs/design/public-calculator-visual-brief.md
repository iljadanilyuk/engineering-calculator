# PZK-DESIGN-001 - Public Calculator Visual Brief

Date: 2026-07-08
Artifact: `docs/design/public-calculator-concept.png`
Preview source: `docs/design/public-calculator-concept.html`

## Scope

This is a static visual concept for the public calculator page before PZK-004. It is not production UI, does not connect to backend APIs, and uses fixture services/rates derived from the shared calculation domain.

The visual concept follows the public product requirements in `task.md`: first screen with brand, offer, and calculator; object parameters; service selection; BYN-first live summary with USD as secondary reference; project scope explanation; object examples; process; lead CTA; future PDF/proposal state; contacts.

## Visual Direction

Design direction: light strict engineering bureau, inspired by the local `linear.app` and `stripe` design-md references, adapted for a calculator-first service page.

The page should feel like a precise working instrument rather than a decorative landing widget. The calculator is the hero object. Marketing content supports the calculation, explains trust, and guides the user toward a commercial proposal.

Key qualities:

- light technical workspace, not a dark SaaS dashboard;
- clean grid, thin borders, restrained shadows, 8px or smaller radii;
- tabular numerals for money, area, exchange rate, and proposal IDs;
- BYN total is visually dominant, USD is smaller and secondary;
- one primary action: `Получить коммерческое предложение`;
- engineering plan/blueprint visual cues instead of generic stock imagery.

## Reference Analysis

### Heaton

`https://calc.heaton.by/` is the closest functional reference. It puts calculator parameters first: object area, heat loss, occupants, currency, person type, detailed settings, and then results. For ИП Позняк, the useful pattern is not the full density, but the order of thinking:

- start with object parameters;
- expose assumptions and currency/rate;
- show results close to inputs;
- allow details without making the first screen unreadable.

Adaptation for ИП Позняк:

- use fewer first-screen fields;
- keep a compact expandable mental model for future advanced settings;
- replace fuel/tariff comparisons with service-line breakdown;
- make PDF/proposal capture explicit after the live calculation.

### 21st.dev

`https://21st.dev/` contributes component-catalog polish: compact category navigation, refined component surfaces, filters, and a sense that the page is assembled from high-quality primitives.

Adaptation for ИП Позняк:

- use polished component patterns without shaders or visual spectacle;
- favor tabs, tags, filters, rows, and dense cards;
- keep the design quieter than a community component marketplace.

### shadcn/ui

`https://ui.shadcn.com/` is the component baseline. The concept should use shadcn-style primitives customized for this brand rather than raw browser controls.

Recommended components for PZK-004:

- `Button` for primary/secondary actions;
- `Input` and `InputGroup` for area, name, and phone;
- `Checkbox` for service selection;
- `ToggleGroup` or segmented control for object type;
- `Slider` for optional area adjustment if it stays useful;
- `Badge` for pricing type, PDF status, and rate source;
- `Card` only for repeated items, examples, FAQ, and the calculator tool frame;
- `Separator` for calculation sections;
- `Tooltip` for rate source, rounding, and skipped/future services;
- `Accordion` for FAQ or advanced assumptions;
- `Table` or compact list rows for calculation breakdown when detail is expanded.

## Grid And Composition

Desktop concept:

- Canvas: 1440px wide static screenshot.
- Inner container: 1240px.
- First screen: two-column layout.
  - Left column: brand promise, value copy, trust chips, small stats.
  - Right column: calculator workspace.
- Calculator workspace:
  - Header with state badge.
  - Main input/service area.
  - Right summary rail with BYN/USD result, rate snapshot, breakdown, warning slot, lead fields.
- Subsequent sections:
  - Full-width bands with a 330px title column and flexible content column.
  - Object parameters strip.
  - Included work grid.
  - Object examples with technical thumbnails.
  - Process timeline.
  - CTA/proposal band with form and future PDF preview.
  - Optional FAQ near the end.
  - Explicit contacts block with phone, Telegram, email, and response-time placeholders.

Avoid nested decorative cards. The calculator is a framed tool; repeated content uses simple cards with thin borders.

## Palette

The palette is intentionally multi-axis: paper/graphite base, engineering green, measured blue, and a small amber warning state.

- Page paper: `#f7f8f5`
- Secondary surface: `#eef2ef`
- Surface: `#ffffff`
- Text: `#14201b`
- Muted text: `#647069`
- Hairline: `#d9e0db`
- Strong line: `#bcc8c0`
- Primary green: `#1f6b57`
- Green soft: `#dfeee7`
- Technical blue: `#315f8f`
- Blue soft: `#e4edf7`
- Warning amber: `#a66a1f`
- Warning soft: `#f4ead9`

The page should not become a one-color green theme. Blue is used for engineering plan cues and indexed components; amber is reserved for stale/fallback rate warnings.

## Typography

Preview uses Windows-safe local fonts to keep the screenshot stable:

- body: `Aptos`, `Segoe UI`, `Noto Sans`, sans-serif;
- numerals/IDs: `Cascadia Mono`, `Consolas`, monospace.

Production recommendation:

- choose a self-hosted Cyrillic-safe sans such as IBM Plex Sans, Noto Sans, or another licensed engineering-appropriate family;
- keep `font-variant-numeric: tabular-nums` for totals, rates, area, and proposal numbers;
- avoid viewport-scaled font sizes;
- no negative letter spacing;
- hero heading can be large, but form panels and cards should use compact headings.

## Calculator Content Model

The preview mirrors the existing shared domain instead of inventing another model:

- `areaSqm` controls per-square-meter services;
- services can be `fixed`, `per_sqm`, or future `formula`;
- active fixed/per-square-meter services contribute line items;
- future formula services should be shown as `по запросу` or disabled until formulas are implemented;
- exchange rate is shown as a snapshot;
- BYN display rounds to whole rubles;
- PDF/proposal state is gated by name, phone, and consent in later tasks.

Fixture example in the preview:

- area: `180 м²`;
- rate: `1 USD = 3.2500 BYN`;
- selected services:
  - отопление: `5 $/м²`;
  - водоснабжение и канализация: `3 $/м²`;
  - пояснительная записка и ведомости: `250 $ fixed`;
- result: `5 493 Br`, secondary `~1 690 $`.

Use `Br` in the visual concept. Confirm the exact Belarusian ruble glyph/notation before final launch and PDF polish.

The fixture is intentionally chosen so the whole-ruble BYN line display visibly reconciles with the whole-ruble total in the mockup. Production should still use the shared domain rounding policy as the source of truth.

## Mobile Notes

Mobile should not be a squeezed desktop calculator.

- Header compresses to brand, phone/action, and menu.
- First screen stacks: offer copy, then calculator, then result summary.
- The BYN total should stay visible after service changes, either as a sticky bottom summary or a compact summary directly after services.
- Service rows become single-column touch targets with checkbox, title, pricing type, BYN and USD.
- Advanced rate/fallback warning should stay inline and readable.
- Proposal form fields stack vertically; CTA remains full-width.
- Object examples should become a horizontal carousel or single-column cards.
- Process timeline becomes vertical.
- PDF preview should be simplified to a compact proposal status card.

## States To Cover In PZK-004

The static PNG shows only one default selected state. Future implementation should cover:

- empty service selection;
- selected/unselected service rows;
- unsupported future formula service;
- inactive/skipped service;
- stale exchange rate warning;
- fallback exchange rate warning;
- invalid area;
- invalid/missing name and phone;
- consent not accepted;
- lead submitted and PDF pending;
- PDF ready;
- Telegram/API failure later, without blocking lead creation.

## Files

- Static preview HTML: `docs/design/public-calculator-concept.html`
- Screenshot artifact: `docs/design/public-calculator-concept.png`

Screenshot command:

```powershell
bun x playwright screenshot --full-page --viewport-size=1440,2540 "file:///E:/vc/poznyak-engineering-calculator/docs/design/public-calculator-concept.html" docs/design/public-calculator-concept.png
```
