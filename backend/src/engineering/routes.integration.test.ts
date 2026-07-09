import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'

import { createApp } from '../app'
import { hashPassword } from '../auth/passwords'
import { createPrisma } from '../db'
import type { AppEnv } from '../env'
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
  }
  const prisma = createPrisma(databaseUrl!)
  const app = createApp({ env, prisma, proposalGenerator: createTestProposalGenerator() })
  let idempotencySequence = 0

  beforeEach(async () => {
    await prisma.proposal.deleteMany()
    await prisma.calculation.deleteMany()
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

  test('rejects inactive, missing, and unsupported formula services before persistence', async () => {
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
    expect(inactiveBody.error.details[0]).toMatchObject({
      serviceId: inactiveService.id,
      reason: 'inactive',
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

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHORIZED')
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
    expect(publicBody.examples).toEqual([publicExample])
    expect(adminList.status).toBe(200)
    expect(adminBody.examples).toHaveLength(2)
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

    expect(response.status).toBe(200)
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

  function saveCalculation(payload: Record<string, unknown>) {
    return app.request('/api/public/calculations', {
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

function authHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
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
