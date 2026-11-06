import { fileInfo, individual, links, localTs } from './waBilling'
import { waRecordsHtml } from './waSample'
import { parseWhatsApp } from './whatsapp'

const A = '5561900000001'
const B = '5561900000002'
const X = '5561980000001' // interlocutor dos dois
const Y = '5561980000002'

const fa = fileInfo(
  'a.html',
  parseWhatsApp(
    waRecordsHtml({
      account: A,
      messages: [
        ['2026-10-30 12:00:00 UTC', A, [X], null, '177.10.20.30'],
        ['2026-10-30 12:05:00 UTC', X, [A], null, '177.10.20.30'], // X no mesmo IP que A
        ['2026-10-30 13:00:00 UTC', A, [B], null, '200.1.1.1'], // contato direto entre alvos
        ['2026-10-30 14:00:00 UTC', A, [Y, X], '120363000000000009@g.us', '200.1.1.1'],
      ],
      calls: [],
      ips: [['2026-10-30 02:00:00 UTC', '45.231.155.194']],
      book: [[], []],
      groups: [],
    }),
  ),
)
const fb = fileInfo(
  'b.html',
  parseWhatsApp(
    waRecordsHtml({
      account: B,
      messages: [
        ['2026-10-30 15:00:00 UTC', B, [X], null, '200.1.1.1'], // B no IP que A usou 2 h antes
        ['2026-10-30 16:00:00 UTC', B, [Y, X], '120363000000000009@g.us', '191.1.1.1'],
      ],
      calls: [],
      ips: [],
      book: [[], []],
      groups: [],
    }),
  ),
)

describe('bilhetagem do WhatsApp', () => {
  it('horário de Brasília', () => {
    expect(localTs(Date.UTC(2026, 9, 30, 12))).toBe('2026-10-30 09:00:00')
  })

  it('análise individual: interlocutores e proximidade física', () => {
    const r = individual('+' + A, [fa], null)
    expect(r.interlocutors.map((i) => i.number)).toEqual(['+' + X, '+' + B])
    expect(r.interlocutors[0]).toMatchObject({ msgs: 2, sent: 1, received: 1 })
    expect(r.groups).toEqual(['120363000000000009@g.us'])
    expect(r.proximity.map((p) => p.number)).toEqual(['+' + X])
    expect(r.proximity[0].hits[0]).toMatchObject({ ip: '177.10.20.30', delta: 300000 })
  })

  it('vínculos entre alvos: contato direto, interlocutores, IP e grupo em comum', () => {
    const r = links([fa, fb])
    expect(r.targets).toEqual(['+' + A, '+' + B])
    expect(r.direct).toEqual([expect.objectContaining({ a: '+' + A, b: '+' + B, msgs: 1 })])
    expect(r.common.map((c) => c.number)).toEqual(['+' + X])
    expect(r.ipHits).toHaveLength(2) // A usou o IP duas vezes nas 12 h
    expect(r.ipHits.every((h) => h.ip === '200.1.1.1' && h.a === '+' + A && h.b === '+' + B)).toBe(true)
    expect(r.ipHits[0].delta).toBe(3600000) // o mais próximo primeiro
    expect(r.sharedGroups.map((g) => g.id)).toEqual(['120363000000000009@g.us'])
  })
})
