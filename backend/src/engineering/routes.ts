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
  serviceCreateRequestSchema,
  serviceListResponseSchema,
  serviceResponseSchema,
  serviceUpdateRequestSchema,
} from '@poznyak-engineering-calculator/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'

import { requireAuth } from '../auth/middleware'
import type { AppHonoEnv, AuthenticatedHonoEnv } from '../http/context'
import { validationErrorHook } from '../http/errors'

const errorResponseContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const idParamsSchema = z.object({
  id: z.string().uuid(),
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
    201: {
      content: {
        'application/json': {
          schema: calculationSaveResponseSchema,
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

  routes.openapi(publicServicesRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    return c.json({ services: await engineering.listPublicServices() }, 200)
  })

  routes.openapi(publicProjectExamplesRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    return c.json({ examples: await engineering.listPublicProjectExamples() }, 200)
  })

  routes.openapi(saveCalculationRoute, async (c) => {
    const engineering = c.get('engineeringDataService')
    const calculation = await engineering.saveCalculation(c.req.valid('json'))
    return c.json({ calculation }, 201)
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
