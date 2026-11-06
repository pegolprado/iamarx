import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Boxes, Clock, EyeOff, FileText, FolderKanban, LayoutGrid, Lock, LogOut, Menu, Network, Settings, Users, Wrench, X } from 'lucide-react'
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { BrandLockup } from '../components/brand'
import { DemoBanner } from '../components/ui'
import { APP_VERSION } from '../engine/normalize'
import { meta as engineMetaFn } from '../engine/analytics'
import { useSession } from '../engine/session'
import { ROLE_LABEL, useAuth } from './auth'
import { LockOverlay, lockScreen, toggleMask, usePrivacy } from './privacy'

function NavItem({ to, icon, children, onClick, end }: { to: string; icon: ReactNode; children: ReactNode; onClick?: () => void; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        clsx(
          'group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-150',
          isActive ? 'bg-panel-2 font-medium text-white' : 'text-muted hover:bg-white/[0.035] hover:text-text',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute top-1.5 bottom-1.5 -left-2 w-[2px] rounded-full bg-accent" aria-hidden="true" />}
          <span className={clsx('[&>svg]:h-4 [&>svg]:w-4', isActive ? 'text-accent' : 'text-faint group-hover:text-muted')}>{icon}</span>
          <span className="truncate">{children}</span>
        </>
      )}
    </NavLink>
  )
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="eyebrow px-2.5 pt-5 pb-1.5">{label}</div>
      {children}
    </div>
  )
}

function UtilButton({ onClick, icon, children, active, title }: { onClick: () => void; icon: ReactNode; children: ReactNode; active?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={clsx(
        'flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-150 hover:bg-white/[0.035] [&>svg]:h-4 [&>svg]:w-4',
        active ? 'text-amber' : 'text-muted hover:text-text',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { me, logout } = useAuth()
  const hasData = useSession((s) => s.files.length > 0 || s.targets.length > 0)
  const { masked } = usePrivacy()
  const initials = (me?.name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
  return (
    <div className="flex h-full flex-col px-3 py-4">
      <Link to="/" onClick={onNavigate} className="mb-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.03]" aria-label="MARX Intelligence Pro — Workspace">
        <BrandLockup />
      </Link>

      <nav className="flex-1" aria-label="Navegação principal">
        <NavGroup label="Workspace">
          <NavItem to="/" end icon={<LayoutGrid />} onClick={onNavigate}>
            Workspace
          </NavItem>
          <NavItem to="/ferramentas" icon={<Wrench />} onClick={onNavigate}>
            Catálogo de ferramentas
          </NavItem>
          <NavItem to="/analise" icon={<FolderKanban />} onClick={onNavigate}>
            Análise atual
          </NavItem>
        </NavGroup>
        <NavGroup label="INVMARX">
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
        </NavGroup>
        {me?.role === 'admin' && (
          <NavGroup label="Administração">
            <NavItem to="/admin/usuarios" icon={<Users />} onClick={onNavigate}>
              Usuários
            </NavItem>
          </NavGroup>
        )}
      </nav>

      <div className="mt-4 space-y-3">
        <div
          className="flex items-start gap-2 rounded-lg border border-line bg-panel/60 px-2.5 py-2"
          title="Arquivos e resultados ficam só na memória desta aba. Ao sair, fechar ou ficar inativo, tudo é apagado."
        >
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" />
          <div className="text-[11.5px] leading-snug">
            <div className="font-medium text-text">Nada é salvo</div>
            <div className="text-faint">Dados só nesta aba; apagados ao sair.</div>
          </div>
        </div>

        <div className="space-y-0.5 border-t border-line pt-3">
          <UtilButton
            onClick={toggleMask}
            active={masked}
            icon={<EyeOff />}
            title="Esconde os dígitos do meio dos telefones na tela (útil ao compartilhar a tela). Exportações não são afetadas."
          >
            {masked ? 'Números ocultos' : 'Ocultar números'}
          </UtilButton>
          <UtilButton onClick={lockScreen} icon={<Lock />} title="Esconde a tela sem apagar a análise; para voltar, digite sua senha.">
            Bloquear tela
          </UtilButton>
          <NavItem to="/configuracoes" icon={<Settings />} onClick={onNavigate}>
            Configurações
          </NavItem>
        </div>

        <div className="flex items-center gap-2.5 rounded-lg border border-line bg-panel/60 p-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-panel-2 text-[11.5px] font-semibold text-muted ring-1 ring-line">{initials}</span>
          <div className="min-w-0 flex-1 text-[12px] leading-tight">
            <div className="truncate font-medium text-text">{me?.name}</div>
            <div className="truncate text-faint">{ROLE_LABEL[me?.role ?? ''] ?? me?.role}</div>
          </div>
        </div>
        <button
          onClick={() => {
            if (!hasData || confirm('Sair apaga todos os arquivos e resultados desta análise. Exporte antes o que precisar. Deseja sair?')) void logout()
          }}
          className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted transition-colors duration-150 hover:bg-danger/[0.08] hover:text-danger"
          title={me?.email}
        >
          <LogOut className="h-4 w-4" /> Sair e apagar
        </button>
        <div className="px-2.5 font-mono text-[10.5px] text-faint">v{APP_VERSION} · processamento local</div>
      </div>
    </div>
  )
}

export function Shell() {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const { locked, masked } = usePrivacy()
  useEffect(() => setOpen(false), [loc.pathname])
  return (
    <>
      <LockOverlay />
      <div className={clsx('flex min-h-screen', locked && 'invisible')} aria-hidden={locked || undefined}>
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 overflow-y-auto border-r border-line bg-ink-2 lg:block">
          <Sidebar />
        </aside>
        {/* celular/tablet: barra superior com menu */}
        <div className="fixed inset-x-0 top-0 z-[900] flex h-14 items-center gap-3 border-b border-line bg-ink-2/95 px-3 backdrop-blur lg:hidden">
          <button className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-panel text-text" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu className="h-[18px] w-[18px]" />
          </button>
          <Link to="/" aria-label="MARX Intelligence Pro — Workspace">
            <BrandLockup compact />
          </Link>
        </div>
        {open && (
          <div className="fixed inset-0 z-[950] bg-[rgba(6,9,14,0.6)] lg:hidden" onClick={() => setOpen(false)}>
            <aside className="relative h-full w-[272px] overflow-y-auto border-r border-line bg-ink-2" onClick={(e) => e.stopPropagation()}>
              <button className="absolute top-4 right-3 rounded-md p-1 text-muted hover:bg-white/5" onClick={() => setOpen(false)} aria-label="Fechar menu">
                <X className="h-4 w-4" />
              </button>
              <Sidebar onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        )}
        <main className="min-w-0 flex-1 px-4 pt-[76px] pb-16 sm:px-6 lg:px-9 lg:pt-7">
          {/* a troca de "ocultar números" redesenha as telas (filtros ficam na URL e os resultados em cache) */}
          <div className="mx-auto max-w-[1320px]" key={masked ? 'oculto' : 'visivel'}>
            <Outlet />
          </div>
        </main>
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

/** Abas da análise agrupadas: cada grupo reúne telas da mesma área (sub-abas). */
const NAV: { label: string; sub: [string, string][]; also?: string[] }[] = [
  { label: 'Visão geral', sub: [['', 'Visão geral']] },
  { label: 'Análise completa', sub: [['completa', 'Análise completa']] },
  { label: 'Localização (ERB)', sub: [['localizacao', 'Localização do alvo']] },
  {
    label: 'Arquivos',
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
    sub: [
      ['eventos', 'Eventos'],
      ['contatos', 'Contatos'],
      ['estatistica', 'Padrões e estatística'],
      ['linha-do-tempo', 'Linha do tempo'],
    ],
  },
  {
    label: 'Vínculos',
    sub: [
      ['vinculos', 'Análise de vínculos'],
      ['comparar', 'Comparação manual'],
      ['cruzamento', 'Cruzamento (ajustes)'],
    ],
  },
  {
    label: 'WhatsApp e IPs',
    sub: [
      ['whatsapp', 'WhatsApp'],
      ['ips', 'Logs de acesso e IPs'],
    ],
  },
  {
    label: 'ERB e mapa',
    sub: [
      ['erb', 'Células e resolução'],
      ['erb/cadastro', 'Cadastro de ERB'],
      ['mapa', 'Mapa'],
    ],
  },
  { label: 'Alertas', sub: [['alertas', 'Alertas']] },
  { label: 'Exportar', sub: [['relatorios', 'Exportar']] },
  { label: 'Assistente', sub: [['assistente', 'Assistente']] },
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

export function CaseLayout() {
  const ctx = useCaseCtx()
  useDataVersionSync()
  const { c } = ctx
  const st = useSession((s) => s.meta)
  const busy = useSession((s) => s.busy)
  const group = navGroup(useLocation().pathname)
  const { me } = useAuth()
  const isDemo = c.is_demo
  return (
    <CaseContext.Provider value={ctx}>
      <DemoBanner show={isDemo} />
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Link to={ANALYSIS} className="text-faint hover:text-text">
          Análise
        </Link>
        <span className="text-faint">/</span>
        <span className="truncate text-text">{st.title}</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-faint">
          <Lock className="h-3 w-3 text-teal" /> somente nesta aba · {me?.can_export ? 'exportação permitida' : 'exportação desativada para seu usuário'}
        </span>
      </div>
      {busy && (
        <div className="card mb-4 flex items-center gap-3 border-accent/40 p-3 text-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          <span className="text-muted">{busy.label}</span>
          {busy.progress > 0 && <span className="ml-auto font-mono text-xs text-faint">{Math.round(busy.progress * 100)}%</span>}
        </div>
      )}
      <nav className="scroll-x -mx-1 mb-3 flex gap-1 border-b border-line pb-px" aria-label="Módulos da análise">
        {NAV.map((g) => (
          <NavLink
            key={g.label}
            end={g.sub[0][0] === ''}
            to={apath(g.sub[0][0])}
            className={() =>
              clsx(
                '-mb-px shrink-0 border-b-2 px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors duration-150',
                g === group ? 'border-accent text-white' : 'border-transparent text-muted hover:text-text',
              )
            }
          >
            {g.label}
          </NavLink>
        ))}
      </nav>
      {group.sub.length > 1 ? (
        <nav className="scroll-x mb-6 flex gap-1" aria-label={`Telas de ${group.label}`}>
          {group.sub.map(([path, label]) => (
            <NavLink
              key={path}
              end={path === 'erb'}
              to={apath(path)}
              className={({ isActive }) =>
                clsx(
                  'shrink-0 rounded-lg px-3 py-1 text-xs whitespace-nowrap transition-colors',
                  isActive ? 'bg-accent/15 text-white' : 'text-muted hover:bg-white/[0.04] hover:text-text',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      ) : (
        <div className="mb-6" />
      )}
      <Outlet />
    </CaseContext.Provider>
  )
}
