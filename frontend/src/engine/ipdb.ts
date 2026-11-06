/**
 * IP → provedor (ASN) e IP → cidade/UF (Brasil) ou país (exterior), consultados no navegador
 * com a base compacta em /vendor/ipdb (gerada por scripts/build-ipdb.mjs). Nenhum IP é
 * enviado a serviços externos.
 *
 * Fontes: IPtoASN (PDDL 1.0) e "IP Geolocation by DB-IP" (CC BY 4.0). Estimativas: o
 * provedor é o dono do bloco; a cidade é aproximada e pode indicar a sede do provedor.
 */
import { gunzipSync } from 'fflate'

export type IpInfo = { asn: number | null; org: string | null; country: string | null; uf: string | null; city: string | null }

const NONE = 0xffffffff
type Table = { starts: Uint32Array | BigUint64Array; vals: Uint32Array }
type Db = { asn4: Table; asn6: Table; geo4: Table; geo6: Table; asnNames: string[]; geoNames: string[] }

let dbP: Promise<Db> | null = null

async function fetchGz(name: string) {
  const r = await fetch(`/vendor/ipdb/${name}.gz`)
  if (!r.ok) throw new Error(`base de IPs indisponível (${r.status})`)
  const u8 = new Uint8Array(await r.arrayBuffer())
  // o servidor pode já ter descompactado (Content-Encoding): só descompacta se ainda for gzip
  return u8[0] === 0x1f && u8[1] === 0x8b ? gunzipSync(u8) : u8
}

function table(u8: Uint8Array, v6: boolean): Table {
  const w = v6 ? 8 : 4
  const n = u8.length / (w + 4)
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const starts = v6 ? new BigUint64Array(n) : new Uint32Array(n)
  const vals = new Uint32Array(n)
  for (let i = 0; i < n; i++) {
    const o = i * (w + 4)
    if (v6) (starts as BigUint64Array)[i] = dv.getBigUint64(o, true)
    else (starts as Uint32Array)[i] = dv.getUint32(o, true)
    vals[i] = dv.getUint32(o + w, true)
  }
  return { starts, vals }
}

/** Carrega a base (uma vez por aba). */
export function loadIpdb(): Promise<Db> {
  dbP ??= (async () => {
    const [a4, a6, an, g4, g6, gn] = await Promise.all(['asn4.bin', 'asn6.bin', 'asn.json', 'geo4.bin', 'geo6.bin', 'geo.json'].map(fetchGz))
    const dec = new TextDecoder()
    return {
      asn4: table(a4, false),
      asn6: table(a6, true),
      geo4: table(g4, false),
      geo6: table(g6, true),
      asnNames: JSON.parse(dec.decode(an)),
      geoNames: JSON.parse(dec.decode(gn)),
    }
  })().catch((e) => {
    dbP = null
    throw e
  })
  return dbP
}

/** IPv4 → número; IPv6 → 64 bits mais altos. */
export function ipKey(ip: string): { v6: boolean; key: number | bigint } | null {
  const s = ip
    .trim()
    .replace(/^\[|\]$/g, '')
    .toLowerCase()
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
    const p = s.split('.').map(Number)
    if (p.some((x) => x > 255)) return null
    return { v6: false, key: ((p[0] * 256 + p[1]) * 256 + p[2]) * 256 + p[3] }
  }
  if (!s.includes(':')) return null
  const [head, tail] = s.split('::')
  const h = head ? head.split(':') : []
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : []
  const groups = tail !== undefined ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h
  if (groups.length < 4 || groups.some((g) => !/^[0-9a-f]{0,4}$/.test(g))) return null
  return { v6: true, key: groups.slice(0, 4).reduce((a, g) => (a << 16n) | BigInt(parseInt(g || '0', 16)), 0n) }
}

function find(t: Table, key: number | bigint): number {
  const s = t.starts as any
  let lo = 0
  let hi = s.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (s[mid] <= key) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans < 0 ? NONE : t.vals[ans]
}

export function lookupIp(db: Db, ip: string): IpInfo {
  const k = ipKey(ip)
  const out: IpInfo = { asn: null, org: null, country: null, uf: null, city: null }
  if (!k) return out
  const a = find(k.v6 ? db.asn6 : db.asn4, k.key)
  if (a !== NONE) {
    const [n, ...org] = db.asnNames[a].split('|')
    out.asn = Number(n) || null
    out.org = org.join('|') || null
    if (out.asn === 0) out.asn = out.org = null
  }
  const g = find(k.v6 ? db.geo6 : db.geo4, k.key)
  if (g !== NONE) {
    const [cc, uf, city] = db.geoNames[g].split('|')
    out.country = cc || null
    out.uf = uf || null
    out.city = city || null
  }
  return out
}

/** Provedores de nuvem/hospedagem/VPN: IP nessas redes sugere uso de VPN ou proxy. */
const VPN_HINTS =
  /\b(amazon|aws|google cloud|google-cloud|microsoft|azure|digitalocean|ovh|hetzner|m247|datacamp|cdn77|linode|akamai|vultr|choopa|leaseweb|packethub|proton|nord|tefincom|surfshark|expressvpn|mullvad|hostinger|contabo|oracle|alibaba|tencent|g-core|gcore|zenlayer|psychz|quadranet|colocrossing|hostwinds|kamatera|scaleway|ionos|private internet|ipxo|xtom|cogent)\b/i
/** Redes móveis (4G/5G) das operadoras no Brasil: TIM, Vivo móvel e Claro móvel. */
const MOBILE_ASN = new Set([26615, 26599, 22085])

export function isVpnLike(i: IpInfo) {
  return (!!i.country && i.country !== 'BR') || (!!i.org && VPN_HINTS.test(i.org))
}
export function isMobileNet(i: IpInfo) {
  return i.asn !== null && MOBILE_ASN.has(i.asn)
}
