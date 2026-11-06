import clsx from 'clsx'
import { AlertTriangle, ChevronLeft, ChevronRight, Info, Loader2, X } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { encodeFilter, fmtNumber } from '../lib/format'

/** Cabeçalho de página: título à esquerda com subtítulo curto, ações à direita. */
export function PageHeader({ icon, title, subtitle, actions, badge }: { icon?: ReactNode; title: string; subtitle?: ReactNode; actions?: ReactNode; badge?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        {icon && (
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-panel-2 text-accent [&>svg]:!h-[18px] [&>svg]:!w-[18px]">{icon}</div>
        )}
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.015em] text-white">{title}</h1>
          {subtitle && <div className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-muted">{subtitle}</div>}
          {badge && <div className="mt-2.5">{badge}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

const TONES = {
  blue: 'text-[#8fb0e6] border-accent/25 bg-accent/[0.09]',
  teal: 'text-teal border-teal/25 bg-teal/[0.08]',
  amber: 'text-amber border-amber/25 bg-amber/[0.08]',
  red: 'text-danger border-danger/25 bg-danger/[0.08]',
  violet: 'text-violet border-violet/25 bg-violet/[0.08]',
  green: 'text-ok border-ok/25 bg-ok/[0.08]',
  gray: 'text-muted border-line bg-white/[0.025]',
} as const
const TONE_TEXT: Record<keyof typeof TONES, string> = {
  blue: 'text-accent',
  teal: 'text-teal',
  amber: 'text-amber',
  red: 'text-danger',
  violet: 'text-violet',
  green: 'text-ok',
  gray: 'text-muted',
}
export type Tone = keyof typeof TONES

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={clsx('chip', TONES[tone], className)}>{children}</span>
}

export function SectionHeader({
  icon,
  title,
  tone = 'blue',
  count,
  unit = 'módulo',
  right,
}: {
  icon: ReactNode
  title: string
  tone?: Tone
  count?: number
  unit?: string
  right?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className={clsx('[&>svg]:!h-4 [&>svg]:!w-4', TONE_TEXT[tone])}>{icon}</span>
        <h2 className="text-[14px] font-semibold text-text">{title}</h2>
        {count !== undefined && (
          <span className="text-[12px] text-faint tabular-nums">
            {count} {count === 1 ? unit : unit + 's'}
          </span>
        )}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  )
}

/** Cartão compacto de ferramenta: ícone, nome, descrição, indicador e ação à direita. */
export function ModuleCard({
  title,
  description,
  to,
  tone = 'blue',
  meta,
  disabled,
  icon,
}: {
  title: string
  description: string
  to: string
  tone?: Tone
  meta?: ReactNode
  disabled?: boolean
  icon?: ReactNode
}) {
  const inner = (
    <div className={clsx('card card-hover group flex h-full flex-col p-4', disabled && 'opacity-60')}>
      <div className="flex items-start gap-3">
        {icon ? (
          <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-panel-2 [&>svg]:!h-4 [&>svg]:!w-4', TONE_TEXT[tone])}>{icon}</span>
        ) : (
          <span className={clsx('mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full', TONE_TEXT[tone].replace('text-', 'bg-'))} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[14px] font-semibold text-white">{title}</h3>
            {!disabled && <ChevronRight className="h-4 w-4 shrink-0 text-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-muted" />}
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>
        </div>
      </div>
      {meta && <div className={clsx('mt-auto pt-3 text-[12px] text-faint', icon ? 'pl-11' : 'pl-4')}>{meta}</div>}
    </div>
  )
  if (disabled) return inner
  return (
    <Link to={to} className="block h-full rounded-[12px]">
      {inner}
    </Link>
  )
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="card px-4 py-3.5">
      <div className="text-[12px] font-medium text-muted">{label}</div>
      <div className={clsx('mt-1 text-[22px] leading-tight font-semibold tracking-[-0.01em] tabular-nums', tone ? TONE_TEXT[tone] : 'text-white')}>{value}</div>
      {hint && <div className="mt-1 text-[12px] leading-snug text-faint">{hint}</div>}
    </div>
  )
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-10 text-[13px] text-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin text-accent" /> {label}
    </div>
  )
}

export function Empty({ title = 'Nada por aqui ainda', children, icon }: { title?: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-line-2 bg-panel/50 px-6 py-12 text-center">
      {icon && <div className="mb-1 grid h-10 w-10 place-items-center rounded-lg border border-line bg-panel-2 text-muted [&>svg]:!h-5 [&>svg]:!w-5">{icon}</div>}
      <div className="text-[14px] font-semibold text-text">{title}</div>
      {children && <div className="max-w-lg text-[13px] leading-relaxed text-muted">{children}</div>}
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error)
  return (
    <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/[0.07] px-3.5 py-3 text-[13px] text-[#e7a3a8]" role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{msg}</div>
      {onRetry && (
        <button className="btn-ghost !py-1 text-xs" onClick={onRetry}>
          Tentar de novo
        </button>
      )}
    </div>
  )
}

const NOTICE_BAR: Record<Tone, string> = {
  blue: 'border-l-accent',
  teal: 'border-l-teal',
  amber: 'border-l-amber',
  red: 'border-l-danger',
  violet: 'border-l-violet',
  green: 'border-l-ok',
  gray: 'border-l-line-2',
}

export function Notice({ children, tone = 'blue', title }: { children: ReactNode; tone?: Tone; title?: string }) {
  return (
    <div className={clsx('flex items-start gap-3 rounded-lg border-y border-r border-l-2 border-y-line border-r-line bg-panel px-3.5 py-3 text-[13px]', NOTICE_BAR[tone])}>
      <Info className={clsx('mt-0.5 h-4 w-4 shrink-0', TONE_TEXT[tone])} />
      <div className="leading-relaxed text-text/85">
        {title && <div className="mb-0.5 font-semibold text-text">{title}</div>}
        {children}
      </div>
    </div>
  )
}

/** Envolve estados de carregamento, erro e vazio de uma consulta. */
export function QueryState<T>({
  q,
  empty,
  children,
}: {
  q: { isLoading: boolean; error: unknown; data?: T; refetch?: () => void }
  empty?: (d: T) => boolean
  children: (d: T) => ReactNode
}) {
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} onRetry={q.refetch} />
  if (q.data === undefined) return null
  if (empty && empty(q.data)) return <Empty title="Nenhum resultado">Ajuste os filtros ou carregue arquivos nesta análise.</Empty>
  return <>{children(q.data)}</>
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-[rgba(6,9,14,0.66)] p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx('mt-[8vh] w-full rounded-[14px] border border-line-2 bg-panel shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]', wide ? 'max-w-5xl' : 'max-w-xl')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-white">{title}</h2>
          <button className="rounded-md p-1 text-muted transition-colors hover:bg-white/5 hover:text-text" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div className="mb-4 inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-line bg-ink-2 p-0.5" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={clsx(
            'rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-150',
            value === it.value ? 'bg-panel-2 text-white shadow-[0_0_0_1px_var(--color-line-2)]' : 'text-muted hover:bg-white/[0.03] hover:text-text',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-faint">{hint}</span>}
    </label>
  )
}

export function Pagination({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size))
  return (
    <div className="flex items-center justify-between gap-2 pt-3 text-xs text-muted">
      <span>
        {total.toLocaleString('pt-BR')} registros · página {page} de {pages}
      </span>
      <div className="flex gap-1">
        <button className="btn-ghost !px-2 !py-1" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button className="btn-ghost !px-2 !py-1" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Próxima página">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/** Explicita filtros, regras e limites usados em um resultado. */
export function Criteria({ criteria }: { criteria?: Record<string, any> }) {
  if (!criteria) return null
  const { filters, rules_version, ...rest } = criteria
  const entries = Object.entries(rest).filter(([, v]) => v !== null && v !== undefined && v !== '')
  return (
    <details className="group mt-4 rounded-lg border border-line bg-ink-2/70 px-3.5 py-2.5 text-[12px] text-muted">
      <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-faint transition-colors hover:text-muted">
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" /> Critérios, regras e limites deste resultado
      </summary>
      <dl className="mt-2 grid gap-1.5">
        <div>
          <dt className="inline font-semibold text-text/80">Filtros: </dt>
          <dd className="inline font-mono">{filters && Object.keys(filters).length ? JSON.stringify(filters) : 'nenhum filtro adicional'}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-text/80">Versão das regras: </dt>
          <dd className="inline font-mono">{rules_version}</dd>
        </div>
        {entries.map(([k, v]) => (
          <div key={k}>
            <dt className="inline font-semibold text-text/80">{k.replace(/_/g, ' ')}: </dt>
            <dd className="inline">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

/** Link "abrir os registros" que leva ao explorador com o filtro aplicado. */
export function DrillLink({ filter, children, className }: { caseId?: number | string; filter: object; children: ReactNode; className?: string }) {
  return (
    <Link className={clsx('text-accent hover:underline', className)} to={`/analise/eventos?f=${encodeFilter(filter)}`}>
      {children}
    </Link>
  )
}

export function Num({ n, caseId, label }: { n?: string | null; caseId?: number | string; label?: string | null }) {
  if (!n) return <span className="text-faint">—</span>
  const text = (
    <span className="font-mono text-[13px] whitespace-nowrap">
      {fmtNumber(n)}
      {label && <span className="ml-1 font-sans text-xs text-teal">({label})</span>}
    </span>
  )
  if (caseId === undefined) return text
  return (
    <DrillLink caseId={caseId} filter={{ numbers: [n] }} className="!text-text hover:!text-accent">
      {text}
    </DrillLink>
  )
}

export function Progress({ value, tone = 'blue' }: { value: number; tone?: Tone }) {
  const color = { blue: 'bg-accent', teal: 'bg-teal', amber: 'bg-amber', red: 'bg-danger', violet: 'bg-violet', green: 'bg-ok', gray: 'bg-muted' }[tone]
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  )
}

export function DemoBanner({ show }: { show?: boolean }) {
  if (!show) return null
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber/30 bg-amber/[0.07] px-3.5 py-2 text-[12.5px] font-medium text-amber">
      <AlertTriangle className="h-4 w-4" /> Demonstração — dados sintéticos, sem valor investigativo
    </div>
  )
}
