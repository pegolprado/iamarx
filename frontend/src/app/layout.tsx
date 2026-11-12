import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Boxes, ChevronRight, Clock, EyeOff, FileText, Lock, LogOut, Menu, Monitor, Moon, Network, Radio, ScanFace, Settings, ShieldCheck, Sun, Users, X } from 'lucide-react'
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { NetworkBackground } from '../components/auth/NetworkBackground'
import { BrandLockup } from '../components/brand'
import { GAlert, GCore, GExport, GFiles, GGraph, GComms, GConsole, GMap, GSignal, GTarget, GTower } from '../components/glyphs'
import { DemoBanner, InModule } from '../components/ui'
import { meta as engineMetaFn } from '../engine/analytics'
import { APP_VERSION } from '../engine/normalize'
import { useSession } from '../engine/session'
import { fmtDate, fmtInt } from '../lib/format'
import { ROLE_LABEL, useAuth } from './auth'
import { LockOverlay, lockScreen, toggleMask, usePrivacy } from './privacy'
import { GlobalProgress } from './progress'
import { setThemePref, type ThemePref, useAppliedTheme, useThemePref } from './theme'
import { greeting, SESSION_ID, StatusDot, SystemStatus, useClock, useOps } from './system'

function NavItem({
  to,
  icon,
  children,
  onClick,
  end,
  count,
  active,
}: {
  to: string
  icon: ReactNode
  children: ReactNode
  onClick?: () => void
  end?: boolean
  count?: ReactNode
  active?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        clsx(
          'group relative flex h-[30px] items-center gap-2.5 rounded-[6px] px-2.5 text-[13px] transition-colors duration-150',
          (active ?? isActive) ? 'bg-[rgba(0,217,245,0.07)] font-medium text-white' : 'text-muted hover:bg-white/[0.03] hover:text-text',
        )
      }
    >
      {({ isActive }) => {
        const on = active ?? isActive
        return (
          <>
            {on && <span className="absolute top-1.5 bottom-1.5 -left-3 w-[2px] rounded-full bg-accent shadow-[0_0_8px_rgba(0,217,245,0.8)]" aria-hidden="true" />}
            <span className={clsx('[&>svg]:h-[15px] [&>svg]:w-[15px]', on ? 'text-accent' : 'text-faint group-hover:text-muted')}>{icon}</span>
            <span className="truncate">{children}</span>
            {count !== undefined && count !== 0 && <span className="ml-auto font-mono text-[10.5px] text-faint tabular-nums">{count}</span>}
          </>
        )
      }}
    </NavLink>
  )
}

function NavSection({ label, children, aria }: { label: ReactNode; children: ReactNode; aria?: string }) {
  return (
    <nav className="space-y-px" aria-label={aria}>
      <div className="eyebrow flex items-center gap-2 px-2.5 pt-5 pb-1.5">{label}</div>
      {children}
    </nav>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { me } = useAuth()
  const ops = useOps()
  const initials = (me?.name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
  return (
    <div className="flex min-h-full flex-col px-3 pt-4 pb-3">
      <Link to="/" onClick={onNavigate} className="rounded-md px-1.5 py-1 transition-colors hover:bg-white/[0.03]" aria-label="MARX Intelligence Pro — Workspace">
        <BrandLockup />
      </Link>
      <div className="mt-1.5 px-1.5 font-mono text-[8.5px] tracking-[0.1em] whitespace-nowrap text-faint">INTELLIGENCE &amp; FORENSIC ANALYTICS</div>

      <div className="mt-4 rounded-md border border-line bg-petrol/60 px-2.5 py-2" title="Identificador desta aba, gerado no navegador. Não é enviado ao servidor.">
        <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.08em]">
          <span className="text-faint">SESSÃO</span>
          <span className="flex items-center gap-1.5 text-accent">
            <StatusDot ok pulse /> {SESSION_ID}
          </span>
        </div>
        <div className="mt-1 truncate text-[12px] text-muted">{ops.hasData ? ops.title : 'Nenhuma operação carregada'}</div>
      </div>

      <div className="flex-1">
        <NavSection label="INVMARX">
          <NavItem to="/invmarx" end icon={<Boxes />} onClick={onNavigate}>
            Ferramentas INVMARX
          </NavItem>
          <NavItem to="/invmarx/whatsapp" icon={<FileText />} onClick={onNavigate}>
            Bilhetagem WhatsApp
          </NavItem>
          <NavItem to="/invmarx/whatsapp-vinculos" icon={<Network />} onClick={onNavigate}>
            WhatsApp — vínculos
          </NavItem>
          <NavItem to="/invmarx/extrato" icon={<Clock />} onClick={onNavigate}>
            Extrato Tempo Real
          </NavItem>
          <NavItem to="/invmarx/mapas-erb" icon={<GMap />} onClick={onNavigate}>
            Mapas ERB
          </NavItem>
        </NavSection>
        <NavSection
          label={
            <Link to="/marxtool" onClick={onNavigate} className="flex-1 hover:text-muted">
              MARXTOOL
            </Link>
          }
        >
          <NavItem to="/marxtool/secret" icon={<ShieldCheck />} onClick={onNavigate}>
            Ocultar arquivo
          </NavItem>
          <NavItem to="/marxtool/compare" icon={<ScanFace />} onClick={onNavigate}>
            MarxCompare
          </NavItem>
          <NavItem to="/marxtool/operadora" icon={<Radio />} onClick={onNavigate}>
            MarxOperadora
          </NavItem>
        </NavSection>
        {me?.role === 'admin' && (
          <NavSection label="Administração">
            <NavItem to="/admin/usuarios" icon={<Users />} onClick={onNavigate}>
              Usuários
            </NavItem>
          </NavSection>
        )}
      </div>

      <div className="mt-5 space-y-1 border-t border-line pt-3">
        <NavItem to="/configuracoes" icon={<Settings />} onClick={onNavigate}>
          Configurações
        </NavItem>
        <div className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5" title={me?.email}>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] border border-line bg-panel-2 font-mono text-[10.5px] font-medium text-accent">{initials}</span>
          <div className="min-w-0 flex-1 text-[12px] leading-tight">
            <div className="truncate font-medium text-text">{me?.name}</div>
            <div className="truncate text-faint">{ROLE_LABEL[me?.role ?? ''] ?? me?.role}</div>
          </div>
        </div>
        <div className="flex items-center justify-between px-1.5 pt-1 font-mono text-[10px] text-faint">
          <span>MARX v{APP_VERSION}</span>
          <span>build local</span>
        </div>
      </div>
    </div>
  )
}

/** Escolha de tema: escuro, claro ou automático (segue o sistema). */
export function ThemeSwitch({ className }: { className?: string }) {
  const pref = useThemePref()
  const opts: [ThemePref, string, ReactNode][] = [
    ['dark', 'Tema escuro', <Moon key="d" className="h-3.5 w-3.5" />],
    ['light', 'Tema claro', <Sun key="l" className="h-3.5 w-3.5" />],
    ['auto', 'Automático (segue o sistema)', <Monitor key="a" className="h-3.5 w-3.5" />],
  ]
  return (
    <div className={clsx('flex h-8 items-center rounded-md border border-line bg-panel/70 p-0.5', className)} role="radiogroup" aria-label="Tema da interface">
      {opts.map(([v, label, icon]) => (
        <button
          key={v}
          role="radio"
          aria-checked={pref === v}
          aria-label={label}
          title={label}
          onClick={() => setThemePref(v)}
          className={clsx(
            'grid h-full w-7 place-items-center rounded-[5px] transition-colors duration-150',
            pref === v ? 'bg-accent/15 text-accent' : 'text-faint hover:text-text',
          )}
        >
          {icon}
        </button>
      ))}
    </div>
  )
}

/** Cabeçalho de controle: saudação, relógio, sessão, ações e indicadores reais da estação. */
function IntelligenceHeader({ onMenu }: { onMenu: () => void }) {
  const { me, logout } = useAuth()
  const { masked } = usePrivacy()
  const ops = useOps()
  const now = useClock()
  const first = (me?.name ?? '').split(/\s+/)[0]
  return (
    <header className="sticky top-0 z-[800] border-b border-line bg-glass backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-panel text-text lg:hidden" onClick={onMenu} aria-label="Abrir menu">
          <Menu className="h-[18px] w-[18px]" />
        </button>
        <Link to="/" className="lg:hidden" aria-label="MARX Intelligence Pro — Workspace">
          <BrandLockup compact />
        </Link>
        <div className="hidden min-w-0 items-baseline gap-3 lg:flex">
          <span className="truncate text-[14px] font-medium text-white">
            {greeting(now)}, {first}
          </span>
          <span className="font-mono text-[11.5px] text-muted tabular-nums">
            {now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })} ·{' '}
            <span className="text-text">{now.toLocaleTimeString('pt-BR')}</span>
          </span>
          <span className="hidden font-mono text-[11px] text-faint 2xl:inline">
            SESSÃO <span className="text-accent">{SESSION_ID}</span>
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeSwitch className="max-sm:hidden" />
          <button
            onClick={toggleMask}
            aria-pressed={masked}
            title="Esconde os dígitos do meio dos telefones na tela (útil ao compartilhar a tela). Exportações não são afetadas."
            className={clsx(
              'btn h-8 border px-2.5 text-[12.5px]',
              masked ? 'border-amber/50 bg-amber/10 text-amber' : 'border-line bg-panel/70 text-muted hover:border-line-2 hover:text-text',
            )}
          >
            <EyeOff className="h-3.5 w-3.5" />
            <span className="max-xl:sr-only">{masked ? 'Números ocultos' : 'Ocultar números'}</span>
          </button>
          <button
            onClick={lockScreen}
            title="Esconde a tela sem apagar a análise; para voltar, digite sua senha."
            className="btn h-8 border border-line bg-panel/70 px-2.5 text-[12.5px] text-muted hover:border-line-2 hover:text-text"
          >
            <Lock className="h-3.5 w-3.5" />
            <span className="max-xl:sr-only">Bloquear tela</span>
          </button>
          <button
            onClick={() => {
              if (!ops.hasData || confirm('Sair apaga todos os arquivos e resultados desta análise. Exporte antes o que precisar. Deseja sair?')) void logout()
            }}
            title="Encerra a sessão e apaga da memória todos os arquivos e resultados desta aba."
            className="btn h-8 border border-danger/35 bg-danger/[0.06] px-2.5 text-[12.5px] text-danger hover:border-danger/70 hover:bg-danger/[0.12]"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="max-sm:sr-only">Sair e apagar</span>
          </button>
        </div>
      </div>
      <div className="scroll-x flex h-8 items-center gap-6 border-t border-line/70 bg-petrol/35 px-4 sm:px-6 lg:px-8">
        <SystemStatus className="!flex-nowrap" />
        <span className="ml-auto hidden shrink-0 items-center gap-1.5 text-[11.5px] text-faint min-[1600px]:flex">
          <ShieldCheck className="h-3.5 w-3.5 text-ok" /> Dados só nesta aba · apagados ao sair
        </span>
      </div>
    </header>
  )
}

export function Shell() {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const { locked, masked } = usePrivacy()
  const theme = useAppliedTheme()
  useEffect(() => setOpen(false), [loc.pathname])
  return (
    <>
      <LockOverlay />
      <GlobalProgress />
      <div className="ops-bg" aria-hidden="true">
        <NetworkBackground variant={theme === 'light' ? 'opsLight' : 'ops'} />
      </div>
      <div className={clsx('relative z-[1] flex min-h-screen', locked && 'invisible')} aria-hidden={locked || undefined}>
        <aside className="sticky top-0 hidden h-screen w-[256px] shrink-0 overflow-y-auto border-r border-line bg-glass lg:block">
          <Sidebar />
        </aside>
        {open && (
          <div className="fixed inset-0 z-[950] bg-[rgba(3,6,9,0.7)] backdrop-blur-[2px] lg:hidden" onClick={() => setOpen(false)}>
            <aside className="view-in relative h-full w-[280px] overflow-y-auto border-r border-line bg-ink-2" onClick={(e) => e.stopPropagation()}>
              <button className="absolute top-4 right-3 z-10 rounded-md p-1 text-muted hover:bg-white/5" onClick={() => setOpen(false)} aria-label="Fechar menu">
                <X className="h-4 w-4" />
              </button>
              <Sidebar onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <IntelligenceHeader onMenu={() => setOpen(true)} />
          <main className="min-w-0 flex-1 px-4 pt-6 pb-16 sm:px-6 lg:px-8">
            {/* a troca de "ocultar números" redesenha as telas (filtros ficam na URL e os resultados em cache) */}
            <div className="view-in mx-auto max-w-[1680px]" key={(masked ? 'oculto' : 'visivel') + loc.pathname.split('/').slice(0, 2).join('/')}>
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ análise (sessão em memória)

export type CaseData = {
  id: number
  title: string
  is_demo: boolean
  can_export: boolean
  period_start: string | null
  period_end: string | null
  [k: string]: any
}

type CaseCtx = {
  c: CaseData
  canWrite: boolean
  canReview: boolean
  meta?: any
}
const CaseContext = createContext<CaseCtx | null>(null)

/** Contexto da análise aberta (única por aba; existe só na memória). */
export function useCase() {
  const v = useContext(CaseContext)
  if (!v) throw new Error('useCase fora da análise')
  return v
}

export const ANALYSIS = '/analise'
export const apath = (p = '') => (p ? `${ANALYSIS}/${p.replace(/^\//, '')}` : ANALYSIS)

/** Módulos da análise agrupados: cada módulo reúne telas da mesma área (sub-abas). */
type NavGroup = { label: string; icon: ReactNode; desc: string; sub: [string, string][]; also?: string[] }
const NAV: NavGroup[] = [
  { label: 'Visão geral', icon: <GTarget />, desc: 'Identificação da operação, fluxo de trabalho e indicadores consolidados.', sub: [['', 'Visão geral']] },
  { label: 'Análise completa', icon: <GCore />, desc: 'Consolidação de todas as análises: achados, vínculos, padrões e relatório único.', sub: [['completa', 'Análise completa']] },
  { label: 'Localização (ERB)', icon: <GTower />, desc: 'ERBs no mapa, eventos no tempo, deslocamentos e áreas de permanência.', sub: [['localizacao', 'Localização do alvo']] },
  {
    label: 'Arquivos',
    icon: <GFiles />,
    desc: 'Aquisição de dados: arquivos, alvos, importações e qualidade da leitura.',
    sub: [
      ['arquivos', 'Arquivos'],
      ['alvos', 'Alvos'],
      ['importacoes', 'Importações'],
      ['qualidade', 'Qualidade'],
    ],
    also: ['importar'],
  },
  {
    label: 'Bilhetagem',
    icon: <GSignal />,
    desc: 'Registros de chamadas, SMS e dados: frequência, concentração horária e linha do tempo.',
    sub: [
      ['eventos', 'Eventos'],
      ['contatos', 'Contatos'],
      ['estatistica', 'Padrões e estatística'],
      ['linha-do-tempo', 'Linha do tempo'],
    ],
  },
  {
    label: 'Vínculos',
    icon: <GGraph />,
    desc: 'Relações documentadas entre números: rede, reciprocidade e coincidências.',
    sub: [
      ['vinculos', 'Análise de vínculos'],
      ['comparar', 'Comparação manual'],
      ['cruzamento', 'Cruzamento (ajustes)'],
    ],
  },
  {
    label: 'WhatsApp e IPs',
    icon: <GComms />,
    desc: 'Registros da Meta, contatos, grupos e logs de acesso com correlação de IPs.',
    sub: [
      ['whatsapp', 'WhatsApp'],
      ['ips', 'Logs de acesso e IPs'],
    ],
  },
  {
    label: 'ERB e mapa',
    icon: <GMap />,
    desc: 'Cadastro técnico de células, resolução de ERBs e mapa de cobertura.',
    sub: [
      ['erb', 'Células e resolução'],
      ['erb/cadastro', 'Cadastro de ERB'],
      ['mapa', 'Mapa'],
    ],
  },
  { label: 'Alertas', icon: <GAlert />, desc: 'Ocorrências automáticas para revisão do analista, com registros de suporte.', sub: [['alertas', 'Alertas']] },
  { label: 'Exportar', icon: <GExport />, desc: 'Relatórios técnicos em PDF, Excel e CSV com critérios e hashes.', sub: [['relatorios', 'Exportar']] },
  { label: 'Assistente', icon: <GConsole />, desc: 'Perguntas em linguagem natural sobre os dados carregados.', sub: [['assistente', 'Assistente']] },
]

/** Grupo da aba atual, a partir do caminho dentro da análise. */
function navGroup(pathname: string) {
  const rest = pathname.startsWith(ANALYSIS) ? pathname.slice(ANALYSIS.length).replace(/^\//, '') : ''
  const seg = rest.split('/')[0]
  return NAV.find((g) => g.sub.some(([p]) => p.split('/')[0] === seg) || g.also?.includes(seg)) ?? NAV[0]
}

/** Invalida as consultas sempre que os dados da sessão mudam (importação, remoção, resolução). */
function useDataVersionSync() {
  const qc = useQueryClient()
  const version = useSession((s) => s.version)
  useEffect(() => {
    qc.invalidateQueries({
      predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'settings',
    })
  }, [version, qc])
}

/** Monta o contexto da análise aberta (sessão em memória). */
function useCaseCtx(): CaseCtx {
  const { me } = useAuth()
  const st = useSession((s) => s.meta)
  const isDemo = useSession((s) => s.isDemo)
  const targets = useSession((s) => s.targets)
  const files = useSession((s) => s.files)
  const version = useSession((s) => s.version)
  const engineMeta = useQuery({
    queryKey: ['meta', version],
    queryFn: () => engineMetaFn(),
  })
  const meta = useMemo(
    () => ({
      targets: targets.map((t) => ({
        number: t.number_normalized,
        label: t.label || t.internal_id,
      })),
      files: files.filter((f) => f.kind === 'cdr').map((f) => ({ id: f.id, name: f.original_name })),
      operators: engineMeta.data?.operators ?? [],
      span: engineMeta.data?.span ?? [],
    }),
    [targets, files, engineMeta.data],
  )
  const c: CaseData = {
    ...st,
    id: 0,
    is_demo: isDemo,
    can_export: !!me?.can_export,
  }
  return { c, canWrite: true, canReview: true, meta }
}

/** Contexto da análise sem a moldura de navegação (usado pelas ferramentas da INVMARX). */
export function CaseScope({ children }: { children: ReactNode }) {
  useDataVersionSync()
  return <CaseContext.Provider value={useCaseCtx()}>{children}</CaseContext.Provider>
}

/** Painel lateral com o estado real da operação (telas muito largas). */
function SessionPanel() {
  const ops = useOps()
  const imports = useSession((s) => s.imports)
  const files = useSession((s) => s.files)
  const recent = [...imports].reverse().slice(0, 5)
  const row = (k: string, v: ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-[12px] text-muted">{k}</dt>
      <dd className="font-mono text-[12px] text-text tabular-nums">{v}</dd>
    </div>
  )
  return (
    <aside className="sticky top-[112px] hidden w-[272px] shrink-0 space-y-3 self-start min-[1720px]:block" aria-label="Painel da operação">
      <section className="card overflow-hidden">
        <div className="panel-head">Operação</div>
        <div className="p-4">
          <div className="text-[13px] leading-snug font-medium text-white">{ops.title}</div>
          <dl className="mt-3 divide-y divide-line">
            {row('Período', ops.period[0] ? `${fmtDate(ops.period[0])} → ${ops.period[1] ? fmtDate(ops.period[1]) : '…'}` : '—')}
            {row('Arquivos', fmtInt(ops.files))}
            {row('Registros', fmtInt(ops.records))}
            {row('Alvos', fmtInt(ops.targets))}
            {row('Células ERB', fmtInt(ops.cells))}
            {row('Alertas pendentes', <span className={ops.alertsPending ? 'text-amber' : ''}>{fmtInt(ops.alertsPending)}</span>)}
          </dl>
        </div>
      </section>
      <section className="card overflow-hidden">
        <div className="panel-head">Histórico da sessão</div>
        {recent.length ? (
          <ul className="divide-y divide-line">
            {recent.map((i) => {
              const f = files.find((x) => x.id === i.file_id)
              return (
                <li key={i.id} className="px-4 py-2.5">
                  <div className="truncate text-[12px] text-text" title={f?.original_name}>
                    {f?.original_name ?? `Importação ${i.id}`}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 font-mono text-[10.5px] text-faint">
                    <StatusDot ok={i.status === 'done' ? true : i.status === 'failed' ? false : null} />
                    {i.status === 'done' ? `${fmtInt(i.rows_ok)} registros` : i.status}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="px-4 py-4 text-[12px] text-faint">Nenhuma importação nesta aba.</p>
        )}
      </section>
      <p className="flex items-start gap-2 px-1 text-[11.5px] leading-snug text-faint">
        <Lock className="mt-0.5 h-3 w-3 shrink-0 text-ok" /> Processado só neste navegador. Sair, fechar a aba ou ficar inativo apaga tudo.
      </p>
    </aside>
  )
}

export function CaseLayout() {
  const ctx = useCaseCtx()
  useDataVersionSync()
  const { c } = ctx
  const loc = useLocation()
  const group = navGroup(loc.pathname)
  const { me } = useAuth()
  const ops = useOps()
  const rest = loc.pathname.slice(ANALYSIS.length).replace(/^\//, '')
  const sub = group.sub.find(([p]) => p === rest) ?? group.sub.find(([p]) => p && rest.startsWith(p))
  return (
    <CaseContext.Provider value={ctx}>
      <DemoBanner show={c.is_demo} />
      {/* cabeçalho do módulo: trilha, identificação, descrição e estado da operação */}
      <div className="mb-5">
        <nav className="mb-3 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-faint" aria-label="Trilha de navegação">
          <Link to="/" className="hover:text-text">
            WORKSPACE
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link to={ANALYSIS} className="hover:text-text">
            ANÁLISE ATUAL
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-muted uppercase">{group.label}</span>
          {sub && group.sub.length > 1 && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-accent uppercase">{sub[1]}</span>
            </>
          )}
        </nav>
        <nav className="scroll-x mb-4 flex gap-1 border-b border-line" aria-label="Módulos da análise">
          {NAV.map((g) => (
            <Link
              key={g.label}
              to={apath(g.sub[0][0])}
              className={clsx(
                '-mb-px shrink-0 border-b-2 px-3 py-2 text-[13px] whitespace-nowrap transition-colors duration-150',
                group === g ? 'border-accent text-white' : 'border-transparent text-muted hover:text-text',
              )}
            >
              {g.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-[9px] border border-accent/35 icon-well text-accent shadow-[0_0_24px_-8px_rgba(0,217,245,0.6)] [&>svg]:h-[22px] [&>svg]:w-[22px]">
              {group.icon}
            </span>
            <div className="min-w-0">
              <div className="text-[19px] leading-tight font-semibold text-white">{group.label}</div>
              <div className="mt-0.5 truncate text-[12.5px] text-muted">{group.desc}</div>
            </div>
          </div>
          <dl className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px]">
            {(
              [
                ['REGISTROS', fmtInt(ops.records)],
                ['ALVOS', fmtInt(ops.targets)],
                ['ARQUIVOS', fmtInt(ops.files)],
                ['EXPORTAÇÃO', me?.can_export ? 'PERMITIDA' : 'DESATIVADA'],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-1.5">
                <dt className="text-faint">{k}</dt>
                <dd className="text-text tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        {group.sub.length > 1 && (
          <nav className="scroll-x mt-4 flex gap-1 border-b border-line" aria-label={`Telas de ${group.label}`}>
            {group.sub.map(([path, label]) => (
              <NavLink
                key={path}
                end={path === 'erb'}
                to={apath(path)}
                className={({ isActive }) =>
                  clsx(
                    '-mb-px shrink-0 border-b-2 px-3 py-2 text-[13px] whitespace-nowrap transition-colors duration-150',
                    isActive ? 'border-accent text-white' : 'border-transparent text-muted hover:text-text',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
      <div className="flex items-start gap-6">
        <div className="view-in min-w-0 flex-1" key={loc.pathname}>
          <InModule.Provider value>
            <Outlet />
          </InModule.Provider>
        </div>
        <SessionPanel />
      </div>
    </CaseContext.Provider>
  )
}
