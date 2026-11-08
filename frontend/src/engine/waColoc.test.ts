import { colocation } from './waBilling'

const H = 3600 * 1000
const o = (number: string, ip: string, ts: number, account = 'A', port: string | null = null) => ({ number, ip, port, ts, source: 'mensagem' as const, account })

describe('mesmo IP em até 12 h', () => {
  it('agrupa alvo e interlocutor por IP e conta os dias', () => {
    const t0 = Date.UTC(2026, 9, 16, 15)
    const obs = [o('A', '2804::1', t0), o('X', '2804::1', t0 + 2 * H), o('A', '2804::1', t0 + 24 * H), o('X', '2804::1', t0 + 25 * H), o('X', '9.9.9.9', t0), o('Z', '2804::1', t0 + 200 * H)]
    const r = colocation(obs, new Set(['A']), new Map([['A', [{ number: 'X' }, { number: 'Z' }]]]), 12 * H)
    expect(r).toHaveLength(1)
    expect(r[0].ip).toBe('2804::1')
    expect(r[0].days).toHaveLength(2)
    expect(r[0].numbers.map((n) => [n.number, n.target, n.n])).toEqual([
      ['A', true, 2],
      ['X', false, 2],
    ])
  })
  it('ignora IPv4 de operadora móvel (CGNAT)', () => {
    const obs = [o('A', '177.1.1.1', 0), o('X', '177.1.1.1', H)]
    const mobile = () => ({ asn: 26599, org: 'TELEFONICA', country: 'BR', uf: null, city: null })
    expect(colocation(obs, new Set(['A']), new Map([['A', [{ number: 'X' }]]]), 12 * H, mobile)).toHaveLength(0)
    expect(colocation(obs, new Set(['A']), new Map([['A', [{ number: 'X' }]]]), 12 * H)).toHaveLength(1)
  })
})
