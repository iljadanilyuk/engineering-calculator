import { z } from 'zod'

import {
  bynCentsSchema,
  calculationResultSchema,
  calculationServiceSnapshotSchema,
  engineeringServiceSchema,
  exchangeRateInputSchema,
  exchangeRateSnapshotSchema,
  leadSubmissionSchema,
  servicePricingTypeSchema,
  skippedCalculationServiceSchema,
  usdCentsSchema,
} from './calculation'

const uuidSchema = z.string().uuid()
const publicTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/)
const optionalTextSchema = (max: number) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }, z.string().max(max).nullable().optional())

const optionalQueryTextSchema = (max: number) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  }, z.string().max(max).optional())

const projectExampleUrlSchema = z.string().trim().min(1).max(2_048).refine(
  (value) => isHttpUrl(value) || isRootRelativePublicPath(value),
  'Expected an http(s) URL or root-relative public path',
)
const optionalProjectExampleUrlSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}, projectExampleUrlSchema.nullable().optional())

const pricingRuleSchema = z.record(z.string(), z.unknown()).nullable().optional()
const sortOrderSchema = z.number().int().min(-1_000_000).max(1_000_000)
const workingServicePricingTypeSchema = z.enum(['fixed', 'per_sqm'])
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidDateOnly, 'Expected a valid calendar date')
const proposalArtifactReferenceSchema = z.object({
  id: uuidSchema,
  publicToken: publicTokenSchema,
  offerNumber: z.string(),
  templateVersion: z.string(),
  status: z.enum(['ready', 'html_only']),
  urlPath: z.string().startsWith('/api/public/proposals/'),
  pdfUrlPath: z.string().startsWith('/api/public/proposals/').optional(),
  pdfUrl: z.string().url().nullable(),
  storageKey: z.string().nullable(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  pdfByteSize: z.number().int().positive().nullable(),
  hasHtmlSnapshot: z.boolean(),
  createdAt: z.string().datetime(),
})

export const serviceVisibilitySchema = z.object({
  isActive: z.boolean(),
  isPublic: z.boolean(),
})

export const serviceCreateRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: optionalTextSchema(2_000),
  pricingType: servicePricingTypeSchema,
  priceUsdCents: usdCentsSchema,
  pricingRule: pricingRuleSchema,
  formulaVersion: optionalTextSchema(80),
  isActive: z.boolean().default(true),
  isPublic: z.boolean().default(true),
  sortOrder: sortOrderSchema.default(0),
}).superRefine((value, context) => {
  if (workingServicePricingTypeSchema.safeParse(value.pricingType).success && value.priceUsdCents <= 0) {
    context.addIssue({
      code: 'custom',
      path: ['priceUsdCents'],
      message: 'Fixed and per-square-meter services require a positive USD price',
    })
  }
})

export const serviceUpdateRequestSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: optionalTextSchema(2_000),
  pricingType: servicePricingTypeSchema.optional(),
  priceUsdCents: usdCentsSchema.optional(),
  pricingRule: pricingRuleSchema,
  formulaVersion: optionalTextSchema(80),
  isActive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  sortOrder: sortOrderSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const serviceReorderRequestSchema = z.object({
  services: z.array(z.object({
    id: uuidSchema,
    sortOrder: sortOrderSchema,
  })).min(1).max(500),
}).superRefine((value, context) => {
  const seen = new Set<string>()

  for (const [index, service] of value.services.entries()) {
    if (!seen.has(service.id)) {
      seen.add(service.id)
      continue
    }

    context.addIssue({
      code: 'custom',
      path: ['services', index, 'id'],
      message: 'Service ids must be unique in one reorder request',
    })
  }
})

export const serviceRecordSchema = engineeringServiceSchema.extend({
  id: uuidSchema,
  isPublic: z.boolean(),
  pricingRule: z.record(z.string(), z.unknown()).nullable().optional(),
  formulaVersion: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const serviceListResponseSchema = z.object({
  services: z.array(serviceRecordSchema),
})

export const publicCalculatorConfigResponseSchema = z.object({
  services: z.array(serviceRecordSchema),
  exchangeRate: exchangeRateSnapshotSchema,
  exchangeRateUpdatedAt: z.string().datetime(),
})

export const serviceResponseSchema = z.object({
  service: serviceRecordSchema,
})

export const exchangeRateSettingRequestSchema = exchangeRateInputSchema

export const exchangeRateSettingResponseSchema = z.object({
  exchangeRate: exchangeRateSnapshotSchema,
  updatedAt: z.string().datetime(),
})

export const calculationStatusSchema = z.enum([
  'new',
  'contacted',
  'in_progress',
  'won',
  'lost',
  'spam_test',
])

const optionalCalculationStatusQuerySchema = z.preprocess((value) => {
  if (value === '' || value === 'all') return undefined
  return value
}, calculationStatusSchema.optional())

export const calculationSaveRequestSchema = leadSubmissionSchema

export const calculationRecordSchema = z.object({
  id: uuidSchema,
  publicToken: publicTokenSchema,
  idempotencyKey: z.string().nullable(),
  requestFingerprintHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  duplicateFingerprintHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  duplicateWindowStartedAt: z.string().datetime().nullable(),
  clientName: z.string(),
  clientPhone: z.string(),
  objectName: z.string().nullable(),
  areaSqm: z.string(),
  areaSqmHundredths: z.number().int().positive(),
  selectedServiceIds: z.array(z.string()),
  serviceSnapshots: z.array(calculationServiceSnapshotSchema),
  skippedServices: z.array(skippedCalculationServiceSchema),
  exchangeRate: exchangeRateSnapshotSchema,
  calculationVersion: z.string(),
  calculationSnapshot: calculationResultSchema,
  totalUsdCents: usdCentsSchema,
  totalBynCents: bynCentsSchema,
  totalBynRoundedRubles: z.number().int().nonnegative(),
  status: calculationStatusSchema,
  statusUpdatedAt: z.string().datetime(),
  notes: z.string().nullable(),
  source: z.string().nullable(),
  referrer: z.string().nullable(),
  utm: z.record(z.string(), z.unknown()).nullable(),
  consentAcceptedAt: z.string().datetime().nullable(),
  consentVersion: z.string().nullable(),
  consentText: z.string().nullable(),
  consentIpAddress: z.string().nullable(),
  consentUserAgent: z.string().nullable(),
  proposalArtifacts: z.array(proposalArtifactReferenceSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const publicCalculationReadyProposalSchema = z.object({
  status: z.literal('ready'),
  publicToken: publicTokenSchema,
  offerNumber: z.string(),
  urlPath: z.string().startsWith('/api/public/proposals/'),
  pdfUrlPath: z.string().startsWith('/api/public/proposals/'),
})

const publicCalculationHtmlOnlyProposalSchema = z.object({
  status: z.literal('html_only'),
  publicToken: publicTokenSchema,
  offerNumber: z.string(),
  urlPath: z.string().startsWith('/api/public/proposals/'),
})

export const publicCalculationProposalSchema = z.discriminatedUnion('status', [
  publicCalculationReadyProposalSchema,
  publicCalculationHtmlOnlyProposalSchema,
])

export const publicCalculationRecordSchema = z.object({
  publicToken: publicTokenSchema,
  clientPhone: z.string(),
  areaSqm: z.string(),
  areaSqmHundredths: z.number().int().positive(),
  selectedServiceIds: z.array(z.string()),
  serviceSnapshots: z.array(calculationServiceSnapshotSchema),
  exchangeRate: exchangeRateSnapshotSchema,
  calculationVersion: z.string(),
  calculationSnapshot: calculationResultSchema,
  totalUsdCents: usdCentsSchema,
  totalBynCents: bynCentsSchema,
  totalBynRoundedRubles: z.number().int().nonnegative(),
  proposal: publicCalculationProposalSchema.nullable(),
  createdAt: z.string().datetime(),
})

export const calculationSaveResponseSchema = z.object({
  calculation: calculationRecordSchema,
})

export const calculationListItemSchema = calculationRecordSchema.pick({
  id: true,
  clientName: true,
  clientPhone: true,
  objectName: true,
  areaSqm: true,
  serviceSnapshots: true,
  totalUsdCents: true,
  totalBynCents: true,
  totalBynRoundedRubles: true,
  status: true,
  statusUpdatedAt: true,
  notes: true,
  proposalArtifacts: true,
  createdAt: true,
  updatedAt: true,
})

export const calculationStatusCountsSchema = z.object({
  new: z.number().int().nonnegative(),
  contacted: z.number().int().nonnegative(),
  in_progress: z.number().int().nonnegative(),
  won: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative(),
  spam_test: z.number().int().nonnegative(),
})

export const calculationListQuerySchema = z.object({
  status: optionalCalculationStatusQuerySchema,
  search: optionalQueryTextSchema(120),
  phone: optionalQueryTextSchema(40),
  name: optionalQueryTextSchema(120),
  createdFrom: dateOnlySchema.optional(),
  createdTo: dateOnlySchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
}).superRefine((value, context) => {
  if (!value.createdFrom || !value.createdTo) return
  if (value.createdFrom <= value.createdTo) return

  context.addIssue({
    code: 'custom',
    path: ['createdTo'],
    message: 'createdTo must be on or after createdFrom',
  })
})

export const calculationUpdateRequestSchema = z.object({
  status: calculationStatusSchema.optional(),
  notes: optionalTextSchema(5_000),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const calculationListResponseSchema = z.object({
  calculations: z.array(calculationListItemSchema),
  summary: z.object({
    totalCount: z.number().int().nonnegative(),
    activeCount: z.number().int().nonnegative(),
    spamTestCount: z.number().int().nonnegative(),
    filteredCount: z.number().int().nonnegative(),
    statusCounts: calculationStatusCountsSchema,
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  }),
})

export const publicCalculationSaveResponseSchema = z.object({
  calculation: publicCalculationRecordSchema,
})

export const projectExampleCreateRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: optionalTextSchema(2_000),
  fileUrl: projectExampleUrlSchema,
  coverImageUrl: optionalProjectExampleUrlSchema,
  isPublic: z.boolean().default(true),
  sortOrder: sortOrderSchema.default(0),
})

export const projectExampleUpdateRequestSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: optionalTextSchema(2_000),
  fileUrl: projectExampleUrlSchema.optional(),
  coverImageUrl: optionalProjectExampleUrlSchema,
  isPublic: z.boolean().optional(),
  sortOrder: sortOrderSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const projectExampleRecordSchema = z.object({
  id: uuidSchema,
  title: z.string(),
  description: z.string().nullable(),
  fileUrl: projectExampleUrlSchema,
  coverImageUrl: projectExampleUrlSchema.nullable(),
  isPublic: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const projectExampleListResponseSchema = z.object({
  examples: z.array(projectExampleRecordSchema),
})

export const projectExampleResponseSchema = z.object({
  example: projectExampleRecordSchema,
})

export type ServiceCreateRequest = z.infer<typeof serviceCreateRequestSchema>
export type ServiceUpdateRequest = z.infer<typeof serviceUpdateRequestSchema>
export type ServiceReorderRequest = z.infer<typeof serviceReorderRequestSchema>
export type ServiceRecord = z.infer<typeof serviceRecordSchema>
export type ServiceListResponse = z.infer<typeof serviceListResponseSchema>
export type ServiceResponse = z.infer<typeof serviceResponseSchema>
export type PublicCalculatorConfigResponse = z.infer<typeof publicCalculatorConfigResponseSchema>
export type ExchangeRateSettingRequest = z.infer<typeof exchangeRateSettingRequestSchema>
export type ExchangeRateSettingResponse = z.infer<typeof exchangeRateSettingResponseSchema>
export type CalculationStatus = z.infer<typeof calculationStatusSchema>
export type CalculationSaveRequest = z.infer<typeof calculationSaveRequestSchema>
export type CalculationRecord = z.infer<typeof calculationRecordSchema>
export type CalculationListItem = z.infer<typeof calculationListItemSchema>
export type CalculationListQueryInput = z.input<typeof calculationListQuerySchema>
export type CalculationListQuery = z.infer<typeof calculationListQuerySchema>
export type CalculationListResponse = z.infer<typeof calculationListResponseSchema>
export type CalculationUpdateRequest = z.infer<typeof calculationUpdateRequestSchema>
export type PublicCalculationRecord = z.infer<typeof publicCalculationRecordSchema>
export type ProjectExampleCreateRequest = z.infer<typeof projectExampleCreateRequestSchema>
export type ProjectExampleUpdateRequest = z.infer<typeof projectExampleUpdateRequestSchema>
export type ProjectExampleRecord = z.infer<typeof projectExampleRecordSchema>

function isValidDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isRootRelativePublicPath(value: string) {
  if (!value.startsWith('/') || value.startsWith('//')) return false
  if (/\s/.test(value)) return false

  try {
    new URL(value, 'https://example.com')
    return true
  } catch {
    return false
  }
}
