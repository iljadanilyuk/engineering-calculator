import type { CalculationRecord } from '@poznyak-engineering-calculator/contracts'

import type { AppEnv } from '../env'

export type LeadNotificationInput = {
  calculation: CalculationRecord
}

export type TelegramOperationalEventType =
  | 'lead_submitted'
  | 'questionnaire_started'
  | 'questionnaire_completed'

export type LeadNotificationResult =
  | { status: 'sent' }
  | { status: 'disabled' }

export type LeadNotifier = {
  notifyLeadSubmitted(input: LeadNotificationInput): Promise<LeadNotificationResult>
  notifyQuestionnaireStarted(input: LeadNotificationInput): Promise<LeadNotificationResult>
  notifyQuestionnaireCompleted(input: LeadNotificationInput): Promise<LeadNotificationResult>
}

export type TelegramDocumentDeliveryInput = {
  chatId: string
  text: string
}

export type TelegramDocumentSender = {
  isConfigured(): boolean
  sendDocumentDelivery(input: TelegramDocumentDeliveryInput): Promise<LeadNotificationResult>
}

type TelegramFetch = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => ReturnType<typeof fetch>

type TelegramNotifierOptions = {
  fetch?: TelegramFetch
  logger?: Pick<Console, 'info'>
  timeoutMs?: number
}

type TelegramNotifierConfig = {
  botToken?: string
  chatId?: string
  apiBaseUrl: string
  webappBaseUrl: string
  timeoutMs: number
}

type TelegramDocumentSenderConfig = {
  botToken?: string
  timeoutMs: number
}

type LeadNotificationLinks = {
  adminUrl: string
}

export type TelegramProposalDeliveryLinks = {
  proposalUrl: string
  proposalPdfUrl?: string
}

export type TelegramProjectExampleDeliveryLink = {
  code: string
  title: string
  url: string
}

const defaultTelegramTimeoutMs = 5_000
const maxVisibleServices = 5

export function createTelegramLeadNotifierFromEnv(
  env: AppEnv,
  options: TelegramNotifierOptions = {},
): LeadNotifier {
  const config: TelegramNotifierConfig = {
    botToken: normalizeOptionalSecret(env.TELEGRAM_BOT_TOKEN),
    chatId: normalizeOptionalSecret(env.TELEGRAM_CHAT_ID),
    apiBaseUrl: env.PUBLIC_API_URL ?? `http://localhost:${env.PORT}`,
    webappBaseUrl: env.PUBLIC_WEBAPP_URL ?? env.AUTH_CORS_ORIGINS[0],
    timeoutMs: options.timeoutMs ?? defaultTelegramTimeoutMs,
  }
  const fetchTelegram = options.fetch ?? fetch
  const logger = options.logger ?? console
  let didLogDisabled = false

  return {
    async notifyLeadSubmitted({ calculation }) {
      return sendOperationalNotification('lead_submitted', calculation)
    },

    async notifyQuestionnaireStarted({ calculation }) {
      return sendOperationalNotification('questionnaire_started', calculation)
    },

    async notifyQuestionnaireCompleted({ calculation }) {
      return sendOperationalNotification('questionnaire_completed', calculation)
    },
  }

  async function sendOperationalNotification(
    eventType: TelegramOperationalEventType,
    calculation: CalculationRecord,
  ): Promise<LeadNotificationResult> {
    if (!isTelegramConfigured(config)) {
      if (!didLogDisabled) {
        logger.info('Telegram lead notification skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured')
        didLogDisabled = true
      }
      return { status: 'disabled' }
    }

    const message = formatTelegramOperationalMessage(
      calculation,
      buildLeadNotificationLinks(calculation, config),
      eventType,
    )
    await sendTelegramMessage({
      botToken: config.botToken,
      chatId: config.chatId,
      text: message,
      fetchTelegram,
      timeoutMs: config.timeoutMs,
    })

    return { status: 'sent' }
  }
}

export function createTelegramDocumentSenderFromEnv(
  env: AppEnv,
  options: TelegramNotifierOptions = {},
): TelegramDocumentSender {
  const config: TelegramDocumentSenderConfig = {
    botToken: normalizeOptionalSecret(env.TELEGRAM_BOT_TOKEN),
    timeoutMs: options.timeoutMs ?? defaultTelegramTimeoutMs,
  }
  const fetchTelegram = options.fetch ?? fetch
  const logger = options.logger ?? console
  let didLogDisabled = false

  return {
    isConfigured() {
      return Boolean(config.botToken)
    },

    async sendDocumentDelivery({ chatId, text }) {
      if (!config.botToken) {
        if (!didLogDisabled) {
          logger.info('Telegram client document delivery skipped: TELEGRAM_BOT_TOKEN is not configured')
          didLogDisabled = true
        }
        return { status: 'disabled' }
      }

      await sendTelegramMessage({
        botToken: config.botToken,
        chatId,
        text,
        fetchTelegram,
        timeoutMs: config.timeoutMs,
      })

      return { status: 'sent' }
    },
  }
}

export function formatTelegramLeadMessage(
  calculation: CalculationRecord,
  links: LeadNotificationLinks,
) {
  return formatTelegramOperationalMessage(calculation, links, 'lead_submitted')
}

export function formatTelegramOperationalMessage(
  calculation: CalculationRecord,
  links: LeadNotificationLinks,
  eventType: TelegramOperationalEventType,
) {
  const progress = questionnaireProgressLine(calculation, eventType)
  const lines = [
    `${operationalHeadline(eventType)}: ${compactText(calculation.clientName, 80)}`,
    `Тип: ${operationalRequestType(eventType)}`,
    `Тел: ${compactText(calculation.clientPhone, 40)}`,
    `Площадь: ${compactText(calculation.areaSqm, 24)} м2`,
    `Итого: ${formatInteger(calculation.totalBynRoundedRubles)} Br (${formatUsd(calculation.totalUsdCents)})`,
    `Прогресс: ${progress}`,
    `Разделы: ${servicesSummary(calculation.serviceSnapshots.map((service) => service.title))}`,
    `Админка: ${links.adminUrl}`,
  ]

  return lines.join('\n')
}

export function formatTelegramProposalDeliveryMessage(
  offerNumber: string,
  links: TelegramProposalDeliveryLinks,
) {
  const lines = [
    `Предварительное КП ${compactText(offerNumber, 40)} готово.`,
    `Открыть КП: ${links.proposalUrl}`,
  ]

  if (links.proposalPdfUrl) {
    lines.push(`PDF: ${links.proposalPdfUrl}`)
  }

  lines.push('Если ссылка не открылась, вернитесь на страницу после отправки формы: там остается обычная web-ссылка.')

  return lines.join('\n')
}

export function formatTelegramProjectExamplesDeliveryMessage(
  examples: readonly TelegramProjectExampleDeliveryLink[],
) {
  const lines = [
    'Примеры проектов ИП Позняк готовы:',
    ...examples.map((example) =>
      `${compactText(example.code, 12)} - ${compactText(example.title, 80)}: ${example.url}`,
    ),
    'Если ссылка не открылась, вернитесь на страницу после отправки формы: там остаются обычные web-ссылки.',
  ]

  return lines.join('\n')
}

export function telegramDeepLink(botUsername: string | undefined, bindToken: string) {
  const username = normalizeTelegramBotUsername(botUsername)
  if (!username) return null

  return `https://t.me/${username}?start=${encodeURIComponent(bindToken)}`
}

function buildLeadNotificationLinks(
  calculation: CalculationRecord,
  config: Pick<TelegramNotifierConfig, 'webappBaseUrl'>,
): LeadNotificationLinks {
  return {
    adminUrl: absoluteUrl(config.webappBaseUrl, `/app/leads/${calculation.id}`),
  }
}

async function sendTelegramMessage(input: {
  botToken: string
  chatId: string
  text: string
  fetchTelegram: TelegramFetch
  timeoutMs: number
}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs)

  try {
    const response = await input.fetchTelegram(
      `https://api.telegram.org/bot${input.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: input.text,
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      },
    )

    if (!response.ok) {
      throw new Error(`Telegram sendMessage failed with HTTP ${response.status}`)
    }

    const body = await safeReadJson(response)
    if (body && isTelegramOkResponse(body)) return
    if (body === null) return

    throw new Error('Telegram sendMessage returned an unsuccessful response')
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`Telegram sendMessage timed out after ${input.timeoutMs}ms`)
    }
    throw new Error(safeTelegramTransportErrorMessage(error))
  } finally {
    clearTimeout(timeout)
  }
}

async function safeReadJson(response: Response) {
  try {
    return await response.json() as unknown
  } catch {
    return null
  }
}

function isTelegramOkResponse(value: unknown) {
  if (!value || typeof value !== 'object') return false
  return (value as { ok?: unknown }).ok === true
}

function isTelegramConfigured(
  config: Pick<TelegramNotifierConfig, 'botToken' | 'chatId'>,
): config is TelegramNotifierConfig & { botToken: string; chatId: string } {
  return Boolean(config.botToken && config.chatId)
}

function normalizeOptionalSecret(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function normalizeTelegramBotUsername(value: string | undefined) {
  const trimmed = value?.trim().replace(/^@/, '')
  if (!trimmed) return null
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(trimmed)) return null
  return trimmed
}

function servicesSummary(titles: string[]) {
  if (titles.length === 0) return 'не выбраны'

  const visible = titles
    .slice(0, maxVisibleServices)
    .map((title) => compactText(title, 72))
    .filter(Boolean)
  const suffix = titles.length > visible.length ? ` +${titles.length - visible.length}` : ''

  return `${visible.join(', ')}${suffix}`
}

function operationalHeadline(eventType: TelegramOperationalEventType) {
  if (eventType === 'questionnaire_started') return 'Старт полного опросника'
  if (eventType === 'questionnaire_completed') return 'Полный опросник завершен'
  return 'Новая заявка'
}

function operationalRequestType(eventType: TelegramOperationalEventType) {
  if (eventType === 'questionnaire_started') return 'Полный опросник'
  if (eventType === 'questionnaire_completed') return 'Полный опросник'
  return 'Быстрое КП'
}

function questionnaireProgressLine(
  calculation: CalculationRecord,
  eventType: TelegramOperationalEventType,
) {
  const progress = calculation.questionnaire?.progress

  if (!progress) {
    return eventType === 'lead_submitted' ? 'КП готово' : 'опросник создан, ответов пока нет'
  }

  const clarificationCount = progress.unknownCount + progress.skippedCount
  const suffix = clarificationCount > 0 ? `, уточнить ${formatInteger(clarificationCount)}` : ''
  const completion = eventType === 'questionnaire_completed' ? ', завершен' : ''

  return `${formatInteger(progress.answeredCount)}/${formatInteger(progress.totalQuestions)} (${progress.completionPercent}%)${suffix}${completion}`
}

function absoluteUrl(baseUrl: string, path: string) {
  const base = new URL(baseUrl)
  return new URL(path, `${base.origin}/`).toString()
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(value)
}

function formatUsd(usdCents: number) {
  return `~${formatInteger(Math.round(usdCents / 100))} $`
}

function compactText(value: string, maxLength: number) {
  const compacted = value.replace(/\s+/g, ' ').trim()
  if (compacted.length <= maxLength) return compacted
  return `${compacted.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function safeTelegramTransportErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return redactTelegramBotUrl(message.slice(0, 500))
}

function redactTelegramBotUrl(message: string) {
  return message.replace(/bot[A-Za-z0-9:_-]+(?=\/sendMessage)/g, 'bot<redacted>')
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}
