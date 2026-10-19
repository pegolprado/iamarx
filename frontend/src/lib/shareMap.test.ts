import { decryptMap, encryptMap, randomPassword, type SharedMap, toKml, WrongPassword } from './shareMap'

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
})
