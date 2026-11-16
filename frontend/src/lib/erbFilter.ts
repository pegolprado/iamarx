/**
 * Filtro por dia e hora dos eventos das ERBs importadas.
 *
 * Cada ERB guarda `times[]` ("AAAA-MM-DDThh:mm"). O filtro estreita essa lista
 * para um conjunto de dias e/ou uma faixa de horário; a ERB só continua no mapa
 * se sobrar ao menos um evento, e sua contagem (`events`) passa a ser a dos
 * eventos do recorte. Como o link é derivado do conteúdo, filtrar atualiza o
 * link automaticamente.
 */

/** Recorte: dias escolhidos (vazio = todos) e faixa de horário em minutos (0..1439; from===to = dia inteiro). */
export type ErbTimeFilter = { days: string[]; from: number; to: number }

export const EMPTY_FILTER: ErbTimeFilter = { days: [], from: 0, to: 0 }

/** Minuto do dia (0..1439) dentro da faixa [from,to). Faixa que cruza a meia-noite (noite) é aceita. */
export function hourInWindow(min: number, from: number, to: number): boolean {
  if (from === to) return true // dia inteiro
  if (from < to) return min >= from && min < to
  return min >= from || min < to // ex.: 18:00 → 06:00
}

/** O horário ISO cai no recorte (dia escolhido + faixa de hora)? */
export function inWindow(iso: string, f: ErbTimeFilter): boolean {
  if (f.days.length && !f.days.includes(iso.slice(0, 10))) return false
  const min = +iso.slice(11, 13) * 60 + +iso.slice(14, 16)
  return hourInWindow(min, f.from, f.to)
}

/** O filtro realmente estreita algo (tem dia escolhido ou faixa de hora)? */
export function filterActive(f: ErbTimeFilter): boolean {
  return f.days.length > 0 || f.from !== f.to
}

/** Estreita os pontos ao recorte; descarta os que não têm nenhum evento no recorte. */
export function filterPoints<T extends { times?: string[]; events: number }>(points: T[], f: ErbTimeFilter | null): T[] {
  if (!f || !filterActive(f)) return points
  const out: T[] = []
  for (const p of points) {
    if (!p.times?.length) continue
    const times = p.times.filter((t) => inWindow(t, f))
    if (times.length) out.push({ ...p, times, events: times.length })
  }
  return out
}

/** Dias distintos (AAAA-MM-DD) presentes nos eventos, em ordem. */
export function distinctDays(points: { times?: string[] }[]): string[] {
  const s = new Set<string>()
  for (const p of points) for (const t of p.times ?? []) s.add(t.slice(0, 10))
  return [...s].sort()
}

/** Contagem exibida vs. total (apenas eventos com horário). */
export function filterStats(points: { times?: string[]; events: number }[], f: ErbTimeFilter) {
  const view = filterPoints(points, f)
  const timed = points.filter((p) => p.times?.length)
  return {
    shownErbs: filterActive(f) ? view.length : timed.length,
    totalErbs: timed.length,
    shownEvents: (filterActive(f) ? view : timed).reduce((n, p) => n + (p.times?.length ?? 0), 0),
    totalEvents: timed.reduce((n, p) => n + (p.times?.length ?? 0), 0),
  }
}

/** "HH:MM" → minutos do dia. */
export const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Minutos do dia → "HH:MM". */
export const toHHMM = (min: number): string => `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** "AAAA-MM-DD" → "dd/mm" e dia da semana curto. */
export function dayLabel(d: string): { short: string; wd: string } {
  return { short: `${d.slice(8, 10)}/${d.slice(5, 7)}`, wd: WD[new Date(`${d}T12:00:00`).getDay()] ?? '' }
}
