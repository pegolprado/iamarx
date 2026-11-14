import { expect, test } from '@playwright/test'

// Regressão: ERB salva com azimute 0 (zero) tem que desenhar o setor e o
// azimute 0 tem que sobreviver no link de compartilhamento (não pode virar
// "sem azimute"). Antes, o 0 era tratado como vazio e o link saía só com o ponto.
test('ERB com azimute 0 desenha o setor e sobrevive ao link', async ({ page, browser }) => {
  test.setTimeout(90000)
  await page.goto('/erb')
  await page.click('button[aria-label="Abrir painel"]')
  await page.click('button:has-text("Adicionar")')
  await page.click('text=Antena / ERB (digitar)')
  await page.getByLabel('Nome *').fill('8513 - 10h41')
  await page.getByLabel('Latitude *').fill('-23.5000')
  await page.getByLabel('Longitude *').fill('-46.6000')
  await page.getByLabel('Azimute (°)').fill('0')
  await page.click('button:has-text("Salvar")')
  // a linha vermelha do azimute (setor) é desenhada mesmo com az=0.
  // O overlay SVG do Leaflet é reportado como "hidden" pelo Playwright, então
  // conferimos a existência do path (count), não a visibilidade.
  await expect
    .poll(async () => page.locator('path[stroke="#ef4444"]').count(), { timeout: 20000 })
    .toBeGreaterThan(0)
  if (await page.locator('button[aria-label="Abrir painel"]').isVisible()) await page.click('button[aria-label="Abrir painel"]')
  await page.waitForTimeout(800)
  const link = await page.getByLabel('Link desta análise').inputValue()
  // reabre o link numa aba nova: o leque tem que aparecer de novo (az=0 preservado)
  const ctx = await browser.newContext()
  const other = await ctx.newPage()
  await other.goto(link)
  await expect
    .poll(async () => other.locator('path[stroke="#ef4444"]').count(), { timeout: 20000 })
    .toBeGreaterThan(0)
  await ctx.close()
})
