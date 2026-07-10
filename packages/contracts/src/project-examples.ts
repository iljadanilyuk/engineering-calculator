export type PublicProjectExampleAsset = {
  code: string
  title: string
  description: string
  filePath: string
  fileName: string
  pageCount: number
  fileSizeBytes: number
}

export const publicProjectExampleAssets = [
  {
    code: 'ОВ',
    title: 'Пример проекта отопления и вентиляции',
    description: 'PDF-комплект листов для частного объекта: схемы, планы и спецификация.',
    filePath: '/project-examples/proekt-primer-ov.pdf',
    fileName: 'proekt-primer-ov.pdf',
    pageCount: 39,
    fileSizeBytes: 5_607_314,
  },
  {
    code: 'ВК',
    title: 'Пример проекта водоснабжения и канализации',
    description: 'PDF-комплект ВК с трассами, точками подключения и рабочими листами.',
    filePath: '/project-examples/primer-proekt-vk.pdf',
    fileName: 'primer-proekt-vk.pdf',
    pageCount: 24,
    fileSizeBytes: 3_511_548,
  },
] as const satisfies readonly PublicProjectExampleAsset[]
