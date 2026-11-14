/**
 * Geometria para o Mapas ERB: polígono de setor e interseção de setores (área provável do alvo).
 * Trabalha direto em [lat, lon] — a escala é urbana, então o erro de tratar como plano é desprezível.
 */
export type Pt = [number, number] // [lat, lon]
export type Erb = { lat: number; lon: number; az: number; dist: number; beam: number }

const dest = (lat: number, lon: number, az: number, m: number): Pt => {
  const a = (az * Math.PI) / 180
  return [lat + (m * Math.cos(a)) / 111320, lon + (m * Math.sin(a)) / (111320 * Math.cos((lat * Math.PI) / 180))]
}

/** Polígono do setor (fatia de pizza): centro + arco de `beam` graus em torno do azimute. */
export function sectorPolygon(e: Erb, steps = 18): Pt[] {
  const pts: Pt[] = [[e.lat, e.lon]]
  for (let i = 0; i <= steps; i++) pts.push(dest(e.lat, e.lon, e.az - e.beam / 2 + (e.beam * i) / steps, e.dist))
  return pts
}

// usa x = lon, y = lat para os cálculos (ordem não importa, só a consistência)
const cross = (o: Pt, a: Pt, b: Pt) => (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1])
function signedArea(p: Pt[]) {
  let s = 0
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i]
    const b = p[(i + 1) % n]
    s += a[1] * b[0] - b[1] * a[0]
  }
  return s / 2
}

/** Interseção de dois polígonos CONVEXOS (Sutherland–Hodgman). Setores são convexos (beam < 180). */
export function clipConvex(subject: Pt[], clip: Pt[]): Pt[] {
  if (subject.length < 3 || clip.length < 3) return []
  // garante o polígono de corte em sentido anti-horário para o teste de "dentro"
  const c = signedArea(clip) < 0 ? [...clip].reverse() : clip
  let out = subject
  for (let i = 0; i < c.length; i++) {
    const a = c[i]
    const b = c[(i + 1) % c.length]
    const input = out
    out = []
    for (let j = 0; j < input.length; j++) {
      const cur = input[j]
      const prev = input[(j + input.length - 1) % input.length]
      const curIn = cross(a, b, cur) >= 0
      const prevIn = cross(a, b, prev) >= 0
      if (curIn) {
        if (!prevIn) out.push(segInt(prev, cur, a, b))
        out.push(cur)
      } else if (prevIn) {
        out.push(segInt(prev, cur, a, b))
      }
    }
    if (out.length < 3) return []
  }
  return out
}
function segInt(p1: Pt, p2: Pt, a: Pt, b: Pt): Pt {
  const dy = b[0] - a[0] // Δlat
  const dx = b[1] - a[1] // Δlon
  const d = dy * (p2[1] - p1[1]) - dx * (p2[0] - p1[0])
  const t = d === 0 ? 0 : (dy * (a[1] - p1[1]) - dx * (a[0] - p1[0])) / d
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])]
}

/** Área aproximada do polígono em m² (lat/lon → metros na latitude média). */
export function polygonAreaM2(p: Pt[]): number {
  if (p.length < 3) return 0
  const latm = 111320
  const lat0 = (p.reduce((s, q) => s + q[0], 0) / p.length) * (Math.PI / 180)
  const lonm = 111320 * Math.cos(lat0)
  const xy = p.map((q) => [q[1] * lonm, q[0] * latm] as [number, number])
  return Math.abs(signedArea(xy as Pt[]))
}

export type Overlap = { poly: Pt[]; a: number; b: number; areaM2: number }

/**
 * Interseções par a par dos setores das ERBs (com azimute). Cada polígono mostra onde dois leques
 * se cruzam — a área provável do alvo. Sobreposições se acumulam visualmente onde há mais cruzamentos.
 */
export function sectorIntersections(erbs: Erb[], minAreaM2 = 100): Overlap[] {
  const polys = erbs.map((e) => sectorPolygon(e))
  const out: Overlap[] = []
  for (let i = 0; i < polys.length; i++)
    for (let j = i + 1; j < polys.length; j++) {
      const inter = clipConvex(polys[i], polys[j])
      if (inter.length < 3) continue
      const areaM2 = polygonAreaM2(inter)
      if (areaM2 >= minAreaM2) out.push({ poly: inter, a: i, b: j, areaM2 })
    }
  return out
}
