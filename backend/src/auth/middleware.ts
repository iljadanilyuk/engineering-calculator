import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'

import type { AuthenticatedHonoEnv } from '../http/context'
import { AppError } from '../http/errors'

export const requireAuth = createMiddleware<AuthenticatedHonoEnv>(async (c, next) => {
  c.set('user', await authenticateRequest(c))

  await next()
})

export const requireAdmin = createMiddleware<AuthenticatedHonoEnv>(async (c, next) => {
  const user = await authenticateRequest(c)

  if (user.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Admin access is required')
  }

  c.set('user', user)

  await next()
})

function authenticateRequest(c: Context<AuthenticatedHonoEnv>) {
  const accessToken = bearerToken(c.req.header('authorization'))
  return c.var.authService.authenticateAccessToken(accessToken)
}

function bearerToken(authorization: string | undefined) {
  if (!authorization?.startsWith('Bearer ')) return undefined
  return authorization.slice('Bearer '.length)
}
