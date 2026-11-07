import type { Core } from 'cytoscape'
import { Maximize, Minus, Plus } from 'lucide-react'
import type { ReactNode, RefObject } from 'react'

/** Fundo dos grafos: grade técnica discreta sobre preto azulado. */
export const GRAPH_BG =
  'bg-[#05090d] [background-image:radial-gradient(circle_at_50%_40%,rgba(0,217,245,0.07),transparent_60%),linear-gradient(rgba(95,150,180,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(95,150,180,0.05)_1px,transparent_1px)] [background-size:auto,28px_28px,28px_28px]'

export const GRAPH_COLORS = {
  target: '#00d9f5',
  common: '#e7aa4b',
  contact: '#3d6578',
  contactAlt: '#00d68f',
  edge: '#24465a',
  reciprocal: '#00d68f',
  direct: '#f0646e',
  label: '#9aaaba',
  ring: '#05090d',
}

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Ao passar o mouse num nó, destaca a vizinhança e esmaece o resto do grafo. */
export function hoverFocus(cy: Core) {
  cy.on('mouseover', 'node', (ev) => {
    cy.elements().addClass('faded')
    ev.target.closedNeighborhood().removeClass('faded').addClass('focus')
  })
  cy.on('mouseout', 'node', () => cy.elements().removeClass('faded focus'))
}

/** Estilos comuns de foco/esmaecimento (acrescentar ao estilo do grafo). */
export const FOCUS_STYLES: any[] = [
  { selector: '.faded', style: { opacity: 0.14 } },
  { selector: 'node.focus', style: { 'underlay-color': '#00d9f5', 'underlay-opacity': 0.14, 'underlay-padding': 6, 'underlay-shape': 'ellipse' } },
  { selector: 'edge.focus', style: { opacity: 1 } },
]

/** Zoom e enquadramento do grafo. */
export function GraphControls({ cy }: { cy: RefObject<Core | null> }) {
  const zoom = (f: number) => {
    const c = cy.current
    if (!c) return
    c.animate({ zoom: { level: c.zoom() * f, renderedPosition: { x: c.width() / 2, y: c.height() / 2 } } }, { duration: reducedMotion() ? 0 : 180 })
  }
  const btn = 'grid h-8 w-8 place-items-center text-muted transition-colors hover:bg-white/5 hover:text-accent'
  return (
    <div className="absolute top-3 right-3 z-10 flex flex-col divide-y divide-line overflow-hidden rounded-[7px] border border-line-2 bg-[rgba(8,14,20,0.9)]">
      <button className={btn} onClick={() => zoom(1.25)} aria-label="Aproximar" title="Aproximar">
        <Plus className="h-4 w-4" />
      </button>
      <button className={btn} onClick={() => zoom(0.8)} aria-label="Afastar" title="Afastar">
        <Minus className="h-4 w-4" />
      </button>
      <button
        className={btn}
        onClick={() => cy.current?.animate({ fit: { eles: cy.current.elements(), padding: 30 } }, { duration: reducedMotion() ? 0 : 220 })}
        aria-label="Enquadrar tudo"
        title="Enquadrar tudo"
      >
        <Maximize className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function GraphLegend({ items, className }: { items: { color: string; label: string; line?: boolean; dashed?: boolean; square?: boolean }[]; className?: string }) {
  return (
    <div
      className={`absolute z-10 flex flex-wrap gap-x-3.5 gap-y-1 rounded-[7px] border border-line bg-[rgba(8,14,20,0.88)] px-2.5 py-1.5 font-mono text-[10px] text-muted ${className ?? 'top-3 left-3'}`}
    >
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.line ? (
            <span className="inline-block h-0 w-4 border-t-2" style={{ borderColor: i.color, borderStyle: i.dashed ? 'dashed' : 'solid' }} />
          ) : (
            <span className={i.square ? 'h-2.5 w-2.5 rounded-[2px]' : 'h-2.5 w-2.5 rounded-full'} style={{ background: i.color, boxShadow: `0 0 6px ${i.color}` }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  )
}

export function GraphOverlay({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`absolute z-10 ${className ?? ''}`}>{children}</div>
}
