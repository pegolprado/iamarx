import { expect, type Page, test } from '@playwright/test'

const EMAIL = process.env.MARX_E2E_EMAIL ?? 'admin@marx.local'
const PASSWORD = process.env.MARX_E2E_PASSWORD ?? 'Teste!Marx2026'

async function login(page: Page) {
  await page.goto('/login')
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('form button.btn-primary')
  await expect(page.getByRole('link', { name: 'Ferramentas INVMARX' })).toBeVisible()
}

// workbook sintético no formato Vivo (sem dados reais)
async function workbook(): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const w1 = wb.addWorksheet('Relatório de chamadas')
  ;[
    ['', 'SEGREDO DE JUSTIÇA'],
    ['', 'Linha:11999990000'],
    [''],
    ['Data', 'Hora', 'Chamador', 'IMEI Chamador', 'Chamado', 'IMEI Chamado', 'Desc', 'Hora desc', 'Durac', 'Status', 'Tra', 'GMT Origem', 'GMT Destino', 'Local Origem', 'Local Destino', 'Tec Origem', 'Tec Destino'],
    ['01/06/2026', '10:15:00', '', '', '11999990000', '', '', '10:15:30', '30', 'Completada', 'Voz', '', '-3', '', '724-10-41011-41654', '', 'GSM'],
    ['01/06/2026', '22:40:00', '11999990000', '', '11988887777', '', '', '22:41:00', '60', 'Completada', 'Voz', '-3', '', '724-10-41011-41654', '', 'GSM', ''],
    ['02/06/2026', '09:05:00', '11999990000', '', '11988887777', '', '', '', '0', 'Entregue', 'TORP.', '-3', '', '724-10-99999-00000', '', 'LTE', ''],
    ['02/06/2026', '14:00:00', '', '', '11999990000', '', '', '14:00:02', '2', 'Nao Compl.', 'Voz', '', '', '', '724-10-41011-41654', '', 'GSM'],
  ].forEach((r) => w1.addRow(r))
  const w2 = wb.addWorksheet('Endereço das ERBs')
  ;[
    ['', 'SEGREDO DE JUSTIÇA'],
    ['', 'Linha:11999990000'],
    [''],
    ['CGI', 'CCC', 'Sigla', 'ERB', 'Sigla', 'Set', 'Azi', 'Tecnologia', 'Latitude', 'Longitude', 'UF', 'Cidade', 'Bairro', 'Endereço'],
    ['724-10-41011-41654', '0', 'MWTCTPD', '4165', 'WPRZ1', '4', '305', 'WCDMA', '-23-34-34,43', '-46-38-25,41', 'SP', 'SÃO PAULO', 'VILA MARIANA', 'RUA VERGUEIRO, 1571'],
    ['724-10-99999-00000', '0', '', '', '', '', '', '', '', '', '', 'CADASTRO NAO ENCONTRADO', '', 'Dta.Chamada.: 2026/06/02'],
  ].forEach((r) => w2.addRow(r))
  return Buffer.from(await wb.xlsx.writeBuffer())
}

test('Pretérita — Operadoras: importa extrato, mostra painel, números e mapa', async ({ page }) => {
  test.setTimeout(120000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await login(page)
  await page.goto('/invmarx/preterita')
  await expect(page.getByRole('heading', { name: 'Pretérita — Operadoras' })).toBeVisible()

  const buf = await workbook()
  await page.setInputFiles('input[type=file][accept=".xlsx,.csv,.txt"]', { name: 'consulta.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: buf })
  await page.getByRole('button', { name: 'Processar' }).click()

  // indicadores
  await expect(page.getByText('Registros', { exact: true })).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('11999990000').first()).toBeVisible()
  // painel com gráficos
  await expect(page.getByText('Registros por dia')).toBeVisible()

  // filtro por tipo SMS → 1 registro; volta ao limpar
  await page.getByText('Linha do tempo', { exact: true }).click()
  await expect(page.getByText(/Eventos \(/)).toBeVisible()

  // Números: a contraparte 11988887777 aparece
  await page.getByText('Números', { exact: true }).click()
  await expect(page.getByText('11988887777').first()).toBeVisible()

  // ERBs: uma localizada e uma sem coordenada
  await page.getByText('ERBs', { exact: true }).click()
  await expect(page.getByText('sem coordenada').first()).toBeVisible()

  // Mapa: plota a ERB com coordenada
  await page.getByText('Mapa', { exact: true }).click()
  await expect(page.locator('.leaflet-marker-icon, .leaflet-interactive').first()).toBeVisible({ timeout: 20000 })

  // Relatório automático fundamentado
  await page.getByText('Relatório', { exact: true }).click()
  await expect(page.getByText(/Foram analisados/)).toBeVisible()

  expect(errors, errors.join('\n')).toEqual([])
})
