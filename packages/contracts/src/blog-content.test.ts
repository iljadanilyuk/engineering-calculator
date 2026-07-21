import { describe, expect, test } from 'bun:test'

import {
  blogContentPlainText,
  renderBlogContentHtml,
  sanitizeBlogHtml,
} from './blog-content'

describe('blog content rendering', () => {
  test('renders legacy markdown-like blog text as article HTML', () => {
    expect(renderBlogContentHtml('Intro\n\n## Расчет\n\n- Нагрузка\n- Узлы')).toBe(
      '<p>Intro</p><h2>Расчет</h2><ul><li>Нагрузка</li><li>Узлы</li></ul>',
    )
  })

  test('keeps TinyMCE article markup and strips unsafe tags and attributes', () => {
    const html = sanitizeBlogHtml(`
      <h2 onclick="alert(1)">Раздел</h2>
      <p>Текст <strong>важный</strong> <a href="https://example.com" onclick="bad()">ссылка</a>.</p>
      <p><a href="javascript:alert(1)">плохая ссылка</a></p>
      <img src="/landing-v4/project-preview-plan-08.jpg" onerror="bad()" alt="План" />
      <script>alert("xss")</script>
    `)

    expect(html).toContain('<h2>Раздел</h2>')
    expect(html).toContain('<strong>важный</strong>')
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">ссылка</a>')
    expect(html).toContain('<a>плохая ссылка</a>')
    expect(html).toContain('<img src="/landing-v4/project-preview-plan-08.jpg" alt="План" loading="lazy">')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert("xss")')
  })

  test('uses semantic plain text for empty rich-text documents', () => {
    expect(blogContentPlainText('<p>&nbsp;</p>')).toBe('')
    expect(blogContentPlainText('<p>Текст <em>статьи</em></p>')).toBe('Текст статьи')
  })
})
