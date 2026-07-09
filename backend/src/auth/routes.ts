import {
  apiErrorSchema,
  authResponseSchema,
  loginRequestSchema,
  logoutRequestSchema,
  meResponseSchema,
  refreshRequestSchema,
  refreshResponseSchema,
} from '@poznyak-engineering-calculator/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createHash } from 'node:crypto'

import type { AppEnv } from '../env'
import type { AppHonoEnv, AuthenticatedHonoEnv } from '../http/context'
import { userDtoFromAuthenticatedUser } from '../http/context'
import { AppError, validationErrorHook } from '../http/errors'
import { requireAuth } from './middleware'

const refreshCookieName = 'poznyak_engineering_calculator_refresh'

const authResponseContent = {
  'application/json': {
    schema: authResponseSchema,
  },
}

const refreshResponseContent = {
  'application/json': {
    schema: refreshResponseSchema,
  },
}

const meResponseContent = {
  'application/json': {
    schema: meResponseSchema,
  },
}

const errorResponseContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const loginRoute = createRoute({
  method: 'post',
  path: '/login',
  request: {
    body: {
      content: {
        'application/json': {
          schema: loginRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: authResponseContent,
      description: 'Created session',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    401: {
      content: errorResponseContent,
      description: 'Invalid credentials',
    },
    403: {
      content: errorResponseContent,
      description: 'User is authenticated but is not allowed to access the admin cabinet',
    },
    429: {
      content: errorResponseContent,
      description: 'Too many failed login attempts',
    },
  },
})

const refreshRoute = createRoute({
  method: 'post',
  path: '/refresh',
  request: {
    body: {
      content: {
        'application/json': {
          schema: refreshRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: refreshResponseContent,
      description: 'Rotated refresh session and returned a new access token',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    401: {
      content: errorResponseContent,
      description: 'Invalid refresh token',
    },
    403: {
      content: errorResponseContent,
      description: 'Cookie auth request came from an untrusted browser origin',
    },
  },
})

const meRoute = createRoute({
  method: 'get',
  path: '/me',
  responses: {
    200: {
      content: meResponseContent,
      description: 'Current user',
    },
    401: {
      content: errorResponseContent,
      description: 'Invalid access token',
    },
  },
})

const logoutRoute = createRoute({
  method: 'post',
  path: '/logout',
  request: {
    body: {
      content: {
        'application/json': {
          schema: logoutRequestSchema,
        },
      },
    },
  },
  responses: {
    204: {
      description: 'Session revoked',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    403: {
      content: errorResponseContent,
      description: 'Cookie auth request came from an untrusted browser origin',
    },
  },
})

export function createAuthRoutes() {
  const routes = new OpenAPIHono<AppHonoEnv>({
    defaultHook: validationErrorHook,
  })
  const protectedRoutes = new OpenAPIHono<AuthenticatedHonoEnv>({
    defaultHook: validationErrorHook,
  })

  routes.use('*', async (c, next) => {
    setAuthNoStoreHeaders(c)
    await next()
  })

  routes.openapi(loginRoute, async (c) => {
    const auth = c.get('authService')
    const env = c.get('env')
    const body = c.req.valid('json')
    const loginRateLimitKeys = loginRateLimitKeysForRequest(c, env, body.email)

    await auth.assertLoginAllowed(loginRateLimitKeys)

    let result: Awaited<ReturnType<typeof auth.login>>
    try {
      result = await auth.login(body, requestMetadata(c))
    } catch (error) {
      if (isAuthFailure(error)) {
        await auth.recordLoginFailure(loginRateLimitKeys)
      }
      throw error
    }

    await auth.recordLoginSuccess(loginRateLimitKeys)
    setAuthNoStoreHeaders(c)
    setRefreshCookie(c, result.refreshToken, env)
    return c.json(responseForClient(c, result), 200)
  })

  routes.openapi(refreshRoute, async (c) => {
    const auth = c.get('authService')
    const env = c.get('env')
    const body = c.req.valid('json')
    const cookieRefreshToken = getRefreshCookie(c)
    assertTrustedCookieRequest(c, env, body.refreshToken, cookieRefreshToken)
    const result = await auth.refresh(body.refreshToken ?? cookieRefreshToken, requestMetadata(c))
    setAuthNoStoreHeaders(c)
    setRefreshCookie(c, result.refreshToken, env)

    return c.json(responseForClient(c, result), 200)
  })

  protectedRoutes.use('/me', requireAuth)
  protectedRoutes.openapi(meRoute, async (c) => {
    setAuthNoStoreHeaders(c)
    return c.json({ user: userDtoFromAuthenticatedUser(c.var.user) }, 200)
  })
  routes.route('/', protectedRoutes)

  routes.openapi(logoutRoute, async (c) => {
    const auth = c.get('authService')
    const env = c.get('env')
    const body = c.req.valid('json')
    const cookieRefreshToken = getRefreshCookie(c)
    assertTrustedCookieRequest(c, env, body.refreshToken, cookieRefreshToken)
    await auth.logout(body.refreshToken ?? cookieRefreshToken)
    setAuthNoStoreHeaders(c)
    deleteCookie(c, refreshCookieName, {
      path: '/api/auth',
      secure: env.COOKIE_SECURE,
      sameSite: refreshCookieSameSite(env),
    })

    return c.body(null, 204)
  })

  return routes
}

function requestMetadata(c: Context): { userAgent?: string; ipAddress?: string } {
  const env = c.get('env')
  return {
    userAgent: c.req.header('user-agent'),
    ipAddress: clientIpAddress(c, env),
  }
}

function getRefreshCookie(c: Context) {
  return getCookie(c, refreshCookieName)
}

function assertTrustedCookieRequest(
  c: Context,
  env: AppEnv,
  bodyRefreshToken: string | undefined,
  cookieRefreshToken: string | undefined,
) {
  if (!env.COOKIE_SECURE || bodyRefreshToken !== undefined || !cookieRefreshToken) {
    return
  }

  const origin = c.req.header('origin')
  if (origin && env.AUTH_CORS_ORIGINS.includes(origin)) {
    return
  }

  throw new AppError(403, 'FORBIDDEN', 'Cookie auth requests require a trusted Origin')
}

function setRefreshCookie(c: Context, refreshToken: string, env: AppEnv) {
  setCookie(c, refreshCookieName, refreshToken, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: refreshCookieSameSite(env),
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  })
}

function refreshCookieSameSite(env: AppEnv) {
  return env.COOKIE_SECURE ? 'None' : 'Lax'
}

function responseForClient<T extends { refreshToken: string }>(c: Context, response: T) {
  if (c.req.header('x-client-platform') === 'mobile') {
    return response
  }

  const { refreshToken: _refreshToken, ...webResponse } = response
  return webResponse
}

function setAuthNoStoreHeaders(c: Context) {
  c.header('Cache-Control', 'no-store')
  c.header('Pragma', 'no-cache')
}

function loginRateLimitKeysForRequest(c: Context, env: AppEnv, email: string) {
  return {
    emailKey: sha256Hex(email.trim().toLowerCase()),
    clientKey: sha256Hex(clientIpAddress(c, env) ?? 'anonymous'),
  }
}

function clientIpAddress(c: Context, env: AppEnv) {
  if (!env.TRUST_PROXY_HEADERS) return undefined

  const forwardedFor = c.req.header('x-forwarded-for')
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  return forwardedFor?.at(-1)
}

function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function isAuthFailure(error: unknown) {
  return error instanceof AppError && (error.status === 401 || error.status === 403)
}
