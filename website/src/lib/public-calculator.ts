import type { EngineeringService } from '@poznyak-engineering-calculator/contracts'

export const defaultAreaSqm = '180'

export const areaLimits = {
  min: 50,
  max: 2000,
  step: 5,
}

export const exchangeRate = {
  source: 'fallback' as const,
  usdToBynRate: '2.8668',
  asOf: '2026-07-08T00:00:00.000Z',
}

export const fallbackServices = [
  {
    id: 'boiler-room-3d',
    title: 'Проект котельной + 3D',
    description: 'План котельной, обвязка, подбор оборудования',
    pricingType: 'fixed',
    priceUsdCents: 20_000,
    isActive: true,
    sortOrder: 10,
  },
  {
    id: 'radiator-heating',
    title: 'Радиаторное отопление',
    description: 'Схемы, подбор приборов, гидравлика',
    pricingType: 'per_sqm',
    priceUsdCents: 50,
    isActive: true,
    sortOrder: 20,
  },
  {
    id: 'warm-floor',
    title: 'Теплые полы',
    description: 'Схемы укладки, узлы и расчеты',
    pricingType: 'per_sqm',
    priceUsdCents: 60,
    isActive: true,
    sortOrder: 30,
  },
  {
    id: 'water-supply',
    title: 'Водопровод',
    description: 'Холодное и горячее водоснабжение',
    pricingType: 'per_sqm',
    priceUsdCents: 50,
    isActive: true,
    sortOrder: 40,
  },
  {
    id: 'sewerage',
    title: 'Канализация',
    description: 'Внутренняя бытовая канализация',
    pricingType: 'per_sqm',
    priceUsdCents: 60,
    isActive: true,
    sortOrder: 50,
  },
  {
    id: 'ventilation',
    title: 'Вентиляция',
    description: 'Приточно-вытяжная вентиляция',
    pricingType: 'fixed',
    priceUsdCents: 25_000,
    isActive: true,
    sortOrder: 60,
  },
  {
    id: 'conditioning',
    title: 'Кондиционирование',
    description: 'Система кондиционирования',
    pricingType: 'fixed',
    priceUsdCents: 25_000,
    isActive: true,
    sortOrder: 70,
  },
] satisfies EngineeringService[]

export const defaultSelectedServiceIds = fallbackServices.slice(0, 3).map((service) => service.id)
