/**
 * Localização de um alvo pelas ERBs registradas nos eventos (bilhetagem, interceptação,
 * relatórios de localização das operadoras). Consultas no banco em memória + cálculos
 * puros (testáveis) de padrões: provável residência, provável trabalho, ERBs frequentes.
 *
 * Tudo é estimativa por recorrência de antenas: a ERB não é a posição do aparelho.
 */
import { where } from './analytics'
import { q } from './db'

export type LocEvent = {
  id: number
  ts: string // horário local "AAAA-MM-DD HH:MM:SS"
  type: string
  dir: string | null
  other: string | null
  dur: number | null
  cell: string | null
  lat: number | null
  lon: number | null
  az: number | null
  address: string | null
  city: string | null
}

/** Alvos com eventos na análise, os com localização primeiro. */
export async function locationTargets() {
  return q(`SELECT e.target_number AS number, count(*)::INTEGER AS events,
      (count(*) FILTER (WHERE coalesce(c.lat, e.lat) IS NOT NULL))::INTEGER AS located,
      max(e.operator) AS operator, min(e.ts_local) AS first_event, max(e.ts_local) AS last_event
    FROM events e LEFT JOIN erb_cells c ON c.id = e.resolved_cell_id
    WHERE ${where({})} AND e.target_number IS NOT NULL AND e.event_type <> 'acesso'
    GROUP BY 1 ORDER BY located DESC, events DESC`)
}

/** Todos os eventos do alvo, em ordem cronológica, com a ERB (do documento ou do cadastro). */
export async function locationEvents(target: string): Promise<LocEvent[]> {
  const rows = await q(`SELECT e.id, CAST(e.ts_local AS VARCHAR) AS ts, e.event_type AS type, e.direction AS dir, e.other_number AS other, e.duration_s AS dur,
      coalesce(e.cgi, e.cell_key) AS cell, coalesce(c.lat, e.lat) AS lat, coalesce(c.lon, e.lon) AS lon, coalesce(c.azimuth, e.azimuth) AS az,
      coalesce(e.address, c.address) AS address, coalesce(e.city, c.site_name) AS city
    FROM events e LEFT JOIN erb_cells c ON c.id = e.resolved_cell_id
    WHERE ${where({ targets: [target] })} ORDER BY e.ts_utc, e.id`)
  for (const r of rows) {
    r.ts = String(r.ts).replace('T', ' ').slice(0, 19)
    if (r.cell) r.cell = String(r.cell).replace(/^CGI\|/, '')
  }
  return rows as LocEvent[]
}

// ---------------------------------------------------------------- cálculos puros

export const hourOf = (ts: string) => +ts.slice(11, 13)
export const weekdayOf = (ts: string) => new Date(`${ts.slice(0, 10)}T00:00:00Z`).getUTCDay() // 0 = domingo

/** Período noturno (20h–6h) ou fim de semana: indica onde o alvo costuma estar fora do trabalho. */
export const isHomeTime = (ts: string) => {
  const h = hourOf(ts)
  const d = weekdayOf(ts)
  return d === 0 || d === 6 || h >= 20 || h < 6
}
/** Dias úteis, 8h–18h. */
export const isWorkTime = (ts: string) => {
  const h = hourOf(ts)
  const d = weekdayOf(ts)
  return d >= 1 && d <= 5 && h >= 8 && h < 18
}

export type CellStat = {
  cell: string
  lat: number | null
  lon: number | null
  az: number | null
  address: string | null
  city: string | null
  n: number
  pct: number
  first: string
  last: string
}

/** ERBs (células) por quantidade de eventos; `pct` sobre o total de eventos informado. */
export function rankCells(events: LocEvent[], total = events.length): CellStat[] {
  const by = new Map<string, CellStat>()
  for (const e of events) {
    if (!e.cell) continue
    const s = by.get(e.cell) ?? { cell: e.cell, lat: e.lat, lon: e.lon, az: e.az, address: e.address, city: e.city, n: 0, pct: 0, first: e.ts, last: e.ts }
    s.n++
    if (e.ts < s.first) s.first = e.ts
    if (e.ts > s.last) s.last = e.ts
    s.lat ??= e.lat
    s.lon ??= e.lon
    s.az ??= e.az
    s.address ??= e.address
    s.city ??= e.city
    by.set(e.cell, s)
  }
  return [...by.values()].map((s) => ({ ...s, pct: total ? (s.n / total) * 100 : 0 })).sort((a, b) => b.n - a.n)
}

export type Tower = { key: string; lat: number; lon: number; n: number; cells: CellStat[]; address: string | null; city: string | null }

/** Torres (mesma coordenada) com as células (setores) de cada uma. */
export function towers(cells: CellStat[]): Tower[] {
  const by = new Map<string, Tower>()
  for (const c of cells) {
    if (c.lat === null || c.lon === null) continue
    const key = `${c.lat.toFixed(5)},${c.lon.toFixed(5)}`
    const t = by.get(key) ?? { key, lat: c.lat, lon: c.lon, n: 0, cells: [], address: c.address, city: c.city }
    t.n += c.n
    t.cells.push(c)
    by.set(key, t)
  }
  return [...by.values()].sort((a, b) => b.n - a.n)
}

/** Deslocamentos: pares de torres diferentes registradas em sequência, com quantas vezes ocorreram. */
export function transitions(events: LocEvent[]) {
  const by = new Map<string, { a: [number, number]; b: [number, number]; n: number }>()
  let prev: LocEvent | null = null
  for (const e of events) {
    if (e.lat === null || e.lon === null) continue
    if (prev && (prev.lat !== e.lat || prev.lon !== e.lon)) {
      const a: [number, number] = [prev.lat!, prev.lon!]
      const b: [number, number] = [e.lat, e.lon]
      const k = [a.join(','), b.join(',')].sort().join('|')
      const t = by.get(k) ?? { a, b, n: 0 }
      t.n++
      by.set(k, t)
    }
    prev = e
  }
  return [...by.values()]
}

export function locationPatterns(events: LocEvent[]) {
  const total = events.length
  const home =
    rankCells(
      events.filter((e) => isHomeTime(e.ts)),
      total,
    )[0] ?? null
  const work =
    rankCells(
      events.filter((e) => isWorkTime(e.ts)),
      total,
    )[0] ?? null
  const top = rankCells(events, total).slice(0, 10)
  const byDay = new Map<string, number>()
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, n: 0 }))
  for (const e of events) {
    byDay.set(e.ts.slice(0, 10), (byDay.get(e.ts.slice(0, 10)) ?? 0) + 1)
    byHour[hourOf(e.ts)].n++
  }
  const days = [...byDay.entries()].sort().map(([day, n]) => ({ day, n }))
  const located = events.filter((e) => e.lat !== null).length
  return { total, located, home, work, top, days, byHour, first: events[0]?.ts ?? null, last: events[events.length - 1]?.ts ?? null }
}
