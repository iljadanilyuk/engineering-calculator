import { afterEach, expect, test } from 'bun:test'

import { ApiClient } from '../src/lib/api'
import { bootstrapAuthSession } from '../src/lib/bootstrap-auth'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('ApiClient refreshes and retries authenticated requests with the new access token', async () => {
  let accessToken: string | null = 'expired-access-token'
  const calls: Array<{ path: string; authorization: string | null }> = []

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    const path = new URL(url).pathname
    const headers = new Headers(init?.headers)
    calls.push({ path, authorization: headers.get('Authorization') })

    const meCallCount = calls.filter((call) => call.path === '/api/auth/me').length

    if (path === '/api/auth/me' && meCallCount === 1) {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Expired access token' } }, 401)
    }

    if (path === '/api/auth/refresh') {
      return json({ accessToken: 'fresh-access-token' }, 200)
    }

    if (path === '/api/auth/me') {
      return json(
        {
          user: {
            id: 'user_1',
            email: 'user@example.com',
            displayName: null,
            role: 'admin',
            createdAt: '2026-05-11T00:00:00.000Z',
          },
        },
        200,
      )
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => accessToken,
    setAccessToken: (nextAccessToken) => {
      accessToken = nextAccessToken
    },
  })

  const response = await client.me()
  const meCalls = calls.filter((call) => call.path === '/api/auth/me')

  expect(response.user.email).toBe('user@example.com')
  expect(meCalls).toHaveLength(2)
  expect(meCalls[0]?.authorization).toBe('Bearer expired-access-token')
  expect(meCalls[1]?.authorization).toBe('Bearer fresh-access-token')
})

test('ApiClient shares one refresh across concurrent unauthorized requests', async () => {
  let accessToken: string | null = 'expired-access-token'
  const calls: Array<{ path: string; authorization: string | null; credentials: RequestCredentials | undefined }> = []

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    const path = new URL(url).pathname
    const headers = new Headers(init?.headers)
    const authorization = headers.get('Authorization')
    calls.push({ path, authorization, credentials: init?.credentials })

    if (path === '/api/auth/refresh') {
      await new Promise((resolve) => setTimeout(resolve, 0))
      return json({ accessToken: 'fresh-access-token' }, 200)
    }

    if (path === '/api/auth/me' && authorization === 'Bearer fresh-access-token') {
      return json(
        {
          user: {
            id: 'user_1',
            email: 'user@example.com',
            displayName: null,
            role: 'admin',
            createdAt: '2026-05-11T00:00:00.000Z',
          },
        },
        200,
      )
    }

    if (path === '/api/auth/me') {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Expired access token' } }, 401)
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => accessToken,
    setAccessToken: (nextAccessToken) => {
      accessToken = nextAccessToken
    },
  })

  const [first, second] = await Promise.all([client.me(), client.me()])
  const refreshCalls = calls.filter((call) => call.path === '/api/auth/refresh')
  const meCalls = calls.filter((call) => call.path === '/api/auth/me')

  expect(first.user.email).toBe('user@example.com')
  expect(second.user.email).toBe('user@example.com')
  expect(refreshCalls).toHaveLength(1)
  expect(meCalls).toHaveLength(4)
  expect(meCalls.filter((call) => call.authorization === 'Bearer expired-access-token')).toHaveLength(2)
  expect(meCalls.filter((call) => call.authorization === 'Bearer fresh-access-token')).toHaveLength(2)
  expect(calls.every((call) => call.credentials === 'include')).toBe(true)
})

test('ApiClient clears session when refresh fails during an authenticated request', async () => {
  let accessToken: string | null = 'expired-access-token'
  let authExpiredCalls = 0
  const calls: Array<{ path: string; authorization: string | null }> = []

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    const path = new URL(url).pathname
    const headers = new Headers(init?.headers)
    calls.push({ path, authorization: headers.get('Authorization') })

    if (path === '/api/auth/me') {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Expired access token' } }, 401)
    }

    if (path === '/api/auth/refresh') {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } }, 401)
    }

    if (path === '/api/auth/logout') {
      return new Response(null, { status: 204 })
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => accessToken,
    setAccessToken: (nextAccessToken) => {
      accessToken = nextAccessToken
    },
    onAuthExpired: () => {
      authExpiredCalls += 1
    },
  })

  await expect(client.me()).rejects.toMatchObject({
    status: 401,
    code: 'UNAUTHORIZED',
  })

  expect(accessToken).toBeNull()
  expect(authExpiredCalls).toBe(1)
  expect(calls.map((call) => call.path)).toEqual([
    '/api/auth/me',
    '/api/auth/refresh',
    '/api/auth/logout',
  ])
})

test('ApiClient preserves backend error status, code, and message', async () => {
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname

    if (path === '/api/auth/login') {
      return json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid email or password',
          },
        },
        401,
      )
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => null,
    setAccessToken: () => undefined,
  })

  await expect(
    client.login({
      email: 'admin@example.com',
      password: 'wrong-password',
    }),
  ).rejects.toMatchObject({
    status: 401,
    code: 'UNAUTHORIZED',
    message: 'Invalid email or password',
  })
})

test('ApiClient sends authenticated service management requests', async () => {
  const calls: Array<{
    path: string
    method: string | undefined
    authorization: string | null
    body: unknown
  }> = []
  const service = serviceRecord({
    id: '00000000-0000-7000-8000-000000000001',
    title: 'Heating design',
    sortOrder: 10,
  })

  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname
    const headers = new Headers(init?.headers)
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
    calls.push({
      path,
      method: init?.method,
      authorization: headers.get('Authorization'),
      body: init?.body ? body : null,
    })

    if (path === '/api/admin/services' && init?.method === 'GET') {
      return json({ services: [service] }, 200)
    }

    if (path === '/api/admin/services' && init.method === 'POST') {
      return json({ service: serviceRecord({ ...body, id: service.id }) }, 201)
    }

    if (path === `/api/admin/services/${service.id}` && init.method === 'PATCH') {
      return json({ service: serviceRecord({ ...service, ...body }) }, 200)
    }

    if (path === '/api/admin/services/reorder' && init.method === 'PATCH') {
      const reorderBody = body as { services: Array<{ sortOrder: number }> }
      return json({ services: [serviceRecord({ ...service, sortOrder: reorderBody.services[0].sortOrder })] }, 200)
    }

    if (path === '/api/admin/settings/exchange-rate') {
      return json(
        {
          exchangeRate: {
            source: 'manual',
            usdToBynRate: '3.2000',
            asOf: '2026-07-09T00:00:00.000Z',
            usdToBynRateScale: 10000,
            usdToBynRateScaled: 32000,
          },
          updatedAt: '2026-07-09T00:00:00.000Z',
        },
        200,
      )
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => 'admin-access-token',
    setAccessToken: () => undefined,
  })

  await client.listServices()
  await client.createService({
    title: 'Heating design',
    pricingType: 'per_sqm',
    priceUsdCents: 250,
    isPublic: true,
    isActive: true,
    sortOrder: 10,
  })
  await client.updateService(service.id, {
    title: 'Heating and warm floors',
    priceUsdCents: 275,
  })
  await client.reorderServices({
    services: [{ id: service.id, sortOrder: 20 }],
  })
  await client.getExchangeRate()

  expect(calls.map((call) => [call.path, call.method ?? 'GET'])).toEqual([
    ['/api/admin/services', 'GET'],
    ['/api/admin/services', 'POST'],
    [`/api/admin/services/${service.id}`, 'PATCH'],
    ['/api/admin/services/reorder', 'PATCH'],
    ['/api/admin/settings/exchange-rate', 'GET'],
  ])
  expect(calls.every((call) => call.authorization === 'Bearer admin-access-token')).toBe(true)
  expect(calls[2]?.body).toMatchObject({
    title: 'Heating and warm floors',
    priceUsdCents: 275,
  })
})

test('ApiClient sends authenticated lead CRM requests', async () => {
  const calls: Array<{
    path: string
    method: string | undefined
    authorization: string | null
    body: unknown
  }> = []
  const lead = calculationRecord({
    id: '00000000-0000-7000-8000-000000000101',
    clientName: 'CRM Client',
    status: 'new',
  })

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null
    calls.push({
      path: `${url.pathname}${url.search}`,
      method: init?.method,
      authorization: headers.get('Authorization'),
      body,
    })

    if (url.pathname === '/api/admin/calculations' && init?.method === 'GET') {
      return json({
        calculations: [calculationListItem(lead)],
        summary: {
          totalCount: 1,
          activeCount: 1,
          spamTestCount: 0,
          filteredCount: 1,
          statusCounts: {
            new: 1,
            contacted: 0,
            in_progress: 0,
            won: 0,
            lost: 0,
            spam_test: 0,
          },
          limit: 25,
          offset: 0,
        },
      }, 200)
    }

    if (url.pathname === '/api/admin/project-example-requests' && init?.method === 'GET') {
      const token = 'e'.repeat(32)
      return json({
        requests: [{
          id: '00000000-0000-7000-8000-000000000401',
          publicToken: token,
          idempotencyKey: 'example-request-key-001',
          requestFingerprintHash: 'f'.repeat(64),
          clientName: 'Example Client',
          clientPhone: '+375291112233',
          requestedExampleSlugs: ['ov'],
          requestedExamples: [{
            slug: 'ov',
            code: 'ОВ',
            title: 'Example OV PDF',
            description: 'Example description',
            fileName: 'proekt-primer-ov.pdf',
            pageCount: 39,
            fileSizeBytes: 5_607_314,
            urlPath: `/api/public/project-example-requests/${token}/examples/ov`,
          }],
          source: 'example_request',
          referrer: null,
          utm: null,
          consentAcceptedAt: '2026-07-09T00:00:00.000Z',
          consentVersion: 'pzk-project-example-request-consent-v1',
          consentText: 'Consent',
          consentIpAddress: null,
          consentUserAgent: null,
          createdAt: '2026-07-09T00:00:00.000Z',
          updatedAt: '2026-07-09T00:00:00.000Z',
        }],
        summary: {
          totalCount: 1,
          limit: 25,
          offset: 0,
        },
      }, 200)
    }

    if (url.pathname === `/api/admin/calculations/${lead.id}` && init?.method === 'GET') {
      return json({ calculation: lead }, 200)
    }

    if (url.pathname === `/api/admin/calculations/${lead.id}` && init?.method === 'PATCH') {
      return json({
        calculation: calculationRecord({
          ...lead,
          ...body,
          statusUpdatedAt: '2026-07-09T01:00:00.000Z',
        }),
      }, 200)
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => 'admin-access-token',
    setAccessToken: () => undefined,
  })

  await client.listCalculations({
    status: 'new',
    search: 'CRM',
    limit: 25,
    offset: 0,
  })
  await client.listProjectExampleRequests({
    limit: 25,
    offset: 0,
  })
  await client.getCalculation(lead.id)
  await client.updateCalculation(lead.id, {
    status: 'contacted',
    notes: 'Call tomorrow',
  })

  const listUrl = new URL(`http://localhost${calls[0]?.path}`)
  expect(listUrl.pathname).toBe('/api/admin/calculations')
  expect(listUrl.searchParams.get('status')).toBe('new')
  expect(listUrl.searchParams.get('search')).toBe('CRM')
  expect(listUrl.searchParams.get('limit')).toBe('25')
  expect(calls.map((call) => [new URL(`http://localhost${call.path}`).pathname, call.method ?? 'GET'])).toEqual([
    ['/api/admin/calculations', 'GET'],
    ['/api/admin/project-example-requests', 'GET'],
    [`/api/admin/calculations/${lead.id}`, 'GET'],
    [`/api/admin/calculations/${lead.id}`, 'PATCH'],
  ])
  expect(calls.every((call) => call.authorization === 'Bearer admin-access-token')).toBe(true)
  expect(calls[3]?.body).toMatchObject({
    status: 'contacted',
    notes: 'Call tomorrow',
  })
})

test('ApiClient expireSession clears stale web session cookie through logout', async () => {
  let accessToken: string | null = 'stale-access-token'
  let authExpiredCalls = 0
  const calls: Array<{ path: string; method: string | undefined }> = []

  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname
    calls.push({ path, method: init?.method })

    if (path === '/api/auth/logout') {
      return new Response(null, { status: 204 })
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => accessToken,
    setAccessToken: (nextAccessToken) => {
      accessToken = nextAccessToken
    },
    onAuthExpired: () => {
      authExpiredCalls += 1
    },
  })

  await client.expireSession()

  expect(accessToken).toBeNull()
  expect(authExpiredCalls).toBe(1)
  expect(calls).toEqual([{ path: '/api/auth/logout', method: 'POST' }])
})

test('bootstrapAuthSession waits for stale-cookie cleanup before completing', async () => {
  const events: string[] = []
  let completed = false
  let finishCleanup!: () => void
  const cleanupFinished = new Promise<void>((resolve) => {
    finishCleanup = resolve
  })

  const bootstrap = bootstrapAuthSession({
    api: {
      refresh: async () => {
        events.push('refresh')
        throw new Error('Invalid refresh token')
      },
      expireSession: async () => {
        events.push('cleanup:start')
        await cleanupFinished
        events.push('cleanup:done')
      },
    },
    shouldApply: () => true,
    setAccessToken: () => {
      events.push('setAccessToken')
    },
  }).then(() => {
    completed = true
  })

  await waitForEvent(events, 'cleanup:start')

  expect(completed).toBe(false)
  expect(events).toEqual(['refresh', 'cleanup:start'])

  finishCleanup()
  await bootstrap

  expect(completed).toBe(true)
  expect(events).toEqual(['refresh', 'cleanup:start', 'cleanup:done'])
})

async function waitForEvent(events: string[], event: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (events.includes(event)) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  throw new Error(`Timed out waiting for event: ${event}`)
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function serviceRecord(overrides: Record<string, unknown>) {
  return {
    id: '00000000-0000-7000-8000-000000000001',
    title: 'Service',
    description: null,
    pricingType: 'fixed',
    priceUsdCents: 10_000,
    pricingRule: null,
    formulaVersion: null,
    isActive: true,
    isPublic: true,
    sortOrder: 0,
    createdAt: '2026-07-09T00:00:00.000Z',
    updatedAt: '2026-07-09T00:00:00.000Z',
    ...overrides,
  }
}

function calculationListItem(record: Record<string, unknown>) {
  return {
    id: record.id,
    clientName: record.clientName,
    clientPhone: record.clientPhone,
    objectName: record.objectName,
    areaSqm: record.areaSqm,
    serviceSnapshots: record.serviceSnapshots,
    totalUsdCents: record.totalUsdCents,
    totalBynCents: record.totalBynCents,
    totalBynRoundedRubles: record.totalBynRoundedRubles,
    status: record.status,
    statusUpdatedAt: record.statusUpdatedAt,
    notes: record.notes,
    source: record.source,
    proposalArtifacts: record.proposalArtifacts,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function calculationRecord(overrides: Record<string, unknown>) {
  const serviceId = '00000000-0000-7000-8000-000000000201'
  const serviceSnapshot = {
    id: serviceId,
    title: 'Heating design',
    description: null,
    pricingType: 'fixed',
    priceUsdCents: 10_000,
    isActive: true,
    sortOrder: 10,
    pricingRule: undefined,
    formulaVersion: undefined,
  }
  const exchangeRate = {
    source: 'manual',
    usdToBynRate: '3',
    asOf: '2026-07-09T00:00:00.000Z',
    usdToBynRateScale: 10000,
    usdToBynRateScaled: 30000,
  }
  const calculationSnapshot = {
    calculationVersion: 'pzk-calculation-v1',
    areaSqm: '10',
    areaSqmHundredths: 1_000,
    selectedServiceIds: [serviceId],
    billableServiceIds: [serviceId],
    lineItems: [{
      serviceId,
      serviceSnapshot,
      pricingType: 'fixed',
      quantity: { kind: 'fixed' },
      unitPriceUsdCents: 10_000,
      totalUsdCents: 10_000,
      totalBynCents: 30_000,
      totalBynRoundedRubles: 300,
    }],
    skippedServices: [],
    exchangeRate,
    totals: {
      totalUsdCents: 10_000,
      totalBynCents: 30_000,
      totalBynRoundedRubles: 300,
    },
    rounding: {
      usdLineRounding: 'half_up_to_cent',
      bynRateRounding: 'half_up_to_cent',
      bynTotalPolicy: 'sum_rounded_line_byn_cents',
      bynDisplayRounding: 'half_up_to_whole_ruble',
    },
  }

  return {
    id: '00000000-0000-7000-8000-000000000101',
    publicToken: 'a'.repeat(32),
    idempotencyKey: 'idempotency-key-001',
    requestFingerprintHash: 'b'.repeat(64),
    duplicateFingerprintHash: 'c'.repeat(64),
    duplicateWindowStartedAt: '2026-07-09T00:00:00.000Z',
    clientName: 'CRM Client',
    clientPhone: '+375291112233',
    objectName: null,
    areaSqm: '10',
    areaSqmHundredths: 1_000,
    selectedServiceIds: [serviceId],
    serviceSnapshots: [serviceSnapshot],
    skippedServices: [],
    exchangeRate,
    calculationVersion: 'pzk-calculation-v1',
    calculationSnapshot,
    totalUsdCents: 10_000,
    totalBynCents: 30_000,
    totalBynRoundedRubles: 300,
    status: 'new',
    statusUpdatedAt: '2026-07-09T00:00:00.000Z',
    notes: null,
    source: 'public_calculator',
    referrer: null,
    utm: null,
    consentAcceptedAt: '2026-07-09T00:00:00.000Z',
    consentVersion: 'pzk-public-lead-consent-v1',
    consentText: 'Consent',
    consentIpAddress: null,
    consentUserAgent: null,
    proposalArtifacts: [{
      id: '00000000-0000-7000-8000-000000000301',
      publicToken: 'p'.repeat(32),
      offerNumber: 'PZK-2026-TEST',
      templateVersion: 'commercial-proposal-v1',
      status: 'ready',
      urlPath: `/api/public/proposals/${'p'.repeat(32)}`,
      pdfUrlPath: `/api/public/proposals/${'p'.repeat(32)}/pdf`,
      pdfUrl: null,
      storageKey: 'proposals/test.pdf',
      checksumSha256: 'd'.repeat(64),
      pdfByteSize: 128,
      hasHtmlSnapshot: true,
      createdAt: '2026-07-09T00:00:00.000Z',
    }],
    createdAt: '2026-07-09T00:00:00.000Z',
    updatedAt: '2026-07-09T00:00:00.000Z',
    ...overrides,
  }
}
