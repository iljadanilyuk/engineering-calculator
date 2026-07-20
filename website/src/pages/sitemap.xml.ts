import type { APIRoute } from 'astro'

import { loadBlogPosts } from '../lib/blog-posts'
import { loadProjectCases } from '../lib/project-cases'
import { absoluteUrl, defaultSiteUrl } from '../lib/seo'

export const GET: APIRoute = async () => {
  const siteUrl = (import.meta.env.PUBLIC_WEBSITE_URL ?? defaultSiteUrl).trim().replace(/\/+$/, '') || defaultSiteUrl
  const projectCases = await loadProjectCases()
  const blogPosts = await loadBlogPosts()
  const urls = [
    { loc: absoluteUrl(siteUrl, '/'), changefreq: 'weekly', priority: '1.0' },
    { loc: absoluteUrl(siteUrl, '/projects/'), changefreq: 'weekly', priority: '0.8' },
    ...projectCases.map((projectCase) => ({
      loc: absoluteUrl(siteUrl, `/projects/${projectCase.slug}/`),
      changefreq: 'monthly',
      priority: '0.7',
    })),
    { loc: absoluteUrl(siteUrl, '/blog/'), changefreq: 'weekly', priority: '0.7' },
    ...blogPosts.map((post) => ({
      loc: absoluteUrl(siteUrl, `/blog/${post.slug}/`),
      changefreq: 'monthly',
      priority: '0.6',
    })),
  ]

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (url) => [
        '  <url>',
        `    <loc>${escapeXml(url.loc)}</loc>`,
        `    <changefreq>${url.changefreq}</changefreq>`,
        `    <priority>${url.priority}</priority>`,
        '  </url>',
      ].join('\n'),
    ),
    '</urlset>',
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  })
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
