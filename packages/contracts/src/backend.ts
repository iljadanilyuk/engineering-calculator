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

const optionalUrlTextSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}, z.string().url().nullable().optional())

const pricingRuleSchema = z.record(z.string(), z.unknown()).nullable().optional()
const sortOrderSchema = z.number().int().min(-1_000_000).max(1_000_000)
const proposalArtifactReferenceSchema = z.object({
  id: uuidSchema,
  publicToken: publicTokenSchema,
  offerNumber: z.string(),
  templateVersion: z.string(),
  pdfUrl: z.string().url().nullable(),
  storageKey: z.string().nullable(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
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

export const calculationSaveRequestSchema = leadSubmissionSchema

export const calculationRecordSchema = z.object({
  id: uuidSchema,
  publicToken: publicTokenSchema,
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
  referrer: z.string().nullable(),
  utm: z.record(z.string(), z.unknown()).nullable(),
  proposalArtifacts: z.array(proposalArtifactReferenceSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const calculationSaveResponseSchema = z.object({
  calculation: calculationRecordSchema,
})

export const projectExampleCreateRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: optionalTextSchema(2_000),
  fileUrl: z.string().url(),
  coverImageUrl: optionalUrlTextSchema,
  isPublic: z.boolean().default(true),
  sortOrder: sortOrderSchema.default(0),
})

export const projectExampleUpdateRequestSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: optionalTextSchema(2_000),
  fileUrl: z.string().url().optional(),
  coverImageUrl: optionalUrlTextSchema,
  isPublic: z.boolean().optional(),
  sortOrder: sortOrderSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const projectExampleRecordSchema = z.object({
  id: uuidSchema,
  title: z.string(),
  description: z.string().nullable(),
  fileUrl: z.string().url(),
  coverImageUrl: z.string().url().nullable(),
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
export type ServiceRecord = z.infer<typeof serviceRecordSchema>
export type ExchangeRateSettingRequest = z.infer<typeof exchangeRateSettingRequestSchema>
export type CalculationStatus = z.infer<typeof calculationStatusSchema>
export type CalculationSaveRequest = z.infer<typeof calculationSaveRequestSchema>
export type CalculationRecord = z.infer<typeof calculationRecordSchema>
export type ProjectExampleCreateRequest = z.infer<typeof projectExampleCreateRequestSchema>
export type ProjectExampleUpdateRequest = z.infer<typeof projectExampleUpdateRequestSchema>
export type ProjectExampleRecord = z.infer<typeof projectExampleRecordSchema>
