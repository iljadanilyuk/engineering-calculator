import {
  EXCHANGE_RATE_SCALE,
  blogContentPlainText,
  type BlogPostCreateRequest,
  type BlogPostRecord,
  type BlogPostStatus,
  type AdminQuestionnaireDraft,
  type BlogPostUpdateRequest,
  calculateEngineeringOffer,
  calculationResultSchema,
  calculateQuestionnaireProgress,
  exchangeRateInputSchema,
  getQuestionnaireActiveOptions,
  getQuestionnaireActiveQuestions,
  getQuestionnaireQuestionAnswerType,
  getQuestionnairePublicDefinition,
  markQuestionnaireAnswersActivity,
  publicProjectExampleAssets,
  questionnaireDefinitionPatchRequestSchema,
  questionnaireDefinitionRecordSchema,
  questionnaireDefinitionSchema,
  questionnaireAnswersPatchRequestSchema,
  questionnaireStartRequestSchema,
  questionnaireStoredAnswerSchema,
  technicalQuestionnaireDefinition,
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
  type ProjectExampleDeliveryLink,
  type ProjectExampleRecord,
  type ProjectExampleRequestCreateRequest,
  type ProjectExampleRequestListQuery,
  type ProjectExampleRequestRecord,
  type ProjectExampleReorderRequest,
  type ProjectExampleUpdateRequest,
  type PublicTelegramDelivery,
  type PublicBlogPostRecord,
  type PublicBlogPostSummary,
  type PublicCalculationRecord,
  type PublicProjectExampleRecord,
  type PublicProjectExampleRequestRecord,
  type PublicQuestionnaireSession,
  type QuestionnaireDefinition,
  type QuestionnaireDefinitionPatchRequest,
  type QuestionnaireDefinitionRecord,
  type QuestionnaireOption,
  type QuestionnaireQuestion,
  type QuestionnaireQuestionAnswerType,
  type QuestionnaireAnswersPatchRequest,
  type QuestionnaireStartRequest,
  type QuestionnaireStoredAnswer,
  type QuestionnaireVisibilityRule,
  type ServiceCreateRequest,
  type ServiceRecord,
  type ServiceReorderRequest,
  type ServiceUpdateRequest,
  type TelegramDeliveryRecord,
  type TelegramNotificationEventType,
} from '@poznyak-engineering-calculator/contracts'
import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import type { DbClient } from '../db'
import { Prisma } from '../generated/prisma/client'
import { AppError } from '../http/errors'
import {
  formatTelegramProjectExamplesDeliveryMessage,
  formatTelegramProposalDeliveryMessage,
  telegramDeepLink,
  type TelegramDocumentSender,
  type LeadNotifier,
} from '../notifications/telegram'
import {
  ensureCommercialProposalPublicTypography,
  type CommercialProposalProjectExample,
  createCommercialProposalGenerator,
  type ProposalGenerator,
} from './proposal'

const exchangeRateSettingKey = 'exchange_rate'
const questionnaireDefinitionSettingKey = 'questionnaire_definition_published'
const defaultLeadSource = 'public_calculator'
const defaultProjectExampleRequestSource = 'example_request'
const defaultQuestionnaireSource = 'public_questionnaire'
const duplicateDetectionWindowMs = 10 * 60 * 1_000
const telegramBindTokenTtlMs = 7 * 24 * 60 * 60 * 1_000
const consentVersion = 'pzk-public-lead-consent-v1'
const consentText =
  'Согласен на обработку имени, телефона и выбранного расчета для подготовки коммерческого предложения.'
const projectExampleRequestConsentVersion = 'pzk-project-example-request-consent-v1'
const projectExampleRequestConsentText =
  'Согласен на обработку имени и телефона для выдачи примеров проектов и связи по проектированию.'
const questionnaireConsentVersion = 'pzk-questionnaire-consent-v1'
const questionnaireConsentText =
  'Согласен на обработку имени, телефона, параметров расчета и ответов опросника для подготовки черновика технического задания и обратной связи.'
const staticQuestionnaireDefinitionUpdatedAt = `${technicalQuestionnaireDefinition.sourceUpdatedAt}T00:00:00.000Z`
const cyrillicSlugMap: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  і: 'i',
  ў: 'u',
}
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
const orderedTelegramDeliveryInclude = {
  orderBy: {
    createdAt: 'asc' as const,
  },
}
const orderedTelegramNotificationInclude = {
  orderBy: {
    createdAt: 'asc' as const,
  },
}
const calculationDetailInclude = {
  proposals: orderedProposalInclude,
  telegramDeliveries: orderedTelegramDeliveryInclude,
  telegramNotifications: orderedTelegramNotificationInclude,
  questionnaire: true,
}
const projectExampleRequestInclude = {
  telegramDeliveries: orderedTelegramDeliveryInclude,
}
const telegramDeliveryTargetInclude = {
  calculation: {
    include: {
      proposals: orderedProposalInclude,
    },
  },
  projectExampleRequest: true,
}

type ServiceRow = Awaited<ReturnType<DbClient['service']['findFirstOrThrow']>>
type CalculationRow = Awaited<ReturnType<DbClient['calculation']['findFirstOrThrow']>>
type CalculationQuestionnaireRow = Awaited<ReturnType<DbClient['calculationQuestionnaire']['findFirstOrThrow']>>
type ProjectExampleRow = Awaited<ReturnType<DbClient['projectExample']['findFirstOrThrow']>>
type ProjectExampleRequestRow = Awaited<ReturnType<DbClient['projectExampleRequest']['findFirstOrThrow']>>
type BlogPostRow = Awaited<ReturnType<DbClient['blogPost']['findFirstOrThrow']>>
type TelegramDeliveryRow = Awaited<ReturnType<DbClient['telegramDelivery']['findFirstOrThrow']>>
type TelegramNotificationRow = Awaited<ReturnType<DbClient['telegramNotification']['findFirstOrThrow']>>
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
type CalculationWithQuestionnaire = CalculationRow & {
  proposals: ProposalRow[]
  telegramDeliveries?: TelegramDeliveryRow[]
  telegramNotifications?: TelegramNotificationRow[]
  questionnaire: CalculationQuestionnaireRow | null
}
type ProjectExampleRequestWithDeliveries = ProjectExampleRequestRow & {
  telegramDeliveries?: TelegramDeliveryRow[]
}
type TelegramDeliveryWithTargets = Prisma.TelegramDeliveryGetPayload<{
  include: typeof telegramDeliveryTargetInclude
}>
type SaveCalculationMetadata = {
  referrer?: string
  ipAddress?: string
  userAgent?: string
}
type SaveProjectExampleRequestMetadata = SaveCalculationMetadata
type SaveQuestionnaireMetadata = SaveCalculationMetadata
type TelegramStartPayload = {
  bindToken: string
  chatId: string
  chatType: 'private'
  userId: string | null
  username: string | null
  firstName: string | null
}
type EngineeringDataServiceOptions = {
  publicApiUrl?: string
  publicWebsiteUrl?: string
  telegramBotUsername?: string
  telegramWebhookSecret?: string
}

const projectExampleAssetBaseUrl = new URL('../../assets/project-examples/', import.meta.url)

export class EngineeringDataService {
  constructor(
    private readonly db: DbClient,
    private readonly proposalGenerator: ProposalGenerator = createCommercialProposalGenerator(),
    private readonly leadNotifier: LeadNotifier | null = null,
    private readonly telegramDocumentSender: TelegramDocumentSender | null = null,
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

  async getQuestionnaireDefinition() {
    return this.activeQuestionnaireDefinition()
  }

  async getPublicQuestionnaireDefinition() {
    return publicQuestionnaireDefinitionRecord(await this.activeQuestionnaireDefinition())
  }

  async updateQuestionnaireDefinition(input: QuestionnaireDefinitionPatchRequest) {
    const parsedInput = questionnaireDefinitionPatchRequestSchema.parse(input)
    const current = await this.activeQuestionnaireDefinition()
    if (parsedInput.baseDefinitionHash !== current.definitionHash) {
      throw new AppError(409, 'CONFLICT', 'Questionnaire definition changed. Refresh before saving.')
    }
    const nextDefinition = applyQuestionnaireDefinitionTextEdits(current, parsedInput)
    assertQuestionnaireDefinitionPublishable(nextDefinition)
    const setting = await this.db.appSetting.upsert({
      where: { key: questionnaireDefinitionSettingKey },
      create: {
        key: questionnaireDefinitionSettingKey,
        value: toJson(nextDefinition),
      },
      update: {
        value: toJson(nextDefinition),
      },
    })

    return questionnaireDefinitionRecord(
      questionnaireDefinitionFromJson(setting.value),
      'published',
      setting.updatedAt,
      setting.createdAt,
    )
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
          this.options.telegramBotUsername,
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
          this.options.telegramBotUsername,
        ),
        created: false,
      }
    }

    const publicToken = await this.createUniqueCalculationToken()
    const proposalToken = await this.createUniqueProposalToken()
    const telegramBindToken = await this.createUniqueTelegramBindToken()
    const telegramDeliveryState = this.initialTelegramDeliveryState(telegramBindToken)
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
        const telegramDelivery = await tx.telegramDelivery.create({
          data: {
            targetType: 'proposal',
            status: telegramDeliveryState.status,
            statusMessage: telegramDeliveryState.statusMessage,
            bindToken: telegramBindToken,
            calculationId: row.id,
            expiresAt: telegramDeliveryState.expiresAt,
          },
        })

        return { row, proposals: [proposal], telegramDeliveries: [telegramDelivery] }
      })

      const savedCalculation = calculationToRecord(
        {
          ...persisted.row,
          telegramDeliveries: persisted.telegramDeliveries,
          questionnaire: null,
        },
        persisted.proposals,
      )
      await this.notifyOperationalTelegram('lead_submitted', savedCalculation)

      return {
        calculation: savedCalculation,
        publicCalculation: calculationToPublicRecord(
          { ...persisted.row, telegramDeliveries: persisted.telegramDeliveries },
          persisted.proposals,
          this.options.telegramBotUsername,
        ),
        created: true,
      }
    } catch (error) {
      if (isPrismaUniqueConstraint(error)) {
        const existing = await this.findCalculationByIdempotencyKey(input.idempotencyKey)
        if (existing) {
          assertIdempotencyFingerprintMatches(existing, requestFingerprintHash)
          return {
            calculation: calculationToRecord(existing, existing.proposals),
            publicCalculation: calculationToPublicRecord(
              existing,
              existing.proposals,
              this.options.telegramBotUsername,
            ),
            created: false,
          }
        }
        const duplicate = await this.findCalculationByDuplicateFingerprintHash(duplicateFingerprintHash)
        if (duplicate) {
          return {
            calculation: calculationToRecord(duplicate, duplicate.proposals),
            publicCalculation: calculationToPublicRecord(
              duplicate,
              duplicate.proposals,
              this.options.telegramBotUsername,
            ),
            created: false,
          }
        }
      }

      throw error
    }
  }

  async saveProjectExampleRequest(
    input: ProjectExampleRequestCreateRequest,
    metadata: SaveProjectExampleRequestMetadata = {},
  ) {
    const normalizedPhone = normalizeLeadPhone(input.clientPhone)
    const requestedExampleSlugs = normalizeProjectExampleSlugs(input.requestedExampleSlugs)
    const referrer = normalizeOptionalText(input.referrer ?? metadata.referrer, 2_048)
    const source = normalizeOptionalText(input.source, 80) ?? defaultProjectExampleRequestSource
    const requestFingerprintHash = projectExampleRequestFingerprintHash({
      input,
      normalizedPhone,
      requestedExampleSlugs,
      source,
      referrer,
    })

    const existingIdempotentRequest = await this.findProjectExampleRequestByIdempotencyKey(
      input.idempotencyKey,
    )
    if (existingIdempotentRequest) {
      assertProjectExampleRequestFingerprintMatches(existingIdempotentRequest, requestFingerprintHash)
      return {
        request: projectExampleRequestToRecord(existingIdempotentRequest),
        publicRequest: projectExampleRequestToPublicRecord(
          existingIdempotentRequest,
          this.options.telegramBotUsername,
        ),
        created: false,
      }
    }

    const publicToken = await this.createUniqueProjectExampleRequestToken()
    const telegramBindToken = await this.createUniqueTelegramBindToken()
    const telegramDeliveryState = this.initialTelegramDeliveryState(telegramBindToken)
    const consentAcceptedAt = new Date()

    try {
      const persisted = await this.db.$transaction(async (tx) => {
        const request = await tx.projectExampleRequest.create({
          data: {
            publicToken,
            idempotencyKey: input.idempotencyKey,
            requestFingerprintHash,
            clientName: input.clientName,
            clientPhone: normalizedPhone,
            requestedExampleSlugs: toJson(requestedExampleSlugs),
            source,
            referrer,
            utm: input.utm === undefined ? undefined : toJson(input.utm),
            consentAcceptedAt,
            consentVersion: projectExampleRequestConsentVersion,
            consentText: projectExampleRequestConsentText,
            consentIpAddress: normalizeOptionalText(metadata.ipAddress, 255),
            consentUserAgent: normalizeOptionalText(metadata.userAgent, 512),
          },
        })
        const telegramDelivery = await tx.telegramDelivery.create({
          data: {
            targetType: 'project_examples',
            status: telegramDeliveryState.status,
            statusMessage: telegramDeliveryState.statusMessage,
            bindToken: telegramBindToken,
            projectExampleRequestId: request.id,
            expiresAt: telegramDeliveryState.expiresAt,
          },
        })

        return { request, telegramDeliveries: [telegramDelivery] }
      })
      const requestWithDeliveries = {
        ...persisted.request,
        telegramDeliveries: persisted.telegramDeliveries,
      }

      return {
        request: projectExampleRequestToRecord(requestWithDeliveries),
        publicRequest: projectExampleRequestToPublicRecord(
          requestWithDeliveries,
          this.options.telegramBotUsername,
        ),
        created: true,
      }
    } catch (error) {
      if (isPrismaUniqueConstraint(error)) {
        const existing = await this.findProjectExampleRequestByIdempotencyKey(input.idempotencyKey)
        if (existing) {
          assertProjectExampleRequestFingerprintMatches(existing, requestFingerprintHash)
          return {
            request: projectExampleRequestToRecord(existing),
            publicRequest: projectExampleRequestToPublicRecord(
              existing,
              this.options.telegramBotUsername,
            ),
            created: false,
          }
        }
      }

      throw error
    }
  }

  async startQuestionnaire(
    input: QuestionnaireStartRequest,
    metadata: SaveQuestionnaireMetadata = {},
  ) {
    const parsedInput = questionnaireStartRequestSchema.parse(input)
    const normalizedPhone = normalizeLeadPhone(parsedInput.clientPhone)
    const referrer = normalizeOptionalText(parsedInput.referrer ?? metadata.referrer, 2_048)
    const source = normalizeOptionalText(parsedInput.source, 80) ?? defaultQuestionnaireSource
    const requestFingerprintHash = questionnaireStartFingerprintHash({
      input: parsedInput,
      normalizedPhone,
      source,
      referrer,
    })

    const existingIdempotentQuestionnaire = await this.findQuestionnaireByIdempotencyKey(
      parsedInput.idempotencyKey,
    )
    if (existingIdempotentQuestionnaire) {
      assertQuestionnaireFingerprintMatches(
        existingIdempotentQuestionnaire,
        requestFingerprintHash,
      )
      return {
        questionnaire: questionnaireToPublicSession(
          existingIdempotentQuestionnaire.calculation,
          existingIdempotentQuestionnaire,
        ),
        created: false,
      }
    }

    const exchangeRate = (await this.getExchangeRate()).exchangeRate
    const selectedServiceIds = parsedInput.calculation.selectedServiceIds
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
      ...parsedInput.calculation,
      services: services.map(serviceToCalculationInput),
      exchangeRate,
    })

    if (calculation.skippedServices.length > 0) {
      throw new AppError(
        409,
        'CONFLICT',
        'Selected services are unavailable for questionnaire lead',
        calculation.skippedServices,
      )
    }

    const duplicateWindowStartedAt = duplicateWindowStart(new Date())
    const duplicateFingerprintHash = questionnaireDuplicateFingerprintHash({
      normalizedPhone,
      calculation,
      duplicateWindowStartedAt,
    })
    const duplicateCalculation = await this.findCalculationByDuplicateFingerprintHash(duplicateFingerprintHash)

    if (duplicateCalculation?.questionnaire) {
      throw new AppError(
        409,
        'CONFLICT',
        'Опросник уже создан для этого телефона и расчета. Используйте старую ссылку, Telegram-сообщение или обратитесь к менеджеру.',
      )
    }

    const activeDefinition = publicQuestionnaireDefinitionRecord(await this.activeQuestionnaireDefinition())
    const publicToken = await this.createUniqueCalculationToken()
    const consentAcceptedAt = new Date()
    const initialAnswers = storedQuestionnaireAnswers(
      parsedInput.initialAnswers ?? [],
      consentAcceptedAt,
      activeDefinition,
    )

    try {
      const persisted = await this.db.$transaction(async (tx) => {
        const row = await tx.calculation.create({
          data: {
            publicToken,
            requestFingerprintHash,
            duplicateFingerprintHash,
            duplicateWindowStartedAt,
            clientName: parsedInput.clientName,
            clientPhone: normalizedPhone,
            objectName: parsedInput.objectName ?? null,
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
            utm: parsedInput.utm === undefined ? undefined : toJson(parsedInput.utm),
            consentAcceptedAt,
            consentVersion: questionnaireConsentVersion,
            consentText: questionnaireConsentText,
            consentIpAddress: normalizeOptionalText(metadata.ipAddress, 255),
            consentUserAgent: normalizeOptionalText(metadata.userAgent, 512),
          },
        })
        const questionnaire = await tx.calculationQuestionnaire.create({
          data: {
            calculationId: row.id,
            idempotencyKey: parsedInput.idempotencyKey,
            requestFingerprintHash,
            questionnaireVersion: activeDefinition.version,
            questionnaireDefinitionSnapshot: toJson(activeDefinition),
            questionnaireDefinitionHash: activeDefinition.definitionHash,
            answersSnapshot: toJson(initialAnswers),
            source,
            referrer,
            utm: parsedInput.utm === undefined ? undefined : toJson(parsedInput.utm),
            consentAcceptedAt,
            consentVersion: questionnaireConsentVersion,
            consentText: questionnaireConsentText,
            consentIpAddress: normalizeOptionalText(metadata.ipAddress, 255),
            consentUserAgent: normalizeOptionalText(metadata.userAgent, 512),
          },
        })

        return { row, questionnaire }
      })
      const savedCalculation = calculationToRecord(
        {
          ...persisted.row,
          proposals: [],
          telegramDeliveries: [],
          telegramNotifications: [],
          questionnaire: persisted.questionnaire,
        },
        [],
        this.options.publicWebsiteUrl,
      )
      await this.notifyOperationalTelegram('questionnaire_started', savedCalculation)

      return {
        questionnaire: questionnaireToPublicSession(persisted.row, persisted.questionnaire),
        created: true,
      }
    } catch (error) {
      if (isPrismaUniqueConstraint(error)) {
        const existing = await this.findQuestionnaireByIdempotencyKey(parsedInput.idempotencyKey)
        if (existing) {
          assertQuestionnaireFingerprintMatches(existing, requestFingerprintHash)
          return {
            questionnaire: questionnaireToPublicSession(existing.calculation, existing),
            created: false,
          }
        }

        const duplicate = await this.findCalculationByDuplicateFingerprintHash(duplicateFingerprintHash)
        if (duplicate?.questionnaire) {
          throw new AppError(
            409,
            'CONFLICT',
            'Опросник уже создан для этого телефона и расчета. Используйте старую ссылку, Telegram-сообщение или обратитесь к менеджеру.',
          )
        }
      }

      throw error
    }
  }

  async isExactQuestionnaireStartReplay(
    input: QuestionnaireStartRequest,
    metadata: SaveQuestionnaireMetadata = {},
  ) {
    const existing = await this.db.calculationQuestionnaire.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { requestFingerprintHash: true },
    })

    if (!existing) return false

    try {
      const parsedInput = questionnaireStartRequestSchema.parse(input)
      const normalizedPhone = normalizeLeadPhone(parsedInput.clientPhone)
      const referrer = normalizeOptionalText(parsedInput.referrer ?? metadata.referrer, 2_048)
      const source = normalizeOptionalText(parsedInput.source, 80) ?? defaultQuestionnaireSource
      const requestFingerprintHash = questionnaireStartFingerprintHash({
        input: parsedInput,
        normalizedPhone,
        source,
        referrer,
      })

      return existing.requestFingerprintHash === requestFingerprintHash
    } catch {
      return false
    }
  }

  async getPublicQuestionnaire(publicToken: string) {
    const calculation = await this.findQuestionnaireCalculationByPublicToken(publicToken)

    if (!calculation.questionnaire) {
      throw new AppError(404, 'NOT_FOUND', 'Questionnaire session not found')
    }

    return questionnaireToPublicSession(calculation, calculation.questionnaire)
  }

  async saveQuestionnaireAnswers(
    publicToken: string,
    input: QuestionnaireAnswersPatchRequest,
  ) {
    const parsedInput = questionnaireAnswersPatchRequestSchema.parse(input)
    const calculation = await this.findQuestionnaireCalculationByPublicToken(publicToken)

    if (!calculation.questionnaire) {
      throw new AppError(404, 'NOT_FOUND', 'Questionnaire session not found')
    }

    const definition = questionnaireDefinitionForSession(calculation.questionnaire)
    const existingAnswers = questionnaireAnswersFromJson(
      calculation.questionnaire.answersSnapshot,
      definition,
    )
    const previousProgress = calculateQuestionnaireProgress(
      existingAnswers,
      calculation.questionnaire.updatedAt.toISOString(),
      definition,
    )
    const answers = mergeStoredQuestionnaireAnswers(
      existingAnswers,
      parsedInput.answers,
      new Date(),
      definition,
    )
    const questionnaire = await this.db.calculationQuestionnaire.update({
      where: { calculationId: calculation.id },
      data: {
        answersSnapshot: toJson(answers),
      },
    })
    const nextProgress = calculateQuestionnaireProgress(
      questionnaireAnswersFromJson(questionnaire.answersSnapshot, definition),
      questionnaire.updatedAt.toISOString(),
      definition,
    )

    if (!previousProgress.completedAt && nextProgress.completedAt) {
      const refreshed = await this.findQuestionnaireCalculationByPublicToken(publicToken)
      await this.notifyOperationalTelegram(
        'questionnaire_completed',
        calculationToRecord(refreshed, refreshed.proposals, this.options.publicWebsiteUrl),
      )
    }

    return questionnaireToPublicSession(calculation, questionnaire)
  }

  async isExactProjectExampleRequestIdempotencyReplay(
    input: ProjectExampleRequestCreateRequest,
    metadata: SaveProjectExampleRequestMetadata = {},
  ) {
    const existing = await this.db.projectExampleRequest.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { requestFingerprintHash: true },
    })

    if (!existing) return false

    try {
      const normalizedPhone = normalizeLeadPhone(input.clientPhone)
      const requestedExampleSlugs = normalizeProjectExampleSlugs(input.requestedExampleSlugs)
      const referrer = normalizeOptionalText(input.referrer ?? metadata.referrer, 2_048)
      const source = normalizeOptionalText(input.source, 80) ?? defaultProjectExampleRequestSource
      const requestFingerprintHash = projectExampleRequestFingerprintHash({
        input,
        normalizedPhone,
        requestedExampleSlugs,
        source,
        referrer,
      })

      return existing.requestFingerprintHash === requestFingerprintHash
    } catch {
      return false
    }
  }

  async getPublicProjectExamplePdf(publicToken: string, slug: string) {
    const normalizedSlug = normalizeProjectExampleSlug(slug)
    const request = await this.db.projectExampleRequest
      .findUniqueOrThrow({
        where: { publicToken },
      })
      .catch((error: unknown) => {
        if (isPrismaNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Project example request not found')
        }
        throw error
      })
    const requestedExampleSlugs = projectExampleSlugsFromJson(request.requestedExampleSlugs)

    if (!requestedExampleSlugs.includes(normalizedSlug)) {
      throw new AppError(404, 'NOT_FOUND', 'Project example is not available for this request')
    }

    const asset = projectExampleAssetBySlug(normalizedSlug)
    const bytes = await readFile(new URL(asset.fileName, projectExampleAssetBaseUrl)).catch((error: unknown) => {
      if (isNotFoundFileError(error)) {
        throw new AppError(404, 'NOT_FOUND', 'Project example PDF is not available')
      }
      throw error
    })

    return {
      asset,
      bytes: new Uint8Array(bytes),
    }
  }

  async listProjectExampleRequests(input: ProjectExampleRequestListQuery) {
    const [requests, totalCount] = await Promise.all([
      this.db.projectExampleRequest.findMany({
        include: projectExampleRequestInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit,
        skip: input.offset,
      }),
      this.db.projectExampleRequest.count(),
    ])

    return {
      requests: requests.map(projectExampleRequestToRecord),
      summary: {
        totalCount,
        limit: input.limit,
        offset: input.offset,
      },
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
        include: calculationDetailInclude,
      })
      .catch((error: unknown) => {
        if (isPrismaNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Calculation not found')
        }
        throw error
      })

    return calculationToRecord(calculation, calculation.proposals, this.options.publicWebsiteUrl)
  }

  async listCalculations(input: CalculationListQuery) {
    const where = calculationListWhere(input)
    const calculations = await this.db.calculation.findMany({
      where,
      include: calculationDetailInclude,
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
        calculationToListItem(calculation, calculation.proposals, this.options.publicWebsiteUrl),
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
        include: calculationDetailInclude,
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
      return calculationToRecord(existing, existing.proposals, this.options.publicWebsiteUrl)
    }

    const calculation = await this.db.calculation.update({
      where: { id },
      data,
      include: calculationDetailInclude,
    })

    return calculationToRecord(calculation, calculation.proposals, this.options.publicWebsiteUrl)
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
      return ensureCommercialProposalPublicTypography(proposal.htmlSnapshot)
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
      where: { isPublic: true, isArchived: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })

    return examples.map(projectExampleToRecord)
  }

  async listPublicProjectExampleSummaries() {
    const examples = await this.db.projectExample.findMany({
      where: { isPublic: true, isArchived: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })

    return examples.map(projectExampleToPublicRecord)
  }

  async getPublicProjectExampleBySlug(slug: string) {
    const example = await this.db.projectExample
      .findFirstOrThrow({
        where: {
          slug: normalizeProjectExampleSlug(slug),
          isPublic: true,
          isArchived: false,
        },
      })
      .catch((error: unknown) => {
        if (isPrismaNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Project example not found')
        }
        throw error
      })

    return projectExampleToPublicRecord(example)
  }

  async listAdminProjectExamples() {
    const examples = await this.db.projectExample.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })

    return examples.map(projectExampleToRecord)
  }

  async createProjectExample(input: ProjectExampleCreateRequest) {
    const slug = await this.createUniqueProjectExampleSlug(input.slug ?? slugBaseFromTitle(input.title))
    const exampleSlugs = normalizeProjectExampleSlugs(input.exampleSlugs ?? [])

    const example = await this.db.projectExample.create({
      data: {
        slug,
        title: input.title,
        description: input.description ?? null,
        objectType: input.objectType ?? null,
        location: input.location ?? null,
        areaSqm: input.areaSqm ?? null,
        engineeringSections: toJson(input.engineeringSections ?? []),
        initialTask: input.initialTask ?? null,
        solutionSummary: input.solutionSummary ?? null,
        fragments: toJson(input.fragments ?? []),
        exampleSlugs: toJson(exampleSlugs),
        fileUrl: input.fileUrl,
        coverImageUrl: input.coverImageUrl ?? null,
        isPublic: input.isArchived ? false : input.isPublic ?? true,
        isArchived: input.isArchived ?? false,
        sortOrder: input.sortOrder ?? 0,
      },
    }).catch((error: unknown) => {
      if (isPrismaUniqueConstraint(error)) {
        throw new AppError(409, 'CONFLICT', 'Project example slug is already used')
      }
      throw error
    })

    return projectExampleToRecord(example)
  }

  async updateProjectExample(id: string, input: ProjectExampleUpdateRequest) {
    const existing = await this.db.projectExample
      .findUniqueOrThrow({
        where: { id },
      })
      .catch((error: unknown) => {
        if (isPrismaNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Project example not found')
        }
        throw error
      })

    const example = await this.db.projectExample
      .update({
        where: { id },
        data: projectExampleUpdateData(input, existing),
      })
      .catch((error: unknown) => {
        if (isPrismaNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Project example not found')
        }
        if (isPrismaUniqueConstraint(error)) {
          throw new AppError(409, 'CONFLICT', 'Project example slug is already used')
        }
        throw error
      })

    return projectExampleToRecord(example)
  }

  async reorderProjectExamples(input: ProjectExampleReorderRequest) {
    const exampleIds = input.examples.map((example) => example.id)
    const existing = await this.db.projectExample.findMany({
      where: {
        id: {
          in: exampleIds,
        },
      },
      select: {
        id: true,
      },
    })
    const existingIds = new Set(existing.map((example) => example.id))
    const missingIds = exampleIds.filter((id) => !existingIds.has(id))

    if (missingIds.length > 0) {
      throw new AppError(404, 'NOT_FOUND', 'Project example not found', { missingIds })
    }

    await this.db.$transaction(
      input.examples.map((example) =>
        this.db.projectExample.update({
          where: { id: example.id },
          data: { sortOrder: example.sortOrder },
        }),
      ),
    )

    return this.listAdminProjectExamples()
  }

  async listPublicBlogPosts(now = new Date()): Promise<PublicBlogPostSummary[]> {
    const posts = await this.db.blogPost.findMany({
      where: {
        status: 'published',
        publishedAt: {
          lte: now,
        },
      },
      orderBy: [{ publishedAt: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    })

    return posts.map(blogPostToPublicSummary)
  }

  async getPublicBlogPostBySlug(slug: string, now = new Date()): Promise<PublicBlogPostRecord> {
    const post = await this.db.blogPost
      .findFirstOrThrow({
        where: {
          slug: normalizeBlogPostSlug(slug),
          status: 'published',
          publishedAt: {
            lte: now,
          },
        },
      })
      .catch((error: unknown) => {
        if (isPrismaNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Blog post not found')
        }
        throw error
      })

    return blogPostToPublicRecord(post)
  }

  async listAdminBlogPosts(): Promise<BlogPostRecord[]> {
    const posts = await this.db.blogPost.findMany({
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    })

    return posts.map(blogPostToRecord)
  }

  async createBlogPost(input: BlogPostCreateRequest): Promise<BlogPostRecord> {
    const slug = await this.createUniqueBlogPostSlug(input.slug ?? slugBaseFromTitle(input.title, 'post'))
    const post = await this.db.blogPost
      .create({
        data: blogPostCreateData(input, slug),
      })
      .catch((error: unknown) => {
        if (isPrismaUniqueConstraint(error)) {
          throw new AppError(409, 'CONFLICT', 'Blog post slug is already used')
        }
        throw error
      })

    return blogPostToRecord(post)
  }

  async updateBlogPost(id: string, input: BlogPostUpdateRequest): Promise<BlogPostRecord> {
    const existing = await this.db.blogPost
      .findUniqueOrThrow({
        where: { id },
      })
      .catch((error: unknown) => {
        if (isPrismaNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Blog post not found')
        }
        throw error
      })

    const post = await this.db.blogPost
      .update({
        where: { id },
        data: blogPostUpdateData(input, existing),
      })
      .catch((error: unknown) => {
        if (isPrismaNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Blog post not found')
        }
        if (isPrismaUniqueConstraint(error)) {
          throw new AppError(409, 'CONFLICT', 'Blog post slug is already used')
        }
        throw error
      })

    return blogPostToRecord(post)
  }

  async handleTelegramWebhookUpdate(update: unknown) {
    const startPayload = telegramStartPayloadFromUpdate(update)
    if (!startPayload) return { status: 'ignored' as const }

    await this.bindAndDeliverTelegramDocument(startPayload)
    return { status: 'processed' as const }
  }

  private async bindAndDeliverTelegramDocument(startPayload: TelegramStartPayload) {
    const delivery = await this.db.telegramDelivery.findUnique({
      where: { bindToken: startPayload.bindToken },
      include: telegramDeliveryTargetInclude,
    })

    if (!delivery) return
    if (delivery.status === 'sent') return

    if (!(await this.claimTelegramDeliveryAttempt(delivery.id, startPayload))) {
      return
    }

    if (delivery.expiresAt && delivery.expiresAt.getTime() < Date.now()) {
      await this.updateTelegramDeliveryFailure(
        delivery.id,
        startPayload,
        'Telegram start token expired',
      )
      return
    }

    const message = this.telegramDocumentMessage(delivery)
    if (!message) {
      await this.updateTelegramDeliveryFailure(
        delivery.id,
        startPayload,
        'Telegram delivery target is no longer available',
      )
      return
    }

    if (!this.telegramDocumentSender) {
      await this.updateTelegramDeliveryDisabled(delivery.id, startPayload)
      return
    }

    try {
      const result = await this.telegramDocumentSender.sendDocumentDelivery({
        chatId: startPayload.chatId,
        text: message,
      })

      if (result.status === 'disabled') {
        await this.updateTelegramDeliveryDisabled(delivery.id, startPayload)
        return
      }

      await this.db.telegramDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'sent',
          statusMessage: null,
          telegramChatId: startPayload.chatId,
          telegramUserId: startPayload.userId,
          telegramUsername: startPayload.username,
          telegramFirstName: startPayload.firstName,
          deliveredAt: new Date(),
        },
      })
    } catch (error) {
      await this.updateTelegramDeliveryFailure(
        delivery.id,
        startPayload,
        safeTelegramDeliveryErrorMessage(error),
      )
    }
  }

  private async claimTelegramDeliveryAttempt(
    deliveryId: string,
    startPayload: TelegramStartPayload,
  ) {
    const claim = await this.db.telegramDelivery.updateMany({
      where: {
        id: deliveryId,
        status: {
          not: 'sent',
        },
        lastAttemptAt: null,
      },
      data: {
        telegramChatId: startPayload.chatId,
        telegramUserId: startPayload.userId,
        telegramUsername: startPayload.username,
        telegramFirstName: startPayload.firstName,
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
        statusMessage: 'Telegram delivery attempt started',
      },
    })

    return claim.count === 1
  }

  private telegramDocumentMessage(delivery: TelegramDeliveryWithTargets) {
    if (delivery.targetType === 'proposal') {
      const proposal = delivery.calculation?.proposals[0]
      if (!proposal) return null

      const artifact = proposalToArtifactReference(proposal)
      return formatTelegramProposalDeliveryMessage(
        proposal.offerNumber,
        {
          proposalUrl: absoluteUrl(this.publicApiBaseUrl(), artifact.urlPath),
          proposalPdfUrl: artifact.pdfUrlPath
            ? absoluteUrl(this.publicApiBaseUrl(), artifact.pdfUrlPath)
            : artifact.pdfUrl ?? undefined,
        },
      )
    }

    const request = delivery.projectExampleRequest
    if (!request) return null

    const examples = projectExampleSlugsFromJson(request.requestedExampleSlugs).map((slug) => {
      const link = projectExampleDeliveryLink(projectExampleAssetBySlug(slug), request.publicToken)
      return {
        code: link.code,
        title: link.title,
        url: absoluteUrl(this.publicApiBaseUrl(), link.urlPath),
      }
    })

    return formatTelegramProjectExamplesDeliveryMessage(examples)
  }

  private async updateTelegramDeliveryDisabled(
    deliveryId: string,
    startPayload: TelegramStartPayload,
  ) {
    await this.db.telegramDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'disabled',
        statusMessage: 'Telegram client delivery is not configured',
        telegramChatId: startPayload.chatId,
        telegramUserId: startPayload.userId,
        telegramUsername: startPayload.username,
        telegramFirstName: startPayload.firstName,
      },
    })
  }

  private async updateTelegramDeliveryFailure(
    deliveryId: string,
    startPayload: TelegramStartPayload,
    statusMessage: string,
  ) {
    await this.db.telegramDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'failed',
        statusMessage: normalizeOptionalText(statusMessage, 500),
        telegramChatId: startPayload.chatId,
        telegramUserId: startPayload.userId,
        telegramUsername: startPayload.username,
        telegramFirstName: startPayload.firstName,
      },
    })
  }

  private initialTelegramDeliveryState(bindToken: string) {
    const canCreateDeepLink = Boolean(telegramDeepLink(this.options.telegramBotUsername, bindToken))
    const canSend = this.telegramDocumentSender?.isConfigured() === true
    const canAuthenticateWebhook = Boolean(this.options.telegramWebhookSecret?.trim())

    if (!canCreateDeepLink || !canSend || !canAuthenticateWebhook) {
      return {
        status: 'disabled' as const,
        statusMessage: 'Telegram client delivery is not configured',
        expiresAt: null,
      }
    }

    return {
      status: 'pending_start' as const,
      statusMessage: 'Waiting for the client to open the Telegram bot deep link',
      expiresAt: new Date(Date.now() + telegramBindTokenTtlMs),
    }
  }

  private publicApiBaseUrl() {
    return this.options.publicApiUrl ?? 'http://localhost:3000'
  }

  private async activeQuestionnaireDefinition(): Promise<QuestionnaireDefinitionRecord> {
    const setting = await this.db.appSetting.findUnique({
      where: { key: questionnaireDefinitionSettingKey },
    })

    if (!setting) {
      return questionnaireDefinitionRecord(
        committedQuestionnaireDefinition(),
        'static_fallback',
        new Date(staticQuestionnaireDefinitionUpdatedAt),
        null,
      )
    }

    return questionnaireDefinitionRecord(
      questionnaireDefinitionFromJson(setting.value),
      'published',
      setting.updatedAt,
      setting.createdAt,
    )
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

  private async createUniqueProjectExampleRequestToken() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = randomToken()
      const existing = await this.db.projectExampleRequest.findUnique({
        where: { publicToken: token },
        select: { id: true },
      })
      if (!existing) return token
    }

    throw new AppError(500, 'INTERNAL_ERROR', 'Could not allocate project example request token')
  }

  private async createUniqueProjectExampleSlug(rawBase: string) {
    const base = normalizeProjectExampleSlugInput(rawBase)

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const suffix = attempt === 0 ? '' : `-${attempt + 1}`
      const slug = `${base.slice(0, 64 - suffix.length)}${suffix}`
      const existing = await this.db.projectExample.findUnique({
        where: { slug },
        select: { id: true },
      })
      if (!existing) return slug
    }

    throw new AppError(500, 'INTERNAL_ERROR', 'Could not allocate project example slug')
  }

  private async createUniqueBlogPostSlug(rawBase: string) {
    const base = normalizeBlogPostSlugInput(rawBase)

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const suffix = attempt === 0 ? '' : `-${attempt + 1}`
      const slug = `${base.slice(0, 80 - suffix.length)}${suffix}`
      const existing = await this.db.blogPost.findUnique({
        where: { slug },
        select: { id: true },
      })
      if (!existing) return slug
    }

    throw new AppError(500, 'INTERNAL_ERROR', 'Could not allocate blog post slug')
  }

  private async createUniqueTelegramBindToken() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = randomToken()
      const existing = await this.db.telegramDelivery.findUnique({
        where: { bindToken: token },
        select: { id: true },
      })
      if (!existing) return token
    }

    throw new AppError(500, 'INTERNAL_ERROR', 'Could not allocate Telegram bind token')
  }

  private async findCalculationByIdempotencyKey(idempotencyKey: string) {
    return this.db.calculation.findUnique({
      where: { idempotencyKey },
      include: calculationDetailInclude,
    })
  }

  private async findQuestionnaireByIdempotencyKey(idempotencyKey: string) {
    return this.db.calculationQuestionnaire.findUnique({
      where: { idempotencyKey },
      include: {
        calculation: {
          include: {
            proposals: orderedProposalInclude,
          },
        },
      },
    })
  }

  private async findProjectExampleRequestByIdempotencyKey(idempotencyKey: string) {
    return this.db.projectExampleRequest.findUnique({
      where: { idempotencyKey },
      include: projectExampleRequestInclude,
    })
  }

  private async findCalculationByDuplicateFingerprintHash(
    duplicateFingerprintHash: string,
  ): Promise<CalculationWithQuestionnaire | null> {
    return this.db.calculation.findUnique({
      where: { duplicateFingerprintHash },
      include: calculationDetailInclude,
    })
  }

  private async findQuestionnaireCalculationByPublicToken(
    publicToken: string,
  ): Promise<CalculationWithQuestionnaire> {
    return this.db.calculation
      .findUniqueOrThrow({
        where: { publicToken },
        include: calculationDetailInclude,
      })
      .catch((error: unknown) => {
        if (isPrismaNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Questionnaire session not found')
        }
        throw error
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

  private async notifyOperationalTelegram(
    eventType: TelegramNotificationEventType,
    calculation: CalculationRecord,
  ) {
    if (!this.leadNotifier) return

    const claim = await this.db.telegramNotification
      .create({
        data: {
          calculationId: calculation.id,
          eventType,
          status: 'pending',
          statusMessage: 'Telegram notification is being sent',
          attemptCount: 1,
        },
      })
      .catch((error: unknown) => {
        if (isPrismaUniqueConstraint(error)) return null
        throw error
      })

    if (!claim) return

    try {
      const result = await this.sendOperationalTelegramEvent(eventType, calculation)
      await this.db.telegramNotification.update({
        where: { id: claim.id },
        data: {
          status: result.status,
          statusMessage: result.status === 'sent'
            ? 'Telegram notification sent'
            : 'Telegram notification is not configured',
          sentAt: result.status === 'sent' ? new Date() : null,
        },
      })
    } catch (error) {
      const statusMessage = safeTelegramDeliveryErrorMessage(error)
      await this.db.telegramNotification.update({
        where: { id: claim.id },
        data: {
          status: 'failed',
          statusMessage,
        },
      }).catch(() => undefined)
      console.error('Telegram notification failed:', statusMessage)
    }
  }

  private sendOperationalTelegramEvent(
    eventType: TelegramNotificationEventType,
    calculation: CalculationRecord,
  ) {
    if (eventType === 'questionnaire_started') {
      return this.leadNotifier!.notifyQuestionnaireStarted({ calculation })
    }
    if (eventType === 'questionnaire_completed') {
      return this.leadNotifier!.notifyQuestionnaireCompleted({ calculation })
    }
    return this.leadNotifier!.notifyLeadSubmitted({ calculation })
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

function projectExampleUpdateData(input: ProjectExampleUpdateRequest, existing: ProjectExampleRow) {
  const nextIsArchived = input.isArchived ?? existing.isArchived

  return {
    slug: input.slug,
    title: input.title,
    description: input.description,
    objectType: input.objectType,
    location: input.location,
    areaSqm: input.areaSqm,
    engineeringSections: input.engineeringSections === undefined
      ? undefined
      : toJson(input.engineeringSections),
    initialTask: input.initialTask,
    solutionSummary: input.solutionSummary,
    fragments: input.fragments === undefined
      ? undefined
      : toJson(input.fragments),
    exampleSlugs: input.exampleSlugs === undefined
      ? undefined
      : toJson(normalizeProjectExampleSlugs(input.exampleSlugs)),
    fileUrl: input.fileUrl,
    coverImageUrl: input.coverImageUrl,
    isPublic: nextIsArchived ? false : input.isPublic,
    isArchived: input.isArchived,
    sortOrder: input.sortOrder,
  }
}

function blogPostCreateData(input: BlogPostCreateRequest, slug: string) {
  const status = input.status ?? 'draft'
  const publishedAt = resolveBlogPostPublishedAt(status, input.publishedAt, null)

  if (status === 'published') {
    assertBlogPostCanBePublished(input)
  }

  return {
    slug,
    title: input.title,
    excerpt: input.excerpt,
    content: input.content,
    coverImageUrl: input.coverImageUrl ?? null,
    category: input.category ?? null,
    tags: toJson(input.tags ?? []),
    seoTitle: input.seoTitle ?? null,
    seoDescription: input.seoDescription ?? null,
    status,
    publishedAt,
    sortOrder: input.sortOrder ?? 0,
  }
}

function blogPostUpdateData(input: BlogPostUpdateRequest, existing: BlogPostRow) {
  const status = input.status ?? existing.status
  const title = input.title ?? existing.title
  const excerpt = input.excerpt ?? existing.excerpt
  const content = input.content ?? existing.content
  const publishedAt = resolveBlogPostPublishedAt(status, input.publishedAt, existing.publishedAt)

  if (status === 'published') {
    assertBlogPostCanBePublished({ title, excerpt, content })
  }

  return {
    slug: input.slug,
    title: input.title,
    excerpt: input.excerpt,
    content: input.content,
    coverImageUrl: input.coverImageUrl,
    category: input.category,
    tags: input.tags === undefined ? undefined : toJson(input.tags),
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    status: input.status,
    publishedAt,
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
  calculation: CalculationRow & {
    proposals?: ProposalRow[]
    telegramDeliveries?: TelegramDeliveryRow[]
    telegramNotifications?: TelegramNotificationRow[]
    questionnaire?: CalculationQuestionnaireRow | null
  },
  proposals: ProposalRow[],
  publicWebsiteUrl?: string,
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
    telegramDeliveries: (calculation.telegramDeliveries ?? []).map(telegramDeliveryToRecord),
    telegramNotifications: (calculation.telegramNotifications ?? []).map(telegramNotificationToRecord),
    questionnaire: calculation.questionnaire
      ? questionnaireToAdminDraft(
          calculation.questionnaire,
          calculation.publicToken,
          publicWebsiteUrl,
        )
      : null,
    createdAt: calculation.createdAt.toISOString(),
    updatedAt: calculation.updatedAt.toISOString(),
  }
}

function calculationToListItem(
  calculation: CalculationRow & {
    proposals?: ProposalRow[]
    telegramDeliveries?: TelegramDeliveryRow[]
    telegramNotifications?: TelegramNotificationRow[]
    questionnaire?: CalculationQuestionnaireRow | null
  },
  proposals: ProposalRow[],
  publicWebsiteUrl?: string,
): CalculationListItem {
  const record = calculationToRecord(calculation, proposals, publicWebsiteUrl)

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
    source: record.source,
    proposalArtifacts: record.proposalArtifacts,
    telegramDeliveries: record.telegramDeliveries,
    telegramNotifications: record.telegramNotifications,
    questionnaire: record.questionnaire
      ? questionnaireToAdminSummary(calculation.questionnaire ?? null)
      : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function calculationToPublicRecord(
  calculation: CalculationRow & {
    proposals?: ProposalRow[]
    telegramDeliveries?: TelegramDeliveryRow[]
  },
  proposals: ProposalRow[],
  telegramBotUsername?: string,
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
    telegramDelivery: publicTelegramDelivery(
      calculation.telegramDeliveries,
      telegramBotUsername,
    ),
    createdAt: calculation.createdAt.toISOString(),
  }
}

function projectExampleToRecord(example: ProjectExampleRow): ProjectExampleRecord {
  return {
    id: example.id,
    slug: example.slug,
    title: example.title,
    description: example.description,
    objectType: example.objectType,
    location: example.location,
    areaSqm: example.areaSqm,
    engineeringSections: projectExampleSectionsFromJson(example.engineeringSections),
    initialTask: example.initialTask,
    solutionSummary: example.solutionSummary,
    fragments: projectExampleFragmentsFromJson(example.fragments),
    exampleSlugs: projectExampleSlugsFromJson(example.exampleSlugs),
    fileUrl: example.fileUrl,
    coverImageUrl: example.coverImageUrl,
    isPublic: example.isPublic,
    isArchived: example.isArchived,
    sortOrder: example.sortOrder,
    createdAt: example.createdAt.toISOString(),
    updatedAt: example.updatedAt.toISOString(),
  }
}

function projectExampleToPublicRecord(example: ProjectExampleRow): PublicProjectExampleRecord {
  return {
    id: example.id,
    slug: example.slug,
    title: example.title,
    description: example.description,
    objectType: example.objectType,
    location: example.location,
    areaSqm: example.areaSqm,
    engineeringSections: projectExampleSectionsFromJson(example.engineeringSections),
    initialTask: example.initialTask,
    solutionSummary: example.solutionSummary,
    fragments: projectExampleFragmentsFromJson(example.fragments),
    exampleSlugs: projectExampleSlugsFromJson(example.exampleSlugs),
    coverImageUrl: example.coverImageUrl,
    sortOrder: example.sortOrder,
  }
}

function blogPostToRecord(post: BlogPostRow): BlogPostRecord {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    coverImageUrl: post.coverImageUrl,
    category: post.category,
    tags: blogPostTagsFromJson(post.tags),
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    status: post.status,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    sortOrder: post.sortOrder,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  }
}

function blogPostToPublicSummary(post: BlogPostRow): PublicBlogPostSummary {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    coverImageUrl: post.coverImageUrl,
    category: post.category,
    tags: blogPostTagsFromJson(post.tags),
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    sortOrder: post.sortOrder,
    updatedAt: post.updatedAt.toISOString(),
  }
}

function blogPostToPublicRecord(post: BlogPostRow): PublicBlogPostRecord {
  return {
    ...blogPostToPublicSummary(post),
    content: post.content,
  }
}

function projectExampleRequestToPublicRecord(
  request: ProjectExampleRequestWithDeliveries,
  telegramBotUsername?: string,
): PublicProjectExampleRequestRecord {
  const requestedExampleSlugs = projectExampleSlugsFromJson(request.requestedExampleSlugs)

  return {
    publicToken: request.publicToken,
    clientPhone: request.clientPhone,
    requestedExamples: requestedExampleSlugs.map((slug) =>
      projectExampleDeliveryLink(projectExampleAssetBySlug(slug), request.publicToken),
    ),
    telegramDelivery: publicTelegramDelivery(
      request.telegramDeliveries,
      telegramBotUsername,
    ),
    createdAt: request.createdAt.toISOString(),
  }
}

function projectExampleRequestToRecord(
  request: ProjectExampleRequestWithDeliveries,
): ProjectExampleRequestRecord {
  const requestedExampleSlugs = projectExampleSlugsFromJson(request.requestedExampleSlugs)

  return {
    id: request.id,
    publicToken: request.publicToken,
    idempotencyKey: request.idempotencyKey,
    requestFingerprintHash: request.requestFingerprintHash,
    clientName: request.clientName,
    clientPhone: request.clientPhone,
    requestedExampleSlugs,
    requestedExamples: requestedExampleSlugs.map((slug) =>
      projectExampleDeliveryLink(projectExampleAssetBySlug(slug), request.publicToken),
    ),
    source: request.source,
    referrer: request.referrer,
    utm: (request.utm as Record<string, unknown> | null) ?? null,
    consentAcceptedAt: request.consentAcceptedAt?.toISOString() ?? null,
    consentVersion: request.consentVersion,
    consentText: request.consentText,
    consentIpAddress: request.consentIpAddress,
    consentUserAgent: request.consentUserAgent,
    telegramDeliveries: (request.telegramDeliveries ?? []).map(telegramDeliveryToRecord),
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  }
}

function telegramDeliveryToRecord(delivery: TelegramDeliveryRow): TelegramDeliveryRecord {
  return {
    id: delivery.id,
    targetType: delivery.targetType,
    status: delivery.status,
    statusMessage: delivery.statusMessage,
    telegramChatId: delivery.telegramChatId,
    telegramUserId: delivery.telegramUserId,
    telegramUsername: delivery.telegramUsername,
    telegramFirstName: delivery.telegramFirstName,
    attemptCount: delivery.attemptCount,
    lastAttemptAt: delivery.lastAttemptAt?.toISOString() ?? null,
    deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
    expiresAt: delivery.expiresAt?.toISOString() ?? null,
    createdAt: delivery.createdAt.toISOString(),
    updatedAt: delivery.updatedAt.toISOString(),
  }
}

function telegramNotificationToRecord(
  notification: TelegramNotificationRow,
): CalculationRecord['telegramNotifications'][number] {
  return {
    id: notification.id,
    eventType: notification.eventType,
    status: notification.status,
    statusMessage: notification.statusMessage,
    attemptCount: notification.attemptCount,
    sentAt: notification.sentAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
    updatedAt: notification.updatedAt.toISOString(),
  }
}

function publicTelegramDelivery(
  deliveries: readonly TelegramDeliveryRow[] | undefined,
  telegramBotUsername?: string,
): PublicTelegramDelivery | null {
  const delivery = deliveries?.[0]
  if (!delivery) return null

  return {
    status: delivery.status,
    deepLinkUrl: delivery.status === 'pending_start'
      ? telegramDeepLink(telegramBotUsername, delivery.bindToken)
      : null,
  }
}

function projectExampleDeliveryLink(
  asset: (typeof publicProjectExampleAssets)[number],
  publicToken: string,
): ProjectExampleDeliveryLink {
  const urlPath = `/api/public/project-example-requests/${publicToken}/examples/${asset.slug}`

  return {
    slug: asset.slug,
    code: asset.code,
    title: asset.title,
    description: asset.description,
    fileName: asset.fileName,
    pageCount: asset.pageCount,
    fileSizeBytes: asset.fileSizeBytes,
    urlPath,
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

function questionnaireToPublicSession(
  calculation: CalculationRow & { proposals?: ProposalRow[] },
  questionnaire: CalculationQuestionnaireRow,
): PublicQuestionnaireSession {
  const calculationSnapshot = calculationResultSchema.parse(calculation.calculationSnapshot)
  const definition = questionnaireDefinitionForSession(questionnaire)
  const answers = questionnaireAnswersFromJson(questionnaire.answersSnapshot, definition)

  return {
    publicToken: calculation.publicToken,
    questionnaireVersion: questionnaire.questionnaireVersion,
    definitionHash: definition.definitionHash,
    definition,
    progress: calculateQuestionnaireProgress(answers, questionnaire.updatedAt.toISOString(), definition),
    calculation: {
      areaSqm: calculationSnapshot.areaSqm,
      selectedServiceIds: calculationSnapshot.selectedServiceIds,
      serviceTitles: calculationSnapshot.lineItems.map((lineItem) => lineItem.serviceSnapshot.title),
      totalUsdCents: calculationSnapshot.totals.totalUsdCents,
      totalBynRoundedRubles: calculationSnapshot.totals.totalBynRoundedRubles,
    },
    answers,
    createdAt: questionnaire.createdAt.toISOString(),
    updatedAt: questionnaire.updatedAt.toISOString(),
  }
}

function questionnaireToAdminDraft(
  questionnaire: CalculationQuestionnaireRow,
  publicToken: string,
  publicWebsiteUrl?: string,
): AdminQuestionnaireDraft {
  const definition = questionnaireDefinitionForSession(questionnaire)
  const answers = questionnaireAnswersFromJson(questionnaire.answersSnapshot, definition)
  const answersByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]))
  const activeQuestionIds = new Set(
    getQuestionnaireActiveQuestions(answers, definition).map((question) => question.id),
  )

  return {
    id: questionnaire.id,
    questionnaireVersion: questionnaire.questionnaireVersion,
    definitionHash: definition.definitionHash,
    resumeUrl: questionnaireResumeUrl(publicToken, publicWebsiteUrl),
    source: questionnaire.source,
    definitionSource: definition.sourceBrief,
    definitionUpdatedAt: definition.sourceUpdatedAt,
    sourcePolicy: definition.sourcePolicy,
    progress: calculateQuestionnaireProgress(answers, questionnaire.updatedAt.toISOString(), definition),
    consentAcceptedAt: questionnaire.consentAcceptedAt?.toISOString() ?? null,
    consentVersion: questionnaire.consentVersion,
    consentText: questionnaire.consentText,
    createdAt: questionnaire.createdAt.toISOString(),
    updatedAt: questionnaire.updatedAt.toISOString(),
    sections: definition.sections.map((section) => ({
      id: section.id,
      title: section.title,
      questions: section.questions.map((question) => {
        const answer = answersByQuestionId.get(question.id) ?? null
        const isActive = activeQuestionIds.has(question.id)

        return {
          id: question.id,
          prompt: question.prompt,
          sourceRow: question.sourceRow,
          isActive,
          isLegacy: question.isLegacy ?? section.isLegacy ?? false,
          options: [...getQuestionnaireActiveOptions(question, answers, definition)],
          answer: answer
            ? {
                ...answer,
                label: questionnaireAnswerLabel(question.id, answer, definition),
              }
            : null,
        }
      }),
    })),
  }
}

function questionnaireToAdminSummary(
  questionnaire: CalculationQuestionnaireRow | null,
): CalculationListItem['questionnaire'] {
  if (!questionnaire) return null

  const definition = questionnaireDefinitionForSession(questionnaire)
  const answers = questionnaireAnswersFromJson(questionnaire.answersSnapshot, definition)
  const progress = calculateQuestionnaireProgress(answers, questionnaire.updatedAt.toISOString(), definition)

  return {
    questionnaireVersion: questionnaire.questionnaireVersion,
    definitionHash: definition.definitionHash,
    answeredCount: progress.answeredCount,
    totalQuestions: progress.totalQuestions,
    completionPercent: progress.completionPercent,
    unknownCount: progress.unknownCount,
    skippedCount: progress.skippedCount,
    updatedAt: questionnaire.updatedAt.toISOString(),
  }
}

function questionnaireAnswersFromJson(
  value: Prisma.JsonValue,
  definition: QuestionnaireDefinition = technicalQuestionnaireDefinition,
): QuestionnaireStoredAnswer[] {
  return markQuestionnaireAnswersActivity(questionnaireStoredAnswerSchema.array().parse(value), definition)
}

function storedQuestionnaireAnswers(
  answers: NonNullable<QuestionnaireStartRequest['initialAnswers']>,
  updatedAt: Date,
  definition: QuestionnaireDefinition = technicalQuestionnaireDefinition,
): QuestionnaireStoredAnswer[] {
  return markQuestionnaireAnswersActivity(sortQuestionnaireAnswers(
    answers.map((answer) => ({
      ...answer,
      updatedAt: updatedAt.toISOString(),
      isActive: true,
    })),
    definition,
  ), definition)
}

function mergeStoredQuestionnaireAnswers(
  existingAnswers: readonly QuestionnaireStoredAnswer[],
  nextAnswers: QuestionnaireAnswersPatchRequest['answers'],
  updatedAt: Date,
  definition: QuestionnaireDefinition = technicalQuestionnaireDefinition,
) {
  const answersByQuestionId = new Map(existingAnswers.map((answer) => [answer.questionId, answer]))

  for (const answer of nextAnswers) {
    answersByQuestionId.set(answer.questionId, {
      ...answer,
      updatedAt: updatedAt.toISOString(),
      isActive: true,
    })
  }

  return markQuestionnaireAnswersActivity(
    sortQuestionnaireAnswers([...answersByQuestionId.values()], definition),
    definition,
  )
}

function sortQuestionnaireAnswers(
  answers: QuestionnaireStoredAnswer[],
  definition: QuestionnaireDefinition = technicalQuestionnaireDefinition,
) {
  const order = new Map(
    definition.sections
      .flatMap((section) => section.questions)
      .map((question, index) => [question.id, index]),
  )

  return [...answers].sort(
    (first, second) =>
      (order.get(first.questionId) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(second.questionId) ?? Number.MAX_SAFE_INTEGER),
  )
}

function questionnaireAnswerLabel(
  questionId: string,
  answer: QuestionnaireStoredAnswer,
  definition: QuestionnaireDefinition = technicalQuestionnaireDefinition,
) {
  if (answer.kind === 'custom') return answer.customText ?? null
  if (answer.kind !== 'option') return null

  const question = questionnaireQuestionByIdForDefinition(definition).get(questionId)
  return question?.options?.find((option) => option.id === answer.optionId)?.label ?? null
}

function questionnaireDefinitionForSession(questionnaire: CalculationQuestionnaireRow) {
  const snapshot = questionnaire.questionnaireDefinitionSnapshot
  if (snapshot) {
    const parsedSnapshot = questionnaireDefinitionRecordSchema.safeParse(snapshot)
    if (parsedSnapshot.success) return parsedSnapshot.data

    const parsedDefinition = questionnaireDefinitionSchema.safeParse(snapshot)
    if (parsedDefinition.success) {
      return questionnaireDefinitionRecord(
        parsedDefinition.data,
        'published',
        questionnaire.updatedAt,
        questionnaire.createdAt,
      )
    }
  }

  return questionnaireDefinitionRecord(
    committedQuestionnaireDefinition(),
    'static_fallback',
    new Date(staticQuestionnaireDefinitionUpdatedAt),
    null,
    questionnaire.questionnaireDefinitionHash ?? undefined,
  )
}

function questionnaireDefinitionFromJson(value: Prisma.JsonValue) {
  return questionnaireDefinitionSchema.parse(value)
}

function questionnaireDefinitionRecord(
  definition: QuestionnaireDefinition,
  status: QuestionnaireDefinitionRecord['status'],
  updatedAt: Date,
  publishedAt: Date | null,
  hash = questionnaireDefinitionHash(definition),
): QuestionnaireDefinitionRecord {
  return questionnaireDefinitionRecordSchema.parse({
    ...definition,
    status,
    definitionHash: hash,
    publishedAt: publishedAt?.toISOString() ?? null,
    updatedAt: updatedAt.toISOString(),
  })
}

function publicQuestionnaireDefinitionRecord(
  record: QuestionnaireDefinitionRecord,
): QuestionnaireDefinitionRecord {
  const publicDefinition = getQuestionnairePublicDefinition(questionnaireDefinitionContent(record))

  return questionnaireDefinitionRecord(
    publicDefinition,
    record.status,
    new Date(record.updatedAt),
    record.publishedAt ? new Date(record.publishedAt) : null,
  )
}

function committedQuestionnaireDefinition(): QuestionnaireDefinition {
  return questionnaireDefinitionSchema.parse(technicalQuestionnaireDefinition)
}

function questionnaireDefinitionHash(definition: QuestionnaireDefinition) {
  return createHash('sha256')
    .update(JSON.stringify(questionnaireDefinitionSchema.parse(definition)))
    .digest('hex')
}

function applyQuestionnaireDefinitionTextEdits(
  current: QuestionnaireDefinitionRecord,
  input: QuestionnaireDefinitionPatchRequest,
): QuestionnaireDefinition {
  const next = questionnaireDefinitionSchema.parse(questionnaireDefinitionContent(current))

  for (const edit of input.edits) {
    if (edit.target === 'section') {
      const section = next.sections.find((item) => item.id === edit.sectionId)
      if (!section) throw new AppError(404, 'NOT_FOUND', 'Questionnaire section not found')
      if (edit.title !== undefined) section.title = edit.title
      if (edit.isEnabled !== undefined) section.isEnabled = edit.isEnabled
      continue
    }

    if (edit.target === 'question') {
      const question = next.sections.flatMap((section) => section.questions)
        .find((item) => item.id === edit.questionId)
      if (!question) throw new AppError(404, 'NOT_FOUND', 'Questionnaire question not found')
      if (edit.prompt !== undefined) question.prompt = edit.prompt
      if (edit.isEnabled !== undefined) question.isEnabled = edit.isEnabled
      if (edit.answerType !== undefined) {
        applyQuestionnaireQuestionAnswerTypeEdit(next, question, edit.answerType)
      }
      if (edit.showIf !== undefined) {
        if (edit.showIf === null) {
          delete question.showIf
        } else {
          question.showIf = edit.showIf
        }
      }
      continue
    }

    if (edit.target === 'section_order') {
      next.sections = reorderQuestionnaireItems(next.sections, edit.sectionIds, 'Questionnaire section order')
      continue
    }

    if (edit.target === 'question_order') {
      const section = next.sections.find((item) => item.id === edit.sectionId)
      if (!section) throw new AppError(404, 'NOT_FOUND', 'Questionnaire section not found')
      section.questions = reorderQuestionnaireItems(section.questions, edit.questionIds, 'Questionnaire question order')
      continue
    }

    if (edit.target === 'question_create') {
      const section = next.sections.find((item) => item.id === edit.sectionId)
      if (!section) throw new AppError(404, 'NOT_FOUND', 'Questionnaire section not found')
      const question: (typeof section.questions)[number] = {
        id: allocateQuestionnaireQuestionId(next),
        prompt: edit.prompt,
        sourceRow: allocateQuestionnaireSourceRow(next),
        answerType: edit.answerType ?? 'text',
      }
      if (question.answerType === 'single_option') {
        question.options = [
          { id: 'OPTION_1', label: 'Вариант 1' },
          { id: 'OPTION_2', label: 'Вариант 2' },
        ]
      }
      section.questions = [...section.questions, question]
      continue
    }

    if (edit.target === 'question_delete') {
      const section = next.sections.find((item) =>
        item.questions.some((question) => question.id === edit.questionId),
      )
      if (!section) throw new AppError(404, 'NOT_FOUND', 'Questionnaire question not found')
      if (section.questions.length <= 1) {
        throw new AppError(400, 'BAD_REQUEST', 'Questionnaire section must keep at least one question')
      }
      section.questions = section.questions.filter((question) => question.id !== edit.questionId)
      sanitizeQuestionnaireVisibilityRules(next, (rule) =>
        normalizeVisibilityRuleAfterQuestionDelete(rule, edit.questionId),
      )
      continue
    }

    if (edit.target === 'option_order') {
      const question = next.sections.flatMap((section) => section.questions)
        .find((item) => item.id === edit.questionId)
      if (!question) throw new AppError(404, 'NOT_FOUND', 'Questionnaire question not found')
      if (!question.options?.length) throw new AppError(404, 'NOT_FOUND', 'Questionnaire options not found')
      question.options = reorderQuestionnaireItems(question.options, edit.optionIds, 'Questionnaire option order')
      continue
    }

    if (edit.target === 'option_create') {
      const question = next.sections.flatMap((section) => section.questions)
        .find((item) => item.id === edit.questionId)
      if (!question) throw new AppError(404, 'NOT_FOUND', 'Questionnaire question not found')
      const option: QuestionnaireOption = {
        id: allocateQuestionnaireOptionId(question),
        label: edit.label,
      }
      if (edit.hint) option.hint = edit.hint
      question.options = [...(question.options ?? []), option]
      question.answerType = 'single_option'
      continue
    }

    if (edit.target === 'option_delete') {
      const question = next.sections.flatMap((section) => section.questions)
        .find((item) => item.id === edit.questionId)
      if (!question) throw new AppError(404, 'NOT_FOUND', 'Questionnaire question not found')
      if (!question.options?.some((item) => item.id === edit.optionId)) {
        throw new AppError(404, 'NOT_FOUND', 'Questionnaire option not found')
      }
      question.options = question.options.filter((item) => item.id !== edit.optionId)
      sanitizeQuestionnaireVisibilityRules(next, (rule) =>
        normalizeVisibilityRuleAfterOptionDelete(rule, question.id, edit.optionId),
      )
      if (question.options.length === 0) {
        delete question.options
        question.answerType = 'text'
        sanitizeQuestionnaireVisibilityRules(next, (rule) =>
          normalizeVisibilityRuleAfterAnswerTypeChange(rule, question.id),
        )
      }
      continue
    }

    const question = next.sections.flatMap((section) => section.questions)
      .find((item) => item.id === edit.questionId)
    const option = question?.options?.find((item) => item.id === edit.optionId)
    if (!question || !option) {
      throw new AppError(404, 'NOT_FOUND', 'Questionnaire option not found')
    }
    if (edit.label !== undefined) option.label = edit.label
    if (edit.hint !== undefined) {
      if (edit.hint === null) {
        delete option.hint
      } else {
        option.hint = edit.hint
      }
    }
    if (edit.isEnabled !== undefined) option.isEnabled = edit.isEnabled
    if (edit.showIf !== undefined) {
      if (edit.showIf === null) {
        delete option.showIf
      } else {
        option.showIf = edit.showIf
      }
    }
  }

  return questionnaireDefinitionSchema.parse(next)
}

function applyQuestionnaireQuestionAnswerTypeEdit(
  definition: QuestionnaireDefinition,
  question: QuestionnaireQuestion,
  answerType: QuestionnaireQuestionAnswerType,
) {
  const currentAnswerType = getQuestionnaireQuestionAnswerType(question)
  if (currentAnswerType === answerType) return

  if (answerType === 'single_option') {
    if (!question.options?.length) {
      const firstOptionId = allocateQuestionnaireOptionId(question)
      question.options = [
        { id: firstOptionId, label: 'Вариант 1' },
        { id: allocateQuestionnaireOptionId(question, [firstOptionId]), label: 'Вариант 2' },
      ]
    }
    question.answerType = 'single_option'
    return
  }

  delete question.options
  question.answerType = answerType
  sanitizeQuestionnaireVisibilityRules(definition, (rule) =>
    normalizeVisibilityRuleAfterAnswerTypeChange(rule, question.id),
  )
}

function assertQuestionnaireAnswerTypeIsCoherent(question: QuestionnaireQuestion) {
  const answerType = getQuestionnaireQuestionAnswerType(question)
  const hasOptions = (question.options?.length ?? 0) > 0

  if (answerType === 'single_option' && !hasOptions) {
    throw new AppError(
      400,
      'BAD_REQUEST',
      'Questionnaire single option questions must keep at least one option',
    )
  }
}

function allocateQuestionnaireOptionId(question: Pick<QuestionnaireQuestion, 'options'>, reservedIds: string[] = []) {
  const existingIds = new Set([...(question.options ?? []).map((option) => option.id), ...reservedIds])

  for (let index = existingIds.size + 1; index < existingIds.size + 500; index += 1) {
    const optionId = `OPTION_${index}`
    if (!existingIds.has(optionId)) return optionId
  }

  throw new AppError(500, 'INTERNAL_ERROR', 'Could not allocate questionnaire option id')
}

function allocateQuestionnaireQuestionId(definition: QuestionnaireDefinition) {
  const existingIds = new Set(
    definition.sections.flatMap((section) => section.questions).map((question) => question.id),
  )

  for (let index = existingIds.size + 1; index < existingIds.size + 2_000; index += 1) {
    const questionId = `CUSTOM_${index}`
    if (!existingIds.has(questionId)) return questionId
  }

  throw new AppError(500, 'INTERNAL_ERROR', 'Could not allocate questionnaire question id')
}

function allocateQuestionnaireSourceRow(definition: QuestionnaireDefinition) {
  return Math.max(
    1,
    ...definition.sections.flatMap((section) => [
      ...section.sourceRows,
      ...section.questions.map((question) => question.sourceRow),
    ]),
  ) + 1
}

function sanitizeQuestionnaireVisibilityRules(
  definition: QuestionnaireDefinition,
  normalize: (rule: QuestionnaireVisibilityRule | undefined) => QuestionnaireVisibilityRule | undefined,
) {
  for (const section of definition.sections) {
    for (const question of section.questions) {
      question.showIf = normalize(question.showIf)
      for (const option of question.options ?? []) {
        option.showIf = normalize(option.showIf)
      }
    }
  }
}

function normalizeVisibilityRuleAfterAnswerTypeChange(
  rule: QuestionnaireVisibilityRule | undefined,
  questionId: string,
): QuestionnaireVisibilityRule | undefined {
  return normalizeQuestionnaireVisibilityRule(rule, (leaf) => {
    if (leaf.questionId !== questionId) return leaf
    if (!leaf.equals && !leaf.notEquals) return leaf
    return { questionId, exists: true }
  })
}

function normalizeVisibilityRuleAfterQuestionDelete(
  rule: QuestionnaireVisibilityRule | undefined,
  questionId: string,
): QuestionnaireVisibilityRule | undefined {
  return normalizeQuestionnaireVisibilityRule(rule, (leaf) => {
    if (leaf.questionId !== questionId) return leaf
    return { never: true }
  })
}

function normalizeVisibilityRuleAfterOptionDelete(
  rule: QuestionnaireVisibilityRule | undefined,
  questionId: string,
  optionId: string,
): QuestionnaireVisibilityRule | undefined {
  return normalizeQuestionnaireVisibilityRule(rule, (leaf) => {
    if (leaf.questionId !== questionId) return leaf

    const equals = leaf.equals?.filter((id) => id !== optionId)
    const notEquals = leaf.notEquals?.filter((id) => id !== optionId)

    if (leaf.equals && equals?.length === 0) return { never: true }

    return {
      questionId: leaf.questionId,
      ...(equals && equals.length > 0 ? { equals } : {}),
      ...(notEquals && notEquals.length > 0 ? { notEquals } : {}),
      ...(leaf.exists || (leaf.notEquals && notEquals?.length === 0 && !leaf.equals) ? { exists: true } : {}),
    }
  })
}

function normalizeQuestionnaireVisibilityRule(
  rule: QuestionnaireVisibilityRule | undefined,
  normalizeLeaf: (
    leaf: Extract<QuestionnaireVisibilityRule, { questionId: string }>,
  ) => QuestionnaireVisibilityRule,
): QuestionnaireVisibilityRule | undefined {
  if (!rule) return undefined
  if ('never' in rule) return rule
  if ('all' in rule) {
    return {
      all: rule.all.map((condition) =>
        normalizeQuestionnaireVisibilityRule(condition, normalizeLeaf) ?? { never: true },
      ),
    }
  }
  if ('any' in rule) {
    return {
      any: rule.any.map((condition) =>
        normalizeQuestionnaireVisibilityRule(condition, normalizeLeaf) ?? { never: true },
      ),
    }
  }

  return normalizeLeaf(rule)
}

function assertQuestionnaireDefinitionPublishable(definition: QuestionnaireDefinition) {
  const publicDefinition = getQuestionnairePublicDefinition(definition)
  const startingQuestions = getQuestionnaireActiveQuestions([], publicDefinition)

  if (startingQuestions.length === 0) {
    throw new AppError(
      400,
      'BAD_REQUEST',
      'Questionnaire must keep at least one enabled starting question',
    )
  }

  for (const section of definition.sections.filter((item) => item.isEnabled !== false)) {
    for (const question of section.questions.filter((item) => item.isEnabled !== false && !item.isLegacy)) {
      assertQuestionnaireAnswerTypeIsCoherent(question)
      if ((question.options?.length ?? 0) > 0 && !question.options?.some((option) => option.isEnabled !== false)) {
        throw new AppError(
          400,
          'BAD_REQUEST',
          'Enabled questionnaire option question must keep at least one enabled option',
        )
      }
    }
  }
}

function reorderQuestionnaireItems<T extends { id: string }>(
  items: T[],
  orderedIds: string[],
  label: string,
): T[] {
  const itemById = new Map(items.map((item) => [item.id, item]))
  const uniqueIds = new Set(orderedIds)

  if (uniqueIds.size !== orderedIds.length || orderedIds.length !== items.length) {
    throw new AppError(400, 'BAD_REQUEST', `${label} must contain every existing id exactly once`)
  }

  const reordered = orderedIds.map((id) => itemById.get(id))

  if (reordered.some((item) => !item)) {
    throw new AppError(400, 'BAD_REQUEST', `${label} contains an unknown id`)
  }

  return reordered as T[]
}

function questionnaireDefinitionContent(record: QuestionnaireDefinitionRecord): QuestionnaireDefinition {
  return {
    version: record.version,
    sourceWorkbook: record.sourceWorkbook,
    sourceWorksheet: record.sourceWorksheet,
    sourceBrief: record.sourceBrief,
    sourceUpdatedAt: record.sourceUpdatedAt,
    sourcePolicy: record.sourcePolicy,
    sections: record.sections,
  }
}

function questionnaireQuestionByIdForDefinition(definition: QuestionnaireDefinition) {
  return new Map(
    definition.sections
      .flatMap((section) => section.questions)
      .map((question) => [question.id, question]),
  )
}

function questionnaireResumeUrl(publicToken: string, publicWebsiteUrl?: string) {
  const base = publicWebsiteUrl?.trim()
  if (!base) return null
  return absoluteUrl(base, `/questionnaire/?token=${encodeURIComponent(publicToken)}`)
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

function slugBaseFromTitle(title: string, fallback = 'case') {
  const transliterated = [...title.trim().toLowerCase()]
    .map((char) => cyrillicSlugMap[char] ?? char)
    .join('')
  const slug = transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')

  return slug || fallback
}

function normalizeProjectExampleSlugInput(rawSlug: string) {
  const slug = slugBaseFromTitle(rawSlug).slice(0, 64)

  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid project example slug')
  }

  return slug
}

function normalizeBlogPostSlugInput(rawSlug: string) {
  const slug = slugBaseFromTitle(rawSlug, 'post').slice(0, 80)

  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid blog post slug')
  }

  return slug
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

function absoluteUrl(baseUrl: string, path: string) {
  const base = new URL(baseUrl)
  return new URL(path, `${base.origin}/`).toString()
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

  if (!/^[+\d\s().-]{5,40}$/.test(trimmed)) {
    throwInvalidPhone()
  }

  const digits = trimmed.replace(/\D/g, '')
  const normalizedDigits = normalizeSupportedLeadPhoneDigits(digits)

  if (
    !normalizedDigits ||
    !/^(375\d{9}|7\d{10})$/.test(normalizedDigits) ||
    /^(\d)\1+$/.test(normalizedDigits) ||
    hasLongRepeatedDigitRun(normalizedDigits)
  ) {
    throwInvalidPhone()
  }

  return `+${normalizedDigits}`
}

function normalizeSupportedLeadPhoneDigits(digits: string) {
  if (digits.startsWith('00375') && digits.length === 14) return digits.slice(2)
  if (digits.startsWith('007') && digits.length === 13) return digits.slice(2)
  if (digits.startsWith('375') && digits.length === 12) return digits
  if (digits.startsWith('7') && digits.length === 11) return digits
  if (/^80\d{9}$/.test(digits)) return `375${digits.slice(2)}`
  if (/^0\d{9}$/.test(digits)) return `375${digits.slice(1)}`
  if (/^(25|29|33|44)\d{7}$/.test(digits)) return `375${digits}`
  return null
}

function hasLongRepeatedDigitRun(value: string) {
  return /(\d)\1{5,}/.test(value)
}

function normalizeProjectExampleSlugs(rawSlugs: readonly string[]): string[] {
  const slugs = [...new Set(rawSlugs.map(normalizeProjectExampleSlug))]
  const unknownSlugs = slugs.filter((slug) => !publicProjectExampleAssets.some((asset) => asset.slug === slug))

  if (unknownSlugs.length > 0) {
    throw new AppError(409, 'CONFLICT', 'Requested project example is unavailable', {
      requestedExampleSlugs: unknownSlugs,
    })
  }

  return slugs
}

function normalizeProjectExampleSlug(rawSlug: string) {
  const slug = rawSlug.trim().toLowerCase()

  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
    throw new AppError(404, 'NOT_FOUND', 'Project example not found')
  }

  return slug
}

function normalizeBlogPostSlug(rawSlug: string) {
  const slug = rawSlug.trim().toLowerCase()

  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) {
    throw new AppError(404, 'NOT_FOUND', 'Blog post not found')
  }

  return slug
}

function projectExampleAssetBySlug(slug: string): (typeof publicProjectExampleAssets)[number] {
  const asset = publicProjectExampleAssets.find((example) => example.slug === slug)
  if (!asset) throw new AppError(404, 'NOT_FOUND', 'Project example not found')
  return asset
}

function telegramStartPayloadFromUpdate(update: unknown): TelegramStartPayload | null {
  const updateRecord = objectRecord(update)
  const message = objectRecord(updateRecord?.message)
  const chat = objectRecord(message?.chat)
  const from = objectRecord(message?.from)
  const text = typeof message?.text === 'string' ? message.text.trim() : ''
  const chatId = telegramScalarToString(chat?.id)
  const chatType = typeof chat?.type === 'string' ? chat.type : null
  const bindToken = telegramBindTokenFromStartText(text)

  if (!chatId || chatType !== 'private' || !bindToken) return null

  return {
    bindToken,
    chatId,
    chatType,
    userId: telegramScalarToString(from?.id),
    username: normalizeOptionalText(typeof from?.username === 'string' ? from.username : undefined, 80),
    firstName: normalizeOptionalText(typeof from?.first_name === 'string' ? from.first_name : undefined, 120),
  }
}

function telegramBindTokenFromStartText(text: string) {
  const match = /^\/start(?:@[A-Za-z][A-Za-z0-9_]{4,31})?\s+([A-Za-z0-9_-]{32,128})$/.exec(text)
  return match?.[1] ?? null
}

function telegramScalarToString(value: unknown) {
  if (typeof value === 'string') return normalizeOptionalText(value, 80)
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value))
  return null
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function projectExampleSlugsFromJson(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return []
  return normalizeProjectExampleSlugs(value.filter((slug): slug is string => typeof slug === 'string'))
}

function projectExampleSectionsFromJson(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((section): section is string => typeof section === 'string')
    .map((section) => section.trim())
    .filter(Boolean)
}

function projectExampleFragmentsFromJson(value: Prisma.JsonValue): ProjectExampleRecord['fragments'] {
  if (!Array.isArray(value)) return []

  return value
    .map((fragment) => objectRecord(fragment))
    .filter((fragment): fragment is Record<string, unknown> => Boolean(fragment))
    .map((fragment) => ({
      title: typeof fragment.title === 'string' ? fragment.title : '',
      caption: typeof fragment.caption === 'string' ? fragment.caption : '',
      imageUrl: typeof fragment.imageUrl === 'string' ? fragment.imageUrl : '',
      imageAlt: typeof fragment.imageAlt === 'string' ? fragment.imageAlt : '',
      sortOrder: typeof fragment.sortOrder === 'number' && Number.isInteger(fragment.sortOrder)
        ? fragment.sortOrder
        : 0,
    }))
    .filter((fragment) =>
      Boolean(fragment.title && fragment.caption && fragment.imageUrl && fragment.imageAlt),
    )
    .sort((first, second) => first.sortOrder - second.sortOrder)
}

function blogPostTagsFromJson(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return []

  const tags = value
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter(Boolean)

  return [...new Set(tags)]
}

function resolveBlogPostPublishedAt(
  status: BlogPostStatus,
  inputPublishedAt: string | null | undefined,
  existingPublishedAt: Date | null,
) {
  const publishedAt = inputPublishedAt === undefined
    ? existingPublishedAt
    : inputPublishedAt === null ? null : new Date(inputPublishedAt)

  if (status !== 'published') {
    return publishedAt
  }

  const resolvedPublishedAt = publishedAt ?? new Date()
  assertBlogPostPublishedAtNotFuture(resolvedPublishedAt)

  return resolvedPublishedAt
}

function assertBlogPostCanBePublished(input: {
  title: string
  excerpt: string
  content: string
}) {
  const missing = [
    [input.title, 'title'],
    [input.excerpt, 'excerpt'],
    [blogContentPlainText(input.content), 'content'],
  ].filter(([value]) => !String(value).trim())

  if (missing.length === 0) return

  throw new AppError(400, 'VALIDATION_ERROR', 'Published blog posts require title, excerpt, and content', {
    fields: missing.map(([, field]) => field),
  })
}

function assertBlogPostPublishedAtNotFuture(publishedAt: Date) {
  if (Number.isNaN(publishedAt.getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'publishedAt must be a valid date')
  }

  if (publishedAt.getTime() <= Date.now()) return

  throw new AppError(400, 'VALIDATION_ERROR', 'publishedAt cannot be in the future for a published blog post')
}

function throwInvalidPhone(): never {
  throw new AppError(400, 'VALIDATION_ERROR', 'Invalid lead phone number', [
    {
      path: ['clientPhone'],
      message: 'Enter a valid phone number in Belarusian format or +7 format',
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

function projectExampleRequestFingerprintHash(input: {
  input: ProjectExampleRequestCreateRequest
  normalizedPhone: string
  requestedExampleSlugs: string[]
  source: string
  referrer: string | null
}) {
  return sha256Hex({
    clientName: input.input.clientName,
    clientPhone: input.normalizedPhone,
    requestedExampleSlugs: input.requestedExampleSlugs,
    consentAccepted: true,
    consentVersion: projectExampleRequestConsentVersion,
    source: input.source,
    referrer: input.referrer,
    utm: input.input.utm ?? null,
  })
}

function questionnaireStartFingerprintHash(input: {
  input: QuestionnaireStartRequest
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
    initialAnswers: (input.input.initialAnswers ?? []).map(questionnaireAnswerFingerprintInput),
    consentAccepted: true,
    consentVersion: questionnaireConsentVersion,
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

function questionnaireDuplicateFingerprintHash(input: {
  normalizedPhone: string
  calculation: CalculationResult
  duplicateWindowStartedAt: Date
}) {
  return sha256Hex({
    leadKind: 'questionnaire',
    clientPhone: input.normalizedPhone,
    duplicateWindowStartedAt: input.duplicateWindowStartedAt.toISOString(),
    areaSqm: input.calculation.areaSqm,
    selectedServiceIds: input.calculation.selectedServiceIds,
    exchangeRateScaled: input.calculation.exchangeRate.usdToBynRateScaled,
    totalUsdCents: input.calculation.totals.totalUsdCents,
    totalBynCents: input.calculation.totals.totalBynCents,
  })
}

function questionnaireAnswerFingerprintInput(
  answer: NonNullable<QuestionnaireStartRequest['initialAnswers']>[number],
) {
  return {
    questionId: answer.questionId,
    kind: answer.kind,
    optionId: answer.optionId ?? null,
    customText: answer.customText ?? null,
  }
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

function assertProjectExampleRequestFingerprintMatches(
  request: ProjectExampleRequestRow,
  requestFingerprintHash: string,
) {
  if (request.requestFingerprintHash === requestFingerprintHash) return

  throw new AppError(
    409,
    'CONFLICT',
    'Idempotency key was already used for a different project example request',
  )
}

function assertQuestionnaireFingerprintMatches(
  questionnaire: Pick<CalculationQuestionnaireRow, 'requestFingerprintHash'>,
  requestFingerprintHash: string,
) {
  if (questionnaire.requestFingerprintHash === requestFingerprintHash) return

  throw new AppError(
    409,
    'CONFLICT',
    'Idempotency key was already used for a different questionnaire submission',
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

function isNotFoundFileError(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500)
  return String(error).slice(0, 500)
}

function safeTelegramDeliveryErrorMessage(error: unknown) {
  return safeErrorMessage(error).replace(/bot[A-Za-z0-9:_-]+(?=\/sendMessage)/g, 'bot<redacted>')
}
