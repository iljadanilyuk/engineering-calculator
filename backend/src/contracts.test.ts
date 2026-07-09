import { describe, expect, test } from 'bun:test'
import { loginRequestSchema } from '@poznyak-engineering-calculator/contracts'

describe('contracts', () => {
  test('normalizes auth login payloads', () => {
    const result = loginRequestSchema.parse({
      email: ' USER@Example.COM ',
      password: 'password123',
    })

    expect(result).toEqual({
      email: 'user@example.com',
      password: 'password123',
    })
  })
})
