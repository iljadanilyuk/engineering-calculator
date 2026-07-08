import { z } from 'zod'

export const CALCULATION_VERSION = 'pzk-calculation-v1'
export const AREA_SCALE = 100
export const EXCHANGE_RATE_SCALE = 10_000

const MONEY_MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER

const publicIdSchema = z.string().trim().min(1).max(128)
const decimalStringSchema = (fractionDigits: number, wholeDigits: number) =>
  z
    .string()
    .trim()
    .regex(
      new RegExp(`^(?:0|[1-9]\\d{0,${wholeDigits - 1}})(?:\\.\\d{1,${fractionDigits}})?$`),
      `Expected a positive decimal string with up to ${fractionDigits} fractional digits`,
    )

export const areaSqmSchema = decimalStringSchema(2, 8).refine(
  (value) => isPositiveScaledDecimal(value, 2),
  'Area must be greater than zero',
)

export const usdToBynRateSchema = decimalStringSchema(4, 3).refine(
  (value) => isPositiveScaledDecimal(value, 4),
  'Exchange rate must be greater than zero',
)

export const servicePricingTypeSchema = z.enum(['fixed', 'per_sqm', 'formula'])
export const supportedServicePricingTypeSchema = z.enum(['fixed', 'per_sqm'])

export const usdCentsSchema = z.number().int().nonnegative().max(MONEY_MAX_SAFE_INTEGER)
export const bynCentsSchema = z.number().int().nonnegative().max(MONEY_MAX_SAFE_INTEGER)

export const engineeringServiceSchema = z.object({
  id: publicIdSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).nullable().optional(),
  pricingType: servicePricingTypeSchema,
  priceUsdCents: usdCentsSchema,
  isActive: z.boolean(),
  sortOrder: z.number().int().min(-1_000_000).max(1_000_000).default(0),
  pricingRule: z.record(z.string(), z.unknown()).optional(),
  formulaVersion: z.string().trim().min(1).max(80).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
})

export const exchangeRateInputSchema = z.object({
  source: z.enum(['manual', 'nbrb', 'fallback']),
  usdToBynRate: usdToBynRateSchema,
  asOf: z.string().datetime().optional(),
})

export const exchangeRateSnapshotSchema = exchangeRateInputSchema.extend({
  usdToBynRateScale: z.literal(EXCHANGE_RATE_SCALE),
  usdToBynRateScaled: z.number().int().positive().max(MONEY_MAX_SAFE_INTEGER),
})

export const calculationRequestSchema = z.object({
  areaSqm: areaSqmSchema,
  selectedServiceIds: z.array(publicIdSchema).max(100).default([]),
})

export const calculationDomainInputSchema = calculationRequestSchema.extend({
  services: z.array(engineeringServiceSchema).max(500),
  exchangeRate: exchangeRateInputSchema,
})

const calculationServiceSnapshotSchema = engineeringServiceSchema.pick({
  id: true,
  title: true,
  description: true,
  pricingType: true,
  priceUsdCents: true,
  isActive: true,
  sortOrder: true,
  pricingRule: true,
  formulaVersion: true,
})

const fixedQuantitySchema = z.object({
  kind: z.literal('fixed'),
}).strict()

const areaQuantitySchema = z.object({
  kind: z.literal('area_sqm'),
  areaSqm: areaSqmSchema,
  areaSqmHundredths: z.number().int().positive().max(MONEY_MAX_SAFE_INTEGER),
}).strict()

export const calculationLineItemSchema = z.object({
  serviceId: publicIdSchema,
  serviceSnapshot: calculationServiceSnapshotSchema,
  pricingType: supportedServicePricingTypeSchema,
  quantity: z.discriminatedUnion('kind', [fixedQuantitySchema, areaQuantitySchema]),
  unitPriceUsdCents: usdCentsSchema,
  totalUsdCents: usdCentsSchema,
  totalBynCents: bynCentsSchema,
  totalBynRoundedRubles: z.number().int().nonnegative().max(MONEY_MAX_SAFE_INTEGER),
})

export const skippedCalculationServiceSchema = z.discriminatedUnion('reason', [
  z.object({
    serviceId: publicIdSchema,
    reason: z.literal('inactive'),
    serviceSnapshot: calculationServiceSnapshotSchema,
  }).strict(),
  z.object({
    serviceId: publicIdSchema,
    reason: z.literal('unsupported_pricing_type'),
    serviceSnapshot: calculationServiceSnapshotSchema,
  }).strict(),
  z.object({
    serviceId: publicIdSchema,
    reason: z.literal('not_found'),
  }).strict(),
])

export const calculationTotalsSchema = z.object({
  totalUsdCents: usdCentsSchema,
  totalBynCents: bynCentsSchema,
  totalBynRoundedRubles: z.number().int().nonnegative().max(MONEY_MAX_SAFE_INTEGER),
})

export const calculationRoundingSchema = z.object({
  usdLineRounding: z.literal('half_up_to_cent'),
  bynRateRounding: z.literal('half_up_to_cent'),
  bynTotalPolicy: z.literal('sum_rounded_line_byn_cents'),
  bynDisplayRounding: z.literal('half_up_to_whole_ruble'),
})

export const calculationResultSchema = z.object({
  calculationVersion: z.literal(CALCULATION_VERSION),
  areaSqm: areaSqmSchema,
  areaSqmHundredths: z.number().int().positive().max(MONEY_MAX_SAFE_INTEGER),
  selectedServiceIds: z.array(publicIdSchema),
  billableServiceIds: z.array(publicIdSchema),
  lineItems: z.array(calculationLineItemSchema),
  skippedServices: z.array(skippedCalculationServiceSchema),
  exchangeRate: exchangeRateSnapshotSchema,
  totals: calculationTotalsSchema,
  rounding: calculationRoundingSchema,
})

export const leadSubmissionSchema = z.object({
  clientName: z.string().trim().min(2).max(120),
  clientPhone: z.string().trim().min(5).max(40),
  objectName: z.string().trim().min(1).max(160).optional(),
  calculation: calculationRequestSchema,
  consentAccepted: z.literal(true),
  referrer: z.string().trim().max(2_048).optional(),
  utm: z.record(z.string().trim().min(1).max(64), z.string().trim().max(500)).optional(),
})

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:'
    } catch {
      return false
    }
  }, 'Expected an HTTPS URL')

export const proposalShapeSchema = z.object({
  id: publicIdSchema,
  calculationId: publicIdSchema,
  publicToken: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  offerNumber: z.string().trim().min(1).max(80),
  templateVersion: z.string().trim().min(1).max(80),
  calculationSnapshot: calculationResultSchema,
  pdfUrl: httpsUrlSchema.nullable().optional(),
  storageKey: z.string().trim().min(1).max(512).nullable().optional(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
  htmlSnapshot: z.string().max(1_000_000).nullable().optional(),
  createdAt: z.string().datetime(),
}).refine(
  (proposal) =>
    (proposal.pdfUrl && proposal.storageKey && proposal.checksumSha256) ||
    (proposal.htmlSnapshot && proposal.htmlSnapshot.trim().length > 0),
  'Proposal must include an immutable PDF artifact reference with checksum or an HTML snapshot',
)

export type ServicePricingType = z.infer<typeof servicePricingTypeSchema>
export type SupportedServicePricingType = z.infer<typeof supportedServicePricingTypeSchema>
export type EngineeringServiceInput = z.input<typeof engineeringServiceSchema>
export type EngineeringService = z.output<typeof engineeringServiceSchema>
export type ExchangeRateInput = z.input<typeof exchangeRateInputSchema>
export type ExchangeRateSnapshot = z.infer<typeof exchangeRateSnapshotSchema>
export type CalculationRequest = z.input<typeof calculationRequestSchema>
export type CalculationDomainInput = z.input<typeof calculationDomainInputSchema>
export type CalculationLineItem = z.infer<typeof calculationLineItemSchema>
export type SkippedCalculationService = z.infer<typeof skippedCalculationServiceSchema>
export type CalculationTotals = z.infer<typeof calculationTotalsSchema>
export type CalculationResult = z.infer<typeof calculationResultSchema>
export type LeadSubmission = z.input<typeof leadSubmissionSchema>
export type LeadSubmissionPayload = z.output<typeof leadSubmissionSchema>
export type ProposalShape = z.infer<typeof proposalShapeSchema>

export function calculateEngineeringOffer(input: CalculationDomainInput): CalculationResult {
  const parsed = calculationDomainInputSchema.parse(input)
  const areaSqmHundredths = decimalToScaledInt(parsed.areaSqm, 2)
  const canonicalAreaSqm = formatScaledDecimal(areaSqmHundredths, 2)
  const exchangeRateScaled = decimalToScaledInt(parsed.exchangeRate.usdToBynRate, 4)
  const exchangeRateSnapshot: ExchangeRateSnapshot = {
    ...parsed.exchangeRate,
    usdToBynRate: formatScaledDecimal(exchangeRateScaled, 4),
    usdToBynRateScale: EXCHANGE_RATE_SCALE,
    usdToBynRateScaled: exchangeRateScaled,
  }

  const servicesById = new Map(parsed.services.map((service) => [service.id, service]))
  const selectedServiceIds = uniquePreserveOrder(parsed.selectedServiceIds)
  const lineItems: CalculationLineItem[] = []
  const skippedServices: SkippedCalculationService[] = []

  for (const serviceId of selectedServiceIds) {
    const service = servicesById.get(serviceId)

    if (!service) {
      skippedServices.push({ serviceId, reason: 'not_found' })
      continue
    }

    const serviceSnapshot = toCalculationServiceSnapshot(service)

    if (!service.isActive) {
      skippedServices.push({ serviceId, reason: 'inactive', serviceSnapshot })
      continue
    }

    if (!isSupportedPricingType(service.pricingType)) {
      skippedServices.push({ serviceId, reason: 'unsupported_pricing_type', serviceSnapshot })
      continue
    }

    const totalUsdCents =
      service.pricingType === 'fixed'
        ? service.priceUsdCents
        : multiplyByScaledQuantity(service.priceUsdCents, areaSqmHundredths, AREA_SCALE)
    const totalBynCents = convertUsdCentsToBynCents(totalUsdCents, exchangeRateScaled)

    lineItems.push({
      serviceId,
      serviceSnapshot,
      pricingType: service.pricingType,
      quantity:
        service.pricingType === 'fixed'
          ? { kind: 'fixed' }
          : {
              kind: 'area_sqm',
              areaSqm: canonicalAreaSqm,
              areaSqmHundredths,
            },
      unitPriceUsdCents: service.priceUsdCents,
      totalUsdCents,
      totalBynCents,
      totalBynRoundedRubles: roundBynCentsToRubles(totalBynCents),
    })
  }

  const totalUsdCents = sumSafeIntegers(lineItems.map((lineItem) => lineItem.totalUsdCents))
  const totalBynCents = sumSafeIntegers(lineItems.map((lineItem) => lineItem.totalBynCents))

  return calculationResultSchema.parse({
    calculationVersion: CALCULATION_VERSION,
    areaSqm: canonicalAreaSqm,
    areaSqmHundredths,
    selectedServiceIds,
    billableServiceIds: lineItems.map((lineItem) => lineItem.serviceId),
    lineItems,
    skippedServices,
    exchangeRate: exchangeRateSnapshot,
    totals: {
      totalUsdCents,
      totalBynCents,
      totalBynRoundedRubles: roundBynCentsToRubles(totalBynCents),
    },
    rounding: {
      usdLineRounding: 'half_up_to_cent',
      bynRateRounding: 'half_up_to_cent',
      bynTotalPolicy: 'sum_rounded_line_byn_cents',
      bynDisplayRounding: 'half_up_to_whole_ruble',
    },
  })
}

export function convertUsdCentsToBynCents(
  usdCents: number,
  usdToBynRateScaled: number,
): number {
  assertNonnegativeSafeInteger(usdCents, 'USD cents')
  assertPositiveSafeInteger(usdToBynRateScaled, 'USD/BYN rate')

  return safeIntegerFromBigInt(
    divideAndRoundHalfUp(BigInt(usdCents) * BigInt(usdToBynRateScaled), BigInt(EXCHANGE_RATE_SCALE)),
    'BYN cents',
  )
}

export function roundBynCentsToRubles(bynCents: number): number {
  assertNonnegativeSafeInteger(bynCents, 'BYN cents')

  return safeIntegerFromBigInt(divideAndRoundHalfUp(BigInt(bynCents), 100n), 'BYN rubles')
}

function isSupportedPricingType(
  pricingType: ServicePricingType,
): pricingType is SupportedServicePricingType {
  return pricingType === 'fixed' || pricingType === 'per_sqm'
}

function toCalculationServiceSnapshot(service: EngineeringService) {
  return {
    id: service.id,
    title: service.title,
    description: service.description ?? null,
    pricingType: service.pricingType,
    priceUsdCents: service.priceUsdCents,
    isActive: service.isActive,
    sortOrder: service.sortOrder,
    pricingRule: service.pricingRule,
    formulaVersion: service.formulaVersion,
  }
}

function multiplyByScaledQuantity(priceCents: number, quantityScaled: number, scale: number): number {
  return safeIntegerFromBigInt(
    divideAndRoundHalfUp(BigInt(priceCents) * BigInt(quantityScaled), BigInt(scale)),
    'USD cents',
  )
}

function sumSafeIntegers(values: number[]): number {
  return safeIntegerFromBigInt(
    values.reduce((total, value) => total + BigInt(value), 0n),
    'money total',
  )
}

function divideAndRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new RangeError('Denominator must be positive')
  }

  return (numerator + denominator / 2n) / denominator
}

function safeIntegerFromBigInt(value: bigint, label: string): number {
  if (value > BigInt(MONEY_MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} exceeds Number.MAX_SAFE_INTEGER`)
  }

  return Number(value)
}

function assertNonnegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative safe integer`)
  }
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`)
  }
}

function uniquePreserveOrder(values: string[]): string[] {
  return [...new Set(values)]
}

function decimalToScaledInt(value: string, fractionDigits: number): number {
  const [wholePart, fractionPart = ''] = value.trim().split('.')
  const paddedFractionPart = fractionPart.padEnd(fractionDigits, '0')
  const scale = 10n ** BigInt(fractionDigits)
  const scaled =
    BigInt(wholePart) * scale +
    BigInt(paddedFractionPart === '' ? '0' : paddedFractionPart.slice(0, fractionDigits))

  return safeIntegerFromBigInt(scaled, 'decimal value')
}

function isPositiveScaledDecimal(value: string, fractionDigits: number): boolean {
  try {
    return decimalToScaledInt(value, fractionDigits) > 0
  } catch {
    return false
  }
}

function formatScaledDecimal(value: number, fractionDigits: number): string {
  const scale = 10 ** fractionDigits
  const wholePart = Math.floor(value / scale)
  const fractionPart = String(value % scale)
    .padStart(fractionDigits, '0')
    .replace(/0+$/, '')

  return fractionPart.length > 0 ? `${wholePart}.${fractionPart}` : String(wholePart)
}
