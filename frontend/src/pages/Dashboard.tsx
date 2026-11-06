import { FlaskConical, Lock } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../app/auth'
import { apath } from '../app/layout'
import { MODULES } from '../app/modules'
import { ModuleCard, Progress } from '../components/ui'
import { loadDemo } from '../engine/demo'
import { getState, setState, useSession } from '../engine/session'
import { fmtInt } from '../lib/format'

export default function Dashboard() {
  const { me } = useAuth()
  const navigate = useNavigate()
  const s = useSession((x) => x)
  const [demo, setDemo] = useState<{ label: string; p: number } | null>(null)
  const done = s.imports.filter((i) => i.status === 'done')
  const events = done.filter((i) => i.kind === 'cdr' || i.kind === 'whatsapp').reduce((n, i) => n + i.rows_ok - i.rows_duplicate, 0)
  const cells = done.filter((i) => i.kind === 'erb_registry').reduce((n, i) => n + i.rows_ok, 0)
  const pendingAlerts = s.alerts.filter((a) => a.review_status === 'pendente').length
  const meta: Record<string, string> = {
    cases: s.files.length || s.targets.length ? s.meta.title : 'nenhum dado carregado nesta aba',
    import: `${fmtInt(done.length)} de ${fmtInt(s.files.length)} arquivos processados`,
    full: events ? `${fmtInt(events)} registros prontos para análise` : 'disponível após a importação',
    cdr: `${fmtInt(events)} registros normalizados`,
    erb: `${fmtInt(cells)} células em cadastros técnicos`,
    links: `${fmtInt(s.targets.length)} alvos informados`,
    whatsapp: `${fmtInt(done.filter((i) => i.kind === 'whatsapp').length)} relatórios do WhatsApp carregados`,
    reports: `${fmtInt(pendingAlerts)} alertas aguardando revisão · PDF, Excel e CSV`,
    audit: 'nada é gravado no servidor',
  }
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
  const hasData = s.files.length > 0 || s.targets.length > 0
  return (
    <div>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div className="min-w-0">
          <div className="eyebrow">MARX Intelligence Pro</div>
          <h1 className="mt-1 text-[22px] leading-tight font-semibold text-white">Workspace investigativo</h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            Olá, {me?.name}. Carregue os arquivos, consulte e exporte em Excel ou PDF — ao sair, tudo é apagado.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="chip border-line bg-panel text-muted">
            <span className={hasData ? 'h-1.5 w-1.5 rounded-full bg-ok' : 'h-1.5 w-1.5 rounded-full bg-faint'} />
            {hasData ? `${fmtInt(s.files.length)} arquivo${s.files.length === 1 ? '' : 's'} nesta aba` : 'Nenhum dado carregado'}
          </span>
          {pendingAlerts > 0 && (
            <span className="chip border-amber/30 bg-amber/10 text-amber">
              {fmtInt(pendingAlerts)} alerta{pendingAlerts === 1 ? '' : 's'} para revisar
            </span>
          )}
          <span className="chip border-line bg-panel text-muted" title="Leitura, cálculos e exportação acontecem nesta aba do navegador.">
            <Lock className="h-3 w-3 text-teal" /> Processamento local
          </span>
        </div>
      </header>

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="section-title">Módulos</h2>
        <span className="text-[12px] text-faint">{MODULES.length} módulos</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {MODULES.map((m) => (
          <ModuleCard key={m.key} icon={m.icon} tone={m.tone} title={m.title} description={m.description} to={m.inCase ? apath(m.path) : m.path} meta={meta[m.key]} />
        ))}
      </div>

      {s.files.length === 0 && (
        <div className="card mt-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-panel-2 text-amber">
            <FlaskConical className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-white">Quer conhecer a plataforma antes de usar dados reais?</div>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted">
              Gere uma análise de DEMONSTRAÇÃO com três bilhetagens sintéticas em layouts diferentes, cadastro de ERB com inconsistências propositais, alertas e duplicidades. Tudo
              é gerado no seu navegador e apagado ao sair.
            </p>
            {demo && (
              <div className="mt-3 max-w-md">
                <Progress value={demo.p} />
                <div className="mt-1 text-[12px] text-faint">{demo.label}</div>
              </div>
            )}
          </div>
          {!demo && (
            <button className="btn-ghost shrink-0" onClick={runDemo}>
              Gerar análise de demonstração
            </button>
          )}
        </div>
      )}
    </div>
  )
}
