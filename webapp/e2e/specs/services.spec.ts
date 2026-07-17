import type { Page } from '@playwright/test'

import { e2eAdminEmail, e2ePassword, expect, test } from '../helpers/test'

test('manages services and public calculator eligibility', async ({ page }) => {
  const backendUrl = process.env.E2E_BACKEND_URL
  if (!backendUrl) throw new Error('E2E_BACKEND_URL is required')

  const adminAccessToken = await configureExchangeRate(backendUrl)

  const suffix = Date.now().toString(36)
  const heatingTitle = `E2E Heating ${suffix}`
  const editedHeatingTitle = `E2E Heating Updated ${suffix}`
  const boilerTitle = `E2E Boiler ${suffix}`
  const formulaTitle = `E2E Future Formula ${suffix}`

  await createFormulaService(backendUrl, adminAccessToken, formulaTitle)

  await page.goto('/app')
  await page.getByLabel('Эл. почта').fill(e2eAdminEmail)
  await page.getByLabel('Пароль').fill(e2ePassword)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('heading', { name: 'Услуги и цены' })).toBeVisible()
  const formulaRow = page.locator('tbody tr').filter({ hasText: formulaTitle })
  await expect(formulaRow.getByRole('cell', { name: 'Формула', exact: true })).toBeVisible()
  await expect(formulaRow.getByRole('switch', { name: `Показывать в калькуляторе: ${formulaTitle}` })).toBeDisabled()
  await expect(formulaRow.getByRole('button', { name: 'Редактировать' })).toBeDisabled()
  await expectPublicServices(page, backendUrl, formulaTitle, false)

  await createService(page, {
    title: heatingTitle,
    description: 'Browser-created heating service',
    pricingType: 'За м²',
    priceUsd: '2.50',
  })
  await createService(page, {
    title: boilerTitle,
    description: 'Browser-created boiler room service',
    pricingType: 'Фиксированная',
    priceUsd: '200',
  })

  const heatingRow = page.locator('tbody tr').filter({ hasText: heatingTitle })
  const boilerRow = page.locator('tbody tr').filter({ hasText: boilerTitle })
  await expect(heatingRow).toBeVisible()
  await expect(boilerRow).toBeVisible()
  await expect(heatingRow).toContainText('8 BYN/м²')

  await page.getByRole('button', { name: `Переместить ${boilerTitle} выше` }).click()
  await expect
    .poll(async () => {
      const rowTexts = await page.locator('tbody tr').allTextContents()
      const boilerIndex = rowTexts.findIndex((text) => text.includes(boilerTitle))
      const heatingIndex = rowTexts.findIndex((text) => text.includes(heatingTitle))

      return boilerIndex >= 0 && heatingIndex >= 0 && boilerIndex < heatingIndex
    })
    .toBe(true)

  await heatingRow.getByRole('button', { name: 'Редактировать' }).click()
  await page.getByLabel('Название').fill(editedHeatingTitle)
  await page.getByLabel('Цена в USD').fill('3')
  await page.getByRole('button', { name: 'Сохранить услугу' }).click()
  const editedHeatingRow = page.locator('tbody tr').filter({ hasText: editedHeatingTitle })
  await expect(editedHeatingRow).toBeVisible()
  await expect(editedHeatingRow).toContainText('10 BYN/м²')
  await editedHeatingRow.getByRole('switch', { name: `Показывать в калькуляторе: ${editedHeatingTitle}` }).click()
  await expectPublicServices(page, backendUrl, editedHeatingTitle, false)
  await expectPublicServices(page, backendUrl, boilerTitle, true)

  await editedHeatingRow.getByRole('switch', { name: `Показывать в калькуляторе: ${editedHeatingTitle}` }).click()
  await expectPublicServices(page, backendUrl, editedHeatingTitle, true)

  await editedHeatingRow.getByRole('button', { name: 'В архив' }).click()
  await editedHeatingRow.getByRole('button', { name: 'Подтвердить архив' }).click()
  await expect(editedHeatingRow.getByText('В архиве')).toBeVisible()
  await expectPublicServices(page, backendUrl, editedHeatingTitle, false)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Услуги и цены' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

async function createService(
  page: Page,
  input: {
    title: string
    description: string
    pricingType: 'Фиксированная' | 'За м²'
    priceUsd: string
  },
) {
  await page.getByRole('button', { name: 'Добавить услугу' }).first().click()
  await page.getByLabel('Название').fill(input.title)
  await page.getByLabel('Описание').fill(input.description)
  await page.getByRole('combobox', { name: 'Тип расчета' }).click()
  await page.getByRole('option', { name: input.pricingType }).click()
  await page.getByLabel('Цена в USD').fill(input.priceUsd)
  await page.getByRole('button', { name: 'Сохранить услугу' }).click()
  await expect(page.locator('tbody tr').filter({ hasText: input.title })).toBeVisible()
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    )
    .toBe(true)
}

async function configureExchangeRate(backendUrl: string) {
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
  const loginBody = await login.json() as { accessToken: string }
  expect(login.status).toBe(200)

  const response = await fetch(`${backendUrl}/api/admin/settings/exchange-rate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loginBody.accessToken}`,
    },
    body: JSON.stringify({
      source: 'manual',
      usdToBynRate: '3.2000',
      asOf: '2026-07-09T00:00:00.000Z',
    }),
  })

  expect(response.status).toBe(200)
  return loginBody.accessToken
}

async function createFormulaService(backendUrl: string, accessToken: string, title: string) {
  const response = await fetch(`${backendUrl}/api/admin/services`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      title,
      description: 'Future formula service should be visible but not editable in PZK-008',
      pricingType: 'formula',
      priceUsdCents: 0,
      pricingRule: { kind: 'future' },
      formulaVersion: 'future-v1',
      isActive: true,
      isPublic: true,
      sortOrder: 5,
    }),
  })

  expect(response.status).toBe(201)
}

async function expectPublicServices(
  page: Page,
  backendUrl: string,
  title: string,
  shouldContain: boolean,
) {
  await expect
    .poll(async () =>
      page.evaluate(async ({ backendUrl, title }) => {
        const response = await fetch(`${backendUrl}/api/public/calculator-config`, {
          headers: { Accept: 'application/json' },
        })
        const body = await response.json() as { services: Array<{ title: string }> }

        return body.services.some((service) => service.title === title)
      }, { backendUrl, title }),
    )
    .toBe(shouldContain)
}
