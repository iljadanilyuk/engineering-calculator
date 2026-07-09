import { describe, expect, test } from 'bun:test'

import { createApp } from '../app'
import type { DbClient } from '../db'
import type { AppEnv } from '../env'

const env: AppEnv = {
  PORT: 3000,
  DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/poznyak_engineering_calculator',
  JWT_SECRET: 'test-route-secret-at-least-thirty-two-chars-123',
  CORS_ORIGINS: ['https://website.example.com'],
  AUTH_CORS_ORIGINS: ['https://web.example.com'],
  ACCESS_TOKEN_TTL_SECONDS: 60,
  REFRESH_TOKEN_TTL_DAYS: 30,
  COOKIE_SECURE: true,
  TRUST_PROXY_HEADERS: true,
  SPACES_UPLOAD_MAX_BYTES: 10 * 1024 * 1024,
  SPACES_UPLOAD_URL_TTL_SECONDS: 900,
  SPACES_DOWNLOAD_URL_TTL_SECONDS: 300,
  SPACES_PUBLIC_CACHE_CONTROL: 'public, max-age=31536000, immutable',
}

describe('auth routes', () => {
  test('allows credentialed auth CORS only from configured admin origins', async () => {
    const app = createApp({ env, prisma: {} as DbClient })

    const publicRefreshPreflight = await app.request('/api/auth/refresh', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://website.example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-client-platform',
      },
    })
    expect(publicRefreshPreflight.status).toBe(204)
    expect(publicRefreshPreflight.headers.get('access-control-allow-origin')).toBeNull()
    expect(publicRefreshPreflight.headers.get('access-control-allow-credentials')).toBeNull()

    const adminRefreshPreflight = await app.request('/api/auth/refresh', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://web.example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-client-platform',
      },
    })
    expect(adminRefreshPreflight.status).toBe(204)
    expect(adminRefreshPreflight.headers.get('access-control-allow-origin')).toBe('https://web.example.com')
    expect(adminRefreshPreflight.headers.get('access-control-allow-credentials')).toBe('true')

    const publicAdminPreflight = await app.request('/api/admin/services', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://website.example.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    })
    expect(publicAdminPreflight.status).toBe(204)
    expect(publicAdminPreflight.headers.get('access-control-allow-origin')).toBeNull()
    expect(publicAdminPreflight.headers.get('access-control-allow-credentials')).toBeNull()

    const publicHealthPreflight = await app.request('/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://website.example.com',
        'Access-Control-Request-Method': 'GET',
      },
    })
    expect(publicHealthPreflight.status).toBe(204)
    expect(publicHealthPreflight.headers.get('access-control-allow-origin')).toBe('https://website.example.com')
    expect(publicHealthPreflight.headers.get('access-control-allow-credentials')).toBeNull()
  })

  test('rejects secure cookie refresh and logout requests from untrusted origins before auth service work', async () => {
    const app = createApp({ env, prisma: {} as DbClient })
    const refreshCookie = `poznyak_engineering_calculator_refresh=${'r'.repeat(32)}`

    const noOriginRefresh = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: refreshCookie,
        'X-Client-Platform': 'web',
      },
      body: JSON.stringify({}),
    })
    const noOriginRefreshBody = await noOriginRefresh.json()

    expect(noOriginRefresh.status).toBe(403)
    expect(noOriginRefresh.headers.get('cache-control')).toBe('no-store')
    expect(noOriginRefreshBody.error.code).toBe('FORBIDDEN')

    const untrustedLogout = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: refreshCookie,
        Origin: 'https://attacker.example',
        'X-Client-Platform': 'web',
      },
      body: JSON.stringify({}),
    })
    const untrustedLogoutBody = await untrustedLogout.json()

    expect(untrustedLogout.status).toBe(403)
    expect(untrustedLogout.headers.get('cache-control')).toBe('no-store')
    expect(untrustedLogoutBody.error.code).toBe('FORBIDDEN')
  })

  test('sets no-store on auth validation errors', async () => {
    const app = createApp({ env, prisma: {} as DbClient })

    const invalidLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://web.example.com',
      },
      body: JSON.stringify({
        email: 'not-an-email',
        password: 'short',
      }),
    })

    expect(invalidLogin.status).toBe(400)
    expect(invalidLogin.headers.get('cache-control')).toBe('no-store')
  })
})
