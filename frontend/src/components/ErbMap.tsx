import clsx from 'clsx'
import L from 'leaflet'
import { Maximize2, Minimize2 } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { SitePoint } from '../lib/shareMap'

export const OSM = { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© colaboradores do OpenStreetMap' }
/** Alternativa gratuita usada se o servidor do OpenStreetMap recusar as imagens. */
export const CARTO = { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', attr: '© OpenStreetMap · © CARTO' }

/**
 * Camada de fundo do mapa. O OpenStreetMap exige saber de qual site vêm os pedidos de imagem
 * (cabeçalho Referer); o site esconde o referer por padrão, então aqui é enviado só o domínio
 * (nunca a página nem os dados). Se mesmo assim as imagens falharem, troca para o CARTO.
 */
export function baseLayer(url: string, attribution: string): L.TileLayer {
  const t = L.tileLayer(url, { attribution, maxZoom: 19, referrerPolicy: 'strict-origin', subdomains: 'abcd' } as L.TileLayerOptions)
  let errors = 0
  t.on('tileerror', () => {
    if (++errors === 4 && url !== CARTO.url && !url.includes('arcgisonline')) {
      t.setUrl(CARTO.url)
      t.options.attribution = CARTO.attr
    }
  })
  return t
}

export const SATELLITE = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attr: 'Imagens © Esri, Maxar, Earthstar Geographics',
}

/** Cores por intensidade (quantidade de eventos na estação). */
export const HEAT = [
  { color: '#4c8dff', label: 'baixa' },
  { color: '#f5a524', label: 'média' },
  { color: '#e5484d', label: 'alta' },
]
export const AZ_COLOR = '#e5484d'

export type AzMode = 'linha' | 'setor' | 'nenhum'

/** Distância (px) abaixo da qual estações vizinhas são agrupadas na escala atual. */
const CLUSTER_PX = 56

/** Soma de um grupo de estações vizinhas (posição = média ponderada pelos eventos). */
function merge(ps: SitePoint[]): SitePoint {
  const ev = ps.reduce((a, p) => a + p.events, 0) || 1
  return {
    lat: ps.reduce((a, p) => a + p.lat * p.events, 0) / ev,
    lon: ps.reduce((a, p) => a + p.lon * p.events, 0) / ev,
    events: ps.reduce((a, p) => a + p.events, 0),
    voice: ps.reduce((a, p) => a + p.voice, 0),
    sms: ps.reduce((a, p) => a + p.sms, 0),
    data: ps.reduce((a, p) => a + p.data, 0),
    az: [],
    cells: ps.flatMap((p) => p.cells),
    first:
      ps
        .map((p) => p.first)
        .filter(Boolean)
        .sort()[0] ?? null,
    last:
      ps
        .map((p) => p.last)
        .filter(Boolean)
        .sort()
        .slice(-1)[0] ?? null,
    name: null,
  }
}

function dest(lat: number, lon: number, az: number, m: number): [number, number] {
  const a = (az * Math.PI) / 180
  return [lat + (m * Math.cos(a)) / 111320, lon + (m * Math.sin(a)) / (111320 * Math.cos((lat * Math.PI) / 180))]
}

function sector(lat: number, lon: number, az: number, bw: number, m: number): [number, number][] {
  const pts: [number, number][] = [[lat, lon]]
  for (let i = 0; i <= 16; i++) pts.push(dest(lat, lon, az - bw / 2 + (bw * i) / 16, m))
  return pts
}

/** Limites de intensidade: até o 55º percentil = baixa; até o 85º = média; acima = alta. */
export function heatScale(points: SitePoint[]) {
  const v = points.map((p) => p.events).sort((a, b) => a - b)
  const at = (q: number) => v[Math.min(v.length - 1, Math.floor(q * v.length))] ?? 0
  const t1 = at(0.55)
  const t2 = at(0.85)
  return { level: (n: number) => (n > t2 ? 2 : n > t1 ? 1 : 0), ranges: [`até ${t1}`, `${t1 + 1} a ${t2}`, `acima de ${t2}`] }
}

/**
 * Mapa de ERBs: cada estação é um círculo com o total de eventos, colorido pela intensidade,
 * com a direção do azimute de cada célula. Alterna mapa/satélite e tela cheia.
 */
export function ErbMap({
  points,
  tileUrl = CARTO.url,
  tileAttr = CARTO.attr,
  azMode = 'linha',
  azLen = 600,
  onSelect,
  legend,
  height = 'h-[620px]',
}: {
  points: SitePoint[]
  tileUrl?: string
  tileAttr?: string
  azMode?: AzMode
  azLen?: number
  onSelect?: (p: SitePoint) => void
  legend?: ReactNode
  height?: string
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const base = useRef<L.TileLayer | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const [sat, setSat] = useState(false)
  const [full, setFull] = useState(false)
  const [zoom, setZoom] = useState(4)
  const [levels, setLevels] = useState<string[]>(['', '', ''])

  useEffect(() => {
    if (!box.current || map.current) return
    map.current = L.map(box.current, { preferCanvas: false, zoomControl: true }).setView([-15.79, -47.88], 4)
    layer.current = L.layerGroup().addTo(map.current)
    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    if (!map.current) return
    base.current?.remove()
    base.current = baseLayer(sat ? SATELLITE.url : tileUrl, sat ? SATELLITE.attr : tileAttr).addTo(map.current)
    base.current.bringToBack()
  }, [sat, tileUrl, tileAttr])

  // enquadra os pontos só quando os dados mudam (não a cada zoom)
  useEffect(() => {
    const m = map.current
    if (!m || !points.length) return
    m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number])), { padding: [40, 40], maxZoom: 15 })
    setZoom(m.getZoom())
  }, [points])
  useEffect(() => {
    const m = map.current
    if (!m) return
    const on = () => setZoom(m.getZoom())
    m.on('zoomend', on)
    return () => {
      m.off('zoomend', on)
    }
  }, [])

  useEffect(() => {
    const m = map.current
    const g = layer.current
    if (!m || !g) return
    g.clearLayers()
    if (!points.length) return
    // estações muito próximas na escala atual viram um grupo (some ao aproximar)
    const groups = new Map<string, SitePoint[]>()
    for (const p of points) {
      const xy = m.project([p.lat, p.lon], zoom)
      const k = `${Math.floor(xy.x / CLUSTER_PX)}:${Math.floor(xy.y / CLUSTER_PX)}`
      groups.set(k, [...(groups.get(k) ?? []), p])
    }
    const items = [...groups.values()].map((ps) => (ps.length === 1 ? { p: ps[0], members: ps } : { p: merge(ps), members: ps }))
    const lvl = heatScale(items.map((x) => x.p))
    const maxE = Math.max(...items.map((x) => x.p.events))
    for (const { p, members } of items.sort((a, b) => a.p.events - b.p.events)) {
      const color = p.events ? HEAT[lvl.level(p.events)].color : '#64748b'
      const single = members.length === 1
      if (single && azMode !== 'nenhum')
        for (const az of p.az) {
          if (azMode === 'linha') L.polyline([[p.lat, p.lon], dest(p.lat, p.lon, az, azLen)], { color: AZ_COLOR, weight: 2.5, opacity: 0.9 }).addTo(g)
          else L.polygon(sector(p.lat, p.lon, az, 65, azLen), { color: AZ_COLOR, weight: 1, fillOpacity: 0.12, opacity: 0.6 }).addTo(g)
        }
      const r = p.events ? 13 + 17 * Math.sqrt(p.events / (maxE || 1)) : members.length > 1 ? 14 : 8
      const c = L.circleMarker([p.lat, p.lon], { radius: r, color, weight: 2, fillColor: color, fillOpacity: 0.32 })
      c.bindTooltip(
        single
          ? p.events
            ? `${p.name ? `${p.name} · ` : ''}${p.events} eventos (voz ${p.voice}, SMS ${p.sms}, dados ${p.data})`
            : `${p.name ? `${p.name} · ` : ''}${p.cells.length} célula(s) do cadastro · azimute ${p.az.join('°, ') || '—'}°`
          : `${members.length} estações próximas${p.events ? ` · ${p.events} eventos` : ''} — clique para aproximar`,
      )
      c.on('click', () => (single ? onSelect?.(p) : m.fitBounds(L.latLngBounds(members.map((x) => [x.lat, x.lon] as [number, number])), { padding: [60, 60], maxZoom: 17 })))
      c.addTo(g)
      L.marker([p.lat, p.lon], {
        interactive: false,
        icon: L.divIcon({ className: 'erb-count', html: `<span style="color:${color}">${p.events ? p.events.toLocaleString('pt-BR') : members.length > 1 ? members.length : ''}</span>`, iconSize: [60, 16], iconAnchor: [30, 8] }),
      }).addTo(g)
    }
    setLevels(lvl.ranges)
  }, [points, azMode, azLen, onSelect, zoom])

  useEffect(() => {
    const on = () => {
      setFull(document.fullscreenElement === wrap.current)
      setTimeout(() => map.current?.invalidateSize(), 120)
    }
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen?.())

  return (
    <div ref={wrap} className={clsx('relative overflow-hidden rounded-2xl border border-line bg-ink', full ? 'h-screen' : height)}>
      <div ref={box} className="h-full w-full" role="img" aria-label="Mapa das estações (ERBs)" />
      <div className="absolute top-3 right-3 z-[500] flex gap-2">
        <button
          className="grid h-9 w-9 place-items-center rounded-lg border border-black/20 bg-white text-gray-800 shadow"
          onClick={toggleFull}
          aria-label={full ? 'Sair da tela cheia' : 'Tela cheia'}
          title="Tela cheia"
        >
          {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <div className="flex overflow-hidden rounded-lg border border-black/20 bg-white text-sm font-semibold shadow" role="group" aria-label="Tipo de mapa">
          <button className={clsx('px-3 py-1.5', !sat ? 'bg-gray-900 text-white' : 'text-gray-700')} onClick={() => setSat(false)} aria-pressed={!sat}>
            Mapa
          </button>
          <button className={clsx('px-3 py-1.5', sat ? 'bg-gray-900 text-white' : 'text-gray-700')} onClick={() => setSat(true)} aria-pressed={sat}>
            Satélite
          </button>
        </div>
      </div>
      <div className="absolute bottom-3 left-3 z-[500] max-w-[260px] rounded-lg border border-black/10 bg-white/95 px-3 py-2 text-[11px] leading-5 text-gray-800 shadow">
        <div className="font-semibold">ERB / antena · nº = total de eventos</div>
        {HEAT.map((h, i) => (
          <div key={h.label} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: h.color, background: `${h.color}55` }} /> intensidade {h.label} ({levels[i]})
          </div>
        ))}
        {azMode !== 'nenhum' && (
          <div className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-4" style={{ background: AZ_COLOR }} /> azimute da célula
          </div>
        )}
        <div className="text-gray-500">estações próximas são somadas; aproxime para separar</div>
        {legend}
      </div>
    </div>
  )
}

/** Agrupa pontos por estação (mesma coordenada), somando eventos e reunindo azimutes e células. */
export function groupSites(rows: any[]): SitePoint[] {
  const by = new Map<string, SitePoint>()
  for (const r of rows) {
    if (r.lat === null || r.lon === null || r.lat === undefined) continue
    const k = `${Number(r.lat).toFixed(5)},${Number(r.lon).toFixed(5)}`
    const p: SitePoint = by.get(k) ?? {
      lat: Number(r.lat),
      lon: Number(r.lon),
      events: 0,
      voice: 0,
      sms: 0,
      data: 0,
      az: [],
      cells: [],
      first: null,
      last: null,
      name: r.site_name ?? null,
      numbers: [],
    }
    p.events += r.events ?? 0
    p.voice += r.voice ?? 0
    p.sms += r.sms ?? 0
    p.data += r.data ?? 0
    if (r.azimuth !== null && r.azimuth !== undefined && !p.az.includes(Number(r.azimuth))) p.az.push(Number(r.azimuth))
    if (r.cell_key && !p.cells.includes(r.cell_key)) p.cells.push(r.cell_key)
    if (r.first_event && (!p.first || r.first_event < p.first)) p.first = r.first_event
    if (r.last_event && (!p.last || r.last_event > p.last)) p.last = r.last_event
    for (const n of r.numbers ?? []) if (!p.numbers!.includes(n)) p.numbers!.push(n)
    p.name ??= r.site_name ?? null
    by.set(k, p)
  }
  return [...by.values()].sort((a, b) => b.events - a.events)
}
