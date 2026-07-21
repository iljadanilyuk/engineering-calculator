import { describe, expect, test } from 'bun:test'

import { validatePublicContactPhone } from './public-contact-validation'

describe('public contact phone validation', () => {
  test.each([
    ['+375 29 111-22-33', '+375291112233'],
    ['80291112233', '+375291112233'],
    ['0291112233', '+375291112233'],
    ['291112233', '+375291112233'],
    ['+7 999 111-22-33', '+79991112233'],
    ['0079991112233', '+79991112233'],
  ])('accepts and normalizes supported contact phone %s', (rawPhone, normalized) => {
    expect(validatePublicContactPhone(rawPhone)).toEqual({ valid: true, normalized })
  })

  test.each(['+3654455666544566', '+375 11 111-11-11', '+99912345678', '11111111111', '375291111111'])(
    'rejects unsupported or artificial contact phone %s',
    (rawPhone) => {
      expect(validatePublicContactPhone(rawPhone).valid).toBe(false)
    },
  )
})
