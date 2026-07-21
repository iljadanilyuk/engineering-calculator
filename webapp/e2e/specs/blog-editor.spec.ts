import { e2eAdminEmail, e2ePassword, expect, test } from '../helpers/test'

test('blog editor uses the full drawer width while editing long content', async ({ page }) => {
  const backendUrl = process.env.E2E_BACKEND_URL
  if (!backendUrl) throw new Error('E2E_BACKEND_URL is required')

  const accessToken = await loginAdminApi(backendUrl)
  const suffix = Date.now().toString(36)
  const title = `E2E Wide Blog Editor ${suffix}`

  await createBlogPost(backendUrl, accessToken, {
    title,
    content: [
      'Когда на окнах появляется вода, первый подозреваемый обычно сам стеклопакет. Но очень часто окно просто показывает проблему, которая уже есть в доме.',
      '',
      '## Что можно сделать сейчас',
      '',
      'Если окна уже потеют, начните с диагностики: влажность, температура в проблемных комнатах, работа вытяжки, наличие притока.',
    ].join('\n'),
  })

  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/app/blog')
  await page.getByLabel('Эл. почта').fill(e2eAdminEmail)
  await page.getByLabel('Пароль').fill(e2ePassword)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('heading', { name: 'Блог и публикации' })).toBeVisible()

  const row = page.locator('tbody tr').filter({ hasText: title })
  await row.getByRole('button', { name: 'Редактировать' }).click()
  await expect(page.getByRole('heading', { name: 'Редактировать статью' })).toBeVisible()
  await expect(page.locator('.admin-rich-editor .tox.tox-tinymce')).toBeVisible()

  await page.locator('.admin-rich-editor').scrollIntoViewIfNeeded()

  const widths = await page.evaluate(() => {
    const drawer = document.querySelector('[data-slot="sheet-content"]')
    const editor = document.querySelector('.admin-rich-editor .tox.tox-tinymce')
    const iframe = document.querySelector('.admin-rich-editor .tox-edit-area__iframe') as HTMLIFrameElement | null
    const editorBody = iframe?.contentDocument?.body ?? null
    const paragraph = editorBody?.querySelector('p')

    return {
      body: editorBody?.getBoundingClientRect().width ?? 0,
      drawer: drawer?.getBoundingClientRect().width ?? 0,
      editor: editor?.getBoundingClientRect().width ?? 0,
      iframe: iframe?.getBoundingClientRect().width ?? 0,
      paragraph: paragraph?.getBoundingClientRect().width ?? 0,
    }
  })

  expect(widths.drawer).toBeGreaterThan(1100)
  expect(widths.editor).toBeGreaterThan(900)
  expect(widths.iframe).toBeGreaterThan(900)
  expect(widths.body).toBeGreaterThan(850)
  expect(widths.paragraph).toBeGreaterThan(800)
})

async function loginAdminApi(backendUrl: string) {
  const login = await fetch(`${backendUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Platform': 'mobile',
    },
    body: JSON.stringify({
      email: e2eAdminEmail,
      password: e2ePassword,
    }),
  })
  const body = await login.json() as { accessToken: string }

  expect(login.status).toBe(200)
  return body.accessToken
}

async function createBlogPost(
  backendUrl: string,
  accessToken: string,
  payload: {
    title: string
    content: string
  },
) {
  const response = await fetch(`${backendUrl}/api/admin/blog-posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      title: payload.title,
      excerpt: 'Тестовая статья для проверки ширины редактора.',
      content: payload.content,
      status: 'draft',
      sortOrder: 500,
      tags: ['E2E'],
    }),
  })

  expect(response.status).toBe(201)
}
