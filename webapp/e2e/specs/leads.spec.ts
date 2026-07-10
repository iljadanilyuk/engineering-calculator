import { e2eAdminEmail, e2ePassword, expect, test } from '../helpers/test'

test('manages submitted calculation leads in admin mini-crm', async ({ page }) => {
  const backendUrl = process.env.E2E_BACKEND_URL
  if (!backendUrl) throw new Error('E2E_BACKEND_URL is required')

  const accessToken = await loginAdminApi(backendUrl)
  await setExchangeRate(backendUrl, accessToken)

  const suffix = Date.now().toString(36)
  const service = await createService(backendUrl, accessToken, {
    title: `E2E Lead Heating ${suffix}`,
    pricingType: 'per_sqm',
    priceUsdCents: 275,
    sortOrder: 100,
  })
  const leadName = `E2E Lead Client ${suffix}`
  const phoneTail = String(Date.now()).slice(-7).padStart(7, '5')
  const leadPhone = `+375 29 ${phoneTail.slice(0, 3)}-${phoneTail.slice(3, 5)}-${phoneTail.slice(5)}`
  const submission = await submitCalculation(backendUrl, {
    clientName: leadName,
    clientPhone: leadPhone,
    objectName: `E2E House ${suffix}`,
    calculation: {
      areaSqm: '64',
      selectedServiceIds: [service.id],
    },
  })

  await page.goto('/app/leads')
  await page.getByLabel('Email').fill(e2eAdminEmail)
  await page.getByLabel('Password').fill(e2ePassword)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByRole('heading', { name: 'Leads Mini-CRM' })).toBeVisible()

  await page.getByLabel('Search').fill(leadName)
  const leadRow = page.locator('tbody tr').filter({ hasText: leadName })
  await expect(leadRow).toBeVisible()
  await expect(leadRow).toContainText('New')
  await expect(leadRow).toContainText('64 m2')
  await expect(leadRow).toContainText('563 Br')
  await expect(leadRow.getByRole('link', { name: `PDF for ${leadName}` })).toBeVisible()

  await page.getByRole('combobox', { name: 'Status filter' }).click()
  await page.getByRole('option', { name: 'New' }).click()
  await expect(leadRow).toBeVisible()

  await leadRow.getByRole('link', { name: 'Open' }).click()
  const detailRegion = page.getByRole('region', { name: leadName })
  await expect(detailRegion).toBeVisible()
  await expect(page.getByText(`E2E House ${suffix}`)).toBeVisible()
  await expect(page.getByText(`E2E Lead Heating ${suffix}`).first()).toBeVisible()
  await expect(page.getByText('3.2 BYN/USD')).toBeVisible()

  await page.getByRole('combobox', { name: 'Lead status' }).click()
  await page.getByRole('option', { name: 'Contacted' }).click()
  await expect(page.getByText('Status saved')).toBeVisible()

  await page.getByLabel('Notes').fill(`Browser note ${suffix}`)
  await page.getByRole('button', { name: 'Save notes' }).click()
  await expect(page.getByText('Notes saved')).toBeVisible()

  const pdfLink = page.getByRole('link', { name: `Open original PDF for ${leadName}` }).first()
  const href = await pdfLink.getAttribute('href')
  expect(href).toContain(submission.proposal.publicToken)
  expect(href).toContain('/pdf')

  const pdfResponse = await page.request.get(href!)
  expect(pdfResponse.status()).toBe(200)
  expect(pdfResponse.headers()['x-proposal-checksum-sha256']).toMatch(/^[a-f0-9]{64}$/)
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
      asOf: '2026-07-10T00:00:00.000Z',
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
      'User-Agent': `pzk-e2e-lead-${Date.now()}`,
    },
    body: JSON.stringify({
      idempotencyKey: `e2e-lead-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      ...payload,
      consentAccepted: true,
    }),
  })
  const body = await response.json() as {
    calculation: {
      proposal: {
        publicToken: string
      }
    }
  }

  expect(response.status).toBe(201)
  return body.calculation
}
