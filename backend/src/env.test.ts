import { describe, expect, test } from 'bun:test'

import { loadEnv } from './env'

describe('loadEnv', () => {
  test('parses defaults and comma-separated origins', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/poznyak_engineering_calculator',
      JWT_SECRET: '12345678901234567890123456789012',
      CORS_ORIGINS: 'http://localhost:4321',
      AUTH_CORS_ORIGINS: 'http://localhost:5173, http://localhost:8081',
    })

    expect(env.PORT).toBe(3000)
    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(900)
    expect(env.COOKIE_SECURE).toBe(false)
    expect(env.TRUST_PROXY_HEADERS).toBe(false)
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:4321'])
    expect(env.AUTH_CORS_ORIGINS).toEqual(['http://localhost:5173', 'http://localhost:8081'])
    expect(env.SPACES_REGION).toBeUndefined()
    expect(env.SPACES_UPLOAD_MAX_BYTES).toBe(10 * 1024 * 1024)
    expect(env.SPACES_UPLOAD_URL_TTL_SECONDS).toBe(900)
    expect(env.SPACES_DOWNLOAD_URL_TTL_SECONDS).toBe(300)
    expect(env.SPACES_PUBLIC_CACHE_CONTROL).toBe('public, max-age=31536000, immutable')
    expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined()
    expect(env.TELEGRAM_CHAT_ID).toBeUndefined()
    expect(env.PUBLIC_API_URL).toBeUndefined()
    expect(env.PUBLIC_WEBAPP_URL).toBeUndefined()
  })

  test('requires complete DigitalOcean Spaces configuration when storage is enabled', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/poznyak_engineering_calculator',
        JWT_SECRET: '12345678901234567890123456789012',
        SPACES_BUCKET: 'uploads',
      }),
    ).toThrow()
    expect(() =>
      loadEnv({
        DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/poznyak_engineering_calculator',
        JWT_SECRET: '12345678901234567890123456789012',
        SPACES_CDN_BASE_URL: 'https://images.example.com',
      }),
    ).toThrow()

    const env = loadEnv({
      DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/poznyak_engineering_calculator',
      JWT_SECRET: '12345678901234567890123456789012',
      SPACES_REGION: 'nyc3',
      SPACES_BUCKET: 'uploads',
      SPACES_ENDPOINT: 'https://nyc3.digitaloceanspaces.com',
      SPACES_CDN_BASE_URL: 'https://images.example.com',
      SPACES_ACCESS_KEY_ID: 'access-key',
      SPACES_SECRET_ACCESS_KEY: 'secret-key',
    })

    expect(env.SPACES_REGION).toBe('nyc3')
    expect(env.SPACES_BUCKET).toBe('uploads')
    expect(env.SPACES_CDN_BASE_URL).toBe('https://images.example.com')
  })

  test('rejects known weak JWT secrets in production-like runtimes', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/poznyak_engineering_calculator',
        JWT_SECRET: 'replace-with-at-least-32-random-characters',
      }),
    ).toThrow('JWT_SECRET')

    expect(() =>
      loadEnv({
        DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/poznyak_engineering_calculator',
        JWT_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        COOKIE_SECURE: 'true',
        CORS_ORIGINS: 'https://web.example.com',
        AUTH_CORS_ORIGINS: 'https://admin.example.com',
      }),
    ).toThrow('JWT_SECRET')
  })

  test('parses optional Telegram and public link env vars', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/poznyak_engineering_calculator',
      JWT_SECRET: '12345678901234567890123456789012',
      TELEGRAM_BOT_TOKEN: '  test-token  ',
      TELEGRAM_CHAT_ID: ' -100123456 ',
      PUBLIC_API_URL: 'https://api.example.com',
      PUBLIC_WEBAPP_URL: 'https://admin.example.com',
    })

    expect(env.TELEGRAM_BOT_TOKEN).toBe('test-token')
    expect(env.TELEGRAM_CHAT_ID).toBe('-100123456')
    expect(env.PUBLIC_API_URL).toBe('https://api.example.com')
    expect(env.PUBLIC_WEBAPP_URL).toBe('https://admin.example.com')
  })

  test('rejects non-http public link env vars', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/poznyak_engineering_calculator',
        JWT_SECRET: '12345678901234567890123456789012',
        PUBLIC_API_URL: 'ftp://api.example.com',
      }),
    ).toThrow('PUBLIC_API_URL')
  })

  test('requires secure cookies in production', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/poznyak_engineering_calculator',
        JWT_SECRET: '12345678901234567890123456789012',
        COOKIE_SECURE: 'false',
        CORS_ORIGINS: 'https://web.example.com',
        AUTH_CORS_ORIGINS: 'https://admin.example.com',
      }),
    ).toThrow('COOKIE_SECURE')
  })

  test('rejects unsafe production CORS origins', () => {
    const baseEnv = {
      DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/poznyak_engineering_calculator',
      JWT_SECRET: '12345678901234567890123456789012',
    }

    expect(() =>
      loadEnv({
        ...baseEnv,
        CORS_ORIGINS: '',
      }),
    ).toThrow('CORS_ORIGINS')

    expect(() =>
      loadEnv({
        ...baseEnv,
        CORS_ORIGINS: '*',
      }),
    ).toThrow('CORS_ORIGINS')

    expect(() =>
      loadEnv({
        ...baseEnv,
        CORS_ORIGINS: 'https://web.example.com/path',
      }),
    ).toThrow('CORS_ORIGINS')

    expect(() =>
      loadEnv({
        ...baseEnv,
        COOKIE_SECURE: 'true',
        CORS_ORIGINS: 'http://web.example.com',
        AUTH_CORS_ORIGINS: 'https://admin.example.com',
      }),
    ).toThrow('CORS_ORIGINS')

    expect(() =>
      loadEnv({
        ...baseEnv,
        COOKIE_SECURE: 'true',
        CORS_ORIGINS: 'https://web.example.com',
        AUTH_CORS_ORIGINS: 'http://admin.example.com',
      }),
    ).toThrow('AUTH_CORS_ORIGINS')
  })
})
