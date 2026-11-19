/**
 * Análise dos eventos de telefonia pretérita: indicadores, séries temporais, ranking de
 * números, uso de ERBs, geolocalização (pontos para o mapa) e um relatório automático
 * fundamentado — todos os números vêm dos registros importados; nada é presumido ou inventado.
 */
import type { SitePoint } from '../lib/shareMap'
import type { CdrEvent, ErbInfo, EventDir, EventKind, ParsedFile } from './preterita'

export type CdrFilter = {
  days: string[] // "AAAA-MM-DD"; [] = todos
  from: number // minuto do dia (0..1439); from===to = dia inteiro
  to: number
  number: string // trecho do número (contraparte/origem/destino)
  kinds: EventKind[] // [] = todos
  dirs: EventDir[] // [] = todas
  tech: string // trecho da tecnologia
  status: 'all' | 'completed' | 'failed'
  cgi: string // trecho do CGI
  city: string // trecho da cidade da ERB
  file: string // arquivo de origem ('' = todos)
  minDur: number // duração mínima (s)
}

export const EMPTY_CDR_FILTER: CdrFilter = { days: [], from: 0, to: 0, number: '', kinds: [], dirs: [], tech: '', status: 'all', cgi: '', city: '', file: '', minDur: 0 }

export function hourInWindow(min: number, from: number, to: number): boolean {
  if (from === to) return true
  if (from < to) return min >= from && min < to
  return min >= from || min < to
}

const minOf = (ts: string) => +ts.slice(11, 13) * 60 + +ts.slice(14, 16)

/** Dados consolidados de vários arquivos. */
export type Dataset = { events: CdrEvent[]; erbs: Map<string, ErbInfo>; targets: string[]; files: string[] }

export function mergeFiles(files: ParsedFile[]): Dataset {
  const events: CdrEvent[] = []
  const erbs = new Map<string, ErbInfo>()
  const targets = new Set<string>()
  for (const f of files) {
    for (const e of f.events) events.push({ ...e, id: events.length + 1 })
    for (const [k, v] of f.erbs) if (!erbs.has(k) || (!erbs.get(k)!.found && v.found)) erbs.set(k, v)
    if (f.target) targets.add(f.target)
  }
  events.sort((a, b) => (a.ts ?? '').localeCompare(b.ts ?? ''))
  return { events, erbs, targets: [...targets], files: files.map((f) => f.file) }
}

export function filterActive(f: CdrFilter): boolean {
  return (
    f.days.length > 0 ||
    f.from !== f.to ||
    !!f.number ||
    f.kinds.length > 0 ||
    f.dirs.length > 0 ||
    !!f.tech ||
    f.status !== 'all' ||
    !!f.cgi ||
    !!f.city ||
    !!f.file ||
    f.minDur > 0
  )
}

export function applyFilter(events: CdrEvent[], erbs: Map<string, ErbInfo>, f: CdrFilter): CdrEvent[] {
  if (!filterActive(f)) return events
  const num = f.number.replace(/\D/g, '')
  const tech = f.tech.toLowerCase()
  const cgi = f.cgi.replace(/\s+/g, '')
  const city = f.city.toLowerCase()
  return events.filter((e) => {
    if (f.file && e.file !== f.file) return false
    if (f.kinds.length && !f.kinds.includes(e.kind)) return false
    if (f.dirs.length && !f.dirs.includes(e.dir)) return false
    if (f.status === 'completed' && !e.completed) return false
    if (f.status === 'failed' && e.completed) return false
    if (f.minDur && e.durationSec < f.minDur) return false
    if (num && !(e.other.includes(num) || e.from.includes(num) || e.to.includes(num))) return false
    if (tech && !e.tech.toLowerCase().includes(tech)) return false
    if (cgi && !e.cgi.includes(cgi)) return false
    if (city) {
      const ci = (erbs.get(e.cgi)?.city ?? '').toLowerCase()
      if (!ci.includes(city)) return false
    }
    if (e.ts) {
      if (f.days.length && !f.days.includes(e.ts.slice(0, 10))) return false
      if (f.from !== f.to && !hourInWindow(minOf(e.ts), f.from, f.to)) return false
    } else if (f.days.length || f.from !== f.to) return false
    return true
  })
}

export function distinctDays(events: CdrEvent[]): string[] {
  const s = new Set<string>()
  for (const e of events) if (e.ts) s.add(e.ts.slice(0, 10))
  return [...s].sort()
}

export type ContactStat = {
  number: string
  total: number
  orig: number
  term: number
  voz: number
  sms: number
  dados: number
  talkSec: number
  first: string | null
  last: string | null
}

export type ErbUsage = {
  cgi: string
  info: ErbInfo | null
  count: number
  first: string | null
  last: string | null
}

const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export type CdrStats = {
  total: number
  completed: number
  failed: number
  byDir: Record<EventDir, number>
  byKind: Record<EventKind, number>
  distinctOthers: number
  distinctCgi: number
  distinctSites: number
  erbWithGeo: number
  erbNoGeo: number
  period: [string | null, string | null]
  talkSec: number
  byDay: { x: string; voz: number; sms: number; dados: number; outro: number; total: number }[]
  byHour: { x: string; total: number }[]
  byWeekday: { x: string; total: number }[]
  byMonth: { x: string; total: number }[]
  contacts: ContactStat[]
  erbs: ErbUsage[]
  sites: SitePoint[]
  noCoordCgis: string[]
  issues: { label: string; count: number }[]
}

export function analyze(events: CdrEvent[], erbDir: Map<string, ErbInfo>): CdrStats {
  const byDir: Record<EventDir, number> = { orig: 0, term: 0, unknown: 0 }
  const byKind: Record<EventKind, number> = { voz: 0, sms: 0, dados: 0, outro: 0 }
  const others = new Set<string>()
  const cgis = new Set<string>()
  const dayMap = new Map<string, { voz: number; sms: number; dados: number; outro: number; total: number }>()
  const hour = Array.from({ length: 24 }, () => 0)
  const wd = Array.from({ length: 7 }, () => 0)
  const monthMap = new Map<string, number>()
  const contacts = new Map<string, ContactStat>()
  const erbUse = new Map<string, ErbUsage>()
  let completed = 0
  let talk = 0
  let minTs: string | null = null
  let maxTs: string | null = null
  let badDate = 0
  const seen = new Set<string>()
  let dup = 0

  for (const e of events) {
    byDir[e.dir]++
    byKind[e.kind]++
    if (e.completed) completed++
    if (e.kind === 'voz' && e.completed) talk += e.durationSec
    if (e.other) others.add(e.other)
    if (e.cgi) {
      cgis.add(e.cgi)
      const u = erbUse.get(e.cgi) ?? { cgi: e.cgi, info: erbDir.get(e.cgi) ?? null, count: 0, first: null, last: null }
      u.count++
      if (e.ts) {
        if (!u.first || e.ts < u.first) u.first = e.ts
        if (!u.last || e.ts > u.last) u.last = e.ts
      }
      erbUse.set(e.cgi, u)
    }
    if (e.other) {
      const c = contacts.get(e.other) ?? { number: e.other, total: 0, orig: 0, term: 0, voz: 0, sms: 0, dados: 0, talkSec: 0, first: null, last: null }
      c.total++
      if (e.dir === 'orig') c.orig++
      else if (e.dir === 'term') c.term++
      if (e.kind === 'voz') c.voz++
      else if (e.kind === 'sms') c.sms++
      else if (e.kind === 'dados') c.dados++
      c.talkSec += e.kind === 'voz' && e.completed ? e.durationSec : 0
      if (e.ts) {
        if (!c.first || e.ts < c.first) c.first = e.ts
        if (!c.last || e.ts > c.last) c.last = e.ts
      }
      contacts.set(e.other, c)
    }
    if (e.ts) {
      const day = e.ts.slice(0, 10)
      const d = dayMap.get(day) ?? { voz: 0, sms: 0, dados: 0, outro: 0, total: 0 }
      d[e.kind]++
      d.total++
      dayMap.set(day, d)
      hour[+e.ts.slice(11, 13)]++
      wd[new Date(`${day}T12:00:00`).getDay()]++
      const mon = e.ts.slice(0, 7)
      monthMap.set(mon, (monthMap.get(mon) ?? 0) + 1)
      if (!minTs || e.ts < minTs) minTs = e.ts
      if (!maxTs || e.ts > maxTs) maxTs = e.ts
    } else if (e.dateBr) badDate++
    const key = `${e.file}|${e.ts}|${e.from}|${e.to}|${e.cgi}|${e.kind}|${e.durationSec}`
    if (seen.has(key)) dup++
    else seen.add(key)
  }

  // sites geolocalizados: agrupa CGIs com coordenada por estação (lat,lon)
  type SiteAcc = { lat: number; lon: number; events: number; az: Set<number>; first: string | null; last: string | null; name: string; cl: Map<string, [number | null, number]> }
  const siteMap = new Map<string, SiteAcc>()
  for (const u of erbUse.values()) {
    const info = u.info
    if (!info?.found || info.lat === null || info.lon === null) continue
    const key = `${info.lat.toFixed(5)},${info.lon.toFixed(5)}`
    let s = siteMap.get(key)
    if (!s) {
      s = {
        lat: info.lat,
        lon: info.lon,
        events: 0,
        az: new Set<number>(),
        first: null,
        last: null,
        name: [info.address, info.district, info.city].filter(Boolean).join(' · ') || info.station || info.cgi,
        cl: new Map(),
      }
      siteMap.set(key, s)
    }
    s.events += u.count
    if (info.az !== null) s.az.add(info.az)
    s.cl.set(info.cgi, [info.az, u.count])
    if (u.first && (!s.first || u.first < s.first)) s.first = u.first
    if (u.last && (!s.last || u.last > s.last)) s.last = u.last
  }
  const sites: SitePoint[] = [...siteMap.values()].map((s) => ({
    lat: s.lat,
    lon: s.lon,
    events: s.events,
    voice: 0,
    sms: 0,
    data: 0,
    az: [...s.az],
    cells: [...s.cl.keys()],
    cl: [...s.cl.entries()].map(([cell, [az, n]]) => [cell, az, n] as [string, number | null, number]),
    first: s.first,
    last: s.last,
    name: s.name,
  }))

  const noCoordCgis = [...erbUse.values()].filter((u) => !u.info?.found).map((u) => u.cgi)
  const byDay = [...dayMap.entries()].sort().map(([x, v]) => ({ x, ...v }))
  const issues: { label: string; count: number }[] = []
  if (badDate) issues.push({ label: 'Registros com data/horário inválidos', count: badDate })
  if (dup) issues.push({ label: 'Registros duplicados (mesma linha repetida)', count: dup })
  if (noCoordCgis.length) issues.push({ label: 'Células (CGI) sem coordenada confirmada', count: noCoordCgis.length })
  const unknownDir = byDir.unknown
  if (unknownDir) issues.push({ label: 'Registros sem direção definida (origem/destino)', count: unknownDir })

  return {
    total: events.length,
    completed,
    failed: events.length - completed,
    byDir,
    byKind,
    distinctOthers: others.size,
    distinctCgi: cgis.size,
    distinctSites: sites.length,
    erbWithGeo: [...erbUse.values()].filter((u) => u.info?.found).length,
    erbNoGeo: noCoordCgis.length,
    period: [minTs, maxTs],
    talkSec: talk,
    byDay,
    byHour: hour.map((total, h) => ({ x: String(h).padStart(2, '0'), total })),
    byWeekday: wd.map((total, i) => ({ x: WD[i], total })),
    byMonth: [...monthMap.entries()].sort().map(([x, total]) => ({ x, total })),
    contacts: [...contacts.values()].sort((a, b) => b.total - a.total),
    erbs: [...erbUse.values()].sort((a, b) => b.count - a.count),
    sites,
    noCoordCgis,
    issues,
  }
}

/**
 * Converte o extrato (eventos + diretório de ERBs) em antenas para o mapa de ERBs, no padrão do
 * app público: um ponto por estação (lat/lon), com setores por azimute (cl), contagem de registros,
 * e os dias/horários dos eventos para o filtro por dia e hora. Só entram células com coordenada
 * confirmada — nenhuma posição é presumida.
 */
export function cdrErbPoints(events: CdrEvent[], erbDir: Map<string, ErbInfo>): SitePoint[] {
  type Acc = {
    lat: number
    lon: number
    events: number
    voice: number
    sms: number
    data: number
    az: Set<number>
    cl: Map<string, [number | null, number]>
    times: string[]
    name: string
    first: string | null
    last: string | null
  }
  const sites = new Map<string, Acc>()
  for (const e of events) {
    if (!e.cgi) continue
    const info = erbDir.get(e.cgi)
    if (!info?.found || info.lat === null || info.lon === null) continue
    const key = `${info.lat.toFixed(5)},${info.lon.toFixed(5)}`
    let s = sites.get(key)
    if (!s) {
      s = {
        lat: info.lat,
        lon: info.lon,
        events: 0,
        voice: 0,
        sms: 0,
        data: 0,
        az: new Set<number>(),
        cl: new Map(),
        times: [],
        name: [info.address, info.district, info.city].filter(Boolean).join(' · ') || info.station || info.cgi,
        first: null,
        last: null,
      }
      sites.set(key, s)
    }
    s.events++
    if (e.kind === 'voz') s.voice++
    else if (e.kind === 'sms') s.sms++
    else if (e.kind === 'dados') s.data++
    if (info.az !== null) s.az.add(info.az)
    const cur = s.cl.get(e.cgi) ?? [info.az, 0]
    cur[1]++
    s.cl.set(e.cgi, cur)
    if (e.ts) {
      const t = `${e.ts.slice(0, 10)} ${e.ts.slice(11, 16)}`
      s.times.push(t)
      if (!s.first || e.ts < s.first) s.first = e.ts
      if (!s.last || e.ts > s.last) s.last = e.ts
    }
  }
  return [...sites.values()]
    .sort((a, b) => b.events - a.events)
    .map((s) => ({
      lat: s.lat,
      lon: s.lon,
      events: s.events,
      voice: s.voice,
      sms: s.sms,
      data: s.data,
      az: [...s.az],
      cells: [...s.cl.keys()],
      cl: [...s.cl.entries()].map(([cell, [az, n]]) => [cell, az, n] as [string, number | null, number]),
      first: s.first ? `${s.first.slice(0, 10)} ${s.first.slice(11, 16)}` : null,
      last: s.last ? `${s.last.slice(0, 10)} ${s.last.slice(11, 16)}` : null,
      name: s.name,
      times: s.times.length ? s.times.sort() : undefined,
    }))
}

const fmt = (n: number) => n.toLocaleString('pt-BR')
const hhmmss = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${h}h ${String(m).padStart(2, '0')}m ${String(ss).padStart(2, '0')}s`
}
const brDate = (ts: string | null) => (ts ? `${ts.slice(8, 10)}/${ts.slice(5, 7)}/${ts.slice(0, 4)} ${ts.slice(11, 16)}` : '—')

/**
 * Relatório automático fundamentado: só afirma o que os números dos registros sustentam,
 * sempre com a contagem de apoio. Não infere vínculo pessoal nem presença física.
 */
export function autoReport(st: CdrStats, ds: Dataset): string[] {
  if (!st.total) return ['Nenhum registro importado.']
  const out: string[] = []
  const alvo = ds.targets.length ? ds.targets.join(', ') : 'não identificado na planilha'
  out.push(
    `Foram analisados ${fmt(st.total)} registros (linha(s) sob análise: ${alvo}), no período de ${brDate(st.period[0])} a ${brDate(st.period[1])}, a partir de ${ds.files.length} arquivo(s).`,
  )
  out.push(
    `Do total, ${fmt(st.completed)} foram concluídos e ${fmt(st.failed)} não concluídos. Por tipo: ${fmt(st.byKind.voz)} de voz, ${fmt(st.byKind.sms)} de SMS, ${fmt(st.byKind.dados)} de dados. Direção: ${fmt(st.byDir.orig)} originados pelo alvo e ${fmt(st.byDir.term)} recebidos. Tempo total de conversação (voz concluída): ${hhmmss(st.talkSec)}.`,
  )
  const topDay = [...st.byDay].sort((a, b) => b.total - a.total)[0]
  if (topDay) out.push(`O dia com mais registros foi ${topDay.x.slice(8, 10)}/${topDay.x.slice(5, 7)}/${topDay.x.slice(0, 4)}, com ${fmt(topDay.total)} registros.`)
  const topHour = [...st.byHour].sort((a, b) => b.total - a.total)[0]
  if (topHour && topHour.total) out.push(`A faixa de maior atividade foi por volta das ${topHour.x}h (${fmt(topHour.total)} registros nessa hora, somando todos os dias).`)
  const topC = st.contacts.slice(0, 3)
  if (topC.length)
    out.push(
      `Contrapartes com mais registros: ${topC.map((c) => `${c.number} (${fmt(c.total)})`).join(', ')}. Frequência de contato é indicativo estatístico e não comprova, por si, vínculo pessoal.`,
    )
  const topE = st.erbs.filter((e) => e.info?.found).slice(0, 3)
  if (topE.length)
    out.push(
      `ERBs com coordenada mais recorrentes: ${topE
        .map((e) => `${[e.info?.district, e.info?.city].filter(Boolean).join('/') || e.cgi} (${fmt(e.count)} registros)`)
        .join('; ')}. A ERB indica associação de rede, não a posição exata do aparelho.`,
    )
  if (st.erbNoGeo) out.push(`${fmt(st.erbNoGeo)} célula(s) não possuem coordenada confirmada na planilha e não foram plotadas no mapa — evitou-se qualquer suposição de localização.`)
  if (st.issues.length) out.push(`Pontos de atenção nos dados: ${st.issues.map((i) => `${i.label.toLowerCase()} (${fmt(i.count)})`).join('; ')}.`)
  out.push('Limitações: a análise se restringe aos registros efetivamente fornecidos pela operadora; ausências, fusos e eventuais inconsistências do extrato original são preservados e sinalizados, não corrigidos por suposição.')
  return out
}
