import clsx from 'clsx'
import L from 'leaflet'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { LocEvent, Tower } from '../engine/location'
import { baseLayer, OSM, SATELLITE, STREETS } from './ErbMap'

export const SECTOR_COLOR = '#2563eb'
export const PATH_COLOR = '#dc2626'
export const CURRENT_COLOR = '#f97316'

/** Ícone de torre (antena) com o total de eventos embaixo. */
export const towerIcon = (n: number, active = false) =>
  L.divIcon({
    className: 'erb-tower',
    html: `<div class="erb-tower-in${active ? ' is-active' : ''}"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/><circle cx="12" cy="9" r="2"/><path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/><path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/><path d="M9.5 18h5"/><path d="m8 22 4-11 4 11"/></svg><span>${n.toLocaleString('pt-BR')}</span></div>`,
    iconSize: [44, 40],
    iconAnchor: [22, 30],
  })

export function dest(lat: number, lon: number, az: number, m: number): [number, number] {
  const a = (az * Math.PI) / 180
  return [lat + (m * Math.cos(a)) / 111320, lon + (m * Math.sin(a)) / (111320 * Math.cos((lat * Math.PI) / 180))]
}
export function sector(lat: number, lon: number, az: number, m: number, bw = 65): [number, number][] {
  const pts: [number, number][] = [[lat, lon]]
  for (let i = 0; i <= 18; i++) pts.push(dest(lat, lon, az - bw / 2 + (bw * i) / 18, m))
  return pts
}

type Base = 'mapa' | 'mapa2' | 'satelite'

/**
 * Mapa de localização de um alvo: torres (ERBs) com o total de eventos, setores de azimute,
 * deslocamentos entre torres registradas em sequência e o evento selecionado/em reprodução.
 */
export function LocationMap({
  towers,
  transitions,
  current,
  showSectors,
  showPath,
  radius,
  tileUrl = OSM.url,
  tileAttr = OSM.attr,
  onTower,
}: {
  towers: Tower[]
  transitions: { a: [number, number]; b: [number, number]; n: number }[]
  current: LocEvent | null
  showSectors: boolean
  showPath: boolean
  radius: number
  tileUrl?: string
  tileAttr?: string
  onTower?: (t: Tower) => void
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const base = useRef<L.TileLayer | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const cur = useRef<L.LayerGroup | null>(null)
  const [b, setB] = useState<Base>('mapa')
  const [full, setFull] = useState(false)

  useEffect(() => {
    if (!box.current || map.current) return
    map.current = L.map(box.current).setView([-23.55, -46.63], 11)
    layer.current = L.layerGroup().addTo(map.current)
    cur.current = L.layerGroup().addTo(map.current)
    return () => {
      map.current?.stop()
      map.current?.off()
      map.current?.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    if (!map.current) return
    base.current?.remove()
    const main = tileUrl && !tileUrl.includes('cartocdn') ? { url: tileUrl, attr: tileAttr } : OSM
    const src = b === 'satelite' ? SATELLITE : b === 'mapa2' ? STREETS : main
    base.current = baseLayer(src.url, src.attr, b === 'mapa' ? () => setB('mapa2') : undefined).addTo(map.current)
    base.current.bringToBack()
  }, [b, tileUrl, tileAttr])

  // torres, setores e trajeto
  useEffect(() => {
    const m = map.current
    const g = layer.current
    if (!m || !g) return
    g.clearLayers()
    if (showSectors)
      for (const t of towers)
        for (const c of t.cells)
          if (c.az !== null)
            L.polygon(sector(t.lat, t.lon, c.az, radius), { color: SECTOR_COLOR, weight: 1, opacity: 0.7, fillColor: SECTOR_COLOR, fillOpacity: 0.12, interactive: false }).addTo(g)
    if (showPath) {
      const maxN = Math.max(1, ...transitions.map((x) => x.n))
      for (const t of transitions)
        L.polyline([t.a, t.b], { color: PATH_COLOR, weight: 1.5 + 2.5 * Math.sqrt(t.n / maxN), opacity: 0.85, dashArray: '6 6', interactive: false }).addTo(g)
    }
    for (const t of towers) {
      const mk = L.marker([t.lat, t.lon], { icon: towerIcon(t.n), riseOnHover: true })
      mk.bindTooltip(`${t.address ?? 'ERB'}${t.city ? ` · ${t.city}` : ''} — ${t.n.toLocaleString('pt-BR')} eventos em ${t.cells.length} célula(s)`)
      mk.on('click', () => onTower?.(t))
      mk.addTo(g)
    }
  }, [towers, transitions, showSectors, showPath, radius, onTower])

  useEffect(() => {
    const m = map.current
    if (!m || !towers.length) return
    m.fitBounds(L.latLngBounds(towers.map((t) => [t.lat, t.lon] as [number, number])), { padding: [30, 30], maxZoom: 15, animate: false })
  }, [towers])

  // evento atual (seleção ou reprodução)
  useEffect(() => {
    const m = map.current
    const g = cur.current
    if (!m || !g) return
    g.clearLayers()
    if (!current || current.lat === null || current.lon === null) return
    if (current.az !== null)
      L.polygon(sector(current.lat, current.lon, current.az, radius), { color: CURRENT_COLOR, weight: 2, fillColor: CURRENT_COLOR, fillOpacity: 0.3, interactive: false }).addTo(g)
    L.circleMarker([current.lat, current.lon], { radius: 16, color: CURRENT_COLOR, weight: 3, fillOpacity: 0, interactive: false, className: 'erb-pulse' }).addTo(g)
    if (!m.getBounds().pad(-0.15).contains([current.lat, current.lon])) m.panTo([current.lat, current.lon], { animate: false })
  }, [current, radius])

  useEffect(() => {
    const on = () => {
      setFull(document.fullscreenElement === wrap.current)
      setTimeout(() => map.current?.invalidateSize(), 120)
    }
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  return (
    <div ref={wrap} className={clsx('relative overflow-hidden rounded-2xl border border-line bg-ink', full ? 'h-screen' : 'h-[58vh] min-h-[380px]')}>
      <div ref={box} className="h-full w-full" role="img" aria-label="Mapa de localização do alvo" />
      <div className="absolute top-3 right-3 z-[500] flex gap-2">
        <button
          className="grid h-9 w-9 place-items-center rounded-[7px] border border-line-2 bg-[rgba(8,14,20,0.92)] text-text hover:text-accent"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen?.())}
          aria-label={full ? 'Sair da tela cheia' : 'Tela cheia'}
        >
          {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <div className="flex overflow-hidden rounded-[7px] border border-line-2 bg-[rgba(8,14,20,0.92)] text-xs font-medium sm:text-[13px]" role="group" aria-label="Fundo do mapa">
          {(
            [
              ['mapa', 'Mapa'],
              ['mapa2', 'Mapa 2'],
              ['satelite', 'Satélite'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={clsx('px-2.5 py-1.5', b === id ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text')}
              onClick={() => setB(id)}
              aria-pressed={b === id}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="absolute bottom-3 left-3 z-[500] rounded-[7px] border border-line bg-[rgba(8,14,20,0.9)] px-3 py-2 text-[11px] leading-5 text-muted">
        <div className="flex items-center gap-2">
          <span className="font-bold">⚲</span> ERB / antena · nº = total de eventos
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm border" style={{ borderColor: SECTOR_COLOR, background: `${SECTOR_COLOR}22` }} /> setor (azimute)
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: PATH_COLOR }} /> deslocamento entre ERBs
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: CURRENT_COLOR }} /> evento selecionado
        </div>
      </div>
    </div>
  )
}
