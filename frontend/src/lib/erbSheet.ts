/**
 * Planilha no modelo "eventos_da_operação" (o mesmo da planilha ERB_TESTE enviada como modelo):
 * exportação do Mapas ERB e leitura de volta, agrupando os eventos por ERB (com dias e horários).
 */
import { readXlsx } from '../engine/xlsxRaw'
import { parseCoord } from './coords'
import { downloadXlsx } from './xlsxBook'
import type { MapMark, SharedMap, SitePoint } from './shareMap'

export const MODEL_SHEET = 'eventos_da_operação'
export const MODEL_COLUMNS = [
  'Tipo',
  'ID Evento',
  'Evento',
  'Interceptação',
  'Alvo',
  'MONB Referência',
  'Direção',
  'Origem',
  'Destino',
  'Tipo Específico',
  'Data Início',
  'Data do evento',
  'Data Fim',
  'Duração',
  'URL/IP',
  'URL/IP Adicional',
  'Conteúdo',
  'Célula',
  'Comentários',
  'Latitude',
  'Longitude',
  'Azimute',
  'Raio',
  'Localização',
]

const KIND_LABEL: Record<string, string> = {
  casa: 'Residência',
  trabalho: 'Trabalho',
  alvo: 'Alvo',
  pessoa: 'Pessoa',
  veiculo: 'Veículo',
  local: 'Local',
  outro: 'Ponto',
  erb: 'ERB',
}

/** "AAAA-MM-DD HH:MM" → "DD/MM/AAAA HH:MM:00" */
const br = (t: string) => `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)} ${t.slice(11, 16)}:00`

function row(v: Partial<Record<(typeof MODEL_COLUMNS)[number], string | number | null>>) {
  return MODEL_COLUMNS.map((c) => v[c] ?? null)
}

/** Linhas da planilha: eventos das ERBs da análise (um por horário) e os pontos marcados. */
export function sheetRows(m: SharedMap, radius: number): (string | number | null)[][] {
  const rows: (string | number | null)[][] = []
  let id = 1
  for (const p of m.points) {
    const cells = (p.cl ?? []).map((c) => c[0])
    const az = (p.cl ?? []).map((c) => c[1]).filter((x) => x !== null)
    const base = {
      Célula: cells.join(' / ') || null,
      Latitude: +p.lat.toFixed(6),
      Longitude: +p.lon.toFixed(6),
      Azimute: az.length === 1 ? (az[0] as number) : az.join('/') || null,
      Raio: radius,
      Localização: p.name ?? null,
    }
    if (p.times?.length)
      for (const t of p.times) rows.push(row({ Tipo: 'Localização', 'ID Evento': id++, Evento: 'Registro de localização', 'Data Início': br(t), 'Data do evento': br(t), ...base }))
    else
      for (const [cell, a, n] of p.cl ?? [])
        rows.push(row({ Tipo: 'Localização', 'ID Evento': id++, Evento: 'ERB da análise', ...base, Célula: cell, Azimute: a, Comentários: n ? `${n} evento(s)` : null }))
  }
  for (const k of m.marks ?? []) {
    if (k.hidden) continue
    const erb = k.kind === 'erb'
    rows.push(
      row({
        Tipo: erb ? 'ERB' : 'Lugar',
        'ID Evento': id++,
        Evento: erb ? 'ERB marcada' : KIND_LABEL[k.kind],
        Célula: erb ? k.label : null,
        Comentários: k.label,
        Latitude: +k.lat.toFixed(6),
        Longitude: +k.lon.toFixed(6),
        Azimute: erb ? (k.az ?? null) : null,
        Raio: erb ? (k.dist ?? radius) : null,
        Localização: erb ? null : k.label,
      }),
    )
  }
  return rows
}

export async function exportSheet(m: SharedMap, radius: number, fileName: string) {
  await downloadXlsx(fileName, [{ name: MODEL_SHEET, columns: MODEL_COLUMNS, rows: sheetRows(m, radius) }])
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** "16/10/2026 09:26:39" ou "2026-10-16 09:26" → "2026-10-16 09:26" */
export function toIso(v: string): string | null {
  // aceita "16/10/2026 09:26:39", "09/10/2026–10:29:18" (Vigia), "16/10/26 09:26", "2026-10-16T09:26"
  let m = v.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\D+(\d{1,2}):(\d{2})/)
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')} ${m[4].padStart(2, '0')}:${m[5]}`
  m = v.match(/(\d{4})-(\d{2})-(\d{2})\D+(\d{1,2}):(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4].padStart(2, '0')}:${m[5]}`
  return null
}

/** `groups`: números (alvos) encontrados na coluna Alvo; cada ponto traz o índice em `g`. */
export type SheetImport = { points: SitePoint[]; marks: MapMark[]; rows: number; skipped: number; radius: number | null; groups: string[] }

/**
 * Lê uma planilha (xlsx ou csv) com colunas Latitude/Longitude (e, se houver, Azimute, Célula,
 * Raio, Data do evento, Localização): eventos viram ERBs da análise com dias e horários; linhas
 * "ERB"/"Lugar" exportadas pelo MARX voltam como pontos marcados.
 */
export async function importSheet(file: File): Promise<SheetImport> {
  const buf = new Uint8Array(await file.arrayBuffer())
  let rows: string[][]
  if (/\.csv$|\.txt$/i.test(file.name)) {
    const text = new TextDecoder().decode(buf)
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    const d = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ';' : ','
    rows = lines.map((l) => l.split(d).map((x) => x.replace(/^"|"$/g, '')))
  } else rows = [...readXlsx(buf).rows()].map(([, r]) => r)
  const h = rows.findIndex((r) => r.some((c) => norm(c ?? '') === 'latitude') && r.some((c) => norm(c ?? '') === 'longitude'))
  if (h < 0) throw new Error('A planilha precisa ter as colunas Latitude e Longitude.')
  const head = rows[h].map((c) => norm(c ?? ''))
  const col = (...names: string[]) => head.findIndex((c) => names.includes(c))
  const find = (ok: (c: string) => boolean) => head.findIndex(ok)
  const iLat = col('latitude')
  const iLon = col('longitude')
  const iAz = find((c) => c.startsWith('azimut'))
  const iCell = (() => {
    const i = col('celula', 'celula origem', 'cgi', 'erb', 'cell', 'cell id', 'eci', 'ci')
    return i >= 0 ? i : find((c) => c.startsWith('celula') || c.includes('cgi'))
  })()
  const iRaio = find((c) => c.startsWith('raio'))
  const iWhen = (() => {
    const i = col('data do evento', 'data inicio', 'data/hora', 'data hora', 'data e hora', 'inicio', 'incio', 'data/hora inicio', 'datahora')
    return i >= 0 ? i : find((c) => (c.startsWith('data') || c.includes('inicio') || c.includes('incio')) && !c.includes('fim'))
  })()
  const iHora = find((c) => (c === 'hora' || c.startsWith('hora ') || c === 'horario') && !c.includes('data'))
  const iLoc = find((c) => c.startsWith('localiza') || c.startsWith('endereco'))
  const iCity = col('cidade', 'municipio')
  const iUf = col('estado', 'uf')
  const iAlvo = find((c) => c === 'alvo' || c.startsWith('alvo') || c === 'msisdn' || c === 'numero do alvo' || c === 'linha')
  const iTipo = col('tipo')
  const iCom = col('comentarios')
  const towers = new Map<string, { lat: number; lon: number; g: number; name: string | null; cells: Map<string, [number | null, number]>; times: string[]; n: number }>()
  const groups: string[] = []
  const marks: MapMark[] = []
  let used = 0
  let skipped = 0
  let radius: number | null = null
  for (const r of rows.slice(h + 1)) {
    const la = parseCoord(String(r[iLat] ?? ''))
    const lo = parseCoord(String(r[iLon] ?? ''))
    if (!la || !lo || Math.abs(la.v) > 90 || Math.abs(lo.v) > 180 || (la.v === 0 && lo.v === 0)) {
      if ((r[iLat] ?? '') !== '' || (r[iLon] ?? '') !== '') skipped++
      continue
    }
    used++
    const azRaw = iAz >= 0 ? String(r[iAz] ?? '').trim() : ''
    const az = azRaw !== '' && Number.isFinite(+azRaw.replace(',', '.')) ? +azRaw.replace(',', '.') : null
    const raio = iRaio >= 0 ? +String(r[iRaio] ?? '').replace(',', '.') : NaN
    if (Number.isFinite(raio) && raio > 0) radius ??= raio
    const tipo = iTipo >= 0 ? norm(String(r[iTipo] ?? '')) : ''
    if (tipo === 'erb' || tipo === 'lugar') {
      const label = String((iCom >= 0 && r[iCom]) || (iCell >= 0 && r[iCell]) || (iLoc >= 0 && r[iLoc]) || (tipo === 'erb' ? 'ERB' : 'Lugar'))
      marks.push(
        tipo === 'erb'
          ? { lat: la.v, lon: lo.v, label, kind: 'erb', az, dist: Number.isFinite(raio) && raio > 0 ? raio : undefined, beam: 120 }
          : { lat: la.v, lon: lo.v, label, kind: 'outro' },
      )
      continue
    }
    const alvo = iAlvo >= 0 ? String(r[iAlvo] ?? '').replace(/\D/g, '') : ''
    let g = -1
    if (alvo) {
      g = groups.indexOf(alvo)
      if (g < 0) g = groups.push(alvo) - 1
    }
    const key = `${g}|${la.v.toFixed(5)},${lo.v.toFixed(5)}`
    let t = towers.get(key)
    if (!t) {
      const place = [
        iLoc >= 0 ? String(r[iLoc] ?? '').trim() : '',
        [
          iCity >= 0
            ? String(r[iCity] ?? '')
                .trim()
                .replace(/_/g, ' ')
            : '',
          iUf >= 0 ? String(r[iUf] ?? '').trim() : '',
        ]
          .filter(Boolean)
          .join('/'),
      ]
        .filter(Boolean)
        .join(' - ')
      towers.set(key, (t = { lat: la.v, lon: lo.v, g, name: place || null, cells: new Map(), times: [], n: 0 }))
    }
    t.n++
    const cell = iCell >= 0 && r[iCell] ? String(r[iCell]) : az !== null ? `setor ${az}°` : 'ERB'
    const c = t.cells.get(cell) ?? [az, 0]
    c[1]++
    t.cells.set(cell, c)
    const whenRaw = iWhen >= 0 ? String(r[iWhen] ?? '') : ''
    const when = toIso(whenRaw) ?? (iHora >= 0 ? toIso(`${whenRaw} ${String(r[iHora] ?? '')}`) : null)
    if (when) t.times.push(when)
  }
  const points: SitePoint[] = [...towers.values()].map((t) => {
    t.times.sort()
    return {
      lat: t.lat,
      lon: t.lon,
      events: t.n,
      voice: 0,
      sms: 0,
      data: 0,
      az: [...t.cells.values()].map((c) => c[0]).filter((x): x is number => x !== null),
      cells: [...t.cells.keys()],
      cl: [...t.cells].map(([cell, [az, n]]) => [cell, az, n] as [string, number | null, number]),
      ...(t.g >= 0 ? { g: t.g } : {}),
      first: t.times[0] ?? null,
      last: t.times[t.times.length - 1] ?? null,
      name: t.name,
      times: t.times.length ? t.times : undefined,
    }
  })
  return { points, marks, rows: used, skipped, radius, groups }
}
