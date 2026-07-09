import {
  apiErrorSchema,
  calculationSaveRequestSchema,
  calculationSaveResponseSchema,
  exchangeRateSettingRequestSchema,
  exchangeRateSettingResponseSchema,
  projectExampleCreateRequestSchema,
  projectExampleListResponseSchema,
  projectExampleResponseSchema,
  projectExampleUpdateRequestSchema,
  publicCalculatorConfigResponseSchema,
  publicCalculationSaveResponseSchema,
  serviceCreateRequestSchema,
  serviceListResponseSchema,
  serviceResponseSchema,
  serviceUpdateRequestSchema,
} from '@poznyak-engineering-calculator/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'

import { requireAuth } from '../auth/middleware'
import type { AppHonoEnv, AuthenticatedHonoEnv } from '../http/context'
import { AppError, validationErrorHook } from '../http/errors'

const errorResponseContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const idParamsSchema = z.object({
  id: z.string().uuid(),
})

const publicTokenParamsSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
})

const publicServicesRoute = createRoute({
  method: 'get',
  path: '/public/services',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: serviceListResponseSchema,
        },
      },
      description: 'Public active engineering services',
    },
  },
})

const publicCalculatorConfigRoute = createRoute({
  method: 'get',
  path: '/public/calculator-config',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: publicCalculatorConfigResponseSchema,
        },
      },
      description: 'Public calculator services and current exchange-rate snapshot',
    },
    409: {
      content: errorResponseContent,
      description: 'Exchange rate is not configured',
    },
  },
})

const publicProjectExamplesRoute = createRoute({
  method: 'get',
  path: '/public/project-examples',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: projectExampleListResponseSchema,
        },
      },
      description: 'Public project examples',
    },
  },
})

const saveCalculationRoute = createRoute({
  method: 'post',
  path: '/public/calculations',
  request: {
    body: {
      content: {
        'application/json': {
          schema: calculationSaveRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: publicCalculationSaveResponseSchema,
        },
      },
      description: 'Existing calculation returned for idempotent or duplicate public submission',
    },
    201: {
      content: {
        'application/json': {
          schema: publicCalculationSaveResponseSchema,
        },
      },
      description: 'Saved recalculated public calculation',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    409: {
      content: errorResponseContent,
      description: 'Exchange rate missing or selected service unavailable',
    },
    429: {
      content: errorResponseContent,
      description: 'Too many public calculation submissions',
    },
  },
})

const publicProposalRoute = createRoute({
  method: 'get',
  path: '/public/proposals/{token}',
  request: {
    params: publicTokenParamsSchema,
  },
  responses: {
    200: {
      content: {
        'text/html': {
          schema: z.string(),
        },
      },
      description: 'Token-protected pending public proposal page',
    },
    404: {
      content: errorResponseContent,
      description: 'Proposal not found',
    },
  },
})

const adminServicesRoute = createRoute({
  method: 'get',
  path: '/admin/services',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: serviceListResponseSchema,
        },
      },
      description: 'All engineering services',
    },
    401: {
      content: errorResponseContent,
      description: 'Unauthorized',
    },
  },
})

const createServiceRoute = createRoute({
  method: 'post',
  path: '/admin/services',
  request: {
    body: {
      content: {
        'application/json': {
          schema: serviceCreateRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: serviceResponseSchema,
        },
      },
      description: 'Created engineering service',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    401: {
      content: errorResponseContent,
      description: 'Unauthorized',
    },
  },
})

const updateServiceRoute = createRoute({
  method: 'patch',
  path: '/admin/services/{id}',
  request: {
    params: idParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: serviceUpdateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: serviceResponseSchema,
        },
      },
      description: 'Updated engineering service',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    401: {
      content: errorResponseContent,
      description: 'Unauthorized',
    },
    404: {
      content: errorResponseContent,
      description: 'Service not found',
    },
  },
})

const getCalculationRoute = createRoute({
  method: 'get',
  path: '/admin/calculations/{id}',
  request: {
    params: idParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: calculationSaveResponseSchema,
        },
      },
      description: 'Saved calculation with immutable snapshots',
    },
    401: {
      content: errorResponseContent,
      description: 'Unauthorized',
    },
    404: {
      content: errorResponseContent,
      description: 'Calculation not found',
    },
  },
})

const getExchangeRateRoute = createRoute({
  method: 'get',
  path: '/admin/settings/exchange-rate',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: exchangeRateSettingResponseSchema,
        },
      },
      description: 'Current USD/BYN exchange-rate setting',
    },
    401: {
      content: errorResponseContent,
      description: 'Unauthorized',
    },
    409: {
      content: errorResponseContent,
      description: 'Exchange rate is not configured',
    },
  },
})

const setExchangeRateRoute = createRoute({
  method: 'post',
  path: '/admin/settings/exchange-rate',
  request: {
    body: {
      content: {
        'application/json': {
          schema: exchangeRateSettingRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: exchangeRateSettingResponseSchema,
        },
      },
      description: 'Updated USD/BYN exchange-rate setting',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    401: {
      content: errorResponseContent,
      description: 'Unauthorized',
    },
  },
})

const adminProjectExamplesRoute = createRoute({
  method: 'get',
  path: '/admin/project-examples',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: projectExampleListResponseSchema,
        },
      },
      description: 'All project examples',
    },
    401: {
      content: errorResponseContent,
      description: 'Unauthorized',
    },
  },
})

const createProjectExampleRoute = createRoute({
  method: 'post',
  path: '/admin/project-examples',
  request: {
    body: {
      content: {
        'application/json': {
          schema: projectExampleCreateRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: projectExampleResponseSchema,
        },
      },
      description: 'Created project example',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    401: {
      content: errorResponseContent,
      description: 'Unauthorized',
    },
  },
})

const updateProjectExampleRoute = createRoute({
  method: 'patch',
  path: '/admin/project-examples/{id}',
  request: {
    params: idParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: projectExampleUpdateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: projectExampleResponseSchema,
        },
      },
      description: 'Updated project example',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    401: {
      content: errorResponseContent,
      description: 'Unauthorized',
    },
    404: {
      content: errorResponseContent,
      description: 'Project example not found',
    },
  },
})

export function createEngineeringRoutes() {
  const routes = new OpenAPIHono<AppHonoEnv>({
    defaultHook: validationErrorHook,
  })
  const protectedRoutes = new OpenAPIHono<AuthenticatedHonoEnv>({
    defaultHook: validationErrorHook,
  })
  const enforcePublicSubmitRateLimit = createPublicSubmitRateLimiter()

  routes.openapi(publicServicesRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    return c.json({ services: await engineering.listPublicServices() }, 200)
  })

  routes.openapi(publicCalculatorConfigRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    const exchangeRateSetting = await engineering.getExchangeRate()

    return c.json(
      {
        services: await engineering.listPublicServices(),
        exchangeRate: exchangeRateSetting.exchangeRate,
        exchangeRateUpdatedAt: exchangeRateSetting.updatedAt,
      },
      200,
    )
  })

  routes.openapi(publicProjectExamplesRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    return c.json({ examples: await engineering.listPublicProjectExamples() }, 200)
  })

  routes.openapi(saveCalculationRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    const payload = c.req.valid('json')
    const metadata = {
      referrer: c.req.header('referer'),
      ipAddress: publicSubmitIpAddress(c),
      userAgent: c.req.header('user-agent'),
    }

    if (!(await engineering.isExactIdempotencyReplay(payload, metadata))) {
      enforcePublicSubmitRateLimit(c)
    }

    const result = await engineering.saveCalculation(payload, metadata)
    return c.json({ calculation: result.publicCalculation }, result.created ? 201 : 200)
  })

  routes.openapi(publicProposalRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    const html = await engineering.getPublicProposalHtml(c.req.valid('param').token)
    return c.html(html, 200)
  })

  protectedRoutes.use('/admin/*', requireAuth)

  protectedRoutes.openapi(adminServicesRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    return c.json({ services: await engineering.listAdminServices() }, 200)
  })

  protectedRoutes.openapi(createServiceRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    const service = await engineering.createService(c.req.valid('json'))
    return c.json({ service }, 201)
  })

  protectedRoutes.openapi(updateServiceRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    const service = await engineering.updateService(c.req.valid('param').id, c.req.valid('json'))
    return c.json({ service }, 200)
  })

  protectedRoutes.openapi(getCalculationRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    const calculation = await engineering.getCalculation(c.req.valid('param').id)
    return c.json({ calculation }, 200)
  })

  protectedRoutes.openapi(getExchangeRateRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    return c.json(await engineering.getExchangeRate(), 200)
  })

  protectedRoutes.openapi(setExchangeRateRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    return c.json(await engineering.setExchangeRate(c.req.valid('json')), 200)
  })

  protectedRoutes.openapi(adminProjectExamplesRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    return c.json({ examples: await engineering.listAdminProjectExamples() }, 200)
  })

  protectedRoutes.openapi(createProjectExampleRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    const example = await engineering.createProjectExample(c.req.valid('json'))
    return c.json({ example }, 201)
  })

  protectedRoutes.openapi(updateProjectExampleRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    const example = await engineering.updateProjectExample(c.req.valid('param').id, c.req.valid('json'))
    return c.json({ example }, 200)
  })

  routes.route('/', protectedRoutes)

  return routes
}

type RateLimitBucket = {
  count: number
  windowStartedAt: number
}

function createPublicSubmitRateLimiter() {
  const buckets = new Map<string, RateLimitBucket>()
  const windowMs = 10 * 60 * 1_000
  const maxSubmissionsPerWindow = 20
  const maxBuckets = 10_000

  return (c: { req: { header: (name: string) => string | undefined } }) => {
    const now = Date.now()
    cleanupRateLimitBuckets(buckets, now, windowMs, maxBuckets)
    const key = publicSubmitClientKey(c)
    const existing = buckets.get(key)
    const bucket =
      existing && now - existing.windowStartedAt < windowMs
        ? existing
        : { count: 0, windowStartedAt: now }

    bucket.count += 1
    buckets.set(key, bucket)

    if (bucket.count > maxSubmissionsPerWindow) {
      throw new AppError(429, 'RATE_LIMITED', 'Too many calculation submissions. Please try again later.')
    }
  }
}

function publicSubmitClientKey(c: { req: { header: (name: string) => string | undefined } }) {
  const ipAddress = publicSubmitIpAddress(c)
  const userAgent = c.req.header('user-agent')?.slice(0, 120) ?? 'unknown-agent'
  return `${ipAddress || 'anonymous'}:${userAgent}`
}

function publicSubmitIpAddress(c: { req: { header: (name: string) => string | undefined } }) {
  return (
    c.req.header('cf-connecting-ip')?.trim() ||
    c.req.header('x-real-ip')?.trim() ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    undefined
  )
}

function cleanupRateLimitBuckets(
  buckets: Map<string, RateLimitBucket>,
  now: number,
  windowMs: number,
  maxBuckets: number,
) {
  if (buckets.size <= maxBuckets) return

  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStartedAt >= windowMs) {
      buckets.delete(key)
    }
  }

  if (buckets.size <= maxBuckets) return

  const oldestKeys = [...buckets.entries()]
    .sort((first, second) => first[1].windowStartedAt - second[1].windowStartedAt)
    .slice(0, buckets.size - maxBuckets)

  for (const [key] of oldestKeys) {
    buckets.delete(key)
  }
}
