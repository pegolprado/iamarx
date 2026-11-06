import fs from 'node:fs'
import path from 'node:path'
import { ipKey, isMobileNet, isVpnLike, loadIpdb, lookupIp } from './ipdb'

const dir = path.resolve(__dirname, '../../public/vendor/ipdb')

describe('base de IPs (provedor e cidade)', () => {
  beforeAll(() => {
    vi.stubGlobal('fetch', async (url: string) => {
      const f = path.join(dir, String(url).split('/').pop()!)
      return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array(fs.readFileSync(f)).buffer }
    })
  })
  afterAll(() => vi.unstubAllGlobals())

  it('converte IPv4 e IPv6', () => {
    expect(ipKey('1.2.3.4')).toEqual({ v6: false, key: 16909060 })
    expect(ipKey('2804:290:ee1:1000:69ce:c15b:975e:1231')?.key).toBe(0x28040290_0ee11000n)
    expect(ipKey('2804::1')?.key).toBe(0x2804_0000_0000_0000n)
    expect(ipKey('999.1.1.1')).toBeNull()
    expect(ipKey('abc')).toBeNull()
  })

  it('acha provedor, cidade e país', async () => {
    const db = await loadIpdb()
    const a = lookupIp(db, '45.231.155.194')
    expect(a.org).toMatch(/PROXER/)
    expect(a.country).toBe('BR')
    expect(a.uf).toBeTruthy()
    const g = lookupIp(db, '8.8.8.8')
    expect(g.asn).toBe(15169)
    expect(g.country).toBe('US')
    expect(isVpnLike(g)).toBe(true)
    const v6 = lookupIp(db, '2804:18:10c3:8b08:1:0:5221:69ef')
    expect(v6.country).toBe('BR')
    expect(v6.org).toBeTruthy()
    expect(isMobileNet({ asn: 26615, org: 'TIM SA', country: 'BR', uf: null, city: null })).toBe(true)
    expect(isVpnLike(a)).toBe(false)
  })
})
