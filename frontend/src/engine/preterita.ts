/**
 * Análise de telefonia pretérita (extratos de chamadas das operadoras).
 *
 * Lê planilhas de registros históricos (ex.: Vivo "Relatório de chamadas" + "Endereço das ERBs",
 * abas WiFi/TuGO) e normaliza cada linha num evento único, preservando a linha original. A
 * geolocalização das ERBs vem do cruzamento do identificador de célula (CGI) com a aba de
 * endereços — nunca é inventada: célula sem coordenada fica marcada como "sem localização".
 *
 * Tudo roda no navegador; nada é enviado a servidor. As funções de parsing recebem linhas já
 * lidas (string[][]), para serem testáveis sem depender do binário .xlsx.
 */
import { parseCoord } from '../lib/coords'
import { readXlsx } from './xlsxRaw'

export type EventKind = 'voz' | 'sms' | 'dados' | 'outro'
export type EventDir = 'orig' | 'term' | 'unknown'

/** Um registro normalizado (uma linha da planilha). A linha original é preservada em `raw`. */
export type CdrEvent = {
  id: number
  file: string
  sheet: string
  row: number
  ts: string | null // ISO "AAAA-MM-DDTHH:MM:SS" (hora local do extrato)
  dateBr: string // "DD/MM/AAAA"
  time: string // "HH:MM:SS"
  target: string // linha sob análise (só dígitos)
  from: string // chamador (só dígitos)
  to: string // chamado (só dígitos)
  other: string // contraparte (o número que não é o alvo); '' se desconhecido
  dir: EventDir
  kind: EventKind
  status: string
  completed: boolean
  durationSec: number
  tech: string // GSM/WCDMA/LTE/… (lado do alvo)
  cgi: string // célula que atendeu o alvo; '' se não informado
  imei: string // IMEI do lado do alvo, se houver
  raw: Record<string, string> // célula→valor da linha original (cabeçalho→valor)
}

/** Dados de uma célula (CGI) vindos da aba de endereços das ERBs. */
export type ErbInfo = {
  cgi: string
  lat: number | null
  lon: number | null
  az: number | null
  sector: string | null
  tech: string | null
  uf: string | null
  city: string | null
  district: string | null
  address: string | null
  station: string | null // sigla/estação (ERB)
  found: boolean // tem coordenada confirmada
}

export type ParsedFile = {
  file: string
  events: CdrEvent[]
  erbs: Map<string, ErbInfo>
  target: string
  sheets: { name: string; kind: 'chamadas' | 'erbs' | 'wifi' | 'tugo' | 'desconhecida'; rows: number }[]
  warnings: string[]
}

// ---------------------------------------------------------------------------
// utilidades
// ---------------------------------------------------------------------------

const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

/** Só dígitos; descarta máscaras. Mantém '' se não sobrar nada. */
export const onlyDigits = (s: unknown) => String(s ?? '').replace(/\D/g, '')

/** "DD/MM/AAAA" + "HH:MM:SS" → ISO local, ou null se a data não for válida. */
export function toIso(dateBr: string, time: string): string | null {
  const d = dateBr.trim()
  const t = (time || '').trim()
  let y: number, mo: number, da: number
  let m = d.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    da = +m[1]
    mo = +m[2]
    y = +m[3]
    if (y < 100) y += y < 70 ? 2000 : 1900
  } else if ((m = d.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/))) {
    y = +m[1]
    mo = +m[2]
    da = +m[3]
  } else return null
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null
  const hm = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  const hh = hm ? +hm[1] : 0
  const mi = hm ? +hm[2] : 0
  const ss = hm && hm[3] ? +hm[3] : 0
  if (hh > 23 || mi > 59 || ss > 59) return null
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(y, 4)}-${p(mo)}-${p(da)}T${p(hh)}:${p(mi)}:${p(ss)}`
}

/** Segundos a partir de "30", "00:01:30" ou "1:30". */
export function toSeconds(v: unknown): number {
  const s = String(v ?? '').trim()
  if (!s) return 0
  if (/^\d+$/.test(s)) return +s
  const p = s.split(':').map((x) => +x)
  if (p.some((x) => Number.isNaN(x))) return 0
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2]
  if (p.length === 2) return p[0] * 60 + p[1]
  return 0
}

function kindOf(trafego: string): EventKind {
  const t = norm(trafego)
  if (/voz|voice|chamada|liga/.test(t)) return 'voz'
  if (/sms|torp|short|texto/.test(t)) return 'sms'
  if (/dado|gprs|data|internet|pacote|edge|3g|4g|5g/.test(t)) return 'dados'
  return t ? 'outro' : 'outro'
}

/** Acha a linha de cabeçalho: a primeira que contém pelo menos 2 rótulos conhecidos. */
function headerRow(rows: string[][], labels: string[]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map(norm)
    let hits = 0
    for (const l of labels) if (cells.some((c) => c.includes(l))) hits++
    if (hits >= 2) return i
  }
  return -1
}

/**
 * Mapa rótulo→índice de coluna por sinônimos. Casamento exato primeiro (todas as chaves), depois
 * por "contém" — assim "Chamado" não é capturado pela coluna "Chamador" (um é substring do outro).
 * Cada coluna é usada por no máximo uma chave.
 */
function colMap(header: string[], spec: Record<string, string[]>): Record<string, number> {
  const cells = header.map(norm)
  const out: Record<string, number> = {}
  const taken = new Set<number>()
  for (const key of Object.keys(spec)) out[key] = -1
  // passo 1: igualdade exata
  for (const [key, syns] of Object.entries(spec)) {
    for (let i = 0; i < cells.length; i++) {
      if (!taken.has(i) && syns.some((s) => cells[i] === s)) {
        out[key] = i
        taken.add(i)
        break
      }
    }
  }
  // passo 2: contém (para cabeçalhos com texto extra)
  for (const [key, syns] of Object.entries(spec)) {
    if (out[key] >= 0) continue
    for (let i = 0; i < cells.length; i++) {
      if (!taken.has(i) && cells[i] && syns.some((s) => cells[i].includes(s))) {
        out[key] = i
        taken.add(i)
        break
      }
    }
  }
  return out
}

const at = (row: string[], i: number) => (i >= 0 && i < row.length ? String(row[i] ?? '').trim() : '')

/** Procura "Linha: 11999999999" nas primeiras linhas (preâmbulo do extrato). */
function findTarget(rows: string[][]): string {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    for (const c of rows[i]) {
      const m = String(c ?? '').match(/linha\s*[:-]?\s*(\d{8,})/i)
      if (m) return m[1]
    }
  }
  return ''
}

// ---------------------------------------------------------------------------
// parsers
// ---------------------------------------------------------------------------

const CALL_COLS = {
  date: ['data', 'data evento', 'data inicio', 'data da chamada', 'data ini'],
  time: ['hora', 'hora inicio', 'hora ini', 'horario'],
  from: ['chamador', 'origem', 'numero origem', 'numero a', 'msisdn origem'],
  to: ['chamado', 'destino', 'numero destino', 'numero b', 'msisdn destino'],
  imeiFrom: ['imei chamador', 'imei origem', 'imei a'],
  imeiTo: ['imei chamado', 'imei destino', 'imei b'],
  dur: ['durac', 'duracao', 'duration', 'tempo'],
  status: ['status', 'situacao'],
  traf: ['tra', 'trafego', 'tipo', 'servico', 'evento'],
  locFrom: ['local origem', 'cgi origem', 'erb origem', 'celula origem'],
  locTo: ['local destino', 'cgi destino', 'erb destino', 'celula destino'],
  techFrom: ['tec origem', 'tecnologia origem'],
  techTo: ['tec destino', 'tecnologia destino'],
}

/** Lê uma aba de chamadas (CDR). `rows` é a aba inteira (incluindo preâmbulo). */
export function parseCallSheet(rows: string[][], file: string, sheet: string, fallbackTarget = ''): CdrEvent[] {
  const h = headerRow(rows, ['data', 'hora', 'chamado', 'chamador', 'duracao', 'durac'])
  if (h < 0) return []
  const header = rows[h]
  const c = colMap(header, CALL_COLS)
  if (c.date < 0 || (c.from < 0 && c.to < 0)) return []
  const target = fallbackTarget || findTarget(rows)
  const out: CdrEvent[] = []
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i]
    const dateBr = at(r, c.date)
    const time = at(r, c.time)
    // linha sem data aproveitável e sem números: ignora (rodapés "Não há registro…")
    const from = onlyDigits(at(r, c.from))
    const to = onlyDigits(at(r, c.to))
    if (!dateBr && !from && !to) continue
    if (/nao ha registro|sem registro/i.test(norm(at(r, 0)) + norm(at(r, c.from)))) continue
    const ts = toIso(dateBr, time)
    const dir: EventDir = target && from === target ? 'orig' : target && to === target ? 'term' : from && !to ? 'orig' : to && !from ? 'term' : 'unknown'
    const other = dir === 'orig' ? to : dir === 'term' ? from : to || from
    const cgi = dir === 'orig' ? at(r, c.locFrom) || at(r, c.locTo) : at(r, c.locTo) || at(r, c.locFrom)
    const tech = dir === 'orig' ? at(r, c.techFrom) || at(r, c.techTo) : at(r, c.techTo) || at(r, c.techFrom)
    const imei = dir === 'orig' ? at(r, c.imeiFrom) : at(r, c.imeiTo)
    const status = at(r, c.status)
    const raw: Record<string, string> = {}
    header.forEach((hc, j) => {
      const label = String(hc ?? '').trim()
      if (label) raw[label] = at(r, j)
    })
    out.push({
      id: 0,
      file,
      sheet,
      row: i + 1,
      ts,
      dateBr,
      time,
      target,
      from,
      to,
      other,
      dir,
      kind: kindOf(at(r, c.traf)),
      status,
      completed: /complet|entreg|sucesso|ok|conectad/.test(norm(status)) && !/nao complet|incomplet/.test(norm(status)),
      durationSec: toSeconds(at(r, c.dur)),
      tech: tech.replace(/\s+/g, ''),
      cgi: cgi.replace(/\s+/g, ''),
      imei: onlyDigits(imei),
      raw,
    })
  }
  return out
}

const ERB_COLS = {
  cgi: ['cgi', 'celula', 'cell', 'ecgi', 'identificador'],
  station: ['erb', 'estacao', 'site', 'nome erb'],
  sector: ['set', 'setor', 'sector'],
  az: ['azi', 'azimute', 'azimuth'],
  tech: ['tecnologia', 'tec'],
  lat: ['latitude', 'lat'],
  lon: ['longitude', 'lon', 'long'],
  uf: ['uf', 'estado'],
  city: ['cidade', 'municipio'],
  district: ['bairro'],
  address: ['endereco', 'logradouro'],
}

/** Lê a aba "Endereço das ERBs": CGI → coordenada/azimute/endereço. Coordenada ausente ⇒ found=false. */
export function parseErbSheet(rows: string[][]): Map<string, ErbInfo> {
  const h = headerRow(rows, ['cgi', 'latitude', 'longitude', 'azi', 'endereco', 'tecnologia'])
  const map = new Map<string, ErbInfo>()
  if (h < 0) return map
  const c = colMap(rows[h], ERB_COLS)
  if (c.cgi < 0) return map
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i]
    const cgi = at(r, c.cgi).replace(/\s+/g, '')
    // CGI vazio, "0" ou prefixo incompleto (sem os 3 campos LAC-CELL): ignora
    if (!cgi || /^0+$/.test(cgi) || !/\d+-\d+-\d+-\d+/.test(cgi)) continue
    const latR = at(r, c.lat)
    const lonR = at(r, c.lon)
    const notFound = /cadastro nao encontr/.test(norm(at(r, c.city)) + norm(at(r, c.address)))
    const la = !notFound && latR ? parseCoord(latR) : null
    const lo = !notFound && lonR ? parseCoord(lonR) : null
    const lat = la && Math.abs(la.v) <= 90 ? la.v : null
    const lon = lo && Math.abs(lo.v) <= 180 ? lo.v : null
    const azR = at(r, c.az).replace(',', '.')
    const az = azR !== '' && Number.isFinite(+azR) ? ((+azR % 360) + 360) % 360 : null
    const info: ErbInfo = {
      cgi,
      lat,
      lon,
      az,
      sector: at(r, c.sector) || null,
      tech: at(r, c.tech).replace(/\s+/g, '') || null,
      uf: at(r, c.uf) || null,
      city: notFound ? null : at(r, c.city) || null,
      district: at(r, c.district) || null,
      address: notFound ? null : at(r, c.address) || null,
      station: at(r, c.station) || null,
      found: lat !== null && lon !== null,
    }
    // mantém a melhor versão (com coordenada) se o CGI repetir
    const prev = map.get(cgi)
    if (!prev || (!prev.found && info.found)) map.set(cgi, info)
  }
  return map
}

function classify(header: string[]): ParsedFile['sheets'][number]['kind'] {
  const cells = header.map(norm)
  const has = (s: string) => cells.some((c) => c.includes(s))
  if (has('cgi') && (has('latitude') || has('endereco'))) return 'erbs'
  if (has('ip') && (has('porta') || has('trafego'))) return 'wifi'
  if ((has('chamador') || has('chamado')) && has('ip')) return 'tugo'
  if ((has('chamador') || has('chamado') || has('origem') || has('destino')) && has('data')) return 'chamadas'
  return 'desconhecida'
}

/** Divide o CSV em linhas de células (sniff de ; , ou tab). */
export function parseCsvRows(text: string): string[][] {
  const lines = text.split(/\r?\n/)
  const sample = lines.slice(0, 20).join('\n')
  const delim = (sample.match(/;/g)?.length ?? 0) >= (sample.match(/,/g)?.length ?? 0) ? ';' : (sample.includes('\t') ? '\t' : ',')
  const out: string[][] = []
  for (const line of lines) {
    if (line === '') continue
    // parser simples com aspas
    const cells: string[] = []
    let cur = ''
    let q = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (q) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"'
          i++
        } else if (ch === '"') q = false
        else cur += ch
      } else if (ch === '"') q = true
      else if (ch === delim) {
        cells.push(cur)
        cur = ''
      } else cur += ch
    }
    cells.push(cur)
    out.push(cells.map((x) => x.trim()))
  }
  return out
}

/** Lê um workbook .xlsx (Uint8Array) e devolve eventos + diretório de ERBs. */
export function readCdrWorkbook(buf: Uint8Array, file: string): ParsedFile {
  const { sheets } = readXlsx(buf)
  const warnings: string[] = []
  const events: CdrEvent[] = []
  const erbs = new Map<string, ErbInfo>()
  const meta: ParsedFile['sheets'] = []
  // primeiro, acha o alvo em qualquer aba
  let target = ''
  const perSheet: { name: string; rows: string[][] }[] = []
  for (const name of sheets) {
    const rd = readXlsx(buf, name)
    const rows = [...rd.rows()].map(([, cells]) => cells)
    perSheet.push({ name, rows })
    if (!target) target = findTarget(rows)
  }
  for (const { name, rows } of perSheet) {
    const h = headerRow(rows, ['data', 'hora', 'chamado', 'chamador', 'cgi', 'ip', 'latitude'])
    const kind = h >= 0 ? classify(rows[h]) : 'desconhecida'
    if (kind === 'erbs') {
      for (const [k, v] of parseErbSheet(rows)) if (!erbs.has(k) || (!erbs.get(k)!.found && v.found)) erbs.set(k, v)
      meta.push({ name, kind, rows: Math.max(0, rows.length - h - 1) })
    } else if (kind === 'chamadas' || kind === 'tugo' || kind === 'wifi') {
      const evs = parseCallSheet(rows, file, name, target)
      events.push(...evs)
      meta.push({ name, kind, rows: evs.length })
    } else {
      meta.push({ name, kind, rows: 0 })
    }
  }
  if (!events.length) warnings.push(`Nenhum registro de chamada reconhecido em "${file}".`)
  events.forEach((e, i) => (e.id = i + 1))
  return { file, events, erbs, target, sheets: meta, warnings }
}
