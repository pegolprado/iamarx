import { useEffect, useRef } from 'react'

type Node = { x: number; y: number; vx: number; vy: number; r: number; gold: boolean }
type Pulse = { a: number; b: number; t: number; speed: number }

const LINK = 150 // distância máxima (px) para ligar dois nós
const BLUE = '76, 141, 255'
const GOLD = '226, 169, 59'

/**
 * Fundo "Dark Intelligence": uma rede de nós com conexões que se movem devagar e pulsos que
 * percorrem algumas ligações. Leve de propósito: ~30 quadros/s, pausa com a aba oculta e fica
 * estático para quem pediu menos movimento no sistema.
 */
export function NetworkBackground() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0
    let h = 0
    let nodes: Node[] = []
    const pulses: Pulse[] = []
    let raf = 0
    let last = 0
    let lastPulse = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = Math.max(26, Math.min(80, Math.round((w * h) / 15000)))
      nodes = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: 0.8 + Math.random() * 1.6,
        gold: Math.random() < 0.12,
      }))
      pulses.length = 0
      draw(0)
    }

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h)
      // ligações
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]
          const b = nodes[j]
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          if (d > LINK) continue
          ctx.strokeStyle = `rgba(${BLUE}, ${(1 - d / LINK) * 0.2})`
          ctx.lineWidth = 0.6
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      // pulsos percorrendo uma ligação
      for (const p of pulses) {
        const a = nodes[p.a]
        const b = nodes[p.b]
        if (!a || !b) continue
        const x = a.x + (b.x - a.x) * p.t
        const y = a.y + (b.y - a.y) * p.t
        const g = ctx.createRadialGradient(x, y, 0, x, y, 6)
        g.addColorStop(0, `rgba(${GOLD}, 0.9)`)
        g.addColorStop(1, `rgba(${GOLD}, 0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, 6, 0, Math.PI * 2)
        ctx.fill()
      }
      // nós
      for (const n of nodes) {
        const tw = n.gold ? 0.55 + 0.35 * Math.sin(t / 900 + n.x) : 0.5
        ctx.fillStyle = `rgba(${n.gold ? GOLD : BLUE}, ${tw})`
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const step = (t: number) => {
      raf = requestAnimationFrame(step)
      if (t - last < 33) return // ~30 quadros por segundo
      last = t
      for (const n of nodes) {
        n.x += n.vx
        n.y += n.vy
        if (n.x < -20) n.x = w + 20
        else if (n.x > w + 20) n.x = -20
        if (n.y < -20) n.y = h + 20
        else if (n.y > h + 20) n.y = -20
      }
      if (t - lastPulse > 1400 && pulses.length < 4) {
        lastPulse = t
        const a = Math.floor(Math.random() * nodes.length)
        const near = nodes.map((n, i) => [i, Math.hypot(n.x - nodes[a].x, n.y - nodes[a].y)] as const).filter(([i, d]) => i !== a && d < LINK)
        if (near.length) pulses.push({ a, b: near[Math.floor(Math.random() * near.length)][0], t: 0, speed: 0.012 + Math.random() * 0.01 })
      }
      for (let i = pulses.length - 1; i >= 0; i--) if ((pulses[i].t += pulses[i].speed) >= 1) pulses.splice(i, 1)
      draw(t)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    const vis = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden && !reduce) raf = requestAnimationFrame(step)
    }
    document.addEventListener('visibilitychange', vis)
    vis()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', vis)
    }
  }, [])
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
}
