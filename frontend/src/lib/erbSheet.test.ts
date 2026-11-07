import { MODEL_COLUMNS, sheetRows } from './erbSheet'
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
})
