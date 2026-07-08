import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../app'
import { createPrisma } from '../db'
import type { AppEnv } from '../env'

const databaseUrl = process.env.TEST_DATABASE_URL

const maybeDescribe = databaseUrl ? describe : describe.skip

maybeDescribe('engineering API integration', () => {
  const env: AppEnv = {
    PORT: 3000,
    DATABASE_URL: databaseUrl!,
    JWT_SECRET: '12345678901234567890123456789012',
    CORS_ORIGINS: ['http://localhost:5173'],
    ACCESS_TOKEN_TTL_SECONDS: 60,
    REFRESH_TOKEN_TTL_DAYS: 30,
    COOKIE_SECURE: false,
    SPACES_UPLOAD_MAX_BYTES: 10 * 1024 * 1024,
    SPACES_UPLOAD_URL_TTL_SECONDS: 900,
    SPACES_DOWNLOAD_URL_TTL_SECONDS: 300,
    SPACES_PUBLIC_CACHE_CONTROL: 'public, max-age=31536000, immutable',
  }
  const prisma = createPrisma(databaseUrl!)
  const app = createApp({ env, prisma })

  beforeEach(async () => {
    await prisma.proposal.deleteMany()
    await prisma.calculation.deleteMany()
    await prisma.projectExample.deleteMany()
    await prisma.service.deleteMany()
    await prisma.appSetting.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('saves a normal fixed and per-square-meter calculation using backend totals only', async () => {
    const accessToken = await registerAdmin()
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

    const response = await app.request('/api/public/calculations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
    expect(body.calculation.clientName).toBe('Анна Клиент')
    expect(body.calculation.status).toBe('new')
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

    const saved = await prisma.calculation.findUniqueOrThrow({
      where: { id: body.calculation.id },
    })
    expect(saved.totalBynCents).toBe(37_500n)
    expect(saved.publicToken).toMatch(/^[A-Za-z0-9_-]{32,128}$/)

    await patchService(accessToken, fixedService.id, {
      title: 'Changed boiler price',
      priceUsdCents: 99_999,
      isActive: false,
    })
    await setExchangeRate(accessToken, '4.0000')

    const snapshotResponse = await app.request(`/api/admin/calculations/${body.calculation.id}`, {
      headers: authHeaders(accessToken),
    })
    const snapshotBody = await snapshotResponse.json()

    expect(snapshotResponse.status).toBe(200)
    expect(snapshotBody.calculation.totalBynCents).toBe(37_500)
    expect(snapshotBody.calculation.exchangeRate.usdToBynRate).toBe('3')
    expect(snapshotBody.calculation.calculationSnapshot.lineItems[0].serviceSnapshot).toMatchObject({
      title: 'Boiler room fixed package',
      priceUsdCents: 10_000,
      isActive: true,
    })
  })

  test('rejects inactive, missing, and unsupported formula services before persistence', async () => {
    const accessToken = await registerAdmin('unavailable@example.com')
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

  test('requires auth for admin engineering routes', async () => {
    const response = await app.request('/api/admin/services')
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  test('keeps project examples public listing separate from admin records', async () => {
    const accessToken = await registerAdmin('examples@example.com')
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
    const accessToken = await registerAdmin('constraints@example.com')
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

    expect(response.status).toBe(201)
    await expectRejects(() =>
      prisma.$executeRawUnsafe(
        `UPDATE "calculations" SET "status" = 'bad_status' WHERE "id" = '${body.calculation.id}'::uuid`,
      ),
    )
    await expectRejects(() =>
      prisma.$executeRawUnsafe(`
        INSERT INTO "proposals" ("calculation_id", "public_token", "offer_number", "template_version", "calculation_snapshot")
        SELECT "id", '${'p'.repeat(32)}', 'PZK-TEST', 'proposal-v1', "calculation_snapshot"
        FROM "calculations"
        WHERE "id" = '${body.calculation.id}'::uuid
      `),
    )
    await expectRejects(() =>
      prisma.$executeRawUnsafe(`
        INSERT INTO "proposals" ("calculation_id", "public_token", "offer_number", "template_version", "html_snapshot", "calculation_snapshot")
        SELECT "id", 'short', 'PZK-TEST', 'proposal-v1', '<main>ok</main>', "calculation_snapshot"
        FROM "calculations"
        WHERE "id" = '${body.calculation.id}'::uuid
      `),
    )
    await expectRejects(() =>
      prisma.$executeRawUnsafe(`
        INSERT INTO "proposals" ("calculation_id", "public_token", "offer_number", "template_version", "pdf_url", "storage_key", "checksum_sha256", "calculation_snapshot")
        SELECT "id", '${'q'.repeat(32)}', 'PZK-TEST', 'proposal-v1', 'https://example.com/proposal.pdf', 'proposals/test.pdf', 'bad-checksum', "calculation_snapshot"
        FROM "calculations"
        WHERE "id" = '${body.calculation.id}'::uuid
      `),
    )
  })

  async function registerAdmin(email = 'admin@example.com') {
    const register = await app.request('/api/auth/register', {
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
    const body = await register.json()

    expect(register.status).toBe(201)
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
      body: JSON.stringify(payload),
    })
  }
})

function authHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
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
