import { describe, expect, it } from 'vitest'
import { dayLabel, distinctDays, filterActive, filterPoints, filterStats, hourInWindow, inWindow, toHHMM, toMin, type ErbTimeFilter } from './erbFilter'

type P = { lat: number; lon: number; events: number; times?: string[] }
const pts: P[] = [
  { lat: 1, lon: 1, events: 3, times: ['2024-05-10T08:30', '2024-05-10T22:10', '2024-05-11T03:00'] },
  { lat: 2, lon: 2, events: 2, times: ['2024-05-11T14:00', '2024-05-12T09:15'] },
  { lat: 3, lon: 3, events: 1 }, // sem horário
]

describe('hourInWindow', () => {
  it('faixa normal [from,to)', () => {
    expect(hourInWindow(360, 360, 1080)).toBe(true) // 06:00 em 06–18
    expect(hourInWindow(1080, 360, 1080)).toBe(false) // 18:00 é o limite exclusivo
    expect(hourInWindow(300, 360, 1080)).toBe(false)
  })
  it('faixa que cruza a meia-noite (noite)', () => {
    expect(hourInWindow(1140, 1080, 360)).toBe(true) // 19:00 na noite 18–06
    expect(hourInWindow(120, 1080, 360)).toBe(true) // 02:00 na noite 18–06
    expect(hourInWindow(720, 1080, 360)).toBe(false) // 12:00 fora
  })
  it('from===to = dia inteiro', () => {
    expect(hourInWindow(0, 0, 0)).toBe(true)
    expect(hourInWindow(900, 0, 0)).toBe(true)
  })
})

describe('inWindow / filterActive', () => {
  it('dia + hora', () => {
    const f: ErbTimeFilter = { days: ['2024-05-10'], from: 360, to: 1080 }
    expect(inWindow('2024-05-10T08:30', f)).toBe(true)
    expect(inWindow('2024-05-10T22:10', f)).toBe(false) // fora da hora
    expect(inWindow('2024-05-11T08:30', f)).toBe(false) // fora do dia
  })
  it('vazio não filtra', () => {
    expect(filterActive({ days: [], from: 0, to: 0 })).toBe(false)
    expect(filterActive({ days: ['2024-05-10'], from: 0, to: 0 })).toBe(true)
    expect(filterActive({ days: [], from: 360, to: 1080 })).toBe(true)
  })
})

describe('filterPoints', () => {
  it('estreita times e recalcula events; descarta ERB sem evento no recorte', () => {
    const f: ErbTimeFilter = { days: ['2024-05-10'], from: 0, to: 0 }
    const r = filterPoints(pts, f)
    expect(r).toHaveLength(1)
    expect(r[0].events).toBe(2)
    expect(r[0].times).toEqual(['2024-05-10T08:30', '2024-05-10T22:10'])
  })
  it('faixa noturna pega eventos dos dois lados da meia-noite', () => {
    const f: ErbTimeFilter = { days: [], from: 1080, to: 360 } // 18–06
    const r = filterPoints(pts, f)
    const all = r.flatMap((p) => p.times ?? [])
    expect(all).toContain('2024-05-10T22:10')
    expect(all).toContain('2024-05-11T03:00')
    expect(all).not.toContain('2024-05-10T08:30')
    expect(all).not.toContain('2024-05-11T14:00')
  })
  it('filtro inativo devolve os pontos como estão', () => {
    expect(filterPoints(pts, { days: [], from: 0, to: 0 })).toBe(pts)
    expect(filterPoints(pts, null)).toBe(pts)
  })
})

describe('distinctDays / filterStats', () => {
  it('lista os dias em ordem', () => {
    expect(distinctDays(pts)).toEqual(['2024-05-10', '2024-05-11', '2024-05-12'])
  })
  it('conta exibidos vs total (só eventos com horário)', () => {
    const s = filterStats(pts, { days: ['2024-05-11'], from: 0, to: 0 })
    expect(s.totalEvents).toBe(5)
    expect(s.totalErbs).toBe(2)
    expect(s.shownEvents).toBe(2) // 22:10→11 não; 05-11T03:00 e 05-11T14:00 sim
    expect(s.shownErbs).toBe(2)
  })
})

describe('toMin / toHHMM / dayLabel', () => {
  it('converte hora', () => {
    expect(toMin('06:30')).toBe(390)
    expect(toHHMM(390)).toBe('06:30')
    expect(toHHMM(1080)).toBe('18:00')
  })
  it('rotula o dia', () => {
    expect(dayLabel('2024-05-10').short).toBe('10/05')
  })
})
