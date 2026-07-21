export type BlogContentBlock =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }

const allowedTags = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'em',
  'h2',
  'h3',
  'h4',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
])
const voidTags = new Set(['br', 'img'])
const skippedContentTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math'])
const htmlDetectionPattern = /<\/?(?:p|h[1-6]|ul|ol|li|strong|b|em|i|u|a|img|blockquote|table|thead|tbody|tr|td|th|br|pre|code)\b/i

export function renderBlogContentHtml(content: string) {
  const source = content.trim()
  if (!source) return ''

  return looksLikeBlogHtml(source)
    ? sanitizeBlogHtml(source)
    : renderMarkdownBlogContentHtml(source)
}

export function sanitizeBlogHtml(html: string) {
  const output: string[] = []
  const openTags: string[] = []
  const tagPattern = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/?[a-zA-Z][^>]*>/g
  let cursor = 0
  let skippedTag: string | null = null

  for (const match of html.matchAll(tagPattern)) {
    const token = match[0]
    const tokenStart = match.index ?? 0

    if (!skippedTag) {
      output.push(escapeHtmlText(html.slice(cursor, tokenStart)))
    }

    cursor = tokenStart + token.length
    const tag = parseHtmlTag(token)
    if (!tag) continue

    if (skippedTag) {
      if (tag.closing && tag.name === skippedTag) {
        skippedTag = null
      }
      continue
    }

    if (skippedContentTags.has(tag.name)) {
      if (!tag.closing) skippedTag = tag.name
      continue
    }

    if (!allowedTags.has(tag.name)) continue

    if (tag.closing) {
      if (voidTags.has(tag.name)) continue
      closeTag(tag.name, openTags, output)
      continue
    }

    output.push(`<${tag.name}${sanitizeAttributes(tag.name, tag.attributes)}>`)

    if (!voidTags.has(tag.name) && !tag.selfClosing) {
      openTags.push(tag.name)
    }
  }

  if (!skippedTag) {
    output.push(escapeHtmlText(html.slice(cursor)))
  }

  while (openTags.length > 0) {
    output.push(`</${openTags.pop()}>`)
  }

  return output.join('').replace(/(?:<p>\s*<\/p>)+/g, '').trim()
}

export function blogContentPlainText(content: string) {
  return decodeBasicHtmlEntities(renderBlogContentHtml(content).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
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

function renderMarkdownBlogContentHtml(content: string) {
  return parseBlogContent(content)
    .map((block) => {
      if (block.kind === 'heading') {
        return `<h${block.level}>${escapeHtmlText(block.text)}</h${block.level}>`
      }

      if (block.kind === 'list') {
        return `<ul>${block.items.map((item) => `<li>${escapeHtmlText(item)}</li>`).join('')}</ul>`
      }

      return `<p>${escapeHtmlText(block.text)}</p>`
    })
    .join('')
}

function looksLikeBlogHtml(content: string) {
  return htmlDetectionPattern.test(content)
}

function parseHtmlTag(token: string) {
  if (token.startsWith('<!--') || token.startsWith('<!')) return null

  const match = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9:-]*)([\s\S]*?)\s*(\/?)\s*>$/.exec(token)
  if (!match) return null

  return {
    closing: match[1] === '/',
    name: match[2].toLowerCase(),
    attributes: match[3] ?? '',
    selfClosing: match[4] === '/',
  }
}

function closeTag(tagName: string, openTags: string[], output: string[]) {
  const openIndex = openTags.lastIndexOf(tagName)
  if (openIndex < 0) return

  for (let index = openTags.length - 1; index >= openIndex; index -= 1) {
    output.push(`</${openTags.pop()}>`)
  }
}

function sanitizeAttributes(tagName: string, rawAttributes: string) {
  const attributes = readAttributes(rawAttributes)

  if (tagName === 'a') {
    return sanitizeAnchorAttributes(attributes)
  }

  if (tagName === 'img') {
    return sanitizeImageAttributes(attributes)
  }

  if (tagName === 'th' || tagName === 'td') {
    return sanitizeTableCellAttributes(attributes)
  }

  return ''
}

function sanitizeAnchorAttributes(attributes: Map<string, string>) {
  const href = sanitizeUrl(attributes.get('href'))
  if (!href) return ''

  const title = normalizeAttributeText(attributes.get('title'), 180)
  const isExternal = /^https?:\/\//i.test(href)
  const parts = [`href="${escapeHtmlAttribute(href)}"`]

  if (title) parts.push(`title="${escapeHtmlAttribute(title)}"`)
  if (isExternal) {
    parts.push('target="_blank"', 'rel="noopener noreferrer"')
  }

  return ` ${parts.join(' ')}`
}

function sanitizeImageAttributes(attributes: Map<string, string>) {
  const src = sanitizeUrl(attributes.get('src'))
  if (!src) return ''

  const parts = [`src="${escapeHtmlAttribute(src)}"`]
  const alt = normalizeAttributeText(attributes.get('alt'), 220)
  const title = normalizeAttributeText(attributes.get('title'), 180)
  const width = sanitizeDimension(attributes.get('width'))
  const height = sanitizeDimension(attributes.get('height'))
  const loading = sanitizeLoading(attributes.get('loading')) ?? 'lazy'

  if (alt) parts.push(`alt="${escapeHtmlAttribute(alt)}"`)
  if (title) parts.push(`title="${escapeHtmlAttribute(title)}"`)
  if (width) parts.push(`width="${width}"`)
  if (height) parts.push(`height="${height}"`)
  parts.push(`loading="${loading}"`)

  return ` ${parts.join(' ')}`
}

function sanitizeTableCellAttributes(attributes: Map<string, string>) {
  const colspan = sanitizeDimension(attributes.get('colspan'), 2)
  const rowspan = sanitizeDimension(attributes.get('rowspan'), 2)
  const parts: string[] = []

  if (colspan) parts.push(`colspan="${colspan}"`)
  if (rowspan) parts.push(`rowspan="${rowspan}"`)

  return parts.length > 0 ? ` ${parts.join(' ')}` : ''
}

function readAttributes(rawAttributes: string) {
  const attributes = new Map<string, string>()
  const attributePattern = /([a-zA-Z][a-zA-Z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g

  for (const match of rawAttributes.matchAll(attributePattern)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '')
  }

  return attributes
}

function sanitizeUrl(value: string | undefined) {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed || /\s/.test(trimmed)) return null

  if (isRootRelativePublicPath(trimmed) || isHttpUrl(trimmed)) {
    return trimmed
  }

  return null
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isRootRelativePublicPath(value: string) {
  if (!value.startsWith('/') || value.startsWith('//')) return false

  try {
    new URL(value, 'https://example.com')
    return true
  } catch {
    return false
  }
}

function normalizeAttributeText(value: string | undefined, maxLength: number) {
  const trimmed = value?.replace(/\s+/g, ' ').trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

function sanitizeDimension(value: string | undefined, maxDigits = 4) {
  const trimmed = value?.trim()
  return trimmed && new RegExp(`^[1-9][0-9]{0,${maxDigits - 1}}$`).test(trimmed)
    ? trimmed
    : null
}

function sanitizeLoading(value: string | undefined) {
  const normalized = value?.trim().toLowerCase()
  return normalized === 'lazy' || normalized === 'eager' ? normalized : null
}

function escapeHtmlText(value: string) {
  return value
    .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]+|#\d+|#x[\da-fA-F]+);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeHtmlAttribute(value: string) {
  return escapeHtmlText(value).replace(/"/g, '&quot;')
}

function decodeBasicHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_match, codePoint: string) => decodeCodePoint(Number(codePoint)))
    .replace(/&#x([\da-f]+);/gi, (_match, codePoint: string) => decodeCodePoint(parseInt(codePoint, 16)))
}

function decodeCodePoint(codePoint: number) {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return ''

  try {
    return String.fromCodePoint(codePoint)
  } catch {
    return ''
  }
}
