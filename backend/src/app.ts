import { OpenAPIHono } from '@hono/zod-openapi'
import { secureHeaders } from 'hono/secure-headers'
import type { Context } from 'hono'

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
import {
  createTelegramDocumentSenderFromEnv,
  createTelegramLeadNotifierFromEnv,
  type LeadNotifier,
  type TelegramDocumentSender,
} from './notifications/telegram'
import { createStorageServiceFromEnv } from './storage/service'

type CreateAppOptions = {
  env: AppEnv
  prisma: DbClient
  proposalGenerator?: ProposalGenerator
  leadNotifier?: LeadNotifier
  telegramDocumentSender?: TelegramDocumentSender
}

export function createApp({
  env,
  prisma,
  proposalGenerator,
  leadNotifier,
  telegramDocumentSender,
}: CreateAppOptions) {
  const authService = new AuthService(prisma, env)
  const resolvedProposalGenerator =
    proposalGenerator ??
    createCommercialProposalGenerator({
      chromiumExecutablePath: env.PDF_CHROMIUM_EXECUTABLE_PATH,
    })
  const engineeringDataService = new EngineeringDataService(
    prisma,
    resolvedProposalGenerator,
    leadNotifier ?? createTelegramLeadNotifierFromEnv(env),
    telegramDocumentSender ?? createTelegramDocumentSenderFromEnv(env),
    {
      publicApiUrl: env.PUBLIC_API_URL ?? `http://localhost:${env.PORT}`,
      publicWebsiteUrl: env.PUBLIC_WEBSITE_URL,
      telegramBotUsername: env.TELEGRAM_BOT_USERNAME,
      telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    },
  )
  const storageService = createStorageServiceFromEnv(env)
  const app = new OpenAPIHono<AppHonoEnv>({
    defaultHook: validationErrorHook,
  })

  app.use(secureHeaders())
  app.use('*', createCorsMiddleware(env))
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

const corsAllowHeaders = ['Content-Type', 'Authorization', 'X-Client-Platform']
const corsAllowMethods = ['GET', 'POST', 'PATCH', 'OPTIONS']
const corsMaxAgeSeconds = 600

function createCorsMiddleware(env: AppEnv) {
  const publicOrigins = new Set([...env.CORS_ORIGINS, ...env.AUTH_CORS_ORIGINS])
  const authOrigins = new Set(env.AUTH_CORS_ORIGINS)

  return async (c: Context, next: () => Promise<void>) => {
    const origin = c.req.header('origin')
    const isProtectedCorsPath = isCredentialedCorsPath(c.req.path)
    const isAllowedOrigin = origin
      ? isProtectedCorsPath ? authOrigins.has(origin) : publicOrigins.has(origin)
      : false
    const allowCredentials = isProtectedCorsPath

    if (origin && isAllowedOrigin) {
      setCorsHeaders(c, origin, allowCredentials)
    }

    if (c.req.method === 'OPTIONS') {
      if (origin && isAllowedOrigin) {
        setCorsPreflightHeaders(c)
      }
      c.res.headers.delete('Content-Length')
      c.res.headers.delete('Content-Type')
      return c.body(null, 204)
    }

    await next()
  }
}

function isCredentialedCorsPath(path: string) {
  return path === '/api/auth' ||
    path.startsWith('/api/auth/') ||
    path === '/api/admin' ||
    path.startsWith('/api/admin/')
}

function setCorsHeaders(c: Context, origin: string, credentials: boolean) {
  c.header('Access-Control-Allow-Origin', origin)
  c.header('Vary', 'Origin', { append: true })

  if (credentials) {
    c.header('Access-Control-Allow-Credentials', 'true')
  }
}

function setCorsPreflightHeaders(c: Context) {
  c.header('Access-Control-Allow-Methods', corsAllowMethods.join(','))
  c.header('Access-Control-Allow-Headers', corsAllowHeaders.join(','))
  c.header('Access-Control-Max-Age', String(corsMaxAgeSeconds))
  c.header('Vary', 'Access-Control-Request-Headers', { append: true })
}
