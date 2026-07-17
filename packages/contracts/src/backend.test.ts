import { describe, expect, test } from 'bun:test'

import {
  projectExampleCreateRequestSchema,
  projectExampleRequestCreateRequestSchema,
} from './backend'

describe('backend contracts', () => {
  test('validates project example public PDF URLs and paths', () => {
    expect(
      projectExampleCreateRequestSchema.parse({
        title: 'ОВ example',
        fileUrl: '/project-examples/proekt-primer-ov.pdf',
      }).fileUrl,
    ).toBe('/project-examples/proekt-primer-ov.pdf')

    expect(
      projectExampleCreateRequestSchema.parse({
        title: 'CDN example',
        fileUrl: ' https://cdn.example.com/examples/ov.pdf ',
      }).fileUrl,
    ).toBe('https://cdn.example.com/examples/ov.pdf')

    expect(() =>
      projectExampleCreateRequestSchema.parse({
        title: 'Bad protocol',
        fileUrl: 'ftp://cdn.example.com/examples/ov.pdf',
      }),
    ).toThrow()

    expect(() =>
      projectExampleCreateRequestSchema.parse({
        title: 'Protocol-relative',
        fileUrl: '//cdn.example.com/examples/ov.pdf',
      }),
    ).toThrow()
  })

  test('validates lead-gated project example request payloads', () => {
    const result = projectExampleRequestCreateRequestSchema.parse({
      idempotencyKey: 'example-request-key-001',
      clientName: '  Анна  ',
      clientPhone: '+375 29 111-22-33',
      requestedExampleSlugs: [' OV ', 'vk'],
      consentAccepted: true,
      source: 'example_request',
    })

    expect(result).toMatchObject({
      idempotencyKey: 'example-request-key-001',
      clientName: 'Анна',
      requestedExampleSlugs: ['ov', 'vk'],
      consentAccepted: true,
      source: 'example_request',
    })

    expect(
      projectExampleRequestCreateRequestSchema.parse({
        idempotencyKey: 'example-request-key-002',
        clientName: 'Анна',
        clientPhone: '+375 29 111-22-33',
        consentAccepted: true,
      }).requestedExampleSlugs,
    ).toEqual(['ov', 'vk'])

    expect(() =>
      projectExampleRequestCreateRequestSchema.parse({
        idempotencyKey: 'short',
        clientName: 'Анна',
        clientPhone: '+375 29 111-22-33',
        consentAccepted: true,
      }),
    ).toThrow()

    expect(() =>
      projectExampleRequestCreateRequestSchema.parse({
        idempotencyKey: 'example-request-key-003',
        clientName: 'Анна',
        clientPhone: '+375 29 111-22-33',
        consentAccepted: false,
      }),
    ).toThrow()
  })
})
