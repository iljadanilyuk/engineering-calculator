import type { Page } from '@playwright/test'

import { e2eAdminEmail, e2ePassword, expect, test } from '../helpers/test'

const smokeViewports = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'tablet-1024', width: 1024, height: 768 },
  { name: 'mobile-390', width: 390, height: 844 },
]

test('admin V2 shell visual smoke has stable viewport overflow behavior', async ({ page }) => {
  const backendUrl = process.env.E2E_BACKEND_URL
  if (!backendUrl) throw new Error('E2E_BACKEND_URL is required')

  const accessToken = await loginAdminApi(backendUrl)
  await setExchangeRate(backendUrl, accessToken)

  const suffix = Date.now().toString(36)
  const service = await createService(backendUrl, accessToken, {
    title: `E2E V2 Smoke Heating ${suffix}`,
    pricingType: 'per_sqm',
    priceUsdCents: 300,
    sortOrder: 220,
  })
  const clientName = `E2E V2 Smoke Client ${suffix}`
  await submitCalculation(backendUrl, {
    clientName,
    clientPhone: `+375 29 ${String(Date.now()).slice(-7)}`,
    objectName: `E2E V2 House ${suffix}`,
    calculation: {
      areaSqm: '118',
      selectedServiceIds: [service.id],
    },
  })
  const lead = await findAdminLead(backendUrl, accessToken, clientName)

  await page.goto('/app')
  await page.getByLabel('Эл. почта').fill(e2eAdminEmail)
  await page.getByLabel('Пароль').fill(e2ePassword)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('heading', { name: 'Рабочий стол' })).toBeVisible()

  for (const viewport of smokeViewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })

    await smokePage(page, '/app', 'Рабочий стол', `${viewport.name}-dashboard`)

    await page.goto('/app/leads')
    await expect(page.getByRole('heading', { name: 'Заявки', exact: true })).toBeVisible()
    if (viewport.width >= 1024) {
      await page.getByRole('button', { name: 'Канбан' }).click()
      await expect(page.getByLabel('Канбан проектов')).toBeVisible()
    }
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: `e2e/.artifacts/admin-v2-${viewport.name}-projects.png`, fullPage: true })

    await smokePage(page, '/app/tasks', 'Задачи', `${viewport.name}-tasks`)
    await smokePage(page, `/app/leads/${lead.id}`, lead.clientName, `${viewport.name}-record`)
    await smokePage(page, '/app/services', 'Услуги и цены', `${viewport.name}-services`)
    await smokePage(page, '/app/blog', 'Блог и публикации', `${viewport.name}-blog`)
    await smokeQuestionnaireBuilder(page, `${viewport.name}-questionnaire`)

    if (viewport.width < 900) {
      await page.goto('/app')
      await page.getByRole('button', { name: 'Открыть меню' }).click()
      await page.getByRole('link', { name: 'Задачи' }).click()
      await expect(page.getByRole('heading', { name: 'Задачи' })).toBeVisible()
      await expectNoHorizontalOverflow(page)
    }
  }
})

async function smokePage(page: Page, path: string, heading: string, screenshotName: string) {
  await page.goto(path)
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `e2e/.artifacts/admin-v2-${screenshotName}.png`, fullPage: true })
}

async function smokeQuestionnaireBuilder(page: Page, screenshotName: string) {
  await page.goto('/app/questionnaire')
  await expect(page.getByLabel('Конструктор опросника')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Структура' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('switch', { name: /Отключить вопрос|Включить вопрос/ }).first()).toBeVisible()

  if (screenshotName === 'desktop-1440-questionnaire') {
    await exerciseQuestionnaireControls(page)
  }

  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `e2e/.artifacts/admin-v2-${screenshotName}.png`, fullPage: true })
}

async function exerciseQuestionnaireControls(page: Page) {
  const disableSection = page.getByRole('switch', { name: /Отключить раздел/ }).first()
  await disableSection.click()
  const enableSection = page.getByRole('switch', { name: /Включить раздел/ }).first()
  await expect(enableSection).toBeVisible()
  await enableSection.click()
  await expect(page.getByRole('switch', { name: /Отключить раздел/ }).first()).toBeVisible()

  const disableQuestion = page.getByRole('switch', { name: 'Отключить вопрос client_email' }).first()
  await disableQuestion.click()
  const enableQuestion = page.getByRole('switch', { name: 'Включить вопрос client_email' }).first()
  await expect(enableQuestion).toBeVisible()
  await enableQuestion.click()
  await expect(page.getByRole('switch', { name: 'Отключить вопрос client_email' }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Опустить вопрос client_email' }).click()
  await expect(page.getByRole('button', { name: 'Поднять вопрос client_email' })).toBeEnabled()
  await page.getByRole('button', { name: 'Поднять вопрос client_email' }).click()
  await expect(page.getByRole('button', { name: 'Опустить вопрос client_email' })).toBeEnabled()

  await page.getByTestId('question-drag-client_email').dragTo(page.getByTestId('question-dropzone-end'))
  await expect(page.getByRole('button', { name: 'Поднять вопрос client_email' })).toBeEnabled()
  await page.getByTestId('question-drag-client_email').dragTo(page.getByTestId('question-card-object_address'))
  await expect(page.getByRole('button', { name: 'Опустить вопрос client_email' })).toBeEnabled()

  await page.getByRole('button', { name: /^2\. Дом и исходные материалы/ }).click()
  await page.getByLabel(/Вопросы раздела/).getByRole('button', { name: /материалы/i }).first().click()

  const disableOption = page.getByRole('switch', { name: 'Отключить вариант PARTIAL' }).first()
  await disableOption.click()
  const enableOption = page.getByRole('switch', { name: 'Включить вариант PARTIAL' }).first()
  await expect(enableOption).toBeVisible()
  await enableOption.click()
  await expect(page.getByRole('switch', { name: 'Отключить вариант PARTIAL' }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Опустить вариант FULL' }).click()
  await expect(page.getByRole('button', { name: 'Поднять вариант FULL' })).toBeEnabled()
  await page.getByRole('button', { name: 'Поднять вариант FULL' }).click()
  await expect(page.getByRole('button', { name: 'Опустить вариант FULL' })).toBeEnabled()

  await page.getByTestId('option-drag-FULL').dragTo(page.getByTestId('option-dropzone-end'))
  await expect(page.getByRole('button', { name: 'Поднять вариант FULL' })).toBeEnabled()
  await page.getByTestId('option-drag-FULL').dragTo(page.getByTestId('option-row-PARTIAL'))
  await expect(page.getByRole('button', { name: 'Опустить вариант FULL' })).toBeEnabled()
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    )
    .toBe(true)
}

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

async function setExchangeRate(backendUrl: string, accessToken: string) {
  const response = await fetch(`${backendUrl}/api/admin/settings/exchange-rate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      source: 'manual',
      usdToBynRate: '3.2000',
      asOf: '2026-07-20T00:00:00.000Z',
    }),
  })

  expect(response.status).toBe(200)
}

async function createService(
  backendUrl: string,
  accessToken: string,
  payload: {
    title: string
    pricingType: 'fixed' | 'per_sqm'
    priceUsdCents: number
    sortOrder: number
  },
) {
  const response = await fetch(`${backendUrl}/api/admin/services`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      ...payload,
      isActive: true,
      isPublic: true,
    }),
  })
  const body = await response.json() as { service: { id: string } }

  expect(response.status).toBe(201)
  return body.service
}

async function submitCalculation(
  backendUrl: string,
  payload: {
    clientName: string
    clientPhone: string
    objectName: string
    calculation: {
      areaSqm: string
      selectedServiceIds: string[]
    }
  },
) {
  const response = await fetch(`${backendUrl}/api/public/calculations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': `pzk-e2e-v2-smoke-${Date.now()}`,
    },
    body: JSON.stringify({
      idempotencyKey: `e2e-v2-smoke-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      ...payload,
      consentAccepted: true,
    }),
  })
  await response.json()

  expect(response.status).toBe(201)
}

async function findAdminLead(backendUrl: string, accessToken: string, clientName: string) {
  const response = await fetch(
    `${backendUrl}/api/admin/calculations?limit=10&search=${encodeURIComponent(clientName)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )
  const body = await response.json() as {
    calculations: Array<{
      id: string
      clientName: string
    }>
  }

  expect(response.status).toBe(200)
  const lead = body.calculations.find((candidate) => candidate.clientName === clientName)
  expect(lead).toBeTruthy()
  return lead!
}
