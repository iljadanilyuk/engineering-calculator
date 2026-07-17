import { e2eAdminEmail, e2ePassword, expect, test } from '../helpers/test'

test('logs in to the protected admin shell and logs out', async ({ page }) => {
  const backendUrl = process.env.E2E_BACKEND_URL
  if (!backendUrl) throw new Error('E2E_BACKEND_URL is required')

  await page.goto('/app')

  await expect(
    page.getByRole('heading', { name: 'Вход в управление калькулятором' }),
  ).toBeVisible()

  const anonymousAdminApiStatus = await page.evaluate(async (backendUrl) => {
    const response = await fetch(`${backendUrl}/api/admin/services`, {
      credentials: 'include',
    })

    return response.status
  }, backendUrl)
  expect(anonymousAdminApiStatus).toBe(401)

  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByText('Введите корректную эл. почту')).toBeVisible()
  await expect(page.getByText('Пароль должен быть не короче 8 символов')).toBeVisible()

  await page.getByLabel('Эл. почта').fill(e2eAdminEmail)
  await page.getByLabel('Пароль').fill('wrong-password')
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByText('Неверная почта или пароль')).toBeVisible()

  await page.getByLabel('Пароль').fill(e2ePassword)
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page.getByRole('heading', { name: 'Услуги и цены' })).toBeVisible()
  await expect(page.getByText(e2eAdminEmail)).toBeVisible()
  await expect
    .poll(async () =>
      (await page.context().cookies()).some(
        (cookie) => cookie.name === 'poznyak_engineering_calculator_refresh' && cookie.httpOnly,
      ),
    )
    .toBe(true)

  const refreshAfterReload = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/refresh') && response.request().method() === 'POST',
  )
  const meAfterReload = page.waitForResponse(
    (response) => response.url().endsWith('/api/auth/me') && response.request().method() === 'GET',
  )

  await page.reload()

  await expect((await refreshAfterReload).status()).toBe(200)
  await expect((await meAfterReload).status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Услуги и цены' })).toBeVisible()

  await page.getByRole('button', { name: 'Выйти' }).click()
  await expect(
    page.getByRole('heading', { name: 'Вход в управление калькулятором' }),
  ).toBeVisible()
})

test('mobile login screen has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Вход в управление калькулятором' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    )
    .toBe(true)
}
