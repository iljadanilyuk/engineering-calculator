import { z } from 'zod'

import { calculationRequestSchema, idempotencyKeySchema } from './calculation'

export const QUESTIONNAIRE_VERSION = 'pzk-questionnaire-v1'

export type QuestionnaireOption = {
  id: string
  label: string
  hint?: string
  showIf?: QuestionnaireVisibilityRule
  isEnabled?: boolean
}

export type QuestionnaireQuestion = {
  id: string
  prompt: string
  sourceRow: number
  answerType?: QuestionnaireQuestionAnswerType
  options?: readonly QuestionnaireOption[]
  showIf?: QuestionnaireVisibilityRule
  isLegacy?: boolean
  isEnabled?: boolean
}

export type QuestionnaireSection = {
  id: string
  title: string
  sourceRows: readonly number[]
  questions: readonly QuestionnaireQuestion[]
  isLegacy?: boolean
  isEnabled?: boolean
}

export type QuestionnaireDefinition = {
  version: string
  sourceWorkbook: string
  sourceWorksheet: string
  sourceBrief: string
  sourceUpdatedAt: string
  sourcePolicy: string
  sections: readonly QuestionnaireSection[]
}

export type QuestionnaireProjectType = z.infer<typeof questionnaireProjectTypeSchema>

export type QuestionnaireVisibilityContext = {
  projectType?: QuestionnaireProjectType | null
}

export type QuestionnaireVisibilityRule =
  | {
      never: true
    }
  | {
      projectTypes: readonly QuestionnaireProjectType[]
    }
  | {
      questionId: string
      equals?: readonly string[]
      notEquals?: readonly string[]
      exists?: true
    }
  | {
      all: readonly QuestionnaireVisibilityRule[]
    }
  | {
      any: readonly QuestionnaireVisibilityRule[]
    }

export type QuestionnaireDefinitionStatus = 'published' | 'static_fallback'
export type QuestionnaireQuestionAnswerType = z.infer<typeof questionnaireQuestionAnswerTypeSchema>

const yesNoOptions = [
  { id: 'yes', label: 'да' },
  { id: 'no', label: 'нет' },
] as const

const yesNoUnknownOptions = [
  { id: 'YES', label: 'Да' },
  { id: 'NO', label: 'Нет' },
  { id: 'UNKNOWN', label: 'Пока не знаю' },
] as const

const questionnaireIdSchema = z.string().trim().min(1).max(120)
const questionnaireTextSchema = (max: number) => z.string().trim().min(1).max(max)
const optionalQuestionnaireHintSchema = z.union([questionnaireTextSchema(500), z.null()])
export const questionnaireProjectTypeSchema = z.enum(['private', 'apartment', 'commercial'])
export const questionnaireQuestionAnswerTypeSchema = z.enum([
  'single_option',
  'text',
  'textarea',
  'number',
  'phone',
  'email',
  'date',
])

export const questionnaireVisibilityRuleSchema: z.ZodType<QuestionnaireVisibilityRule> = z.lazy(() =>
  z.union([
    z.object({ never: z.literal(true) }).strict(),
    z.object({
      projectTypes: z.array(questionnaireProjectTypeSchema).min(1).max(3),
    }).strict(),
    z.object({
      questionId: questionnaireIdSchema,
      equals: z.array(z.string().trim().min(1).max(120)).optional(),
      notEquals: z.array(z.string().trim().min(1).max(120)).optional(),
      exists: z.literal(true).optional(),
    }).strict(),
    z.object({
      all: z.array(questionnaireVisibilityRuleSchema).min(1),
    }).strict(),
    z.object({
      any: z.array(questionnaireVisibilityRuleSchema).min(1),
    }).strict(),
  ]),
)

export const questionnaireOptionSchema = z.object({
  id: questionnaireIdSchema,
  label: questionnaireTextSchema(300),
  hint: questionnaireTextSchema(500).optional(),
  showIf: questionnaireVisibilityRuleSchema.optional(),
  isEnabled: z.boolean().optional(),
}).strict()

export const questionnaireQuestionSchema = z.object({
  id: questionnaireIdSchema,
  prompt: questionnaireTextSchema(700),
  sourceRow: z.number().int().positive(),
  answerType: questionnaireQuestionAnswerTypeSchema.optional(),
  options: z.array(questionnaireOptionSchema).optional(),
  showIf: questionnaireVisibilityRuleSchema.optional(),
  isLegacy: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
}).strict().superRefine((value, context) => {
  const hasOptions = Boolean(value.options?.length)
  if (hasOptions && value.answerType && value.answerType !== 'single_option') {
    context.addIssue({
      code: 'custom',
      path: ['answerType'],
      message: 'Questions with options must keep single_option answerType',
    })
  }

  if (!hasOptions && value.answerType === 'single_option') {
    context.addIssue({
      code: 'custom',
      path: ['answerType'],
      message: 'single_option answerType requires existing options',
    })
  }
})

export const questionnaireSectionSchema = z.object({
  id: questionnaireIdSchema,
  title: questionnaireTextSchema(200),
  sourceRows: z.array(z.number().int().positive()),
  questions: z.array(questionnaireQuestionSchema).min(1),
  isLegacy: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
}).strict()

export const questionnaireDefinitionSchema = z.object({
  version: questionnaireTextSchema(120),
  sourceWorkbook: questionnaireTextSchema(500),
  sourceWorksheet: questionnaireTextSchema(300),
  sourceBrief: questionnaireTextSchema(500),
  sourceUpdatedAt: questionnaireTextSchema(40),
  sourcePolicy: questionnaireTextSchema(1_000),
  sections: z.array(questionnaireSectionSchema).min(1),
}).strict()

export const questionnaireDefinitionRecordSchema = questionnaireDefinitionSchema.extend({
  status: z.enum(['published', 'static_fallback']),
  definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
  publishedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
}).strict()

const questionnaireSectionTitleEditSchema = z.object({
  target: z.literal('section'),
  sectionId: questionnaireIdSchema,
  title: questionnaireTextSchema(200).optional(),
  isEnabled: z.boolean().optional(),
}).strict().refine(
  (value) => value.title !== undefined || value.isEnabled !== undefined,
  'At least title or isEnabled is required',
)

const questionnaireQuestionPromptEditSchema = z.object({
  target: z.literal('question'),
  questionId: questionnaireIdSchema,
  prompt: questionnaireTextSchema(700).optional(),
  isEnabled: z.boolean().optional(),
  answerType: questionnaireQuestionAnswerTypeSchema.optional(),
  showIf: z.union([questionnaireVisibilityRuleSchema, z.null()]).optional(),
}).strict().refine(
  (value) =>
    value.prompt !== undefined ||
    value.isEnabled !== undefined ||
    value.answerType !== undefined ||
    value.showIf !== undefined,
  'At least prompt, isEnabled, answerType, or showIf is required',
)

const questionnaireOptionTextEditSchema = z.object({
  target: z.literal('option'),
  questionId: questionnaireIdSchema,
  optionId: questionnaireIdSchema,
  label: questionnaireTextSchema(300).optional(),
  hint: optionalQuestionnaireHintSchema.optional(),
  isEnabled: z.boolean().optional(),
  showIf: z.union([questionnaireVisibilityRuleSchema, z.null()]).optional(),
}).strict().refine(
  (value) =>
    value.label !== undefined ||
    value.hint !== undefined ||
    value.isEnabled !== undefined ||
    value.showIf !== undefined,
  'At least label, hint, isEnabled, or showIf is required',
)

const questionnaireSectionOrderEditSchema = z.object({
  target: z.literal('section_order'),
  sectionIds: z.array(questionnaireIdSchema).min(1),
}).strict()

const questionnaireSectionCreateEditSchema = z.object({
  target: z.literal('section_create'),
  title: questionnaireTextSchema(200),
  questionPrompt: questionnaireTextSchema(700).optional(),
  answerType: questionnaireQuestionAnswerTypeSchema.optional(),
}).strict()

const questionnaireSectionDeleteEditSchema = z.object({
  target: z.literal('section_delete'),
  sectionId: questionnaireIdSchema,
}).strict()

const questionnaireQuestionOrderEditSchema = z.object({
  target: z.literal('question_order'),
  sectionId: questionnaireIdSchema,
  questionIds: z.array(questionnaireIdSchema).min(1),
}).strict()

const questionnaireQuestionCreateEditSchema = z.object({
  target: z.literal('question_create'),
  sectionId: questionnaireIdSchema,
  prompt: questionnaireTextSchema(700),
  answerType: questionnaireQuestionAnswerTypeSchema.optional(),
}).strict()

const questionnaireQuestionDeleteEditSchema = z.object({
  target: z.literal('question_delete'),
  questionId: questionnaireIdSchema,
}).strict()

const questionnaireOptionOrderEditSchema = z.object({
  target: z.literal('option_order'),
  questionId: questionnaireIdSchema,
  optionIds: z.array(questionnaireIdSchema).min(1),
}).strict()

const questionnaireOptionCreateEditSchema = z.object({
  target: z.literal('option_create'),
  questionId: questionnaireIdSchema,
  label: questionnaireTextSchema(300),
  hint: optionalQuestionnaireHintSchema.optional(),
}).strict()

const questionnaireOptionDeleteEditSchema = z.object({
  target: z.literal('option_delete'),
  questionId: questionnaireIdSchema,
  optionId: questionnaireIdSchema,
}).strict()

export const questionnaireDefinitionTextEditSchema = z.discriminatedUnion('target', [
  questionnaireSectionTitleEditSchema,
  questionnaireQuestionPromptEditSchema,
  questionnaireOptionTextEditSchema,
  questionnaireSectionOrderEditSchema,
  questionnaireSectionCreateEditSchema,
  questionnaireSectionDeleteEditSchema,
  questionnaireQuestionOrderEditSchema,
  questionnaireQuestionCreateEditSchema,
  questionnaireQuestionDeleteEditSchema,
  questionnaireOptionOrderEditSchema,
  questionnaireOptionCreateEditSchema,
  questionnaireOptionDeleteEditSchema,
])

export const questionnaireDefinitionPatchRequestSchema = z.object({
  baseDefinitionHash: z.string().regex(/^[a-f0-9]{64}$/),
  edits: z.array(questionnaireDefinitionTextEditSchema).min(1).max(50),
}).strict()

export const questionnaireDefinitionResponseSchema = z.object({
  questionnaireDefinition: questionnaireDefinitionRecordSchema,
})

const hiddenLegacyQuestion = { never: true } as const
const envelopeNeededRule = { questionId: 'OBJ_DOCS', equals: ['PARTIAL', 'NONE'] } as const
const wallMaterialKnownRule = {
  all: [
    { questionId: 'OBJ_WALL_MATERIAL', exists: true },
    { questionId: 'OBJ_WALL_MATERIAL', notEquals: ['UNKNOWN'] },
  ],
} as const
const wallInsulationYesRule = { questionId: 'OBJ_WALL_INSULATION', equals: ['YES'] } as const
const floorNeedsInsulationRule = {
  questionId: 'OBJ_FLOOR_BELOW',
  equals: ['GROUND_OR_SLAB', 'UNHEATED_BASEMENT'],
} as const
const floorInsulationYesRule = { questionId: 'OBJ_FLOOR_INSULATION', equals: ['YES'] } as const
const roofNeedsEnvelopeRule = {
  questionId: 'OBJ_ROOF_TYPE',
  equals: ['COLD_ATTIC', 'MANSARD', 'FLAT_ROOF'],
} as const
const coldAtticRule = { questionId: 'OBJ_ROOF_TYPE', equals: ['COLD_ATTIC'] } as const

export const technicalQuestionnaireDefinition = {
  version: QUESTIONNAIRE_VERSION,
  sourceWorkbook: 'прототип/опросник/Опросник_отопление_клиентская_логика_обновлен.xlsx',
  sourceWorksheet: 'Updated heating questionnaire logic',
  sourceBrief: 'прототип/опросник/ТЗ_агенту_ветвление_опросника_отопление_обновлено.md',
  sourceUpdatedAt: '2026-07-20',
  sourcePolicy: 'Only sanitized question, section, option, hint, and branching text is used. Filled/sample answers from the XLSX are excluded from public bundles.',
  sections: [
    {
      id: 'contacts_object',
      title: 'Контакты и объект',
      sourceRows: [5, 6],
      questions: [
        {
          id: 'client_email',
          prompt: 'Электронная почта',
          sourceRow: 5,
        },
        {
          id: 'object_address',
          prompt: 'Точный адрес или координаты дома для учета местных условий',
          sourceRow: 6,
        },
      ],
    },
    {
      id: 'object_source',
      title: 'Дом и исходные материалы',
      sourceRows: [80, 115],
      questions: [
        {
          id: 'OBJ_STAGE',
          prompt: 'На какой стадии находится дом?',
          sourceRow: 80,
          options: [
            {
              id: 'DESIGN',
              label: 'Есть архитектурный проект, строительство еще не началось',
              hint: 'Проще заранее предусмотреть котельную, трассы и высоты пола.',
            },
            {
              id: 'BUILDING',
              label: 'Строительство уже идет',
              hint: 'Укажите, какие работы уже выполнены и что еще можно изменить.',
            },
            {
              id: 'BUILT',
              label: 'Дом построен или реконструируется',
              hint: 'Учтем существующие полы, отделку и доступные места прокладки.',
            },
          ],
        },
        {
          id: 'OBJ_DOCS',
          prompt: 'Какие материалы по дому вы можете приложить?',
          sourceRow: 98,
          options: [
            {
              id: 'FULL',
              label: 'Полный архитектурный проект с планами и разрезами',
              hint: 'Основные размеры и конструкции возьмем из проекта.',
            },
            {
              id: 'PARTIAL',
              label: 'Есть только планы этажей или часть документов',
              hint: 'Недостающие данные соберем отдельным коротким списком.',
            },
            {
              id: 'NONE',
              label: 'Полного проекта пока нет',
              hint: 'Можно начать с планировки и примерной площади.',
            },
          ],
        },
      ],
    },
    {
      id: 'heating_walls',
      title: 'Наружные стены',
      sourceRows: [116, 364],
      questions: [
        {
          id: 'OBJ_WALL_MATERIAL',
          prompt: 'Из какого материала выполнены или планируются наружные стены?',
          sourceRow: 116,
          showIf: envelopeNeededRule,
          options: [
            {
              id: 'AERATED_CONCRETE',
              label: 'Газосиликатный или газобетонный блок',
              hint: 'Легкие белые или серые стеновые блоки.',
            },
            {
              id: 'CERAMIC_BLOCK',
              label: 'Керамический блок',
              hint: 'Крупноформатный пустотелый блок из обожженной глины.',
            },
            {
              id: 'BRICK',
              label: 'Кирпич',
              hint: 'Керамический, силикатный или полнотелый кирпич.',
            },
            {
              id: 'CLAYDITE_BLOCK',
              label: 'Керамзитобетонный блок',
              hint: 'Серый бетонный блок с гранулами керамзита.',
            },
            {
              id: 'REINFORCED_CONCRETE',
              label: 'Монолитный железобетон',
              hint: 'Стены отливаются из бетона непосредственно на объекте.',
            },
            {
              id: 'FRAME',
              label: 'Каркасная конструкция',
              hint: 'Каркас заполнен утеплителем.',
            },
            {
              id: 'TIMBER',
              label: 'Брус',
              hint: 'Профилированный, клееный или другой брус.',
            },
            {
              id: 'LOG',
              label: 'Бревно',
              hint: 'Рубленое или оцилиндрованное бревно.',
            },
            {
              id: 'OTHER',
              label: 'Другой материал',
              hint: 'Опишите материал в своем варианте.',
            },
            {
              id: 'UNKNOWN',
              label: 'Пока не знаю',
              hint: 'Материал уточним по проекту или у строителя.',
            },
          ],
        },
        {
          id: 'OBJ_WALL_THICKNESS',
          prompt: 'Какая толщина основной стены без наружного утепления?',
          sourceRow: 150,
          showIf: wallMaterialKnownRule,
          options: [
            { id: 'MM_150', label: '150 мм', showIf: { questionId: 'OBJ_WALL_MATERIAL', equals: ['FRAME', 'TIMBER'] } },
            { id: 'MM_160', label: '160 мм', showIf: { questionId: 'OBJ_WALL_MATERIAL', equals: ['REINFORCED_CONCRETE'] } },
            { id: 'MM_180', label: '180 мм', showIf: { questionId: 'OBJ_WALL_MATERIAL', equals: ['REINFORCED_CONCRETE', 'TIMBER'] } },
            { id: 'MM_200', label: '200 мм', showIf: { questionId: 'OBJ_WALL_MATERIAL', equals: ['AERATED_CONCRETE', 'CLAYDITE_BLOCK', 'REINFORCED_CONCRETE', 'FRAME', 'TIMBER'] } },
            { id: 'MM_220', label: '220 мм', showIf: { questionId: 'OBJ_WALL_MATERIAL', equals: ['LOG'] } },
            { id: 'MM_240', label: '240 мм', showIf: { questionId: 'OBJ_WALL_MATERIAL', equals: ['TIMBER', 'LOG'] } },
            { id: 'MM_250', label: '250 мм', showIf: { questionId: 'OBJ_WALL_MATERIAL', equals: ['AERATED_CONCRETE', 'CERAMIC_BLOCK', 'BRICK', 'REINFORCED_CONCRETE', 'FRAME'] } },
            { id: 'MM_260_PLUS', label: '260 мм и более', showIf: { questionId: 'OBJ_WALL_MATERIAL', equals: ['LOG'] } },
            { id: 'MM_300', label: '300 мм', showIf: { questionId: 'OBJ_WALL_MATERIAL', equals: ['AERATED_CONCRETE', 'CLAYDITE_BLOCK', 'REINFORCED_CONCRETE', 'FRAME'] } },
            { id: 'MM_375', label: '375 мм', showIf: { questionId: 'OBJ_WALL_MATERIAL', equals: ['AERATED_CONCRETE'] } },
            { id: 'MM_380', label: '380 мм', showIf: { questionId: 'OBJ_WALL_MATERIAL', equals: ['CERAMIC_BLOCK', 'BRICK'] } },
            { id: 'MM_400', label: '400 мм', showIf: { questionId: 'OBJ_WALL_MATERIAL', equals: ['AERATED_CONCRETE', 'CLAYDITE_BLOCK'] } },
            { id: 'MM_440', label: '440 мм', showIf: { questionId: 'OBJ_WALL_MATERIAL', equals: ['CERAMIC_BLOCK'] } },
            { id: 'MM_500', label: '500 мм', showIf: { questionId: 'OBJ_WALL_MATERIAL', equals: ['AERATED_CONCRETE'] } },
            { id: 'MM_510', label: '510 мм', showIf: { questionId: 'OBJ_WALL_MATERIAL', equals: ['CERAMIC_BLOCK', 'BRICK'] } },
            { id: 'MM_640', label: '640 мм', showIf: { questionId: 'OBJ_WALL_MATERIAL', equals: ['BRICK'] } },
            { id: 'OTHER_MM', label: 'Другая толщина' },
            { id: 'MANUAL', label: 'Указать вручную', showIf: { questionId: 'OBJ_WALL_MATERIAL', equals: ['OTHER'] } },
            { id: 'UNKNOWN', label: 'Пока не знаю' },
          ],
        },
        {
          id: 'OBJ_WALL_INSULATION',
          prompt: 'Будет ли дополнительное утепление наружных стен?',
          sourceRow: 284,
          showIf: wallMaterialKnownRule,
          options: yesNoUnknownOptions,
        },
        {
          id: 'OBJ_WALL_INSULATION_MATERIAL',
          prompt: 'Какой материал утепления наружных стен планируется?',
          sourceRow: 303,
          showIf: wallInsulationYesRule,
          options: [
            { id: 'STONE_WOOL', label: 'Каменная или базальтовая вата' },
            { id: 'GLASS_WOOL', label: 'Стекловата' },
            { id: 'EPS', label: 'Пенопласт' },
            { id: 'XPS', label: 'Экструдированный пенополистирол' },
            { id: 'PIR', label: 'PIR-плиты' },
            { id: 'CELLULOSE', label: 'Эковата или задувной утеплитель' },
            { id: 'MULTIPLE', label: 'Несколько материалов' },
            { id: 'OTHER', label: 'Другой материал' },
            { id: 'UNKNOWN', label: 'Пока не знаю' },
          ],
        },
        {
          id: 'OBJ_WALL_INSULATION_THICKNESS',
          prompt: 'Какая общая толщина утепления наружных стен?',
          sourceRow: 336,
          showIf: wallInsulationYesRule,
          options: [
            { id: 'MM_50', label: '50 мм' },
            { id: 'MM_100', label: '100 мм' },
            { id: 'MM_150', label: '150 мм' },
            { id: 'MM_200', label: '200 мм' },
            { id: 'MORE_200', label: 'Более 200 мм' },
            { id: 'OTHER_MM', label: 'Другая толщина' },
            { id: 'UNKNOWN', label: 'Пока не знаю' },
          ],
        },
      ],
    },
    {
      id: 'heating_first_floor',
      title: 'Пол первого этажа',
      sourceRows: [365, 459],
      questions: [
        {
          id: 'OBJ_FLOOR_BELOW',
          prompt: 'Что находится под полом первого отапливаемого этажа?',
          sourceRow: 365,
          showIf: envelopeNeededRule,
          options: [
            { id: 'GROUND_OR_SLAB', label: 'Грунт или фундаментная плита' },
            { id: 'UNHEATED_BASEMENT', label: 'Неотапливаемый подвал или цоколь' },
            { id: 'HEATED_SPACE', label: 'Отапливаемое помещение' },
            { id: 'UNKNOWN', label: 'Пока не знаю' },
          ],
        },
        {
          id: 'OBJ_FLOOR_INSULATION',
          prompt: 'Предусмотрено ли утепление пола первого этажа?',
          sourceRow: 386,
          showIf: floorNeedsInsulationRule,
          options: yesNoUnknownOptions,
        },
        {
          id: 'OBJ_FLOOR_INSULATION_MATERIAL',
          prompt: 'Какой материал утепления пола планируется?',
          sourceRow: 405,
          showIf: floorInsulationYesRule,
          options: [
            { id: 'XPS', label: 'Экструдированный пенополистирол' },
            { id: 'EPS', label: 'Пенопласт' },
            { id: 'STONE_WOOL', label: 'Каменная или минеральная вата' },
            { id: 'PIR', label: 'PIR-плиты' },
            { id: 'OTHER', label: 'Другой материал' },
            { id: 'UNKNOWN', label: 'Пока не знаю' },
          ],
        },
        {
          id: 'OBJ_FLOOR_INSULATION_THICKNESS',
          prompt: 'Какая общая толщина утепления пола?',
          sourceRow: 431,
          showIf: floorInsulationYesRule,
          options: [
            { id: 'MM_50', label: '50 мм' },
            { id: 'MM_100', label: '100 мм' },
            { id: 'MM_150', label: '150 мм' },
            { id: 'MM_200', label: '200 мм' },
            { id: 'MORE_200', label: 'Более 200 мм' },
            { id: 'OTHER_MM', label: 'Другая толщина' },
            { id: 'UNKNOWN', label: 'Пока не знаю' },
          ],
        },
      ],
    },
    {
      id: 'heating_roof',
      title: 'Крыша и верхнее перекрытие',
      sourceRows: [460, 589],
      questions: [
        {
          id: 'OBJ_ROOF_TYPE',
          prompt: 'Что находится над верхним отапливаемым этажом?',
          sourceRow: 460,
          showIf: envelopeNeededRule,
          options: [
            { id: 'COLD_ATTIC', label: 'Холодный чердак' },
            { id: 'MANSARD', label: 'Жилая мансарда' },
            { id: 'FLAT_ROOF', label: 'Плоская кровля' },
            { id: 'HEATED_FLOOR', label: 'Еще один отапливаемый этаж' },
            { id: 'UNKNOWN', label: 'Пока не знаю' },
          ],
        },
        {
          id: 'OBJ_ROOF_INSULATION_LOCATION',
          prompt: 'Где будет располагаться утепление?',
          sourceRow: 483,
          showIf: coldAtticRule,
          options: [
            { id: 'CEILING', label: 'В перекрытии над верхним этажом' },
            { id: 'SLOPES', label: 'По скатам крыши' },
            { id: 'BOTH', label: 'И в перекрытии, и по скатам' },
            { id: 'UNKNOWN', label: 'Пока не знаю' },
          ],
        },
        {
          id: 'OBJ_ROOF_INSULATION_MATERIAL',
          prompt: 'Какой материал утепления крыши или верхнего перекрытия планируется?',
          sourceRow: 504,
          showIf: roofNeedsEnvelopeRule,
          options: [
            { id: 'STONE_WOOL', label: 'Каменная или базальтовая вата' },
            { id: 'GLASS_WOOL', label: 'Стекловата' },
            { id: 'EPS', label: 'Пенопласт' },
            { id: 'XPS', label: 'Экструдированный пенополистирол' },
            { id: 'PIR', label: 'PIR-плиты' },
            { id: 'SPRAY_PU', label: 'Напыляемый пенополиуретан' },
            { id: 'CELLULOSE', label: 'Эковата или задувной утеплитель' },
            { id: 'MULTIPLE', label: 'Несколько материалов' },
            { id: 'OTHER', label: 'Другой материал' },
            { id: 'UNKNOWN', label: 'Пока не выбрали' },
          ],
        },
        {
          id: 'OBJ_ROOF_INSULATION_THICKNESS',
          prompt: 'Какая общая толщина утепления крыши или верхнего перекрытия?',
          sourceRow: 539,
          showIf: roofNeedsEnvelopeRule,
          options: [
            { id: 'MM_100', label: '100 мм' },
            { id: 'MM_150', label: '150 мм' },
            { id: 'MM_200', label: '200 мм' },
            { id: 'MM_250', label: '250 мм' },
            { id: 'MM_300', label: '300 мм' },
            { id: 'MORE_300', label: 'Более 300 мм' },
            { id: 'OTHER_MM', label: 'Другая толщина' },
            { id: 'UNKNOWN', label: 'Пока не знаю' },
          ],
        },
        {
          id: 'OBJ_ROOF_CEILING_STRUCTURE',
          prompt: 'Из чего выполнено перекрытие над верхним этажом?',
          sourceRow: 570,
          showIf: coldAtticRule,
          options: [
            { id: 'RC', label: 'Железобетонная плита' },
            { id: 'WOOD', label: 'Деревянные балки' },
            { id: 'STEEL', label: 'Металлические балки' },
            { id: 'OTHER', label: 'Другая конструкция' },
            { id: 'UNKNOWN', label: 'Пока не знаю' },
          ],
        },
      ],
    },
    {
      id: 'house_general',
      title: 'Общая информация о доме',
      sourceRows: [9, 20],
      questions: [
        {
          id: 'house_dimensions',
          prompt: 'Длина и ширина дома',
          sourceRow: 9,
        },
        {
          id: 'wall_materials',
          prompt: 'Материалы стен для расчета теплопотерь',
          sourceRow: 10,
          showIf: hiddenLegacyQuestion,
          isLegacy: true,
        },
        {
          id: 'roof_materials',
          prompt: 'Материалы крыши для расчета теплопотерь',
          sourceRow: 11,
          showIf: hiddenLegacyQuestion,
          isLegacy: true,
        },
        {
          id: 'windows_doors_materials',
          prompt: 'Материалы окон и дверей, общая площадь остекления',
          sourceRow: 12,
        },
        {
          id: 'total_area',
          prompt: 'Общая площадь дома',
          sourceRow: 13,
        },
        {
          id: 'building_footprint',
          prompt: 'Площадь застройки',
          sourceRow: 14,
        },
        {
          id: 'living_area',
          prompt: 'Жилая площадь дома',
          sourceRow: 15,
        },
        {
          id: 'interior_finished',
          prompt: 'Внутренняя отделка дома выполнена?',
          sourceRow: 16,
          options: yesNoOptions,
        },
        {
          id: 'fireplace',
          prompt: 'Есть ли камин? Если да, укажите на плане и мощность',
          sourceRow: 17,
          options: yesNoOptions,
        },
        {
          id: 'floor_to_ceiling_windows',
          prompt: 'Будут ли окна в пол?',
          sourceRow: 18,
          options: yesNoOptions,
        },
        {
          id: 'smart_home',
          prompt: 'Планируется ли система умный дом?',
          sourceRow: 19,
          options: yesNoOptions,
        },
        {
          id: 'additional_buildings',
          prompt: 'Планируются ли дополнительные постройки на участке?',
          sourceRow: 20,
        },
      ],
    },
    {
      id: 'heating_general',
      title: 'Система отопления: общие вопросы',
      sourceRows: [22, 34],
      questions: [
        {
          id: 'heating_type',
          prompt: 'Какой тип отопления рассматривается?',
          sourceRow: 22,
          options: [
            { id: 'gas', label: 'газовый' },
            { id: 'electric', label: 'электрический' },
            { id: 'heat_pump', label: 'тепловой насос' },
            { id: 'solid_fuel', label: 'твердотопливный' },
            { id: 'combined', label: 'комбинированный' },
          ],
        },
        {
          id: 'boiler_room_piping_material',
          prompt: 'Из каких труб планируется обвязка котельной?',
          sourceRow: 23,
          options: [
            { id: 'copper', label: 'Медь' },
            { id: 'stainless', label: 'нержавейка' },
            { id: 'polypropylene', label: 'ПП' },
            { id: 'metal_plastic', label: 'металопласт' },
          ],
        },
        {
          id: 'gas_chimney',
          prompt: 'Если оборудование газовое, какой будет дымоход?',
          sourceRow: 24,
          options: [
            { id: 'coaxial', label: 'Коаксиал' },
            { id: 'separate', label: 'раздельный' },
            { id: 'channel', label: 'В канал' },
            { id: 'wall', label: 'в стену' },
          ],
        },
        {
          id: 'boiler_brand_and_solar',
          prompt: 'Есть ли предпочтения по бренду котла и рассматриваются ли солнечные панели для отопления/ГВС?',
          sourceRow: 25,
        },
        {
          id: 'boiler_location',
          prompt: 'Где будет устанавливаться котел?',
          sourceRow: 26,
          options: [
            { id: 'boiler_room_below_grade', label: 'в котельной ниже грунта' },
            { id: 'boiler_room_above_grade', label: 'в котельной выше грунта' },
            { id: 'kitchen', label: 'на кухне' },
          ],
        },
        {
          id: 'boiler_room_only_heating',
          prompt: 'Котельная будет использоваться только для отопительного оборудования?',
          sourceRow: 27,
          options: yesNoOptions,
        },
        {
          id: 'laundry_in_boiler_room',
          prompt: 'Планируется ли размещение стиральной, сушильной машин или гладильной доски в котельной?',
          sourceRow: 28,
          options: yesNoOptions,
        },
        {
          id: 'heating_control_type',
          prompt: 'Какой тип управления отоплением планируется?',
          sourceRow: 29,
          options: [
            { id: 'weather_compensated', label: 'погодозависимое' },
            { id: 'app', label: 'через приложение' },
            { id: 'room_sensor', label: 'комнатный датчик' },
            { id: 'salus', label: 'Salus' },
          ],
        },
        {
          id: 'room_regulation_sensors',
          prompt: 'Нужно ли предусмотреть датчики комнатного регулирования?',
          sourceRow: 30,
          options: yesNoOptions,
        },
        {
          id: 'large_boiler_room_elements',
          prompt: 'Есть ли пожелания по расположению крупных элементов котельной?',
          sourceRow: 31,
          options: yesNoOptions,
        },
        {
          id: 'expansion_tank',
          prompt: 'Какой расширительный бак планируется?',
          sourceRow: 32,
        },
        {
          id: 'hydraulics',
          prompt: 'Как будет реализована гидравлика?',
          sourceRow: 33,
          options: [
            { id: 'pump_groups', label: 'насосные группы' },
            { id: 'mixing_units', label: 'узлы подмеса' },
          ],
        },
        {
          id: 'pump_brand',
          prompt: 'Есть ли предпочтения по брендам насосов?',
          sourceRow: 34,
        },
      ],
    },
    {
      id: 'floor_heating',
      title: 'Теплый пол',
      sourceRows: [36, 38],
      questions: [
        {
          id: 'floor_heating_zones',
          prompt: 'Где планируется установка теплого пола? Укажите зоны и типы напольного покрытия',
          sourceRow: 36,
        },
        {
          id: 'floor_heating_type',
          prompt: 'Какой тип теплого пола рассматривается?',
          sourceRow: 37,
          options: [
            { id: 'water', label: 'водяной' },
            { id: 'electric', label: 'электрический' },
          ],
        },
        {
          id: 'floor_heating_pipe_and_manifold_cabinets',
          prompt: 'Какая труба теплого пола и где будут шкафчики для гребенки?',
          sourceRow: 38,
        },
      ],
    },
    {
      id: 'radiator_heating',
      title: 'Радиаторное отопление',
      sourceRows: [40, 47],
      questions: [
        {
          id: 'radiator_layout_and_connection',
          prompt: 'Какая разводка радиаторов и тип подключения?',
          sourceRow: 40,
        },
        {
          id: 'radiator_pipe_brand_type',
          prompt: 'Бренд и тип трубы для радиаторов',
          sourceRow: 41,
        },
        {
          id: 'radiator_manifold_cabinets',
          prompt: 'Где будут устанавливаться шкафчики для гребенки?',
          sourceRow: 42,
          options: [
            { id: 'visible', label: 'внешние' },
            { id: 'hidden', label: 'скрытые' },
            { id: 'none', label: 'без них' },
          ],
        },
        {
          id: 'radiator_brand_models',
          prompt: 'Какие бренд и модели радиаторов рассматриваются?',
          sourceRow: 43,
        },
        {
          id: 'radiator_power_selection',
          prompt: 'Необходим ли расчет и подбор мощности радиаторов для каждого помещения?',
          sourceRow: 44,
        },
        {
          id: 'floor_convectors',
          prompt: 'Рассматриваются ли внутрипольные конвекторы как основной или дополнительный источник отопления?',
          sourceRow: 45,
          options: yesNoOptions,
        },
        {
          id: 'thermostatic_heads',
          prompt: 'Нужны ли термоголовки?',
          sourceRow: 46,
        },
        {
          id: 'vertical_designer_radiators',
          prompt: 'Рассматриваются ли вертикальные дизайнерские радиаторы как альтернатива конвекторам?',
          sourceRow: 47,
          options: yesNoOptions,
        },
      ],
    },
    {
      id: 'additional_heating',
      title: 'Дополнительное отопительное оборудование',
      sourceRows: [49, 52],
      questions: [
        {
          id: 'snow_melting',
          prompt: 'Делаем ли систему снеготаяния? Если да, укажите зоны',
          sourceRow: 49,
          options: yesNoOptions,
        },
        {
          id: 'window_convectors',
          prompt: 'Планируется ли установка конвекторов под окнами в пол?',
          sourceRow: 50,
          options: yesNoOptions,
        },
        {
          id: 'warm_walls',
          prompt: 'Предусматриваем ли теплые стены?',
          sourceRow: 51,
          options: yesNoOptions,
        },
        {
          id: 'edge_heating_contour',
          prompt: 'Планируется ли краевой контур в подоконнике, оконных откосах или стяжке под окнами?',
          sourceRow: 52,
        },
      ],
    },
    {
      id: 'water_sewerage',
      title: 'Водоснабжение и канализация',
      sourceRows: [54, 80],
      questions: [
        {
          id: 'cold_hot_water_points',
          prompt: 'Типы и количество холодных и горячих точек водоснабжения',
          sourceRow: 54,
        },
        {
          id: 'water_entry_point',
          prompt: 'Где планируется ввод воды в дом?',
          sourceRow: 55,
        },
        {
          id: 'water_source',
          prompt: 'Откуда вода в доме?',
          sourceRow: 56,
          options: [
            { id: 'central', label: 'центральная' },
            { id: 'borehole', label: 'скважина' },
            { id: 'well', label: 'колодец' },
          ],
        },
        {
          id: 'borehole_contractor',
          prompt: 'Кто делает скважину: подрядчик проекта или она уже есть?',
          sourceRow: 57,
        },
        {
          id: 'borehole_passport',
          prompt: 'Есть ли паспорт скважины?',
          sourceRow: 58,
          options: yesNoOptions,
        },
        {
          id: 'water_analysis',
          prompt: 'Есть ли анализ воды?',
          sourceRow: 59,
          options: yesNoOptions,
        },
        {
          id: 'borehole_pump_type',
          prompt: 'Укажите тип скважинного насоса',
          sourceRow: 60,
          options: [
            { id: 'impulse', label: 'импульсный насос' },
            { id: 'hydrophore', label: 'насос с гидрофором' },
            { id: 'hydraulic_accumulator', label: 'гидроаккумулятор' },
          ],
        },
        {
          id: 'boiler_volume',
          prompt: 'Какой объем бойлера планируется? Укажите количество проживающих',
          sourceRow: 61,
        },
        {
          id: 'recirculation_line',
          prompt: 'Нужна ли линия рециркуляции?',
          sourceRow: 62,
          options: yesNoOptions,
        },
        {
          id: 'water_softening_filtering',
          prompt: 'Планируется ли система умягчения и фильтрации воды?',
          sourceRow: 63,
          options: yesNoOptions,
        },
        {
          id: 'reverse_osmosis',
          prompt: 'Планируется ли система обратного осмоса? Если да, к каким точкам',
          sourceRow: 64,
        },
        {
          id: 'sewerage_type',
          prompt: 'Какая будет канализация?',
          sourceRow: 65,
          options: [
            { id: 'cesspit', label: 'Выгребная яма' },
            { id: 'concrete_rings', label: 'бетонные кольца' },
            { id: 'bioseptic', label: 'биосептик' },
            { id: 'central', label: 'централизованная' },
          ],
        },
        {
          id: 'sewerage_outputs',
          prompt: 'Где расположены и какого диаметра канализационные выводы?',
          sourceRow: 66,
        },
        {
          id: 'external_and_storm_sewerage_points',
          prompt: 'Расположение наружной канализации и точки вывода ливневой канализации',
          sourceRow: 67,
        },
        {
          id: 'condensate_neutralizer',
          prompt: 'Ставить ли нейтрализатор конденсата для конденсационного котла?',
          sourceRow: 68,
          options: yesNoOptions,
        },
        {
          id: 'boiler_room_floor_drain',
          prompt: 'Нужно ли предусмотреть трап в котельной?',
          sourceRow: 69,
          options: yesNoOptions,
        },
        {
          id: 'bath_type',
          prompt: 'Будет ли ванна? Если да, обычная или джакузи',
          sourceRow: 70,
          options: [
            { id: 'standard', label: 'обычная' },
            { id: 'jacuzzi', label: 'джакузи' },
          ],
        },
        {
          id: 'bidet_and_buttons',
          prompt: 'Планируется ли биде или псевдобиде? Какого цвета нужны кнопки инсталляций?',
          sourceRow: 71,
          options: [
            { id: 'bidet_installation', label: 'да, с инсталляцией' },
            { id: 'pseudo_bidet', label: 'да, псевдобиде' },
            { id: 'no', label: 'нет' },
          ],
        },
        {
          id: 'plumbing_models_known',
          prompt: 'Известны ли конкретные модели сантехники в санузлах и их расположение?',
          sourceRow: 72,
          options: [
            { id: 'yes', label: 'да' },
            { id: 'no', label: 'нет' },
            { id: 'in_progress', label: 'в процессе.' },
          ],
        },
        {
          id: 'water_point_bindings_known',
          prompt: 'Известны ли привязки по расположению всех точек воды, включая полотенцесушители?',
          sourceRow: 73,
          options: yesNoOptions,
        },
        {
          id: 'outdoor_tap_location',
          prompt: 'Где установить уличный кран и какой тип крана нужен?',
          sourceRow: 74,
        },
        {
          id: 'vent_stack_output',
          prompt: 'Куда выводить фановую трубу?',
          sourceRow: 75,
        },
        {
          id: 'built_in_wardrobes',
          prompt: 'Будут ли встроенные платяные шкафы и где?',
          sourceRow: 76,
        },
        {
          id: 'fridge_ice_maker',
          prompt: 'Планируется ли холодильник с льдогенератором?',
          sourceRow: 77,
          options: yesNoOptions,
        },
        {
          id: 'shower_drains',
          prompt: 'Будет ли трап в душевых и какой тип трапа планируется?',
          sourceRow: 78,
        },
        {
          id: 'built_in_mixers',
          prompt: 'Будут ли смесители и душевые системы встроенными в стену?',
          sourceRow: 79,
          options: yesNoOptions,
        },
        {
          id: 'towel_warmers_source',
          prompt: 'От чего работают полотенцесушители?',
          sourceRow: 80,
          options: [
            { id: 'heating', label: 'от отопления' },
            { id: 'electric', label: 'от электричества' },
          ],
        },
      ],
    },
    {
      id: 'ventilation',
      title: 'Приточно-вытяжная вентиляция',
      sourceRows: [82, 94],
      questions: [
        {
          id: 'recuperator_location',
          prompt: 'Где размещаем оборудование вентиляции, рекуператор?',
          sourceRow: 82,
        },
        {
          id: 'ventilation_collector_locations',
          prompt: 'Где размещаем коллекторы вентиляции?',
          sourceRow: 83,
        },
        {
          id: 'air_intake_exhaust',
          prompt: 'Куда выводим воздуховоды на забор и выброс воздуха? Какой цвет решеток?',
          sourceRow: 84,
        },
        {
          id: 'duct_routing',
          prompt: 'Разводка воздуховодов под потолком или по полу?',
          sourceRow: 85,
          options: [
            { id: 'ceiling', label: 'под потолком' },
            { id: 'floor', label: 'по полу' },
            { id: 'combined', label: 'так и так' },
          ],
        },
        {
          id: 'ducts_to_convectors',
          prompt: 'Нужно ли подводить воздуховоды к конвекторам?',
          sourceRow: 86,
        },
        {
          id: 'duct_material_type',
          prompt: 'Будем использовать гибкие пластиковые или металлические воздуховоды большого диаметра?',
          sourceRow: 87,
          options: [
            { id: 'flexible_plastic', label: 'гибкие пластиковые' },
            { id: 'large_metal', label: 'большого диаметра металические' },
          ],
        },
        {
          id: 'diffuser_type',
          prompt: 'Какие будут диффузоры: дизайнерские или обычные?',
          sourceRow: 88,
          options: [
            { id: 'design', label: 'дизайн' },
            { id: 'standard', label: 'обычные' },
          ],
        },
        {
          id: 'diffusers_in_lighting',
          prompt: 'Диффузоры планируются в конструкции света или отдельно?',
          sourceRow: 89,
          options: [
            { id: 'in_lighting', label: 'в конструкции света' },
            { id: 'separate', label: 'отдельно' },
          ],
        },
        {
          id: 'ceiling_floor_buildups',
          prompt: 'Есть ли информация по опуску потолков и толщине пирога стяжки?',
          sourceRow: 90,
          options: yesNoOptions,
        },
        {
          id: 'co2_sensors_control_panel',
          prompt: 'Нужны ли датчики CO2 и панель управления?',
          sourceRow: 91,
        },
        {
          id: 'enthalpy_heat_exchanger',
          prompt: 'Установка планируется с энтальпийным теплообменником?',
          sourceRow: 92,
        },
        {
          id: 'noise_requirements',
          prompt: 'Есть ли требования к шуму?',
          sourceRow: 93,
        },
        {
          id: 'ventilation_channel_purpose_plan',
          prompt: 'Укажите на плане назначение всех каналов для понимания закладных под воздуховоды',
          sourceRow: 94,
        },
      ],
    },
    {
      id: 'conditioning',
      title: 'Кондиционирование',
      sourceRows: [96, 100],
      questions: [
        {
          id: 'conditioning_system_type',
          prompt: 'Какой вид системы кондиционирования планируется?',
          sourceRow: 96,
          options: [
            { id: 'split', label: 'Сплит' },
            { id: 'multi_split', label: 'Мультисистема' },
            { id: 'vrv', label: 'ВРВ система' },
          ],
        },
        {
          id: 'outdoor_units_location',
          prompt: 'Куда ставим наружные блоки?',
          sourceRow: 97,
        },
        {
          id: 'indoor_units_type_location',
          prompt: 'Внутренние блоки будут скрытые или внешние? Укажите на планах',
          sourceRow: 98,
          options: [
            { id: 'hidden', label: 'скрытые' },
            { id: 'visible', label: 'внешние' },
          ],
        },
        {
          id: 'indoor_units_bindings',
          prompt: 'Дайте привязки по размещению внутренних блоков по помещениям',
          sourceRow: 99,
        },
        {
          id: 'hidden_system_grille_color',
          prompt: 'Какой цвет решеток будет использоваться для скрытой системы?',
          sourceRow: 100,
        },
      ],
    },
    {
      id: 'additional_questions',
      title: 'Дополнительные вопросы',
      sourceRows: [102, 105],
      questions: [
        {
          id: 'bathroom_design_project',
          prompt: 'Есть ли дизайн-проект и визуализация санузлов?',
          sourceRow: 102,
          options: yesNoOptions,
        },
        {
          id: 'target_budget',
          prompt: 'В какой бюджет нужно вписаться? Укажите диапазон',
          sourceRow: 103,
        },
        {
          id: 'pets',
          prompt: 'Есть ли домашние животные?',
          sourceRow: 104,
        },
        {
          id: 'house_plans_sections_facades',
          prompt: 'Планы дома с разрезами фасадов нужно отправить отдельно',
          sourceRow: 105,
        },
      ],
    },
  ],
} as const satisfies QuestionnaireDefinition

export const technicalQuestionnaireSections =
  technicalQuestionnaireDefinition.sections as readonly QuestionnaireSection[]

export const technicalQuestionnaireQuestions =
  technicalQuestionnaireSections.flatMap((section) => section.questions)

export const technicalQuestionnaireQuestionIds = technicalQuestionnaireQuestions.map(
  (question) => question.id,
)

const optionalTrimmedTextSchema = (max: number) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  }, z.string().max(max).optional())

export const questionnaireAnswerKindSchema = z.enum(['option', 'custom', 'unknown', 'skipped'])

export const questionnaireAnswerInputSchema = z.object({
  questionId: z.string().trim().min(1).max(120),
  kind: questionnaireAnswerKindSchema,
  optionId: optionalTrimmedTextSchema(120),
  customText: optionalTrimmedTextSchema(2_000),
}).superRefine((value, context) => {
  if (value.kind === 'option') {
    if (!value.optionId) {
      context.addIssue({
        code: 'custom',
        path: ['optionId'],
        message: 'Option answers require optionId',
      })
    }
    return
  }

  if (value.kind === 'custom') {
    if (!value.customText) {
      context.addIssue({
        code: 'custom',
        path: ['customText'],
        message: 'Custom answers require text',
      })
    }
    return
  }

  if (value.optionId || value.customText) {
    context.addIssue({
      code: 'custom',
      path: ['kind'],
      message: 'Unknown and skipped answers cannot include optionId or customText',
    })
  }
})

export const questionnaireStoredAnswerSchema = questionnaireAnswerInputSchema.extend({
  updatedAt: z.string().datetime(),
  isActive: z.boolean().default(true),
})

const questionnaireAnswersSchema = z.array(questionnaireAnswerInputSchema).min(1).max(25)
  .superRefine((answers, context) => {
    const seen = new Set<string>()

    for (const [index, answer] of answers.entries()) {
      if (!seen.has(answer.questionId)) {
        seen.add(answer.questionId)
        continue
      }

      context.addIssue({
        code: 'custom',
        path: [index, 'questionId'],
        message: 'Question ids must be unique in one save request',
      })
    }
  })

export const questionnaireStartRequestSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  clientName: z.string().trim().min(2).max(120),
  clientPhone: z.string().trim().min(5).max(40),
  projectType: questionnaireProjectTypeSchema.optional(),
  objectName: z.string().trim().min(1).max(160).optional(),
  calculation: calculationRequestSchema,
  consentAccepted: z.literal(true),
  source: z.string().trim().min(1).max(80).optional(),
  referrer: z.string().trim().max(2_048).optional(),
  utm: z.record(z.string().trim().min(1).max(64), z.string().trim().max(500)).optional(),
  initialAnswers: questionnaireAnswersSchema.optional(),
})

export const questionnaireAnswersPatchRequestSchema = z.object({
  answers: questionnaireAnswersSchema,
})

export const questionnaireProgressSchema = z.object({
  totalQuestions: z.number().int().positive(),
  answeredCount: z.number().int().nonnegative(),
  optionCount: z.number().int().nonnegative(),
  customCount: z.number().int().nonnegative(),
  unknownCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  completionPercent: z.number().int().min(0).max(100),
  completedAt: z.string().datetime().nullable(),
})

export const publicQuestionnaireSessionSchema = z.object({
  publicToken: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  questionnaireVersion: z.string().min(1),
  definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
  definition: questionnaireDefinitionRecordSchema,
  projectType: questionnaireProjectTypeSchema.nullable(),
  progress: questionnaireProgressSchema,
  calculation: z.object({
    areaSqm: z.string(),
    selectedServiceIds: z.array(z.string()),
    serviceTitles: z.array(z.string()),
    totalUsdCents: z.number().int().nonnegative(),
    totalBynRoundedRubles: z.number().int().nonnegative(),
  }),
  answers: z.array(questionnaireStoredAnswerSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const adminQuestionnaireAnswerSchema = questionnaireStoredAnswerSchema.extend({
  label: z.string().nullable(),
})

export const adminQuestionnaireDraftSchema = z.object({
  id: z.string().uuid(),
  questionnaireVersion: z.string().min(1),
  definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
  resumeUrl: z.string().url().nullable(),
  source: z.string().nullable(),
  definitionSource: z.string(),
  definitionUpdatedAt: z.string(),
  sourcePolicy: z.string(),
  progress: questionnaireProgressSchema,
  consentAcceptedAt: z.string().datetime().nullable(),
  consentVersion: z.string().nullable(),
  consentText: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sections: z.array(z.object({
    id: z.string(),
    title: z.string(),
      questions: z.array(z.object({
        id: z.string(),
        prompt: z.string(),
        sourceRow: z.number().int().positive(),
        isActive: z.boolean(),
        isLegacy: z.boolean(),
        options: z.array(z.object({
          id: z.string(),
          label: z.string(),
          hint: z.string().optional(),
        })),
        answer: adminQuestionnaireAnswerSchema.nullable(),
      })),
  })),
})

export const adminQuestionnaireSummarySchema = z.object({
  questionnaireVersion: z.string().min(1),
  definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
  answeredCount: z.number().int().nonnegative(),
  totalQuestions: z.number().int().positive(),
  completionPercent: z.number().int().min(0).max(100),
  unknownCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
})

export const questionnaireStartResponseSchema = z.object({
  questionnaire: publicQuestionnaireSessionSchema,
})

export const questionnaireSessionResponseSchema = z.object({
  questionnaire: publicQuestionnaireSessionSchema,
})

export type QuestionnaireAnswerKind = z.infer<typeof questionnaireAnswerKindSchema>
export type QuestionnaireAnswerInput = z.infer<typeof questionnaireAnswerInputSchema>
export type QuestionnaireStoredAnswer = z.infer<typeof questionnaireStoredAnswerSchema>
export type QuestionnaireStartRequest = z.infer<typeof questionnaireStartRequestSchema>
export type QuestionnaireAnswersPatchRequest = z.infer<typeof questionnaireAnswersPatchRequestSchema>
export type QuestionnaireProgress = z.infer<typeof questionnaireProgressSchema>
export type QuestionnaireDefinitionRecord = z.infer<typeof questionnaireDefinitionRecordSchema>
export type QuestionnaireDefinitionTextEdit = z.infer<typeof questionnaireDefinitionTextEditSchema>
export type QuestionnaireDefinitionPatchRequest = z.infer<typeof questionnaireDefinitionPatchRequestSchema>
export type QuestionnaireDefinitionResponse = z.infer<typeof questionnaireDefinitionResponseSchema>
export type PublicQuestionnaireSession = z.infer<typeof publicQuestionnaireSessionSchema>
export type AdminQuestionnaireDraft = z.infer<typeof adminQuestionnaireDraftSchema>
export type AdminQuestionnaireSummary = z.infer<typeof adminQuestionnaireSummarySchema>

export function getQuestionnaireDefinitionQuestions(
  definition: QuestionnaireDefinition = technicalQuestionnaireDefinition,
) {
  return definition.sections.flatMap((section) => section.questions)
}

export function getQuestionnaireQuestion(
  questionId: string,
  definition: QuestionnaireDefinition = technicalQuestionnaireDefinition,
) {
  return getQuestionnaireDefinitionQuestions(definition).find((question) => question.id === questionId) ?? null
}

export function getQuestionnaireQuestionAnswerType(question: QuestionnaireQuestion): QuestionnaireQuestionAnswerType {
  if ((question.options ?? []).length > 0) return 'single_option'
  if (question.answerType) return question.answerType
  const normalizedId = question.id.toLowerCase()
  if (normalizedId.includes('area')) return 'number'
  if (normalizedId.includes('phone')) return 'phone'
  if (normalizedId.includes('email') || normalizedId.includes('mail')) return 'email'
  if (normalizedId.includes('date')) return 'date'
  return 'text'
}

export function getQuestionnairePublicDefinition(
  definition: QuestionnaireDefinition = technicalQuestionnaireDefinition,
): QuestionnaireDefinition {
  return questionnaireDefinitionSchema.parse({
    ...definition,
    sections: questionnaireEnabledSections(definition)
      .filter((section) => !section.isLegacy)
      .map((section) => ({
        ...section,
        questions: section.questions
          .filter((question) => question.isEnabled !== false && !question.isLegacy)
          .map((question) => ({
            ...question,
            options: question.options?.filter((option) => option.isEnabled !== false),
          })),
      }))
      .filter((section) => section.questions.length > 0),
  })
}

export function getQuestionnaireActiveQuestions(
  answers: readonly Pick<QuestionnaireAnswerInput, 'questionId' | 'kind' | 'optionId'>[],
  definition: QuestionnaireDefinition = technicalQuestionnaireDefinition,
  context: QuestionnaireVisibilityContext = {},
) {
  const answersByQuestionId = questionnaireEffectiveAnswerMap(answers, definition, context)

  return questionnaireEnabledSections(definition)
    .flatMap((section) => section.questions)
    .filter((question) => isQuestionnaireQuestionActive(question, answersByQuestionId, context))
}

export function getQuestionnaireActiveSections(
  answers: readonly Pick<QuestionnaireAnswerInput, 'questionId' | 'kind' | 'optionId'>[],
  definition: QuestionnaireDefinition = technicalQuestionnaireDefinition,
  context: QuestionnaireVisibilityContext = {},
) {
  const answersByQuestionId = questionnaireEffectiveAnswerMap(answers, definition, context)

  return questionnaireEnabledSections(definition)
    .map((section) => ({
      ...section,
      questions: section.questions.filter((question) =>
        isQuestionnaireQuestionActive(question, answersByQuestionId, context),
      ),
    }))
    .filter((section) => section.questions.length > 0)
}

export function getQuestionnaireActiveOptions(
  question: QuestionnaireQuestion,
  answers: readonly Pick<QuestionnaireAnswerInput, 'questionId' | 'kind' | 'optionId'>[],
  definition: QuestionnaireDefinition = technicalQuestionnaireDefinition,
  context: QuestionnaireVisibilityContext = {},
) {
  const answersByQuestionId = questionnaireEffectiveAnswerMap(answers, definition, context)
  const activeQuestion = getQuestionnaireActiveQuestions(answers, definition, context)
    .find((item) => item.id === question.id)

  if (!activeQuestion) return []

  return (activeQuestion.options ?? []).filter((option) =>
    option.isEnabled !== false && isQuestionnaireVisibilityRuleActive(option.showIf, answersByQuestionId, context),
  )
}

export function markQuestionnaireAnswersActivity<T extends QuestionnaireStoredAnswer>(
  answers: readonly T[],
  definition: QuestionnaireDefinition = technicalQuestionnaireDefinition,
  context: QuestionnaireVisibilityContext = {},
) {
  const activeQuestionIds = new Set(
    getQuestionnaireActiveQuestions(answers, definition, context).map((question) => question.id),
  )
  const effectiveAnswersByQuestionId = questionnaireEffectiveAnswerMap(answers, definition, context)

  return sortQuestionnaireAnswerRecords(
    answers.map((answer) => ({
      ...answer,
      isActive: activeQuestionIds.has(answer.questionId) && effectiveAnswersByQuestionId.get(answer.questionId) === answer,
    })),
    definition,
  )
}

export function calculateQuestionnaireProgress(
  answers: readonly QuestionnaireStoredAnswer[],
  updatedAtIso: string,
  definition: QuestionnaireDefinition = technicalQuestionnaireDefinition,
  context: QuestionnaireVisibilityContext = {},
): QuestionnaireProgress {
  const activeQuestionIds = new Set(
    getQuestionnaireActiveQuestions(answers, definition, context).map((question) => question.id),
  )
  const activeAnswers = markQuestionnaireAnswersActivity(answers, definition, context).filter(
    (answer) => answer.isActive && activeQuestionIds.has(answer.questionId),
  )
  const uniqueAnswers = new Map(activeAnswers.map((answer) => [answer.questionId, answer]))
  const values = [...uniqueAnswers.values()]
  const answeredCount = values.length
  const unknownCount = values.filter(isQuestionnaireClarificationAnswer).length
  const skippedCount = values.filter((answer) => answer.kind === 'skipped').length
  const optionCount = values.filter(
    (answer) => answer.kind === 'option' && answer.optionId !== 'UNKNOWN',
  ).length
  const customCount = values.filter((answer) => answer.kind === 'custom').length
  const totalQuestions = Math.max(1, activeQuestionIds.size)
  const completionPercent = Math.min(100, Math.round((answeredCount / totalQuestions) * 100))

  return {
    totalQuestions,
    answeredCount,
    optionCount,
    customCount,
    unknownCount,
    skippedCount,
    completionPercent,
    completedAt: answeredCount >= totalQuestions ? updatedAtIso : null,
  }
}

export function isQuestionnaireQuestionActive(
  question: QuestionnaireQuestion,
  answersByQuestionId: ReadonlyMap<string, Pick<QuestionnaireAnswerInput, 'kind' | 'optionId'>>,
  context: QuestionnaireVisibilityContext = {},
) {
  if (question.isEnabled === false) return false
  if (question.isLegacy) return false
  return isQuestionnaireVisibilityRuleActive(question.showIf, answersByQuestionId, context)
}

export function isQuestionnaireVisibilityRuleActive(
  rule: QuestionnaireVisibilityRule | undefined,
  answersByQuestionId: ReadonlyMap<string, Pick<QuestionnaireAnswerInput, 'kind' | 'optionId'>>,
  context: QuestionnaireVisibilityContext = {},
): boolean {
  if (!rule) return true
  if ('never' in rule) return false
  if ('projectTypes' in rule) {
    if (!context.projectType) return true
    return rule.projectTypes.includes(context.projectType)
  }
  if ('all' in rule) {
    return rule.all.every((condition) =>
      isQuestionnaireVisibilityRuleActive(condition, answersByQuestionId, context)
    )
  }
  if ('any' in rule) {
    return rule.any.some((condition) =>
      isQuestionnaireVisibilityRuleActive(condition, answersByQuestionId, context)
    )
  }

  const answer = answersByQuestionId.get(rule.questionId)
  const answerValue = questionnaireAnswerOptionValue(answer)

  if (rule.exists && answerValue === null) return false

  if (rule.equals) {
    if (answerValue === null) return false
    if (!rule.equals.includes(answerValue)) return false
  }

  if (rule.notEquals) {
    if (answerValue === null) return false
    if (rule.notEquals.includes(answerValue)) return false
  }

  return true
}

function questionnaireAnswerMap(
  answers: readonly Pick<QuestionnaireAnswerInput, 'questionId' | 'kind' | 'optionId'>[],
) {
  return new Map(answers.map((answer) => [answer.questionId, answer]))
}

function questionnaireEffectiveAnswerMap(
  answers: readonly Pick<QuestionnaireAnswerInput, 'questionId' | 'kind' | 'optionId'>[],
  definition: QuestionnaireDefinition,
  context: QuestionnaireVisibilityContext,
) {
  const sourceAnswersByQuestionId = questionnaireAnswerMap(answers)
  let effectiveAnswersByQuestionId = new Map<string, Pick<QuestionnaireAnswerInput, 'kind' | 'optionId'>>()
  const questions = questionnaireEnabledSections(definition).flatMap((section) => section.questions)

  for (let pass = 0; pass <= questions.length; pass += 1) {
    const nextAnswersByQuestionId = new Map<string, Pick<QuestionnaireAnswerInput, 'kind' | 'optionId'>>()

    for (const question of questions) {
      if (!isQuestionnaireQuestionActive(question, effectiveAnswersByQuestionId, context)) continue

      const answer = sourceAnswersByQuestionId.get(question.id)
      if (answer && isQuestionnaireAnswerEffectiveForQuestion(question, answer, effectiveAnswersByQuestionId, context)) {
        nextAnswersByQuestionId.set(question.id, answer)
      }
    }

    if (questionnaireAnswerMapsEqual(effectiveAnswersByQuestionId, nextAnswersByQuestionId)) {
      return nextAnswersByQuestionId
    }

    effectiveAnswersByQuestionId = nextAnswersByQuestionId
  }

  return effectiveAnswersByQuestionId
}

function isQuestionnaireAnswerEffectiveForQuestion(
  question: QuestionnaireQuestion,
  answer: Pick<QuestionnaireAnswerInput, 'kind' | 'optionId'>,
  answersByQuestionId: ReadonlyMap<string, Pick<QuestionnaireAnswerInput, 'kind' | 'optionId'>>,
  context: QuestionnaireVisibilityContext,
) {
  if (answer.kind !== 'option') return true

  const option = (question.options ?? []).find((item) => item.id === answer.optionId)

  return Boolean(
    option &&
    option.isEnabled !== false &&
    isQuestionnaireVisibilityRuleActive(option.showIf, answersByQuestionId, context),
  )
}

function questionnaireAnswerMapsEqual(
  first: ReadonlyMap<string, Pick<QuestionnaireAnswerInput, 'kind' | 'optionId'>>,
  second: ReadonlyMap<string, Pick<QuestionnaireAnswerInput, 'kind' | 'optionId'>>,
) {
  if (first.size !== second.size) return false

  for (const [questionId, answer] of first) {
    if (second.get(questionId) !== answer) return false
  }

  return true
}

function questionnaireAnswerOptionValue(
  answer: Pick<QuestionnaireAnswerInput, 'kind' | 'optionId'> | undefined,
) {
  if (!answer) return null
  if (answer.kind === 'option') return answer.optionId ?? null
  if (answer.kind === 'unknown') return 'UNKNOWN'
  if (answer.kind === 'custom') return 'CUSTOM'
  return null
}

function isQuestionnaireClarificationAnswer(answer: QuestionnaireStoredAnswer) {
  return answer.kind === 'unknown' || (answer.kind === 'option' && answer.optionId === 'UNKNOWN')
}

function sortQuestionnaireAnswerRecords<T extends Pick<QuestionnaireStoredAnswer, 'questionId'>>(
  answers: readonly T[],
  definition: QuestionnaireDefinition = technicalQuestionnaireDefinition,
) {
  const order = new Map(
    getQuestionnaireDefinitionQuestions(definition).map((question, index) => [question.id, index]),
  )

  return [...answers].sort(
    (first, second) =>
      (order.get(first.questionId) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(second.questionId) ?? Number.MAX_SAFE_INTEGER),
  )
}

function questionnaireEnabledSections(definition: QuestionnaireDefinition) {
  return definition.sections.filter((section) => section.isEnabled !== false && !section.isLegacy)
}
