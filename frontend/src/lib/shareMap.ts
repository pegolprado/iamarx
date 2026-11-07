/**
 * Mapa compartilhável sem guardar nada no servidor.
 *
 * Os pontos do mapa (coordenadas das ERBs, azimutes, contagens e período) são compactados
 * e criptografados no navegador (AES-GCM 256, chave derivada da senha com PBKDF2-SHA256)
 * e vão inteiros no fragmento do link (#…). O fragmento nunca é enviado ao servidor nem
 * aparece em registros de acesso.
 *
 * Dois tipos de link:
 * - com senha ("m1"): quem recebe digita a senha, enviada por outro meio;
 * - direto ("m2"): a chave aleatória vai no próprio fragmento — abre só clicando. Continua
 *   criptografado e fora do servidor, mas qualquer pessoa com o link completo consegue abrir.
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'

export type SitePoint = {
  lat: number
  lon: number
  events: number
  voice: number
  sms: number
  data: number
  az: number[]
  cells: string[]
  first: string | null
  last: string | null
  name?: string | null
  numbers?: string[]
  /** células da torre: [célula, azimute, eventos] */
  cl?: [string, number | null, number][]
  /** dias e horários dos eventos nesta torre ("AAAA-MM-DD HH:MM") */
  times?: string[]
}

/** Ponto marcado à mão no mapa (ex.: residência do alvo). */
export type MapMark = { lat: number; lon: number; label: string; kind: 'casa' | 'trabalho' | 'outro' }

export type SharedMap = {
  v: 1
  title: string
  subtitle?: string
  by: string
  at: string
  exp: string | null
  period: [string | null, string | null]
  types: string
  numbers: string[]
  points: SitePoint[]
  /** setor desenhado: distância (m) e abertura (graus) */
  radius?: number
  beam?: number
  /** deslocamentos entre torres: [lat1, lon1, lat2, lon2, vezes] */
  path?: [number, number, number, number, number][]
  /** pontos marcados à mão */
  marks?: MapMark[]
}

const ITER = 250_000
const b64u = (u: Uint8Array) =>
  btoa(String.fromCharCode(...u))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const b64uBig = (u: Uint8Array) => {
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function keyFrom(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', strToU8(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
}

/** Senha aleatória fácil de ditar (sem 0/O/1/I): XXXX-XXXX-XXXX. */
export function randomPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const r = crypto.getRandomValues(new Uint8Array(12))
  const s = [...r].map((x) => abc[x % abc.length]).join('')
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`
}

/** Compacta os pontos: coordenadas com 5 casas e datas sem segundos. */
function pack(m: SharedMap) {
  return {
    ...m,
    points: m.points.map((p) => [
      Math.round(p.lat * 1e5),
      Math.round(p.lon * 1e5),
      p.events,
      p.voice,
      p.sms,
      p.data,
      p.az,
      p.cells.slice(0, 12),
      p.first?.slice(0, 16) ?? null,
      p.last?.slice(0, 16) ?? null,
      p.name ?? null,
      p.numbers ?? [],
      p.cl ?? null,
    ]),
    path: m.path?.map((x) => [Math.round(x[0] * 1e5), Math.round(x[1] * 1e5), Math.round(x[2] * 1e5), Math.round(x[3] * 1e5), x[4]]),
  }
}
function unpack(o: any): SharedMap {
  return {
    ...o,
    points: o.points.map((a: any[]) => ({
      lat: a[0] / 1e5,
      lon: a[1] / 1e5,
      events: a[2],
      voice: a[3],
      sms: a[4],
      data: a[5],
      az: a[6],
      cells: a[7],
      first: a[8],
      last: a[9],
      name: a[10],
      numbers: a[11],
      cl: a[12] ?? undefined,
    })),
    path: o.path?.map((x: number[]) => [x[0] / 1e5, x[1] / 1e5, x[2] / 1e5, x[3] / 1e5, x[4]]),
  }
}

/** Gera o fragmento "#m1.salt.iv.dados" com o mapa criptografado. */
export async function encryptMap(m: SharedMap, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await keyFrom(password, salt)
  const plain = deflateSync(strToU8(JSON.stringify(pack(m))), { level: 9 })
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain as BufferSource))
  return `m1.${b64u(salt)}.${b64u(iv)}.${b64uBig(ct)}`
}

/** Link direto ("m2"): chave aleatória no próprio fragmento — abre sem senha. */
export async function encryptMapOpen(m: SharedMap): Promise<string> {
  const raw = crypto.getRandomValues(new Uint8Array(32))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt'])
  const plain = deflateSync(strToU8(JSON.stringify(pack(m))), { level: 9 })
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain as BufferSource))
  return `m2.${b64u(raw)}.${b64u(iv)}.${b64uBig(ct)}`
}

export const isOpenLink = (fragment: string) => /^#?m[23]\./.test(fragment)

export async function decryptMapOpen(fragment: string): Promise<SharedMap> {
  const [ver, k, i, c] = fragment.replace(/^#/, '').split('.')
  if ((ver !== 'm2' && ver !== 'm3') || !k || !i || !c) throw new Error('Link incompleto ou corrompido. Peça um novo link a quem compartilhou.')
  const key = await crypto.subtle.importKey('raw', unb64u(k) as BufferSource, 'AES-GCM', false, ['decrypt'])
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(i) as BufferSource }, key, unb64u(c) as BufferSource)
  } catch {
    throw new Error('Link incompleto ou corrompido. Confira se o link foi copiado inteiro.')
  }
  const o = JSON.parse(strFromU8(inflateSync(new Uint8Array(plain))))
  return ver === 'm3' ? unpackV3(o) : unpack(o)
}

// ---------------------------------------------------------------- link curto ("m3")
// Formato compacto: sem nome de quem enviou, horários como diferenças em minutos (base 36),
// deslocamentos por índice da torre e chave AES-128 no próprio fragmento (abre só clicando).

const MIN = 60_000
const toMin = (s: string) => Math.round(Date.parse(s.replace(' ', 'T').slice(0, 16) + ':00Z') / MIN)
const fromMin = (m: number) => new Date(m * MIN).toISOString().slice(0, 16).replace('T', ' ')
function packTimes(t: string[]) {
  const v = t
    .map(toMin)
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  return v.map((x, i) => (i ? x - v[i - 1] : x).toString(36)).join(',')
}
function unpackTimes(s: string) {
  let acc = 0
  return s
    .split(',')
    .filter(Boolean)
    .map((x, i) => fromMin((acc = i ? acc + parseInt(x, 36) : parseInt(x, 36))))
}
const KINDS = ['casa', 'trabalho', 'outro'] as const

function packV3(m: SharedMap) {
  const key = (la: number, lo: number) => `${Math.round(la * 1e5)},${Math.round(lo * 1e5)}`
  const idx = new Map(m.points.map((p, i) => [key(p.lat, p.lon), i]))
  const o: any = {
    x: m.exp ? Math.round(Date.parse(m.exp) / MIN) : 0,
    p: m.points.map((p) => [
      Math.round(p.lat * 1e5),
      Math.round(p.lon * 1e5),
      p.events,
      p.name || 0,
      p.cl ?? p.az.map((a, j) => [p.cells[j] ?? '', a, 0]),
      p.times?.length ? packTimes(p.times) : 0,
    ]),
  }
  if (m.title && m.title !== 'Mapa de localização (ERBs)') o.t = m.title
  if (m.radius) o.r = m.radius
  if (m.beam) o.b = m.beam
  if (m.types && m.types !== 'todos os eventos') o.y = m.types
  if (m.numbers.length) o.n = m.numbers
  if (m.period[0]) o.pf = m.period[0].slice(0, 16)
  if (m.period[1]) o.pl = m.period[1].slice(0, 16)
  if (m.path?.length) o.w = m.path.map(([a, b, c, d, n]) => [idx.get(key(a, b)) ?? -1, idx.get(key(c, d)) ?? -1, n]).filter((x) => x[0] >= 0 && x[1] >= 0)
  if (m.marks?.length) o.k = m.marks.map((k) => [Math.round(k.lat * 1e5), Math.round(k.lon * 1e5), k.label, KINDS.indexOf(k.kind)])
  return o
}

function unpackV3(o: any): SharedMap {
  const points: SitePoint[] = o.p.map((a: any[]) => {
    const cl = (a[4] || []) as [string, number | null, number][]
    const times = a[5] ? unpackTimes(a[5]) : undefined
    return {
      lat: a[0] / 1e5,
      lon: a[1] / 1e5,
      events: a[2],
      voice: 0,
      sms: 0,
      data: 0,
      az: cl.map((c) => c[1]).filter((x): x is number => x !== null),
      cells: cl.map((c) => c[0]),
      cl,
      first: times?.[0] ?? null,
      last: times?.[times.length - 1] ?? null,
      name: a[3] || null,
      times,
    }
  })
  return {
    v: 1,
    title: o.t ?? 'Mapa de localização (ERBs)',
    by: '',
    at: '',
    exp: o.x ? new Date(o.x * MIN).toISOString() : null,
    period: [o.pf ?? null, o.pl ?? null],
    types: o.y ?? 'todos os eventos',
    numbers: o.n ?? [],
    points,
    radius: o.r,
    beam: o.b,
    path: (o.w ?? []).map(([i, j, n]: number[]) => [points[i].lat, points[i].lon, points[j].lat, points[j].lon, n]),
    marks: (o.k ?? []).map((k: any[]) => ({ lat: k[0] / 1e5, lon: k[1] / 1e5, label: k[2], kind: KINDS[k[3]] ?? 'outro' })),
  }
}

/** Link curto e direto ("m3"): abre só clicando; chave aleatória no fragmento, nada vai ao servidor. */
export async function encryptShare(m: SharedMap): Promise<string> {
  const raw = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt'])
  const plain = deflateSync(strToU8(JSON.stringify(packV3(m))), { level: 9 })
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain as BufferSource))
  return `m3.${b64u(raw)}.${b64u(iv)}.${b64uBig(ct)}`
}

/** Endereço público do link curto. */
export const shareUrl = (frag: string) => `${location.origin}/m#${frag}`

export class WrongPassword extends Error {}

export async function decryptMap(fragment: string, password: string): Promise<SharedMap> {
  const [ver, s, i, c] = fragment.replace(/^#/, '').split('.')
  if (ver !== 'm1' || !s || !i || !c) throw new Error('Link incompleto ou corrompido. Peça um novo link a quem compartilhou.')
  const key = await keyFrom(password, unb64u(s))
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(i) as BufferSource }, key, unb64u(c) as BufferSource)
  } catch {
    throw new WrongPassword('Senha incorreta.')
  }
  return unpack(JSON.parse(strFromU8(inflateSync(new Uint8Array(plain)))))
}

// ---------------------------------------------------------------- KML (Google Earth / Google Maps)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function dest(lat: number, lon: number, az: number, m: number): [number, number] {
  const a = (az * Math.PI) / 180
  return [lat + (m * Math.cos(a)) / 111320, lon + (m * Math.sin(a)) / (111320 * Math.cos((lat * Math.PI) / 180))]
}

export function toKml(m: Pick<SharedMap, 'title' | 'points'>, azLen = 400) {
  const pm = m.points
    .map((p) => {
      const desc = `Eventos: ${p.events} (voz ${p.voice}, SMS ${p.sms}, dados ${p.data})\nAzimute(s): ${p.az.join(', ') || '—'}\nCélulas: ${p.cells.join(', ')}\nPrimeiro: ${p.first ?? '—'}\nÚltimo: ${p.last ?? '—'}`
      const lines = p.az
        .map((az) => {
          const [la, lo] = dest(p.lat, p.lon, az, azLen)
          return `<Placemark><name>Azimute ${az}°</name><styleUrl>#az</styleUrl><LineString><coordinates>${p.lon},${p.lat},0 ${lo.toFixed(6)},${la.toFixed(6)},0</coordinates></LineString></Placemark>`
        })
        .join('')
      return `<Placemark><name>${esc(p.name || String(p.events))}</name><description>${esc(desc)}</description><styleUrl>#erb</styleUrl><Point><coordinates>${p.lon},${p.lat},0</coordinates></Point></Placemark>${lines}`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(m.title)}</name>
<description>Coordenadas das estações (antenas), não da localização do aparelho. Gerado pelo MARX.</description>
<Style id="erb"><IconStyle><color>ff2f6ee5</color><scale>1.1</scale></IconStyle></Style>
<Style id="az"><LineStyle><color>ff4d48e5</color><width>3</width></LineStyle></Style>
${pm}
</Document></kml>`
}
