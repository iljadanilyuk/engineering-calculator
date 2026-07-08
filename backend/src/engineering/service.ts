import {
  EXCHANGE_RATE_SCALE,
  calculateEngineeringOffer,
  calculationResultSchema,
  exchangeRateInputSchema,
  type CalculationRecord,
  type CalculationSaveRequest,
  type ExchangeRateInput,
  type ExchangeRateSnapshot,
  type ProjectExampleCreateRequest,
  type ProjectExampleRecord,
  type ProjectExampleUpdateRequest,
  type ServiceCreateRequest,
  type ServiceRecord,
  type ServiceUpdateRequest,
} from '@poznyak-engineering-calculator/contracts'
import { randomBytes } from 'node:crypto'

import type { DbClient } from '../db'
import { Prisma } from '../generated/prisma/client'
import { AppError } from '../http/errors'

const exchangeRateSettingKey = 'exchange_rate'

type ServiceRow = Awaited<ReturnType<DbClient['service']['findFirstOrThrow']>>
type CalculationRow = Awaited<ReturnType<DbClient['calculation']['findFirstOrThrow']>>
type ProjectExampleRow = Awaited<ReturnType<DbClient['projectExample']['findFirstOrThrow']>>

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

  async saveCalculation(input: CalculationSaveRequest) {
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

    const publicToken = await this.createUniqueCalculationToken()
    const row = await this.db.calculation.create({
      data: {
        publicToken,
        clientName: input.clientName,
        clientPhone: input.clientPhone,
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
        referrer: input.referrer,
        utm: input.utm === undefined ? undefined : toJson(input.utm),
      },
    })

    return calculationToRecord(row, [])
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
  calculation: CalculationRow & { proposals?: Array<{ id: string; publicToken: string; offerNumber: string; templateVersion: string; pdfUrl: string | null; storageKey: string | null; checksumSha256: string | null; htmlSnapshot: string | null; createdAt: Date }> },
  proposals: Array<{ id: string; publicToken: string; offerNumber: string; templateVersion: string; pdfUrl: string | null; storageKey: string | null; checksumSha256: string | null; htmlSnapshot: string | null; createdAt: Date }>,
): CalculationRecord {
  const calculationSnapshot = calculationResultSchema.parse(calculation.calculationSnapshot)
  const exchangeRate = calculationSnapshot.exchangeRate

  return {
    id: calculation.id,
    publicToken: calculation.publicToken,
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
    referrer: calculation.referrer,
    utm: (calculation.utm as Record<string, unknown> | null) ?? null,
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

function isPrismaNotFound(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
}
