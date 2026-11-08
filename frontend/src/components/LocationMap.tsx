import clsx from 'clsx'
import L from 'leaflet'
import { Layers, Maximize2, Minimize2, X } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { LocEvent, Tower } from '../engine/location'
import { baseLayer, OSM, SATELLITE, STREETS } from './ErbMap'
import { drawErbs, ERB_OPS, erbSitesIn } from './erbLayer'
import type { MapMark, MarkColor, MarkKind } from '../lib/shareMap'

/** Cores disponíveis para pontos e antenas marcados à mão. */
export const MARK_COLOR_HEX: Record<MarkColor, { hex: string; label: string }> = {
  indigo: { hex: '#4f46e5', label: 'Índigo' },
  azul: { hex: '#2563eb', label: 'Azul' },
  verde: { hex: '#16a34a', label: 'Verde' },
  vermelho: { hex: '#dc2626', label: 'Vermelho' },
  laranja: { hex: '#ea580c', label: 'Laranja' },
  roxo: { hex: '#7c3aed', label: 'Roxo' },
  rosa: { hex: '#db2777', label: 'Rosa' },
  cinza: { hex: '#4b5563', label: 'Cinza' },
  amarelo: { hex: '#ca8a04', label: 'Amarelo' },
  ciano: { hex: '#0891b2', label: 'Ciano' },
}

/** Ícones dos pontos (rótulo, glifo e cor padrão). */
export const MARK_STYLE: Record<MarkKind, { color: MarkColor; label: string; glyph: string }> = {
  casa: { color: 'verde', label: 'Residência', glyph: '⌂' },
  trabalho: { color: 'laranja', label: 'Trabalho', glyph: '▣' },
  alvo: { color: 'vermelho', label: 'Alvo', glyph: '◎' },
  pessoa: { color: 'azul', label: 'Pessoa', glyph: '☺' },
  veiculo: { color: 'cinza', label: 'Veículo', glyph: '⛟' },
  local: { color: 'roxo', label: 'Local', glyph: '★' },
  outro: { color: 'roxo', label: 'Ponto', glyph: '●' },
  erb: { color: 'indigo', label: 'ERB', glyph: '' },
}
export const markHex = (k: MapMark) => MARK_COLOR_HEX[k.color ?? MARK_STYLE[k.kind].color].hex

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Desenho (traço) de cada tipo de ponto, no padrão 24×24. */
export const MARK_ICON_SVG: Record<MarkKind, string> = {
  casa: '<path d="M3 11 12 3.5 21 11"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
  trabalho: '<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2"/><path d="M3.5 12.5h17"/>',
  alvo: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  pessoa: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.6-3.8 3.4-6 7-6s6.4 2.2 7 6"/>',
  veiculo:
    '<path d="M4 15.5 5.6 10a2 2 0 0 1 1.9-1.4h9a2 2 0 0 1 1.9 1.4l1.6 5.5v3h-3v-1.6H7v1.6H4z"/><circle cx="8" cy="15.5" r="1" fill="currentColor"/><circle cx="16" cy="15.5" r="1" fill="currentColor"/>',
  local: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  outro: '<path d="M6 21V4"/><path d="M6 4.5h11l-2.5 4 2.5 4H6"/>',
  erb: '<path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/><circle cx="12" cy="9" r="2"/><path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/><path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/><path d="M9.5 18h5"/><path d="m8 22 4-11 4 11"/>',
}

/** Alfinete colorido com degradê, contorno branco e o ícone do tipo dentro. */
export function pinSvg(kind: MarkKind, c: string, size = 38) {
  const id = `g${c.slice(1)}`
  return `<svg width="${size}" height="${Math.round(size * 1.25)}" viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".82"/><stop offset="1" stop-color="${c}"/></linearGradient></defs><ellipse cx="20" cy="47" rx="7" ry="2.2" fill="#000" opacity=".25"/><path d="M20 46S5 30.5 5 19A15 15 0 0 1 35 19C35 30.5 20 46 20 46z" fill="url(#${id})" stroke="#fff" stroke-width="2.5"/><circle cx="20" cy="19" r="10.5" fill="#fff"/><g transform="translate(11.6 10.6) scale(.7)" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" color="${c}">${MARK_ICON_SVG[kind]}</g></svg>`
}

const markIcon = (k: MapMark) => {
  const c = markHex(k)
  if (k.kind === 'erb')
    return L.divIcon({
      className: 'erb-tower',
      html: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="${c}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff)">${MARK_ICON_SVG.erb}</svg>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    })
  return L.divIcon({ className: 'erb-tower', html: pinSvg(k.kind, c), iconSize: [38, 48], iconAnchor: [19, 46] })
}

export const SECTOR_COLOR = '#2563eb'
export const PATH_COLOR = '#dc2626'
export const CURRENT_COLOR = '#f97316'

/** Ícone de torre (antena) com o total de eventos embaixo. */
export const towerIcon = (n: number, active = false, color?: string) =>
  L.divIcon({
    className: 'erb-tower',
    html: `<div class="erb-tower-in${active ? ' is-active' : ''}"${color ? ` style="--tw:${color}"` : ''}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/><circle cx="12" cy="9" r="2"/><path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/><path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/><path d="M9.5 18h5"/><path d="m8 22 4-11 4 11"/></svg><span>${n.toLocaleString('pt-BR')}</span></div>`,
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
  beam = 120,
  tileUrl = OSM.url,
  tileAttr = OSM.attr,
  onTower,
  detail,
  onCloseDetail,
  erbLayer = true,
  marks,
  onMapClick,
  onMark,
  picking,
  onContext,
  layout = 'default',
  focus,
  onBackgroundClick,
}: {
  towers: Tower[]
  transitions: { a: [number, number]; b: [number, number]; n: number }[]
  current: LocEvent | null
  showSectors: boolean
  showPath: boolean
  radius: number
  /** abertura do setor (graus) */
  beam?: number
  tileUrl?: string
  tileAttr?: string
  onTower?: (t: Tower) => void
  /** detalhes da torre/evento selecionado, mostrados sobre o mapa */
  detail?: ReactNode
  onCloseDetail?: () => void
  /** mostra o botão da camada ERBs (antenas de todas as operadoras) */
  erbLayer?: boolean
  /** pontos marcados à mão (ex.: residência do alvo) */
  marks?: MapMark[]
  onMapClick?: (lat: number, lon: number) => void
  onMark?: (i: number) => void
  /** modo "clique no mapa para marcar" */
  picking?: boolean
  /** botão direito / toque longo no mapa */
  onContext?: (lat: number, lon: number) => void
  /** "app": mapa em tela cheia, com o botão de camadas sob o zoom (site Mapas ERB) */
  layout?: 'default' | 'app'
  /** centraliza o mapa neste ponto (muda `key` para repetir) */
  focus?: { lat: number; lon: number; key: number } | null
  /** clique numa área vazia do mapa */
  onBackgroundClick?: () => void
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const base = useRef<L.TileLayer | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const cur = useRef<L.LayerGroup | null>(null)
  const [b, setB] = useState<Base>('mapa')
  const [full, setFull] = useState(false)
  // camada ERBs (antenas de todas as operadoras, base pública da Anatel)
  const erbs = useRef<L.LayerGroup | null>(null)
  const erbRenderer = useRef<L.Canvas | null>(null)
  const [erbOn, setErbOn] = useState(false)
  const [ops, setOps] = useState<Set<number>>(() => new Set([0, 1, 2, 3]))
  const [erbMsg, setErbMsg] = useState('')
  const [layersOpen, setLayersOpen] = useState(false)
  const app = layout === 'app'

  useEffect(() => {
    if (!box.current || map.current) return
    map.current = L.map(box.current, { maxZoom: 19, tapHold: true } as L.MapOptions).setView([-23.55, -46.63], 12) // São Paulo
    erbRenderer.current = L.canvas({ padding: 0.3 })
    erbs.current = L.layerGroup().addTo(map.current)
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
            L.polygon(sector(t.lat, t.lon, c.az, radius, beam), {
              color: (t as Tower & { color?: string }).color ?? SECTOR_COLOR,
              weight: 1,
              opacity: 0.7,
              fillColor: (t as Tower & { color?: string }).color ?? SECTOR_COLOR,
              fillOpacity: 0.12,
              interactive: false,
            }).addTo(g)
    if (showPath) {
      const maxN = Math.max(1, ...transitions.map((x) => x.n))
      for (const t of transitions)
        L.polyline([t.a, t.b], { color: PATH_COLOR, weight: 1.5 + 2.5 * Math.sqrt(t.n / maxN), opacity: 0.85, dashArray: '6 6', interactive: false }).addTo(g)
    }
    for (const t of towers) {
      const mk = L.marker([t.lat, t.lon], { icon: towerIcon(t.n, false, (t as Tower & { color?: string }).color), riseOnHover: true })
      mk.bindTooltip(`${t.address ?? 'ERB'}${t.city ? ` · ${t.city}` : ''} — ${t.n.toLocaleString('pt-BR')} eventos em ${t.cells.length} célula(s)`)
      mk.on('click', () => onTower?.(t))
      mk.addTo(g)
    }
  }, [towers, transitions, showSectors, showPath, radius, beam, onTower])

  useEffect(() => {
    const m = map.current
    if (!m || !towers.length) return
    m.fitBounds(L.latLngBounds(towers.map((t) => [t.lat, t.lon] as [number, number])), { padding: [30, 30], maxZoom: 15, animate: false })
  }, [towers])
  // sem torres da análise: enquadra os pontos marcados na primeira vez que aparecem
  const fittedMarks = useRef(false)
  useEffect(() => {
    const m = map.current
    const vis = (marks ?? []).filter((k) => !k.hidden)
    if (!m || towers.length || !vis.length || fittedMarks.current) return
    fittedMarks.current = true
    m.fitBounds(L.latLngBounds(vis.map((k) => [k.lat, k.lon] as [number, number])), { padding: [40, 40], maxZoom: 15, animate: false })
  }, [marks, towers.length])

  // evento atual (seleção ou reprodução)
  useEffect(() => {
    const m = map.current
    const g = cur.current
    if (!m || !g) return
    g.clearLayers()
    if (!current || current.lat === null || current.lon === null) return
    if (current.az !== null)
      L.polygon(sector(current.lat, current.lon, current.az, radius, beam), {
        color: CURRENT_COLOR,
        weight: 2,
        fillColor: CURRENT_COLOR,
        fillOpacity: 0.3,
        interactive: false,
      }).addTo(g)
    L.circleMarker([current.lat, current.lon], { radius: 16, color: CURRENT_COLOR, weight: 3, fillOpacity: 0, interactive: false, className: 'erb-pulse' }).addTo(g)
    if (!m.getBounds().pad(-0.15).contains([current.lat, current.lon])) m.panTo([current.lat, current.lon], { animate: false })
  }, [current, radius, beam])

  useEffect(() => {
    if (focus && map.current) map.current.setView([focus.lat, focus.lon], Math.max(map.current.getZoom(), 15), { animate: false })
  }, [focus])

  // pontos marcados à mão
  const markLayer = useRef<L.LayerGroup | null>(null)
  useEffect(() => {
    const m = map.current
    if (!m) return
    markLayer.current ??= L.layerGroup().addTo(m)
    const g = markLayer.current
    g.clearLayers()
    ;(marks ?? []).forEach((k, i) => {
      if (k.hidden) return
      const c = markHex(k)
      if (k.kind === 'erb' && k.az !== null && k.az !== undefined) {
        const dist = k.dist || radius
        // setor (estimativa de cobertura) + linha vermelha do azimute até o alcance
        L.polygon(sector(k.lat, k.lon, k.az, dist, k.beam || beam), { color: c, weight: 1.2, opacity: 0.85, fillColor: c, fillOpacity: 0.16, interactive: false }).addTo(g)
        L.polyline([[k.lat, k.lon], dest(k.lat, k.lon, k.az, dist)], { color: '#ef4444', weight: 2.2, opacity: 0.95, interactive: false }).addTo(g)
      }
      const mk = L.marker([k.lat, k.lon], { icon: markIcon(k), zIndexOffset: 1000 })
      if (k.kind === 'erb') mk.bindTooltip(esc(k.label), { permanent: true, direction: 'bottom', offset: [0, 10], className: 'erb-label' })
      // nome sempre visível ao lado do ponto
      else if (k.label) mk.bindTooltip(esc(k.label), { permanent: true, direction: 'bottom', offset: [0, 2], className: 'erb-label' })
      mk.on('click', () => onMark?.(i))
      mk.addTo(g)
    })
  }, [marks, onMark, radius, beam])
  useEffect(() => {
    const m = map.current
    if (!m || !onContext) return
    const h = (e: L.LeafletMouseEvent) => {
      e.originalEvent?.preventDefault?.()
      onContext(e.latlng.lat, e.latlng.lng)
    }
    m.on('contextmenu', h)
    return () => {
      m.off('contextmenu', h)
    }
  }, [onContext])
  // no modo de marcação o duplo clique não aproxima (evita "sumir" o mapa)
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (picking) m.doubleClickZoom.disable()
    else m.doubleClickZoom.enable()
  }, [picking])
  // clique no mapa fecha o quadro de detalhes e o menu de camadas
  const closeDetail = useRef(onCloseDetail)
  closeDetail.current = onCloseDetail
  const bgClick = useRef(onBackgroundClick)
  bgClick.current = onBackgroundClick
  useEffect(() => {
    const m = map.current
    if (!m) return
    const h = () => {
      setLayersOpen(false)
      closeDetail.current?.()
      bgClick.current?.()
    }
    m.on('click', h)
    m.on('dragstart', () => setLayersOpen(false))
    return () => {
      m.off('click', h)
    }
  }, [])
  useEffect(() => {
    const m = map.current
    if (!m || !onMapClick) return
    const h = (e: L.LeafletMouseEvent) => onMapClick(e.latlng.lat, e.latlng.lng)
    m.on('click', h)
    return () => {
      m.off('click', h)
    }
  }, [onMapClick])

  // ERBs da região visível: recarrega ao mover o mapa
  useEffect(() => {
    const m = map.current
    const g = erbs.current
    if (!m || !g) return
    if (!erbOn) {
      g.clearLayers()
      setErbMsg('')
      return
    }
    let seq = 0
    const load = async () => {
      const my = ++seq
      if (m.getZoom() < 11) {
        g.clearLayers()
        setErbMsg('Aproxime o mapa para ver as ERBs')
        return
      }
      setErbMsg('Carregando ERBs…')
      const sites = await erbSitesIn(m.getBounds().pad(0.15))
      if (my !== seq || !erbs.current) return
      drawErbs(g, sites, ops, erbRenderer.current!, m.getZoom())
      setErbMsg(sites.length ? '' : 'Nenhuma ERB nesta região')
    }
    void load()
    m.on('moveend', load)
    return () => {
      seq++
      m.off('moveend', load)
    }
  }, [erbOn, ops])

  useEffect(() => {
    const on = () => {
      setFull(document.fullscreenElement === wrap.current)
      setTimeout(() => map.current?.invalidateSize(), 120)
    }
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  const opsList = (
    <>
      {ERB_OPS.map((o) => (
        <label key={o.key} className="flex cursor-pointer items-center gap-2 py-0.5">
          <input
            type="checkbox"
            checked={ops.has(o.key)}
            onChange={(e) => {
              const n = new Set(ops)
              if (e.target.checked) n.add(o.key)
              else n.delete(o.key)
              setOps(n)
            }}
          />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: o.color }} /> {o.label}
        </label>
      ))}
      {erbMsg && <div className="mt-1 text-[11px] leading-snug text-faint">{erbMsg}</div>}
      <div className="mt-1 text-[10px] text-faint">Fonte: Anatel (licenciamento)</div>
    </>
  )
  const detailBox = detail && (
    <div
      className={clsx(
        'absolute top-3 z-[600] max-h-[calc(100%-24px)] w-[min(320px,calc(100%-80px))] overflow-auto rounded-[8px] border border-line-2 bg-glass p-3 text-sm shadow-lg',
        app ? 'left-[60px]' : 'left-14',
      )}
    >
      {onCloseDetail && (
        <button className="float-right ml-2 rounded p-0.5 text-muted hover:text-text" onClick={onCloseDetail} aria-label="Fechar detalhes">
          <X className="h-4 w-4" />
        </button>
      )}
      {detail}
    </div>
  )
  const BASE_OPTS = [
    ['mapa', 'Mapa'],
    ['mapa2', 'Mapa 2'],
    ['satelite', 'Satélite'],
  ] as const

  if (app)
    return (
      <div ref={wrap} className="relative isolate h-full w-full bg-[var(--map-bg)]">
        <div
          ref={box}
          className={clsx('h-full w-full', picking && '[&_.leaflet-container]:!cursor-crosshair !cursor-crosshair')}
          role="img"
          aria-label="Mapa de localização do alvo"
        />
        <div className="absolute top-[84px] left-[10px] z-[500]">
          <button
            className={clsx(
              'grid h-[40px] w-[40px] place-items-center rounded-[6px] border-2 border-black/20 bg-[#fff] text-gray-800 shadow-sm hover:bg-gray-50',
              layersOpen && '!border-blue-500 text-blue-600',
            )}
            onClick={() => setLayersOpen(!layersOpen)}
            aria-label="Camadas do mapa"
            aria-expanded={layersOpen}
          >
            <Layers className="h-5 w-5" />
          </button>
          {layersOpen && (
            <div className="absolute top-0 left-[48px] w-[210px] rounded-[10px] border border-gray-200 bg-[#fff] p-3 text-[13px] text-gray-800 shadow-xl">
              <div className="mb-1 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">Mapa de fundo</div>
              {BASE_OPTS.map(([id, label]) => (
                <label key={id} className="flex cursor-pointer items-center gap-2 py-1">
                  <input type="radio" name="base" checked={b === id} onChange={() => setB(id)} /> {label}
                </label>
              ))}
              {erbLayer && (
                <>
                  <div className="mt-2 mb-1 border-t border-gray-200 pt-2 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">Antenas (Anatel)</div>
                  <label className="flex cursor-pointer items-center gap-2 py-1 font-medium">
                    <input type="checkbox" checked={erbOn} onChange={(e) => setErbOn(e.target.checked)} aria-label="ERBs" /> Mostrar ERBs das operadoras
                  </label>
                  {erbOn && <div className="pl-1 text-[12.5px]">{opsList}</div>}
                </>
              )}
            </div>
          )}
        </div>
        {detailBox}
      </div>
    )

  return (
    <div ref={wrap} className={clsx('relative isolate overflow-hidden rounded-2xl border border-line bg-[var(--map-bg)]', full ? 'h-screen' : 'h-[58vh] min-h-[380px]')}>
      <div
        ref={box}
        className={clsx('h-full w-full', picking && '[&_.leaflet-container]:!cursor-crosshair !cursor-crosshair')}
        role="img"
        aria-label="Mapa de localização do alvo"
      />
      <div className="absolute top-3 right-3 z-[500] flex gap-2">
        <button
          className="grid h-9 w-9 place-items-center rounded-[7px] border border-line-2 bg-glass text-text hover:text-accent"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen?.())}
          aria-label={full ? 'Sair da tela cheia' : 'Tela cheia'}
        >
          {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <div className="flex overflow-hidden rounded-[7px] border border-line-2 bg-glass text-xs font-medium sm:text-[13px]" role="group" aria-label="Fundo do mapa">
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
          {erbLayer && (
            <button
              className={clsx('border-l border-line-2 px-2.5 py-1.5', erbOn ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text')}
              onClick={() => setErbOn(!erbOn)}
              aria-pressed={erbOn}
              title="Antenas de todas as operadoras licenciadas na Anatel"
            >
              ERBs
            </button>
          )}
        </div>
      </div>
      {erbOn && <div className="absolute top-14 right-3 z-[500] w-[150px] rounded-[7px] border border-line-2 bg-glass px-3 py-2 text-[12px]">{opsList}</div>}
      {detailBox}
      <div className="absolute bottom-3 left-3 z-[500] rounded-[7px] border border-line bg-glass px-3 py-2 text-[11px] leading-5 text-muted">
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
