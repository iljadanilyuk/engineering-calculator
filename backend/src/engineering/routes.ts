import {
  apiErrorSchema,
  calculationListQuerySchema,
  calculationListResponseSchema,
  calculationSaveRequestSchema,
  calculationSaveResponseSchema,
  calculationUpdateRequestSchema,
  exchangeRateSettingRequestSchema,
  exchangeRateSettingResponseSchema,
  projectExampleCreateRequestSchema,
  projectExampleListResponseSchema,
  projectExampleRequestCreateRequestSchema,
  projectExampleRequestListQuerySchema,
  projectExampleRequestListResponseSchema,
  projectExampleRequestSaveResponseSchema,
  projectExampleResponseSchema,
  projectExampleUpdateRequestSchema,
  publicQuestionnairePatchRequestSchema,
  publicQuestionnaireSessionResponseSchema,
  publicQuestionnaireStartRequestSchema,
  publicQuestionnaireStartResponseSchema,
  publicCalculatorConfigResponseSchema,
  publicCalculationSaveResponseSchema,
  publicProjectExampleListResponseSchema,
  serviceCreateRequestSchema,
  serviceListResponseSchema,
  serviceReorderRequestSchema,
  serviceResponseSchema,
  serviceUpdateRequestSchema,
} from '@poznyak-engineering-calculator/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'

import { requireAdmin } from '../auth/middleware'
import type { AppEnv } from '../env'
import type { AppHonoEnv, AuthenticatedHonoEnv } from '../http/context'
import { AppError, validationErrorHook } from '../http/errors'

const errorResponseContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const unauthorizedResponse = {
  content: errorResponseContent,
  description: 'Unauthorized',
}

const forbiddenResponse = {
  content: errorResponseContent,
  description: 'Admin access is required',
}

const idParamsSchema = z.object({
  id: z.string().uuid(),
})

const publicTokenParamsSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
})

const publicProjectExampleParamsSchema = publicTokenParamsSchema.extend({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
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
          schema: publicProjectExampleListResponseSchema,
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

const saveProjectExampleRequestRoute = createRoute({
  method: 'post',
  path: '/public/project-example-requests',
  request: {
    body: {
      content: {
        'application/json': {
          schema: projectExampleRequestCreateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: projectExampleRequestSaveResponseSchema,
        },
      },
      description: 'Existing project example request returned for idempotent public submission',
    },
    201: {
      content: {
        'application/json': {
          schema: projectExampleRequestSaveResponseSchema,
        },
      },
      description: 'Saved public project example request and returned tokenized delivery links',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    409: {
      content: errorResponseContent,
      description: 'Requested project example unavailable',
    },
    429: {
      content: errorResponseContent,
      description: 'Too many public project example requests',
    },
  },
})

const startQuestionnaireRoute = createRoute({
  method: 'post',
  path: '/public/questionnaires',
  request: {
    body: {
      content: {
        'application/json': {
          schema: publicQuestionnaireStartRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: publicQuestionnaireStartResponseSchema,
        },
      },
      description: 'Existing questionnaire returned for idempotent or duplicate public submission',
    },
    201: {
      content: {
        'application/json': {
          schema: publicQuestionnaireStartResponseSchema,
        },
      },
      description: 'Created questionnaire lead and returned resumable public session',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    409: {
      content: errorResponseContent,
      description: 'Exchange rate missing, selected service unavailable, or idempotency mismatch',
    },
    429: {
      content: errorResponseContent,
      description: 'Too many public questionnaire starts',
    },
  },
})

const getQuestionnaireRoute = createRoute({
  method: 'get',
  path: '/public/questionnaires/{token}',
  request: {
    params: publicTokenParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: publicQuestionnaireSessionResponseSchema,
        },
      },
      description: 'Token-protected public questionnaire session',
    },
    404: {
      content: errorResponseContent,
      description: 'Questionnaire session not found',
    },
  },
})

const patchQuestionnaireAnswersRoute = createRoute({
  method: 'patch',
  path: '/public/questionnaires/{token}/answers',
  request: {
    params: publicTokenParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: publicQuestionnairePatchRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: publicQuestionnaireSessionResponseSchema,
        },
      },
      description: 'Saved questionnaire answers incrementally',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    404: {
      content: errorResponseContent,
      description: 'Questionnaire session not found',
    },
  },
})

const publicProjectExamplePdfRoute = createRoute({
  method: 'get',
  path: '/public/project-example-requests/{token}/examples/{slug}',
  request: {
    params: publicProjectExampleParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/pdf': {
          schema: z.string(),
        },
      },
      description: 'Token-protected public project example PDF',
    },
    404: {
      content: errorResponseContent,
      description: 'Project example request or PDF not found',
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
      description: 'Token-protected public commercial proposal page',
    },
    404: {
      content: errorResponseContent,
      description: 'Proposal not found',
    },
  },
})

const publicProposalPdfRoute = createRoute({
  method: 'get',
  path: '/public/proposals/{token}/pdf',
  request: {
    params: publicTokenParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/pdf': {
          schema: z.string(),
        },
      },
      description: 'Token-protected immutable proposal PDF',
    },
    404: {
      content: errorResponseContent,
      description: 'Proposal PDF not found',
    },
  },
})

const telegramWebhookRoute = createRoute({
  method: 'post',
  path: '/public/telegram/webhook',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.record(z.string(), z.unknown()),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ ok: z.literal(true) }),
        },
      },
      description: 'Telegram webhook update accepted',
    },
    401: {
      content: errorResponseContent,
      description: 'Invalid Telegram webhook secret',
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
    401: unauthorizedResponse,
    403: forbiddenResponse,
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
    401: unauthorizedResponse,
    403: forbiddenResponse,
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
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: {
      content: errorResponseContent,
      description: 'Service not found',
    },
  },
})

const reorderServicesRoute = createRoute({
  method: 'patch',
  path: '/admin/services/reorder',
  request: {
    body: {
      content: {
        'application/json': {
          schema: serviceReorderRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: serviceListResponseSchema,
        },
      },
      description: 'Reordered engineering services',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: {
      content: errorResponseContent,
      description: 'Service not found',
    },
  },
})

const adminCalculationsRoute = createRoute({
  method: 'get',
  path: '/admin/calculations',
  request: {
    query: calculationListQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: calculationListResponseSchema,
        },
      },
      description: 'Submitted calculations/leads with CRM filters and counts',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid filters',
    },
    401: unauthorizedResponse,
    403: forbiddenResponse,
  },
})

const adminProjectExampleRequestsRoute = createRoute({
  method: 'get',
  path: '/admin/project-example-requests',
  request: {
    query: projectExampleRequestListQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: projectExampleRequestListResponseSchema,
        },
      },
      description: 'Project example lead requests',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid filters',
    },
    401: unauthorizedResponse,
    403: forbiddenResponse,
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
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: {
      content: errorResponseContent,
      description: 'Calculation not found',
    },
  },
})

const updateCalculationRoute = createRoute({
  method: 'patch',
  path: '/admin/calculations/{id}',
  request: {
    params: idParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: calculationUpdateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: calculationSaveResponseSchema,
        },
      },
      description: 'Updated calculation CRM status or notes',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    401: unauthorizedResponse,
    403: forbiddenResponse,
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
    401: unauthorizedResponse,
    403: forbiddenResponse,
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
    401: unauthorizedResponse,
    403: forbiddenResponse,
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
    401: unauthorizedResponse,
    403: forbiddenResponse,
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
    401: unauthorizedResponse,
    403: forbiddenResponse,
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
    401: unauthorizedResponse,
    403: forbiddenResponse,
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
    return c.json({ examples: await engineering.listPublicProjectExampleSummaries() }, 200)
  })

  routes.openapi(saveCalculationRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    const payload = c.req.valid('json')
    const env = c.get('env')
    const metadata = {
      referrer: c.req.header('referer'),
      ipAddress: publicSubmitIpAddress(c, env),
      userAgent: c.req.header('user-agent'),
    }

    if (!(await engineering.isExactIdempotencyReplay(payload, metadata))) {
      enforcePublicSubmitRateLimit(c, env)
    }

    const result = await engineering.saveCalculation(payload, metadata)
    return c.json({ calculation: result.publicCalculation }, result.created ? 201 : 200)
  })

  routes.openapi(saveProjectExampleRequestRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    const payload = c.req.valid('json')
    const env = c.get('env')
    const metadata = {
      referrer: c.req.header('referer'),
      ipAddress: publicSubmitIpAddress(c, env),
      userAgent: c.req.header('user-agent'),
    }

    if (!(await engineering.isExactProjectExampleRequestIdempotencyReplay(payload, metadata))) {
      enforcePublicSubmitRateLimit(
        c,
        env,
        'Too many project example requests. Please try again later.',
      )
    }

    const result = await engineering.saveProjectExampleRequest(payload, metadata)
    return c.json({ request: result.publicRequest }, result.created ? 201 : 200)
  })

  routes.openapi(startQuestionnaireRoute, async (c) => {
    c.header('Cache-Control', 'private, max-age=0, no-store')
    c.header('X-Robots-Tag', 'noindex, nofollow')
    const engineering = c.get('engineeringDataService')
    const payload = c.req.valid('json')
    const env = c.get('env')
    const metadata = {
      referrer: c.req.header('referer'),
      ipAddress: publicSubmitIpAddress(c, env),
      userAgent: c.req.header('user-agent'),
    }

    if (!(await engineering.isExactQuestionnaireStartReplay(payload, metadata))) {
      enforcePublicSubmitRateLimit(
        c,
        env,
        'Too many questionnaire starts. Please try again later.',
      )
    }

    const result = await engineering.startQuestionnaire(payload, metadata)
    return c.json({ questionnaire: result.questionnaire }, result.created ? 201 : 200)
  })

  routes.openapi(getQuestionnaireRoute, async (c) => {
    c.header('Cache-Control', 'private, max-age=0, no-store')
    c.header('X-Robots-Tag', 'noindex, nofollow')
    const engineering = c.get('engineeringDataService')
    const questionnaire = await engineering.getPublicQuestionnaire(c.req.valid('param').token)
    return c.json({ questionnaire }, 200)
  })

  routes.openapi(patchQuestionnaireAnswersRoute, async (c) => {
    c.header('Cache-Control', 'private, max-age=0, no-store')
    c.header('X-Robots-Tag', 'noindex, nofollow')
    const engineering = c.get('engineeringDataService')
    const questionnaire = await engineering.saveQuestionnaireAnswers(
      c.req.valid('param').token,
      c.req.valid('json'),
    )
    return c.json({ questionnaire }, 200)
  })

  routes.openapi(publicProposalRoute, async (c) => {
    c.header('Cache-Control', 'private, max-age=0, no-store')
    c.header('X-Robots-Tag', 'noindex, nofollow')
    const engineering = c.get('engineeringDataService')
    const html = await engineering.getPublicProposalHtml(c.req.valid('param').token)
    return c.html(html, 200)
  })

  routes.openapi(publicProposalPdfRoute, async (c) => {
    c.header('Cache-Control', 'private, max-age=0, no-store')
    c.header('X-Robots-Tag', 'noindex, nofollow')
    const engineering = c.get('engineeringDataService')
    const proposal = await engineering.getPublicProposalPdf(c.req.valid('param').token)
    c.header('Content-Type', 'application/pdf')
    c.header('Content-Disposition', `inline; filename="${proposal.offerNumber}.pdf"`)
    c.header('X-Proposal-Checksum-Sha256', proposal.checksumSha256)
    return c.body(proposal.bytes, 200)
  })

  routes.openapi(publicProjectExamplePdfRoute, async (c) => {
    c.header('Cache-Control', 'private, max-age=0, no-store')
    c.header('X-Robots-Tag', 'noindex, nofollow')
    const engineering = c.get('engineeringDataService')
    const params = c.req.valid('param')
    const example = await engineering.getPublicProjectExamplePdf(params.token, params.slug)
    c.header('Content-Type', 'application/pdf')
    c.header('Content-Disposition', `inline; filename="${example.asset.fileName}"`)
    return c.body(example.bytes, 200)
  })

  routes.openapi(telegramWebhookRoute, async (c) => {
    const env = c.get('env')
    const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET?.trim()

    if (!webhookSecret) {
      throw new AppError(401, 'UNAUTHORIZED', 'Telegram webhook secret is not configured')
    }

    if (webhookSecret && c.req.header('x-telegram-bot-api-secret-token') !== webhookSecret) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid Telegram webhook secret')
    }

    const engineering = c.get('engineeringDataService')
    const update = await c.req.json().catch(() => null)
    await engineering.handleTelegramWebhookUpdate(update)
    return c.json({ ok: true as const }, 200)
  })

  protectedRoutes.use('/admin/*', requireAdmin)

  protectedRoutes.openapi(adminServicesRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    return c.json({ services: await engineering.listAdminServices() }, 200)
  })

  protectedRoutes.openapi(createServiceRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    const service = await engineering.createService(c.req.valid('json'))
    return c.json({ service }, 201)
  })

  protectedRoutes.openapi(reorderServicesRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    const services = await engineering.reorderServices(c.req.valid('json'))
    return c.json({ services }, 200)
  })

  protectedRoutes.openapi(updateServiceRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    const service = await engineering.updateService(c.req.valid('param').id, c.req.valid('json'))
    return c.json({ service }, 200)
  })

  protectedRoutes.openapi(adminCalculationsRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    return c.json(await engineering.listCalculations(c.req.valid('query')), 200)
  })

  protectedRoutes.openapi(adminProjectExampleRequestsRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    return c.json(await engineering.listProjectExampleRequests(c.req.valid('query')), 200)
  })

  protectedRoutes.openapi(getCalculationRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    const calculation = await engineering.getCalculation(c.req.valid('param').id)
    return c.json({ calculation }, 200)
  })

  protectedRoutes.openapi(updateCalculationRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    const calculation = await engineering.updateCalculation(
      c.req.valid('param').id,
      c.req.valid('json'),
    )
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

  return (
    c: { req: { header: (name: string) => string | undefined } },
    env: AppEnv,
    message = 'Too many calculation submissions. Please try again later.',
  ) => {
    const now = Date.now()
    cleanupRateLimitBuckets(buckets, now, windowMs, maxBuckets)
    const key = publicSubmitClientKey(c, env)
    const existing = buckets.get(key)
    const bucket =
      existing && now - existing.windowStartedAt < windowMs
        ? existing
        : { count: 0, windowStartedAt: now }

    bucket.count += 1
    buckets.set(key, bucket)

    if (bucket.count > maxSubmissionsPerWindow) {
      throw new AppError(429, 'RATE_LIMITED', message)
    }
  }
}

function publicSubmitClientKey(
  c: { req: { header: (name: string) => string | undefined } },
  env: AppEnv,
) {
  const ipAddress = publicSubmitIpAddress(c, env)
  const userAgent = c.req.header('user-agent')?.slice(0, 120) ?? 'unknown-agent'
  return `${ipAddress || 'anonymous'}:${userAgent}`
}

function publicSubmitIpAddress(
  c: { req: { header: (name: string) => string | undefined } },
  env: AppEnv,
) {
  if (!env.TRUST_PROXY_HEADERS) return undefined

  const forwardedFor = c.req.header('x-forwarded-for')
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  return forwardedFor?.at(-1)
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
