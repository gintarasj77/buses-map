import { expect, test } from '@playwright/test'

const gpsFeedBody = '0,117,25279700,54687200,32,180,bus-117-a\n'
const polyline = '_p~iF~ps|U_ulLnnqC_mqNvxq`@'
const routeBody = `a-b\n${polyline}\nb-a\n${polyline}\n`

test('app loads, map renders, and api endpoints respond', async ({ page }) => {
  await page.route('**/api/gps', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      body: gpsFeedBody,
      headers: {
        etag: '"smoke-gps-etag"',
        'last-modified': 'Mon, 01 Jan 2024 00:00:00 GMT',
      },
    })
  })

  await page.route('**/api/route', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      body: routeBody,
    })
  })

  const gpsResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/gps') && response.request().method() === 'GET',
  )
  const routeResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/route') && response.request().method() === 'GET',
  )

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Bus 117' })).toBeVisible()
  await expect(page.locator('.leaflet-container')).toBeVisible()

  const gpsResponse = await gpsResponsePromise
  const routeResponse = await routeResponsePromise
  expect(gpsResponse.status()).toBe(200)
  expect(routeResponse.status()).toBe(200)

  const [gpsStatus, routeStatus] = await Promise.all([
    page.evaluate(async () => (await fetch('/api/gps')).status),
    page.evaluate(async () => (await fetch('/api/route')).status),
  ])
  expect(gpsStatus).toBe(200)
  expect(routeStatus).toBe(200)
})
