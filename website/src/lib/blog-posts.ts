import {
  publicBlogPostListResponseSchema,
  publicBlogPostResponseSchema,
  type PublicBlogPostRecord,
  type PublicBlogPostSummary,
} from '@poznyak-engineering-calculator/contracts'

import { defaultSocialImagePath } from './seo'

export type BlogPostSummary = PublicBlogPostSummary & {
  coverImageAlt: string
  seoTitleResolved: string
  seoDescriptionResolved: string
}

export type BlogPost = PublicBlogPostRecord & {
  coverImageAlt: string
  seoTitleResolved: string
  seoDescriptionResolved: string
}

export type BlogContentBlock =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }

const curatedBlogPosts = [
  {
    id: '00000000-0000-7000-8000-000000000b01',
    slug: 'kak-podgotovitsya-k-proektu-otopleniya',
    title: 'Как подготовиться к проекту отопления частного дома',
    excerpt:
      'Короткий чек-лист исходных данных, которые помогают быстрее посчитать проект и меньше спорить на монтаже.',
    content: [
      'Проект отопления начинается не с выбора котла, а с исходных данных. Чем точнее они собраны до старта, тем меньше приходится переделывать трассы, спецификацию и узлы уже на объекте.',
      '## Что собрать до расчета',
      '- Планы помещений с размерами',
      '- Конструкции стен, кровли, пола и окон',
      '- Желаемые зоны теплого пола и радиаторов',
      '- Место котельной и ограничения по дымоходу',
      '## Почему это важно',
      'Инженерный проект связывает теплопотери, оборудование, трассы и ведомость материалов. Если часть вводных меняется после выпуска документации, смета и монтажные решения тоже начинают расходиться.',
    ].join('\n\n'),
    coverImageUrl: '/landing-v4/project-preview-plan-08.jpg',
    category: 'Подготовка',
    tags: ['Отопление', 'Частный дом'],
    seoTitle: 'Как подготовиться к проекту отопления | ИП Позняк',
    seoDescription:
      'Что подготовить перед заказом проекта отопления частного дома: планы, конструкции, зоны отопления, котельная и исходные данные для точного расчета.',
    publishedAt: '2026-07-20T08:00:00.000Z',
    sortOrder: 10,
    updatedAt: '2026-07-20T08:00:00.000Z',
  },
  {
    id: '00000000-0000-7000-8000-000000000b02',
    slug: 'zachem-nuzhna-spetsifikatsiya-v-proekte',
    title: 'Зачем нужна спецификация в инженерном проекте',
    excerpt:
      'Спецификация превращает проект из набора схем в проверяемую основу для закупки, сметы и разговора с монтажниками.',
    content: [
      'Спецификация нужна не только поставщику. Это общий список оборудования и материалов, с которым заказчик, проектировщик и монтажная бригада сверяют объем работ.',
      '## Что дает спецификация',
      '- Видно, какие позиции должны попасть в закупку',
      '- Проще сравнить предложения поставщиков',
      '- Меньше риска заменить важный узел случайным аналогом',
      '## Как читать документ',
      'Смотрите не только итоговую сумму. Важно проверить назначение оборудования, количество, диаметр, тип арматуры и соответствие проектным листам.',
    ].join('\n\n'),
    coverImageUrl: '/landing-v4/project-preview-spec-10.jpg',
    category: 'Документация',
    tags: ['Спецификация', 'Закупка'],
    seoTitle: 'Спецификация инженерного проекта | ИП Позняк',
    seoDescription:
      'Зачем в инженерном проекте нужна спецификация оборудования и материалов, как она помогает смете, закупке и монтажу.',
    publishedAt: '2026-07-20T08:10:00.000Z',
    sortOrder: 20,
    updatedAt: '2026-07-20T08:10:00.000Z',
  },
] as const satisfies readonly PublicBlogPostRecord[]

export async function loadBlogPosts(): Promise<readonly BlogPostSummary[]> {
  const managedPosts = await loadManagedBlogPostSummaries()
  if (managedPosts) return managedPosts.map(blogPostSummaryFromRecord)
  return curatedBlogPosts.map(blogPostSummaryFromRecord)
}

export async function loadBlogPostDetails(): Promise<readonly BlogPost[]> {
  const managedPosts = await loadManagedBlogPostDetails()
  if (managedPosts) return managedPosts.map(blogPostFromRecord)
  return curatedBlogPosts.map(blogPostFromRecord)
}

export function parseBlogContent(content: string): BlogContentBlock[] {
  const blocks: BlogContentBlock[] = []
  const paragraph: string[] = []
  let listItems: string[] = []

  function flushParagraph() {
    if (paragraph.length === 0) return
    blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
    paragraph.length = 0
  }

  function flushList() {
    if (listItems.length === 0) return
    blocks.push({ kind: 'list', items: listItems })
    listItems = []
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    if (line.startsWith('### ')) {
      flushParagraph()
      flushList()
      blocks.push({ kind: 'heading', level: 3, text: line.slice(4).trim() })
      continue
    }

    if (line.startsWith('## ')) {
      flushParagraph()
      flushList()
      blocks.push({ kind: 'heading', level: 2, text: line.slice(3).trim() })
      continue
    }

    if (line.startsWith('- ')) {
      flushParagraph()
      listItems.push(line.slice(2).trim())
      continue
    }

    flushList()
    paragraph.push(line)
  }

  flushParagraph()
  flushList()

  return blocks
}

export function formatBlogDate(value: string | null) {
  if (!value) return 'Дата публикации уточняется'

  return new Intl.DateTimeFormat('ru-BY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value))
}

async function loadManagedBlogPostSummaries(): Promise<PublicBlogPostSummary[] | null> {
  const apiBaseUrl = apiBase()
  if (!apiBaseUrl) return null

  const response = await fetch(`${apiBaseUrl}/api/public/blog-posts`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`Blog post list fetch failed: ${response.status}`)
  }

  const payload = publicBlogPostListResponseSchema.parse(await response.json())
  return payload.posts
}

async function loadManagedBlogPostDetails(): Promise<PublicBlogPostRecord[] | null> {
  const apiBaseUrl = apiBase()
  if (!apiBaseUrl) return null

  const summaries = await loadManagedBlogPostSummaries()
  if (!summaries) return null
  if (summaries.length === 0) return []

  const posts = await Promise.all(
    summaries.map(async (summary) => {
      const response = await fetch(`${apiBaseUrl}/api/public/blog-posts/${summary.slug}`, {
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`Blog post fetch failed: ${summary.slug}`)
      return publicBlogPostResponseSchema.parse(await response.json()).post
    }),
  )

  return posts
}

function blogPostSummaryFromRecord(record: PublicBlogPostSummary): BlogPostSummary {
  return {
    ...record,
    coverImageAlt: `${record.title}: иллюстрация инженерной статьи`,
    seoTitleResolved: record.seoTitle ?? `${record.title} | Блог ИП Позняк`,
    seoDescriptionResolved: truncateSeoDescription(record.seoDescription ?? record.excerpt),
  }
}

function blogPostFromRecord(record: PublicBlogPostRecord): BlogPost {
  return {
    ...record,
    coverImageAlt: `${record.title}: иллюстрация инженерной статьи`,
    seoTitleResolved: record.seoTitle ?? `${record.title} | Блог ИП Позняк`,
    seoDescriptionResolved: truncateSeoDescription(record.seoDescription ?? record.excerpt),
  }
}

function truncateSeoDescription(value: string) {
  return value.length <= 155 ? value : `${value.slice(0, 152).trim()}...`
}

function apiBase() {
  const apiBaseUrl = (import.meta.env.PUBLIC_API_URL ?? '').trim().replace(/\/$/, '')
  return apiBaseUrl || null
}

export function blogCoverImageUrl(post: Pick<BlogPostSummary, 'coverImageUrl'>) {
  return post.coverImageUrl ?? defaultSocialImagePath
}
