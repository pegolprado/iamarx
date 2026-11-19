import { expect, test } from '@playwright/test'

// Extrato de chamadas da operadora (formato Vivo) importado no app público de ERBs:
// deve voltar as antenas geolocalizadas no mapa, no padrão já existente.
async function workbook(): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const w1 = wb.addWorksheet('Relatório de chamadas')
  ;[
    ['', 'Linha:11999990000'],
    [''],
    ['Data', 'Hora', 'Chamador', 'IMEI Chamador', 'Chamado', 'IMEI Chamado', 'Desc', 'Hora desc', 'Durac', 'Status', 'Tra', 'GMT Origem', 'GMT Destino', 'Local Origem', 'Local Destino', 'Tec Origem', 'Tec Destino'],
    ['01/06/2026', '10:15:00', '', '', '11999990000', '', '', '10:15:30', '30', 'Completada', 'Voz', '', '-3', '', '724-10-41011-41654', '', 'GSM'],
    ['01/06/2026', '22:40:00', '', '', '11999990000', '', '', '22:41:00', '60', 'Completada', 'Voz', '', '-3', '', '724-10-40211-39544', '', 'GSM'],
    ['02/06/2026', '09:05:00', '', '', '11999990000', '', '', '', '0', 'Entregue', 'TORP.', '', '-3', '', '724-10-99999-00000', '', 'LTE'],
  ].forEach((r) => w1.addRow(r))
  const w2 = wb.addWorksheet('Endereço das ERBs')
  ;[
    ['', 'Linha:11999990000'],
    [''],
    ['CGI', 'CCC', 'Sigla', 'ERB', 'Sigla', 'Set', 'Azi', 'Tecnologia', 'Latitude', 'Longitude', 'UF', 'Cidade', 'Bairro', 'Endereço'],
    ['724-10-41011-41654', '0', 'MWTCTPD', '4165', 'WPRZ1', '4', '305', 'WCDMA', '-23-34-34,43', '-46-38-25,41', 'SP', 'SÃO PAULO', 'VILA MARIANA', 'RUA VERGUEIRO, 1571'],
    ['724-10-40211-39544', '0', 'MWUVVJC', '3954', 'WMFB1', '4', '290', 'WCDMA', '-23-31-46,93', '-46-39-50,91', 'SP', 'SÃO PAULO', 'BARRA FUNDA', 'ALAMEDA OLGA, 422'],
    ['724-10-99999-00000', '0', '', '', '', '', '', '', '', '', '', 'CADASTRO NAO ENCONTRADO', '', 'x'],
  ].forEach((r) => w2.addRow(r))
  return Buffer.from(await wb.xlsx.writeBuffer())
}

test('Mapas ERB público: importa extrato da operadora e plota as ERBs', async ({ page }) => {
  test.setTimeout(120000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/erb')
  await page.click('button[aria-label="Abrir painel"]')
  const buf = await workbook()
  await page.setInputFiles('input[type=file][accept=".xlsx,.csv,.txt"]', { name: 'consulta.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: buf })

  // antenas plotadas no mapa (setor/azimute) e grupo com o número da linha
  await expect(page.locator('.leaflet-interactive, .leaflet-marker-icon').first()).toBeVisible({ timeout: 25000 })
  await expect(page.getByText('11999990000').first()).toBeVisible()
  // o filtro por dia e hora (dos horários dos eventos) aparece
  await expect(page.getByText('Filtrar por dia e hora')).toBeVisible()
  // gera o link da análise
  await expect.poll(async () => page.getByLabel('Link desta análise').inputValue(), { timeout: 20000 }).toContain('#')

  expect(errors, errors.join('\n')).toEqual([])
})
