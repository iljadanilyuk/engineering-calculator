import { describe, expect, test } from 'bun:test'

import {
  projectExampleRequestSaveResponseSchema,
  projectExampleCreateRequestSchema,
  projectExampleRecordSchema,
  projectExampleReorderRequestSchema,
  projectExampleRequestCreateRequestSchema,
  publicProjectExampleRecordSchema,
  publicProjectExampleResponseSchema,
} from './backend'
import {
  blogPostCreateRequestSchema,
  blogPostRecordSchema,
  blogPostUpdateRequestSchema,
  publicBlogPostListResponseSchema,
  publicBlogPostResponseSchema,
  publicBlogPostSummarySchema,
} from './blog'

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

  test('validates sanitized project case metadata and public records without file URLs', () => {
    const createPayload = projectExampleCreateRequestSchema.parse({
      slug: 'otoplenie-doma-180m',
      title: 'Отопление частного дома',
      description: 'Санитизированное описание кейса.',
      objectType: 'Частный дом',
      location: 'Минская область',
      areaSqm: '180',
      engineeringSections: ['ОВ', 'ВК'],
      initialTask: 'Подготовить понятные листы для строителей.',
      solutionSummary: 'Разделили планы, узлы и спецификации.',
      fragments: [{
        title: 'План трасс',
        caption: 'Показывает привязки и очередность монтажа.',
        imageUrl: '/landing-v4/project-preview-plan-08.jpg',
        imageAlt: 'Фрагмент плана трасс инженерных систем',
        sortOrder: 10,
      }],
      exampleSlugs: ['ov', 'vk'],
      fileUrl: '/internal-only/example.pdf',
      isPublic: true,
      isArchived: false,
      sortOrder: 10,
    })
    const publicRecord = publicProjectExampleRecordSchema.parse({
      id: '00000000-0000-7000-8000-000000000401',
      slug: createPayload.slug,
      title: createPayload.title,
      description: createPayload.description,
      objectType: createPayload.objectType,
      location: createPayload.location,
      areaSqm: createPayload.areaSqm,
      engineeringSections: createPayload.engineeringSections,
      initialTask: createPayload.initialTask,
      solutionSummary: createPayload.solutionSummary,
      fragments: createPayload.fragments,
      exampleSlugs: createPayload.exampleSlugs,
      coverImageUrl: null,
      sortOrder: createPayload.sortOrder,
    })
    const adminRecord = projectExampleRecordSchema.parse({
      ...publicRecord,
      fileUrl: createPayload.fileUrl,
      isPublic: true,
      isArchived: false,
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
    })

    expect(publicRecord).not.toHaveProperty('fileUrl')
    expect(publicProjectExampleResponseSchema.parse({ example: publicRecord }).example).not.toHaveProperty('fileUrl')
    expect(adminRecord.exampleSlugs).toEqual(['ov', 'vk'])

    expect(() =>
      projectExampleCreateRequestSchema.parse({
        title: 'Duplicate sections',
        fileUrl: '/examples/duplicate.pdf',
        engineeringSections: ['ОВ', ' ов '],
      }),
    ).toThrow()

    expect(() =>
      projectExampleCreateRequestSchema.parse({
        title: 'Duplicate assets',
        fileUrl: '/examples/duplicate.pdf',
        exampleSlugs: ['ov', 'OV'],
      }),
    ).toThrow()
  })

  test('validates project example reorder payloads', () => {
    expect(
      projectExampleReorderRequestSchema.parse({
        examples: [
          { id: '00000000-0000-7000-8000-000000000401', sortOrder: 10 },
          { id: '00000000-0000-7000-8000-000000000402', sortOrder: 20 },
        ],
      }).examples,
    ).toHaveLength(2)

    expect(() =>
      projectExampleReorderRequestSchema.parse({
        examples: [
          { id: '00000000-0000-7000-8000-000000000401', sortOrder: 10 },
          { id: '00000000-0000-7000-8000-000000000401', sortOrder: 20 },
        ],
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

  test('validates blog post publishing contracts and public response shape', () => {
    const createPayload = blogPostCreateRequestSchema.parse({
      slug: ' Teplo-Nasos-Case ',
      title: 'Тепловой насос: когда нужен расчет',
      excerpt: 'Короткое описание статьи для каталога и SEO.',
      content: 'Plain text body.\n\n## Расчет\n\n- Нагрузка\n- Узлы',
      coverImageUrl: '/landing-v4/project-preview-plan-08.jpg',
      category: 'Практика',
      tags: ['ОВ', ' расчет '],
      status: 'published',
      publishedAt: '2026-07-20T08:00:00.000Z',
      sortOrder: 10,
    })
    const adminRecord = blogPostRecordSchema.parse({
      id: '00000000-0000-7000-8000-000000000501',
      ...createPayload,
      seoTitle: null,
      seoDescription: null,
      createdAt: '2026-07-20T08:00:00.000Z',
      updatedAt: '2026-07-20T08:00:00.000Z',
    })
    const publicSummary = publicBlogPostSummarySchema.parse({
      id: adminRecord.id,
      slug: adminRecord.slug,
      title: adminRecord.title,
      excerpt: adminRecord.excerpt,
      coverImageUrl: adminRecord.coverImageUrl,
      category: adminRecord.category,
      tags: adminRecord.tags,
      seoTitle: adminRecord.seoTitle,
      seoDescription: adminRecord.seoDescription,
      publishedAt: adminRecord.publishedAt,
      sortOrder: adminRecord.sortOrder,
      updatedAt: adminRecord.updatedAt,
    })

    expect(createPayload.slug).toBe('teplo-nasos-case')
    expect(publicSummary).not.toHaveProperty('content')
    expect(publicSummary).not.toHaveProperty('status')
    expect(publicBlogPostListResponseSchema.parse({ posts: [publicSummary] }).posts).toHaveLength(1)
    expect(publicBlogPostResponseSchema.parse({ post: { ...publicSummary, content: adminRecord.content } }).post.content).toContain('Расчет')

    expect(() =>
      blogPostCreateRequestSchema.parse({
        title: 'Bad cover',
        excerpt: 'Excerpt',
        content: 'Body',
        coverImageUrl: 'javascript:alert(1)',
      }),
    ).toThrow()

    expect(() =>
      blogPostUpdateRequestSchema.parse({
        tags: ['ОВ', ' ов '],
      }),
    ).toThrow()
  })
})
