import { isHomeTime, isWorkTime, type LocEvent, locationPatterns, towers, transitions, rankCells } from './location'

const ev = (ts: string, cell: string | null, lat: number | null = null, lon: number | null = null, az: number | null = null): LocEvent => ({
  id: 0,
  ts,
  type: 'dados',
  dir: null,
  other: null,
  dur: null,
  cell,
  lat,
  lon,
  az,
  address: cell ? `Rua ${cell}` : null,
  city: 'SAO PAULO/SP',
})

describe('localização do alvo', () => {
  it('classifica horário de casa e de trabalho', () => {
    expect(isHomeTime('2026-11-02 22:00:00')).toBe(true) // segunda, noite
    expect(isHomeTime('2026-11-01 14:00:00')).toBe(true) // domingo
    expect(isHomeTime('2026-11-03 10:00:00')).toBe(false) // terça, manhã
    expect(isWorkTime('2026-11-03 10:00:00')).toBe(true)
    expect(isWorkTime('2026-11-03 19:00:00')).toBe(false)
    expect(isWorkTime('2026-11-01 10:00:00')).toBe(false)
  })

  it('aponta provável residência, trabalho e ERBs mais frequentes', () => {
    const events = [
      ...Array.from({ length: 6 }, (_, i) => ev(`2026-11-02 2${i % 4}:00:00`, 'CASA', -23.6, -46.8, 130)),
      ...Array.from({ length: 4 }, (_, i) => ev(`2026-11-03 1${i}:00:00`, 'TRAB', -23.5, -46.6, 320)),
      ev('2026-11-03 11:30:00', null),
    ]
    const p = locationPatterns(events)
    expect(p.total).toBe(11)
    expect(p.located).toBe(10)
    expect(p.home).toMatchObject({ cell: 'CASA', n: 6 })
    expect(p.home!.pct).toBeCloseTo(54.5, 1)
    expect(p.work).toMatchObject({ cell: 'TRAB', n: 4, az: 320 })
    expect(p.top.map((c) => c.cell)).toEqual(['CASA', 'TRAB'])
    expect(p.days).toEqual([
      { day: '2026-11-02', n: 6 },
      { day: '2026-11-03', n: 5 },
    ])
  })

  it('agrupa células da mesma torre e conta deslocamentos', () => {
    const events = [
      ev('2026-11-02 10:00:00', 'A1', -23.6, -46.8, 0),
      ev('2026-11-02 10:05:00', 'A2', -23.6, -46.8, 120),
      ev('2026-11-02 11:00:00', 'B1', -23.5, -46.6, 0),
      ev('2026-11-02 12:00:00', 'A1', -23.6, -46.8, 0),
    ]
    const t = towers(rankCells(events))
    expect(t).toHaveLength(2)
    expect(t[0]).toMatchObject({ n: 3 })
    expect(t[0].cells.map((c) => c.cell).sort()).toEqual(['A1', 'A2'])
    expect(transitions(events)).toEqual([{ a: [-23.6, -46.8], b: [-23.5, -46.6], n: 2 }])
  })
})
