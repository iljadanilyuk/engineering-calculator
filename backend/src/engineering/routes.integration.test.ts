import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'

import { createApp } from '../app'
import { hashPassword } from '../auth/passwords'
import { createPrisma } from '../db'
import type { AppEnv } from '../env'
import {
  createTelegramLeadNotifierFromEnv,
  type TelegramDocumentSender,
} from '../notifications/telegram'
import {
  createCommercialProposalArtifact,
  type CommercialProposalInput,
  type ProposalGenerator,
} from './proposal'

const databaseUrl = process.env.TEST_DATABASE_URL

const maybeDescribe = databaseUrl ? describe : describe.skip

maybeDescribe('engineering API integration', () => {
  const env: AppEnv = {
    PORT: 3000,
    DATABASE_URL: databaseUrl!,
    JWT_SECRET: '12345678901234567890123456789012',
    CORS_ORIGINS: ['http://localhost:5173'],
    AUTH_CORS_ORIGINS: ['http://localhost:5173'],
    ACCESS_TOKEN_TTL_SECONDS: 60,
    REFRESH_TOKEN_TTL_DAYS: 30,
    COOKIE_SECURE: false,
    TRUST_PROXY_HEADERS: true,
    SPACES_UPLOAD_MAX_BYTES: 10 * 1024 * 1024,
    SPACES_UPLOAD_URL_TTL_SECONDS: 900,
    SPACES_DOWNLOAD_URL_TTL_SECONDS: 300,
    SPACES_PUBLIC_CACHE_CONTROL: 'public, max-age=31536000, immutable',
    PUBLIC_WEBSITE_URL: 'https://website.example.com',
  }
  const prisma = createPrisma(databaseUrl!)
  const app = createApp({ env, prisma, proposalGenerator: createTestProposalGenerator() })
  let idempotencySequence = 0

  beforeEach(async () => {
    await prisma.telegramDelivery.deleteMany()
    await prisma.proposal.deleteMany()
    await prisma.calculationQuestionnaire.deleteMany()
    await prisma.calculation.deleteMany()
    await prisma.projectExampleRequest.deleteMany()
    await prisma.projectExample.deleteMany()
    await prisma.service.deleteMany()
    await prisma.appSetting.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.authRateLimitBucket.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('saves a normal fixed and per-square-meter calculation using backend totals only', async () => {
    const accessToken = await loginAdmin()
    await setExchangeRate(accessToken, '3.0000')
    const fixedService = await createService(accessToken, {
      title: 'Boiler room fixed package',
      pricingType: 'fixed',
      priceUsdCents: 10_000,
      sortOrder: 1,
    })
    const perSqmService = await createService(accessToken, {
      title: 'Heating drawings',
      pricingType: 'per_sqm',
      priceUsdCents: 250,
      sortOrder: 2,
    })
    await createService(accessToken, {
      title: 'Hidden internal package',
      pricingType: 'fixed',
      priceUsdCents: 99_999,
      isPublic: false,
      sortOrder: 3,
    })

    const publicServices = await app.request('/api/public/services')
    const publicServicesBody = await publicServices.json()
    expect(publicServices.status).toBe(200)
    expect(publicServicesBody.services.map((service: { title: string }) => service.title)).toEqual([
      'Boiler room fixed package',
      'Heating drawings',
    ])

    const publicConfig = await app.request('/api/public/calculator-config')
    const publicConfigBody = await publicConfig.json()
    expect(publicConfig.status).toBe(200)
    expect(publicConfigBody.exchangeRate.usdToBynRate).toBe('3')
    expect(publicConfigBody.services.map((service: { id: string }) => service.id)).toEqual([
      fixedService.id,
      perSqmService.id,
    ])

    const idempotencyKey = nextIdempotencyKey()
    const response = await app.request('/api/public/calculations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'pzk-happy-path-test',
        'X-Forwarded-For': '203.0.113.10',
      },
      body: JSON.stringify({
        idempotencyKey,
        clientName: '  Анна Клиент  ',
        clientPhone: '+375 29 111-22-33',
        objectName: 'Дом 10',
        calculation: {
          areaSqm: '10.00',
          selectedServiceIds: [fixedService.id, perSqmService.id],
        },
        consentAccepted: true,
        referrer: 'https://example.com/calculator',
        utm: {
          source: 'test',
        },
        totalBynCents: 1,
        totalUsdCents: 1,
        calculationSnapshot: {
          totals: {
            totalBynCents: 1,
          },
        },
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.calculation.clientPhone).toBe('+375291112233')
    expect(body.calculation.id).toBeUndefined()
    expect(body.calculation.clientName).toBeUndefined()
    expect(body.calculation.idempotencyKey).toBeUndefined()
    expect(body.calculation.requestFingerprintHash).toBeUndefined()
    expect(body.calculation.duplicateFingerprintHash).toBeUndefined()
    expect(body.calculation.source).toBeUndefined()
    expect(body.calculation.referrer).toBeUndefined()
    expect(body.calculation.utm).toBeUndefined()
    expect(body.calculation.consentIpAddress).toBeUndefined()
    expect(body.calculation.status).toBeUndefined()
    expect(body.calculation.areaSqmHundredths).toBe(1_000)
    expect(body.calculation.totalUsdCents).toBe(12_500)
    expect(body.calculation.totalBynCents).toBe(37_500)
    expect(body.calculation.totalBynRoundedRubles).toBe(375)
    expect(body.calculation.calculationSnapshot.totals).toEqual({
      totalUsdCents: 12_500,
      totalBynCents: 37_500,
      totalBynRoundedRubles: 375,
    })
    expect(body.calculation.serviceSnapshots.map((service: { title: string }) => service.title)).toEqual([
      'Boiler room fixed package',
      'Heating drawings',
    ])
    expect(body.calculation.proposal).toMatchObject({
      status: 'ready',
      offerNumber: expect.stringMatching(/^PZK-\d{4}-/),
      urlPath: expect.stringMatching(/^\/api\/public\/proposals\/[A-Za-z0-9_-]{32,128}$/),
      pdfUrlPath: expect.stringMatching(/^\/api\/public\/proposals\/[A-Za-z0-9_-]{32,128}\/pdf$/),
    })

    const saved = await prisma.calculation.findUniqueOrThrow({
      where: { publicToken: body.calculation.publicToken },
      include: { proposals: true },
    })
    expect(saved.totalBynCents).toBe(37_500n)
    expect(saved.clientPhone).toBe('+375291112233')
    expect(saved.idempotencyKey).toBe(idempotencyKey)
    expect(saved.requestFingerprintHash).toMatch(/^[a-f0-9]{64}$/)
    expect(saved.duplicateFingerprintHash).toMatch(/^[a-f0-9]{64}$/)
    expect(saved.consentVersion).toBe('pzk-public-lead-consent-v1')
    expect(saved.consentText).toBe(
      'Согласен на обработку имени, телефона и выбранного расчета для подготовки коммерческого предложения.',
    )
    expect(saved.consentIpAddress).toBe('203.0.113.10')
    expect(saved.publicToken).toMatch(/^[A-Za-z0-9_-]{32,128}$/)
    expect(saved.proposals).toHaveLength(1)
    expect(saved.proposals[0].templateVersion).toBe('commercial-proposal-v1')
    expect(saved.proposals[0].storageKey).toMatch(/^proposals\/\d{4}\/\d{2}\/pzk-\d{4}-/)
    expect(saved.proposals[0].checksumSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(saved.proposals[0].pdfByteSize).toBeGreaterThan(20)
    expect(saved.proposals[0].pdfBytes).toBeInstanceOf(Uint8Array)
    expect(saved.proposals[0].htmlSnapshot).toContain('<!doctype html>')

    const publicProposal = await app.request(`/api/public/proposals/${saved.proposals[0].publicToken}`)
    const publicProposalHtml = await publicProposal.text()
    expect(publicProposal.status).toBe(200)
    expect(publicProposal.headers.get('cache-control')).toBe('private, max-age=0, no-store')
    expect(publicProposal.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(publicProposalHtml).toContain('Коммерческое предложение')
    expect(publicProposalHtml).toContain('Анна Клиент')
    expect(publicProposalHtml).toContain('Boiler room fixed package')
    expect(publicProposalHtml).toContain('Открыть раздел с примерами')
    expect(publicProposalHtml).not.toContain('/project-examples/proekt-primer-ov.pdf')
    expect(publicProposalHtml).not.toContain('/project-examples/primer-proekt-vk.pdf')
    expect(publicProposalHtml).not.toContain('Коммерческое предложение готовится')

    const publicProposalPdf = await app.request(`/api/public/proposals/${saved.proposals[0].publicToken}/pdf`)
    const publicProposalPdfBytes = new Uint8Array(await publicProposalPdf.arrayBuffer())
    const savedProposalChecksum = saved.proposals[0].checksumSha256
    if (!savedProposalChecksum) throw new Error('Expected saved proposal checksum')
    expect(savedProposalChecksum).toMatch(/^[a-f0-9]{64}$/)
    expect(publicProposalPdf.status).toBe(200)
    expect(publicProposalPdf.headers.get('content-type')).toContain('application/pdf')
    expect(publicProposalPdf.headers.get('x-proposal-checksum-sha256')).toBe(savedProposalChecksum)
    expect(sha256Hex(publicProposalPdfBytes)).toBe(savedProposalChecksum)
    expect(new TextDecoder().decode(publicProposalPdfBytes.slice(0, 8))).toContain('%PDF-')

    await patchService(accessToken, fixedService.id, {
      title: 'Changed boiler price',
      priceUsdCents: 99_999,
      isActive: false,
    })
    await setExchangeRate(accessToken, '4.0000')

    const snapshotResponse = await app.request(`/api/admin/calculations/${saved.id}`, {
      headers: authHeaders(accessToken),
    })
    const snapshotBody = await snapshotResponse.json()

    expect(snapshotResponse.status).toBe(200)
    expect(snapshotBody.calculation.id).toBe(saved.id)
    expect(snapshotBody.calculation.requestFingerprintHash).toBe(saved.requestFingerprintHash)
    expect(snapshotBody.calculation.consentIpAddress).toBe('203.0.113.10')
    expect(snapshotBody.calculation.totalBynCents).toBe(37_500)
    expect(snapshotBody.calculation.exchangeRate.usdToBynRate).toBe('3')
    expect(snapshotBody.calculation.proposalArtifacts[0]).toMatchObject({
      offerNumber: saved.proposals[0].offerNumber,
      templateVersion: 'commercial-proposal-v1',
      storageKey: saved.proposals[0].storageKey,
      checksumSha256: saved.proposals[0].checksumSha256,
      pdfByteSize: saved.proposals[0].pdfByteSize,
      hasHtmlSnapshot: true,
    })
    expect(snapshotBody.calculation.calculationSnapshot.lineItems[0].serviceSnapshot).toMatchObject({
      title: 'Boiler room fixed package',
      priceUsdCents: 10_000,
      isActive: true,
    })

    const publicProposalAfterEdits = await app.request(
      `/api/public/proposals/${saved.proposals[0].publicToken}`,
    )
    const publicProposalAfterEditsHtml = await publicProposalAfterEdits.text()
    const publicProposalPdfAfterEdits = await app.request(
      `/api/public/proposals/${saved.proposals[0].publicToken}/pdf`,
    )
    const publicProposalPdfAfterEditsBytes = new Uint8Array(
      await publicProposalPdfAfterEdits.arrayBuffer(),
    )

    expect(publicProposalAfterEditsHtml).toContain('Boiler room fixed package')
    expect(publicProposalAfterEditsHtml).not.toContain('Changed boiler price')
    expect(publicProposalPdfAfterEditsBytes).toEqual(publicProposalPdfBytes)
  })

  test('rejects archived, missing, and unsupported formula services before persistence', async () => {
    const accessToken = await loginAdmin('unavailable@example.com')
    await setExchangeRate(accessToken, '3.0000')
    const inactiveService = await createService(accessToken, {
      title: 'Inactive service',
      pricingType: 'fixed',
      priceUsdCents: 10_000,
      isActive: false,
    })
    const formulaService = await createService(accessToken, {
      title: 'Formula service',
      pricingType: 'formula',
      priceUsdCents: 0,
      pricingRule: {
        kind: 'future',
      },
      formulaVersion: 'future-v1',
    })
    const hiddenService = await createService(accessToken, {
      title: 'Hidden active service',
      pricingType: 'fixed',
      priceUsdCents: 10_000,
      isPublic: false,
    })

    const inactive = await saveCalculation({
      clientName: 'Client',
      clientPhone: '+375291112233',
      calculation: {
        areaSqm: '10',
        selectedServiceIds: [inactiveService.id],
      },
      consentAccepted: true,
    })
    const inactiveBody = await inactive.json()
    expect(inactive.status).toBe(409)
    expect(inactiveBody.error.details[0]).toEqual({
      serviceId: inactiveService.id,
      reason: 'not_found',
    })

    const missing = await saveCalculation({
      clientName: 'Client',
      clientPhone: '+375291112233',
      calculation: {
        areaSqm: '10',
        selectedServiceIds: ['missing-service-id'],
      },
      consentAccepted: true,
    })
    const missingBody = await missing.json()
    expect(missing.status).toBe(409)
    expect(missingBody.error.details[0]).toEqual({
      serviceId: 'missing-service-id',
      reason: 'not_found',
    })

    const hidden = await saveCalculation({
      clientName: 'Client',
      clientPhone: '+375291112233',
      calculation: {
        areaSqm: '10',
        selectedServiceIds: [hiddenService.id],
      },
      consentAccepted: true,
    })
    const hiddenBody = await hidden.json()
    expect(hidden.status).toBe(409)
    expect(hiddenBody.error.details[0]).toEqual({
      serviceId: hiddenService.id,
      reason: 'not_found',
    })

    const formula = await saveCalculation({
      clientName: 'Client',
      clientPhone: '+375291112233',
      calculation: {
        areaSqm: '10',
        selectedServiceIds: [formulaService.id],
      },
      consentAccepted: true,
    })
    const formulaBody = await formula.json()
    expect(formula.status).toBe(409)
    expect(formulaBody.error.details[0]).toMatchObject({
      serviceId: formulaService.id,
      reason: 'unsupported_pricing_type',
    })

    expect(await prisma.calculation.count()).toBe(0)
  })

  test('rejects invalid public lead fields before persistence', async () => {
    const accessToken = await loginAdmin('invalid-lead@example.com')
    await setExchangeRate(accessToken, '3.0000')
    const service = await createService(accessToken, {
      title: 'Valid public service',
      pricingType: 'fixed',
      priceUsdCents: 10_000,
    })

    const invalidName = await saveCalculation({
      clientName: 'A',
      clientPhone: '+375291112233',
      calculation: {
        areaSqm: '10',
        selectedServiceIds: [service.id],
      },
      consentAccepted: true,
    })
    const invalidNameBody = await invalidName.json()
    expect(invalidName.status).toBe(400)
    expect(invalidNameBody.error.code).toBe('VALIDATION_ERROR')

    const invalidPhone = await saveCalculation({
      clientName: 'Client',
      clientPhone: 'abcde',
      calculation: {
        areaSqm: '10',
        selectedServiceIds: [service.id],
      },
      consentAccepted: true,
    })
    const invalidPhoneBody = await invalidPhone.json()
    expect(invalidPhone.status).toBe(400)
    expect(invalidPhoneBody.error.message).toBe('Invalid lead phone number')

    const missingConsent = await app.request('/api/public/calculations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: nextIdempotencyKey(),
        clientName: 'Client',
        clientPhone: '+375291112233',
        calculation: {
          areaSqm: '10',
          selectedServiceIds: [service.id],
        },
        consentAccepted: false,
      }),
    })
    expect(missingConsent.status).toBe(400)
    expect(await prisma.calculation.count()).toBe(0)
  })

  test('returns existing calculation for idempotent and recent duplicate submissions', async () => {
    const accessToken = await loginAdmin('duplicates@example.com')
    await setExchangeRate(accessToken, '3.0000')
    const service = await createService(accessToken, {
      title: 'Duplicate-safe service',
      pricingType: 'per_sqm',
      priceUsdCents: 100,
    })
    const payload = {
      idempotencyKey: nextIdempotencyKey(),
      clientName: 'Duplicate Client',
      clientPhone: '8 029 111-22-33',
      calculation: {
        areaSqm: '25',
        selectedServiceIds: [service.id],
      },
      consentAccepted: true,
      source: 'public_website',
    }

    const first = await saveCalculation(payload)
    const firstBody = await first.json()
    const sameKeyReplay = await saveCalculation(payload)
    const sameKeyReplayBody = await sameKeyReplay.json()
    const recentDuplicate = await saveCalculation({
      ...payload,
      idempotencyKey: nextIdempotencyKey(),
    })
    const recentDuplicateBody = await recentDuplicate.json()

    expect(first.status).toBe(201)
    expect(sameKeyReplay.status).toBe(200)
    expect(recentDuplicate.status).toBe(200)
    expect(sameKeyReplayBody.calculation.publicToken).toBe(firstBody.calculation.publicToken)
    expect(recentDuplicateBody.calculation.publicToken).toBe(firstBody.calculation.publicToken)
    expect(firstBody.calculation.clientPhone).toBe('+375291112233')
    expect(firstBody.calculation.source).toBeUndefined()
    expect(await prisma.calculation.count()).toBe(1)
    expect(await prisma.proposal.count()).toBe(1)
  })

  test('sends Telegram notification after a new public lead submission when env is configured', async () => {
    const accessToken = await loginAdmin('telegram-success@example.com')
    await setExchangeRate(accessToken, '3.0000')
    const service = await createService(accessToken, {
      title: 'Telegram heating drawings',
      pricingType: 'per_sqm',
      priceUsdCents: 250,
    })
    const telegramRequests: Array<Record<string, unknown>> = []
    const telegramEnv: AppEnv = {
      ...env,
      TELEGRAM_BOT_TOKEN: 'telegram-secret-token',
      TELEGRAM_CHAT_ID: '-100123456',
      PUBLIC_API_URL: 'https://api.example.com',
      PUBLIC_WEBAPP_URL: 'https://admin.example.com',
    }
    const telegramApp = createApp({
      env: telegramEnv,
      prisma,
      proposalGenerator: createTestProposalGenerator(),
      leadNotifier: createTelegramLeadNotifierFromEnv(telegramEnv, {
        fetch: async (_url, init) => {
          telegramRequests.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
        logger: { info: () => undefined },
      }),
    })
    const payload = {
      idempotencyKey: nextIdempotencyKey(),
      clientName: 'Telegram Client',
      clientPhone: '+375291112233',
      objectName: 'Should stay out of Telegram',
      calculation: {
        areaSqm: '25',
        selectedServiceIds: [service.id],
      },
      consentAccepted: true,
      utm: {
        source: 'should-not-leak',
      },
    }

    const response = await saveCalculationWithApp(telegramApp, payload)
    const body = await response.json()
    const replay = await saveCalculationWithApp(telegramApp, payload)
    const recentDuplicate = await saveCalculationWithApp(telegramApp, {
      ...payload,
      idempotencyKey: nextIdempotencyKey(),
    })
    const saved = await prisma.calculation.findUniqueOrThrow({
      where: { publicToken: body.calculation.publicToken },
      include: { proposals: true },
    })
    const message = String(telegramRequests[0].text)

    expect(response.status).toBe(201)
    expect(replay.status).toBe(200)
    expect(recentDuplicate.status).toBe(200)
    expect(telegramRequests).toHaveLength(1)
    expect(telegramRequests[0].chat_id).toBe('-100123456')
    expect(telegramRequests[0].disable_web_page_preview).toBe(true)
    expect(message).toContain('Новая заявка: Telegram Client')
    expect(message).toContain('Тел: +375291112233')
    expect(message).toContain('Площадь: 25 м2')
    expect(message).toContain('Итого: 188 Br (~63 $)')
    expect(message).toContain('Разделы: Telegram heating drawings')
    expect(message).toContain(`Админка: https://admin.example.com/app/leads/${saved.id}`)
    expect(message).toContain(
      `КП/PDF: https://api.example.com/api/public/proposals/${saved.proposals[0].publicToken}/pdf`,
    )
    expect(message).not.toContain('Should stay out of Telegram')
    expect(message).not.toContain('should-not-leak')
    expect(JSON.stringify(body)).not.toContain('telegram-secret-token')
    expect(JSON.stringify(body)).not.toContain('-100123456')
  })

  test('skips missing Telegram env and keeps saving the lead safely', async () => {
    const accessToken = await loginAdmin('telegram-missing-env@example.com')
    await setExchangeRate(accessToken, '3.0000')
    const service = await createService(accessToken, {
      title: 'Telegram optional service',
      pricingType: 'fixed',
      priceUsdCents: 10_000,
    })
    const telegramRequests: string[] = []
    const missingTelegramApp = createApp({
      env,
      prisma,
      proposalGenerator: createTestProposalGenerator(),
      leadNotifier: createTelegramLeadNotifierFromEnv(env, {
        fetch: async (url) => {
          telegramRequests.push(String(url))
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
        logger: { info: () => undefined },
      }),
    })

    const response = await saveCalculationWithApp(missingTelegramApp, {
      clientName: 'Missing Telegram Client',
      clientPhone: '+375291112233',
      calculation: {
        areaSqm: '10',
        selectedServiceIds: [service.id],
      },
      consentAccepted: true,
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.calculation.proposal.status).toBe('ready')
    expect(telegramRequests).toEqual([])
    expect(await prisma.calculation.count()).toBe(1)
    expect(await prisma.proposal.count()).toBe(1)
  })

  test('does not break lead creation when Telegram delivery fails', async () => {
    const accessToken = await loginAdmin('telegram-failure@example.com')
    await setExchangeRate(accessToken, '3.0000')
    const service = await createService(accessToken, {
      title: 'Telegram failure service',
      pricingType: 'fixed',
      priceUsdCents: 10_000,
    })
    const telegramEnv: AppEnv = {
      ...env,
      TELEGRAM_BOT_TOKEN: 'telegram-secret-token',
      TELEGRAM_CHAT_ID: '123',
      PUBLIC_API_URL: 'https://api.example.com',
      PUBLIC_WEBAPP_URL: 'https://admin.example.com',
    }
    const failureApp = createApp({
      env: telegramEnv,
      prisma,
      proposalGenerator: createTestProposalGenerator(),
      leadNotifier: createTelegramLeadNotifierFromEnv(telegramEnv, {
        fetch: async () => new Response(JSON.stringify({ ok: false }), { status: 500 }),
        logger: { info: () => undefined },
      }),
    })

    const response = await saveCalculationWithApp(failureApp, {
      clientName: 'Failure Telegram Client',
      clientPhone: '+375291112233',
      calculation: {
        areaSqm: '10',
        selectedServiceIds: [service.id],
      },
      consentAccepted: true,
    })
    const body = await response.json()
    const saved = await prisma.calculation.findUniqueOrThrow({
      where: { publicToken: body.calculation.publicToken },
      include: { proposals: true },
    })

    expect(response.status).toBe(201)
    expect(saved.clientName).toBe('Failure Telegram Client')
    expect(saved.proposals).toHaveLength(1)
    expect(body.calculation.proposal.status).toBe('ready')
    expect(JSON.stringify(body)).not.toContain('telegram-secret-token')
  })

  test('creates Telegram delivery deep link for preliminary proposals and sends after bot start', async () => {
    const accessToken = await loginAdmin('client-telegram-proposal@example.com')
    await setExchangeRate(accessToken, '3.0000')
    const service = await createService(accessToken, {
      title: 'Client Telegram proposal service',
      pricingType: 'fixed',
      priceUsdCents: 10_000,
    })
    const deliveries: Array<{ chatId: string; text: string }> = []
    const telegramEnv: AppEnv = {
      ...env,
      TELEGRAM_BOT_TOKEN: 'telegram-secret-token',
      TELEGRAM_BOT_USERNAME: 'PoznyakCalcBot',
      TELEGRAM_WEBHOOK_SECRET: 'webhook-secret',
      PUBLIC_API_URL: 'https://api.example.com',
    }
    const telegramApp = createApp({
      env: telegramEnv,
      prisma,
      proposalGenerator: createTestProposalGenerator(),
      telegramDocumentSender: recordingTelegramDocumentSender(deliveries, 50),
    })
    const payload = {
      idempotencyKey: nextIdempotencyKey(),
      clientName: 'Telegram Proposal Client',
      clientPhone: '+375291112233',
      calculation: {
        areaSqm: '10',
        selectedServiceIds: [service.id],
      },
      consentAccepted: true,
      source: 'public_offer_preliminary',
    }

    const response = await saveCalculationWithApp(telegramApp, payload)
    const body = await response.json()
    const replay = await saveCalculationWithApp(telegramApp, payload)
    const duplicate = await saveCalculationWithApp(telegramApp, {
      ...payload,
      idempotencyKey: nextIdempotencyKey(),
    })
    const deepLinkUrl = body.calculation.telegramDelivery.deepLinkUrl as string
    const bindToken = new URL(deepLinkUrl).searchParams.get('start')
    const badWebhook = await telegramApp.request('/api/public/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret',
      },
      body: JSON.stringify(telegramStartUpdate(bindToken ?? 'missing-token')),
    })
    const groupWebhook = await telegramApp.request('/api/public/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'webhook-secret',
      },
      body: JSON.stringify(telegramStartUpdate(bindToken ?? 'missing-token', 'group')),
    })
    const [webhook, repeatedWebhook] = await Promise.all([
      telegramApp.request('/api/public/telegram/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'webhook-secret',
        },
        body: JSON.stringify(telegramStartUpdate(bindToken ?? 'missing-token')),
      }),
      telegramApp.request('/api/public/telegram/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'webhook-secret',
        },
        body: JSON.stringify(telegramStartUpdate(bindToken ?? 'missing-token')),
      }),
    ])
    const saved = await prisma.calculation.findUniqueOrThrow({
      where: { publicToken: body.calculation.publicToken },
      include: {
        proposals: true,
        telegramDeliveries: true,
      },
    })
    const detail = await telegramApp.request(`/api/admin/calculations/${saved.id}`, {
      headers: authHeaders(accessToken),
    })
    const detailBody = await detail.json()

    expect(response.status).toBe(201)
    expect(replay.status).toBe(200)
    expect(duplicate.status).toBe(200)
    expect(body.calculation.telegramDelivery).toMatchObject({
      status: 'pending_start',
      deepLinkUrl: expect.stringMatching(/^https:\/\/t\.me\/PoznyakCalcBot\?start=[A-Za-z0-9_-]{32,128}$/),
    })
    expect(bindToken).toMatch(/^[A-Za-z0-9_-]{32,128}$/)
    expect(JSON.stringify(body)).not.toContain('telegram-secret-token')
    expect(await prisma.telegramDelivery.count()).toBe(1)
    expect(badWebhook.status).toBe(401)
    expect(groupWebhook.status).toBe(200)
    expect(webhook.status).toBe(200)
    expect(repeatedWebhook.status).toBe(200)
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0].chatId).toBe('123456789')
    expect(deliveries[0].text).toContain('Предварительное КП')
    expect(deliveries[0].text).toContain(
      `https://api.example.com/api/public/proposals/${saved.proposals[0].publicToken}/pdf`,
    )
    expect(deliveries[0].text).not.toContain('telegram-secret-token')
    expect(saved.telegramDeliveries).toHaveLength(1)
    expect(saved.telegramDeliveries[0]).toMatchObject({
      targetType: 'proposal',
      status: 'sent',
      telegramChatId: '123456789',
      telegramUserId: '777000',
      telegramUsername: 'clientuser',
      attemptCount: 1,
    })
    expect(detail.status).toBe(200)
    expect(detailBody.calculation.telegramDeliveries[0]).toMatchObject({
      targetType: 'proposal',
      status: 'sent',
      telegramChatId: '123456789',
      telegramUserId: '777000',
      telegramUsername: 'clientuser',
      attemptCount: 1,
    })
    expect(JSON.stringify(detailBody)).not.toContain(bindToken)
  })

  test('keeps client Telegram delivery disabled when webhook secret is missing', async () => {
    const accessToken = await loginAdmin('client-telegram-no-webhook-secret@example.com')
    await setExchangeRate(accessToken, '3.0000')
    const service = await createService(accessToken, {
      title: 'No webhook secret service',
      pricingType: 'fixed',
      priceUsdCents: 10_000,
    })
    const deliveries: Array<{ chatId: string; text: string }> = []
    const telegramEnv: AppEnv = {
      ...env,
      TELEGRAM_BOT_TOKEN: 'telegram-secret-token',
      TELEGRAM_BOT_USERNAME: 'PoznyakCalcBot',
      PUBLIC_API_URL: 'https://api.example.com',
    }
    const telegramApp = createApp({
      env: telegramEnv,
      prisma,
      proposalGenerator: createTestProposalGenerator(),
      telegramDocumentSender: recordingTelegramDocumentSender(deliveries),
    })

    const response = await saveCalculationWithApp(telegramApp, {
      clientName: 'Missing Webhook Secret Client',
      clientPhone: '+375291112233',
      calculation: {
        areaSqm: '10',
        selectedServiceIds: [service.id],
      },
      consentAccepted: true,
      source: 'public_offer_preliminary',
    })
    const body = await response.json()
    const webhook = await telegramApp.request('/api/public/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(telegramStartUpdate('a'.repeat(32))),
    })
    const saved = await prisma.calculation.findUniqueOrThrow({
      where: { publicToken: body.calculation.publicToken },
      include: { telegramDeliveries: true },
    })

    expect(response.status).toBe(201)
    expect(body.calculation.telegramDelivery).toEqual({
      status: 'disabled',
      deepLinkUrl: null,
    })
    expect(webhook.status).toBe(401)
    expect(deliveries).toHaveLength(0)
    expect(saved.telegramDeliveries[0]).toMatchObject({
      targetType: 'proposal',
      status: 'disabled',
      attemptCount: 0,
      telegramChatId: null,
    })
  })

  test('does not expose a PDF link for legacy HTML-only proposal artifacts', async () => {
    const accessToken = await loginAdmin('legacy-html-proposal@example.com')
    await setExchangeRate(accessToken, '3.0000')
    const service = await createService(accessToken, {
      title: 'Legacy-safe service',
      pricingType: 'fixed',
      priceUsdCents: 10_000,
    })
    const payload = {
      idempotencyKey: nextIdempotencyKey(),
      clientName: 'Legacy Client',
      clientPhone: '+375291112233',
      calculation: {
        areaSqm: '10',
        selectedServiceIds: [service.id],
      },
      consentAccepted: true,
    }
    const first = await saveCalculation(payload)
    const firstBody = await first.json()

    expect(first.status).toBe(201)
    expect(firstBody.calculation.proposal.status).toBe('ready')

    const savedProposal = await prisma.proposal.findUniqueOrThrow({
      where: { publicToken: firstBody.calculation.proposal.publicToken },
    })
    await prisma.proposal.update({
      where: { id: savedProposal.id },
      data: {
        pdfBytes: null,
        pdfByteSize: null,
        storageKey: null,
        checksumSha256: null,
      },
    })

    const replay = await saveCalculation(payload)
    const replayBody = await replay.json()
    const htmlOnlyProposal = replayBody.calculation.proposal

    expect(replay.status).toBe(200)
    expect(htmlOnlyProposal).toMatchObject({
      status: 'html_only',
      offerNumber: savedProposal.offerNumber,
      urlPath: `/api/public/proposals/${savedProposal.publicToken}`,
    })
    expect(htmlOnlyProposal.pdfUrlPath).toBeUndefined()

    const html = await app.request(`/api/public/proposals/${savedProposal.publicToken}`)
    const pdf = await app.request(`/api/public/proposals/${savedProposal.publicToken}/pdf`)
    expect(html.status).toBe(200)
    expect(pdf.status).toBe(404)
  })

  test('rejects idempotency key replay with a different payload', async () => {
    const accessToken = await loginAdmin('idempotency-mismatch@example.com')
    await setExchangeRate(accessToken, '3.0000')
    const service = await createService(accessToken, {
      title: 'Idempotency service',
      pricingType: 'fixed',
      priceUsdCents: 10_000,
    })
    const idempotencyKey = nextIdempotencyKey()
    const first = await saveCalculation({
      idempotencyKey,
      clientName: 'First Client',
      clientPhone: '+375291112233',
      calculation: {
        areaSqm: '10',
        selectedServiceIds: [service.id],
      },
      consentAccepted: true,
    })
    const mismatch = await saveCalculation({
      idempotencyKey,
      clientName: 'Second Client',
      clientPhone: '+375291112233',
      calculation: {
        areaSqm: '20',
        selectedServiceIds: [service.id],
      },
      consentAccepted: true,
    })
    const mismatchBody = await mismatch.json()

    expect(first.status).toBe(201)
    expect(mismatch.status).toBe(409)
    expect(mismatchBody.error.message).toBe(
      'Idempotency key was already used for a different calculation submission',
    )
    expect(await prisma.calculation.count()).toBe(1)
  })

  test('keeps exact idempotent retries safe after the public throttle threshold', async () => {
    const accessToken = await loginAdmin('idempotency-throttle@example.com')
    await setExchangeRate(accessToken, '3.0000')
    const service = await createService(accessToken, {
      title: 'Retry-safe service',
      pricingType: 'fixed',
      priceUsdCents: 10_000,
    })
    const payload = {
      idempotencyKey: nextIdempotencyKey(),
      clientName: 'Retry Client',
      clientPhone: '+375291119999',
      calculation: {
        areaSqm: '10',
        selectedServiceIds: [service.id],
      },
      consentAccepted: true,
    }
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': `pzk-idempotency-retry-${Date.now()}`,
    }
    const first = await app.request('/api/public/calculations', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    let latestReplayStatus = 0

    for (let index = 0; index < 25; index += 1) {
      const replay = await app.request('/api/public/calculations', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
      latestReplayStatus = replay.status
    }

    expect(first.status).toBe(201)
    expect(latestReplayStatus).toBe(200)
    expect(await prisma.calculation.count()).toBe(1)
  })

  test('rate limits mismatched idempotency-key replays instead of exempting them', async () => {
    const accessToken = await loginAdmin('idempotency-mismatch-rate@example.com')
    await setExchangeRate(accessToken, '3.0000')
    const service = await createService(accessToken, {
      title: 'Mismatch limited service',
      pricingType: 'fixed',
      priceUsdCents: 10_000,
    })
    const idempotencyKey = nextIdempotencyKey()
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': `pzk-idempotency-mismatch-rate-${Date.now()}`,
    }
    const first = await app.request('/api/public/calculations', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey,
        clientName: 'Mismatch Client',
        clientPhone: '+375291118888',
        calculation: {
          areaSqm: '10',
          selectedServiceIds: [service.id],
        },
        consentAccepted: true,
      }),
    })
    let latestMismatchStatus = 0

    for (let index = 0; index < 21; index += 1) {
      const mismatch = await app.request('/api/public/calculations', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          idempotencyKey,
          clientName: 'Mismatch Client Changed',
          clientPhone: '+375291118888',
          calculation: {
            areaSqm: '20',
            selectedServiceIds: [service.id],
          },
          consentAccepted: true,
        }),
      })
      latestMismatchStatus = mismatch.status
    }

    expect(first.status).toBe(201)
    expect(latestMismatchStatus).toBe(429)
    expect(await prisma.calculation.count()).toBe(1)
  })

  test('rejects public calculation saves when exchange rate is missing', async () => {
    const response = await saveCalculation({
      clientName: 'Client',
      clientPhone: '+375291112233',
      calculation: {
        areaSqm: '10',
        selectedServiceIds: [],
      },
      consentAccepted: true,
    })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error.message).toBe('USD/BYN exchange rate setting is not configured')
    expect(await prisma.calculation.count()).toBe(0)
  })

  test('protects public proposal and PDF routes with unguessable tokens', async () => {
    const accessToken = await loginAdmin('proposal-token-access@example.com')
    await setExchangeRate(accessToken, '3.0000')
    const service = await createService(accessToken, {
      title: 'Token gated service',
      pricingType: 'fixed',
      priceUsdCents: 10_000,
    })
    const response = await saveCalculation({
      clientName: 'Token Client',
      clientPhone: '+375291112233',
      calculation: {
        areaSqm: '10',
        selectedServiceIds: [service.id],
      },
      consentAccepted: true,
    })
    const body = await response.json()
    const proposalToken = body.calculation.proposal.publicToken
    const validHtml = await app.request(`/api/public/proposals/${proposalToken}`)
    const validPdf = await app.request(`/api/public/proposals/${proposalToken}/pdf`)
    const unknownHtml = await app.request(`/api/public/proposals/${'u'.repeat(32)}`)
    const unknownPdf = await app.request(`/api/public/proposals/${'v'.repeat(32)}/pdf`)
    const invalidHtml = await app.request('/api/public/proposals/not-valid-token')
    const invalidPdf = await app.request('/api/public/proposals/not-valid-token/pdf')
    const missingToken = await app.request('/api/public/proposals/')

    expect(response.status).toBe(201)
    expect(validHtml.status).toBe(200)
    expect(validPdf.status).toBe(200)
    expect(unknownHtml.status).toBe(404)
    expect(unknownPdf.status).toBe(404)
    expect(invalidHtml.status).toBe(400)
    expect(invalidPdf.status).toBe(400)
    expect(missingToken.status).toBe(404)
  })

  test('requires auth for admin engineering routes', async () => {
    const response = await app.request('/api/admin/services')
    const body = await response.json()
    const calculations = await app.request('/api/admin/calculations')
    const updateCalculation = await app.request('/api/admin/calculations/00000000-0000-7000-8000-000000000001', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'contacted' }),
    })

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(calculations.status).toBe(401)
    expect(updateCalculation.status).toBe(401)
  })

  test('manages admin services with create, edit, archive, reorder, visibility, and validation', async () => {
    const accessToken = await loginAdmin('services-admin@example.com')
    const invalidType = await app.request('/api/admin/services', {
      method: 'POST',
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({
        title: 'Invalid pricing',
        pricingType: 'hourly',
        priceUsdCents: 10_000,
      }),
    })
    const negativePrice = await app.request('/api/admin/services', {
      method: 'POST',
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({
        title: 'Negative price',
        pricingType: 'fixed',
        priceUsdCents: -1,
      }),
    })
    const zeroFixedPrice = await app.request('/api/admin/services', {
      method: 'POST',
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({
        title: 'Zero fixed price',
        pricingType: 'fixed',
        priceUsdCents: 0,
      }),
    })

    expect(invalidType.status).toBe(400)
    expect(negativePrice.status).toBe(400)
    expect(zeroFixedPrice.status).toBe(400)

    const first = await createService(accessToken, {
      title: 'Heating design',
      description: 'Initial description',
      pricingType: 'per_sqm',
      priceUsdCents: 250,
      sortOrder: 10,
    })
    const second = await createService(accessToken, {
      title: 'Boiler room',
      pricingType: 'fixed',
      priceUsdCents: 20_000,
      sortOrder: 20,
    })
    const hidden = await createService(accessToken, {
      title: 'Private audit',
      pricingType: 'fixed',
      priceUsdCents: 30_000,
      isPublic: false,
      sortOrder: 30,
    })
    const inactiveDraft = await createService(accessToken, {
      title: 'Inactive draft',
      pricingType: 'fixed',
      priceUsdCents: 40_000,
      isActive: false,
      isPublic: true,
      sortOrder: 35,
    })
    const formula = await createService(accessToken, {
      title: 'Future formula',
      pricingType: 'formula',
      priceUsdCents: 0,
      pricingRule: { kind: 'future' },
      formulaVersion: 'future-v1',
      sortOrder: 40,
    })
    const formulaConversion = await app.request(`/api/admin/services/${formula.id}`, {
      method: 'PATCH',
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({
        pricingType: 'fixed',
        priceUsdCents: 10_000,
      }),
    })
    const nonFormulaConversion = await app.request(`/api/admin/services/${first.id}`, {
      method: 'PATCH',
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({
        pricingType: 'formula',
        priceUsdCents: 0,
      }),
    })
    const archivedFormula = await patchService(accessToken, formula.id, {
      isActive: false,
    })

    expect(inactiveDraft.isActive).toBe(false)
    expect(inactiveDraft.isPublic).toBe(false)
    expect(formulaConversion.status).toBe(400)
    expect(nonFormulaConversion.status).toBe(400)
    expect(archivedFormula.isActive).toBe(false)
    expect(archivedFormula.isPublic).toBe(false)

    const edited = await patchService(accessToken, first.id, {
      title: 'Heating and warm floors',
      description: '',
      priceUsdCents: 275,
      pricingType: 'per_sqm',
      isPublic: false,
    })
    const invalidUpdate = await app.request(`/api/admin/services/${first.id}`, {
      method: 'PATCH',
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({
        priceUsdCents: 0,
      }),
    })
    const visibilityEnabled = await patchService(accessToken, first.id, {
      isPublic: true,
    })
    const archived = await patchService(accessToken, second.id, {
      isActive: false,
    })
    const attemptedRepublish = await patchService(accessToken, second.id, {
      isPublic: true,
    })

    expect(edited.title).toBe('Heating and warm floors')
    expect(edited.description).toBeNull()
    expect(edited.priceUsdCents).toBe(275)
    expect(edited.isPublic).toBe(false)
    expect(invalidUpdate.status).toBe(400)
    expect(visibilityEnabled.isPublic).toBe(true)
    expect(archived.isActive).toBe(false)
    expect(archived.isPublic).toBe(false)
    expect(attemptedRepublish.isActive).toBe(false)
    expect(attemptedRepublish.isPublic).toBe(false)

    const reorder = await app.request('/api/admin/services/reorder', {
      method: 'PATCH',
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({
        services: [
          { id: hidden.id, sortOrder: 1 },
          { id: first.id, sortOrder: 2 },
          { id: second.id, sortOrder: 3 },
        ],
      }),
    })
    const reorderBody = await reorder.json()
    const duplicateReorder = await app.request('/api/admin/services/reorder', {
      method: 'PATCH',
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({
        services: [
          { id: first.id, sortOrder: 1 },
          { id: first.id, sortOrder: 2 },
        ],
      }),
    })
    const missingReorder = await app.request('/api/admin/services/reorder', {
      method: 'PATCH',
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({
        services: [
          { id: '00000000-0000-7000-8000-000000000001', sortOrder: 1 },
        ],
      }),
    })

    expect(reorder.status).toBe(200)
    expect(reorderBody.services.map((service: { title: string }) => service.title)).toEqual([
      'Private audit',
      'Heating and warm floors',
      'Boiler room',
      'Inactive draft',
      'Future formula',
    ])
    expect(duplicateReorder.status).toBe(400)
    expect(missingReorder.status).toBe(404)

    const publicServices = await app.request('/api/public/services')
    const publicServicesBody = await publicServices.json()
    const adminServices = await app.request('/api/admin/services', {
      headers: authHeaders(accessToken),
    })
    const adminServicesBody = await adminServices.json()

    expect(publicServices.status).toBe(200)
    expect(publicServicesBody.services.map((service: { title: string }) => service.title)).toEqual([
      'Heating and warm floors',
    ])
    expect(adminServicesBody.services).toHaveLength(5)
  })

  test('keeps project examples public listing separate from admin records', async () => {
    const accessToken = await loginAdmin('examples@example.com')
    const publicExample = await createProjectExample(accessToken, {
      title: 'ОВ example',
      fileUrl: 'https://example.com/ov.pdf',
      sortOrder: 2,
    })
    await createProjectExample(accessToken, {
      title: 'Private draft',
      fileUrl: 'https://example.com/private.pdf',
      isPublic: false,
      sortOrder: 1,
    })

    const publicList = await app.request('/api/public/project-examples')
    const publicBody = await publicList.json()
    const adminList = await app.request('/api/admin/project-examples', {
      headers: authHeaders(accessToken),
    })
    const adminBody = await adminList.json()

    expect(publicList.status).toBe(200)
    expect(publicBody.examples).toEqual([
      {
        id: publicExample.id,
        title: 'ОВ example',
        description: null,
        coverImageUrl: null,
        sortOrder: 2,
      },
    ])
    expect(publicBody.examples[0]).not.toHaveProperty('fileUrl')
    expect(adminList.status).toBe(200)
    expect(adminBody.examples).toHaveLength(2)
  })

  test('saves lead-gated project example requests and serves PDFs only by request token', async () => {
    const accessToken = await loginAdmin('example-request-admin@example.com')
    const idempotencyKey = nextIdempotencyKey()
    const response = await saveProjectExampleRequest({
      idempotencyKey,
      clientName: '  Example Request Client  ',
      clientPhone: '8 029 111-22-33',
      requestedExampleSlugs: ['ov'],
      consentAccepted: true,
      source: 'example_request',
      referrer: 'https://website.example.com/#examples',
      utm: {
        utm_source: 'test',
      },
    })
    const body = await response.json()
    const replay = await saveProjectExampleRequest({
      idempotencyKey,
      clientName: '  Example Request Client  ',
      clientPhone: '8 029 111-22-33',
      requestedExampleSlugs: ['ov'],
      consentAccepted: true,
      source: 'example_request',
      referrer: 'https://website.example.com/#examples',
      utm: {
        utm_source: 'test',
      },
    })
    const replayBody = await replay.json()
    const saved = await prisma.projectExampleRequest.findUniqueOrThrow({
      where: { publicToken: body.request.publicToken },
    })
    const pdf = await app.request(body.request.requestedExamples[0].urlPath)
    const pdfBytes = new Uint8Array(await pdf.arrayBuffer())
    const wrongSlug = await app.request(
      `/api/public/project-example-requests/${body.request.publicToken}/examples/vk`,
    )
    const wrongToken = await app.request(
      `/api/public/project-example-requests/${'x'.repeat(32)}/examples/ov`,
    )
    const adminList = await app.request('/api/admin/project-example-requests', {
      headers: authHeaders(accessToken),
    })
    const adminBody = await adminList.json()

    expect(response.status).toBe(201)
    expect(replay.status).toBe(200)
    expect(replayBody.request.publicToken).toBe(body.request.publicToken)
    expect(body.request.clientPhone).toBe('+375291112233')
    expect(body.request.requestedExamples).toHaveLength(1)
    expect(body.request.telegramDelivery).toEqual({
      status: 'disabled',
      deepLinkUrl: null,
    })
    expect(body.request.requestedExamples[0]).toMatchObject({
      slug: 'ov',
      code: 'ОВ',
      fileName: 'proekt-primer-ov.pdf',
      urlPath: expect.stringMatching(
        /^\/api\/public\/project-example-requests\/[A-Za-z0-9_-]{32,128}\/examples\/ov$/,
      ),
    })
    expect(saved.clientName).toBe('Example Request Client')
    expect(saved.clientPhone).toBe('+375291112233')
    expect(saved.source).toBe('example_request')
    expect(saved.consentVersion).toBe('pzk-project-example-request-consent-v1')
    expect(saved.consentText).toBe(
      'Согласен на обработку имени и телефона для выдачи примеров проектов и связи по проектированию.',
    )
    expect(saved.requestFingerprintHash).toMatch(/^[a-f0-9]{64}$/)
    expect(pdf.status).toBe(200)
    expect(pdf.headers.get('cache-control')).toBe('private, max-age=0, no-store')
    expect(pdf.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(pdf.headers.get('content-type')).toContain('application/pdf')
    expect(pdf.headers.get('content-disposition')).toContain('proekt-primer-ov.pdf')
    expect(new TextDecoder().decode(pdfBytes.slice(0, 8))).toContain('%PDF-')
    expect(wrongSlug.status).toBe(404)
    expect(wrongToken.status).toBe(404)
    expect(adminList.status).toBe(200)
    expect(adminBody.summary.totalCount).toBe(1)
    expect(adminBody.requests[0].telegramDeliveries[0]).toMatchObject({
      targetType: 'project_examples',
      status: 'disabled',
      telegramChatId: null,
      attemptCount: 0,
    })
    expect(adminBody.requests[0]).toMatchObject({
      clientName: 'Example Request Client',
      clientPhone: '+375291112233',
      source: 'example_request',
      requestedExampleSlugs: ['ov'],
    })
  })

  test('sends project example links through Telegram after bot start and logs client delivery failures', async () => {
    const deliveries: Array<{ chatId: string; text: string }> = []
    const telegramEnv: AppEnv = {
      ...env,
      TELEGRAM_BOT_TOKEN: 'telegram-secret-token',
      TELEGRAM_BOT_USERNAME: '@PoznyakCalcBot',
      TELEGRAM_WEBHOOK_SECRET: 'webhook-secret',
      PUBLIC_API_URL: 'https://api.example.com',
    }
    const telegramApp = createApp({
      env: telegramEnv,
      prisma,
      proposalGenerator: createTestProposalGenerator(),
      telegramDocumentSender: recordingTelegramDocumentSender(deliveries),
    })
    const exampleIdempotencyKey = nextIdempotencyKey()

    const response = await saveProjectExampleRequestWithApp(telegramApp, {
      idempotencyKey: exampleIdempotencyKey,
      clientName: 'Example Telegram Client',
      clientPhone: '+375291112233',
      requestedExampleSlugs: ['ov', 'vk'],
      consentAccepted: true,
      source: 'example_request',
    })
    const body = await response.json()
    const replay = await saveProjectExampleRequestWithApp(telegramApp, {
      idempotencyKey: exampleIdempotencyKey,
      clientName: 'Different Client',
      clientPhone: '+375291112233',
      requestedExampleSlugs: ['ov'],
      consentAccepted: true,
      source: 'example_request',
    })
    const bindToken = new URL(body.request.telegramDelivery.deepLinkUrl).searchParams.get('start')
    const webhook = await telegramApp.request('/api/public/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'webhook-secret',
      },
      body: JSON.stringify(telegramStartUpdate(bindToken ?? 'missing-token')),
    })
    const saved = await prisma.projectExampleRequest.findUniqueOrThrow({
      where: { publicToken: body.request.publicToken },
      include: { telegramDeliveries: true },
    })

    const failedDeliveries: Array<{ chatId: string; text: string }> = []
    const failureApp = createApp({
      env: telegramEnv,
      prisma,
      proposalGenerator: createTestProposalGenerator(),
      telegramDocumentSender: failingTelegramDocumentSender(failedDeliveries),
    })
    const failureResponse = await saveProjectExampleRequestWithApp(failureApp, {
      idempotencyKey: nextIdempotencyKey(),
      clientName: 'Failure Example Telegram Client',
      clientPhone: '+375291112234',
      requestedExampleSlugs: ['ov'],
      consentAccepted: true,
      source: 'example_request',
    })
    const failureBody = await failureResponse.json()
    const failureBindToken = new URL(
      failureBody.request.telegramDelivery.deepLinkUrl,
    ).searchParams.get('start')
    const failureWebhook = await failureApp.request('/api/public/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'webhook-secret',
      },
      body: JSON.stringify(telegramStartUpdate(failureBindToken ?? 'missing-token')),
    })
    const failedSaved = await prisma.projectExampleRequest.findUniqueOrThrow({
      where: { publicToken: failureBody.request.publicToken },
      include: { telegramDeliveries: true },
    })

    expect(response.status).toBe(201)
    expect(replay.status).toBe(409)
    expect(body.request.telegramDelivery).toMatchObject({
      status: 'pending_start',
      deepLinkUrl: expect.stringMatching(/^https:\/\/t\.me\/PoznyakCalcBot\?start=[A-Za-z0-9_-]{32,128}$/),
    })
    expect(webhook.status).toBe(200)
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0].text).toContain('Примеры проектов ИП Позняк готовы')
    expect(deliveries[0].text).toContain(
      `https://api.example.com/api/public/project-example-requests/${body.request.publicToken}/examples/ov`,
    )
    expect(deliveries[0].text).toContain(
      `https://api.example.com/api/public/project-example-requests/${body.request.publicToken}/examples/vk`,
    )
    expect(deliveries[0].text).not.toContain('telegram-secret-token')
    expect(saved.telegramDeliveries[0]).toMatchObject({
      targetType: 'project_examples',
      status: 'sent',
      telegramChatId: '123456789',
      telegramUserId: '777000',
      attemptCount: 1,
    })
    expect(failureResponse.status).toBe(201)
    expect(failureWebhook.status).toBe(200)
    expect(failedDeliveries).toHaveLength(1)
    expect(failedSaved.telegramDeliveries[0]).toMatchObject({
      targetType: 'project_examples',
      status: 'failed',
      telegramChatId: '123456789',
      attemptCount: 1,
    })
    expect(failedSaved.telegramDeliveries[0].statusMessage).toBe(
      'request to https://api.telegram.org/bot<redacted>/sendMessage failed',
    )
    expect(failedSaved.telegramDeliveries[0].statusMessage).not.toContain('telegram-secret-token')
  })

  test('snapshots public project example proof cards into generated proposals without direct PDF links', async () => {
    const accessToken = await loginAdmin('proposal-examples@example.com')
    await setExchangeRate(accessToken, '3.0000')
    const service = await createService(accessToken, {
      title: 'Example snapshot service',
      pricingType: 'fixed',
      priceUsdCents: 10_000,
    })
    const publicExample = await createProjectExample(accessToken, {
      title: 'Approved OV project example',
      description: 'Published CDN PDF for proposal snapshots.',
      fileUrl: 'https://cdn.example.com/project-examples/approved-ov.pdf',
      sortOrder: 1,
    })
    await createProjectExample(accessToken, {
      title: 'Private draft example',
      fileUrl: 'https://cdn.example.com/project-examples/private-draft.pdf',
      isPublic: false,
      sortOrder: 2,
    })

    const response = await saveCalculation({
      clientName: 'Proposal Examples Client',
      clientPhone: '+375291112233',
      calculation: {
        areaSqm: '10',
        selectedServiceIds: [service.id],
      },
      consentAccepted: true,
    })
    const body = await response.json()
    const proposalToken = body.calculation.proposal.publicToken
    const proposalBeforeEdit = await app.request(`/api/public/proposals/${proposalToken}`)
    const htmlBeforeEdit = await proposalBeforeEdit.text()

    await patchProjectExample(accessToken, publicExample.id, {
      title: 'Changed OV project example',
      fileUrl: 'https://cdn.example.com/project-examples/changed-ov.pdf',
    })

    const proposalAfterEdit = await app.request(`/api/public/proposals/${proposalToken}`)
    const htmlAfterEdit = await proposalAfterEdit.text()

    expect(response.status).toBe(201)
    expect(proposalBeforeEdit.status).toBe(200)
    expect(htmlBeforeEdit).toContain('Approved OV project example')
    expect(htmlBeforeEdit).not.toContain('https://cdn.example.com/project-examples/approved-ov.pdf')
    expect(htmlBeforeEdit).toContain('Открыть раздел с примерами')
    expect(htmlBeforeEdit).not.toContain('Private draft example')
    expect(htmlBeforeEdit).not.toContain('proekt-primer-ov.pdf')
    expect(htmlAfterEdit).toBe(htmlBeforeEdit)
    expect(htmlAfterEdit).not.toContain('changed-ov.pdf')
  })

  test('database migration constraints reject invalid statuses and incomplete proposal artifacts', async () => {
    const accessToken = await loginAdmin('constraints@example.com')
    await setExchangeRate(accessToken, '3.0000')
    const service = await createService(accessToken, {
      title: 'Constraint service',
      pricingType: 'fixed',
      priceUsdCents: 10_000,
    })
    const response = await saveCalculation({
      clientName: 'Client',
      clientPhone: '+375291112233',
      calculation: {
        areaSqm: '10',
        selectedServiceIds: [service.id],
      },
      consentAccepted: true,
    })
    const body = await response.json()
    const saved = await prisma.calculation.findUniqueOrThrow({
      where: { publicToken: body.calculation.publicToken },
    })

    expect(response.status).toBe(201)
    await expectRejects(() =>
      prisma.$executeRawUnsafe(
        `UPDATE "calculations" SET "status" = 'bad_status' WHERE "id" = '${saved.id}'::uuid`,
      ),
    )
    await expectRejects(() =>
      prisma.$executeRawUnsafe(`
        INSERT INTO "proposals" ("calculation_id", "public_token", "offer_number", "template_version", "calculation_snapshot")
        SELECT "id", '${'p'.repeat(32)}', 'PZK-TEST', 'proposal-v1', "calculation_snapshot"
        FROM "calculations"
        WHERE "id" = '${saved.id}'::uuid
      `),
    )
    await expectRejects(() =>
      prisma.$executeRawUnsafe(`
        INSERT INTO "proposals" ("calculation_id", "public_token", "offer_number", "template_version", "html_snapshot", "calculation_snapshot")
        SELECT "id", 'short', 'PZK-TEST', 'proposal-v1', '<main>ok</main>', "calculation_snapshot"
        FROM "calculations"
        WHERE "id" = '${saved.id}'::uuid
      `),
    )
    await expectRejects(() =>
      prisma.$executeRawUnsafe(`
        INSERT INTO "proposals" ("calculation_id", "public_token", "offer_number", "template_version", "pdf_url", "storage_key", "checksum_sha256", "calculation_snapshot")
        SELECT "id", '${'q'.repeat(32)}', 'PZK-TEST', 'proposal-v1', 'https://example.com/proposal.pdf', 'proposals/test.pdf', 'bad-checksum', "calculation_snapshot"
        FROM "calculations"
        WHERE "id" = '${saved.id}'::uuid
      `),
    )
    await expectRejects(() =>
      prisma.$executeRawUnsafe(`
        INSERT INTO "proposals" ("calculation_id", "public_token", "offer_number", "template_version", "storage_key", "checksum_sha256", "pdf_bytes", "calculation_snapshot")
        SELECT "id", '${'r'.repeat(32)}', 'PZK-TEST', 'proposal-v1', 'proposals/test.pdf', '${'a'.repeat(64)}', decode('255044462d312e34', 'hex'), "calculation_snapshot"
        FROM "calculations"
        WHERE "id" = '${saved.id}'::uuid
      `),
    )
  })

  test('manages admin leads mini-crm list, detail, status, notes, filters, counts, and immutable proposal links', async () => {
    const accessToken = await loginAdmin('leads-admin@example.com')
    await setExchangeRate(accessToken, '3.0000')
    const heating = await createService(accessToken, {
      title: 'CRM heating drawings',
      pricingType: 'per_sqm',
      priceUsdCents: 250,
      sortOrder: 1,
    })
    const boiler = await createService(accessToken, {
      title: 'CRM boiler package',
      pricingType: 'fixed',
      priceUsdCents: 10_000,
      sortOrder: 2,
    })
    const firstResponse = await saveCalculation({
      clientName: 'CRM First Client',
      clientPhone: '+375 29 123-45-67',
      objectName: 'CRM house',
      calculation: {
        areaSqm: '42',
        selectedServiceIds: [heating.id, boiler.id],
      },
      consentAccepted: true,
    })
    const secondResponse = await saveCalculation({
      clientName: 'Spam Person',
      clientPhone: '+375 33 765-43-21',
      calculation: {
        areaSqm: '12',
        selectedServiceIds: [boiler.id],
      },
      consentAccepted: true,
    })
    const firstBody = await firstResponse.json()
    const secondBody = await secondResponse.json()
    const firstSaved = await prisma.calculation.findUniqueOrThrow({
      where: { publicToken: firstBody.calculation.publicToken },
      include: { proposals: true },
    })
    const secondSaved = await prisma.calculation.findUniqueOrThrow({
      where: { publicToken: secondBody.calculation.publicToken },
      include: { proposals: true },
    })
    const originalStatusUpdatedAt = new Date('2026-07-01T12:00:00.000Z')
    await prisma.calculation.update({
      where: { id: firstSaved.id },
      data: { statusUpdatedAt: originalStatusUpdatedAt },
    })

    const detail = await app.request(`/api/admin/calculations/${firstSaved.id}`, {
      headers: authHeaders(accessToken),
    })
    const detailBody = await detail.json()
    const invalidStatus = await app.request(`/api/admin/calculations/${firstSaved.id}`, {
      method: 'PATCH',
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({ status: 'bad_status' }),
    })
    const notesOnly = await patchCalculation(accessToken, firstSaved.id, {
      notes: '  Call after 18:00  ',
    })
    const contacted = await patchCalculation(accessToken, firstSaved.id, {
      status: 'contacted',
    })
    const sameStatus = await patchCalculation(accessToken, firstSaved.id, {
      status: 'contacted',
    })
    await patchCalculation(accessToken, secondSaved.id, {
      status: 'spam_test',
    })

    expect(firstResponse.status).toBe(201)
    expect(secondResponse.status).toBe(201)
    expect(detail.status).toBe(200)
    expect(detailBody.calculation.status).toBe('new')
    expect(detailBody.calculation.statusUpdatedAt).toBe(originalStatusUpdatedAt.toISOString())
    expect(detailBody.calculation.clientName).toBe('CRM First Client')
    expect(detailBody.calculation.exchangeRate.usdToBynRate).toBe('3')
    expect(detailBody.calculation.calculationSnapshot.lineItems).toHaveLength(2)
    expect(detailBody.calculation.serviceSnapshots.map((service: { title: string }) => service.title)).toEqual([
      'CRM heating drawings',
      'CRM boiler package',
    ])
    expect(detailBody.calculation.proposalArtifacts[0]).toMatchObject({
      publicToken: firstSaved.proposals[0].publicToken,
      offerNumber: firstSaved.proposals[0].offerNumber,
      status: 'ready',
      urlPath: `/api/public/proposals/${firstSaved.proposals[0].publicToken}`,
      pdfUrlPath: `/api/public/proposals/${firstSaved.proposals[0].publicToken}/pdf`,
      checksumSha256: firstSaved.proposals[0].checksumSha256,
    })
    expect(invalidStatus.status).toBe(400)
    expect(notesOnly.calculation.notes).toBe('Call after 18:00')
    expect(notesOnly.calculation.statusUpdatedAt).toBe(originalStatusUpdatedAt.toISOString())
    expect(contacted.calculation.status).toBe('contacted')
    expect(new Date(contacted.calculation.statusUpdatedAt).getTime()).toBeGreaterThan(
      originalStatusUpdatedAt.getTime(),
    )
    expect(sameStatus.calculation.statusUpdatedAt).toBe(contacted.calculation.statusUpdatedAt)

    const list = await app.request('/api/admin/calculations', {
      headers: authHeaders(accessToken),
    })
    const listBody = await list.json()
    const spamList = await app.request('/api/admin/calculations?status=spam_test', {
      headers: authHeaders(accessToken),
    })
    const spamListBody = await spamList.json()
    const phoneList = await app.request('/api/admin/calculations?phone=291234567', {
      headers: authHeaders(accessToken),
    })
    const phoneListBody = await phoneList.json()
    const nameList = await app.request('/api/admin/calculations?name=CRM%20First', {
      headers: authHeaders(accessToken),
    })
    const nameListBody = await nameList.json()
    const searchList = await app.request('/api/admin/calculations?search=Spam', {
      headers: authHeaders(accessToken),
    })
    const searchListBody = await searchList.json()
    const today = new Date().toISOString().slice(0, 10)
    const dateList = await app.request(`/api/admin/calculations?createdFrom=${today}&createdTo=${today}`, {
      headers: authHeaders(accessToken),
    })
    const dateListBody = await dateList.json()
    const invalidDateList = await app.request('/api/admin/calculations?createdFrom=2026-07-10&createdTo=2026-07-09', {
      headers: authHeaders(accessToken),
    })
    const impossibleDateList = await app.request('/api/admin/calculations?createdFrom=2026-02-31', {
      headers: authHeaders(accessToken),
    })
    const invalidCalendarDateList = await app.request('/api/admin/calculations?createdTo=2026-99-99', {
      headers: authHeaders(accessToken),
    })

    expect(list.status).toBe(200)
    expect(listBody.summary).toMatchObject({
      totalCount: 2,
      activeCount: 1,
      spamTestCount: 1,
      filteredCount: 2,
    })
    expect(listBody.summary.statusCounts).toMatchObject({
      contacted: 1,
      spam_test: 1,
    })
    expect(listBody.calculations).toHaveLength(2)
    expect(listBody.calculations[0].requestFingerprintHash).toBeUndefined()
    expect(listBody.calculations[0].consentIpAddress).toBeUndefined()
    expect(spamListBody.calculations.map((calculation: { id: string }) => calculation.id)).toEqual([
      secondSaved.id,
    ])
    expect(phoneListBody.calculations.map((calculation: { id: string }) => calculation.id)).toEqual([
      firstSaved.id,
    ])
    expect(nameListBody.calculations.map((calculation: { id: string }) => calculation.id)).toEqual([
      firstSaved.id,
    ])
    expect(searchListBody.calculations.map((calculation: { id: string }) => calculation.id)).toEqual([
      secondSaved.id,
    ])
    expect(dateListBody.summary.filteredCount).toBe(2)
    expect(invalidDateList.status).toBe(400)
    expect(impossibleDateList.status).toBe(400)
    expect(invalidCalendarDateList.status).toBe(400)

    const artifact = contacted.calculation.proposalArtifacts[0]
    const pdfBefore = await app.request(artifact.pdfUrlPath)
    const pdfBeforeBytes = new Uint8Array(await pdfBefore.arrayBuffer())
    await patchService(accessToken, heating.id, {
      title: 'Changed CRM heating drawings',
      priceUsdCents: 999_999,
    })
    const pdfAfter = await app.request(artifact.pdfUrlPath)
    const pdfAfterBytes = new Uint8Array(await pdfAfter.arrayBuffer())

    expect(pdfBefore.status).toBe(200)
    expect(pdfBefore.headers.get('x-proposal-checksum-sha256')).toBe(artifact.checksumSha256)
    expect(pdfAfter.status).toBe(200)
    expect(pdfAfterBytes).toEqual(pdfBeforeBytes)
  })

  test('creates detailed questionnaire leads, saves answers incrementally, and exposes admin draft TZ', async () => {
    const accessToken = await loginAdmin('questionnaire@example.com')
    await setExchangeRate(accessToken, '3.0000')
    const heating = await createService(accessToken, {
      title: 'Questionnaire heating drawings',
      pricingType: 'per_sqm',
      priceUsdCents: 250,
      sortOrder: 1,
    })
    const water = await createService(accessToken, {
      title: 'Questionnaire water drawings',
      pricingType: 'fixed',
      priceUsdCents: 12_000,
      sortOrder: 2,
    })
    const idempotencyKey = nextIdempotencyKey()
    const startPayload = {
      idempotencyKey,
      clientName: 'Detailed Client',
      clientPhone: '+375 29 111-22-33',
      objectName: 'Подробный опросник: дом 180 м2',
      calculation: {
        areaSqm: '180',
        selectedServiceIds: [heating.id, water.id],
      },
      consentAccepted: true,
      source: 'public_questionnaire',
      initialAnswers: [
        {
          questionId: 'interior_finished',
          kind: 'option',
          optionId: 'no',
        },
        {
          questionId: 'wall_materials',
          kind: 'custom',
          customText: 'Газосиликат, утепление уточнить',
        },
      ],
    }

    const start = await app.request('/api/public/questionnaires', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'pzk-questionnaire-test',
        'X-Forwarded-For': '203.0.113.20',
      },
      body: JSON.stringify(startPayload),
    })
    const startBody = await start.json()
    const replay = await app.request('/api/public/questionnaires', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'pzk-questionnaire-test',
        'X-Forwarded-For': '203.0.113.20',
      },
      body: JSON.stringify(startPayload),
    })
    const replayBody = await replay.json()
    const mismatch = await app.request('/api/public/questionnaires', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...startPayload,
        clientName: 'Different Client',
      }),
    })
    const token = startBody.questionnaire.publicToken
    const patch = await app.request(`/api/public/questionnaires/${token}/answers`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: [
          {
            questionId: 'roof_materials',
            kind: 'unknown',
          },
          {
            questionId: 'fireplace',
            kind: 'skipped',
          },
        ],
      }),
    })
    const patchBody = await patch.json()
    const looseDuplicate = await app.request('/api/public/questionnaires', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'pzk-questionnaire-test-duplicate',
        'X-Forwarded-For': '203.0.113.21',
      },
      body: JSON.stringify({
        ...startPayload,
        idempotencyKey: nextIdempotencyKey(),
        clientName: 'Another Detailed Client',
        initialAnswers: undefined,
      }),
    })
    const looseDuplicateText = await looseDuplicate.text()
    const resume = await app.request(`/api/public/questionnaires/${token}`)
    const resumeBody = await resume.json()
    const saved = await prisma.calculation.findUniqueOrThrow({
      where: { publicToken: token },
      include: { proposals: true, questionnaire: true },
    })
    const adminDetail = await app.request(`/api/admin/calculations/${saved.id}`, {
      headers: authHeaders(accessToken),
    })
    const adminDetailBody = await adminDetail.json()
    const list = await app.request('/api/admin/calculations', {
      headers: authHeaders(accessToken),
    })
    const listBody = await list.json()

    expect(start.status).toBe(201)
    expect(start.headers.get('cache-control')).toBe('private, max-age=0, no-store')
    expect(start.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(startBody.questionnaire.publicToken).toMatch(/^[A-Za-z0-9_-]{32,128}$/)
    expect(startBody.questionnaire.clientName).toBeUndefined()
    expect(startBody.questionnaire.clientPhone).toBeUndefined()
    expect(startBody.questionnaire.calculation.serviceTitles).toEqual([
      'Questionnaire heating drawings',
      'Questionnaire water drawings',
    ])
    expect(startBody.questionnaire.progress).toMatchObject({
      totalQuestions: 91,
      answeredCount: 2,
      customCount: 1,
      optionCount: 1,
      unknownCount: 0,
      skippedCount: 0,
    })
    expect(startBody.questionnaire.answers).toHaveLength(2)
    expect(replay.status).toBe(200)
    expect(replayBody.questionnaire.publicToken).toBe(token)
    expect(mismatch.status).toBe(409)
    expect(patch.status).toBe(200)
    expect(patchBody.questionnaire.progress).toMatchObject({
      answeredCount: 4,
      unknownCount: 1,
      skippedCount: 1,
    })
    expect(looseDuplicate.status).toBe(409)
    expect(JSON.parse(looseDuplicateText).questionnaire).toBeUndefined()
    expect(looseDuplicateText).not.toContain(token)
    expect(looseDuplicateText).not.toContain('Газосиликат, утепление уточнить')
    expect(resume.status).toBe(200)
    expect(resume.headers.get('cache-control')).toBe('private, max-age=0, no-store')
    expect(resume.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(resumeBody.questionnaire.answers.map((answer: { questionId: string }) => answer.questionId)).toEqual([
      'wall_materials',
      'roof_materials',
      'interior_finished',
      'fireplace',
    ])
    expect(saved.source).toBe('public_questionnaire')
    expect(saved.consentVersion).toBe('pzk-questionnaire-consent-v1')
    expect(saved.proposals).toHaveLength(0)
    expect(saved.questionnaire?.answersSnapshot).toBeTruthy()
    expect(await prisma.proposal.count()).toBe(0)
    expect(adminDetail.status).toBe(200)
    expect(adminDetailBody.calculation.proposalArtifacts).toEqual([])
    expect(adminDetailBody.calculation.questionnaire.progress).toMatchObject({
      answeredCount: 4,
      totalQuestions: 91,
      unknownCount: 1,
      skippedCount: 1,
    })
    expect(adminDetailBody.calculation.questionnaire.sections[1].title).toBe('Общая информация о доме')
    const wallMaterials = adminDetailBody.calculation.questionnaire.sections[1].questions.find(
      (question: { id: string }) => question.id === 'wall_materials',
    )
    const interiorFinished = adminDetailBody.calculation.questionnaire.sections[1].questions.find(
      (question: { id: string }) => question.id === 'interior_finished',
    )
    expect(wallMaterials.answer).toMatchObject({
      kind: 'custom',
      label: 'Газосиликат, утепление уточнить',
    })
    expect(interiorFinished.answer).toMatchObject({
      kind: 'option',
      optionId: 'no',
      label: 'нет',
    })
    expect(listBody.calculations[0].questionnaire).toMatchObject({
      answeredCount: 4,
      totalQuestions: 91,
      unknownCount: 1,
      skippedCount: 1,
    })
  })

  test('rate limits repeated public calculation submissions by client bucket', async () => {
    const accessToken = await loginAdmin('rate-limit@example.com')
    await setExchangeRate(accessToken, '3.0000')
    const service = await createService(accessToken, {
      title: 'Rate limited service',
      pricingType: 'fixed',
      priceUsdCents: 10_000,
    })
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': `pzk-rate-limit-test-${Date.now()}`,
    }
    let latestStatus = 0

    for (let index = 0; index < 21; index += 1) {
      const response = await app.request('/api/public/calculations', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          idempotencyKey: nextIdempotencyKey(),
          clientName: 'Rate Limit Client',
          clientPhone: '+375291112233',
          calculation: {
            areaSqm: '10',
            selectedServiceIds: [service.id],
          },
          consentAccepted: true,
        }),
      })
      latestStatus = response.status
    }

    expect(latestStatus).toBe(429)
    expect(await prisma.calculation.count()).toBe(1)
  })

  async function loginAdmin(email = 'admin@example.com') {
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword('password123'),
        role: 'admin',
      },
    })

    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Platform': 'mobile',
      },
      body: JSON.stringify({
        email,
        password: 'password123',
      }),
    })
    const body = await login.json()

    expect(login.status).toBe(200)
    return body.accessToken as string
  }

  async function setExchangeRate(accessToken: string, usdToBynRate: string) {
    const response = await app.request('/api/admin/settings/exchange-rate', {
      method: 'POST',
      headers: {
        ...authHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: 'manual',
        usdToBynRate,
        asOf: '2026-07-08T00:00:00.000Z',
      }),
    })

    expect(response.status).toBe(200)
  }

  async function createService(accessToken: string, payload: Record<string, unknown>) {
    const response = await app.request('/api/admin/services', {
      method: 'POST',
      headers: {
        ...authHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    return body.service
  }

  async function patchService(accessToken: string, id: string, payload: Record<string, unknown>) {
    const response = await app.request(`/api/admin/services/${id}`, {
      method: 'PATCH',
      headers: {
        ...authHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    return body.service
  }

  async function patchCalculation(accessToken: string, id: string, payload: Record<string, unknown>) {
    const response = await app.request(`/api/admin/calculations/${id}`, {
      method: 'PATCH',
      headers: {
        ...authHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    return body
  }

  async function createProjectExample(accessToken: string, payload: Record<string, unknown>) {
    const response = await app.request('/api/admin/project-examples', {
      method: 'POST',
      headers: {
        ...authHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    return body.example
  }

  async function patchProjectExample(accessToken: string, id: string, payload: Record<string, unknown>) {
    const response = await app.request(`/api/admin/project-examples/${id}`, {
      method: 'PATCH',
      headers: {
        ...authHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    return body.example
  }

  function saveCalculation(payload: Record<string, unknown>) {
    return saveCalculationWithApp(app, payload)
  }

  function saveProjectExampleRequest(payload: Record<string, unknown>) {
    return saveProjectExampleRequestWithApp(app, payload)
  }

  function saveProjectExampleRequestWithApp(targetApp: typeof app, payload: Record<string, unknown>) {
    return targetApp.request('/api/public/project-example-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: nextIdempotencyKey(),
        ...payload,
      }),
    })
  }

  function saveCalculationWithApp(targetApp: typeof app, payload: Record<string, unknown>) {
    return targetApp.request('/api/public/calculations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: nextIdempotencyKey(),
        ...payload,
      }),
    })
  }

  function nextIdempotencyKey() {
    idempotencySequence += 1
    return `test-idempotency-${Date.now().toString(36)}-${idempotencySequence}`
  }
})

function recordingTelegramDocumentSender(
  deliveries: Array<{ chatId: string; text: string }>,
  delayMs = 0,
): TelegramDocumentSender {
  return {
    isConfigured: () => true,
    sendDocumentDelivery: async (input) => {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
      deliveries.push(input)
      return { status: 'sent' }
    },
  }
}

function failingTelegramDocumentSender(
  deliveries: Array<{ chatId: string; text: string }>,
): TelegramDocumentSender {
  return {
    isConfigured: () => true,
    sendDocumentDelivery: async (input) => {
      deliveries.push(input)
      throw new Error('request to https://api.telegram.org/bottelegram-secret-token/sendMessage failed')
    },
  }
}

function telegramStartUpdate(bindToken: string, chatType: 'private' | 'group' = 'private') {
  return {
    update_id: 1000,
    message: {
      message_id: 1,
      text: `/start ${bindToken}`,
      chat: {
        id: 123456789,
        type: chatType,
      },
      from: {
        id: 777000,
        is_bot: false,
        first_name: 'Client',
        username: 'clientuser',
      },
    },
  }
}

function authHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
  }
}

function jsonAuthHeaders(accessToken: string) {
  return {
    ...authHeaders(accessToken),
    'Content-Type': 'application/json',
  }
}

function sha256Hex(value: Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}

function createTestProposalGenerator(): ProposalGenerator {
  return {
    generate: (input: CommercialProposalInput) =>
      createCommercialProposalArtifact(input, async (html) => {
        const pdfSource = [
          '%PDF-1.4',
          '% PZK integration fixture',
          `1 0 obj << /Type /Catalog >> endobj`,
          `2 0 obj << /Producer (${input.offerNumber}) >> endobj`,
          html,
          '%%EOF',
        ].join('\n')

        return new TextEncoder().encode(pdfSource)
      }),
  }
}

async function expectRejects(action: () => Promise<unknown>) {
  let didReject = false
  try {
    await action()
  } catch {
    didReject = true
  }

  expect(didReject).toBe(true)
}
