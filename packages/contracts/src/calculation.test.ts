import { describe, expect, test } from 'bun:test'

import {
  CALCULATION_VERSION,
  calculateEngineeringOffer,
  calculationDomainInputSchema,
  calculationResultSchema,
  convertUsdCentsToBynCents,
  engineeringServiceSchema,
  leadSubmissionSchema,
  proposalShapeSchema,
  roundBynCentsToRubles,
  serviceCreateRequestSchema,
  serviceReorderRequestSchema,
} from './index'

const activeFixedService = {
  id: 'service-fixed-heating',
  title: 'Heating design package',
  description: 'Fixed engineering package',
  pricingType: 'fixed' as const,
  priceUsdCents: 50_000,
  isActive: true,
  sortOrder: 10,
}

const activePerSqmService = {
  id: 'service-per-sqm-heating',
  title: 'Heating drawings per square meter',
  description: 'Area based heating drawings',
  pricingType: 'per_sqm' as const,
  priceUsdCents: 1_000,
  isActive: true,
  sortOrder: 20,
}

const inactiveService = {
  id: 'service-inactive',
  title: 'Inactive ventilation audit',
  pricingType: 'per_sqm' as const,
  priceUsdCents: 1_000,
  isActive: false,
  sortOrder: 30,
}

const manualRate = {
  source: 'manual' as const,
  usdToBynRate: '3.2500',
  asOf: '2026-07-08T00:00:00.000Z',
}

describe('engineering calculation domain', () => {
  test('calculates a normal mixed fixed and per-square-meter offer', () => {
    const result = calculateEngineeringOffer({
      areaSqm: '120.50',
      selectedServiceIds: [activeFixedService.id, activePerSqmService.id],
      services: [activeFixedService, activePerSqmService],
      exchangeRate: manualRate,
    })

    expect(result).toMatchObject({
      calculationVersion: CALCULATION_VERSION,
      areaSqm: '120.5',
      areaSqmHundredths: 12_050,
      selectedServiceIds: [activeFixedService.id, activePerSqmService.id],
      billableServiceIds: [activeFixedService.id, activePerSqmService.id],
      exchangeRate: {
        usdToBynRate: '3.25',
        usdToBynRateScale: 10_000,
        usdToBynRateScaled: 32_500,
      },
      totals: {
        totalUsdCents: 170_500,
        totalBynCents: 554_125,
        totalBynRoundedRubles: 5_541,
      },
      rounding: {
        usdLineRounding: 'half_up_to_cent',
        bynRateRounding: 'half_up_to_cent',
        bynTotalPolicy: 'sum_rounded_line_byn_cents',
        bynDisplayRounding: 'half_up_to_whole_ruble',
      },
    })
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems[0]).toMatchObject({
      serviceId: activeFixedService.id,
      pricingType: 'fixed',
      quantity: { kind: 'fixed' },
      totalUsdCents: 50_000,
      totalBynCents: 162_500,
      totalBynRoundedRubles: 1_625,
    })
    expect(result.lineItems[1]).toMatchObject({
      serviceId: activePerSqmService.id,
      pricingType: 'per_sqm',
      quantity: {
        kind: 'area_sqm',
        areaSqm: '120.5',
        areaSqmHundredths: 12_050,
      },
      totalUsdCents: 120_500,
      totalBynCents: 391_625,
      totalBynRoundedRubles: 3_916,
    })
    expect(result.skippedServices).toEqual([])
    expect(calculationResultSchema.parse(result)).toEqual(result)
  })

  test('returns a zero total for an empty service selection', () => {
    const result = calculateEngineeringOffer({
      areaSqm: '100',
      selectedServiceIds: [],
      services: [activeFixedService, activePerSqmService],
      exchangeRate: manualRate,
    })

    expect(result.lineItems).toEqual([])
    expect(result.skippedServices).toEqual([])
    expect(result.totals).toEqual({
      totalUsdCents: 0,
      totalBynCents: 0,
      totalBynRoundedRubles: 0,
    })
  })

  test('calculates fixed-only services', () => {
    const result = calculateEngineeringOffer({
      areaSqm: '80',
      selectedServiceIds: [activeFixedService.id],
      services: [activeFixedService],
      exchangeRate: manualRate,
    })

    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems[0]?.quantity).toEqual({ kind: 'fixed' })
    expect(result.totals).toEqual({
      totalUsdCents: 50_000,
      totalBynCents: 162_500,
      totalBynRoundedRubles: 1_625,
    })
  })

  test('calculates per-square-meter-only services', () => {
    const result = calculateEngineeringOffer({
      areaSqm: '80',
      selectedServiceIds: [activePerSqmService.id],
      services: [activePerSqmService],
      exchangeRate: {
        source: 'nbrb',
        usdToBynRate: '3.3333',
      },
    })

    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems[0]).toMatchObject({
      quantity: {
        kind: 'area_sqm',
        areaSqm: '80',
        areaSqmHundredths: 8_000,
      },
      totalUsdCents: 80_000,
      totalBynCents: 266_664,
      totalBynRoundedRubles: 2_667,
    })
    expect(result.totals).toEqual({
      totalUsdCents: 80_000,
      totalBynCents: 266_664,
      totalBynRoundedRubles: 2_667,
    })
  })

  test('handles large areas with integer math and no precision drift', () => {
    const largeAreaService = {
      ...activePerSqmService,
      id: 'service-large-area',
      priceUsdCents: 199,
    }

    const result = calculateEngineeringOffer({
      areaSqm: '1000000.25',
      selectedServiceIds: [largeAreaService.id],
      services: [largeAreaService],
      exchangeRate: {
        source: 'manual',
        usdToBynRate: '3.1000',
      },
    })

    expect(result.lineItems[0]).toMatchObject({
      totalUsdCents: 199_000_050,
      totalBynCents: 616_900_155,
      totalBynRoundedRubles: 6_169_002,
    })
    expect(result.totals).toEqual({
      totalUsdCents: 199_000_050,
      totalBynCents: 616_900_155,
      totalBynRoundedRubles: 6_169_002,
    })
  })

  test('skips inactive selected services without billing them', () => {
    const result = calculateEngineeringOffer({
      areaSqm: '10',
      selectedServiceIds: [activeFixedService.id, inactiveService.id, 'missing-service'],
      services: [activeFixedService, inactiveService],
      exchangeRate: {
        source: 'manual',
        usdToBynRate: '2.0000',
      },
    })

    expect(result.billableServiceIds).toEqual([activeFixedService.id])
    expect(result.totals).toEqual({
      totalUsdCents: 50_000,
      totalBynCents: 100_000,
      totalBynRoundedRubles: 1_000,
    })
    expect(result.skippedServices).toEqual([
      {
        serviceId: inactiveService.id,
        reason: 'inactive',
        serviceSnapshot: {
          id: inactiveService.id,
          title: inactiveService.title,
          description: null,
          pricingType: inactiveService.pricingType,
        priceUsdCents: inactiveService.priceUsdCents,
        isActive: false,
        sortOrder: inactiveService.sortOrder,
        pricingRule: undefined,
        formulaVersion: undefined,
      },
    },
      {
        serviceId: 'missing-service',
        reason: 'not_found',
      },
    ])
  })

  test('uses one half-up rounding policy for USD cents, BYN cents, and BYN rubles', () => {
    const halfCentService = {
      id: 'service-half-cent',
      title: 'Half-cent check',
      pricingType: 'per_sqm' as const,
      priceUsdCents: 1,
      isActive: true,
      sortOrder: 1,
    }

    const result = calculateEngineeringOffer({
      areaSqm: '0.50',
      selectedServiceIds: [halfCentService.id],
      services: [halfCentService],
      exchangeRate: {
        source: 'manual',
        usdToBynRate: '1.5000',
      },
    })

    expect(result.lineItems[0]).toMatchObject({
      totalUsdCents: 1,
      totalBynCents: 2,
      totalBynRoundedRubles: 0,
    })
    expect(convertUsdCentsToBynCents(1, 15_000)).toBe(2)
    expect(roundBynCentsToRubles(149)).toBe(1)
    expect(roundBynCentsToRubles(150)).toBe(2)
    expect(() => convertUsdCentsToBynCents(-1, 15_000)).toThrow(RangeError)
    expect(() => convertUsdCentsToBynCents(1, 0)).toThrow(RangeError)
    expect(() => roundBynCentsToRubles(-1)).toThrow(RangeError)
  })

  test('sums rounded BYN line cents so totals reconcile with the breakdown', () => {
    const firstSmallService = {
      id: 'service-small-1',
      title: 'Small fixed service 1',
      pricingType: 'fixed' as const,
      priceUsdCents: 1,
      isActive: true,
      sortOrder: 1,
    }
    const secondSmallService = {
      id: 'service-small-2',
      title: 'Small fixed service 2',
      pricingType: 'fixed' as const,
      priceUsdCents: 1,
      isActive: true,
      sortOrder: 2,
    }

    const result = calculateEngineeringOffer({
      areaSqm: '1',
      selectedServiceIds: [firstSmallService.id, secondSmallService.id],
      services: [firstSmallService, secondSmallService],
      exchangeRate: {
        source: 'manual',
        usdToBynRate: '1.5000',
      },
    })

    expect(result.lineItems.map((lineItem) => lineItem.totalBynCents)).toEqual([2, 2])
    expect(result.totals).toEqual({
      totalUsdCents: 2,
      totalBynCents: 4,
      totalBynRoundedRubles: 0,
    })
  })

  test('skips unsupported formula services with snapshots for future formulas', () => {
    const formulaService = {
      id: 'service-formula',
      title: 'Formula service',
      pricingType: 'formula' as const,
      priceUsdCents: 0,
      isActive: true,
      sortOrder: 4,
      pricingRule: {
        kind: 'minimum_plus_area',
      },
      formulaVersion: 'future-v1',
    }

    const result = calculateEngineeringOffer({
      areaSqm: '40',
      selectedServiceIds: [formulaService.id],
      services: [formulaService],
      exchangeRate: manualRate,
    })

    expect(result.lineItems).toEqual([])
    expect(result.totals).toEqual({
      totalUsdCents: 0,
      totalBynCents: 0,
      totalBynRoundedRubles: 0,
    })
    expect(result.skippedServices).toEqual([
      {
        serviceId: formulaService.id,
        reason: 'unsupported_pricing_type',
        serviceSnapshot: {
          id: formulaService.id,
          title: formulaService.title,
          description: null,
          pricingType: 'formula',
          priceUsdCents: 0,
          isActive: true,
          sortOrder: 4,
          pricingRule: {
            kind: 'minimum_plus_area',
          },
          formulaVersion: 'future-v1',
        },
      },
    ])
  })

  test('rejects inconsistent quantity and skipped-service contract shapes', () => {
    const calculation = calculateEngineeringOffer({
      areaSqm: '10',
      selectedServiceIds: [activePerSqmService.id],
      services: [activePerSqmService],
      exchangeRate: manualRate,
    })
    const lineItem = calculation.lineItems[0]
    const skippedService = {
      serviceId: activePerSqmService.id,
      serviceSnapshot: lineItem?.serviceSnapshot,
    }

    expect(() =>
      calculationResultSchema.parse({
        ...calculation,
        lineItems: [
          {
            ...lineItem,
            quantity: {
              kind: 'area_sqm',
            },
          },
        ],
      }),
    ).toThrow()

    expect(() =>
      calculationResultSchema.parse({
        ...calculation,
        lineItems: [
          {
            ...lineItem,
            quantity: {
              kind: 'fixed',
              areaSqm: '10',
              areaSqmHundredths: 1_000,
            },
          },
        ],
      }),
    ).toThrow()

    expect(() =>
      calculationResultSchema.parse({
        ...calculation,
        skippedServices: [
          {
            serviceId: activePerSqmService.id,
            reason: 'inactive',
          },
        ],
      }),
    ).toThrow()

    expect(() =>
      calculationResultSchema.parse({
        ...calculation,
        skippedServices: [
          {
            ...skippedService,
            reason: 'not_found',
          },
        ],
      }),
    ).toThrow()
  })

  test('validates service, calculation, lead submission, and proposal contract shapes', () => {
    const service = engineeringServiceSchema.parse({
      id: 'service-contract',
      title: '  Contract service  ',
      pricingType: 'fixed',
      priceUsdCents: 12_345,
      isActive: true,
    })
    expect(service).toMatchObject({
      id: 'service-contract',
      title: 'Contract service',
      sortOrder: 0,
    })

    const calculationInput = calculationDomainInputSchema.parse({
      areaSqm: '45.25',
      selectedServiceIds: [service.id],
      services: [service],
      exchangeRate: {
        source: 'fallback',
        usdToBynRate: '3.2000',
      },
    })
    const calculation = calculateEngineeringOffer(calculationInput)

    expect(
      leadSubmissionSchema.parse({
        idempotencyKey: 'lead-submit-key-001',
        clientName: '  Анна Позняк  ',
        clientPhone: '+375 29 123-45-67',
        calculation: {
          areaSqm: '45.25',
          selectedServiceIds: [service.id],
        },
        consentAccepted: true,
        source: 'public_website',
        utm: {
          source: 'google',
        },
      }),
    ).toMatchObject({
      idempotencyKey: 'lead-submit-key-001',
      clientName: 'Анна Позняк',
      clientPhone: '+375 29 123-45-67',
      source: 'public_website',
      calculation: {
        areaSqm: '45.25',
        selectedServiceIds: [service.id],
      },
      consentAccepted: true,
    })

    expect(
      proposalShapeSchema.parse({
        id: 'proposal_1',
        calculationId: 'calculation_1',
        publicToken: 'a'.repeat(32),
        offerNumber: 'PZK-2026-0001',
        templateVersion: 'proposal-v1',
        calculationSnapshot: calculation,
        pdfUrl: 'https://example.com/proposals/pzk-2026-0001.pdf',
        storageKey: 'proposals/pzk-2026-0001.pdf',
        checksumSha256: 'b'.repeat(64),
        createdAt: '2026-07-08T00:00:00.000Z',
      }),
    ).toMatchObject({
      id: 'proposal_1',
      publicToken: 'a'.repeat(32),
      calculationSnapshot: calculation,
    })

    expect(() =>
      leadSubmissionSchema.parse({
        idempotencyKey: 'short',
        clientName: 'A',
        clientPhone: '1234',
        calculation: {
          areaSqm: '0',
          selectedServiceIds: [service.id],
        },
        consentAccepted: false,
      }),
    ).toThrow()

    expect(() =>
      leadSubmissionSchema.parse({
        idempotencyKey: 'not valid key with spaces',
        clientName: 'Анна Позняк',
        clientPhone: '+375 29 123-45-67',
        calculation: {
          areaSqm: '45.25',
          selectedServiceIds: [service.id],
        },
        consentAccepted: true,
      }),
    ).toThrow()

    expect(() =>
      proposalShapeSchema.parse({
        id: 'proposal_1',
        calculationId: 'calculation_1',
        publicToken: 'short',
        offerNumber: 'PZK-2026-0001',
        templateVersion: 'proposal-v1',
        calculationSnapshot: calculation,
        pdfUrl: 'http://example.com/proposal.pdf',
        createdAt: '2026-07-08T00:00:00.000Z',
      }),
    ).toThrow()

    expect(() =>
      proposalShapeSchema.parse({
        id: 'proposal_1',
        calculationId: 'calculation_1',
        publicToken: 'c'.repeat(32),
        offerNumber: 'PZK-2026-0001',
        templateVersion: 'proposal-v1',
        calculationSnapshot: calculation,
        pdfUrl: 'not a url',
        storageKey: 'proposals/pzk-2026-0001.pdf',
        checksumSha256: 'b'.repeat(64),
        createdAt: '2026-07-08T00:00:00.000Z',
      }),
    ).toThrow()

    expect(() =>
      proposalShapeSchema.parse({
        id: 'proposal_1',
        calculationId: 'calculation_1',
        publicToken: 'd'.repeat(32),
        offerNumber: 'PZK-2026-0001',
        templateVersion: 'proposal-v1',
        calculationSnapshot: calculation,
        createdAt: '2026-07-08T00:00:00.000Z',
      }),
    ).toThrow()

    expect(
      proposalShapeSchema.parse({
        id: 'proposal_2',
        calculationId: 'calculation_2',
        publicToken: 'e'.repeat(32),
        offerNumber: 'PZK-2026-0002',
        templateVersion: 'proposal-v1',
        calculationSnapshot: calculation,
        htmlSnapshot: '<main>Immutable offer</main>',
        createdAt: '2026-07-08T00:00:00.000Z',
      }),
    ).toMatchObject({
      id: 'proposal_2',
      htmlSnapshot: '<main>Immutable offer</main>',
    })
  })

  test('validates admin service management contract shapes', () => {
    expect(
      serviceCreateRequestSchema.parse({
        title: '  Boiler room  ',
        pricingType: 'fixed',
        priceUsdCents: 20_000,
      }),
    ).toMatchObject({
      title: 'Boiler room',
      pricingType: 'fixed',
      priceUsdCents: 20_000,
      isActive: true,
      isPublic: true,
      sortOrder: 0,
    })

    expect(() =>
      serviceCreateRequestSchema.parse({
        title: 'Zero price',
        pricingType: 'per_sqm',
        priceUsdCents: 0,
      }),
    ).toThrow()

    expect(
      serviceReorderRequestSchema.parse({
        services: [
          { id: '00000000-0000-7000-8000-000000000001', sortOrder: 20 },
          { id: '00000000-0000-7000-8000-000000000002', sortOrder: 10 },
        ],
      }),
    ).toEqual({
      services: [
        { id: '00000000-0000-7000-8000-000000000001', sortOrder: 20 },
        { id: '00000000-0000-7000-8000-000000000002', sortOrder: 10 },
      ],
    })

    expect(() =>
      serviceReorderRequestSchema.parse({
        services: [
          { id: '00000000-0000-7000-8000-000000000001', sortOrder: 20 },
          { id: '00000000-0000-7000-8000-000000000001', sortOrder: 10 },
        ],
      }),
    ).toThrow()
  })
})
