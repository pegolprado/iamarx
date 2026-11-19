import { describe, expect, it } from 'vitest'
import { parseCallSheet, parseErbSheet, parseCsvRows, readCdrWorkbook, toIso, toSeconds } from './preterita'
import { analyze, applyFilter, autoReport, EMPTY_CDR_FILTER, mergeFiles } from './preteritaStats'

// Amostra fiel ao formato Vivo "Relatório de chamadas" (com preâmbulo).
const CALL = [
  ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['', 'SEGREDO DE JUSTIÇA'],
  ['', 'Relatório de chamadas'],
  ['', 'Linha:11930385570'],
  [''],
  ['Data', 'Hora', 'Chamador', 'IMEI Chamador', 'Chamado', 'IMEI Chamado', 'Desc', 'Hora desc', 'Durac', 'Status', 'Tra', 'GMT Origem', 'GMT Destino', 'Local Origem', 'Local Destino', 'Tec Origem', 'Tec Destino'],
  ['01/06/2026', '11:15:48', '', '', '11930385570', '356576107571060', '', '11:15:59', '11', 'Completada', 'Voz', '', '-3', '', '724-10-41011-41654', '', 'GSM'],
  ['01/06/2026', '14:04:07', '11930385570', '', '1140041234', '', '', '14:04:43', '36', 'Completada', 'Voz', '-3', '', '724-10-0266400-051', '', 'LTE', ''],
  ['02/06/2026', '09:00:00', '11930385570', '', '1155559999', '', '', '', '0', 'Entregue', 'TORP.', '-3', '', '724-10-41011-41654', '', 'GSM', ''],
  ['02/06/2026', '23:30:00', '', '', '11930385570', '', '', '23:30:02', '2', 'Nao Compl.', 'Voz', '', '', '', '724-10-41011-41654', '', 'GSM'],
  ['Não há registro de chamadas'],
]

const ERB = [
  ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['', 'SEGREDO DE JUSTIÇA'],
  ['', 'Endereço das ERBs'],
  ['', 'Linha:11930385570'],
  [''],
  ['CGI', 'CCC', 'Sigla', 'ERB', 'Sigla', 'Set', 'Azi', 'Tecnologia', 'Latitude', 'Longitude', 'UF', 'Cidade', 'Bairro', 'Endereço'],
  ['724-10-41011-41654', '0', 'MWTCTPD', '4165', 'WPRZ1', '4', '305', 'WCDMA', '-23-34-34,43', '-46-38-25,41', 'SP', 'SÃO PAULO', 'VILA MARIANA', 'RUA VERGUEIRO, 1571'],
  ['724-10-0266400-051', '0', '', '', '', '', '', '', '', '', '', 'CADASTRO NAO ENCONTRADO', '', 'Dta.Chamada.:  2026/08/17'],
]

describe('toIso / toSeconds', () => {
  it('converte data BR + hora', () => {
    expect(toIso('01/06/2026', '11:15:48')).toBe('2026-06-01T11:15:48')
    expect(toIso('1/6/26', '9:00')).toBe('2026-06-01T09:00:00')
    expect(toIso('2026-06-01', '11:15')).toBe('2026-06-01T11:15:00')
  })
  it('rejeita data inválida', () => {
    expect(toIso('32/13/2026', '10:00')).toBeNull()
    expect(toIso('', '')).toBeNull()
  })
  it('duração em segundos', () => {
    expect(toSeconds('36')).toBe(36)
    expect(toSeconds('00:01:30')).toBe(90)
    expect(toSeconds('')).toBe(0)
  })
})

describe('parseCallSheet', () => {
  const ev = parseCallSheet(CALL, 'amostra.xlsx', 'Relatório de chamadas', '')
  it('lê 4 eventos e ignora o rodapé', () => {
    expect(ev).toHaveLength(4)
  })
  it('direção, tipo, célula e duração corretos', () => {
    expect(ev[0]).toMatchObject({ dir: 'term', kind: 'voz', completed: true, cgi: '724-10-41011-41654', durationSec: 11, tech: 'GSM', other: '' })
    expect(ev[1]).toMatchObject({ dir: 'orig', kind: 'voz', completed: true, cgi: '724-10-0266400-051', other: '1140041234', tech: 'LTE' })
    expect(ev[2]).toMatchObject({ dir: 'orig', kind: 'sms', completed: true, other: '1155559999' })
    expect(ev[3]).toMatchObject({ dir: 'term', kind: 'voz', completed: false })
    expect(ev[0].target).toBe('11930385570')
    expect(ev[0].ts).toBe('2026-06-01T11:15:48')
  })
  it('não confunde Chamado com Chamador', () => {
    // no evento 0 o alvo está em Chamado; Chamador vazio ⇒ from vazio
    expect(ev[0].from).toBe('')
    expect(ev[0].to).toBe('11930385570')
  })
})

describe('parseErbSheet', () => {
  const erbs = parseErbSheet(ERB)
  it('geocodifica quem tem coordenada e marca o resto como não encontrado', () => {
    const a = erbs.get('724-10-41011-41654')!
    expect(a.found).toBe(true)
    expect(a.lat).toBeCloseTo(-23.57623, 4)
    expect(a.lon).toBeCloseTo(-46.64039, 4)
    expect(a.az).toBe(305)
    expect(a.city).toBe('SÃO PAULO')
    const b = erbs.get('724-10-0266400-051')!
    expect(b.found).toBe(false)
    expect(b.lat).toBeNull()
  })
})

describe('analyze', () => {
  const ev = parseCallSheet(CALL, 'amostra.xlsx', 'Relatório de chamadas', '')
  const erbs = parseErbSheet(ERB)
  const st = analyze(ev, erbs)
  it('indicadores gerais', () => {
    expect(st.total).toBe(4)
    expect(st.completed).toBe(3)
    expect(st.failed).toBe(1)
    expect(st.byKind).toMatchObject({ voz: 3, sms: 1 })
    expect(st.byDir).toMatchObject({ orig: 2, term: 2, unknown: 0 })
    expect(st.talkSec).toBe(47) // 11 + 36 (voz concluída); o não concluído não conta
    expect(st.distinctCgi).toBe(2)
    expect(st.distinctOthers).toBe(2)
    expect(st.period).toEqual(['2026-06-01T11:15:48', '2026-06-02T23:30:00'])
  })
  it('geolocaliza só ERBs com coordenada', () => {
    expect(st.erbWithGeo).toBe(1)
    expect(st.erbNoGeo).toBe(1)
    expect(st.sites).toHaveLength(1)
    expect(st.sites[0].events).toBe(3) // 41011-41654 atendeu 3 registros
    expect(st.sites[0].az).toContain(305)
    expect(st.noCoordCgis).toContain('724-10-0266400-051')
  })
  it('ranking de contrapartes', () => {
    expect(st.contacts.map((c) => c.number)).toEqual(expect.arrayContaining(['1140041234', '1155559999']))
  })
})

describe('applyFilter', () => {
  const ev = parseCallSheet(CALL, 'amostra.xlsx', 'Relatório de chamadas', '')
  const erbs = parseErbSheet(ERB)
  it('por tipo, por dia e por número', () => {
    expect(applyFilter(ev, erbs, { ...EMPTY_CDR_FILTER, kinds: ['voz'] })).toHaveLength(3)
    expect(applyFilter(ev, erbs, { ...EMPTY_CDR_FILTER, days: ['2026-06-02'] })).toHaveLength(2)
    expect(applyFilter(ev, erbs, { ...EMPTY_CDR_FILTER, number: '1140041234' })).toHaveLength(1)
    expect(applyFilter(ev, erbs, { ...EMPTY_CDR_FILTER, status: 'failed' })).toHaveLength(1)
    expect(applyFilter(ev, erbs, { ...EMPTY_CDR_FILTER, from: 18 * 60, to: 6 * 60 })).toHaveLength(1) // só o de 23:30
  })
})

describe('autoReport', () => {
  it('produz texto fundamentado com os números reais', () => {
    const ev = parseCallSheet(CALL, 'amostra.xlsx', 'Relatório de chamadas', '')
    const erbs = parseErbSheet(ERB)
    const ds = { events: ev, erbs, targets: ['11930385570'], files: ['amostra.xlsx'] }
    const rep = autoReport(analyze(ev, erbs), ds)
    expect(rep.length).toBeGreaterThan(3)
    expect(rep[0]).toContain('4 registros')
    expect(rep.join(' ')).toContain('11930385570')
  })
})

describe('parseCsvRows', () => {
  it('detecta ; como separador', () => {
    const rows = parseCsvRows('A;B;C\n1;2;3')
    expect(rows[1]).toEqual(['1', '2', '3'])
  })
})

describe('readCdrWorkbook (integração .xlsx)', () => {
  it('lê um workbook real de 2 abas', async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const w1 = wb.addWorksheet('Relatório de chamadas')
    for (const r of CALL) w1.addRow(r)
    const w2 = wb.addWorksheet('Endereço das ERBs')
    for (const r of ERB) w2.addRow(r)
    const buf = new Uint8Array(await wb.xlsx.writeBuffer())
    const pf = readCdrWorkbook(buf, 'amostra.xlsx')
    expect(pf.target).toBe('11930385570')
    expect(pf.events).toHaveLength(4)
    expect(pf.erbs.get('724-10-41011-41654')?.found).toBe(true)
    const ds = mergeFiles([pf])
    expect(analyze(ds.events, ds.erbs).sites).toHaveLength(1)
  })
})
