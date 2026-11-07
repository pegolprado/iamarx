/**
 * Leitura de coordenadas e de linhas de extratos para o Mapas ERB.
 *
 * Formatos de coordenada aceitos:
 *   decimal ........ -26.25623 | -26,25623 | 38.959390N
 *   sexagesimal .... 43°38'19.39"N | 26 51 07.2 S (com símbolos)
 *   traços ......... -26-51-07,20
 *   E7 ............. -389593901 (graus × 10⁷)
 *
 * Linhas aceitas (qualquer texto entre os valores é ignorado):
 *   "-26.25623 -49.2562"            → lugar
 *   "250 -26.25623 -49.2562"        → ERB com azimute 250°
 *   "-26.25623 -49.2562 250"        → ERB com azimute 250°
 *   "10  -26-52-54,00  -49-08-31,00" (extrato Vivo)
 *   linhas com "|" (PDF TIM e afins)
 *   links do próprio MARX e do Mapas/PCSC (?t=e&d=…)
 */

export type ParsedItem = { name?: string; lat: number; lon: number; az: number | null; dist?: number; beam?: number }

const DMS = /^([-+]?)(\d{1,3})\s*[°º:dD ]\s*(\d{1,2})\s*['’′:mM ]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:["”″]|''|sS)?\s*([NSEWLOnsewlo])?$/
const DASHED = /^([-+]?)(\d{1,3})-(\d{1,2})-(\d{1,2}(?:[.,]\d+)?)([NSEWLOnsewlo])?$/
const DEC = /^([-+]?\d{1,3}[.,]\d{1,})\s*°?\s*([NSEWLOnsewlo])?$/
const E7 = /^[-+]?\d{8,10}$/

function hemi(v: number, h?: string) {
  if (!h) return v
  const u = h.toUpperCase()
  return u === 'S' || u === 'W' || u === 'O' ? -Math.abs(v) : Math.abs(v)
}
const axisOf = (h?: string) => (!h ? null : 'NS'.includes(h.toUpperCase()) ? 'lat' : 'lon')

/** Converte um texto em coordenada (graus decimais) ou null. */
export function parseCoord(raw: string): { v: number; axis: 'lat' | 'lon' | null } | null {
  const t = raw.trim().replace(/\s+/g, ' ')
  let m = t.match(DMS)
  if (m) {
    const v = (+m[2] + +m[3] / 60 + +m[4].replace(',', '.') / 3600) * (m[1] === '-' ? -1 : 1)
    return { v: hemi(v, m[5]), axis: axisOf(m[5]) }
  }
  m = t.match(DASHED)
  if (m) {
    const v = (+m[2] + +m[3] / 60 + +m[4].replace(',', '.') / 3600) * (m[1] === '-' ? -1 : 1)
    return { v: hemi(v, m[5]), axis: axisOf(m[5]) }
  }
  m = t.match(DEC)
  if (m) return { v: hemi(+m[1].replace(',', '.'), m[2]), axis: axisOf(m[2]) }
  if (E7.test(t)) {
    const v = +t / 1e7
    if (Math.abs(v) <= 180) return { v, axis: null }
  }
  return null
}

const AZ = /^(\d{1,3}(?:[.,]\d+)?)\s*°?$/

/** Junta tokens de coordenada sexagesimal escritos com espaços ("43° 38' 19.39\" N"). */
function tokens(line: string) {
  const parts = line
    .replace(/\t/g, ' ')
    .split(/[|;]|\s{2,}|\s(?=[-+]?\d)|(?<=[NSEWLOnsewlo"”″])\s/)
    .map((x) => x.trim())
    .filter(Boolean)
  // também tenta cada palavra isolada (linhas com um espaço só entre valores)
  return parts.flatMap((p) => (parseCoord(p) || AZ.test(p) ? [p] : p.split(/\s+/)))
}

/** Lê uma linha: coordenadas (2) e, se houver, um azimute. */
export function parseLine(line: string): ParsedItem | null {
  const toks = tokens(line)
  const coords: { v: number; axis: 'lat' | 'lon' | null; i: number }[] = []
  toks.forEach((tk, i) => {
    const c = parseCoord(tk)
    if (c) coords.push({ ...c, i })
  })
  if (coords.length < 2) return null
  let [a, b] = coords
  // com hemisfério explícito, respeita N/S e E/W
  if (a.axis === 'lon' || b.axis === 'lat') [a, b] = [b, a]
  let lat = a.v
  let lon = b.v
  // ordem invertida (longitude antes da latitude)
  if (Math.abs(lat) > 90 || (!a.axis && lat < -34 && lat > -75 && lon > -35 && lon < 7)) [lat, lon] = [lon, lat]
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  const used = new Set([a.i, b.i])
  let az: number | null = null
  for (let i = 0; i < toks.length; i++) {
    if (used.has(i)) continue
    const m = toks[i].match(AZ)
    if (m) {
      const v = +m[1].replace(',', '.')
      if (v >= 0 && v <= 360) {
        az = v
        break
      }
    }
  }
  // nome: texto (com letras) antes da primeira coordenada, ex.: "GABRIEL - 5799 - 08h59|-23.6|-46.9|240"
  const first = toks[Math.min(a.i, b.i)]
  const at = line.indexOf(first)
  const lead =
    at > 0
      ? line
          .slice(0, at)
          .replace(/[|;\t,\s]+$/, '')
          .trim()
      : ''
  const name = /\p{L}/u.test(lead) && lead.length <= 80 ? lead : undefined
  return { lat, lon, az, ...(name ? { name } : {}) }
}

/** Link do Mapas/PCSC: ?t=e&d=<base64> com "nome&@tipo&@lat&@lon&@az&@abertura&@distância&$…". */
export function parsePcscUrl(url: string): ParsedItem[] | null {
  const m = url.match(/[?&]d=([A-Za-z0-9_\-+/=]+)/)
  if (!m) return null
  let txt: string
  try {
    const b = m[1].replace(/-/g, '+').replace(/_/g, '/')
    txt = new TextDecoder().decode(Uint8Array.from(atob(b + '='.repeat((4 - (b.length % 4)) % 4)), (c) => c.charCodeAt(0)))
  } catch {
    return null
  }
  const out: ParsedItem[] = []
  for (const rec of txt.split('&$')) {
    const f = rec.split('&@')
    const lat = parseFloat(f[2])
    const lon = parseFloat(f[3])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const az = f[4] !== undefined && f[4] !== '' ? parseFloat(f[4]) : NaN
    const beam = parseFloat(f[5])
    const dist = parseFloat(f[6])
    out.push({
      name: f[0] || undefined,
      lat,
      lon,
      az: Number.isFinite(az) ? az : null,
      beam: Number.isFinite(beam) ? beam : undefined,
      dist: Number.isFinite(dist) ? dist : undefined,
    })
  }
  return out.length ? out : null
}

/** Lê o campo de entrada inteiro: uma linha por item; devolve os itens e as linhas não reconhecidas. */
export function parseInput(text: string): { items: ParsedItem[]; failed: string[] } {
  const items: ParsedItem[] = []
  const failed: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (/^https?:\/\//i.test(line) && /[?&]d=/.test(line)) {
      const r = parsePcscUrl(line)
      if (r) items.push(...r)
      else failed.push(line)
      continue
    }
    const p = parseLine(line)
    if (p) items.push(p)
    else failed.push(line)
  }
  return { items, failed }
}
