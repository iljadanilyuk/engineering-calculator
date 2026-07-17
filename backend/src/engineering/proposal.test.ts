import { calculateEngineeringOffer } from '@poznyak-engineering-calculator/contracts'
import { describe, expect, test } from 'bun:test'

import {
  commercialProposalTemplateVersion,
  createCommercialProposalArtifact,
  renderCommercialProposalHtmlSnapshot,
  sha256Hex,
  type CommercialProposalInput,
} from './proposal'

describe('commercial proposal generation', () => {
  test('creates a self-contained Cyrillic commercial offer artifact with checksum metadata', async () => {
    const input = proposalInput()
    const artifact = await createCommercialProposalArtifact(input, async (html) =>
      new TextEncoder().encode(`%PDF-1.4\n${html}\n%%EOF`),
    )

    expect(artifact.templateVersion).toBe(commercialProposalTemplateVersion)
    expect(artifact.htmlSnapshot).toContain('<!doctype html>')
    expect(artifact.htmlSnapshot).toContain('Коммерческое предложение')
    expect(artifact.htmlSnapshot).toContain('Андрей Клиент')
    expect(artifact.htmlSnapshot).toContain('Дом в Ратомке')
    expect(artifact.htmlSnapshot).toContain('Площадь')
    expect(artifact.htmlSnapshot).toContain('Итого к проектированию')
    expect(artifact.htmlSnapshot).toContain('70% старт / 30%')
    expect(artifact.htmlSnapshot).toContain('Открыть раздел с примерами')
    expect(artifact.htmlSnapshot).not.toContain('/project-examples/proekt-primer-ov.pdf')
    expect(artifact.htmlSnapshot).not.toContain('/project-examples/primer-proekt-vk.pdf')
    expect(artifact.htmlSnapshot).toContain('PDF-комплект для согласования и монтажа')
    expect(countMatches(artifact.htmlSnapshot, 'class="pdf-page')).toBe(2)
    expect(artifact.pdfByteSize).toBe(artifact.pdfBytes.byteLength)
    expect(artifact.checksumSha256).toBe(sha256Hex(artifact.pdfBytes))
    expect(artifact.storageKey).toMatch(/^proposals\/2026\/07\/pzk-2026-/)
  })

  test('keeps long service lists compact enough for the two-page layout', () => {
    const input = proposalInput(11)
    const html = renderCommercialProposalHtmlSnapshot(input)

    expect(countMatches(html, 'class="pdf-page')).toBe(2)
    expect(countMatches(html, 'class="service-row"')).toBe(8)
    expect(countMatches(html, 'class="service-row muted"')).toBe(1)
    expect(html).toContain('Еще 3 раздел(ов) зафиксировано в расчете')
    expect(sumVisibleServiceRubles(html) + remainingRubles(html)).toBe(
      input.calculation.totals.totalBynRoundedRubles,
    )
  })

  test('reconciles displayed BYN service rows with the headline total', () => {
    const input = proposalInput(5)
    const html = renderCommercialProposalHtmlSnapshot(input)

    expect(sumVisibleServiceRubles(html)).toBe(input.calculation.totals.totalBynRoundedRubles)
  })

  test('keeps custom project example proof cards without exposing direct PDF links', () => {
    const input = {
      ...proposalInput(),
      sourcePageUrl: 'https://website.example.com/calculator',
      projectExamples: [
        {
          code: 'ОВ',
          title: 'Approved OV PDF',
          description: 'Approved public heating example.',
          fileUrl: 'https://cdn.example.com/examples/approved-ov.pdf',
        },
        {
          title: 'Relative VK PDF',
          description: 'Approved relative public example.',
          fileUrl: '/media/examples/approved-vk.pdf',
        },
      ],
    } satisfies CommercialProposalInput
    const html = renderCommercialProposalHtmlSnapshot(input)

    expect(html).toContain('Approved OV PDF')
    expect(html).not.toContain('https://cdn.example.com/examples/approved-ov.pdf')
    expect(html).toContain('Relative VK PDF')
    expect(html).not.toContain('https://website.example.com/media/examples/approved-vk.pdf')
    expect(countMatches(html, 'Открыть раздел с примерами')).toBeGreaterThanOrEqual(2)
    expect(html).not.toContain('proekt-primer-ov.pdf')
    expect(html).not.toContain('primer-proekt-vk.pdf')
  })
})

function proposalInput(serviceCount = 3): CommercialProposalInput {
  const services = Array.from({ length: serviceCount }, (_, index) => ({
    id: `service-${index + 1}`,
    title: `Раздел проекта ${index + 1}`,
    description: `Описание раздела ${index + 1}`,
    pricingType: index % 2 === 0 ? ('fixed' as const) : ('per_sqm' as const),
    priceUsdCents: index % 2 === 0 ? 20_000 : 150,
    isActive: true,
    sortOrder: index + 1,
  }))
  const calculation = calculateEngineeringOffer({
    areaSqm: '180',
    selectedServiceIds: services.map((service) => service.id),
    services,
    exchangeRate: {
      source: 'manual',
      usdToBynRate: '3.2150',
      asOf: '2026-07-09T00:00:00.000Z',
    },
  })

  return {
    offerNumber: 'PZK-2026-TESTPDF',
    publicToken: 'a'.repeat(32),
    clientName: 'Андрей Клиент',
    clientPhone: '+375291112233',
    objectName: 'Дом в Ратомке',
    calculation,
    issuedAt: new Date('2026-07-09T10:00:00.000Z'),
    sourcePageUrl: 'https://example.com/calculator',
  }
}

function countMatches(value: string, needle: string) {
  return value.split(needle).length - 1
}

function sumVisibleServiceRubles(html: string) {
  return [...html.matchAll(/<div class="service-row">[\s\S]*?<em>([\d\s]+) BYN/g)].reduce(
    (total, match) => total + Number(match[1].replace(/\s/g, '')),
    0,
  )
}

function remainingRubles(html: string) {
  const match = html.match(/<div class="service-row muted">[\s\S]*?<em>([\d\s]+) BYN<small>остаток<\/small>/)
  return match ? Number(match[1].replace(/\s/g, '')) : 0
}
