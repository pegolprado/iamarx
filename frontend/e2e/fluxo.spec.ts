import { expect, type Page, test } from '@playwright/test'
import { waRecordsHtml } from '../src/engine/waSample'

const EMAIL = process.env.MARX_E2E_EMAIL ?? 'admin@marx.local'
const PASSWORD = process.env.MARX_E2E_PASSWORD ?? 'Teste!Marx2026'

async function login(page: Page) {
  await page.goto('/login')
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('form button.btn-primary')
  await expect(page.getByText('WORKSPACE INVESTIGATIVO')).toBeVisible()
}

// telas agrupadas: [grupo na barra principal, tela na sub-barra]
const SUB: Record<string, [string, string]> = {
  Alvos: ['Arquivos', 'Alvos'],
  Importações: ['Arquivos', 'Importações'],
  Qualidade: ['Arquivos', 'Qualidade'],
  Eventos: ['Bilhetagem', 'Eventos'],
  Contatos: ['Bilhetagem', 'Contatos'],
  Estatística: ['Bilhetagem', 'Padrões e estatística'],
  'Linha do tempo': ['Bilhetagem', 'Linha do tempo'],
  Comparar: ['Vínculos', 'Comparação manual'],
  Cruzamento: ['Vínculos', 'Cruzamento (ajustes)'],
  ERB: ['ERB e mapa', 'Células e resolução'],
  Cadastro: ['ERB e mapa', 'Cadastro de ERB'],
  Mapa: ['ERB e mapa', 'Mapa'],
  WhatsApp: ['WhatsApp e IPs', ''],
}
async function tab(page: Page, label: string) {
  const [group, sub] = SUB[label] ?? [label, '']
  await page.click(`nav[aria-label="Módulos da análise"] >> text="${group}"`)
  if (sub) await page.click(`nav[aria-label="Telas de ${group}"] >> text="${sub}"`)
}

test('fluxo completo: demonstração, telas, exportação e apagamento ao sair', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())
  await login(page)

  await page.click('text=Gerar análise de demonstração')
  await expect(page.getByText('Registros considerados')).toBeVisible()

  for (const t of ['Análise completa', 'Alvos', 'Arquivos', 'Importações', 'Qualidade', 'Eventos', 'Contatos', 'Estatística', 'Linha do tempo', 'WhatsApp', 'Vínculos', 'Comparar', 'Cruzamento', 'ERB', 'Cadastro', 'Mapa', 'Alertas', 'Exportar', 'Assistente']) {
    await tab(page, t)
    await page.waitForTimeout(1200)
    await expect(page.locator('[role=alert]'), `erro na tela ${t}`).toHaveCount(0)
  }

  await tab(page, 'Eventos')
  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Excel")')])
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/)

  await tab(page, 'Exportar')
  await page.selectOption('select >> nth=0', 'full')
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Gerar e baixar")')])
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/)
  await expect(page.getByText('SHA-256 do arquivo')).toBeVisible()

  // nada persistido no navegador
  const storage = await page.evaluate(async () => ({ ls: localStorage.length, ss: sessionStorage.length, idb: (await indexedDB.databases()).length }))
  expect(storage).toEqual({ ls: 0, ss: 0, idb: 0 })

  await page.click('text=Sair e apagar')
  await page.waitForURL(/login/)
  await login(page)
  await page.goto('/analise/arquivos')
  await expect(page.getByText('Nenhum arquivo')).toBeVisible()
  expect(errors).toEqual([])
})

test('carregar arquivo do computador e importar pelo assistente', async ({ page }) => {
  await login(page)
  await page.click('text=Análise atual')
  await tab(page, 'Arquivos')
  const lines = ['Origem;Destino;Data;Hora;Duração;Tipo;LAC;CI']
  for (let i = 0; i < 2000; i++) {
    const other = `(61) 9${String(1000 + (i % 37)).padStart(4, '0')}-${String(i).padStart(4, '0')}`
    const out = i % 2 === 0
    lines.push(`${out ? '(61) 99876-5432' : other};${out ? other : '(61) 99876-5432'};${String(1 + (i % 28)).padStart(2, '0')}/04/2026;${String(i % 24).padStart(2, '0')}:10:00;${i % 300};${out ? 'Originada' : 'Recebida'};1100;${20000 + (i % 9)}`)
  }
  await page.setInputFiles('input[type=file]', { name: 'extrato.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n'), 'utf-8') })
  await page.waitForURL(/importar/)
  for (let i = 0; i < 4; i++) {
    await page.click('button:has-text("Avançar")')
    await page.waitForTimeout(500)
  }
  await page.click('button:has-text("Confirmar e processar")')
  await expect(page.getByText('Abrir registros importados')).toBeVisible()
  await expect(page.getByText('2.000').first()).toBeVisible()
})

test('administrador cadastra usuário, que ativa a conta pelo link e entra', async ({ page, browser }) => {
  await login(page)
  await page.click('text=Usuários')
  await page.click('button:has-text("Novo usuário")')
  const novo = `ana.${Date.now()}@marx.local`
  const modal = page.locator('form').last()
  await modal.locator('input').nth(0).fill('Ana Teste')
  await modal.locator('input[type=email]').fill(novo)
  await page.click('button:has-text("Criar e gerar link de ativação")')
  const link = (await page.locator('code').first().textContent())!.trim()
  expect(link).toContain('/redefinir-senha?token=')

  const other = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage()
  await other.goto(link)
  await expect(other.getByText(novo)).toBeVisible()
  await other.fill('input[autocomplete=new-password] >> nth=0', 'SenhaDaAna2026')
  await other.fill('input[autocomplete=new-password] >> nth=1', 'SenhaDaAna2026')
  await other.click('button:has-text("Salvar senha")')
  await expect(other.getByText('Senha definida')).toBeVisible()
  await other.goto('/login')
  await other.fill('input[type=email]', novo)
  await other.fill('input[type=password]', 'SenhaDaAna2026')
  await other.click('form button.btn-primary')
  await expect(other.getByText('WORKSPACE INVESTIGATIVO')).toBeVisible()
  await expect(other.getByText('Usuários', { exact: true })).toHaveCount(0)
})

test('ocultar números na tela e bloquear a tela sem perder a análise', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await login(page)
  await page.click('text=Gerar análise de demonstração')
  await expect(page.getByText('Registros considerados')).toBeVisible()
  await tab(page, 'Contatos')
  await expect(page.locator('table tbody tr').first()).toBeVisible()
  await page.click('button:has-text("Ocultar números")')
  await expect(page.locator('table tbody').getByText(/\(61\) 9••••-••\d\d/).first()).toBeVisible()
  await page.click('button:has-text("Números ocultos")')
  await expect(page.locator('table tbody').getByText(/•/)).toHaveCount(0)

  await page.click('button:has-text("Bloquear tela")')
  await expect(page.getByRole('dialog', { name: 'Tela bloqueada' })).toBeVisible()
  await expect(page.getByText('Análise de contatos')).toBeHidden()
  await page.fill('input[autocomplete=current-password]', 'senha-errada-123')
  await page.click('button:has-text("Desbloquear")')
  await expect(page.getByRole('alert')).toBeVisible()
  await page.fill('input[autocomplete=current-password]', PASSWORD)
  await page.click('button:has-text("Desbloquear")')
  await expect(page.getByText('Análise de contatos')).toBeVisible()
  await expect(page.locator('table tbody tr').first()).toBeVisible()
})

test('WhatsApp Records: importação automática, IPs em comum, grupos e exportação', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await login(page)
  // demonstração já traz o WhatsApp do alvo A e IP de dados do alvo B em comum
  await page.click('text=Gerar análise de demonstração')
  await expect(page.getByText('Registros considerados')).toBeVisible()
  await tab(page, 'WhatsApp')
  await expect(page.getByText('Relatórios carregados')).toBeVisible()
  await page.click('[role=tablist] >> text=IPs em comum')
  await expect(page.getByText('10.20.30.40').first()).toBeVisible()
  await page.click('[role=tablist] >> text=Grupos')
  await expect(page.getByText('120363012345678901@g.us')).toBeVisible()
  const [x] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Excel")')])
  expect(x.suggestedFilename()).toMatch(/grupos.*\.xlsx$/i)

  // carregar outro records.html pela tela de Arquivos: reconhecido e importado sem mapeamento
  await tab(page, 'Arquivos')
  const html = waRecordsHtml({ account: '5561977776666' })
  await page.setInputFiles('input[type=file]', { name: 'records.html', mimeType: 'text/html', buffer: Buffer.from(html, 'utf-8') })
  await expect(page.getByText(/WhatsApp Records de \+5561977776666/)).toBeVisible()
  await expect(page.getByText('WhatsApp Records', { exact: true }).first()).toBeVisible()
  await tab(page, 'Eventos')
  await page.click('[role=tablist] >> text=WhatsApp')
  await expect(page.getByText(/WhatsApp: msg (enviada|recebida)/).first()).toBeVisible()
})

test('análise completa e vínculos: tudo calculado de uma vez a partir da importação', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())
  await login(page)
  await page.click('text=Gerar análise de demonstração')
  await expect(page.getByText('Registros considerados')).toBeVisible()

  await tab(page, 'Análise completa')
  const achados = page.getByRole('list', { name: 'Principais achados' })
  await expect(achados).toBeVisible({ timeout: 60_000 })
  await expect(achados.getByText(/em comum entre alvos/)).toBeVisible()
  await expect(achados.getByText(/IPs? usados? por mais de um alvo/)).toBeVisible()
  await expect(page.getByText('Contatos mais frequentes')).toBeVisible()
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Relatório PDF")')])
  expect(pdf.suggestedFilename()).toMatch(/analise_completa.*\.pdf$/i)

  // achado leva direto ao resultado detalhado na análise de vínculos
  await achados.getByText(/em comum entre alvos/).click()
  await expect(page.getByRole('heading', { name: 'Análise de vínculos' })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Contatos em comum/, selected: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Contatos em comum entre alvos' })).toBeVisible()
  await expect(page.locator('section table tbody tr').first()).toBeVisible()
  for (const t of ['Recíprocas', 'Contato direto', 'Coincidências', 'Células em comum', 'Atividade dos alvos', 'Cruzamento multifonte', 'IPs e grupos', 'Todas as conexões']) {
    await page.click(`[role=tablist] >> text=${t}`)
    await expect(page.locator('[role=alert]'), `erro na aba ${t}`).toHaveCount(0)
  }
  await page.click('[role=tablist] >> text=Cruzamento multifonte')
  const [x] = await Promise.all([page.waitForEvent('download'), page.locator('section').filter({ hasText: 'Cruzamento multifonte' }).last().locator('button:has-text("Excel")').click()])
  expect(x.suggestedFilename()).toMatch(/\.xlsx$/)
  expect(errors).toEqual([])
})
