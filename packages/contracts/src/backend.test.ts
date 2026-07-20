import { describe, expect, test } from 'bun:test'

import {
  projectExampleRequestSaveResponseSchema,
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

  test('validates public Telegram delivery metadata without requiring Telegram secrets', () => {
    const result = projectExampleRequestSaveResponseSchema.parse({
      request: {
        publicToken: 'a'.repeat(32),
        clientPhone: '+375291112233',
        requestedExamples: [
          {
            slug: 'ov',
            code: 'ОВ',
            title: 'Example OV',
            description: 'Example description',
            fileName: 'proekt-primer-ov.pdf',
            pageCount: 39,
            fileSizeBytes: 5_607_314,
            urlPath: `/api/public/project-example-requests/${'a'.repeat(32)}/examples/ov`,
          },
        ],
        telegramDelivery: {
          status: 'pending_start',
          deepLinkUrl: `https://t.me/PoznyakCalcBot?start=${'b'.repeat(32)}`,
        },
        createdAt: '2026-07-20T00:00:00.000Z',
      },
    })

    expect(result.request.telegramDelivery?.status).toBe('pending_start')
    expect(result.request.telegramDelivery?.deepLinkUrl).not.toContain('telegram-secret-token')
  })
})
