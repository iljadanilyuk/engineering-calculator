import { z } from 'zod'

const uuidSchema = z.string().uuid()
const sortOrderSchema = z.number().int().min(-1_000_000).max(1_000_000)

export const blogPostStatusSchema = z.enum(['draft', 'published', 'archived'])

export const blogPostSlugSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  return value.trim().toLowerCase()
}, z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/))

export const blogPostTagListSchema = z.array(
  z.string().trim().min(1).max(48),
).max(12).superRefine((tags, context) => {
  addDuplicateIssues(tags.map((tag) => tag.toLowerCase()), context)
})

export const blogPostUrlSchema = z.string().trim().min(1).max(2_048).refine(
  (value) => isHttpUrl(value) || isRootRelativePublicPath(value),
  'Expected an http(s) URL or root-relative public path',
)

const optionalTextSchema = (max: number) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }, z.string().max(max).nullable().optional())

const optionalBlogPostUrlSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}, blogPostUrlSchema.nullable().optional())

const optionalPublishedAtSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}, z.string().datetime().nullable().optional())

export const blogPostCreateRequestSchema = z.object({
  slug: blogPostSlugSchema.optional(),
  title: z.string().trim().min(1).max(180),
  excerpt: z.string().trim().min(1).max(700),
  content: z.string().trim().min(1).max(60_000),
  coverImageUrl: optionalBlogPostUrlSchema,
  category: optionalTextSchema(80),
  tags: blogPostTagListSchema.default([]),
  seoTitle: optionalTextSchema(180),
  seoDescription: optionalTextSchema(320),
  status: blogPostStatusSchema.default('draft'),
  publishedAt: optionalPublishedAtSchema,
  sortOrder: sortOrderSchema.default(0),
})

export const blogPostUpdateRequestSchema = z.object({
  slug: blogPostSlugSchema.optional(),
  title: z.string().trim().min(1).max(180).optional(),
  excerpt: z.string().trim().min(1).max(700).optional(),
  content: z.string().trim().min(1).max(60_000).optional(),
  coverImageUrl: optionalBlogPostUrlSchema,
  category: optionalTextSchema(80),
  tags: blogPostTagListSchema.optional(),
  seoTitle: optionalTextSchema(180),
  seoDescription: optionalTextSchema(320),
  status: blogPostStatusSchema.optional(),
  publishedAt: optionalPublishedAtSchema,
  sortOrder: sortOrderSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const blogPostRecordSchema = z.object({
  id: uuidSchema,
  slug: blogPostSlugSchema,
  title: z.string(),
  excerpt: z.string(),
  content: z.string(),
  coverImageUrl: blogPostUrlSchema.nullable(),
  category: z.string().nullable(),
  tags: blogPostTagListSchema,
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  status: blogPostStatusSchema,
  publishedAt: z.string().datetime().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const publicBlogPostSummarySchema = blogPostRecordSchema.pick({
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  coverImageUrl: true,
  category: true,
  tags: true,
  seoTitle: true,
  seoDescription: true,
  publishedAt: true,
  sortOrder: true,
  updatedAt: true,
})

export const publicBlogPostRecordSchema = publicBlogPostSummarySchema.extend({
  content: z.string(),
})

export const blogPostListResponseSchema = z.object({
  posts: z.array(blogPostRecordSchema),
})

export const blogPostResponseSchema = z.object({
  post: blogPostRecordSchema,
})

export const publicBlogPostListResponseSchema = z.object({
  posts: z.array(publicBlogPostSummarySchema),
})

export const publicBlogPostResponseSchema = z.object({
  post: publicBlogPostRecordSchema,
})

export type BlogPostStatus = z.infer<typeof blogPostStatusSchema>
export type BlogPostCreateRequest = z.infer<typeof blogPostCreateRequestSchema>
export type BlogPostUpdateRequest = z.infer<typeof blogPostUpdateRequestSchema>
export type BlogPostRecord = z.infer<typeof blogPostRecordSchema>
export type BlogPostListResponse = z.infer<typeof blogPostListResponseSchema>
export type BlogPostResponse = z.infer<typeof blogPostResponseSchema>
export type PublicBlogPostSummary = z.infer<typeof publicBlogPostSummarySchema>
export type PublicBlogPostRecord = z.infer<typeof publicBlogPostRecordSchema>
export type PublicBlogPostListResponse = z.infer<typeof publicBlogPostListResponseSchema>
export type PublicBlogPostResponse = z.infer<typeof publicBlogPostResponseSchema>

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
  if (/\s/.test(value)) return false

  try {
    new URL(value, 'https://example.com')
    return true
  } catch {
    return false
  }
}

function addDuplicateIssues(values: readonly string[], context: z.RefinementCtx) {
  const seen = new Set<string>()

  for (const [index, value] of values.entries()) {
    if (!seen.has(value)) {
      seen.add(value)
      continue
    }

    context.addIssue({
      code: 'custom',
      path: [index],
      message: 'Values must be unique',
    })
  }
}
