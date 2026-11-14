import { estimateHomeWork } from './homework'
const ev = (h: number) => `2026-10-16 ${String(h).padStart(2, '0')}:30`
describe('provável residência × trabalho', () => {
  it('separa por horário e escolhe os dois pontos', () => {
    const r = estimateHomeWork([
      { lat: -23.5, lon: -46.6, name: 'Casa', times: [ev(1), ev(3), ev(23), ev(22)] }, // noite
      { lat: -23.6, lon: -46.7, name: 'Trabalho', times: [ev(10), ev(14), ev(16), ev(11)] }, // dia
      { lat: -23.4, lon: -46.5, name: 'Outro', times: [ev(12)] },
    ])
    expect(r.home?.name).toBe('Casa')
    expect(r.home?.night).toBe(4)
    expect(r.work?.name).toBe('Trabalho')
    expect(r.work?.day).toBe(4)
  })
  it('não repete o mesmo ponto como casa e trabalho', () => {
    const r = estimateHomeWork([{ lat: 1, lon: 1, name: 'Único', times: [ev(2), ev(13)] }])
    expect(r.home?.name).toBe('Único')
    expect(r.work).toBeNull()
  })
  it('sem horários, não estima', () => {
    expect(estimateHomeWork([{ lat: 1, lon: 1 }])).toEqual({ home: null, work: null })
  })
})
