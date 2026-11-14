/**
 * Estimativa de provável residência × trabalho a partir dos horários dos eventos de cada ponto (ERB).
 * Mesma lógica da Bilhetagem: madrugada/noite → casa; horário comercial → trabalho. Apenas indicativo.
 */
export type TimedPoint = { lat: number; lon: number; name?: string | null; times?: string[] }
export type HomeWork = {
  home: { lat: number; lon: number; name?: string | null; night: number; day: number } | null
  work: { lat: number; lon: number; name?: string | null; night: number; day: number } | null
}

const NIGHT = new Set([20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6]) // casa
const DAY = new Set([9, 10, 11, 12, 13, 14, 15, 16, 17]) // trabalho

export function estimateHomeWork(points: TimedPoint[]): HomeWork {
  const stats = points
    .map((p) => {
      let night = 0
      let day = 0
      for (const t of p.times ?? []) {
        const h = +t.slice(11, 13)
        if (NIGHT.has(h)) night++
        else if (DAY.has(h)) day++
      }
      return { lat: p.lat, lon: p.lon, name: p.name, night, day }
    })
    .filter((s) => s.night + s.day > 0)
  if (!stats.length) return { home: null, work: null }
  const home = stats.filter((s) => s.night > 0).sort((a, b) => b.night - a.night || b.day - a.day)[0] ?? null
  const work = stats.filter((s) => s.day > 0 && !(home && s.lat === home.lat && s.lon === home.lon)).sort((a, b) => b.day - a.day || b.night - a.night)[0] ?? null
  return { home, work }
}
