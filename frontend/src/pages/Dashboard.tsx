import clsx from 'clsx'
import { ArrowUpRight, FlaskConical } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../app/auth'
import { apath } from '../app/layout'
import { type ModuleDef, type ModuleGroup, MODULES } from '../app/modules'
import { type OpsSummary, StatusDot, useOps } from '../app/system'
import { GIngest } from '../components/glyphs'
import { Progress } from '../components/ui'
import { loadDemo } from '../engine/demo'
import { getState, setState, useSession } from '../engine/session'
import { fmtDate, fmtInt } from '../lib/format'

/** Estado operacional de cada módulo, calculado dos dados reais da aba. */
function moduleState(key: string, o: OpsSummary): { value: number | null; unit: string; ready: boolean; label: string } {
  switch (key) {
    case 'cases':
      return { value: o.targets, unit: 'alvos', ready: o.hasData, label: o.hasData ? 'OPERAÇÃO ABERTA' : 'SEM OPERAÇÃO' }
    case 'import':
      return { value: o.files, unit: 'arquivos', ready: true, label: o.importsRunning ? 'PROCESSANDO' : 'PRONTO' }
    case 'full':
      return { value: o.records, unit: 'registros', ready: o.records > 0, label: o.records ? 'DISPONÍVEL' : 'AGUARDANDO DADOS' }
    case 'cdr':
      return { value: o.cdr, unit: 'registros', ready: o.cdr > 0, label: o.cdr ? 'DISPONÍVEL' : 'AGUARDANDO DADOS' }
    case 'links':
      return { value: o.targets, unit: 'alvos', ready: o.cdr + o.wa > 0, label: o.cdr + o.wa ? 'DISPONÍVEL' : 'AGUARDANDO DADOS' }
    case 'whatsapp':
      return { value: o.wa + o.access, unit: 'registros', ready: o.wa + o.access > 0, label: o.wa + o.access ? 'DISPONÍVEL' : 'AGUARDANDO DADOS' }
    case 'erb':
      return { value: o.cells, unit: 'células ERB', ready: o.cdr + o.cells > 0, label: o.cdr + o.cells ? 'DISPONÍVEL' : 'AGUARDANDO DADOS' }
    case 'reports':
      return { value: o.alertsPending, unit: 'alertas pendentes', ready: o.hasData, label: o.alertsPending ? 'REVISÃO PENDENTE' : o.hasData ? 'DISPONÍVEL' : 'AGUARDANDO DADOS' }
    default:
      return { value: null, unit: '', ready: true, label: 'ATIVO' }
  }
}

const to = (m: ModuleDef) => (m.inCase ? apath(m.path) : m.path)
const byGroup = (g: ModuleGroup) => MODULES.filter((m) => m.group === g)

function StateTag({ ready, label, warn }: { ready: boolean; label: string; warn?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em]', warn ? 'text-amber' : ready ? 'text-ok' : 'text-faint')}>
      <StatusDot ok={warn ? null : ready} /> {label}
    </span>
  )
}

/** Módulo em destaque: maior, com indicador numérico. */
function FeatureModule({ m, o, accent, grid }: { m: ModuleDef; o: OpsSummary; accent?: boolean; grid?: boolean }) {
  const st = moduleState(m.key, o)
  return (
    <Link to={to(m)} className={clsx('card card-hover group relative flex min-h-[188px] flex-col overflow-hidden p-5', accent && 'card-accent border-accent/30')}>
      {grid && (
        <div
          className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle_at_78%_30%,rgba(0,214,143,0.1),transparent_45%),linear-gradient(rgba(95,150,180,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(95,150,180,0.06)_1px,transparent_1px)] [background-size:auto,22px_22px,22px_22px]"
          aria-hidden="true"
        />
      )}
      <div className="relative flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-[9px] border border-accent/30 bg-petrol text-accent shadow-[0_0_22px_-10px_rgba(0,217,245,0.9)] [&>svg]:h-[22px] [&>svg]:w-[22px]">
          {m.icon}
        </span>
        <StateTag ready={st.ready} label={st.label} warn={m.key === 'reports' && o.alertsPending > 0} />
      </div>
      <h3 className="relative mt-4 text-[16.5px] font-semibold text-white">{m.title}</h3>
      <p className="relative mt-1 max-w-md text-[13px] leading-relaxed text-muted">{m.short}</p>
      <div className="relative mt-auto flex items-end justify-between gap-3 pt-4">
        {st.value !== null && (
          <div>
            <div className="font-mono text-[26px] leading-none font-medium text-white tabular-nums">{fmtInt(st.value)}</div>
            <div className="mt-1 font-mono text-[10px] tracking-[0.08em] text-faint uppercase">{st.unit}</div>
          </div>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-[12.5px] text-muted transition-colors group-hover:text-accent">
          Abrir <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      </div>
    </Link>
  )
}

/** Módulo em linha: compacto, para listas dentro de um grupo. */
function RowModule({ m, o }: { m: ModuleDef; o: OpsSummary }) {
  const st = moduleState(m.key, o)
  return (
    <Link to={to(m)} className="group flex flex-1 items-start gap-3.5 px-4 py-3.5 transition-colors duration-150 hover:bg-[rgba(0,217,245,0.04)]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-line bg-petrol text-muted transition-colors group-hover:border-accent/40 group-hover:text-accent [&>svg]:h-[18px] [&>svg]:w-[18px]">
        {m.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[13.5px] font-semibold text-white">{m.title}</h3>
          {st.value !== null && <span className="font-mono text-[13px] text-text tabular-nums">{fmtInt(st.value)}</span>}
        </div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{m.short}</p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <StateTag ready={st.ready} label={st.label} warn={m.key === 'reports' && o.alertsPending > 0} />
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-faint transition-colors group-hover:text-accent" />
        </div>
      </div>
    </Link>
  )
}

function Group({ title, code, children, className }: { title: ModuleGroup; code: string; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('flex flex-col', className)}>
      <div className="mb-2 flex items-center gap-2 px-0.5">
        <span className="font-mono text-[10px] text-accent/80">{code}</span>
        <h2 className="eyebrow !text-muted">{title}</h2>
        <span className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
      </div>
      {children}
    </section>
  )
}

/** Etapas da operação, marcadas conforme o que de fato já aconteceu nesta aba. */
function Pipeline({ o }: { o: OpsSummary }) {
  const steps = [
    { k: 'Aquisição', done: o.files > 0, active: o.files === 0 },
    { k: 'Processamento', done: o.importsDone > 0, active: o.files > 0 && o.importsDone === 0 },
    { k: 'Análise', done: o.records > 0, active: o.importsDone > 0 && o.records === 0 },
    { k: 'Revisão de alertas', done: o.alerts > 0 && o.alertsPending === 0, active: o.alertsPending > 0 },
  ]
  return (
    <ol className="flex items-center gap-2" aria-label="Etapas da operação">
      {steps.map((st, i) => (
        <li key={st.k} className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={clsx(
              'grid h-5 w-5 shrink-0 place-items-center rounded-full border font-mono text-[9.5px]',
              st.done ? 'border-ok/60 bg-ok/15 text-ok' : st.active ? 'border-accent/70 bg-accent/10 text-accent' : 'border-line text-faint',
            )}
          >
            {i + 1}
          </span>
          <span className={clsx('truncate font-mono text-[10.5px] tracking-[0.06em] uppercase', st.done ? 'text-text' : st.active ? 'text-accent' : 'text-faint')}>{st.k}</span>
          {i < steps.length - 1 && <span className={clsx('h-px min-w-3 flex-1', st.done ? 'bg-ok/40' : 'bg-line')} />}
        </li>
      ))}
    </ol>
  )
}

/** Composição dos registros carregados por origem (valores reais). */
function Composition({ o }: { o: OpsSummary }) {
  const parts = [
    { k: 'Bilhetagem', v: o.cdr, c: '#159FBC' },
    { k: 'WhatsApp', v: o.wa, c: '#BA7F2D' },
    { k: 'Logs de acesso', v: o.access, c: '#8A7BE6' },
  ].filter((p) => p.v > 0)
  return (
    <div>
      <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-line">
        {parts.map((p) => (
          <span key={p.k} className="h-full transition-[width] duration-700" style={{ width: `${(p.v / o.records) * 100}%`, background: p.c }} title={`${p.k}: ${fmtInt(p.v)}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
        {parts.map((p) => (
          <span key={p.k} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: p.c }} />
            {p.k} <span className="font-mono text-text tabular-nums">{fmtInt(p.v)}</span>
            <span className="font-mono text-faint">{Math.round((p.v / o.records) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function Metric({ label, value, tone, sub }: { label: string; value: number; tone?: string; sub?: string }) {
  return (
    <div className="min-w-0 px-4 py-3.5">
      <div className="truncate font-mono text-[10px] tracking-[0.08em] text-faint uppercase">{label}</div>
      <div className={clsx('mt-1 font-mono text-[24px] leading-none font-medium tabular-nums', value ? (tone ?? 'text-white') : 'text-faint')}>{fmtInt(value)}</div>
      {sub && <div className="mt-1 truncate text-[11.5px] text-faint">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const { me } = useAuth()
  const navigate = useNavigate()
  const o = useOps()
  const imports = useSession((s) => s.imports)
  const files = useSession((s) => s.files)
  const [demo, setDemo] = useState<{ label: string; p: number } | null>(null)
  const runDemo = async () => {
    if (getState().files.length && !confirm('A demonstração substitui os dados carregados nesta aba. Continuar?')) return
    try {
      await loadDemo((label, p) => {
        setDemo({ label, p })
        setState({ busy: p < 1 ? { label: `Demonstração: ${label}`, progress: p } : null })
      })
      toast.success('Análise de demonstração pronta.')
      navigate(apath())
    } catch (e: any) {
      setState({ busy: null })
      toast.error(`Falha ao gerar a demonstração: ${e?.message ?? e}`)
    } finally {
      setDemo(null)
    }
  }
  const recent = [...imports].reverse().slice(0, 6)
  const m = (k: string) => MODULES.find((x) => x.key === k)!

  return (
    <div className="space-y-6">
      {/* A — visão geral da operação */}
      <div className="grid gap-4 xl:grid-cols-12">
        <section className="card relative flex flex-col overflow-hidden xl:col-span-8">
          <div
            className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(0,217,245,0.12),transparent_65%)]"
            aria-hidden="true"
          />
          <div className="relative mb-5 flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
            <div className="min-w-0">
              <div className="eyebrow !text-accent/80">Intelligence Overview</div>
              <h1 className="mt-1.5 text-[24px] leading-tight font-semibold text-white">Workspace investigativo</h1>
              <p className="mt-1 text-[13px] text-muted">
                {o.hasData ? (
                  <>
                    Operação <span className="text-text">{o.title}</span>
                    {o.period[0] && (
                      <span className="font-mono text-[12px] text-faint">
                        {' '}
                        · {fmtDate(o.period[0])} → {o.period[1] ? fmtDate(o.period[1]) : '…'}
                      </span>
                    )}
                  </>
                ) : (
                  <>Nenhuma operação carregada nesta aba, {me?.name?.split(/\s+/)[0]}. Importe os arquivos para começar.</>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={apath('arquivos')} className="btn-primary">
                <GIngest className="h-4 w-4" /> Importar arquivos
              </Link>
              {o.records > 0 && (
                <Link to={apath('completa')} className="btn-ghost">
                  Análise completa
                </Link>
              )}
            </div>
          </div>
          <div className="relative mb-5 space-y-4 px-5">
            <Pipeline o={o} />
            {o.records > 0 && <Composition o={o} />}
          </div>
          <div className="relative mt-auto grid grid-cols-2 divide-line border-t border-line sm:grid-cols-3 sm:divide-x lg:grid-cols-6 [&>*]:border-line max-sm:[&>*:nth-child(odd)]:border-r">
            <Metric label="Arquivos" value={o.files} sub={`${fmtInt(o.importsDone)} importações`} />
            <Metric label="Registros" value={o.records} sub="processados" tone="text-accent" />
            <Metric label="Alvos" value={o.targets} sub="cadastrados" />
            <Metric label="Células ERB" value={o.cells} sub="cadastro" />
            <Metric label="Alertas" value={o.alertsPending} sub={`de ${fmtInt(o.alerts)} gerados`} tone="text-amber" />
            <Metric label="WhatsApp" value={o.waReports} sub="relatórios Meta" />
          </div>
        </section>

        <section className="card flex flex-col overflow-hidden xl:col-span-4">
          <div className="panel-head">
            Atividade da sessão <span className="ml-auto text-faint normal-case">{recent.length ? `${fmtInt(imports.length)} importações` : ''}</span>
          </div>
          {recent.length ? (
            <ul className="flex-1 divide-y divide-line">
              {recent.map((i) => {
                const f = files.find((x) => x.id === i.file_id)
                return (
                  <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                    <StatusDot ok={i.status === 'done' ? true : i.status === 'failed' ? false : null} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] text-text" title={f?.original_name}>
                        {f?.original_name ?? `Importação ${i.id}`}
                      </div>
                      <div className="font-mono text-[10.5px] text-faint uppercase">
                        {{ cdr: 'bilhetagem', erb_registry: 'cadastro ERB', whatsapp: 'whatsapp', access_log: 'log de acesso' }[i.kind]} ·{' '}
                        {i.status === 'done' ? 'concluída' : i.status}
                      </div>
                    </div>
                    <span className="font-mono text-[12px] text-muted tabular-nums">{fmtInt(i.rows_ok)}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="flex flex-1 flex-col justify-center gap-3 p-5">
              <ol className="space-y-2.5 text-[12.5px]">
                {['Importe bilhetagens, cadastros de ERB ou relatórios da Meta', 'Rode a análise completa e revise os achados', 'Exporte o relatório em PDF, Excel ou CSV'].map(
                  (t, i) => (
                    <li key={t} className="flex items-start gap-3 text-muted">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border border-line bg-petrol font-mono text-[10px] text-accent">{i + 1}</span>
                      {t}
                    </li>
                  ),
                )}
              </ol>
              {files.length === 0 && (
                <div className="mt-2 rounded-[8px] border border-dashed border-line-2 p-3">
                  <div className="flex items-center gap-2 text-[12.5px] font-medium text-text">
                    <FlaskConical className="h-3.5 w-3.5 text-amber" /> Conhecer com dados sintéticos
                  </div>
                  <p className="mt-1 text-[12px] leading-snug text-faint">
                    Três bilhetagens, cadastro de ERB, alertas e duplicidades — gerados no navegador, sem valor investigativo.
                  </p>
                  {demo ? (
                    <div className="mt-2.5">
                      <Progress value={demo.p} />
                      <div className="mt-1 font-mono text-[10.5px] text-faint">{demo.label}</div>
                    </div>
                  ) : (
                    <button className="btn-ghost mt-2.5 h-8 w-full" onClick={runDemo}>
                      Gerar análise de demonstração
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* B — módulos de inteligência por grupo funcional */}
      <div className="grid gap-x-4 gap-y-6 xl:grid-cols-12">
        <Group title="Intelligence Analysis" code="01" className="xl:col-span-7">
          <div className="grid flex-1 gap-3 md:grid-cols-[1.15fr_1fr]">
            <FeatureModule m={m('full')} o={o} accent />
            <div className="card flex flex-col divide-y divide-line overflow-hidden">
              {byGroup('Intelligence Analysis')
                .filter((x) => x.key !== 'full')
                .map((x) => (
                  <RowModule key={x.key} m={x} o={o} />
                ))}
            </div>
          </div>
        </Group>
        <Group title="Data Acquisition" code="02" className="xl:col-span-5">
          <Link to={apath('arquivos')} className="card card-hover group relative flex flex-1 flex-col overflow-hidden border-dashed !border-line-2 p-5 hover:!border-accent/50">
            <div className="flex items-start justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-[9px] border border-accent/30 bg-petrol text-accent [&>svg]:h-[22px] [&>svg]:w-[22px]">
                {m('import').icon}
              </span>
              <StateTag ready label={moduleState('import', o).label} />
            </div>
            <h3 className="mt-4 text-[16.5px] font-semibold text-white">{m('import').title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{m('import').short}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {['CSV', 'TXT', 'XLS', 'XLSX', 'PDF + OCR', 'HTML', 'ZIP', 'JSON', 'XML'].map((x) => (
                <span key={x} className="rounded-[4px] border border-line bg-petrol px-1.5 py-0.5 font-mono text-[10px] text-muted">
                  {x}
                </span>
              ))}
            </div>
            <div className="mt-auto flex items-end justify-between pt-4">
              <div>
                <div className="font-mono text-[26px] leading-none font-medium text-white tabular-nums">{fmtInt(o.files)}</div>
                <div className="mt-1 font-mono text-[10px] tracking-[0.08em] text-faint uppercase">
                  arquivos · {fmtInt(o.importsDone)} processados{o.importsFailed ? ` · ${o.importsFailed} com falha` : ''}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[12.5px] text-muted group-hover:text-accent">
                Abrir <ArrowUpRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>
        </Group>

        <Group title="Communication Intelligence" code="03" className="xl:col-span-5">
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            {byGroup('Communication Intelligence').map((x) => (
              <FeatureModule key={x.key} m={x} o={o} />
            ))}
          </div>
        </Group>
        <Group title="GEOINT / Location Intelligence" code="04" className="xl:col-span-4">
          <div className="flex flex-1 flex-col [&>a]:flex-1">
            <FeatureModule m={m('erb')} o={o} grid />
          </div>
        </Group>
        <div className="flex flex-col gap-6 xl:col-span-3">
          <Group title="Reporting & Monitoring" code="05">
            <div className="card overflow-hidden">
              <RowModule m={m('reports')} o={o} />
            </div>
          </Group>
          <Group title="Security & Privacy" code="06">
            <div className="card overflow-hidden">
              <RowModule m={m('audit')} o={o} />
            </div>
          </Group>
        </div>
      </div>
    </div>
  )
}
