export const defaultSiteUrl = 'https://poznyak.by'
export const siteName = 'ИП Позняк'
export const defaultSocialImagePath = '/social-preview.jpg'
export const defaultSocialImageAlt =
  'Консультация по проектированию инженерных систем для дома'

export type PageMetaInput = {
  siteUrl?: string
  path: string
  title: string
  description: string
  robots?: string
  imagePath?: string
}

export function createPageMeta({
  siteUrl,
  path,
  title,
  description,
  robots = 'index,follow,max-image-preview:large',
  imagePath = defaultSocialImagePath,
}: PageMetaInput) {
  const origin = normalizeSiteUrl(siteUrl)

  return {
    siteUrl: origin,
    title,
    description,
    robots,
    canonicalUrl: absoluteUrl(origin, path),
    imageUrl: absoluteUrl(origin, imagePath),
    imageAlt: defaultSocialImageAlt,
  }
}

export function absoluteUrl(siteUrl: string, path: string) {
  if (/^https?:\/\//i.test(path)) return path
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizeSiteUrl(siteUrl)}${normalizedPath}`
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
}

function normalizeSiteUrl(siteUrl?: string) {
  const normalized = (siteUrl?.trim() || defaultSiteUrl).replace(/\/+$/, '')
  return normalized || defaultSiteUrl
}
