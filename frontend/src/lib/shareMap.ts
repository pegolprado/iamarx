/**
 * Mapa compartilhável sem guardar nada no servidor.
 *
 * Os pontos do mapa (coordenadas das ERBs, azimutes, contagens e período) são compactados
 * e criptografados no navegador (AES-GCM 256, chave derivada da senha com PBKDF2-SHA256)
 * e vão inteiros no fragmento do link (#…). O fragmento nunca é enviado ao servidor nem
 * aparece em registros de acesso: quem recebe o link precisa da senha para abrir.
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
}

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
    ]),
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
    })),
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
