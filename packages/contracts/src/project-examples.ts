export type PublicProjectExampleAsset = {
  slug: string
  code: string
  title: string
  description: string
  fileName: string
  pageCount: number
  fileSizeBytes: number
}

export const publicProjectExampleAssets = [
  {
    slug: 'ov',
    code: 'ОВ',
    title: 'Пример проекта отопления и вентиляции',
    description: 'PDF-комплект листов для частного объекта: схемы, планы и спецификация.',
    fileName: 'proekt-primer-ov.pdf',
    pageCount: 39,
    fileSizeBytes: 5_607_314,
  },
  {
    slug: 'vk',
    code: 'ВК',
    title: 'Пример проекта водоснабжения и канализации',
    description: 'PDF-комплект ВК с трассами, точками подключения и рабочими листами.',
    fileName: 'primer-proekt-vk.pdf',
    pageCount: 24,
    fileSizeBytes: 3_511_548,
  },
] as const satisfies readonly PublicProjectExampleAsset[]
