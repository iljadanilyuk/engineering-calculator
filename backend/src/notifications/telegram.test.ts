import { describe, expect, test } from 'bun:test'
import type { CalculationRecord } from '@poznyak-engineering-calculator/contracts'

import type { AppEnv } from '../env'
import { createTelegramLeadNotifierFromEnv } from './telegram'

describe('createTelegramLeadNotifierFromEnv', () => {
  test('skips safely when Telegram env is missing', async () => {
    const calls: string[] = []
    const logs: string[] = []
    const notifier = createTelegramLeadNotifierFromEnv(baseEnv(), {
      fetch: async (url) => {
        calls.push(String(url))
        return okTelegramResponse()
      },
      logger: {
        info: (message) => logs.push(message),
      },
    })

    const result = await notifier.notifyLeadSubmitted({ calculation: calculationRecord() })

    expect(result.status).toBe('disabled')
    expect(calls).toEqual([])
    expect(logs).toEqual([
      'Telegram lead notification skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured',
    ])
  })

  test('sends a concise lead message with admin and PDF links when configured', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = []
    const env = baseEnv({
      TELEGRAM_BOT_TOKEN: 'telegram-secret-token',
      TELEGRAM_CHAT_ID: '-100123456',
      PUBLIC_API_URL: 'https://api.example.com',
      PUBLIC_WEBAPP_URL: 'https://admin.example.com',
    })
    const notifier = createTelegramLeadNotifierFromEnv(env, {
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        })
        return okTelegramResponse()
      },
    })

    const result = await notifier.notifyLeadSubmitted({ calculation: calculationRecord() })

    expect(result.status).toBe('sent')
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe('https://api.telegram.org/bottelegram-secret-token/sendMessage')
    expect(requests[0].body.chat_id).toBe('-100123456')
    expect(requests[0].body.disable_web_page_preview).toBe(true)
    expect(requests[0].body.text).toContain('Новая заявка: Иван Клиент')
    expect(requests[0].body.text).toContain('Тел: +375291112233')
    expect(requests[0].body.text).toContain('Площадь: 42.50 м2')
    expect(requests[0].body.text).toContain('Итого: 425 Br (~142 $)')
    expect(requests[0].body.text).toContain('Разделы: Отопление, Котельная')
    expect(requests[0].body.text).toContain(
      'Админка: https://admin.example.com/app/leads/00000000-0000-7000-8000-000000000010',
    )
    expect(requests[0].body.text).toContain(
      'КП/PDF: https://api.example.com/api/public/proposals/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/pdf',
    )
    expect(requests[0].body.text).not.toContain('telegram-secret-token')
    expect(requests[0].body.text).not.toContain('utm')
    expect(requests[0].body.text).not.toContain('203.0.113.10')
    expect(requests[0].body.text).not.toContain('Call after 18:00')
  })

  test('throws sanitized errors for Telegram delivery failure', async () => {
    const env = baseEnv({
      TELEGRAM_BOT_TOKEN: 'telegram-secret-token',
      TELEGRAM_CHAT_ID: '123',
      PUBLIC_API_URL: 'https://api.example.com',
      PUBLIC_WEBAPP_URL: 'https://admin.example.com',
    })
    const notifier = createTelegramLeadNotifierFromEnv(env, {
      fetch: async () => new Response(JSON.stringify({ ok: false }), { status: 500 }),
    })

    await expect(notifier.notifyLeadSubmitted({ calculation: calculationRecord() })).rejects.toThrow(
      'Telegram sendMessage failed with HTTP 500',
    )
  })
})

function baseEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    PORT: 3000,
    DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/poznyak_engineering_calculator',
    JWT_SECRET: '12345678901234567890123456789012',
    CORS_ORIGINS: ['http://localhost:4321'],
    AUTH_CORS_ORIGINS: ['http://localhost:5173'],
    ACCESS_TOKEN_TTL_SECONDS: 900,
    REFRESH_TOKEN_TTL_DAYS: 30,
    COOKIE_SECURE: false,
    TRUST_PROXY_HEADERS: false,
    SPACES_UPLOAD_MAX_BYTES: 10 * 1024 * 1024,
    SPACES_UPLOAD_URL_TTL_SECONDS: 900,
    SPACES_DOWNLOAD_URL_TTL_SECONDS: 300,
    SPACES_PUBLIC_CACHE_CONTROL: 'public, max-age=31536000, immutable',
    ...overrides,
  }
}

function calculationRecord(): CalculationRecord {
  return {
    id: '00000000-0000-7000-8000-000000000010',
    publicToken: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    idempotencyKey: 'idem-key',
    requestFingerprintHash: 'c'.repeat(64),
    duplicateFingerprintHash: 'd'.repeat(64),
    duplicateWindowStartedAt: '2026-07-10T00:00:00.000Z',
    clientName: 'Иван Клиент',
    clientPhone: '+375291112233',
    objectName: 'Дом с баней',
    areaSqm: '42.50',
    areaSqmHundredths: 4_250,
    selectedServiceIds: [
      '00000000-0000-7000-8000-000000000011',
      '00000000-0000-7000-8000-000000000012',
    ],
    serviceSnapshots: [
      {
        id: '00000000-0000-7000-8000-000000000011',
        title: 'Отопление',
        description: null,
        pricingType: 'per_sqm',
        priceUsdCents: 100,
        isActive: true,
        sortOrder: 1,
      },
      {
        id: '00000000-0000-7000-8000-000000000012',
        title: 'Котельная',
        description: null,
        pricingType: 'fixed',
        priceUsdCents: 10_000,
        isActive: true,
        sortOrder: 2,
      },
    ],
    skippedServices: [],
    exchangeRate: {
      source: 'manual',
      usdToBynRate: '3',
      usdToBynRateScaled: 30_000,
      usdToBynRateScale: 10_000,
      asOf: '2026-07-10T00:00:00.000Z',
    },
    calculationVersion: 'pzk-calculation-v1',
    calculationSnapshot: {
      areaSqm: '42.50',
      areaSqmHundredths: 4_250,
      selectedServiceIds: [
        '00000000-0000-7000-8000-000000000011',
        '00000000-0000-7000-8000-000000000012',
      ],
      billableServiceIds: [
        '00000000-0000-7000-8000-000000000011',
        '00000000-0000-7000-8000-000000000012',
      ],
      lineItems: [],
      skippedServices: [],
      exchangeRate: {
        source: 'manual',
        usdToBynRate: '3',
        usdToBynRateScaled: 30_000,
        usdToBynRateScale: 10_000,
        asOf: '2026-07-10T00:00:00.000Z',
      },
      totals: {
        totalUsdCents: 14_167,
        totalBynCents: 42_500,
        totalBynRoundedRubles: 425,
      },
      rounding: {
        usdLineRounding: 'half_up_to_cent',
        bynRateRounding: 'half_up_to_cent',
        bynTotalPolicy: 'sum_rounded_line_byn_cents',
        bynDisplayRounding: 'half_up_to_whole_ruble',
      },
      calculationVersion: 'pzk-calculation-v1',
    },
    totalUsdCents: 14_167,
    totalBynCents: 42_500,
    totalBynRoundedRubles: 425,
    status: 'new',
    statusUpdatedAt: '2026-07-10T00:00:00.000Z',
    notes: 'Call after 18:00',
    source: 'public_calculator',
    referrer: 'https://example.com?utm=test',
    utm: { source: 'utm' },
    consentAcceptedAt: '2026-07-10T00:00:00.000Z',
    consentVersion: 'pzk-public-lead-consent-v1',
    consentText: 'consent text',
    consentIpAddress: '203.0.113.10',
    consentUserAgent: 'test-agent',
    proposalArtifacts: [
      {
        id: '00000000-0000-7000-8000-000000000013',
        publicToken: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        offerNumber: 'PZK-2026-AAAAAAAA',
        templateVersion: 'commercial-proposal-v1',
        status: 'ready',
        urlPath: '/api/public/proposals/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        pdfUrlPath: '/api/public/proposals/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/pdf',
        pdfUrl: null,
        storageKey: 'proposals/2026/07/pzk.pdf',
        checksumSha256: 'e'.repeat(64),
        pdfByteSize: 1_024,
        hasHtmlSnapshot: true,
        createdAt: '2026-07-10T00:00:00.000Z',
      },
    ],
    questionnaire: null,
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
  }
}

function okTelegramResponse() {
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
