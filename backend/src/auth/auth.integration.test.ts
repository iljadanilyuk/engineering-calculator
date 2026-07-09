import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../app'
import { createPrisma } from '../db'
import type { AppEnv } from '../env'
import { createAdminUser } from '../../scripts/create-admin'
import { signAccessToken } from './access-tokens'
import { hashPassword, verifyPassword } from './passwords'
import { createRefreshToken, hashRefreshToken } from './refresh-tokens'
import { AuthService } from './service'

const databaseUrl = process.env.TEST_DATABASE_URL
const maybeDescribe = databaseUrl ? describe : describe.skip
const adminPassword = 'password123'

maybeDescribe('auth API integration', () => {
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
  const app = createApp({ env, prisma })

  beforeEach(async () => {
    await prisma.authSession.deleteMany()
    await prisma.authRateLimitBucket.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('logs in an admin, reads me, refreshes, and logs out', async () => {
    await createUser('admin@example.com', 'admin', 'Admin User')

    const login = await loginAdmin('admin@example.com')
    const loginBody = await login.json()

    expect(login.status).toBe(200)
    expect(loginBody.user).toMatchObject({
      email: 'admin@example.com',
      displayName: 'Admin User',
      role: 'admin',
    })
    expect(loginBody.accessToken).toBeString()
    expect(loginBody.refreshToken).toBeString()

    const me = await app.request('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${loginBody.accessToken}`,
      },
    })
    const meBody = await me.json()
    expect(me.status).toBe(200)
    expect(meBody).toEqual({ user: loginBody.user })
    expect('sessionId' in meBody.user).toBe(false)

    const refresh = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Platform': 'mobile',
      },
      body: JSON.stringify({ refreshToken: loginBody.refreshToken }),
    })
    const refreshBody = await refresh.json()
    expect(refresh.status).toBe(200)
    expect(refreshBody.accessToken).toBeString()
    expect(refreshBody.refreshToken).toBeString()
    expect(refreshBody.refreshToken).not.toBe(loginBody.refreshToken)

    const staleRefresh = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Platform': 'mobile',
      },
      body: JSON.stringify({ refreshToken: loginBody.refreshToken }),
    })
    expect(staleRefresh.status).toBe(401)

    const logout = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: refreshBody.refreshToken }),
    })
    expect(logout.status).toBe(204)

    const revokedRefresh = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Platform': 'mobile',
      },
      body: JSON.stringify({ refreshToken: refreshBody.refreshToken }),
    })
    expect(revokedRefresh.status).toBe(401)
  })

  test('does not expose public self-registration', async () => {
    const response = await app.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'public-register@example.com',
        password: adminPassword,
      }),
    })

    expect(response.status).toBe(404)
    expect(await prisma.user.count()).toBe(0)
  })

  test('creates first admin through setup helper and protects duplicate admin paths', async () => {
    const created = await createAdminUser(prisma, {
      email: 'setup-admin@example.com',
      password: adminPassword,
      displayName: 'Setup Admin',
    })
    const savedAdmin = await prisma.user.findUniqueOrThrow({
      where: { email: created.email },
    })

    expect(created).toEqual({
      created: true,
      email: 'setup-admin@example.com',
    })
    expect(savedAdmin.role).toBe('admin')
    expect(savedAdmin.passwordHash).not.toBe(adminPassword)
    expect(await verifyPassword(adminPassword, savedAdmin.passwordHash)).toBe(true)

    await expectCreateAdminUserError(
      {
        email: 'setup-admin@example.com',
        password: 'another-password',
        displayName: null,
      },
      'A user with this email already exists',
    )

    await expectCreateAdminUserError(
      {
        email: 'second-admin@example.com',
        password: adminPassword,
        displayName: null,
      },
      'An admin user already exists',
    )

    const skipped = await createAdminUser(prisma, {
        email: 'setup-admin@example.com',
        password: adminPassword,
        displayName: 'Setup Admin',
      }, {
        skipIfExists: true,
      })
    expect(skipped).toEqual({
      created: false,
      email: 'setup-admin@example.com',
    })

    const additional = await createAdminUser(
      prisma,
      {
        email: 'second-admin@example.com',
        password: adminPassword,
        displayName: 'Second Admin',
      },
      {
        allowAdditionalAdmin: true,
      },
    )

    expect(additional).toEqual({
      created: true,
      email: 'second-admin@example.com',
    })

    await prisma.user.create({
      data: {
        email: 'existing-member@example.com',
        passwordHash: await hashPassword(adminPassword),
        role: 'member',
      },
    })
    await expectCreateAdminUserError(
      {
        email: 'existing-member@example.com',
        password: adminPassword,
        displayName: null,
      },
      'A user with this email already exists',
      {
        allowAdditionalAdmin: true,
        skipIfExists: true,
      },
    )
  })

  test('allows only one concurrent refresh rotation for the same token', async () => {
    await createUser('race@example.com', 'admin')
    const login = await loginAdmin('race@example.com')
    const loginBody = await login.json()

    const refreshRequests = await Promise.all([
      app.request('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': 'mobile',
        },
        body: JSON.stringify({ refreshToken: loginBody.refreshToken }),
      }),
      app.request('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': 'mobile',
        },
        body: JSON.stringify({ refreshToken: loginBody.refreshToken }),
      }),
    ])

    const statuses = refreshRequests.map((response) => response.status).sort((left, right) => left - right)
    expect(statuses).toEqual([200, 401])

    const activeSessions = await prisma.authSession.count({
      where: {
        user: {
          email: 'race@example.com',
        },
        revokedAt: null,
      },
    })
    expect(activeSessions).toBe(1)
  })

  test('web auth uses an HttpOnly refresh cookie instead of response body refresh token', async () => {
    await createUser('web-cookie@example.com', 'admin')
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Platform': 'web',
      },
      body: JSON.stringify({
        email: 'web-cookie@example.com',
        password: adminPassword,
      }),
    })
    const loginBody = await login.json()
    const setCookie = login.headers.get('set-cookie')

    expect(login.status).toBe(200)
    expect(loginBody.refreshToken).toBeUndefined()
    expect(setCookie).toContain('poznyak_engineering_calculator_refresh=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')

    const refresh = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: setCookie!.split(';')[0],
        'X-Client-Platform': 'web',
      },
      body: JSON.stringify({}),
    })
    const refreshBody = await refresh.json()

    expect(refresh.status).toBe(200)
    expect(refreshBody.accessToken).toBeString()
    expect(refreshBody.refreshToken).toBeUndefined()
  })

  test('production web auth allows exact CORS origin and cross-site refresh cookie', async () => {
    await createUser('production-cookie@example.com', 'admin')
    const productionApp = createApp({
      env: {
        ...env,
        CORS_ORIGINS: ['https://website.example.com'],
        AUTH_CORS_ORIGINS: ['https://web.example.com'],
        COOKIE_SECURE: true,
      },
      prisma,
    })
    const login = await productionApp.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://web.example.com',
        'X-Client-Platform': 'web',
      },
      body: JSON.stringify({
        email: 'production-cookie@example.com',
        password: adminPassword,
      }),
    })
    const loginBody = await login.json()
    const setCookie = login.headers.get('set-cookie')

    expect(login.status).toBe(200)
    expect(login.headers.get('access-control-allow-origin')).toBe('https://web.example.com')
    expect(login.headers.get('access-control-allow-credentials')).toBe('true')
    expect(loginBody.refreshToken).toBeUndefined()
    expect(setCookie).toContain('poznyak_engineering_calculator_refresh=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('SameSite=None')
  })

  test('production cookie auth rejects untrusted refresh and logout origins', async () => {
    await createUser('csrf-cookie@example.com', 'admin')
    const productionApp = createApp({
      env: {
        ...env,
        CORS_ORIGINS: ['https://website.example.com'],
        AUTH_CORS_ORIGINS: ['https://web.example.com'],
        COOKIE_SECURE: true,
      },
      prisma,
    })
    const login = await productionApp.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://web.example.com',
        'X-Client-Platform': 'web',
      },
      body: JSON.stringify({
        email: 'csrf-cookie@example.com',
        password: adminPassword,
      }),
    })
    const cookie = login.headers.get('set-cookie')!.split(';')[0]

    const noOriginRefresh = await productionApp.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'X-Client-Platform': 'web',
      },
      body: JSON.stringify({}),
    })
    const noOriginBody = await noOriginRefresh.json()
    expect(noOriginRefresh.status).toBe(403)
    expect(noOriginBody.error.code).toBe('FORBIDDEN')

    const untrustedLogout = await productionApp.request('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        Origin: 'https://attacker.example',
        'X-Client-Platform': 'web',
      },
      body: JSON.stringify({}),
    })
    const untrustedLogoutBody = await untrustedLogout.json()
    expect(untrustedLogout.status).toBe(403)
    expect(untrustedLogoutBody.error.code).toBe('FORBIDDEN')

    const allowedRefresh = await productionApp.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        Origin: 'https://web.example.com',
        'X-Client-Platform': 'web',
      },
      body: JSON.stringify({}),
    })
    expect(allowedRefresh.status).toBe(200)
  })

  test('guards me and returns stable validation errors', async () => {
    const unauthorizedMe = await app.request('/api/auth/me')
    expect(unauthorizedMe.status).toBe(401)

    const invalidLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'not-an-email',
        password: 'short',
      }),
    })
    const body = await invalidLogin.json()

    expect(invalidLogin.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toBe('Invalid request payload')
    expect(Array.isArray(body.error.details)).toBe(true)
  })

  test('me rejects revoked, expired, and missing sessions', async () => {
    const revoked = await createAdminAccessToken('me-revoked@example.com')
    await prisma.authSession.updateMany({
      where: {
        userId: revoked.userId,
      },
      data: {
        revokedAt: new Date(),
      },
    })
    const revokedMe = await app.request('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${revoked.accessToken}`,
      },
    })
    expect(revokedMe.status).toBe(401)

    const expired = await createAdminAccessToken('me-expired@example.com')
    await prisma.authSession.updateMany({
      where: {
        userId: expired.userId,
      },
      data: {
        expiresAt: new Date(Date.now() - 1000),
      },
    })
    const expiredMe = await app.request('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${expired.accessToken}`,
      },
    })
    expect(expiredMe.status).toBe(401)

    const missing = await createAdminAccessToken('me-missing@example.com')
    await prisma.authSession.deleteMany({
      where: {
        userId: missing.userId,
      },
    })
    const missingMe = await app.request('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${missing.accessToken}`,
      },
    })
    expect(missingMe.status).toBe(401)
  })

  test('rejects invalid login and rate limits repeated failed attempts', async () => {
    await createUser('invalid-login@example.com', 'admin')

    const invalidLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'pzk-invalid-login-test',
        'X-Real-IP': '203.0.113.20',
      },
      body: JSON.stringify({
        email: 'invalid-login@example.com',
        password: 'wrong-password',
      }),
    })
    const invalidLoginBody = await invalidLogin.json()
    expect(invalidLogin.status).toBe(401)
    expect(invalidLoginBody.error.message).toBe('Invalid email or password')

    let latestStatus = invalidLogin.status
    for (let index = 0; index < 5; index += 1) {
      const response = await app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'pzk-invalid-login-test',
          'X-Real-IP': '203.0.113.20',
        },
        body: JSON.stringify({
          email: 'invalid-login@example.com',
          password: 'wrong-password',
        }),
      })
      latestStatus = response.status
    }

    expect(latestStatus).toBe(429)
  })

  test('counts concurrent failed login attempts atomically', async () => {
    const auth = new AuthService(prisma, env)
    const attemptCount = 12
    const keys = {
      emailKey: 'concurrent-email-key',
      clientKey: 'concurrent-client-key',
    }

    const results = await Promise.allSettled(
      Array.from({ length: attemptCount }, () => auth.recordLoginFailure(keys)),
    )
    const rejectedCount = results.filter((result) => result.status === 'rejected').length
    const buckets = await prisma.authRateLimitBucket.findMany({
      where: {
        OR: [
          { bucketKey: keys.emailKey },
          { bucketKey: keys.clientKey },
        ],
      },
      select: {
        bucketKey: true,
        failedCount: true,
      },
    })

    expect(rejectedCount).toBeGreaterThan(0)
    expect(buckets).toHaveLength(2)
    expect(buckets.map((bucket) => bucket.failedCount).sort((left, right) => left - right)).toEqual([
      attemptCount,
      attemptCount,
    ])
  })

  test('buckets failed logins by trusted forwarded IP instead of user agent or spoofed leftmost values', async () => {
    await createUser('forwarded-bucket@example.com', 'admin')

    for (let index = 0; index < 3; index += 1) {
      const response = await app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `rotated-agent-${index}`,
          'X-Forwarded-For': `198.51.100.${index + 1}, 203.0.113.88`,
        },
        body: JSON.stringify({
          email: 'forwarded-bucket@example.com',
          password: 'wrong-password',
        }),
      })

      expect(response.status).toBe(401)
    }

    const clientBuckets = await prisma.authRateLimitBucket.findMany({
      where: {
        scope: 'login_client',
      },
      select: {
        failedCount: true,
      },
    })

    expect(clientBuckets).toEqual([{ failedCount: 3 }])
  })

  test('rejects member login and returns forbidden for member tokens on admin API', async () => {
    const member = await createUser('member@example.com', 'member')

    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'pzk-member-login-test',
        'X-Real-IP': '203.0.113.21',
      },
      body: JSON.stringify({
        email: member.email,
        password: adminPassword,
      }),
    })
    const loginBody = await login.json()

    expect(login.status).toBe(403)
    expect(loginBody.error.code).toBe('FORBIDDEN')
    expect(await prisma.authSession.count()).toBe(0)

    const accessToken = await createAccessTokenForUser(member.id, member.email)
    const protectedAdminApi = await app.request('/api/admin/services', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    const protectedAdminBody = await protectedAdminApi.json()

    expect(protectedAdminApi.status).toBe(403)
    expect(protectedAdminBody.error.code).toBe('FORBIDDEN')
  })

  async function loginAdmin(email: string) {
    return app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Platform': 'mobile',
      },
      body: JSON.stringify({
        email,
        password: adminPassword,
      }),
    })
  }

  async function createUser(
    email: string,
    role: 'admin' | 'member',
    displayName: string | null = null,
  ) {
    return prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(adminPassword),
        displayName,
        role,
      },
      select: {
        id: true,
        email: true,
      },
    })
  }

  async function createAdminAccessToken(email: string) {
    const user = await createUser(email, 'admin')
    const accessToken = await createAccessTokenForUser(user.id, user.email)

    return {
      accessToken,
      userId: user.id,
    }
  }

  async function createAccessTokenForUser(userId: string, email: string) {
    const refreshToken = createRefreshToken()
    const session = await prisma.authSession.create({
      data: {
        userId,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
      select: {
        id: true,
      },
    })

    return signAccessToken(
      {
        sub: userId,
        email,
        sessionId: session.id,
      },
      env,
    )
  }

  async function expectCreateAdminUserError(
    input: Parameters<typeof createAdminUser>[1],
    message: string,
    options?: Parameters<typeof createAdminUser>[2],
  ) {
    try {
      await createAdminUser(prisma, input, options)
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain(message)
      return
    }

    throw new Error(`Expected createAdminUser to throw "${message}"`)
  }
})
