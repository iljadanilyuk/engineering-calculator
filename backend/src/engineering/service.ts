import {
  EXCHANGE_RATE_SCALE,
  calculateEngineeringOffer,
  calculationResultSchema,
  exchangeRateInputSchema,
  type CalculationListItem,
  type CalculationListQuery,
  type CalculationRecord,
  type CalculationResult,
  type CalculationSaveRequest,
  type CalculationStatus,
  type CalculationUpdateRequest,
  type ExchangeRateInput,
  type ExchangeRateSnapshot,
  type ProjectExampleCreateRequest,
  type ProjectExampleRecord,
  type ProjectExampleUpdateRequest,
  type PublicCalculationRecord,
  type ServiceCreateRequest,
  type ServiceRecord,
  type ServiceReorderRequest,
  type ServiceUpdateRequest,
} from '@poznyak-engineering-calculator/contracts'
import { createHash, randomBytes } from 'node:crypto'

import type { DbClient } from '../db'
import { Prisma } from '../generated/prisma/client'
import { AppError } from '../http/errors'
import type { LeadNotifier } from '../notifications/telegram'
import {
  type CommercialProposalProjectExample,
  createCommercialProposalGenerator,
  type ProposalGenerator,
} from './proposal'

const exchangeRateSettingKey = 'exchange_rate'
const defaultLeadSource = 'public_calculator'
const duplicateDetectionWindowMs = 10 * 60 * 1_000
const consentVersion = 'pzk-public-lead-consent-v1'
const consentText =
  'Согласен на обработку имени, телефона и выбранного расчета для подготовки коммерческого предложения.'
const calculationStatuses = [
  'new',
  'contacted',
  'in_progress',
  'won',
  'lost',
  'spam_test',
] as const satisfies readonly CalculationStatus[]
const orderedProposalInclude = {
  orderBy: {
    createdAt: 'asc' as const,
  },
}

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
  pdfBytes?: Uint8Array | Buffer | null
  pdfByteSize: number | null
  htmlSnapshot: string | null
  createdAt: Date
}
type CalculationWithProposals = CalculationRow & { proposals: ProposalRow[] }
type SaveCalculationMetadata = {
  referrer?: string
  ipAddress?: string
  userAgent?: string
}
type EngineeringDataServiceOptions = {
  publicWebsiteUrl?: string
}

export class EngineeringDataService {
  constructor(
    private readonly db: DbClient,
    private readonly proposalGenerator: ProposalGenerator = createCommercialProposalGenerator(),
    private readonly leadNotifier: LeadNotifier | null = null,
    private readonly options: EngineeringDataServiceOptions = {},
  ) {}

  async listPublicServices() {
    const services = await this.db.service.findMany({
      where: {
        isActive: true,
        isPublic: true,
        pricingType: {
          in: ['fixed', 'per_sqm'],
        },
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
    assertServicePriceAllowed(input.pricingType, input.priceUsdCents)
    const service = await this.db.service.create({
      data: serviceCreateData(input),
    })

    return serviceToRecord(service)
  }

  async updateService(id: string, input: ServiceUpdateRequest) {
    const existing = await this.db.service
      .findUniqueOrThrow({
        where: { id },
      })
      .catch((error: unknown) => {
        if (isPrismaNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Service not found')
        }
        throw error
      })
    const nextPricingType = input.pricingType ?? existing.pricingType
    const nextPriceUsdCents =
      input.priceUsdCents ?? safeNumberFromBigInt(existing.priceUsdCents, 'service price USD cents')

    assertFormulaPricingTypeTransitionAllowed(existing.pricingType, nextPricingType)
    assertServicePriceAllowed(nextPricingType, nextPriceUsdCents)

    const service = await this.db.service
      .update({
        where: { id },
        data: serviceUpdateData(input, existing),
      })
      .catch((error: unknown) => {
        if (isPrismaNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Service not found')
        }
        throw error
      })

    return serviceToRecord(service)
  }

  async reorderServices(input: ServiceReorderRequest) {
    const serviceIds = input.services.map((service) => service.id)
    const existing = await this.db.service.findMany({
      where: {
        id: {
          in: serviceIds,
        },
      },
      select: {
        id: true,
      },
    })
    const existingIds = new Set(existing.map((service) => service.id))
    const missingIds = serviceIds.filter((id) => !existingIds.has(id))

    if (missingIds.length > 0) {
      throw new AppError(404, 'NOT_FOUND', 'Service not found', { missingIds })
    }

    await this.db.$transaction(
      input.services.map((service) =>
        this.db.service.update({
          where: { id: service.id },
          data: { sortOrder: service.sortOrder },
        }),
      ),
    )

    return this.listAdminServices()
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
    const consentAcceptedAt = new Date()
    const offerNumber = offerNumberFromToken(proposalToken, consentAcceptedAt)
    const sourcePageUrl = normalizeOptionalText(
      this.options.publicWebsiteUrl ?? referrer ?? metadata.referrer,
      2_048,
    )
    const projectExamples = await this.listPublicProjectExamples()
    const proposalArtifact = await this.proposalGenerator.generate({
      offerNumber,
      publicToken: proposalToken,
      clientName: input.clientName,
      clientPhone: normalizedPhone,
      objectName: input.objectName ?? null,
      calculation,
      issuedAt: consentAcceptedAt,
      sourcePageUrl,
      projectExamples: projectExamples.map(projectExampleToProposalInput),
    })

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
            templateVersion: proposalArtifact.templateVersion,
            storageKey: proposalArtifact.storageKey,
            checksumSha256: proposalArtifact.checksumSha256,
            pdfBytes: Buffer.from(proposalArtifact.pdfBytes),
            pdfByteSize: proposalArtifact.pdfByteSize,
            htmlSnapshot: proposalArtifact.htmlSnapshot,
            calculationSnapshot: toJson(calculation),
          },
        })

        return { row, proposals: [proposal] }
      })

      const savedCalculation = calculationToRecord(persisted.row, persisted.proposals)
      await this.notifyLeadSubmitted(savedCalculation)

      return {
        calculation: savedCalculation,
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
        include: { proposals: orderedProposalInclude },
      })
      .catch((error: unknown) => {
        if (isPrismaNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Calculation not found')
        }
        throw error
      })

    return calculationToRecord(calculation, calculation.proposals)
  }

  async listCalculations(input: CalculationListQuery) {
    const where = calculationListWhere(input)
    const calculations = await this.db.calculation.findMany({
      where,
      include: { proposals: orderedProposalInclude },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit,
      skip: input.offset,
    })
    const [
      filteredCount,
      totalCount,
      activeCount,
      spamTestCount,
      statusCounts,
    ] = await Promise.all([
      this.db.calculation.count({ where }),
      this.db.calculation.count(),
      this.db.calculation.count({ where: { status: { not: 'spam_test' } } }),
      this.db.calculation.count({ where: { status: 'spam_test' } }),
      this.countCalculationsByStatus(),
    ])

    return {
      calculations: calculations.map((calculation) =>
        calculationToListItem(calculation, calculation.proposals),
      ),
      summary: {
        totalCount,
        activeCount,
        spamTestCount,
        filteredCount,
        statusCounts,
        limit: input.limit,
        offset: input.offset,
      },
    }
  }

  async updateCalculation(id: string, input: CalculationUpdateRequest) {
    const existing = await this.db.calculation
      .findUniqueOrThrow({
        where: { id },
        include: { proposals: orderedProposalInclude },
      })
      .catch((error: unknown) => {
        if (isPrismaNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Calculation not found')
        }
        throw error
      })

    const data: Prisma.CalculationUpdateInput = {}

    if (hasOwn(input, 'status') && input.status !== existing.status) {
      data.status = input.status
      data.statusUpdatedAt = new Date()
    }

    if (hasOwn(input, 'notes')) {
      data.notes = input.notes ?? null
    }

    if (Object.keys(data).length === 0) {
      return calculationToRecord(existing, existing.proposals)
    }

    const calculation = await this.db.calculation.update({
      where: { id },
      data,
      include: { proposals: orderedProposalInclude },
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
      return proposal.htmlSnapshot
    }

    throw new AppError(404, 'NOT_FOUND', 'Proposal page is not available')
  }

  async getPublicProposalPdf(publicToken: string) {
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

    if (!proposal.pdfBytes || !proposal.checksumSha256) {
      throw new AppError(404, 'NOT_FOUND', 'Proposal PDF is not available')
    }

    return {
      bytes: new Uint8Array(proposal.pdfBytes),
      offerNumber: proposal.offerNumber,
      checksumSha256: proposal.checksumSha256,
    }
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
      include: { proposals: orderedProposalInclude },
    })
  }

  private async findCalculationByDuplicateFingerprintHash(
    duplicateFingerprintHash: string,
  ): Promise<CalculationWithProposals | null> {
    return this.db.calculation.findUnique({
      where: { duplicateFingerprintHash },
      include: { proposals: orderedProposalInclude },
    })
  }

  private async countCalculationsByStatus() {
    const entries = await Promise.all(
      calculationStatuses.map(async (status) => [
        status,
        await this.db.calculation.count({ where: { status } }),
      ] as const),
    )

    return Object.fromEntries(entries) as Record<CalculationStatus, number>
  }

  private async notifyLeadSubmitted(calculation: CalculationRecord) {
    if (!this.leadNotifier) return

    try {
      await this.leadNotifier.notifyLeadSubmitted({ calculation })
    } catch (error) {
      console.error('Lead notification failed:', safeErrorMessage(error))
    }
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
    isPublic: input.isActive ? input.isPublic : false,
    sortOrder: input.sortOrder,
  }
}

function serviceUpdateData(input: ServiceUpdateRequest, existing: ServiceRow) {
  const nextIsActive = input.isActive ?? existing.isActive

  return {
    title: input.title,
    description: input.description,
    pricingType: input.pricingType,
    priceUsdCents: input.priceUsdCents === undefined ? undefined : BigInt(input.priceUsdCents),
    pricingRule: input.pricingRule === undefined ? undefined : toJson(input.pricingRule),
    formulaVersion: input.formulaVersion,
    isActive: input.isActive,
    isPublic: nextIsActive ? input.isPublic : false,
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
    proposalArtifacts: proposals.map(proposalToArtifactReference),
    createdAt: calculation.createdAt.toISOString(),
    updatedAt: calculation.updatedAt.toISOString(),
  }
}

function calculationToListItem(
  calculation: CalculationRow & { proposals?: ProposalRow[] },
  proposals: ProposalRow[],
): CalculationListItem {
  const record = calculationToRecord(calculation, proposals)

  return {
    id: record.id,
    clientName: record.clientName,
    clientPhone: record.clientPhone,
    objectName: record.objectName,
    areaSqm: record.areaSqm,
    serviceSnapshots: record.serviceSnapshots,
    totalUsdCents: record.totalUsdCents,
    totalBynCents: record.totalBynCents,
    totalBynRoundedRubles: record.totalBynRoundedRubles,
    status: record.status,
    statusUpdatedAt: record.statusUpdatedAt,
    notes: record.notes,
    proposalArtifacts: record.proposalArtifacts,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
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
    proposal: proposal ? publicProposalReference(proposal) : null,
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

function projectExampleToProposalInput(example: ProjectExampleRecord): CommercialProposalProjectExample {
  return {
    title: example.title,
    description: example.description,
    fileUrl: example.fileUrl,
  }
}

function publicProposalReference(proposal: ProposalRow): PublicCalculationRecord['proposal'] {
  const urlPath = `/api/public/proposals/${proposal.publicToken}`

  if (proposal.pdfBytes && proposal.checksumSha256) {
    return {
      status: 'ready',
      publicToken: proposal.publicToken,
      offerNumber: proposal.offerNumber,
      urlPath,
      pdfUrlPath: `${urlPath}/pdf`,
    }
  }

  return {
    status: 'html_only',
    publicToken: proposal.publicToken,
    offerNumber: proposal.offerNumber,
    urlPath,
  }
}

function proposalToArtifactReference(proposal: ProposalRow): CalculationRecord['proposalArtifacts'][number] {
  const urlPath = `/api/public/proposals/${proposal.publicToken}`
  const hasPublicPdfRoute = Boolean(proposal.pdfBytes && proposal.checksumSha256)
  const status = hasPublicPdfRoute || proposal.pdfUrl ? 'ready' : 'html_only'

  return {
    id: proposal.id,
    publicToken: proposal.publicToken,
    offerNumber: proposal.offerNumber,
    templateVersion: proposal.templateVersion,
    status,
    urlPath,
    ...(hasPublicPdfRoute ? { pdfUrlPath: `${urlPath}/pdf` } : {}),
    pdfUrl: proposal.pdfUrl,
    storageKey: proposal.storageKey,
    checksumSha256: proposal.checksumSha256,
    pdfByteSize: proposal.pdfByteSize,
    hasHtmlSnapshot: proposal.htmlSnapshot !== null,
    createdAt: proposal.createdAt.toISOString(),
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

function calculationListWhere(input: CalculationListQuery): Prisma.CalculationWhereInput {
  const and: Prisma.CalculationWhereInput[] = []

  if (input.status) {
    and.push({ status: input.status })
  }

  if (input.name) {
    and.push({ clientName: { contains: input.name, mode: 'insensitive' } })
  }

  if (input.phone) {
    and.push(phoneSearchWhere(input.phone))
  }

  if (input.search) {
    and.push({
      OR: [
        { clientName: { contains: input.search, mode: 'insensitive' } },
        phoneSearchWhere(input.search),
      ],
    })
  }

  if (input.createdFrom || input.createdTo) {
    and.push({
      createdAt: {
        ...(input.createdFrom ? { gte: dateOnlyStart(input.createdFrom) } : {}),
        ...(input.createdTo ? { lte: dateOnlyEnd(input.createdTo) } : {}),
      },
    })
  }

  return and.length > 0 ? { AND: and } : {}
}

function phoneSearchWhere(value: string): Prisma.CalculationWhereInput {
  const variants = phoneSearchVariants(value)

  return {
    OR: variants.map((variant) => ({
      clientPhone: { contains: variant, mode: 'insensitive' },
    })),
  }
}

function phoneSearchVariants(value: string) {
  const trimmed = value.trim()
  const digits = trimmed.replace(/\D/g, '')
  const variants = new Set<string>()

  if (trimmed) variants.add(trimmed)
  if (digits) {
    variants.add(digits)
    variants.add(`+${digits}`)
  }

  return [...variants]
}

function dateOnlyStart(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

function dateOnlyEnd(value: string) {
  return new Date(`${value}T23:59:59.999Z`)
}

function safeNumberFromBigInt(value: bigint, label: string) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new AppError(500, 'INTERNAL_ERROR', `${label} exceeds Number.MAX_SAFE_INTEGER`)
  }

  return Number(value)
}

function assertServicePriceAllowed(pricingType: ServiceRow['pricingType'], priceUsdCents: number) {
  if ((pricingType === 'fixed' || pricingType === 'per_sqm') && priceUsdCents <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Fixed and per-square-meter services require a positive USD price', [
      {
        path: ['priceUsdCents'],
        message: 'Fixed and per-square-meter services require a positive USD price',
      },
    ])
  }
}

function assertFormulaPricingTypeTransitionAllowed(
  currentPricingType: ServiceRow['pricingType'],
  nextPricingType: ServiceRow['pricingType'],
) {
  if (currentPricingType === nextPricingType) return
  if (currentPricingType !== 'formula' && nextPricingType !== 'formula') return

  throw new AppError(400, 'VALIDATION_ERROR', 'Formula service editing is future scope', [
    {
      path: ['pricingType'],
      message: 'Formula service editing is future scope',
    },
  ])
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

function hasOwn<T extends object, K extends PropertyKey>(
  value: T,
  key: K,
): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key)
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

function offerNumberFromToken(publicToken: string, issuedAt: Date) {
  const year = issuedAt.getUTCFullYear()
  const suffix = publicToken.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()
  return `PZK-${year}-${suffix}`
}

function isPrismaNotFound(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
}

function isPrismaUniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500)
  return String(error).slice(0, 500)
}
