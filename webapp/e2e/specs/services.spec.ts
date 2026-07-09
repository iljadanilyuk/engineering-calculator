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
  await page.getByLabel('Email').fill(e2eAdminEmail)
  await page.getByLabel('Password').fill(e2ePassword)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByRole('heading', { name: 'Services management' })).toBeVisible()
  const formulaRow = page.locator('tbody tr').filter({ hasText: formulaTitle })
  await expect(formulaRow.getByRole('cell', { name: 'Future formula', exact: true })).toBeVisible()
  await expect(formulaRow.getByRole('switch', { name: `Public visibility for ${formulaTitle}` })).toBeDisabled()
  await expect(formulaRow.getByRole('button', { name: 'Edit' })).toBeDisabled()
  await expectPublicServices(page, backendUrl, formulaTitle, false)

  await createService(page, {
    title: heatingTitle,
    description: 'Browser-created heating service',
    pricingType: 'Per square meter',
    priceUsd: '2.50',
  })
  await createService(page, {
    title: boilerTitle,
    description: 'Browser-created boiler room service',
    pricingType: 'Fixed',
    priceUsd: '200',
  })

  await expect(page.getByText(heatingTitle)).toBeVisible()
  await expect(page.getByText(boilerTitle)).toBeVisible()
  await expect(page.getByText('8 Br/m2')).toBeVisible()

  await page.getByRole('button', { name: `Move ${boilerTitle} up` }).click()
  await expect
    .poll(async () => {
      const rowTexts = await page.locator('tbody tr').allTextContents()
      const boilerIndex = rowTexts.findIndex((text) => text.includes(boilerTitle))
      const heatingIndex = rowTexts.findIndex((text) => text.includes(heatingTitle))

      return boilerIndex >= 0 && heatingIndex >= 0 && boilerIndex < heatingIndex
    })
    .toBe(true)

  const heatingRow = page.locator('tbody tr').filter({ hasText: heatingTitle })
  await heatingRow.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Title').fill(editedHeatingTitle)
  await page.getByLabel('USD price').fill('3')
  await page.getByRole('button', { name: 'Save service' }).click()
  await expect(page.getByText(editedHeatingTitle)).toBeVisible()
  await expect(page.getByText('10 Br/m2')).toBeVisible()

  const editedHeatingRow = page.locator('tbody tr').filter({ hasText: editedHeatingTitle })
  await editedHeatingRow.getByRole('switch', { name: `Public visibility for ${editedHeatingTitle}` }).click()
  await expectPublicServices(page, backendUrl, editedHeatingTitle, false)
  await expectPublicServices(page, backendUrl, boilerTitle, true)

  await editedHeatingRow.getByRole('switch', { name: `Public visibility for ${editedHeatingTitle}` }).click()
  await expectPublicServices(page, backendUrl, editedHeatingTitle, true)

  await editedHeatingRow.getByRole('button', { name: 'Archive' }).click()
  await editedHeatingRow.getByRole('button', { name: 'Confirm archive' }).click()
  await expect(editedHeatingRow.getByText('Archived')).toBeVisible()
  await expectPublicServices(page, backendUrl, editedHeatingTitle, false)
})

async function createService(
  page: Page,
  input: {
    title: string
    description: string
    pricingType: 'Fixed' | 'Per square meter'
    priceUsd: string
  },
) {
  await page.getByRole('button', { name: 'Add service' }).first().click()
  await page.getByLabel('Title').fill(input.title)
  await page.getByLabel('Description').fill(input.description)
  await page.getByRole('combobox', { name: 'Pricing type' }).click()
  await page.getByRole('option', { name: input.pricingType }).click()
  await page.getByLabel('USD price').fill(input.priceUsd)
  await page.getByRole('button', { name: 'Save service' }).click()
  await expect(page.getByText(input.title)).toBeVisible()
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
