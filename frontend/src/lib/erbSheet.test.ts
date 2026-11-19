import { importSheet, MODEL_COLUMNS, sheetRows, toIso } from './erbSheet'
import type { SharedMap } from './shareMap'

describe('planilha do Mapas ERB', () => {
  it('exporta no modelo eventos_da_operação: um evento por horário e os pontos marcados', () => {
    const m: SharedMap = {
      v: 1,
      title: 't',
      by: '',
      at: '',
      exp: null,
      period: [null, null],
      types: '',
      numbers: [],
      points: [
        {
          lat: -23.6,
          lon: -46.9,
          events: 2,
          voice: 0,
          sms: 0,
          data: 0,
          az: [120],
          cells: ['724-05-1'],
          cl: [['724-05-1', 120, 2]],
          first: null,
          last: null,
          times: ['2026-10-10 01:07', '2026-10-11 06:07'],
        },
      ],
      marks: [
        { lat: -23.5, lon: -46.8, label: 'Residência do alvo', kind: 'casa' },
        { lat: -23.4, lon: -46.7, label: 'ERB X', kind: 'erb', az: 240, dist: 1500 },
      ],
    }
    const rows = sheetRows(m, 1000)
    expect(rows).toHaveLength(4)
    const at = (r: (string | number | null)[], c: string) => r[MODEL_COLUMNS.indexOf(c)]
    expect(at(rows[0], 'Data do evento')).toBe('10/10/2026 01:07:00')
    expect(at(rows[1], 'Célula')).toBe('724-05-1')
    expect(at(rows[2], 'Tipo')).toBe('Lugar')
    expect(at(rows[2], 'Localização')).toBe('Residência do alvo')
    expect(at(rows[3], 'Azimute')).toBe(240)
    expect(at(rows[3], 'Raio')).toBe(1500)
  })
  it('datas em vários formatos, inclusive o do Vigia (com –)', () => {
    expect(toIso('09/10/2026–10:29:18')).toBe('2026-10-09 10:29')
    expect(toIso('16/10/2026 09:26:39')).toBe('2026-10-16 09:26')
    expect(toIso('9/1/26 7:05')).toBe('2026-01-09 07:05')
    expect(toIso('2026-10-16T09:26:00')).toBe('2026-10-16 09:26')
  })

  it('extrato do Vigia: dias e horários por ERB, separados por alvo', async () => {
    const csv = [
      'Alvo:;5511999999999',
      'Alvo;Incio;Célula Origem;Latitude;Longitude;Azimute;Raio Médio;Endereço;Distrito;Cidade;Estado;CEP',
      '5511999999999;09/10/2026–10:29:18;724-05-1;-23.52814;-46.79343;80;0;RUA GASPARINO LUNARDI, 176;;OSASCO;SP;',
      '5511999999999;10/10/2026–08:40:00;724-05-1;-23.52814;-46.79343;80;0;RUA GASPARINO LUNARDI, 176;;OSASCO;SP;',
      '5511888888888;10/10/2026–09:00:00;724-05-2;-23.55780;-46.83698;120;0;RUA X;;OSASCO;SP;',
    ].join('\r\n')
    const r = await importSheet(new File([csv], 'extrato.csv'))
    expect(r.groups).toEqual(['5511999999999', '5511888888888'])
    expect(r.points).toHaveLength(2)
    const a = r.points.find((p) => p.g === 0)!
    expect(a.times).toEqual(['2026-10-09 10:29', '2026-10-10 08:40'])
    expect(a.cl?.[0][0]).toBe('724-05-1')
    expect(a.name).toBe('RUA GASPARINO LUNARDI, 176 - OSASCO/SP')
  })
})

describe('importSheet: extrato de chamadas da operadora (Vivo) → ERBs no mapa', () => {
  it('lê o workbook de chamadas + endereços e volta as ERBs geolocalizadas com setor e horários', async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const w1 = wb.addWorksheet('Relatório de chamadas')
    ;[
      ['', 'Linha:11999990000'],
      [''],
      ['Data', 'Hora', 'Chamador', 'IMEI Chamador', 'Chamado', 'IMEI Chamado', 'Desc', 'Hora desc', 'Durac', 'Status', 'Tra', 'GMT Origem', 'GMT Destino', 'Local Origem', 'Local Destino', 'Tec Origem', 'Tec Destino'],
      ['01/06/2026', '10:15:00', '', '', '11999990000', '', '', '10:15:30', '30', 'Completada', 'Voz', '', '-3', '', '724-10-41011-41654', '', 'GSM'],
      ['01/06/2026', '22:40:00', '11999990000', '', '', '', '', '22:41:00', '60', 'Completada', 'Voz', '-3', '', '724-10-41011-41654', '', 'GSM', ''],
      ['02/06/2026', '09:05:00', '11999990000', '', '', '', '', '', '0', 'Entregue', 'TORP.', '-3', '', '724-10-99999-00000', '', 'LTE', ''],
    ].forEach((r) => w1.addRow(r))
    const w2 = wb.addWorksheet('Endereço das ERBs')
    ;[
      ['', 'Linha:11999990000'],
      [''],
      ['CGI', 'CCC', 'Sigla', 'ERB', 'Sigla', 'Set', 'Azi', 'Tecnologia', 'Latitude', 'Longitude', 'UF', 'Cidade', 'Bairro', 'Endereço'],
      ['724-10-41011-41654', '0', 'MWTCTPD', '4165', 'WPRZ1', '4', '305', 'WCDMA', '-23-34-34,43', '-46-38-25,41', 'SP', 'SÃO PAULO', 'VILA MARIANA', 'RUA VERGUEIRO, 1571'],
      ['724-10-99999-00000', '0', '', '', '', '', '', '', '', '', '', 'CADASTRO NAO ENCONTRADO', '', 'x'],
    ].forEach((r) => w2.addRow(r))
    const buf = await wb.xlsx.writeBuffer()
    const file = new File([buf], 'consulta.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const r = await importSheet(file)
    expect(r.rows).toBe(3) // registros lidos
    expect(r.points).toHaveLength(1) // 1 ERB geolocalizada (a outra é "cadastro não encontrado")
    expect(r.skipped).toBe(1) // 1 célula sem coordenada
    expect(r.groups).toEqual(['11999990000'])
    const p = r.points[0]
    expect(p.lat).toBeCloseTo(-23.57623, 4)
    expect(p.az).toContain(305)
    expect(p.events).toBe(2)
    expect(p.times).toEqual(['2026-06-01 10:15', '2026-06-01 22:40'])
  })
})
