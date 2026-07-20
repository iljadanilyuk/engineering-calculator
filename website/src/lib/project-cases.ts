import {
  publicProjectExampleListResponseSchema,
  type PublicProjectExampleRecord,
} from '@poznyak-engineering-calculator/contracts'

export type ProjectCaseFragment = {
  title: string
  caption: string
  imageUrl: string
  imageAlt: string
}

export type ProjectCase = {
  slug: string
  title: string
  description: string
  objectType: string
  location: string
  areaSqm: string
  engineeringSections: string[]
  initialTask: string
  solutionSummary: string
  coverImageUrl: string
  coverImageAlt: string
  fragments: ProjectCaseFragment[]
  exampleSlugs: string[]
  seoTitle: string
  seoDescription: string
}

export const curatedProjectCases = [
  {
    slug: 'otoplenie-i-ventilyaciya-doma',
    title: 'Отопление и вентиляция частного дома',
    description:
      'Обезличенный пример комплекта, где проект заранее связывает котельную, трассы отопления, вентиляцию и спецификации для закупки.',
    objectType: 'Частный дом',
    location: 'Минская область',
    areaSqm: '180 м²',
    engineeringSections: ['ОВ', 'ТМ', 'Вентиляция'],
    initialTask:
      'Подготовить рабочие листы, по которым строители видят трассы, узлы подключения и состав оборудования до закупки материалов.',
    solutionSummary:
      'Фрагменты показывают, как проект уменьшает неопределенность: планы фиксируют трассы, 3D-лист помогает согласовать котельную, спецификация собирает оборудование в проверяемую ведомость.',
    coverImageUrl: '/landing-v4/project-preview-plan-08.jpg',
    coverImageAlt: 'Фрагмент плана отопления и вентиляции частного дома',
    fragments: [
      {
        title: 'План трасс и оборудования',
        caption:
          'Помогает монтажной бригаде понять, где проходят магистрали и как оборудование привязано к помещениям.',
        imageUrl: '/landing-v4/project-preview-plan-08.jpg',
        imageAlt: 'Обезличенный лист проекта с планами трасс инженерных систем',
      },
      {
        title: '3D-фрагмент котельной',
        caption:
          'Показывает плотные места до монтажа: расположение оборудования, доступ к обслуживанию и пересечения.',
        imageUrl: '/landing-v4/project-preview-3d-04.jpg',
        imageAlt: 'Обезличенный лист проекта с 3D-фрагментом котельной',
      },
      {
        title: 'Спецификация оборудования',
        caption:
          'Собирает позиции для закупки и проверки сметы, чтобы поставщик и монтажники работали с одним перечнем.',
        imageUrl: '/landing-v4/project-preview-spec-10.jpg',
        imageAlt: 'Обезличенный лист проекта со спецификацией оборудования',
      },
    ],
    exampleSlugs: ['ov'],
    seoTitle: 'Кейс проекта отопления и вентиляции дома | ИП Позняк',
    seoDescription:
      'Реализованный проект отопления и вентиляции частного дома: задача, разделы инженерии, фрагменты документации и получение PDF-примера после контакта.',
  },
  {
    slug: 'vodosnabzhenie-i-kanalizaciya-kottedzha',
    title: 'Водоснабжение и канализация коттеджа',
    description:
      'Пример раздела ВК с привязками, узлами и рабочими фрагментами, которые помогают согласовать монтаж без угадывания на объекте.',
    objectType: 'Коттедж',
    location: 'Беларусь, локация обезличена',
    areaSqm: '240 м²',
    engineeringSections: ['ВК', 'Наружные вводы', 'Узлы подключения'],
    initialTask:
      'Собрать понятную документацию по точкам водоразбора, вводам, канализационным выпускам и монтажным узлам для строителей.',
    solutionSummary:
      'Показанные листы фиксируют трассировку и детали подключения, а полный пример отправляем после контактной заявки.',
    coverImageUrl: '/landing-v4/project-preview-vk-node-12.jpg',
    coverImageAlt: 'Фрагмент проекта водоснабжения и канализации с монтажными узлами',
    fragments: [
      {
        title: 'Узел подключения',
        caption:
          'Дает монтажникам конкретную схему сборки и снижает риск спорных решений уже во время работ.',
        imageUrl: '/landing-v4/project-preview-vk-node-12.jpg',
        imageAlt: 'Обезличенный лист проекта ВК с узлом подключения',
      },
      {
        title: 'План разводки',
        caption:
          'Фиксирует направления трасс, точки подключения и взаимное расположение инженерии в помещениях.',
        imageUrl: '/landing-v4/project-preview-plan-08.jpg',
        imageAlt: 'Обезличенный план разводки инженерных систем',
      },
      {
        title: 'Ведомость материалов',
        caption:
          'Помогает сверить закупку и избежать ситуации, когда на объект приезжают неполные или неподходящие позиции.',
        imageUrl: '/landing-v4/project-preview-spec-10.jpg',
        imageAlt: 'Обезличенная ведомость материалов проекта',
      },
    ],
    exampleSlugs: ['vk'],
    seoTitle: 'Кейс проекта ВК коттеджа | ИП Позняк',
    seoDescription:
      'Реализованный проект водоснабжения и канализации: задача, площадь, инженерные разделы, фрагменты документации и PDF-пример после контакта.',
  },
] as const satisfies readonly ProjectCase[]

export const projectCases = curatedProjectCases

export async function loadProjectCases(): Promise<readonly ProjectCase[]> {
  const managedCases = await loadManagedProjectCases()
  return managedCases.length > 0 ? managedCases : curatedProjectCases
}

export function projectCaseBySlug(slug: string) {
  return projectCases.find((projectCase) => projectCase.slug === slug) ?? null
}

async function loadManagedProjectCases() {
  const apiBaseUrl = (import.meta.env.PUBLIC_API_URL ?? '').trim().replace(/\/$/, '')
  if (!apiBaseUrl) return []

  try {
    const response = await fetch(`${apiBaseUrl}/api/public/project-examples`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return []

    const payload = publicProjectExampleListResponseSchema.parse(await response.json())
    return payload.examples
      .filter(isCompleteManagedCase)
      .map(managedRecordToProjectCase)
  } catch {
    return []
  }
}

function isCompleteManagedCase(record: PublicProjectExampleRecord) {
  return Boolean(
    record.description?.trim() &&
      record.objectType?.trim() &&
      record.areaSqm?.trim() &&
      record.initialTask?.trim() &&
      record.engineeringSections.length > 0 &&
      record.fragments.length > 0 &&
      record.exampleSlugs.length > 0,
  )
}

function managedRecordToProjectCase(record: PublicProjectExampleRecord): ProjectCase {
  const coverImageUrl = record.coverImageUrl ?? record.fragments[0]?.imageUrl ?? curatedProjectCases[0].coverImageUrl
  const description = record.description ?? `${record.title}: обезличенный пример реализованного инженерного проекта.`

  return {
    slug: record.slug,
    title: record.title,
    description,
    objectType: record.objectType ?? 'Инженерный проект',
    location: record.location ?? 'Локация обезличена',
    areaSqm: record.areaSqm ?? 'Площадь обезличена',
    engineeringSections: record.engineeringSections,
    initialTask: record.initialTask ?? description,
    solutionSummary: record.solutionSummary ?? 'Полный комплект отправляем после контактной заявки.',
    coverImageUrl,
    coverImageAlt: `${record.title}: фрагмент проектной документации`,
    fragments: record.fragments.map((fragment) => ({
      title: fragment.title,
      caption: fragment.caption,
      imageUrl: fragment.imageUrl,
      imageAlt: fragment.imageAlt,
    })),
    exampleSlugs: record.exampleSlugs,
    seoTitle: `${record.title} | Реализованный проект ИП Позняк`,
    seoDescription: truncateSeoDescription(description),
  }
}

function truncateSeoDescription(value: string) {
  return value.length <= 155 ? value : `${value.slice(0, 152).trim()}...`
}
