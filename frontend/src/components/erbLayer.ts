import { gunzipSync } from 'fflate'
import L from 'leaflet'

/**
 * Camada "ERBs": antenas de todas as operadoras licenciadas na Anatel (dados abertos, Estações
 * do SMP), carregadas por quadrícula de 1° só para a região visível. Nada é enviado: o
 * navegador apenas baixa arquivos públicos do próprio site.
 */
export const ERB_OPS = [
  { key: 0, label: 'Vivo', color: '#7c3aed' },
  { key: 1, label: 'TIM', color: '#2563eb' },
  { key: 2, label: 'Claro', color: '#dc2626' },
  { key: 3, label: 'Outras', color: '#6b7280' },
] as const

/** posição: [lat×1e5, lon×1e5, máscara de operadoras, máscara 2G/3G/4G/5G, endereço, município, outras operadoras] */
export type ErbSite = [number, number, number, number, string, string, string]

type Index = { tiles: string[]; stations: number; generated: string; source: string }
let indexP: Promise<Index | null> | null = null
const tiles = new Map<string, Promise<ErbSite[]>>()

async function fetchGz(name: string): Promise<any> {
  const r = await fetch(`/vendor/erbs/${name}`)
  if (!r.ok) throw new Error(`base de ERBs indisponível (${r.status})`)
  const u8 = new Uint8Array(await r.arrayBuffer())
  const raw = u8[0] === 0x1f && u8[1] === 0x8b ? gunzipSync(u8) : u8
  return JSON.parse(new TextDecoder().decode(raw))
}

export function erbIndex() {
  return (indexP ??= fetchGz('index.json').catch(() => null))
}

/** Posições de ERB dentro dos limites (carrega as quadrículas necessárias). */
export async function erbSitesIn(b: L.LatLngBounds): Promise<ErbSite[]> {
  const idx = await erbIndex()
  if (!idx) return []
  const have = new Set(idx.tiles)
  const keys: string[] = []
  for (let la = Math.floor(b.getSouth()); la <= Math.floor(b.getNorth()); la++)
    for (let lo = Math.floor(b.getWest()); lo <= Math.floor(b.getEast()); lo++) if (have.has(`${la}_${lo}`)) keys.push(`${la}_${lo}`)
  if (keys.length > 12) return [] // área grande demais: o mapa pede para aproximar
  const all = await Promise.all(
    keys.map((k) => {
      if (!tiles.has(k))
        tiles.set(
          k,
          fetchGz(`${k}.json.gz`)
            .then((d) => d.s as ErbSite[])
            .catch(() => (tiles.delete(k), [])),
        )
      return tiles.get(k)!
    }),
  )
  const s = b.getSouth() * 1e5,
    n = b.getNorth() * 1e5,
    w = b.getWest() * 1e5,
    e = b.getEast() * 1e5
  return all.flat().filter((x) => x[0] >= s && x[0] <= n && x[1] >= w && x[1] <= e)
}

const GENS = ['2G', '3G', '4G', '5G']

/** Marcador em pizza (uma fatia por operadora presente no ponto), desenhado no canvas. */
const PieMarker = L.CircleMarker.extend({
  _updatePath(this: any) {
    const r = this._renderer
    if (!r?._drawing || this._empty()) return
    const ctx: CanvasRenderingContext2D = r._ctx
    const p = this._point
    const rad = Math.max(this._radius, 1)
    const colors: string[] = this.options.colors
    const step = (Math.PI * 2) / colors.length
    colors.forEach((c, i) => {
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.arc(p.x, p.y, rad, -Math.PI / 2 + i * step, -Math.PI / 2 + (i + 1) * step)
      ctx.closePath()
      ctx.fillStyle = c
      ctx.globalAlpha = 0.92
      ctx.fill()
    })
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(p.x, p.y, rad, 0, Math.PI * 2)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    ctx.stroke()
  },
})

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function erbPopup(x: ErbSite) {
  const ops = ERB_OPS.filter((o) => x[2] & (1 << o.key))
    .map((o) => `<span style="color:${o.color};font-weight:700">● ${o.key === 3 && x[6] ? esc(x[6]) : o.label}</span>`)
    .join(' &nbsp;')
  const gens = GENS.filter((_, i) => x[3] & (1 << i)).join(' · ')
  return `<div style="font:12px/1.5 system-ui;min-width:200px">${ops}<div style="margin-top:4px">${esc(x[4] || 'Endereço não informado')}</div><div style="opacity:.75">${esc(x[5] || '')}</div><div style="margin-top:4px;font-family:ui-monospace,monospace;font-size:11px">${(x[0] / 1e5).toFixed(5)}, ${(x[1] / 1e5).toFixed(5)}${gens ? ` · ${gens}` : ''}</div><div style="margin-top:4px;font-size:10.5px;opacity:.6">Fonte: Anatel (licenciamento)</div></div>`
}

/** Desenha as posições filtradas pelas operadoras marcadas. */
export function drawErbs(g: L.LayerGroup, sites: ErbSite[], enabled: Set<number>, renderer: L.Renderer, zoom: number) {
  g.clearLayers()
  const radius = zoom >= 15 ? 7 : zoom >= 13 ? 5.5 : 4
  for (const x of sites) {
    const colors = ERB_OPS.filter((o) => x[2] & (1 << o.key) && enabled.has(o.key)).map((o) => o.color)
    if (!colors.length) continue
    const m = new (PieMarker as any)([x[0] / 1e5, x[1] / 1e5], { renderer, radius, colors, weight: 0 }) as L.CircleMarker
    m.bindPopup(() => erbPopup(x), { maxWidth: 320 })
    m.addTo(g)
  }
}
