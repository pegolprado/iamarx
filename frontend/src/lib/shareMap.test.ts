import { decryptMap, decryptMapOpen, encryptMap, encryptMapOpen, encryptShare, encryptShareM3, isOpenLink, randomPassword, type SharedMap, toKml, WrongPassword } from './shareMap'

const map: SharedMap = {
  v: 1,
  title: 'Mapa teste',
  by: 'Analista',
  at: '2026-10-19T10:00:00.000Z',
  exp: null,
  period: ['2026-10-10 00:00:00', '2026-10-16 09:00:00'],
  types: 'todos os eventos',
  numbers: [],
  points: [
    {
      lat: -23.6177654,
      lon: -46.732624,
      events: 5462,
      voice: 2,
      sms: 0,
      data: 5460,
      az: [120, 240],
      cells: ['CGI|724-05-42911-28723714'],
      first: '2026-10-10 00:01:00',
      last: '2026-10-16 09:10:50',
      name: null,
      numbers: [],
    },
  ],
}

describe('mapa compartilhado', () => {
  it('criptografa e abre com a senha certa', async () => {
    const pw = randomPassword()
    expect(pw).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    const frag = await encryptMap(map, pw)
    expect(frag.startsWith('m1.')).toBe(true)
    expect(frag).not.toContain('724-05') // nada legível no link
    const back = await decryptMap(frag, pw)
    expect(back.title).toBe('Mapa teste')
    expect(back.points[0]).toMatchObject({ lat: -23.61777, lon: -46.73262, events: 5462, az: [120, 240], first: '2026-10-10 00:01' })
  })
  it('recusa senha errada e link corrompido', async () => {
    const frag = await encryptMap(map, 'senha-certa-123')
    await expect(decryptMap(frag, 'senha-errada')).rejects.toBeInstanceOf(WrongPassword)
    await expect(decryptMap('m1.abc', 'x')).rejects.toThrow(/incompleto/)
  })
  it('gera KML com estação e azimutes', () => {
    const k = toKml(map)
    expect(k).toContain('<coordinates>-46.732624,-23.6177654,0</coordinates>')
    expect(k.match(/<LineString>/g)).toHaveLength(2)
  })
  it('link direto abre sem senha e preserva células e deslocamentos', async () => {
    const m = { ...map, radius: 1000, beam: 120, path: [[-15.8, -47.9, -15.81, -47.91, 3]] as [number, number, number, number, number][] }
    m.points = m.points.map((p) => ({ ...p, cl: [['724-11-1', 120, 5]] as [string, number | null, number][] }))
    const frag = await encryptMapOpen(m)
    expect(isOpenLink(frag)).toBe(true)
    const back = await decryptMapOpen(frag)
    expect(back.points[0].cl).toEqual([['724-11-1', 120, 5]])
    expect(back.path?.[0][4]).toBe(3)
    expect(back.beam).toBe(120)
    await expect(decryptMapOpen(frag.slice(0, -6))).rejects.toThrow(/incompleto/)
  })
  it('link curto (m3): horários, deslocamentos por índice, pontos marcados e sem nome de quem enviou', async () => {
    const m: SharedMap = {
      ...map,
      by: 'Fulano de Tal',
      radius: 1000,
      beam: 120,
      points: [map.points[0], { ...map.points[0], lat: -23.6, lon: -46.7 }].map((p, i) => ({
        ...p,
        cl: [[`724-11-${i}`, 120, 2]],
        times: ['2026-10-09 10:29', '2026-10-09 10:31', '2026-10-10 08:00'],
      })),
    }
    m.path = [[m.points[0].lat, m.points[0].lon, m.points[1].lat, m.points[1].lon, 4]]
    m.marks = [{ lat: -15.8, lon: -47.9, label: 'Residência do alvo', kind: 'casa' }]
    const frag = await encryptShare(m)
    expect(/^z[01]\./.test(frag)).toBe(true)
    expect(isOpenLink(frag)).toBe(true)
    const back = await decryptMapOpen(frag)
    expect(back.by).toBe('')
    expect(back.points[0].times).toEqual(['2026-10-09 10:29', '2026-10-09 10:31', '2026-10-10 08:00'])
    expect(back.path?.[0][4]).toBe(4)
    expect(back.marks).toEqual([{ lat: -15.8, lon: -47.9, label: 'Residência do alvo', kind: 'casa' }])
    expect(frag.length).toBeLessThan((await encryptMapOpen(m)).length)
  })
  it('link curto z1: pequeno, igual para o mesmo mapa, recusa alteração; m3 antigo continua abrindo', async () => {
    const m: SharedMap = {
      ...map,
      title: 'Mapa de localização (ERBs)',
      period: [null, null],
      points: [],
      marks: [{ lat: -23.60215, lon: -46.90688, label: 'GABRIEL - 5799 - 08h59', kind: 'erb', az: 240, dist: 1000, beam: 120 }],
    }
    const a = await encryptShare(m)
    expect(a).toBe(await encryptShare(m))
    expect(a.length).toBeLessThan(110)
    expect((await decryptMapOpen(a)).marks?.[0]).toMatchObject({ label: 'GABRIEL - 5799 - 08h59', az: 240 })
    const at = 6
    const bad = a.slice(0, at) + (a[at] === 'A' ? 'B' : 'A') + a.slice(at + 1)
    await expect(decryptMapOpen(bad)).rejects.toThrow(/corrompido/)
    const old = await encryptShareM3(m)
    expect((await decryptMapOpen(old)).marks?.[0].label).toBe('GABRIEL - 5799 - 08h59')
  })
  it('link curto guarda os grupos (cor por número) e o grupo de cada ERB', async () => {
    const m: SharedMap = {
      ...map,
      groups: [
        { name: '5511999999999', color: '#2563eb' },
        { name: '5511888888888', color: '#dc2626', hidden: true },
      ],
      points: [{ ...map.points[0], g: 1 }],
    }
    const back = await decryptMapOpen(await encryptShare(m))
    expect(back.groups).toEqual(m.groups)
    expect(back.points[0].g).toBe(1)
  })
})
