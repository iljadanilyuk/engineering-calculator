import { e2eAdminEmail, e2ePassword, expect, test } from '../helpers/test'

test('logs in to the protected admin shell and logs out', async ({ page }) => {
  const backendUrl = process.env.E2E_BACKEND_URL
  if (!backendUrl) throw new Error('E2E_BACKEND_URL is required')

  await page.goto('/app')

  await expect(
    page.getByRole('heading', { name: 'Login for calculator administration.' }),
  ).toBeVisible()

  const anonymousAdminApiStatus = await page.evaluate(async (backendUrl) => {
    const response = await fetch(`${backendUrl}/api/admin/services`, {
      credentials: 'include',
    })

    return response.status
  }, backendUrl)
  expect(anonymousAdminApiStatus).toBe(401)

  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByText('Invalid email address')).toBeVisible()
  await expect(page.getByText('Password must be at least 8 characters')).toBeVisible()

  await page.getByLabel('Email').fill(e2eAdminEmail)
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByText('Invalid email or password')).toBeVisible()

  await page.getByLabel('Password').fill(e2ePassword)
  await page.getByRole('button', { name: 'Login' }).click()

  await expect(page.getByRole('heading', { name: 'Web E2E Admin' })).toBeVisible()
  await expect(page.getByText(e2eAdminEmail)).toBeVisible()
  await expect(page.getByText('Admin shell')).toBeVisible()
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
  await expect(page.getByRole('heading', { name: 'Web E2E Admin' })).toBeVisible()

  await page.getByRole('button', { name: 'Logout' }).click()
  await expect(
    page.getByRole('heading', { name: 'Login for calculator administration.' }),
  ).toBeVisible()
})
