import { useSyncExternalStore } from 'react'
import { useSession } from '../engine/session'

/**
 * Indicador global de processamento: mostra, em qualquer tela, que uma análise está sendo
 * criada (leitura de arquivo, importação, cruzamentos). Junta três fontes: o aviso explícito
 * das telas (setProgress), a tarefa em andamento da sessão (busy) e importações em execução.
 */
type P = { label: string; pct: number | null } | null
let cur: P = null
const subs = new Set<() => void>()
export function setProgress(label: string | null, pct: number | null = null) {
  cur = label ? { label, pct } : null
  subs.forEach((f) => f())
}
const useManual = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => cur,
  )

/** Dá tempo ao navegador de desenhar o indicador antes de um processamento pesado. */
export const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

export function GlobalProgress() {
  const manual = useManual()
  const busy = useSession((s) => s.busy)
  const running = useSession((s) => s.imports.find((i) => i.status === 'running'))
  const p: P =
    manual ??
    (busy
      ? { label: busy.label, pct: busy.progress > 0 ? busy.progress : null }
      : running
        ? { label: `Importando: ${running.message ?? 'processando'}`, pct: running.progress || null }
        : null)
  if (!p) return null
  const pct = p.pct !== null ? Math.max(2, Math.min(100, Math.round(p.pct * 100))) : null
  return (
    <>
      <div
        className="fixed inset-x-0 top-0 z-[1200] h-[3px] overflow-hidden bg-accent/15"
        role="progressbar"
        aria-label={p.label}
        aria-valuenow={pct ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {pct !== null ? (
          <div className="h-full bg-accent shadow-[0_0_10px_rgba(0,217,245,0.9)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
        ) : (
          <div className="progress-indeterminate h-full w-1/3 bg-accent shadow-[0_0_10px_rgba(0,217,245,0.9)]" />
        )}
      </div>
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[1200] -translate-x-1/2 px-3" role="status" aria-live="polite">
        <div className="flex max-w-[92vw] items-center gap-3 rounded-full border border-accent/40 bg-glass px-4 py-2 text-[13px] text-text shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)]">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          <span className="truncate">{p.label}</span>
          {pct !== null && <span className="font-mono text-[12px] text-accent tabular-nums">{pct}%</span>}
        </div>
      </div>
    </>
  )
}
