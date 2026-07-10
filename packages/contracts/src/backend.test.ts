import { describe, expect, test } from 'bun:test'

import { projectExampleCreateRequestSchema } from './backend'

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
})
