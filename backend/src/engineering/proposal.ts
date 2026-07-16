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

export const commercialProposalTemplateVersion = 'commercial-proposal-v1'

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

const maxVisibleServiceRows = 8
const paymentTerms = '70% старт / 30% после передачи проектного PDF-комплекта'
const validityDays = 14

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
  const htmlSnapshot = renderCommercialProposalHtmlSnapshot(input)
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

export function renderCommercialProposalHtmlSnapshot(input: CommercialProposalInput) {
  const issuedDate = formatDate(input.issuedAt)
  const validUntil = formatDate(addDays(input.issuedAt, validityDays))
  const visibleLineItems = input.calculation.lineItems.slice(0, maxVisibleServiceRows)
  const hiddenLineItemCount = Math.max(0, input.calculation.lineItems.length - visibleLineItems.length)
  const displayBynRubles = allocateDisplayBynRubles(input.calculation, visibleLineItems)
  const examplesUrl = withHash(input.sourcePageUrl, 'examples')
  const contactsUrl = withHash(input.sourcePageUrl, 'contacts')
  const projectExamples = proposalProjectExamples(input)
  const totalRubles = formatInteger(input.calculation.totals.totalBynRoundedRubles)
  const totalUsd = formatUsd(input.calculation.totals.totalUsdCents)

  return [
    '<!doctype html>',
    '<html lang="ru">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(input.offerNumber)} | Коммерческое предложение</title>`,
    '<style>',
    proposalCss(),
    '</style>',
    '</head>',
    '<body>',
    '<main class="proposal-document">',
    '<section class="pdf-page page-one" aria-label="Расчет коммерческого предложения">',
    '<header class="offer-header">',
    '<div>',
    '<p class="kicker">ИП Позняк · инженерное проектирование</p>',
    '<h1>Коммерческое предложение</h1>',
    '</div>',
    '<dl class="offer-meta">',
    metaRow('Номер', input.offerNumber),
    metaRow('Дата', issuedDate),
    metaRow('Действует до', validUntil),
    '</dl>',
    '</header>',
    '<section class="client-grid">',
    infoBlock('Клиент', input.clientName),
    infoBlock('Объект', input.objectName ?? 'частный дом / объект заказчика'),
    infoBlock('Площадь', `${input.calculation.areaSqm} м²`),
    infoBlock('Курс расчета', `${input.calculation.exchangeRate.usdToBynRate} BYN за 1 USD`),
    '</section>',
    '<section class="commercial-grid">',
    '<div class="services-block">',
    '<div class="block-title"><span>Выбранный состав</span><strong>Разделы проекта</strong></div>',
    '<div class="service-table">',
    visibleLineItems.length > 0
      ? visibleLineItems
          .map((lineItem, index) =>
            serviceRow(lineItem, index + 1, displayBynRubles.get(lineItem.serviceId) ?? 0),
          )
          .join('')
      : '<div class="service-row muted"><span>00</span><strong>Разделы не выбраны</strong><em>0 BYN</em></div>',
    hiddenLineItemCount > 0
      ? `<div class="service-row muted"><span>+${hiddenLineItemCount}</span><strong>Еще ${hiddenLineItemCount} раздел(ов) зафиксировано в расчете</strong><em>${formatInteger(displayBynRubles.get('__remaining__') ?? 0)} BYN<small>остаток</small></em></div>`
      : '',
    '</div>',
    '</div>',
    '<aside class="total-block">',
    '<span>Итого к проектированию</span>',
    `<strong>${totalRubles} BYN</strong>`,
    `<em>~${totalUsd} USD справочно</em>`,
    '<div class="terms">',
    '<p><b>Оплата:</b> ' + escapeHtml(paymentTerms) + '.</p>',
    '<p><b>Срок действия КП:</b> ' + validityDays + ' календарных дней, до уточнения исходных данных.</p>',
    '</div>',
    '</aside>',
    '</section>',
    '<footer class="page-footer">',
    '<span>Расчет фиксирует выбранные разделы, площадь, курс и тарифы на дату выпуска КП.</span>',
    '<span>1 / 2</span>',
    '</footer>',
    '</section>',
    '<section class="pdf-page page-two" aria-label="Состав работ и контакты">',
    '<header class="compact-header">',
    '<p class="kicker">Что получает заказчик</p>',
    `<strong>${escapeHtml(input.offerNumber)}</strong>`,
    '</header>',
    '<section class="two-column">',
    '<div>',
    '<h2>Что входит в проектирование</h2>',
    '<ul class="included-list">',
    '<li><b>Опросный лист и исходные данные</b><span>площадь, оборудование, материалы, пожелания по системам.</span></li>',
    '<li><b>Расчетная база</b><span>теплотехнические данные и инженерные решения для подбора оборудования.</span></li>',
    '<li><b>Схемы и планы</b><span>листы для согласования и передачи монтажникам.</span></li>',
    '<li><b>Спецификация</b><span>состав оборудования и материалов для закупки и контроля бюджета.</span></li>',
    '</ul>',
    '</div>',
    '<div>',
    '<h2>Этапы работы</h2>',
    '<ol class="process-list">',
    '<li><span>01</span><b>Фиксация КП</b><em>состав, площадь, условия оплаты.</em></li>',
    '<li><span>02</span><b>Исходные данные</b><em>опросник и уточнения по объекту.</em></li>',
    '<li><span>03</span><b>Проектирование</b><em>расчеты, схемы, спецификация.</em></li>',
    '<li><span>04</span><b>Передача PDF</b><em>готовый комплект для согласования и монтажа.</em></li>',
    '</ol>',
    '</div>',
    '</section>',
    '<section class="proof-grid">',
    projectExamples.map((example) => proofCard(example, examplesUrl)).join(''),
    '</section>',
    '<section class="contact-block">',
    '<div>',
    '<p class="kicker">Контакты</p>',
    '<h2>ИП Позняк</h2>',
    '<p>Инженерное проектирование отопления, вентиляции, водоснабжения и канализации для частных домов и небольших коммерческих объектов.</p>',
    '</div>',
    '<dl>',
    metaRow('Телефон / мессенджер', 'контактные данные уточняются перед публичным запуском'),
    metaRow('Страница контактов', contactsUrl ?? 'раздел контактов на публичной странице'),
    metaRow('Телефон заявки', input.clientPhone),
    metaRow('Формат выдачи', 'PDF-комплект для согласования и монтажа'),
    '</dl>',
    '</section>',
    '<footer class="page-footer">',
    '<span>PDF и HTML-версия КП являются immutable artifact для этой заявки.</span>',
    '<span>2 / 2</span>',
    '</footer>',
    '</section>',
    '</main>',
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
  const price = `${formatInteger(displayBynRubles)} BYN`
  const usd = `~${formatUsd(lineItem.totalUsdCents)} USD`

  return [
    '<div class="service-row">',
    `<span>${String(index).padStart(2, '0')}</span>`,
    '<strong>',
    escapeHtml(lineItem.serviceSnapshot.title),
    description ? `<small>${escapeHtml(description)}</small>` : '',
    '</strong>',
    `<em>${price}<small>${usd}</small></em>`,
    '</div>',
  ].join('')
}

function proofCard(
  example: ReturnType<typeof proposalProjectExamples>[number],
  examplesUrl: string | null,
) {
  const fallbackLink = examplesUrl
    ? `<a href="${escapeHtml(examplesUrl)}">Открыть раздел с примерами</a>`
    : '<p>Ссылка на PDF-пример будет добавлена после настройки публичного URL.</p>'

  return [
    '<div class="proof-card">',
    `<span class="proof-code">${escapeHtml(example.code)}</span>`,
    `<h3>${escapeHtml(example.title)}</h3>`,
    `<p>${escapeHtml(example.description)}</p>`,
    example.href
      ? `<a href="${escapeHtml(example.href)}" aria-label="${escapeHtml(`Открыть PDF-пример: ${example.title}`)}">Открыть PDF-пример</a>`
      : fallbackLink,
    '</div>',
  ].join('')
}

function proposalProjectExamples(input: CommercialProposalInput) {
  const customExamples = input.projectExamples?.filter((example) => example.title.trim() && example.fileUrl.trim()) ?? []
  const baseUrl = input.sourcePageUrl ?? undefined

  if (customExamples.length > 0) {
    return customExamples.slice(0, 2).map((example, index) => ({
      code: example.code?.trim() || `П${index + 1}`,
      title: example.title.trim(),
      description: example.description?.trim() || 'PDF-пример проекта для проверки состава и оформления.',
      href: resolvePublicUrl(example.fileUrl, baseUrl),
    }))
  }

  return publicProjectExampleAssets.slice(0, 2).map((example) => ({
    code: example.code,
    title: example.title,
    description: `${example.description} ${example.pageCount} листов, PDF ${formatMegabytes(example.fileSizeBytes)}.`,
    href: resolvePublicUrl(example.filePath, baseUrl),
  }))
}

function resolvePublicUrl(rawUrl: string, baseUrl: string | undefined) {
  try {
    const url = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return url.toString()
  } catch {
    return null
  }
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

function infoBlock(label: string, value: string) {
  return [
    '<div class="info-block">',
    `<span>${escapeHtml(label)}</span>`,
    `<strong>${escapeHtml(value)}</strong>`,
    '</div>',
  ].join('')
}

function metaRow(label: string, value: string) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
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

function formatUsd(usdCents: number) {
  return formatInteger(Math.round(usdCents / 100))
}

function formatMegabytes(bytes: number) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 1,
  }).format(bytes / 1024 / 1024) + ' МБ'
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function proposalCss() {
  return `
    @page { size: A4; margin: 0; }
    :root {
      color-scheme: light;
      --ink: #16202a;
      --muted: #5b6670;
      --blue: #0b2239;
      --steel: #2f5f7f;
      --paper: #f9f7f4;
      --line: #ded7cc;
      --accent: #ff6b35;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: #e8e4de; }
    body {
      color: var(--ink);
      font-family: Arial, "Liberation Sans", "DejaVu Sans", sans-serif;
      font-size: 14px;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .proposal-document { width: 210mm; margin: 0 auto; background: white; }
    .pdf-page {
      position: relative;
      display: flex;
      flex-direction: column;
      min-height: 297mm;
      padding: 15mm 16mm 12mm;
      page-break-after: always;
      background: linear-gradient(90deg, var(--paper) 0 18mm, #ffffff 18mm 100%);
      overflow: hidden;
    }
    .pdf-page:last-child { page-break-after: auto; }
    .offer-header, .compact-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 18px;
      padding-bottom: 12mm;
      border-bottom: 1px solid var(--line);
    }
    .kicker {
      margin: 0 0 6px;
      color: var(--steel);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    h1, h2, h3, p { margin: 0; }
    h1 {
      max-width: 118mm;
      color: var(--blue);
      font-size: 31px;
      line-height: 1.06;
    }
    h2 {
      margin-bottom: 6mm;
      color: var(--blue);
      font-size: 18px;
      line-height: 1.15;
    }
    h3 { color: var(--blue); font-size: 13px; line-height: 1.2; }
    dl { margin: 0; }
    .offer-meta {
      min-width: 52mm;
      padding: 5mm;
      background: var(--blue);
      color: white;
    }
    .offer-meta div, .contact-block dl div {
      display: grid;
      gap: 1mm;
      margin-bottom: 3mm;
    }
    .offer-meta div:last-child, .contact-block dl div:last-child { margin-bottom: 0; }
    dt { color: rgba(255,255,255,.68); font-size: 10px; text-transform: uppercase; }
    dd { margin: 0; font-weight: 700; overflow-wrap: anywhere; }
    .client-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 4mm;
      margin: 8mm 0;
    }
    .info-block {
      min-height: 22mm;
      padding: 4mm;
      border: 1px solid var(--line);
      background: white;
    }
    .info-block span {
      display: block;
      margin-bottom: 3mm;
      color: var(--muted);
      font-size: 10px;
      text-transform: uppercase;
    }
    .info-block strong {
      display: block;
      color: var(--blue);
      font-size: 14px;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .commercial-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 58mm;
      gap: 6mm;
      align-items: stretch;
      flex: 1;
    }
    .services-block, .total-block {
      border: 1px solid var(--line);
      background: white;
    }
    .block-title {
      display: flex;
      justify-content: space-between;
      gap: 4mm;
      padding: 4mm;
      border-bottom: 1px solid var(--line);
      color: var(--muted);
      font-size: 11px;
    }
    .block-title strong { color: var(--blue); }
    .service-table { display: grid; }
    .service-row {
      display: grid;
      grid-template-columns: 10mm minmax(0, 1fr) 30mm;
      gap: 3mm;
      align-items: start;
      min-height: 13mm;
      padding: 3mm 4mm;
      border-bottom: 1px solid #ece6dc;
    }
    .service-row:last-child { border-bottom: 0; }
    .service-row > span {
      color: var(--accent);
      font-size: 11px;
      font-weight: 700;
    }
    .service-row strong {
      display: grid;
      gap: 1.2mm;
      color: var(--ink);
      font-size: 12px;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .service-row small {
      color: var(--muted);
      font-size: 10px;
      font-weight: 400;
      line-height: 1.2;
    }
    .service-row em {
      display: grid;
      gap: 1mm;
      color: var(--blue);
      font-size: 12px;
      font-style: normal;
      font-weight: 700;
      text-align: right;
      white-space: nowrap;
    }
    .service-row em small { font-size: 9px; }
    .service-row.muted strong, .service-row.muted em { color: var(--muted); }
    .total-block {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 6mm;
      background: var(--blue);
      color: white;
    }
    .total-block > span { color: rgba(255,255,255,.72); font-size: 11px; text-transform: uppercase; }
    .total-block > strong {
      margin-top: 5mm;
      color: white;
      font-size: 31px;
      line-height: 1;
      overflow-wrap: anywhere;
    }
    .total-block > em {
      margin: 3mm 0 8mm;
      color: rgba(255,255,255,.76);
      font-size: 12px;
      font-style: normal;
    }
    .terms {
      display: grid;
      gap: 3mm;
      padding-top: 5mm;
      border-top: 1px solid rgba(255,255,255,.22);
      color: rgba(255,255,255,.82);
      font-size: 11px;
    }
    .terms b { color: white; }
    .page-footer {
      display: flex;
      justify-content: space-between;
      gap: 8mm;
      margin-top: 7mm;
      padding-top: 4mm;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 10px;
    }
    .compact-header { padding-bottom: 8mm; }
    .compact-header strong {
      padding: 2mm 4mm;
      background: var(--blue);
      color: white;
      font-size: 12px;
    }
    .two-column {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 7mm;
      margin-top: 8mm;
    }
    .included-list, .process-list {
      display: grid;
      gap: 3mm;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .included-list li {
      display: grid;
      gap: 1mm;
      padding: 4mm;
      border: 1px solid var(--line);
      background: white;
    }
    .included-list b { color: var(--blue); }
    .included-list span, .process-list em, .proof-card p, .contact-block p {
      color: var(--muted);
      font-size: 11px;
      font-style: normal;
    }
    .process-list li {
      display: grid;
      grid-template-columns: 12mm 1fr;
      column-gap: 3mm;
      row-gap: 1mm;
      align-items: start;
      padding-bottom: 3mm;
      border-bottom: 1px solid var(--line);
    }
    .process-list span {
      grid-row: span 2;
      color: var(--accent);
      font-weight: 700;
    }
    .process-list b { color: var(--blue); }
    .proof-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5mm;
      margin-top: 8mm;
    }
    .proof-card {
      min-height: 28mm;
      padding: 4mm;
      border: 1px solid var(--line);
      background:
        linear-gradient(90deg, rgba(47,95,127,.08) 1px, transparent 1px),
        linear-gradient(0deg, rgba(47,95,127,.08) 1px, transparent 1px),
        #fff;
      background-size: 7mm 7mm;
    }
    .proof-code {
      display: inline-flex;
      min-width: 11mm;
      min-height: 8mm;
      align-items: center;
      justify-content: center;
      margin-bottom: 3mm;
      background: var(--accent);
      color: white;
      font-size: 10px;
      font-weight: 700;
    }
    .proof-card a {
      display: inline-block;
      margin-top: 3mm;
      color: var(--steel);
      font-size: 11px;
      font-weight: 700;
      text-decoration: none;
      overflow-wrap: anywhere;
    }
    .contact-block {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 68mm;
      gap: 6mm;
      margin-top: 8mm;
      padding: 6mm;
      background: var(--blue);
      color: white;
    }
    .contact-block h2 { color: white; margin-bottom: 3mm; }
    .contact-block p { color: rgba(255,255,255,.78); }
    .contact-block dt { color: rgba(255,255,255,.62); }
    .contact-block dd { color: white; font-size: 11px; }
    @media screen {
      .proposal-document {
        width: min(100%, 920px);
        padding: 16px;
        background: transparent;
      }
      .pdf-page {
        width: 100%;
        min-height: auto;
        margin: 0 auto 16px;
        padding: clamp(22px, 5vw, 58px);
        box-shadow: 0 16px 60px rgba(11,34,57,.14);
      }
    }
    @media (max-width: 720px) {
      body { background: white; }
      .proposal-document { padding: 0; }
      .pdf-page { margin: 0; box-shadow: none; }
      .offer-header, .compact-header, .client-grid, .commercial-grid, .two-column, .proof-grid, .contact-block {
        grid-template-columns: 1fr;
        display: grid;
      }
      .offer-meta { min-width: 0; }
      h1 { font-size: 28px; }
      .total-block > strong { font-size: 28px; }
    }
  `
}
