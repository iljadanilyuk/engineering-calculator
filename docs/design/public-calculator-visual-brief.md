# PZK-DESIGN-001 - Public Calculator Visual Brief

Date: 2026-07-08
Revision: v4 after typography/hero feedback
Artifact: `docs/design/public-calculator-concept.png`
Preview source: `docs/design/public-calculator-concept.html`
Questionnaire source: `docs/design/Опросный лист.xlsx`
Pricing source: `docs/design/Стоимость проектных работ (1).xlsx`

## Scope

This is a static visual concept before PZK-004. It does not implement production UI, does not connect backend APIs, does not create DigitalOcean/cloud resources, and does not touch the Codex plugin layer.

The two XLSX files are local design sources. They should not be committed without explicit approval because they contain working business/client-like data.

## Design Direction V4

Direction: dark professional engineering service for a male technical audience.

The concept uses the user's audience and identity research:

- primary audience: men 35-55 building or renovating a private house;
- decision style: rational, technical, comparison-driven;
- anxiety: overpaying or getting a weak engineering solution;
- trust drivers: numbers, схемы, состав проекта, examples of real PDF documentation;
- tone: expert and direct, without salesy or template landing-page phrasing.

Design references used:

- `frontend-design`: distinctive, context-specific interface rather than a generic landing page.
- `design-md-library`: BMW-style restraint adapted to engineering services: dark hero, precise grid, controlled accent, no decorative clutter.
- `design-taste-frontend`: no serif fonts for this technical UI, no purple/neon, no generic 3-card filler, stable desktop grid.
- `ui-ux-pro-max`: contrast, readable type scale, visible form labels, touch-friendly future controls.

## First Screen

V4 returns to the classic page hierarchy requested by the user:

1. Header with `ИП Позняк`.
2. H1 with the offer.
3. Supporting sub-offer.
4. Real project-value bullets.
5. Full-width calculator as the main working object.

Hero bullets are not tech-meta cards. They describe client outcomes:

- `Σ` - сумма до заявки;
- `ΔT` - понятный состав проекта and calculations;
- `КП` - PDF commercial proposal;
- `ОП` - detailed questionnaire after КП.

The first screen uses conditional project symbols instead of generic checkmarks.

## Calculator Model

The preview uses `docs/design/Стоимость проектных работ (1).xlsx` as the pricing reference.

Fixture values:

- area: `180 м²`;
- exchange rate: `2.8668`;
- total: `1096 $` / about `3143 BYN`;
- selected sections:
  - `Проект котельной + 3D` - `200 $`;
  - `Радиаторное отопление` - `90 $`;
  - `Теплые полы` - `108 $`;
  - `Водопровод` - `90 $`;
  - `Канализация` - `108 $`;
  - `Вентиляция` - `250 $`;
  - `Кондиционирование` - `250 $`;
- optional modifier shown but not enabled: `индивидуальные хотелки +40%`;
- minimum design cost: `200 $`;
- payment condition: `70% старт / 30% после передачи проекта`;
- project delivery: PDF by email.

The calculator is intentionally simpler than the previous concept:

- left column: object parameters;
- center: service rows with rates and lever switches;
- right: live BYN/USD result, short terms, lead CTA.

PZK-004 must still use the shared calculation domain/backend recalculation rather than fixture values from this preview.

## Lever Faucet Switch

The visual signature is a plumbing lever with a handle, not a circular valve wheel.

States:

- active: orange handle is horizontal along the pipe;
- inactive: grey handle is rotated upward;
- row selection remains semantically a switch/checkbox in production.

Why this works:

- it is specific to heating/VK engineering;
- it replaces generic checkmarks;
- it is recognizable to homeowners and монтажники;
- it can later animate without changing calculation logic.

## Typography

Use Google Fonts with Cyrillic support:

- headings: `Montserrat` 700-800;
- body/UI: `IBM Plex Sans` 400-700.

Reasons:

- `Montserrat` gives sturdy geometric authority for the offer and section titles;
- `IBM Plex Sans` reads as technical, precise, and less generic than a default UI stack;
- no serif fonts;
- no negative letter spacing;
- tabular numerals for prices, rates, and area.

Rejected for this direction:

- serif display pairings;
- overly soft lifestyle fonts;
- generic default Inter-only look.

## Palette

Primary palette:

- dark hero navy: `#0B2239`;
- secondary navy: `#123452`;
- warm off-white: `#F9F7F4`;
- surface: `#FFFFFF`;
- main CTA / active lever: `#FF6B35`;
- neutral text: `#4A4A48`;
- steel blue: `#2F5F7F`;
- steel light: `#A4B4D4`;
- line: `#DED7CC`.

The palette is masculine by material and contrast: dark engineering field, steel notation, warm paper, orange CTA/lever. No green glow, no beige-only theme, no purple/blue gradient language.

## BYN Sign

The preview uses an approximation of the 2026 NBRB graphic sign: Cyrillic `Б` with a horizontal stroke.

Production notes:

- prefer official SVG/font asset if available and reliable;
- keep `BYN` as accessibility/PDF fallback;
- verify browser and generated PDF rendering before launch.

Reference: NBRB page `https://www.nbrb.by/coinsbanknotes/byn-ico`.

## Page Structure

The mockup covers the planned public page:

- first screen: brand, offer, bullets, calculator;
- object parameters;
- project-service selection;
- live result summary in BYN/USD;
- what is included in design work;
- object types and project examples;
- stages of work;
- lead form / CTA `Получить коммерческое предложение`;
- future PDF/proposal state;
- post-КП questionnaire preview.

## Project Examples

The example block must have visible download actions:

- `Пример проекта ОВ` -> `E:\vc\bella\proekt_primer_ov.pdf`;
- `Пример проекта ВК` -> `E:\vc\bella\primer_proekt_vk.pdf`.

The cards use schematic project-sheet miniatures, not stock photos. This keeps the design technical and close to the actual product.

## Questionnaire

The questionnaire remains a post-КП step.

Reason:

- the main product promise is quick calculation;
- the questionnaire is long and technical;
- a client who has already requested КП is more ready to fill detailed data.

Concept behavior:

- section progress;
- grouped questions;
- answer chips;
- free-text field;
- future upload state;
- manager-assisted flow.

Do not surface filled sample answers from `Опросный лист.xlsx` in the public preview.

## Components For PZK-004

Recommended shadcn/21st-style building blocks:

- `Button`;
- `Input`;
- numeric input/slider for area;
- accessible `Switch`/`Checkbox` with custom lever visual;
- `Badge` for rate/mode labels;
- compact result/breakdown list;
- `Progress`;
- `Tabs` or stepper for questionnaire sections;
- `Textarea`;
- file upload component;
- PDF/proposal preview card.

The production implementation should customize radii, color tokens, typography, and switch visuals. Do not ship default shadcn styling as-is.

## Mobile Notes

- Hero stacks as: brand, H1, sub-offer, bullets, calculator.
- Calculator columns collapse to: result first or sticky result, then object fields, then service rows.
- Lever rows become large touch targets.
- PDF example buttons stay visible under each example.
- Questionnaire should become a separate route/step, not a cramped block under the calculator.

## Verification Notes

Screenshot command:

```powershell
bun x playwright screenshot --full-page --viewport-size=1440,2600 "file:///E:/vc/poznyak-engineering-calculator/docs/design/public-calculator-concept.html" docs/design/public-calculator-concept.png
```

PDF page count check:

```powershell
@'
from pypdf import PdfReader
for path in [r'E:\vc\bella\primer_proekt_vk.pdf', r'E:\vc\bella\proekt_primer_ov.pdf']:
    reader = PdfReader(path)
    print(path.split('\\')[-1], len(reader.pages))
'@ | python -
```

Expected:

- `primer_proekt_vk.pdf 24`;
- `proekt_primer_ov.pdf 39`.
