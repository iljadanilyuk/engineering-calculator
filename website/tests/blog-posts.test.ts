import { afterEach, expect, test } from 'bun:test'

import { loadBlogPostDetails, loadBlogPosts } from '../src/lib/blog-posts'

const originalFetch = globalThis.fetch
const originalPublicApiUrl = process.env.PUBLIC_API_URL

afterEach(() => {
  globalThis.fetch = originalFetch

  if (originalPublicApiUrl === undefined) {
    delete process.env.PUBLIC_API_URL
  } else {
    process.env.PUBLIC_API_URL = originalPublicApiUrl
  }
})

test('blog loader uses curated posts only when no public API URL is configured', async () => {
  delete process.env.PUBLIC_API_URL
  globalThis.fetch = (async () => {
    throw new Error('Unexpected managed blog API request')
  }) as unknown as typeof fetch

  const posts = await loadBlogPosts()

  expect(posts.length).toBeGreaterThan(0)
  expect(posts.some((post) => post.slug === 'kak-podgotovitsya-k-proektu-otopleniya')).toBe(true)
})

test('blog detail loader fails instead of falling back when configured API detail fetch fails', async () => {
  process.env.PUBLIC_API_URL = 'https://api.example.test'

  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const path = new URL(String(input)).pathname

    if (path === '/api/public/blog-posts') {
      return json({
        posts: [{
          id: '00000000-0000-7000-8000-000000000601',
          slug: 'managed-post',
          title: 'Managed post',
          excerpt: 'Managed excerpt',
          coverImageUrl: null,
          category: null,
          tags: [],
          seoTitle: null,
          seoDescription: null,
          publishedAt: '2026-07-20T08:00:00.000Z',
          sortOrder: 10,
          updatedAt: '2026-07-20T08:00:00.000Z',
        }],
      })
    }

    if (path === '/api/public/blog-posts/managed-post') {
      return json({ error: { code: 'UPSTREAM', message: 'Broken detail' } }, 500)
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }) as unknown as typeof fetch

  let error: unknown
  try {
    await loadBlogPostDetails()
  } catch (caughtError) {
    error = caughtError
  }

  expect(error).toBeInstanceOf(Error)
  expect((error as Error).message).toContain('Blog post fetch failed: managed-post')
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
