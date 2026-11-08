import { expect, type Page, test } from '@playwright/test'
import { waRecordsHtml } from '../src/engine/waSample'

const EMAIL = process.env.MARX_E2E_EMAIL ?? 'admin@marx.local'
const PASSWORD = process.env.MARX_E2E_PASSWORD ?? 'Teste!Marx2026'

async function login(page: Page) {
  await page.goto('/login')
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('form button.btn-primary')
  await expect(page.getByRole('heading', { name: 'Workspace investigativo' })).toBeVisible()
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

  for (const t of [
    'Análise completa',
    'Alvos',
    'Arquivos',
    'Importações',
    'Qualidade',
    'Eventos',
    'Contatos',
    'Estatística',
    'Linha do tempo',
    'WhatsApp',
    'Vínculos',
    'Comparar',
    'Cruzamento',
    'ERB',
    'Cadastro',
    'Mapa',
    'Alertas',
    'Exportar',
    'Assistente',
  ]) {
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
    lines.push(
      `${out ? '(61) 99876-5432' : other};${out ? other : '(61) 99876-5432'};${String(1 + (i % 28)).padStart(2, '0')}/04/2026;${String(i % 24).padStart(2, '0')}:10:00;${i % 300};${out ? 'Originada' : 'Recebida'};1100;${20000 + (i % 9)}`,
    )
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
  await expect(other.getByRole('heading', { name: 'Workspace investigativo' })).toBeVisible()
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
  await expect(
    page
      .locator('table tbody')
      .getByText(/\(61\) 9••••-••\d\d/)
      .first(),
  ).toBeVisible()
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
  await expect(page.getByText('120363012345678901@g.us').first()).toBeVisible()
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
  await expect(achados.getByText(/contatos em comum entre alvos/)).toBeVisible()
  await expect(achados.getByText(/IPs? usados? por mais de um alvo/)).toBeVisible()
  await expect(page.getByText('Contatos mais frequentes')).toBeVisible()
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Relatório PDF")')])
  expect(pdf.suggestedFilename()).toMatch(/analise_completa.*\.pdf$/i)

  // achado leva direto ao resultado detalhado na análise de vínculos
  await achados.getByText(/contatos em comum entre alvos/).click()
  await expect(page.getByRole('heading', { name: 'Análise de vínculos' })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Contatos em comum/, selected: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Contatos em comum entre alvos' })).toBeVisible()
  await expect(page.locator('section table tbody tr').first()).toBeVisible()
  for (const t of [
    'Recíprocas',
    'Contato direto',
    'Coincidências',
    'Células em comum',
    'Atividade dos alvos',
    'Cruzamento multifonte',
    'IPs, agenda e grupos',
    'Todas as conexões',
  ]) {
    await page.click(`[role=tablist] >> text=${t}`)
    await expect(page.locator('[role=alert]'), `erro na aba ${t}`).toHaveCount(0)
  }
  await page.click('[role=tablist] >> text=Cruzamento multifonte')
  const [x] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('section').filter({ hasText: 'Cruzamento multifonte' }).last().locator('button:has-text("Excel")').click(),
  ])
  expect(x.suggestedFilename()).toMatch(/\.xlsx$/)
  expect(errors).toEqual([])
})

test('WhatsApp: dados cadastrais e agenda; logs de acesso com correlação de IPs', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())
  await login(page)
  await page.click('text=Gerar análise de demonstração')
  await expect(page.getByText('Registros considerados')).toBeVisible()

  await tab(page, 'WhatsApp')
  await page.click('[role=tablist] >> text=Dados cadastrais')
  await expect(page.getByText('alvo.a.demo@example.com').first()).toBeVisible()
  await expect(page.getByText('Fulano Teste').first()).toBeVisible()
  await page.click('[role=tablist] >> text=Agenda')
  const salvos = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Alvos salvos na agenda de outro alvo' }) })
  await expect(salvos.locator('tbody tr')).toHaveCount(3) // A tem B e C; B tem A
  await page.click('[role=tablist] >> text=Grupos')
  await expect(page.getByText('Futebol de quinta (fictício)').first()).toBeVisible()

  await page.click('nav[aria-label="Telas de WhatsApp e IPs"] >> text="Logs de acesso e IPs"')
  const pares = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Pares de fontes com o mesmo IP' }) })
  await expect(pares.getByText('alvo.a.demo@example.com').first()).toBeVisible({ timeout: 30_000 })
  await expect(pares.getByText('google').first()).toBeVisible()

  // carregar um log de acesso pela tela de Arquivos (colunas com nomes em português, sem fuso)
  await tab(page, 'Arquivos')
  await page.selectOption('select >> nth=0', 'access_log')
  await page.fill('input[placeholder="e-mail, usuário ou telefone"]', 'outra.conta@example.com')
  const csv = 'Data;Hora;Endereço IP;Porta\r\n21/03/2026;10:00:00;10.20.30.40;40001\r\n21/03/2026;11:00:00;189.40.50.60:51515\r\n'
  await page.setInputFiles('input[type=file]', { name: 'log_provedor.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') })
  await expect(page.getByText(/Log de acesso: 2 registros de IP/)).toBeVisible()
  await expect(page.getByRole('cell', { name: 'log de acesso (IP)', exact: true })).toHaveCount(2)
  expect(errors).toEqual([])
})

test('extrato de interceptação com coordenadas: importa, plota as ERBs e compartilha o mapa por link com senha', async ({ page, browser }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())
  await login(page)
  await page.click('text=Análise atual')
  await tab(page, 'Arquivos')
  // mesmo layout das exportações de interceptação (dados fictícios)
  const head =
    'Tipo;ID Evento;Evento;Interceptação;Alvo;MONB Referência;Direção;Origem;Destino;Tipo Específico;Data Início;Data do evento;Data Fim;Duração;URL/IP;URL/IP Adicional;Conteúdo;Célula;Comentários;Latitude;Longitude;Azimute;Raio;Localização'
  const rows = [head]
  const sites = [
    ['-23.6177654', '-46.7326240', '120'],
    ['-23.518914', '-46.564651', '240'],
    ['-23.621525', '-46.720736', '290'],
  ]
  for (let i = 0; i < 60; i++) {
    const [la, lo, az] = sites[i % 3]
    const ts = `1${i % 7}/10/2026 ${String(i % 24).padStart(2, '0')}:1${i % 6}:0${i % 10}`
    if (i % 10 === 0)
      rows.push(
        `Interceptação;${900 + i};Chamadas;1.0;5511900000001;;Originada;"11900000001 \n(350000000000001)";970500268;CHAMADA;${ts};${ts};${ts};00:00:13;;;;724-05-35711-6340${i % 3};;${la};${lo};${az};0;`,
      )
    else
      rows.push(`Interceptação;${900 + i};Conexão;1.0;5511900000001;;Recebida;;;ATUALIZAÇÃO STATUS;${ts};${ts};;;10.1.2.${i};;;724-05-42911-2872371${i % 3};;${la};${lo};${az};0;`)
  }
  // escolhido por engano como cadastro de ERB: o sistema reconhece o extrato pelo conteúdo
  await page.selectOption('select >> nth=0', 'erb_registry')
  await page.setInputFiles('input[type=file]', { name: 'interceptacao.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\r\n'), 'utf-8') })
  await page.waitForURL(/importar/)
  await expect(page.getByText(/reconhecido como extrato de eventos/)).toBeVisible()
  for (let i = 0; i < 4; i++) {
    await page.click('button:has-text("Avançar")')
    await page.waitForTimeout(500)
  }
  await page.click('button:has-text("Confirmar e processar")')
  await expect(page.getByText('Abrir registros importados')).toBeVisible()
  await expect(page.locator('text=aceitas').locator('xpath=..')).toContainText('60')

  // tela de localização do alvo (aberta pelo botão do fim da importação)
  await page.click('text=Ver no mapa')
  await expect(page.locator('[data-stat="ERBs no mapa"]')).toContainText('3')
  await expect(page.locator('[data-stat="Total eventos"]')).toContainText('60')
  await expect(page.locator('.erb-tower')).toHaveCount(3)
  const [html] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Exportar HTML")')])
  expect(html.suggestedFilename()).toMatch(/localizacao.*\.html$/)
  await page.click('[role=tab] >> text=Padrões e Estatísticas')
  await expect(page.getByText(/provável residência/)).toBeVisible()
  await expect(page.getByText(/provável trabalho/)).toBeVisible()
  await page.click('[role=tab] >> text=Mapa / Eventos')
  await page.click('button[aria-label="Reproduzir"]')
  await expect(page.locator('.erb-pulse')).toHaveCount(1)
  await page.click('button[aria-label="Parar"]')

  await tab(page, 'Mapa')
  const stat = (l: string) => page.locator(`[data-stat="${l}"]`)
  await expect(stat('Estações no mapa')).toContainText('3')
  await expect(stat('Voz')).toContainText('6')
  await expect(stat('Dados')).toContainText('54')
  await page.click('[role=group][aria-label="Tipo de evento"] >> text=Voz')
  await expect(stat('Dados')).toContainText('0')
  await page.click('[role=group][aria-label="Tipo de evento"] >> text=Todos')

  const [kml] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("KML")')])
  expect(kml.suggestedFilename()).toMatch(/\.kml$/)

  await page.click('button:has-text("Compartilhar mapa")')
  await page.click('button:has-text("Gerar link")')
  const link = await page.locator('textarea[readonly]').inputValue()
  expect(link).toMatch(/\/m#z[01]\./)
  expect(link).not.toContain('724-05')

  // quem recebe abre sem login e sem senha, só clicando
  const ctx = await browser.newContext()
  const other = await ctx.newPage()
  await other.goto(link)
  await other.click('button[aria-label="Abrir painel"]')
  await expect(other.getByText(/3 ERBs/)).toBeVisible()
  await expect(other.getByRole('img', { name: 'Mapa de localização do alvo' })).toBeVisible()
  await expect(other.getByText(/Por /)).toHaveCount(0)
  await ctx.close()
  expect(errors).toEqual([])
})

test('INVMARX: bilhetagem WhatsApp individual, vínculos entre alvos e extrato tempo real', async ({ page, browser }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())
  await login(page)
  const A = '5561900000001'
  const B = '5561900000002'
  const X = '5561980000001'
  const fa = waRecordsHtml({
    account: A,
    messages: [
      ['2026-10-30 12:00:00 UTC', A, [X], null, '45.231.155.194'],
      ['2026-10-30 12:05:00 UTC', X, [A], null, '45.231.155.194'],
      ['2026-10-30 13:00:00 UTC', A, [B], null, '177.10.20.30'],
    ],
    calls: [],
    ips: [['2026-10-30 03:00:00 UTC', '45.231.155.194']],
  })
  const fb = waRecordsHtml({ account: B, messages: [['2026-10-30 15:00:00 UTC', B, [X], null, '177.10.20.30']], calls: [], ips: [] })
  const file = (name: string, html: string) => ({ name, mimeType: 'text/html', buffer: Buffer.from(html, 'utf-8') })

  await page.click('text=Ferramentas INVMARX')
  await expect(page.getByRole('heading', { name: 'INVMARX' })).toBeVisible()
  await page.click('main >> text=Bilhetagem WhatsApp')
  await page.setInputFiles('input[type=file][accept=".html,.htm,.zip,.txt"]', [file('a.html', fa)])
  await page.click('button:has-text("Processar e analisar dados")')
  await expect(page.getByText('Resumo da análise')).toBeVisible()
  await expect(page.getByText('PROXER TELECOMUNICACOES LTDA ME').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/2 coincidências/)).toBeVisible() // X no mesmo IP do alvo (mensagem e login em 12 h)
  const [x1] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Exportar análise")')])
  expect(x1.suggestedFilename()).toMatch(/\.xlsx$/)

  await page.click('aside >> text=WhatsApp — vínculos')
  await page.setInputFiles('input[type=file][accept=".html,.htm,.zip,.txt"]', [file('a.html', fa), file('b.html', fb)])
  await page.click('button:has-text("Processar e cruzar bilhetagem")')
  await expect(page.getByText(/Comunicação direta entre alvos/i)).toBeVisible()
  await expect(page.getByText('(61) 90000-0001 ⟷ (61) 90000-0002').first()).toBeVisible()
  await expect(page.getByText(/Interlocutores em comum \(1\)/)).toBeVisible()
  await page.click('[role=tab] >> text=IPs')
  await expect(page.getByText('177.10.20.30').first()).toBeVisible()
  const [x2] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("XLSX")')])
  expect(x2.suggestedFilename()).toMatch(/vinculos.*\.xlsx$/)

  await page.click('aside >> text=Extrato Tempo Real')
  const head = 'Alvo;Incio;Célula Origem;Latitude;Longitude;Azimute;Raio Médio;Endereço;Distrito;Cidade;Estado;CEP'
  const rows = [
    'Alvo:;5511900000009',
    head,
    ...Array.from(
      { length: 30 },
      (_, i) =>
        `5511900000009;0${1 + (i % 9)}/11/2026–${String(i % 24).padStart(2, '0')}:10:00;724-05-2862055${i % 3};-23.6479${i % 3};-46.7915${i % 3};${(i % 3) * 120};0;RUA TESTE ${i % 3};;SAO_PAULO;SP;`,
    ),
  ]
  await page.setInputFiles('input[type=file]', { name: 'localizacao.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\r\n'), 'utf-8') })
  await page.click('button:has-text("Processar arquivo")')
  await expect(page.locator('[data-stat="Total eventos"]')).toContainText('30', { timeout: 60_000 })
  await expect(page.locator('[data-stat="ERBs no mapa"]')).toContainText('3')
  await expect(page.getByText('RUA TESTE', { exact: false }).first()).toBeVisible()

  // link direto: abre só clicando, sem login e sem senha (e sem o número do alvo)
  await page.click('button:has-text("Compartilhar link")')
  await page.click('button:has-text("Gerar link")')
  const direct = await page.locator('textarea[readonly]').inputValue()
  expect(direct).toMatch(/\/m#z[01]\./)
  const ctx2 = await browser.newContext()
  const viewer = await ctx2.newPage()
  await viewer.goto(direct)
  await viewer.click('button[aria-label="Abrir painel"]')
  await expect(viewer.getByText('ERBs da análise')).toBeVisible()
  await expect(viewer.getByText('3 ERBs · 30 eventos')).toBeVisible()
  await expect(viewer.getByRole('img', { name: 'Mapa de localização do alvo' })).toBeVisible()
  await expect(viewer.getByText('5511900000009')).toHaveCount(0)
  await ctx2.close()

  // Mapas ERB: cola linhas do extrato, insere no mapa e gera link único que abre sem login
  await page.keyboard.press('Escape')
  await page.click('aside >> text=Mapas ERB')
  await page.fill('textarea[placeholder^="Importar"]', '250 -26.25623 -49.2562\n10  -26-52-54,00   -49-08-31,00\n-26.3 -49.3')
  await page.click('button[aria-label="Converter e importar"]')
  await expect(page.getByText('3 item(ns) reconhecido(s)')).toBeVisible()
  await page.click('button:has-text("Inserir no mapa")')
  await expect(page.locator('table').getByText('ERB 1')).toBeVisible()
  await expect(page.locator('table').getByText('Ponto 3')).toBeVisible()
  await expect(page.locator('textarea[readonly]')).toHaveValue(/\/m#z[01]\./)
  await page.waitForTimeout(800) // o link é recalculado 250 ms após a última alteração
  const mapLink = await page.locator('textarea[readonly]').inputValue()
  const ctx3 = await browser.newContext()
  const v3 = await ctx3.newPage()
  await v3.goto(mapLink)
  await expect(v3.locator('.erb-label', { hasText: 'ERB 2' })).toBeVisible()
  const at = mapLink.length - 20
  await v3.goto(mapLink.slice(0, at) + (mapLink[at] === 'A' ? 'B' : 'A') + mapLink.slice(at + 1))
  await v3.reload()
  await expect(v3.getByText(/incompleto ou corrompido/)).toBeVisible()
  await ctx3.close()
  expect(errors).toEqual([])
})

test('MARX Mapas ERB público: sem login, painel fechado, antena e ponto digitados com nome e link curto', async ({ page, browser }) => {
  await page.goto('/erb')
  // abre com o painel fechado e, sem nada no mapa, o link é só o endereço do site
  await expect(page.getByLabel('Painel do Mapas ERB')).toBeHidden()
  await page.click('button[aria-label="Abrir painel"]')
  await expect(page.getByLabel('Link desta análise')).toHaveValue(/\/m$/)
  await page.click('button:has-text("Adicionar")')
  await expect(page.getByText('Colar linhas do extrato')).toHaveCount(0)
  await page.click('text=Antena / ERB (digitar)')
  await expect(page.getByLabel('Nome *')).toHaveValue('')
  await page.getByLabel('Nome *').fill('GABRIEL - 5799 - 08h59')
  await page.getByLabel('Latitude *').fill('-23.60215')
  await page.getByLabel('Longitude *').fill('-46.90688')
  await page.getByLabel('Azimute (°)').fill('240')
  await page.click('button:has-text("Salvar")')
  await expect(page.locator('.erb-label', { hasText: 'GABRIEL - 5799 - 08h59' })).toBeVisible()
  if (await page.locator('button[aria-label="Abrir painel"]').isVisible()) await page.click('button[aria-label="Abrir painel"]')
  await page.click('button:has-text("Adicionar")')
  await page.click('text=Ponto (digitar)')
  await page.getByLabel('Nome *').fill('Residência do alvo')
  await page.getByLabel('Latitude *').fill('-23.6050')
  await page.getByLabel('Longitude *').fill('-46.9000')
  await page.click('button:has-text("Salvar")')
  await expect(page.locator('.erb-label', { hasText: 'Residência do alvo' })).toBeVisible()
  if (await page.locator('button[aria-label="Abrir painel"]').isVisible()) await page.click('button[aria-label="Abrir painel"]')
  await expect(page.getByLabel('Link desta análise')).toHaveValue(/#z[01]\./)
  await page.waitForTimeout(800) // o link é recalculado 250 ms após a última alteração
  const link = await page.getByLabel('Link desta análise').inputValue()
  expect(link.length).toBeLessThan(260)
  // clicar no mapa fecha o painel
  await page.mouse.click(300, 500)
  await expect(page.getByLabel('Painel do Mapas ERB')).toBeHidden()
  await page.click('button[aria-label="Camadas do mapa"]')
  await expect(page.getByLabel('ERBs')).toBeVisible()
  const ctx = await browser.newContext()
  const other = await ctx.newPage()
  await other.goto(link)
  await expect(other.locator('.erb-label', { hasText: 'GABRIEL - 5799 - 08h59' })).toBeVisible()
  await expect(other.locator('.erb-label', { hasText: 'Residência do alvo' })).toBeVisible()
  await ctx.close()
})

test('cadastro pela tela de acesso: aguarda liberação do administrador e depois entra', async ({ page, browser }) => {
  const novo = `cad.${Date.now()}@gmail.com`
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto('/login')
  await p.click('text=Solicitar cadastro')
  await p.fill('input[autocomplete=name]', 'Pessoa Cadastrada')
  await p.fill('input[type=email]', novo)
  await p.locator('input[autocomplete=new-password]').nth(0).fill('SenhaDaPessoa2026')
  await p.locator('input[autocomplete=new-password]').nth(1).fill('SenhaDaPessoa2026')
  await p.click('button:has-text("ENVIAR CADASTRO")')
  await expect(p.getByText('Cadastro enviado')).toBeVisible({ timeout: 30_000 })
  // antes da liberação: aviso claro
  await p.click('text=Ir para o login')
  await p.fill('input[type=email]', novo)
  await p.fill('input[type=password]', 'SenhaDaPessoa2026')
  await p.click('form button.btn-primary')
  await expect(p.getByText(/aguardando liberação/)).toBeVisible({ timeout: 30_000 })

  await login(page)
  await page.click('text=Usuários')
  await expect(page.getByText('Cadastros aguardando liberação')).toBeVisible()
  await page.locator('tr', { hasText: novo }).locator('button:has-text("Liberar acesso")').click()
  await expect(page.locator('tr', { hasText: novo }).getByText('ativo', { exact: true })).toBeVisible()

  await p.click('form button.btn-primary')
  await expect(p.getByText('WORKSPACE INVESTIGATIVO')).toBeVisible({ timeout: 30_000 })
  await ctx.close()
})
