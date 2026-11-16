import { expect, test } from '@playwright/test'

// Planilha com 2 ERBs e eventos em 2 dias, de dia e de noite.
const CSV = [
  'Tipo;ID Evento;Evento;Alvo;Data do evento;Célula;Latitude;Longitude;Azimute',
  // ERB A — noite/madrugada
  'Localização;1;ev;11999990000;16/10/2026 02:30;C1;-23.5000;-46.6000;90',
  'Localização;2;ev;11999990000;16/10/2026 23:40;C1;-23.5000;-46.6000;90',
  'Localização;3;ev;11999990000;17/10/2026 03:00;C1;-23.5000;-46.6000;90',
  // ERB B — horário comercial
  'Localização;4;ev;11999990000;16/10/2026 10:00;C2;-23.5600;-46.6300;270',
  'Localização;5;ev;11999990000;16/10/2026 14:20;C2;-23.5600;-46.6300;270',
  'Localização;6;ev;11999990000;17/10/2026 09:00;C2;-23.5600;-46.6300;270',
].join('\n')

test('Mapas ERB: filtro por dia e hora recorta os eventos e atualiza o link', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/erb')
  await page.setInputFiles('input[type=file][accept=".xlsx,.csv,.txt"]', { name: 'extrato.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf-8') })
  if (await page.locator('button[aria-label="Abrir painel"]').isVisible()) await page.click('button[aria-label="Abrir painel"]')

  // a seção de filtro aparece com os dias disponíveis
  await expect(page.getByText('Filtrar por dia e hora')).toBeVisible({ timeout: 20000 })
  // espera o link assentar (debounce de 250 ms) antes de comparar
  await expect.poll(async () => page.getByLabel('Link desta análise').inputValue(), { timeout: 20000 }).toContain('#')
  const linkBefore = await page.getByLabel('Link desta análise').inputValue()

  // recorte: só o dia 16/10, só a noite (18–06) → 2 eventos da ERB A
  await page.getByRole('button', { name: /16\/10/ }).click()
  await page.getByRole('button', { name: /Noite/ }).click()

  await expect(page.getByText(/Mostrando/)).toContainText('1 de 2 ERBs')
  await expect(page.getByText(/Mostrando/)).toContainText('de 6 eventos')

  // o link mudou com o recorte
  await expect.poll(async () => page.getByLabel('Link desta análise').inputValue()).not.toBe(linkBefore)

  // limpar volta ao estado cheio
  await page.getByRole('button', { name: 'limpar' }).click()
  await expect(page.getByText(/Mostrando/)).toHaveCount(0)
  await expect.poll(async () => page.getByLabel('Link desta análise').inputValue()).toBe(linkBefore)
})
