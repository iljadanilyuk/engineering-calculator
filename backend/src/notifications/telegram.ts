import type { CalculationRecord } from '@poznyak-engineering-calculator/contracts'

import type { AppEnv } from '../env'

export type LeadNotificationInput = {
  calculation: CalculationRecord
}

export type LeadNotificationResult =
  | { status: 'sent' }
  | { status: 'disabled' }

export type LeadNotifier = {
  notifyLeadSubmitted(input: LeadNotificationInput): Promise<LeadNotificationResult>
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

type LeadNotificationLinks = {
  adminUrl: string
  proposalUrl?: string
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
      if (!isTelegramConfigured(config)) {
        if (!didLogDisabled) {
          logger.info('Telegram lead notification skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured')
          didLogDisabled = true
        }
        return { status: 'disabled' }
      }

      const message = formatTelegramLeadMessage(calculation, buildLeadNotificationLinks(calculation, config))
      await sendTelegramMessage({
        botToken: config.botToken,
        chatId: config.chatId,
        text: message,
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
  const lines = [
    `Новая заявка: ${compactText(calculation.clientName, 80)}`,
    `Тел: ${compactText(calculation.clientPhone, 40)}`,
    `Площадь: ${compactText(calculation.areaSqm, 24)} м2`,
    `Итого: ${formatInteger(calculation.totalBynRoundedRubles)} Br (${formatUsd(calculation.totalUsdCents)})`,
    `Разделы: ${servicesSummary(calculation.serviceSnapshots.map((service) => service.title))}`,
    `Админка: ${links.adminUrl}`,
  ]

  if (links.proposalUrl) {
    lines.push(`КП/PDF: ${links.proposalUrl}`)
  }

  return lines.join('\n')
}

function buildLeadNotificationLinks(
  calculation: CalculationRecord,
  config: Pick<TelegramNotifierConfig, 'apiBaseUrl' | 'webappBaseUrl'>,
): LeadNotificationLinks {
  const proposal = calculation.proposalArtifacts[0]

  return {
    adminUrl: absoluteUrl(config.webappBaseUrl, `/app/leads/${calculation.id}`),
    proposalUrl: proposal ? proposalUrl(proposal, config.apiBaseUrl) : undefined,
  }
}

function proposalUrl(
  proposal: CalculationRecord['proposalArtifacts'][number],
  apiBaseUrl: string,
) {
  if (proposal.pdfUrlPath) return absoluteUrl(apiBaseUrl, proposal.pdfUrlPath)
  if (proposal.pdfUrl) return proposal.pdfUrl
  return absoluteUrl(apiBaseUrl, proposal.urlPath)
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
    throw error
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

function servicesSummary(titles: string[]) {
  if (titles.length === 0) return 'не выбраны'

  const visible = titles
    .slice(0, maxVisibleServices)
    .map((title) => compactText(title, 72))
    .filter(Boolean)
  const suffix = titles.length > visible.length ? ` +${titles.length - visible.length}` : ''

  return `${visible.join(', ')}${suffix}`
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

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}
