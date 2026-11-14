import { expect, test } from '@playwright/test'
const CSV = [
  'Tipo;ID Evento;Evento;Alvo;Data do evento;Célula;Latitude;Longitude;Azimute',
  // ERB "casa" — eventos de madrugada/noite
  'Localização;1;ev;11999990000;16/10/2026 02:30;C1;-23.5000;-46.6000;90',
  'Localização;2;ev;11999990000;16/10/2026 03:10;C1;-23.5000;-46.6000;90',
  'Localização;3;ev;11999990000;16/10/2026 23:40;C1;-23.5000;-46.6000;90',
  // ERB "trabalho" — horário comercial
  'Localização;4;ev;11999990000;16/10/2026 10:00;C2;-23.5600;-46.6300;270',
  'Localização;5;ev;11999990000;16/10/2026 14:20;C2;-23.5600;-46.6300;270',
  'Localização;6;ev;11999990000;16/10/2026 16:05;C2;-23.5600;-46.6300;270',
].join('\n')

test('Mapas ERB: residência×trabalho e link curto', async ({ page, browser }) => {
  test.setTimeout(120000)
  await page.goto('/erb')
  await page.setInputFiles('input[type=file][accept=".xlsx,.csv,.txt"]', { name: 'extrato.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf-8') })
  // selos de provável residência e trabalho
  await expect(page.locator('.hw-badge.hw-home')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.hw-badge.hw-work')).toBeVisible()
  // gera link curto
  if (await page.locator('button[aria-label="Abrir painel"]').isVisible()) await page.click('button[aria-label="Abrir painel"]')
  await page.getByRole('button', { name: /Gerar link curto/ }).click()
  await expect(page.getByText(/#s[A-Za-z0-9]{6,}/)).toBeVisible({ timeout: 20000 })
  const shortUrl = (await page.locator('.font-mono.text-indigo-600').textContent())!.trim()
  expect(shortUrl).toMatch(/#s[A-Za-z0-9]{6,16}$/)
  // abre o link curto numa nova aba → deve renderizar as ERBs
  const ctx = await browser.newContext()
  const other = await ctx.newPage()
  await other.goto(shortUrl)
  await expect(other.locator('.leaflet-marker-icon').first()).toBeVisible({ timeout: 30000 })
  await ctx.close()
})
