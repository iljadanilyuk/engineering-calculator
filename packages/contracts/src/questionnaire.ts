import { z } from 'zod'

import { calculationRequestSchema, idempotencyKeySchema } from './calculation'

export const QUESTIONNAIRE_VERSION = 'pzk-questionnaire-v1'

export type QuestionnaireOption = {
  id: string
  label: string
}

export type QuestionnaireQuestion = {
  id: string
  prompt: string
  sourceRow: number
  options?: readonly QuestionnaireOption[]
}

export type QuestionnaireSection = {
  id: string
  title: string
  sourceRows: readonly number[]
  questions: readonly QuestionnaireQuestion[]
}

const yesNoOptions = [
  { id: 'yes', label: 'да' },
  { id: 'no', label: 'нет' },
] as const

export const technicalQuestionnaireDefinition = {
  version: QUESTIONNAIRE_VERSION,
  sourceWorkbook: 'docs/design/Опросный лист.xlsx',
  sourceWorksheet: 'Опросный лист по проектированию',
  sourcePolicy: 'Only column A question/section/option text is used. Filled answers from column B are excluded.',
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
        },
        {
          id: 'roof_materials',
          prompt: 'Материалы крыши для расчета теплопотерь',
          sourceRow: 11,
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
} as const satisfies {
  version: string
  sourceWorkbook: string
  sourceWorksheet: string
  sourcePolicy: string
  sections: readonly QuestionnaireSection[]
}

export const technicalQuestionnaireSections =
  technicalQuestionnaireDefinition.sections as readonly QuestionnaireSection[]

export const technicalQuestionnaireQuestions =
  technicalQuestionnaireSections.flatMap((section) => section.questions)

export const technicalQuestionnaireQuestionIds = technicalQuestionnaireQuestions.map(
  (question) => question.id,
)

const questionById = new Map(technicalQuestionnaireQuestions.map((question) => [question.id, question]))

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
  const question = questionById.get(value.questionId)

  if (!question) {
    context.addIssue({
      code: 'custom',
      path: ['questionId'],
      message: 'Unknown questionnaire question id',
    })
    return
  }

  if (value.kind === 'option') {
    if (!value.optionId) {
      context.addIssue({
        code: 'custom',
        path: ['optionId'],
        message: 'Option answers require optionId',
      })
      return
    }

    if (!question.options?.some((option) => option.id === value.optionId)) {
      context.addIssue({
        code: 'custom',
        path: ['optionId'],
        message: 'Unknown option id for this question',
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
  questionnaireVersion: z.literal(QUESTIONNAIRE_VERSION),
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
  questionnaireVersion: z.literal(QUESTIONNAIRE_VERSION),
  source: z.string().nullable(),
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
      options: z.array(z.object({
        id: z.string(),
        label: z.string(),
      })),
      answer: adminQuestionnaireAnswerSchema.nullable(),
    })),
  })),
})

export const adminQuestionnaireSummarySchema = z.object({
  questionnaireVersion: z.literal(QUESTIONNAIRE_VERSION),
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
export type PublicQuestionnaireSession = z.infer<typeof publicQuestionnaireSessionSchema>
export type AdminQuestionnaireDraft = z.infer<typeof adminQuestionnaireDraftSchema>
export type AdminQuestionnaireSummary = z.infer<typeof adminQuestionnaireSummarySchema>

export function getQuestionnaireQuestion(questionId: string) {
  return questionById.get(questionId) ?? null
}
