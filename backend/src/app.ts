import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'

import type { DbClient } from './db'
import type { AppEnv } from './env'
import { createAuthRoutes } from './auth/routes'
import { AuthService } from './auth/service'
import {
  createCommercialProposalGenerator,
  type ProposalGenerator,
} from './engineering/proposal'
import { createEngineeringRoutes } from './engineering/routes'
import { EngineeringDataService } from './engineering/service'
import type { AppHonoEnv } from './http/context'
import { errorResponse, handleError, validationErrorHook } from './http/errors'
import { createStorageServiceFromEnv } from './storage/service'

type CreateAppOptions = {
  env: AppEnv
  prisma: DbClient
  proposalGenerator?: ProposalGenerator
}

export function createApp({ env, prisma, proposalGenerator }: CreateAppOptions) {
  const authService = new AuthService(prisma, env)
  const resolvedProposalGenerator =
    proposalGenerator ??
    createCommercialProposalGenerator({
      chromiumExecutablePath: env.PDF_CHROMIUM_EXECUTABLE_PATH,
    })
  const engineeringDataService = new EngineeringDataService(prisma, resolvedProposalGenerator)
  const storageService = createStorageServiceFromEnv(env)
  const app = new OpenAPIHono<AppHonoEnv>({
    defaultHook: validationErrorHook,
  })

  app.use(secureHeaders())
  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return env.CORS_ORIGINS[0] ?? null
        return env.CORS_ORIGINS.includes(origin) ? origin : null
      },
      allowHeaders: ['Content-Type', 'Authorization', 'X-Client-Platform'],
      allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      credentials: true,
      maxAge: 600,
    }),
  )
  app.use('*', async (c, next) => {
    c.set('authService', authService)
    c.set('engineeringDataService', engineeringDataService)
    c.set('env', env)
    c.set('storageService', storageService)
    await next()
  })

  app.get('/', (c) => {
    return c.json({
      name: 'poznyak_engineering_calculator backend',
      status: 'ok',
    })
  })

  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
    })
  })

  app.route('/api/auth', createAuthRoutes())
  app.route('/api', createEngineeringRoutes())

  app.doc('/openapi.json', {
    openapi: '3.0.0',
    info: {
      title: 'poznyak_engineering_calculator API',
      version: '1.0.0',
    },
  })

  app.notFound((c) => c.json(errorResponse('NOT_FOUND', 'Route not found'), 404))
  app.onError(handleError)

  return app
}

export type AppType = ReturnType<typeof createApp>
