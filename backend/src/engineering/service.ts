import {
  EXCHANGE_RATE_SCALE,
  calculateEngineeringOffer,
  calculationResultSchema,
  exchangeRateInputSchema,
  type CalculationRecord,
  type CalculationResult,
  type CalculationSaveRequest,
  type ExchangeRateInput,
  type ExchangeRateSnapshot,
  type ProjectExampleCreateRequest,
  type ProjectExampleRecord,
  type ProjectExampleUpdateRequest,
  type PublicCalculationRecord,
  type ServiceCreateRequest,
  type ServiceRecord,
  type ServiceUpdateRequest,
} from '@poznyak-engineering-calculator/contracts'
import { createHash, randomBytes } from 'node:crypto'

import type { DbClient } from '../db'
import { Prisma } from '../generated/prisma/client'
import { AppError } from '../http/errors'

const exchangeRateSettingKey = 'exchange_rate'
const defaultLeadSource = 'public_calculator'
const duplicateDetectionWindowMs = 10 * 60 * 1_000
const pendingProposalTemplateVersion = 'proposal-pending-v1'
const consentVersion = 'pzk-public-lead-consent-v1'
const consentText =
  'Согласен на обработку имени, телефона и выбранного расчета для подготовки коммерческого предложения.'

type ServiceRow = Awaited<ReturnType<DbClient['service']['findFirstOrThrow']>>
type CalculationRow = Awaited<ReturnType<DbClient['calculation']['findFirstOrThrow']>>
type ProjectExampleRow = Awaited<ReturnType<DbClient['projectExample']['findFirstOrThrow']>>
type ProposalRow = {
  id: string
  publicToken: string
  offerNumber: string
  templateVersion: string
  pdfUrl: string | null
  storageKey: string | null
  checksumSha256: string | null
  htmlSnapshot: string | null
  createdAt: Date
}
type CalculationWithProposals = CalculationRow & { proposals: ProposalRow[] }
type SaveCalculationMetadata = {
  referrer?: string
  ipAddress?: string
  userAgent?: string
}

export class EngineeringDataService {
  constructor(private readonly db: DbClient) {}

  async listPublicServices() {
    const services = await this.db.service.findMany({
      where: {
        isActive: true,
        isPublic: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })

    return services.map(serviceToRecord)
  }

  async listAdminServices() {
    const services = await this.db.service.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })

    return services.map(serviceToRecord)
  }

  async createService(input: ServiceCreateRequest) {
    const service = await this.db.service.create({
      data: serviceCreateData(input),
    })

    return serviceToRecord(service)
  }

  async updateService(id: string, input: ServiceUpdateRequest) {
    const service = await this.db.service
      .update({
        where: { id },
        data: serviceUpdateData(input),
      })
      .catch((error: unknown) => {
        if (isPrismaNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Service not found')
        }
        throw error
      })

    return serviceToRecord(service)
  }

  async setExchangeRate(input: ExchangeRateInput) {
    const parsed = exchangeRateInputSchema.parse(input)
    const exchangeRate = snapshotExchangeRate(parsed)
    const setting = await this.db.appSetting.upsert({
      where: { key: exchangeRateSettingKey },
      create: {
        key: exchangeRateSettingKey,
        value: toJson(exchangeRate),
      },
      update: {
        value: toJson(exchangeRate),
      },
    })

    return {
      exchangeRate,
      updatedAt: setting.updatedAt.toISOString(),
    }
  }

  async getExchangeRate() {
    const setting = await this.db.appSetting.findUnique({
      where: { key: exchangeRateSettingKey },
    })

    if (!setting) {
      throw new AppError(409, 'CONFLICT', 'USD/BYN exchange rate setting is not configured')
    }

    const exchangeRate = exchangeRateInputSchema.parse(setting.value)

    return {
      exchangeRate: snapshotExchangeRate(exchangeRate),
      updatedAt: setting.updatedAt.toISOString(),
    }
  }

  async saveCalculation(input: CalculationSaveRequest, metadata: SaveCalculationMetadata = {}) {
    const normalizedPhone = normalizeLeadPhone(input.clientPhone)
    const referrer = normalizeOptionalText(input.referrer ?? metadata.referrer, 2_048)
    const source = normalizeOptionalText(input.source, 80) ?? defaultLeadSource
    const requestFingerprintHash = leadRequestFingerprintHash({
      input,
      normalizedPhone,
      source,
      referrer,
    })

    const existingIdempotentCalculation = await this.findCalculationByIdempotencyKey(input.idempotencyKey)
    if (existingIdempotentCalculation) {
      assertIdempotencyFingerprintMatches(existingIdempotentCalculation, requestFingerprintHash)
      return {
        calculation: calculationToRecord(
          existingIdempotentCalculation,
          existingIdempotentCalculation.proposals,
        ),
        publicCalculation: calculationToPublicRecord(
          existingIdempotentCalculation,
          existingIdempotentCalculation.proposals,
        ),
        created: false,
      }
    }

    const exchangeRate = (await this.getExchangeRate()).exchangeRate
    const selectedServiceIds = input.calculation.selectedServiceIds
    const queryableServiceIds = selectedServiceIds.filter(isUuid)
    const services = await this.db.service.findMany({
      where: {
        id: {
          in: queryableServiceIds,
        },
        isPublic: true,
      },
    })

    const calculation = calculateEngineeringOffer({
      ...input.calculation,
      services: services.map(serviceToCalculationInput),
      exchangeRate,
    })

    if (calculation.skippedServices.length > 0) {
      throw new AppError(
        409,
        'CONFLICT',
        'Selected services are unavailable for persisted calculation',
        calculation.skippedServices,
      )
    }

    const duplicateWindowStartedAt = duplicateWindowStart(new Date())
    const duplicateFingerprintHash = calculationDuplicateFingerprintHash({
      normalizedPhone,
      calculation,
      duplicateWindowStartedAt,
    })
    const duplicateCalculation = await this.findCalculationByDuplicateFingerprintHash(duplicateFingerprintHash)
    if (duplicateCalculation) {
      return {
        calculation: calculationToRecord(duplicateCalculation, duplicateCalculation.proposals),
        publicCalculation: calculationToPublicRecord(
          duplicateCalculation,
          duplicateCalculation.proposals,
        ),
        created: false,
      }
    }

    const publicToken = await this.createUniqueCalculationToken()
    const proposalToken = await this.createUniqueProposalToken()
    const offerNumber = pendingOfferNumber(publicToken)
    const consentAcceptedAt = new Date()

    try {
      const persisted = await this.db.$transaction(async (tx) => {
        const row = await tx.calculation.create({
          data: {
            publicToken,
            idempotencyKey: input.idempotencyKey,
            requestFingerprintHash,
            duplicateFingerprintHash,
            duplicateWindowStartedAt,
            clientName: input.clientName,
            clientPhone: normalizedPhone,
            objectName: input.objectName ?? null,
            areaSqm: calculation.areaSqm,
            areaSqmHundredths: BigInt(calculation.areaSqmHundredths),
            selectedServiceIds: toJson(calculation.selectedServiceIds),
            serviceSnapshots: toJson(calculation.lineItems.map((lineItem) => lineItem.serviceSnapshot)),
            skippedServices: toJson(calculation.skippedServices),
            exchangeRate: toJson(calculation.exchangeRate),
            usdToBynRateScaled: calculation.exchangeRate.usdToBynRateScaled,
            usdToBynRateScale: EXCHANGE_RATE_SCALE,
            calculationVersion: calculation.calculationVersion,
            calculationSnapshot: toJson(calculation),
            totalUsdCents: BigInt(calculation.totals.totalUsdCents),
            totalBynCents: BigInt(calculation.totals.totalBynCents),
            totalBynRoundedRubles: BigInt(calculation.totals.totalBynRoundedRubles),
            status: 'new',
            statusUpdatedAt: new Date(),
            source,
            referrer,
            utm: input.utm === undefined ? undefined : toJson(input.utm),
            consentAcceptedAt,
            consentVersion,
            consentText,
            consentIpAddress: normalizeOptionalText(metadata.ipAddress, 255),
            consentUserAgent: normalizeOptionalText(metadata.userAgent, 512),
          },
        })
        const proposal = await tx.proposal.create({
          data: {
            calculationId: row.id,
            publicToken: proposalToken,
            offerNumber,
            templateVersion: pendingProposalTemplateVersion,
            htmlSnapshot: pendingProposalHtmlSnapshot({
              offerNumber,
              clientName: input.clientName,
              clientPhone: normalizedPhone,
              calculation,
            }),
            calculationSnapshot: toJson(calculation),
          },
        })

        return { row, proposals: [proposal] }
      })

      return {
        calculation: calculationToRecord(persisted.row, persisted.proposals),
        publicCalculation: calculationToPublicRecord(persisted.row, persisted.proposals),
        created: true,
      }
    } catch (error) {
      if (isPrismaUniqueConstraint(error)) {
        const existing = await this.findCalculationByIdempotencyKey(input.idempotencyKey)
        if (existing) {
          assertIdempotencyFingerprintMatches(existing, requestFingerprintHash)
          return {
            calculation: calculationToRecord(existing, existing.proposals),
            publicCalculation: calculationToPublicRecord(existing, existing.proposals),
            created: false,
          }
        }
        const duplicate = await this.findCalculationByDuplicateFingerprintHash(duplicateFingerprintHash)
        if (duplicate) {
          return {
            calculation: calculationToRecord(duplicate, duplicate.proposals),
            publicCalculation: calculationToPublicRecord(duplicate, duplicate.proposals),
            created: false,
          }
        }
      }

      throw error
    }
  }

  async isExactIdempotencyReplay(
    input: CalculationSaveRequest,
    metadata: SaveCalculationMetadata = {},
  ) {
    const existing = await this.db.calculation.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { requestFingerprintHash: true },
    })

    if (!existing) return false

    try {
      const normalizedPhone = normalizeLeadPhone(input.clientPhone)
      const referrer = normalizeOptionalText(input.referrer ?? metadata.referrer, 2_048)
      const source = normalizeOptionalText(input.source, 80) ?? defaultLeadSource
      const requestFingerprintHash = leadRequestFingerprintHash({
        input,
        normalizedPhone,
        source,
        referrer,
      })

      return existing.requestFingerprintHash === requestFingerprintHash
    } catch {
      return false
    }
  }

  async getCalculation(id: string) {
    const calculation = await this.db.calculation
      .findUniqueOrThrow({
        where: { id },
        include: { proposals: true },
      })
      .catch((error: unknown) => {
        if (isPrismaNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Calculation not found')
        }
        throw error
      })

    return calculationToRecord(calculation, calculation.proposals)
  }

  async getPublicProposalHtml(publicToken: string) {
    const proposal = await this.db.proposal
      .findUniqueOrThrow({
        where: { publicToken },
      })
      .catch((error: unknown) => {
        if (isPrismaNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Proposal not found')
        }
        throw error
      })

    if (proposal.htmlSnapshot) {
      return publicProposalPageHtml(proposal.htmlSnapshot)
    }

    throw new AppError(404, 'NOT_FOUND', 'Proposal page is not available')
  }

  async listPublicProjectExamples() {
    const examples = await this.db.projectExample.findMany({
      where: { isPublic: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })

    return examples.map(projectExampleToRecord)
  }

  async listAdminProjectExamples() {
    const examples = await this.db.projectExample.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })

    return examples.map(projectExampleToRecord)
  }

  async createProjectExample(input: ProjectExampleCreateRequest) {
    const example = await this.db.projectExample.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        fileUrl: input.fileUrl,
        coverImageUrl: input.coverImageUrl ?? null,
        isPublic: input.isPublic,
        sortOrder: input.sortOrder,
      },
    })

    return projectExampleToRecord(example)
  }

  async updateProjectExample(id: string, input: ProjectExampleUpdateRequest) {
    const example = await this.db.projectExample
      .update({
        where: { id },
        data: projectExampleUpdateData(input),
      })
      .catch((error: unknown) => {
        if (isPrismaNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Project example not found')
        }
        throw error
      })

    return projectExampleToRecord(example)
  }

  private async createUniqueCalculationToken() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = randomToken()
      const existing = await this.db.calculation.findUnique({
        where: { publicToken: token },
        select: { id: true },
      })
      if (!existing) return token
    }

    throw new AppError(500, 'INTERNAL_ERROR', 'Could not allocate calculation token')
  }

  private async createUniqueProposalToken() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = randomToken()
      const existing = await this.db.proposal.findUnique({
        where: { publicToken: token },
        select: { id: true },
      })
      if (!existing) return token
    }

    throw new AppError(500, 'INTERNAL_ERROR', 'Could not allocate proposal token')
  }

  private async findCalculationByIdempotencyKey(idempotencyKey: string) {
    return this.db.calculation.findUnique({
      where: { idempotencyKey },
      include: { proposals: true },
    })
  }

  private async findCalculationByDuplicateFingerprintHash(
    duplicateFingerprintHash: string,
  ): Promise<CalculationWithProposals | null> {
    return this.db.calculation.findUnique({
      where: { duplicateFingerprintHash },
      include: { proposals: true },
    })
  }
}

function serviceCreateData(input: ServiceCreateRequest) {
  return {
    title: input.title,
    description: input.description ?? null,
    pricingType: input.pricingType,
    priceUsdCents: BigInt(input.priceUsdCents),
    pricingRule: input.pricingRule === undefined ? undefined : toJson(input.pricingRule),
    formulaVersion: input.formulaVersion ?? null,
    isActive: input.isActive,
    isPublic: input.isPublic,
    sortOrder: input.sortOrder,
  }
}

function serviceUpdateData(input: ServiceUpdateRequest) {
  return {
    title: input.title,
    description: input.description,
    pricingType: input.pricingType,
    priceUsdCents: input.priceUsdCents === undefined ? undefined : BigInt(input.priceUsdCents),
    pricingRule: input.pricingRule === undefined ? undefined : toJson(input.pricingRule),
    formulaVersion: input.formulaVersion,
    isActive: input.isActive,
    isPublic: input.isPublic,
    sortOrder: input.sortOrder,
  }
}

function projectExampleUpdateData(input: ProjectExampleUpdateRequest) {
  return {
    title: input.title,
    description: input.description,
    fileUrl: input.fileUrl,
    coverImageUrl: input.coverImageUrl,
    isPublic: input.isPublic,
    sortOrder: input.sortOrder,
  }
}

function serviceToRecord(service: ServiceRow): ServiceRecord {
  return {
    id: service.id,
    title: service.title,
    description: service.description,
    pricingType: service.pricingType,
    priceUsdCents: safeNumberFromBigInt(service.priceUsdCents, 'service price USD cents'),
    pricingRule: jsonRecordOrNull(service.pricingRule),
    formulaVersion: service.formulaVersion,
    isActive: service.isActive,
    isPublic: service.isPublic,
    sortOrder: service.sortOrder,
    createdAt: service.createdAt.toISOString(),
    updatedAt: service.updatedAt.toISOString(),
  }
}

function serviceToCalculationInput(service: ServiceRow) {
  return {
    id: service.id,
    title: service.title,
    description: service.description,
    pricingType: service.pricingType,
    priceUsdCents: safeNumberFromBigInt(service.priceUsdCents, 'service price USD cents'),
    pricingRule: jsonRecordOrUndefined(service.pricingRule),
    formulaVersion: service.formulaVersion ?? undefined,
    isActive: service.isActive,
    sortOrder: service.sortOrder,
    createdAt: service.createdAt.toISOString(),
    updatedAt: service.updatedAt.toISOString(),
  }
}

function calculationToRecord(
  calculation: CalculationRow & { proposals?: ProposalRow[] },
  proposals: ProposalRow[],
): CalculationRecord {
  const calculationSnapshot = calculationResultSchema.parse(calculation.calculationSnapshot)
  const exchangeRate = calculationSnapshot.exchangeRate

  return {
    id: calculation.id,
    publicToken: calculation.publicToken,
    idempotencyKey: calculation.idempotencyKey,
    requestFingerprintHash: calculation.requestFingerprintHash,
    duplicateFingerprintHash: calculation.duplicateFingerprintHash,
    duplicateWindowStartedAt: calculation.duplicateWindowStartedAt?.toISOString() ?? null,
    clientName: calculation.clientName,
    clientPhone: calculation.clientPhone,
    objectName: calculation.objectName,
    areaSqm: calculation.areaSqm,
    areaSqmHundredths: safeNumberFromBigInt(calculation.areaSqmHundredths, 'area square meter hundredths'),
    selectedServiceIds: calculationSnapshot.selectedServiceIds,
    serviceSnapshots: calculationSnapshot.lineItems.map((lineItem) => lineItem.serviceSnapshot),
    skippedServices: calculationSnapshot.skippedServices,
    exchangeRate,
    calculationVersion: calculation.calculationVersion,
    calculationSnapshot,
    totalUsdCents: safeNumberFromBigInt(calculation.totalUsdCents, 'calculation USD total cents'),
    totalBynCents: safeNumberFromBigInt(calculation.totalBynCents, 'calculation BYN total cents'),
    totalBynRoundedRubles: safeNumberFromBigInt(
      calculation.totalBynRoundedRubles,
      'calculation BYN rounded rubles',
    ),
    status: calculation.status as CalculationRecord['status'],
    statusUpdatedAt: calculation.statusUpdatedAt.toISOString(),
    notes: calculation.notes,
    source: calculation.source,
    referrer: calculation.referrer,
    utm: (calculation.utm as Record<string, unknown> | null) ?? null,
    consentAcceptedAt: calculation.consentAcceptedAt?.toISOString() ?? null,
    consentVersion: calculation.consentVersion,
    consentText: calculation.consentText,
    consentIpAddress: calculation.consentIpAddress,
    consentUserAgent: calculation.consentUserAgent,
    proposalArtifacts: proposals.map((proposal) => ({
      id: proposal.id,
      publicToken: proposal.publicToken,
      offerNumber: proposal.offerNumber,
      templateVersion: proposal.templateVersion,
      pdfUrl: proposal.pdfUrl,
      storageKey: proposal.storageKey,
      checksumSha256: proposal.checksumSha256,
      hasHtmlSnapshot: proposal.htmlSnapshot !== null,
      createdAt: proposal.createdAt.toISOString(),
    })),
    createdAt: calculation.createdAt.toISOString(),
    updatedAt: calculation.updatedAt.toISOString(),
  }
}

function calculationToPublicRecord(
  calculation: CalculationRow & { proposals?: ProposalRow[] },
  proposals: ProposalRow[],
): PublicCalculationRecord {
  const calculationSnapshot = calculationResultSchema.parse(calculation.calculationSnapshot)
  const proposal = proposals[0]

  return {
    publicToken: calculation.publicToken,
    clientPhone: calculation.clientPhone,
    areaSqm: calculation.areaSqm,
    areaSqmHundredths: safeNumberFromBigInt(calculation.areaSqmHundredths, 'area square meter hundredths'),
    selectedServiceIds: calculationSnapshot.selectedServiceIds,
    serviceSnapshots: calculationSnapshot.lineItems.map((lineItem) => lineItem.serviceSnapshot),
    exchangeRate: calculationSnapshot.exchangeRate,
    calculationVersion: calculation.calculationVersion,
    calculationSnapshot,
    totalUsdCents: safeNumberFromBigInt(calculation.totalUsdCents, 'calculation USD total cents'),
    totalBynCents: safeNumberFromBigInt(calculation.totalBynCents, 'calculation BYN total cents'),
    totalBynRoundedRubles: safeNumberFromBigInt(
      calculation.totalBynRoundedRubles,
      'calculation BYN rounded rubles',
    ),
    proposal: proposal
      ? {
          status: 'pending',
          publicToken: proposal.publicToken,
          offerNumber: proposal.offerNumber,
          urlPath: `/api/public/proposals/${proposal.publicToken}`,
        }
      : null,
    createdAt: calculation.createdAt.toISOString(),
  }
}

function projectExampleToRecord(example: ProjectExampleRow): ProjectExampleRecord {
  return {
    id: example.id,
    title: example.title,
    description: example.description,
    fileUrl: example.fileUrl,
    coverImageUrl: example.coverImageUrl,
    isPublic: example.isPublic,
    sortOrder: example.sortOrder,
    createdAt: example.createdAt.toISOString(),
    updatedAt: example.updatedAt.toISOString(),
  }
}

function snapshotExchangeRate(input: ExchangeRateInput): ExchangeRateSnapshot {
  return calculateEngineeringOffer({
    areaSqm: '1',
    selectedServiceIds: [],
    services: [],
    exchangeRate: input,
  }).exchangeRate
}

function randomToken() {
  return randomBytes(24).toString('base64url')
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function jsonRecordOrNull(value: Prisma.JsonValue | null) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function jsonRecordOrUndefined(value: Prisma.JsonValue | null) {
  return jsonRecordOrNull(value) ?? undefined
}

function safeNumberFromBigInt(value: bigint, label: string) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new AppError(500, 'INTERNAL_ERROR', `${label} exceeds Number.MAX_SAFE_INTEGER`)
  }

  return Number(value)
}

function normalizeLeadPhone(rawPhone: string) {
  const trimmed = rawPhone.trim()

  if (!/^[+\d\s().-]+$/.test(trimmed)) {
    throwInvalidPhone()
  }

  const digits = trimmed.replace(/\D/g, '')
  let normalizedDigits: string

  if (trimmed.startsWith('+')) {
    normalizedDigits = digits
  } else if (digits.startsWith('00')) {
    normalizedDigits = digits.slice(2)
  } else if (digits.length === 12 && digits.startsWith('375')) {
    normalizedDigits = digits
  } else if (/^80\d{9}$/.test(digits)) {
    normalizedDigits = `375${digits.slice(2)}`
  } else if (/^0\d{9}$/.test(digits)) {
    normalizedDigits = `375${digits.slice(1)}`
  } else if (/^(25|29|33|44)\d{7}$/.test(digits)) {
    normalizedDigits = `375${digits}`
  } else {
    normalizedDigits = digits
  }

  if (!/^[1-9]\d{7,14}$/.test(normalizedDigits) || /^(\d)\1+$/.test(normalizedDigits)) {
    throwInvalidPhone()
  }

  return `+${normalizedDigits}`
}

function throwInvalidPhone(): never {
  throw new AppError(400, 'VALIDATION_ERROR', 'Invalid lead phone number', [
    {
      path: ['clientPhone'],
      message: 'Enter a valid phone number in Belarusian or international format',
    },
  ])
}

function normalizeOptionalText(value: string | undefined, maxLength: number) {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

function leadRequestFingerprintHash(input: {
  input: CalculationSaveRequest
  normalizedPhone: string
  source: string
  referrer: string | null
}) {
  return sha256Hex({
    clientName: input.input.clientName,
    clientPhone: input.normalizedPhone,
    objectName: input.input.objectName ?? null,
    calculation: {
      areaSqm: input.input.calculation.areaSqm,
      selectedServiceIds: [...new Set(input.input.calculation.selectedServiceIds)],
    },
    consentAccepted: true,
    consentVersion,
    source: input.source,
    referrer: input.referrer,
    utm: input.input.utm ?? null,
  })
}

function calculationDuplicateFingerprintHash(input: {
  normalizedPhone: string
  calculation: CalculationResult
  duplicateWindowStartedAt: Date
}) {
  return sha256Hex({
    clientPhone: input.normalizedPhone,
    duplicateWindowStartedAt: input.duplicateWindowStartedAt.toISOString(),
    areaSqm: input.calculation.areaSqm,
    selectedServiceIds: input.calculation.selectedServiceIds,
    exchangeRateScaled: input.calculation.exchangeRate.usdToBynRateScaled,
    totalUsdCents: input.calculation.totals.totalUsdCents,
    totalBynCents: input.calculation.totals.totalBynCents,
  })
}

function duplicateWindowStart(now: Date) {
  return new Date(Math.floor(now.getTime() / duplicateDetectionWindowMs) * duplicateDetectionWindowMs)
}

function assertIdempotencyFingerprintMatches(
  calculation: CalculationRow,
  requestFingerprintHash: string,
) {
  if (calculation.requestFingerprintHash === requestFingerprintHash) return

  throw new AppError(
    409,
    'CONFLICT',
    'Idempotency key was already used for a different calculation submission',
  )
}

function sha256Hex(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

function pendingOfferNumber(publicToken: string) {
  const year = new Date().getUTCFullYear()
  const suffix = publicToken.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()
  return `PZK-${year}-${suffix}`
}

function pendingProposalHtmlSnapshot(input: {
  offerNumber: string
  clientName: string
  clientPhone: string
  calculation: CalculationResult
}) {
  const serviceList = input.calculation.lineItems
    .map((lineItem) => `<li>${escapeHtml(lineItem.serviceSnapshot.title)}</li>`)
    .join('')

  return [
    `<main data-template-version="${pendingProposalTemplateVersion}">`,
    `<h1>Коммерческое предложение готовится</h1>`,
    `<p>Номер: ${escapeHtml(input.offerNumber)}</p>`,
    `<p>Клиент: ${escapeHtml(input.clientName)}</p>`,
    `<p>Телефон: ${escapeHtml(input.clientPhone)}</p>`,
    `<p>Площадь: ${escapeHtml(input.calculation.areaSqm)} м²</p>`,
    `<p>Итог: ${input.calculation.totals.totalBynRoundedRubles} Br (~${Math.round(input.calculation.totals.totalUsdCents / 100)} $)</p>`,
    `<ul>${serviceList}</ul>`,
    `<p>PDF renderer будет подключен отдельной задачей PZK-006.</p>`,
    `</main>`,
  ].join('')
}

function publicProposalPageHtml(snapshotHtml: string) {
  return [
    '<!doctype html>',
    '<html lang="ru">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<title>КП принято в подготовку | ИП Позняк</title>',
    '<style>',
    'body{margin:0;background:#f9f7f4;color:#15191d;font-family:Arial,sans-serif;line-height:1.5}',
    'main{max-width:760px;margin:40px auto;padding:28px;background:#fff;border:1px solid #ded7cc;border-radius:18px}',
    'h1{margin:0 0 12px;font-size:32px;line-height:1.15}',
    'p{margin:10px 0;color:#40484f}',
    'ul{padding-left:22px}',
    '</style>',
    '</head>',
    '<body>',
    snapshotHtml,
    '</body>',
    '</html>',
  ].join('')
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function isPrismaNotFound(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
}

function isPrismaUniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}
