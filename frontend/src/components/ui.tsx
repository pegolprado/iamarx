import clsx from 'clsx'
import { AlertTriangle, ChevronLeft, ChevronRight, Info, Loader2, X } from 'lucide-react'
import { createContext, type ReactNode, useContext, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { encodeFilter, fmtNumber } from '../lib/format'

/** Verdadeiro dentro da moldura de um módulo (que já mostra ícone e identificação do módulo). */
export const InModule = createContext(false)

/** Cabeçalho da tela: título, descrição operacional curta e barra de ações. */
export function PageHeader({ icon, title, subtitle, actions, badge }: { icon?: ReactNode; title: string; subtitle?: ReactNode; actions?: ReactNode; badge?: ReactNode }) {
  const inModule = useContext(InModule)
  if (inModule)
    return (
      <header className="mb-5 flex flex-col gap-3 rounded-[10px] border border-line bg-petrol/45 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[14.5px] leading-tight font-semibold text-white">
            <span className="h-3.5 w-[2px] rounded-full bg-accent shadow-[0_0_6px_rgba(0,217,245,0.8)]" aria-hidden="true" />
            {title}
          </h1>
          {subtitle && <div className="mt-1 line-clamp-2 max-w-5xl text-[12.5px] leading-relaxed text-muted">{subtitle}</div>}
          {badge && <div className="mt-2">{badge}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 [&_.btn-ghost]:h-8 [&_.btn-primary]:h-8 [&_.btn-danger]:h-8">{actions}</div>}
      </header>
    )
  return (
    <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[7px] border border-line bg-petrol text-accent [&>svg]:!h-4 [&>svg]:!w-4">{icon}</div>}
        <div className="min-w-0">
          <h1 className="text-[17px] leading-tight font-semibold text-white">{title}</h1>
          {subtitle && <div className="mt-1 max-w-4xl text-[13px] leading-relaxed text-muted">{subtitle}</div>}
          {badge && <div className="mt-2">{badge}</div>}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-[8px] border border-line bg-petrol/50 p-1 [&_.btn-ghost]:h-8 [&_.btn-primary]:h-8">{actions}</div>
      )}
    </header>
  )
}

const TONES = {
  blue: 'text-[#7fe9f8] border-accent/25 bg-accent/[0.07]',
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
    <div className="card relative overflow-hidden px-4 py-3.5">
      <span className={clsx('absolute top-0 left-4 h-px w-10', tone ? TONE_TEXT[tone].replace('text-', 'bg-') : 'bg-accent/70')} aria-hidden="true" />
      <div className="font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">{label}</div>
      <div className={clsx('mt-1.5 font-mono text-[21px] leading-tight font-medium tabular-nums', tone ? TONE_TEXT[tone] : 'text-white')}>{value}</div>
      {hint && <div className="mt-1 text-[12px] leading-snug text-faint">{hint}</div>}
    </div>
  )
}

/** Carregamento: esqueleto do conteúdo (linhas) + rótulo do que está sendo processado. */
export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="py-4" role="status">
      <div className="mb-3 flex items-center gap-2 font-mono text-[11px] tracking-[0.06em] text-muted uppercase">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" /> {label}
      </div>
      <div className="space-y-2" aria-hidden="true">
        <div className="skeleton h-9 w-full" />
        <div className="skeleton h-9 w-[92%]" />
        <div className="skeleton h-9 w-[78%]" />
      </div>
    </div>
  )
}

export function Empty({ title = 'Nada por aqui ainda', children, icon }: { title?: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-[10px] border border-dashed border-line-2 bg-[radial-gradient(circle_at_50%_0%,rgba(0,217,245,0.06),transparent_60%)] px-6 py-12 text-center">
      <div className="mb-1 grid h-10 w-10 place-items-center rounded-full border border-line bg-petrol text-faint [&>svg]:!h-5 [&>svg]:!w-5">
        {icon ?? <span className="h-1.5 w-1.5 rounded-full bg-faint" />}
      </div>
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
    <div className={clsx('flex items-start gap-3 rounded-[8px] border-y border-r border-l-2 border-y-line border-r-line bg-petrol/60 px-3.5 py-2.5 text-[13px]', NOTICE_BAR[tone])}>
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
    <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-[rgba(3,6,9,0.72)] p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'view-in mt-[8vh] w-full rounded-[12px] border border-line-2 bg-panel shadow-[0_0_0_1px_rgba(0,217,245,0.05),0_30px_80px_-24px_rgba(0,0,0,0.9)]',
          wide ? 'max-w-5xl' : 'max-w-xl',
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line bg-petrol/70 px-5 py-3">
          <h2 className="text-[14.5px] font-semibold text-white">{title}</h2>
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
    <div className="scroll-x mb-4 flex max-w-full gap-0.5 border-b border-line" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={clsx(
            '-mb-px shrink-0 border-b-2 px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors duration-150',
            value === it.value ? 'border-accent text-white' : 'border-transparent text-muted hover:text-text',
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
    <details className="group mt-4 rounded-[8px] border border-line bg-petrol/50 px-3.5 py-2.5 text-[12px] text-muted">
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
    <div className="h-1 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={clsx('h-full rounded-full shadow-[0_0_8px_currentColor] transition-all duration-300', color)}
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  )
}

export function DemoBanner({ show }: { show?: boolean }) {
  if (!show) return null
  return (
    <div className="mb-4 flex items-center gap-2 rounded-[8px] border border-amber/30 bg-amber/[0.06] px-3.5 py-1.5 font-mono text-[11px] tracking-[0.04em] text-amber uppercase">
      <AlertTriangle className="h-4 w-4" /> Demonstração — dados sintéticos, sem valor investigativo
    </div>
  )
}
