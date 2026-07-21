import {
  publicProjectExampleAssets,
  type CalculationLineItem,
  type CalculationResult,
} from '@poznyak-engineering-calculator/contracts'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const commercialProposalTemplateVersion = 'commercial-proposal-v2'

export type CommercialProposalInput = {
  offerNumber: string
  publicToken: string
  clientName: string
  clientPhone: string
  objectName: string | null
  calculation: CalculationResult
  issuedAt: Date
  sourcePageUrl?: string | null
  projectExamples?: CommercialProposalProjectExample[]
}

export type CommercialProposalProjectExample = {
  code?: string | null
  title: string
  description?: string | null
  fileUrl: string
}

export type CommercialProposalArtifact = {
  templateVersion: string
  htmlSnapshot: string
  pdfBytes: Uint8Array
  pdfByteSize: number
  storageKey: string
  checksumSha256: string
}

export type ProposalPdfRenderer = (html: string) => Promise<Uint8Array>

export type ProposalGenerator = {
  generate(input: CommercialProposalInput): Promise<CommercialProposalArtifact>
}

export type CommercialProposalGeneratorOptions = {
  chromiumExecutablePath?: string
  renderPdf?: ProposalPdfRenderer
}

type CommercialProposalHtmlRenderOptions = {
  heroImageDataUri?: string | null
}

const maxVisibleServiceRows = 7
const paymentTerms = '70% для начала работы, 30% перед выдачей полного комплекта со спецификациями'
const validityDays = 14
const proposalHeroImageUrl = new URL('../../assets/proposal/hero-consultation-v2.jpg', import.meta.url)
let proposalHeroImageDataUriPromise: Promise<string | null> | null = null

export function createCommercialProposalGenerator(
  options: CommercialProposalGeneratorOptions = {},
): ProposalGenerator {
  const renderPdf =
    options.renderPdf ??
    (options.chromiumExecutablePath
      ? (html: string) => renderPdfWithChromiumExecutable(html, options.chromiumExecutablePath!)
      : renderPdfWithPlaywright)

  return {
    generate: (input) => createCommercialProposalArtifact(input, renderPdf),
  }
}

export async function createCommercialProposalArtifact(
  input: CommercialProposalInput,
  renderPdf: ProposalPdfRenderer,
): Promise<CommercialProposalArtifact> {
  const htmlSnapshot = renderCommercialProposalHtmlSnapshot(input, {
    heroImageDataUri: await proposalHeroImageDataUri(),
  })
  const pdfBytes = await renderPdf(htmlSnapshot)
  const checksumSha256 = sha256Hex(pdfBytes)

  return {
    templateVersion: commercialProposalTemplateVersion,
    htmlSnapshot,
    pdfBytes,
    pdfByteSize: pdfBytes.byteLength,
    storageKey: createProposalStorageKey(input),
    checksumSha256,
  }
}

export function renderCommercialProposalHtmlSnapshot(
  input: CommercialProposalInput,
  options: CommercialProposalHtmlRenderOptions = {},
) {
  const issuedDate = formatDate(input.issuedAt)
  const validUntil = formatDate(addDays(input.issuedAt, validityDays))
  const visibleLineItems = input.calculation.lineItems.slice(0, maxVisibleServiceRows)
  const hiddenLineItemCount = Math.max(0, input.calculation.lineItems.length - visibleLineItems.length)
  const displayBynRubles = allocateDisplayBynRubles(input.calculation, visibleLineItems)
  const examplesUrl = withHash(input.sourcePageUrl, 'examples')
  const contactsUrl = withHash(input.sourcePageUrl, 'contacts')
  const siteUrl = siteOriginUrl(input.sourcePageUrl) ?? contactsUrl ?? 'https://poznyak.by/'
  const nextStepUrl = contactsUrl ?? siteUrl
  const projectExamples = proposalProjectExamples(input)
  const totalRubles = formatInteger(input.calculation.totals.totalBynRoundedRubles)
  const proposalUrlPath = `/api/public/proposals/${encodeURIComponent(input.publicToken)}`
  const proposalPdfUrlPath = `${proposalUrlPath}/pdf`
  const heroImageAttribute = options.heroImageDataUri
    ? ` style="background-image: linear-gradient(90deg, rgba(8,26,47,.04), rgba(8,26,47,0)), url('${escapeHtml(options.heroImageDataUri)}');"`
    : ''

  return [
    '<!doctype html>',
    '<html lang="ru">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<meta name="robots" content="noindex,nofollow" />',
    `<title>${escapeHtml(input.offerNumber)} | Коммерческое предложение</title>`,
    '<style>',
    proposalCss(),
    '</style>',
    '</head>',
    '<body>',
    '<div class="proposal-shell">',
    '<nav class="proposal-actions-shell" aria-label="Действия с коммерческим предложением">',
    '<div class="proposal-actions-copy">',
    `<strong>Коммерческое предложение ${escapeHtml(input.offerNumber)}</strong>`,
    '<span>Персональная ссылка открывает сохраненную HTML-версию, PDF доступен как экспорт этой же версии.</span>',
    '</div>',
    '<div class="proposal-actions">',
    '<button class="action-button secondary" type="button" data-share-proposal>Поделиться</button>',
    `<a class="action-button primary" href="${escapeHtml(proposalPdfUrlPath)}" download="${escapeHtml(input.offerNumber)}.pdf" data-proposal-pdf-link>Сохранить PDF</a>`,
    '</div>',
    '<p class="share-status" data-share-status aria-live="polite"></p>',
    '</nav>',
    '<main class="proposal-pages">',
    '<section class="pdf-page page-one" aria-label="Коммерческое предложение">',
    '<div class="inner">',
    '<header class="topline">',
    '<div class="brand">',
    '<strong>ИП Позняк</strong>',
    '<span>Проектирование инженерных систем</span>',
    '</div>',
    '<dl class="doc-meta">',
    '<div class="doc-meta-item">',
    '<dt>Коммерческое предложение</dt>',
    `<dd>${escapeHtml(input.offerNumber)}</dd>`,
    '</div>',
    '<div class="doc-meta-item">',
    '<dt>Дата</dt>',
    `<dd>${escapeHtml(issuedDate)}</dd>`,
    '</div>',
    '<div class="doc-meta-item">',
    '<dt>Действует до</dt>',
    `<dd>${escapeHtml(validUntil)}</dd>`,
    '</div>',
    '</dl>',
    '</header>',
    '<section class="hero">',
    '<div class="hero-copy">',
    '<p class="eyebrow">Проект до закупки оборудования и начала монтажа</p>',
    '<h1>Проектирование инженерных систем для вашего объекта</h1>',
    '<p>Проект заранее определит мощности, расположение оборудования, трассы коммуникаций, состав материалов и понятные задания для монтажников.</p>',
    '</div>',
    `<div class="hero-image" role="img" aria-label="Обсуждение инженерного проекта с заказчиком"${heroImageAttribute}></div>`,
    '</section>',
    '<section class="summary-strip" aria-label="Краткая сводка коммерческого предложения">',
    summaryItem('Клиент', input.clientName),
    summaryItem('Объект', input.objectName ?? 'частный дом / объект заказчика'),
    summaryItem('Площадь', `${input.calculation.areaSqm} м²`),
    '<div class="summary-item total-summary">',
    '<span>Стоимость проекта</span>',
    `<strong>${bynAmount(input.calculation.totals.totalBynRoundedRubles)}</strong>`,
    '</div>',
    '</section>',
    '<section class="scope-section">',
    '<div class="scope-head">',
    '<div>',
    '<h2>Выбранный состав проектирования</h2>',
    '<p>Стоимость рассчитана по площади объекта и выбранным разделам.</p>',
    '</div>',
    '<span>Все суммы указаны в белорусских рублях</span>',
    '</div>',
    '<div class="scope-table">',
    visibleLineItems.length > 0
      ? visibleLineItems
          .map((lineItem, index) =>
            serviceRow(lineItem, index + 1, displayBynRubles.get(lineItem.serviceId) ?? 0),
          )
          .join('')
      : emptyServiceRow(),
    hiddenLineItemCount > 0
      ? remainingServiceRow(hiddenLineItemCount, displayBynRubles.get('__remaining__') ?? 0)
      : '',
    '</div>',
    '</section>',
    '<footer class="page-footer">',
    '<span>Финальная стоимость и срок подтверждаются после проверки исходных данных объекта.</span>',
    '<span>1 / 2</span>',
    '</footer>',
    '</div>',
    '</section>',
    '<section class="pdf-page page-two" aria-label="Результат, порядок работы и условия">',
    '<div class="inner">',
    '<header class="topline compact">',
    '<div class="brand">',
    '<strong>ИП Позняк</strong>',
    '<span>Проектирование инженерных систем</span>',
    '</div>',
    '<dl class="doc-meta single">',
    '<div class="doc-meta-item">',
    '<dt>Коммерческое предложение</dt>',
    `<dd>${escapeHtml(input.offerNumber)}</dd>`,
    '</div>',
    '</dl>',
    '</header>',
    '<section class="page2-title">',
    '<div>',
    '<p class="eyebrow">Результат для заказчика</p>',
    '<h2>Документация, по которой можно принимать решения и выполнять монтаж</h2>',
    '</div>',
    '<p>Вы получаете не набор отдельных схем, а согласованный комплект по выбранным инженерным системам.</p>',
    '</section>',
    '<section class="result-band">',
    '<div>',
    '<h3>Что изменится после проектирования</h3>',
    '<p>До закупки оборудования станет понятно, какие мощности нужны, где пройдут коммуникации, что закупать и по каким решениям должна работать монтажная бригада.</p>',
    '</div>',
    '<div class="result-points">',
    resultPoint('Меньше неопределенности', 'при выборе оборудования'),
    resultPoint('Единые исходные данные', 'для поставщиков и монтажников'),
    resultPoint('Контроль бюджета', 'через спецификацию'),
    '</div>',
    '</section>',
    '<section class="deliverables" aria-label="Что входит в результат">',
    deliverablesForCalculation(input.calculation).map(deliverableCard).join(''),
    '</section>',
    '<section class="section-row">',
    '<div>',
    '<h3 class="section-title">Как проходит работа</h3>',
    '<ol class="steps">',
    workStep('01', 'Подтверждение состава', 'Фиксируем выбранные разделы и условия коммерческого предложения.'),
    workStep('02', 'Техническое задание', 'Вы заполняете подробный опросник и прикладываете исходные материалы.'),
    workStep('03', 'Расчеты и проектирование', 'Разрабатываем решения, схемы, планы и необходимые узлы.'),
    workStep('04', 'Согласование', 'Передаем комплект без спецификаций, обсуждаем решения и корректировки.'),
    workStep('05', 'Финальная передача', 'После окончательной оплаты передаем полный комплект со спецификациями.'),
    '</ol>',
    '</div>',
    '<div>',
    '<h3 class="section-title">Основные условия</h3>',
    '<div class="proposal-terms">',
    termBlock('Оплата', paymentTerms + '.'),
    termBlock('Срок действия КП', `${validityDays} календарных дней, до ${validUntil}.`),
    termBlock('Срок проектирования', 'Фиксируется после получения и проверки исходных данных по объекту.'),
    termBlock('Формат результата', 'PDF-комплект для согласования, закупки оборудования и выполнения монтажных работ.'),
    '</div>',
    '</div>',
    '</section>',
    '<section class="next-step">',
    '<div>',
    '<h3>Следующий шаг - подтвердить состав и уточнить данные</h3>',
    '<p>Подробные исходные данные помогут зафиксировать параметры дома, оборудование, материалы и пожелания по каждой выбранной системе.</p>',
    examplesSummary(projectExamples, examplesUrl),
    '</div>',
    '<div class="next-actions">',
    `<a class="document-button primary" href="${escapeHtml(nextStepUrl)}">Обсудить следующий шаг</a>`,
    examplesUrl
      ? `<a class="document-button secondary" href="${escapeHtml(examplesUrl)}">Открыть раздел с примерами</a>`
      : `<a class="document-button secondary" href="${escapeHtml(siteUrl)}">Открыть сайт проекта</a>`,
    '</div>',
    '</section>',
    '<footer class="footer-card">',
    '<div>',
    '<strong>ИП Позняк</strong>',
    '<span>Проектирование инженерных систем для частных домов и небольших коммерческих объектов.</span>',
    '</div>',
    '<div>',
    `<a href="${escapeHtml(siteUrl)}">${escapeHtml(displayUrl(siteUrl))}</a>`,
    '<span>Контакты и ссылки подставляются из публичной страницы проекта.</span>',
    '<span>PDF/HTML сохраняются как неизменяемая версия · 2 / 2</span>',
    '</div>',
    '</footer>',
    '<footer class="page-footer">',
    `<span>Итого по этому КП: ${totalRubles} белорусских рублей.</span>`,
    '<span>2 / 2</span>',
    '</footer>',
    '</div>',
    '</section>',
    '</main>',
    '</div>',
    '<script>',
    shareScript(),
    '</script>',
    '</body>',
    '</html>',
  ].join('')
}

export async function renderPdfWithPlaywright(html: string) {
  const executablePath = await resolveChromiumExecutablePath()
  return renderPdfWithChromiumExecutable(html, executablePath)
}

export async function renderPdfWithChromiumExecutable(html: string, executablePath: string) {
  return renderPdfWithChromiumCli(html, executablePath)
}

export function createProposalStorageKey(input: Pick<CommercialProposalInput, 'offerNumber' | 'publicToken' | 'issuedAt'>) {
  const year = String(input.issuedAt.getUTCFullYear())
  const month = String(input.issuedAt.getUTCMonth() + 1).padStart(2, '0')
  const safeOfferNumber = input.offerNumber.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  const tokenSuffix = input.publicToken.replace(/[^A-Za-z0-9]/g, '').slice(0, 12)

  return `proposals/${year}/${month}/${safeOfferNumber}-${tokenSuffix}.pdf`
}

export function sha256Hex(value: Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}

async function renderPdfWithChromiumCli(html: string, executablePath: string) {
  const tempDir = await mkdtemp(join(tmpdir(), 'pzk-proposal-'))
  const htmlPath = join(tempDir, 'proposal.html')
  const pdfPath = join(tempDir, 'proposal.pdf')

  try {
    await writeFile(htmlPath, html, 'utf8')
    await runChromiumPrintToPdf(executablePath, htmlPath, pdfPath)
    await waitForFile(pdfPath, 15_000)
    const pdfBytes = await readFile(pdfPath)

    if (pdfBytes.byteLength < 1_000 || !pdfBytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new Error('Chromium did not produce a valid PDF artifact')
    }

    return new Uint8Array(pdfBytes)
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
}

async function resolveChromiumExecutablePath() {
  const candidatePaths = await chromiumExecutableCandidates()

  for (const candidatePath of candidatePaths) {
    try {
      await access(candidatePath)
      return candidatePath
    } catch {
      // Try the next known Chromium location.
    }
  }

  throw new Error(
    'Could not find a Chromium executable for PDF generation. Set PDF_CHROMIUM_EXECUTABLE_PATH or install Playwright Chromium.',
  )
}

async function chromiumExecutableCandidates() {
  const candidates = [
    process.env.PDF_CHROMIUM_EXECUTABLE_PATH,
    ...(await playwrightCacheChromiumCandidates()),
    ...systemChromiumCandidates(),
  ].filter((candidate): candidate is string => Boolean(candidate))

  return [...new Set(candidates)]
}

async function playwrightCacheChromiumCandidates() {
  const roots = playwrightCacheRoots()
  const candidates: string[] = []

  for (const root of roots) {
    let entries: Array<{ isDirectory: () => boolean; name: string }>
    try {
      entries = await readdir(root, { withFileTypes: true })
    } catch {
      continue
    }

    const chromiumDirs = entries
      .filter((entry) =>
        entry.isDirectory() &&
        (entry.name.startsWith('chromium-') || entry.name.startsWith('chromium_headless_shell-')))
      .map((entry) => entry.name)
      .sort()
      .reverse()

    for (const dir of chromiumDirs) {
      const base = join(root, dir)
      if (process.platform === 'win32') {
        candidates.push(join(base, 'chrome-win64', 'chrome.exe'))
      } else if (process.platform === 'darwin') {
        candidates.push(join(base, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'))
        candidates.push(join(base, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'chrome'))
      } else {
        candidates.push(join(base, 'chrome-linux', 'chrome'))
        candidates.push(join(base, 'chrome-linux', 'headless_shell'))
        candidates.push(join(base, 'chrome-linux64', 'chrome'))
        candidates.push(join(base, 'chrome-linux64', 'headless_shell'))
      }
    }
  }

  return candidates
}

function playwrightCacheRoots() {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0'
      ? process.env.PLAYWRIGHT_BROWSERS_PATH
      : undefined,
    process.platform === 'win32' && process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'ms-playwright')
      : undefined,
    process.env.HOME ? join(process.env.HOME, '.cache', 'ms-playwright') : undefined,
    '/home/bun/.cache/ms-playwright',
    '/root/.cache/ms-playwright',
    '/ms-playwright',
  ].filter((root): root is string => Boolean(root))

  return [...new Set(roots)]
}

function systemChromiumCandidates() {
  if (process.platform === 'win32') {
    return [
      process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe') : undefined,
      process.env['PROGRAMFILES(X86)']
        ? join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe')
        : undefined,
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : undefined,
    ].filter((candidate): candidate is string => Boolean(candidate))
  }

  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ]
  }

  return [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ]
}

async function runChromiumPrintToPdf(executablePath: string, htmlPath: string, pdfPath: string) {
  const args = [
    '--headless',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--no-pdf-header-footer',
    '--run-all-compositor-stages-before-draw',
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ]
  const output = await runProcess(executablePath, args, 45_000)

  if (output.exitCode !== 0) {
    throw new Error(
      `Chromium PDF render failed with exit code ${output.exitCode}: ${output.stderr || output.stdout}`,
    )
  }
}

function runProcess(command: string, args: string[], timeoutMs: number) {
  return new Promise<{ exitCode: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new Error(`Chromium PDF render timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk))
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    })
    child.on('exit', (exitCode) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve({
        exitCode,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      })
    })
  })
}

async function waitForFile(path: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const file = await stat(path)
      if (file.size > 0) return
    } catch {
      // File may appear shortly after Chromium exits on Windows.
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(`Timed out waiting for generated PDF file: ${path}`)
}

function serviceRow(lineItem: CalculationLineItem, index: number, displayBynRubles: number) {
  const description = lineItem.serviceSnapshot.description

  return [
    '<div class="scope-row">',
    '<span class="scope-check" aria-hidden="true">&#10003;</span>',
    '<div class="scope-copy">',
    `<strong class="scope-title">${escapeHtml(lineItem.serviceSnapshot.title)}</strong>`,
    `<span class="scope-desc">${escapeHtml(description || serviceFallbackDescription(lineItem))}</span>`,
    '</div>',
    '<div class="scope-price">',
    bynAmount(displayBynRubles),
    `<small>${escapeHtml(pricingLabel(lineItem))}</small>`,
    '</div>',
    '</div>',
  ].join('')
}

function emptyServiceRow() {
  return [
    '<div class="scope-row muted">',
    '<span class="scope-check" aria-hidden="true">0</span>',
    '<div class="scope-copy">',
    '<strong class="scope-title">Разделы не выбраны</strong>',
    '<span class="scope-desc">Стоимость будет зафиксирована после выбора состава проектирования.</span>',
    '</div>',
    '<div class="scope-price">',
    bynAmount(0),
    '<small>нет выбранных разделов</small>',
    '</div>',
    '</div>',
  ].join('')
}

function remainingServiceRow(hiddenLineItemCount: number, displayBynRubles: number) {
  return [
    '<div class="scope-row muted">',
    `<span class="scope-check" aria-hidden="true">+${hiddenLineItemCount}</span>`,
    '<div class="scope-copy">',
    `<strong class="scope-title">Еще ${hiddenLineItemCount} раздел(ов) зафиксировано в расчете</strong>`,
    '<span class="scope-desc">Итог по дополнительным разделам включен в общую стоимость КП.</span>',
    '</div>',
    '<div class="scope-price">',
    bynAmount(displayBynRubles),
    '<small>остаток</small>',
    '</div>',
    '</div>',
  ].join('')
}

function summaryItem(label: string, value: string) {
  return [
    '<div class="summary-item">',
    `<span>${escapeHtml(label)}</span>`,
    `<strong>${escapeHtml(value)}</strong>`,
    '</div>',
  ].join('')
}

function resultPoint(title: string, description: string) {
  return [
    '<div class="result-point">',
    '<span class="dot" aria-hidden="true">&#10003;</span>',
    `<span><b>${escapeHtml(title)}</b> ${escapeHtml(description)}</span>`,
    '</div>',
  ].join('')
}

function deliverableCard(deliverable: ReturnType<typeof deliverablesForCalculation>[number]) {
  return [
    '<article class="deliverable">',
    `<span class="icon" aria-hidden="true">${iconSvg(deliverable.icon)}</span>`,
    '<div>',
    `<strong>${escapeHtml(deliverable.title)}</strong>`,
    `<p>${escapeHtml(deliverable.description)}</p>`,
    '</div>',
    '</article>',
  ].join('')
}

function deliverablesForCalculation(calculation: CalculationResult) {
  const selectedText = calculation.lineItems
    .map((lineItem) => `${lineItem.serviceSnapshot.title} ${lineItem.serviceSnapshot.description ?? ''}`)
    .join(' ')
    .toLowerCase()
  const hasThreeDimensionalWork = /(?:3d|3д|визуал|узел|узл)/i.test(selectedText)
  const deliverables = [
    {
      icon: 'document',
      title: 'Расчетная база',
      description: 'Теплотехнические и инженерные расчеты для выбора мощностей и оборудования.',
    },
    {
      icon: 'plan',
      title: 'Планы и схемы',
      description: 'Трассы, оборудование, подключения, узлы и привязки для согласования и монтажа.',
    },
    {
      icon: 'clipboard',
      title: 'Спецификация',
      description: 'Перечень оборудования и материалов с количеством для закупки и контроля бюджета.',
    },
  ]

  if (hasThreeDimensionalWork) {
    deliverables.push({
      icon: 'chart',
      title: '3D и монтажные узлы',
      description: 'Наглядная компоновка сложных участков и пояснения для реализации проекта.',
    })
  } else {
    deliverables.push({
      icon: 'chart',
      title: 'Согласованный комплект',
      description: 'Единая версия решений для проверки, корректировок и передачи монтажной бригаде.',
    })
  }

  return deliverables
}

function workStep(index: string, title: string, description: string) {
  return [
    '<li class="step">',
    `<span class="step-num">${escapeHtml(index)}</span>`,
    '<span>',
    `<strong>${escapeHtml(title)}</strong>`,
    `<em>${escapeHtml(description)}</em>`,
    '</span>',
    '</li>',
  ].join('')
}

function termBlock(title: string, description: string) {
  return [
    '<div class="term">',
    `<strong>${escapeHtml(title)}</strong>`,
    `<span>${escapeHtml(description)}</span>`,
    '</div>',
  ].join('')
}

function examplesSummary(
  projectExamples: ReturnType<typeof proposalProjectExamples>,
  examplesUrl: string | null,
) {
  if (projectExamples.length === 0 || !examplesUrl) return ''
  const labels = projectExamples
    .map((example) => `${example.code} - ${example.title}`)
    .join('; ')

  return `<p class="examples-note">Примеры: ${escapeHtml(labels)} доступны в разделе сайта с проектной документацией.</p>`
}

function proposalProjectExamples(input: CommercialProposalInput) {
  const customExamples = input.projectExamples?.filter((example) => example.title.trim() && example.fileUrl.trim()) ?? []

  if (customExamples.length > 0) {
    return customExamples.slice(0, 2).map((example, index) => ({
      code: example.code?.trim() || `П${index + 1}`,
      title: example.title.trim(),
      description: example.description?.trim() || 'Пример проекта для проверки состава и оформления.',
    }))
  }

  return publicProjectExampleAssets.slice(0, 2).map((example) => ({
    code: example.code,
    title: example.title,
    description: `${example.description} ${example.pageCount} листов.`,
  }))
}

function serviceFallbackDescription(lineItem: CalculationLineItem) {
  if (lineItem.pricingType === 'per_sqm') {
    return 'Раздел рассчитывается по площади объекта и фиксируется в составе КП.'
  }

  return 'Фиксированный раздел проектной документации для выбранного состава работ.'
}

function pricingLabel(lineItem: CalculationLineItem) {
  return lineItem.pricingType === 'per_sqm'
    ? 'по площади объекта'
    : 'фиксированная стоимость'
}

function bynAmount(value: number) {
  return [
    `<span class="money" data-byn-rubles="${value}">`,
    escapeHtml(formatInteger(value)),
    ' <span class="byn" aria-label="белорусских рублей">Б</span>',
    '</span>',
  ].join('')
}

function iconSvg(icon: string) {
  const common = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'

  if (icon === 'plan') {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" ${common}/><path d="M9 5v14M15 5v14M5 9h14M5 15h14" ${common}/></svg>`
  }

  if (icon === 'clipboard') {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l1 3H8l1-3Z" ${common}/><path d="M7 6H5v15h14V6h-2" ${common}/><path d="M8 12h8M8 16h6" ${common}/></svg>`
  }

  if (icon === 'chart') {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V5M5 19h14" ${common}/><path d="M9 16v-5M13 16V8M17 16v-7" ${common}/></svg>`
  }

  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l3 3v15H7V3Z" ${common}/><path d="M14 3v4h4M9 12h6M9 16h6" ${common}/></svg>`
}

function allocateDisplayBynRubles(
  calculation: CalculationResult,
  visibleLineItems = calculation.lineItems,
) {
  const visibleIds = new Set(visibleLineItems.map((lineItem) => lineItem.serviceId))
  const hiddenLineItems = calculation.lineItems.filter((lineItem) => !visibleIds.has(lineItem.serviceId))
  const lineValues = visibleLineItems.map((lineItem, index) => {
    const exactRubles = lineItem.totalBynCents / 100

    return {
      serviceId: lineItem.serviceId,
      floorRubles: Math.floor(exactRubles),
      remainder: exactRubles - Math.floor(exactRubles),
      index,
    }
  })
  const hiddenRoundedRubles = hiddenLineItems.reduce(
    (total, lineItem) => total + lineItem.totalBynRoundedRubles,
    0,
  )
  const targetVisibleTotal = Math.max(
    0,
    calculation.totals.totalBynRoundedRubles - hiddenRoundedRubles,
  )
  const floorTotal = lineValues.reduce((total, line) => total + line.floorRubles, 0)
  const allocation = new Map<string, number>()
  const rublesToDistribute = Math.max(0, targetVisibleTotal - floorTotal)
  const sortedByRemainder = [...lineValues].sort((first, second) => {
    const remainderDifference = second.remainder - first.remainder
    return remainderDifference === 0 ? first.index - second.index : remainderDifference
  })
  const incrementedServiceIds = new Set(
    sortedByRemainder.slice(0, rublesToDistribute).map((line) => line.serviceId),
  )

  for (const line of lineValues) {
    allocation.set(line.serviceId, line.floorRubles + (incrementedServiceIds.has(line.serviceId) ? 1 : 0))
  }

  if (hiddenLineItems.length > 0) {
    const visibleTotal = [...allocation.values()].reduce((total, value) => total + value, 0)
    allocation.set('__remaining__', calculation.totals.totalBynRoundedRubles - visibleTotal)
  }

  return allocation
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Minsk',
  }).format(date)
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(value)
}

function withHash(rawUrl: string | null | undefined, hash: string) {
  if (!rawUrl) return null

  try {
    const url = new URL(rawUrl)
    url.hash = hash
    url.search = ''
    return url.toString()
  } catch {
    return null
  }
}

function siteOriginUrl(rawUrl: string | null | undefined) {
  if (!rawUrl) return null

  try {
    const url = new URL(rawUrl)
    return `${url.origin}/`
  } catch {
    return null
  }
}

function displayUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    return url.host
  } catch {
    return rawUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }
}

function proposalHeroImageDataUri() {
  proposalHeroImageDataUriPromise ??= readFile(proposalHeroImageUrl)
    .then((bytes) => `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`)
    .catch(() => null)

  return proposalHeroImageDataUriPromise
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function shareScript() {
  return `
    (() => {
      const button = document.querySelector('[data-share-proposal]');
      const status = document.querySelector('[data-share-status]');
      const title = document.title || 'Коммерческое предложение ИП Позняк';

      if (!button) return;

      const showStatus = (message) => {
        if (!status) return;
        status.textContent = message;
        window.clearTimeout(showStatus.timeoutId);
        showStatus.timeoutId = window.setTimeout(() => {
          status.textContent = '';
        }, 3600);
      };

      const fallbackCopy = async () => {
        const url = window.location.href;

        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(url);
          return true;
        }

        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);

        if (!copied) throw new Error('copy_failed');
        return true;
      };

      button.addEventListener('click', async () => {
        try {
          if (navigator.share) {
            await navigator.share({
              title,
              text: 'Коммерческое предложение ИП Позняк',
              url: window.location.href,
            });
            showStatus('Ссылка готова к отправке.');
            return;
          }

          await fallbackCopy();
          showStatus('Ссылка скопирована.');
        } catch (error) {
          if (error && error.name === 'AbortError') return;

          try {
            await fallbackCopy();
            showStatus('Ссылка скопирована.');
          } catch {
            showStatus('Не удалось скопировать автоматически. Скопируйте адрес из строки браузера.');
          }
        }
      });
    })();
  `.trim()
}

function proposalCss() {
  return `
    @page { size: A4; margin: 0; }
    :root {
      color-scheme: light;
      --navy: #081a2f;
      --navy-2: #0d2b4c;
      --blue: #0b5fb5;
      --blue-soft: #edf5fc;
      --ink: #102033;
      --body: #4d5b6a;
      --muted: #788695;
      --line: #dbe3eb;
      --paper: #ffffff;
      --surface: #f6f8fb;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: #e9edf2; }
    body {
      color: var(--ink);
      font-family: "Segoe UI", Arial, "Liberation Sans", "DejaVu Sans", sans-serif;
      font-size: 10.2pt;
      line-height: 1.38;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1, h2, h3, p { margin: 0; }
    h1, h2, h3 { letter-spacing: 0; }
    a { color: inherit; }
    .proposal-shell {
      min-height: 100vh;
      padding: 22px;
    }
    .proposal-actions-shell {
      width: min(100%, 210mm);
      margin: 0 auto 18px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px 18px;
      align-items: center;
      padding: 12px;
      border: 1px solid #cbd8e5;
      border-radius: 8px;
      background: rgba(255,255,255,.96);
      box-shadow: 0 10px 30px rgba(8,26,47,.08);
    }
    .proposal-actions-copy {
      display: grid;
      gap: 3px;
      min-width: 0;
    }
    .proposal-actions-copy strong {
      color: var(--navy);
      font-size: 14px;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .proposal-actions-copy span,
    .share-status {
      color: var(--body);
      font-size: 12px;
      line-height: 1.35;
    }
    .proposal-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    .action-button {
      min-height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 14px;
      border-radius: 7px;
      border: 1px solid #b9cadb;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
    }
    .action-button.primary {
      border-color: var(--blue);
      background: var(--blue);
      color: #fff;
    }
    .action-button.secondary {
      background: #fff;
      color: var(--navy);
    }
    .share-status {
      grid-column: 1 / -1;
      min-height: 16px;
    }
    .proposal-pages {
      width: 210mm;
      margin: 0 auto;
    }
    .pdf-page {
      position: relative;
      display: flex;
      flex-direction: column;
      width: 210mm;
      height: 297mm;
      page-break-after: always;
      break-after: page;
      background: var(--paper);
      overflow: hidden;
    }
    .pdf-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .inner {
      height: 100%;
      display: flex;
      flex-direction: column;
      padding: 12mm 16mm 9mm;
    }
    .topline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10mm;
      padding-bottom: 5mm;
      border-bottom: .35mm solid var(--line);
    }
    .topline.compact { padding-bottom: 5mm; }
    .brand strong {
      display: block;
      color: var(--navy);
      font-size: 11.5pt;
      line-height: 1.1;
    }
    .brand span {
      display: block;
      margin-top: 1mm;
      color: var(--muted);
      font-size: 7.1pt;
    }
    dl { margin: 0; }
    dt { margin: 0; }
    dd { margin: 0; }
    .doc-meta {
      display: flex;
      gap: 6mm;
      text-align: right;
    }
    .doc-meta.single { max-width: 75mm; }
    .doc-meta-item dt {
      color: var(--muted);
      font-size: 6.8pt;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .doc-meta-item dd {
      margin-top: 1mm;
      color: var(--navy);
      font-size: 8.6pt;
      font-weight: 800;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .hero {
      display: grid;
      grid-template-columns: 1.18fr .82fr;
      gap: 8mm;
      align-items: stretch;
      margin-top: 4mm;
    }
    .hero-copy { padding: 3.5mm 0 2mm; }
    .eyebrow {
      color: var(--blue);
      font-size: 7.4pt;
      font-weight: 800;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    h1 {
      max-width: 112mm;
      margin-top: 2.5mm;
      color: var(--navy);
      font-size: 23pt;
      line-height: 1.03;
    }
    .hero-copy p:not(.eyebrow) {
      margin-top: 3mm;
      max-width: 105mm;
      color: var(--body);
      font-size: 8.8pt;
      line-height: 1.42;
    }
    .hero-image {
      min-height: 47mm;
      border-radius: 8px;
      background:
        linear-gradient(135deg, rgba(11,95,181,.18), rgba(8,26,47,.04)),
        repeating-linear-gradient(0deg, rgba(11,95,181,.12) 0 1px, transparent 1px 12px),
        repeating-linear-gradient(90deg, rgba(11,95,181,.10) 0 1px, transparent 1px 12px),
        #f5f8fb;
      background-size: cover;
      background-position: 53% center;
      position: relative;
      overflow: hidden;
    }
    .hero-image::after {
      content: "";
      position: absolute;
      inset: 0;
      border: .35mm solid rgba(8,26,47,.08);
      border-radius: inherit;
    }
    .summary-strip {
      display: grid;
      grid-template-columns: 1.1fr 1.55fr .65fr 1fr;
      margin-top: 4mm;
      border: .35mm solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }
    .summary-item {
      min-height: 19.5mm;
      padding: 3.4mm 4mm;
      border-left: .35mm solid var(--line);
      background: #fff;
    }
    .summary-item:first-child { border-left: 0; }
    .summary-item > span {
      display: block;
      color: var(--muted);
      font-size: 6.4pt;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .summary-item strong {
      display: block;
      margin-top: 1.4mm;
      color: var(--ink);
      font-size: 9.1pt;
      line-height: 1.18;
      overflow-wrap: anywhere;
    }
    .summary-item.total-summary {
      background: var(--navy);
      color: #fff;
    }
    .summary-item.total-summary span { color: rgba(255,255,255,.66); }
    .summary-item.total-summary strong {
      color: #fff;
      font-size: 15.5pt;
      white-space: nowrap;
    }
    .byn {
      position: relative;
      display: inline-block;
      width: .72em;
      margin-left: .05em;
      font-weight: 800;
      line-height: 1;
    }
    .byn::after {
      content: "";
      position: absolute;
      left: .13em;
      right: .02em;
      top: .49em;
      height: .065em;
      background: currentColor;
      border-radius: 999px;
    }
    .scope-section { margin-top: 4mm; }
    .scope-head {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 6mm;
      padding-bottom: 3mm;
    }
    .scope-head h2 {
      color: var(--navy);
      font-size: 14.4pt;
      line-height: 1.15;
    }
    .scope-head p,
    .scope-head span {
      color: var(--muted);
      font-size: 7.4pt;
      line-height: 1.35;
    }
    .scope-table { border-top: .55mm solid var(--navy); }
    .scope-row {
      display: grid;
      grid-template-columns: 8mm minmax(0, 1fr) 30mm;
      gap: 3mm;
      align-items: center;
      min-height: 15.2mm;
      padding: 2mm 0;
      border-bottom: .32mm solid var(--line);
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .scope-check {
      width: 5.1mm;
      height: 5.1mm;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: var(--blue-soft);
      color: var(--blue);
      font-size: 7pt;
      font-weight: 900;
    }
    .scope-title {
      display: block;
      color: var(--ink);
      font-size: 8.7pt;
      font-weight: 800;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .scope-desc {
      display: block;
      margin-top: .7mm;
      color: var(--body);
      font-size: 6.75pt;
      line-height: 1.28;
    }
    .scope-price {
      justify-self: end;
      text-align: right;
      color: var(--navy);
      font-size: 9.4pt;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .scope-price small {
      display: block;
      margin-top: 1mm;
      color: var(--muted);
      font-size: 6.5pt;
      font-weight: 600;
    }
    .scope-row.muted .scope-title,
    .scope-row.muted .scope-price { color: var(--muted); }
    .page2-title {
      display: grid;
      grid-template-columns: 1.25fr .75fr;
      gap: 7mm;
      align-items: start;
      margin-top: 5mm;
      margin-bottom: 4mm;
    }
    .page2-title h2 {
      color: var(--navy);
      font-size: 18.8pt;
      line-height: 1.04;
    }
    .page2-title p:not(.eyebrow) {
      padding-top: 5mm;
      color: var(--body);
      font-size: 7.8pt;
      line-height: 1.42;
    }
    .result-band {
      margin-top: 4mm;
      display: grid;
      grid-template-columns: 1.2fr .8fr;
      gap: 7mm;
      padding: 4mm;
      border-radius: 8px;
      background: var(--navy);
      color: #fff;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .result-band h3 {
      color: #fff;
      font-size: 12.5pt;
      line-height: 1.18;
    }
    .result-band p {
      margin-top: 1.4mm;
      color: rgba(255,255,255,.72);
      font-size: 6.65pt;
      line-height: 1.35;
    }
    .result-points {
      display: grid;
      gap: 1.25mm;
      align-content: center;
    }
    .result-point {
      display: flex;
      gap: 2mm;
      align-items: flex-start;
      color: rgba(255,255,255,.82);
      font-size: 6.35pt;
      line-height: 1.25;
    }
    .result-point b { color: #fff; }
    .dot {
      width: 4mm;
      height: 4mm;
      flex: 0 0 4mm;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: #fff;
      color: var(--blue);
      font-size: 6pt;
      font-weight: 900;
    }
    .deliverables {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3mm;
      margin-top: 4mm;
    }
    .deliverable {
      min-height: 23mm;
      display: grid;
      grid-template-columns: 11mm 1fr;
      gap: 4mm;
      align-items: start;
      padding: 3.2mm;
      border: .35mm solid var(--line);
      border-radius: 8px;
      background: #fff;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .icon {
      width: 9mm;
      height: 9mm;
      display: flex;
      align-items: center;
      justify-content: center;
      border: .35mm solid #bcd1e6;
      border-radius: 7px;
      color: var(--blue);
      background: #fff;
    }
    .icon svg { width: 5.5mm; height: 5.5mm; }
    .deliverable strong {
      color: var(--ink);
      font-size: 8.3pt;
      line-height: 1.2;
    }
    .deliverable p {
      margin-top: 1mm;
      color: var(--body);
      font-size: 6.5pt;
      line-height: 1.33;
    }
    .section-row {
      display: grid;
      grid-template-columns: 1.15fr .85fr;
      gap: 6mm;
      margin-top: 4.5mm;
    }
    .section-title {
      margin-bottom: 2mm;
      color: var(--navy);
      font-size: 11.8pt;
      line-height: 1.18;
    }
    .steps {
      margin: 0;
      padding: 0;
      list-style: none;
      border-top: .5mm solid var(--navy);
    }
    .step {
      display: grid;
      grid-template-columns: 7mm 1fr;
      gap: 2mm;
      padding: 1.8mm 0;
      border-bottom: .32mm solid var(--line);
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .step-num {
      color: var(--blue);
      font-size: 8pt;
      font-weight: 800;
    }
    .step strong {
      display: block;
      color: var(--ink);
      font-size: 7.8pt;
      line-height: 1.2;
    }
    .step em {
      display: block;
      margin-top: .5mm;
      color: var(--body);
      font-size: 6.25pt;
      font-style: normal;
      line-height: 1.3;
    }
    .proposal-terms {
      display: grid;
      gap: 2mm;
    }
    .term {
      padding: 2.2mm 3mm;
      border-left: 1mm solid #bcd1e6;
      background: var(--surface);
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .term strong {
      display: block;
      color: var(--ink);
      font-size: 7.6pt;
      line-height: 1.2;
    }
    .term span {
      display: block;
      margin-top: .6mm;
      color: var(--body);
      font-size: 6.2pt;
      line-height: 1.32;
    }
    .next-step {
      display: grid;
      grid-template-columns: 1.1fr .9fr;
      gap: 7mm;
      align-items: center;
      margin-top: auto;
      padding: 4mm;
      border: .35mm solid #c9dcec;
      border-radius: 8px;
      background: var(--blue-soft);
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .next-step h3 {
      color: var(--navy);
      font-size: 11.8pt;
      line-height: 1.2;
    }
    .next-step p {
      margin-top: 1.2mm;
      color: var(--body);
      font-size: 6.6pt;
      line-height: 1.35;
    }
    .examples-note { font-weight: 600; }
    .next-actions {
      display: grid;
      gap: 2.5mm;
    }
    .document-button {
      display: block;
      padding: 2.6mm 3mm;
      border-radius: 7px;
      text-align: center;
      text-decoration: none;
      font-size: 7pt;
      font-weight: 800;
      line-height: 1.2;
    }
    .document-button.primary {
      background: var(--blue);
      color: #fff;
    }
    .document-button.secondary {
      border: .35mm solid #b9cadb;
      background: #fff;
      color: var(--navy);
    }
    .footer-card {
      display: grid;
      grid-template-columns: 1.1fr .9fr;
      gap: 7mm;
      margin-top: 4mm;
      padding: 5mm;
      border-radius: 8px;
      background: var(--navy);
      color: #fff;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .footer-card strong,
    .footer-card a {
      display: block;
      color: #fff;
      font-size: 8.6pt;
      font-weight: 800;
      text-decoration: none;
    }
    .footer-card span {
      display: block;
      margin-top: 1.2mm;
      color: rgba(255,255,255,.68);
      font-size: 6.35pt;
      line-height: 1.35;
    }
    .page-footer {
      display: flex;
      justify-content: space-between;
      gap: 8mm;
      margin-top: 4mm;
      padding-top: 2.5mm;
      border-top: .35mm solid var(--line);
      color: var(--muted);
      font-size: 6.6pt;
      line-height: 1.35;
    }
    @media screen {
      .pdf-page {
        margin: 0 auto 18px;
        box-shadow: 0 16px 60px rgba(8,26,47,.12);
      }
    }
    @media print {
      html, body { background: #fff; }
      .proposal-shell { min-height: 0; padding: 0; }
      .proposal-actions-shell { display: none !important; }
      .proposal-pages { width: 210mm; margin: 0; }
      .pdf-page {
        width: 210mm;
        height: 297mm;
        margin: 0;
        box-shadow: none;
      }
    }
    @media screen and (max-width: 860px) {
      .proposal-shell { padding: 0; }
      .proposal-actions-shell {
        width: 100%;
        margin: 0;
        border-radius: 0;
        border-left: 0;
        border-right: 0;
        box-shadow: none;
      }
      .proposal-pages { width: 100%; }
      .pdf-page {
        width: 100%;
        height: auto;
        min-height: auto;
        margin: 0;
        box-shadow: none;
      }
      .inner { padding: clamp(22px, 6vw, 42px); }
      .topline,
      .hero,
      .summary-strip,
      .page2-title,
      .result-band,
      .deliverables,
      .section-row,
      .next-step,
      .footer-card {
        grid-template-columns: 1fr;
      }
      .topline {
        display: grid;
        gap: 14px;
      }
      .doc-meta {
        width: 100%;
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
        text-align: left;
      }
      .hero-image { min-height: 190px; }
      .summary-item {
        min-height: auto;
        border-left: 0;
        border-top: 1px solid var(--line);
      }
      .summary-item:first-child { border-top: 0; }
      .scope-head {
        display: grid;
        align-items: start;
      }
      .scope-row {
        grid-template-columns: 30px minmax(0, 1fr);
        gap: 12px;
        padding: 14px 0;
      }
      .scope-price {
        grid-column: 2;
        justify-self: start;
        text-align: left;
      }
      .result-band,
      .next-step,
      .footer-card {
        gap: 18px;
      }
      .proposal-actions-shell {
        grid-template-columns: 1fr;
      }
      .proposal-actions {
        justify-content: stretch;
      }
      .action-button {
        flex: 1 1 150px;
      }
      h1 { font-size: 30px; }
      .page2-title h2 { font-size: 28px; }
    }
    @media screen and (max-width: 420px) {
      .inner { padding: 20px; }
      .scope-row {
        grid-template-columns: 26px minmax(0, 1fr);
      }
      .scope-check {
        width: 24px;
        height: 24px;
      }
    }
  `
}
