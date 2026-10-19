import { useQuery } from '@tanstack/react-query'
import { FileSpreadsheet, FileText, RefreshCw, Sparkles, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../../app/auth'
import { apath } from '../../app/layout'
import { BarsChart } from '../../components/charts'
import { FilterBar } from '../../components/FilterBar'
import { Findings } from '../../components/Findings'
import { ResultTable } from '../../components/ResultTable'
import { Empty, ErrorBox, Loading, Notice, Num, PageHeader, Stat } from '../../components/ui'
import type { ExportFormat } from '../../engine/exporter'
import { fullAnalysis, fullFindings } from '../../engine/fullAnalysis'
import { generateReport } from '../../engine/report'
import { setState as setSession, useSession } from '../../engine/session'
import { fmtDate, fmtDateTime, fmtDuration, fmtInt, fmtNumber, fmtNumberPlain } from '../../lib/format'
import { useUrlFilter } from '../../lib/useUrlFilter'

const ERB_LABEL: Record<string, string> = { exact: 'exata', probable: 'provável', ambiguous: 'ambígua', none: 'não resolvida', pendente: 'sem cadastro' }

/**
 * Análise completa: importou, está pronto. Executa todas as análises de uma vez
 * (bilhetagem, padrões, vínculos, cruzamento, ERB, WhatsApp e alertas) e mostra os
 * principais achados, com atalho para cada resultado detalhado e relatório único.
 */
export default function FullAnalysis() {
  const { me } = useAuth()
  const [f, setF] = useUrlFilter()
  const hasEvents = useSession((s) => s.imports.some((i) => i.status === 'done' && (i.kind === 'cdr' || i.kind === 'whatsapp')))
  const q = useQuery({ queryKey: ['full-analysis', f], queryFn: () => fullAnalysis(f), enabled: hasEvents })
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const exportAll = async (fmt: ExportFormat) => {
    if (!me) return
    setBusy(fmt)
    setSession({ busy: { label: 'Gerando o relatório completo no navegador', progress: 0 } })
    try {
      const r = await generateReport(f as any, { title: 'Relatório de análise completa', type: 'full' }, fmt, { name: me.name, email: me.email })
      toast.success(`Arquivo entregue: ${r.name}`, { description: `SHA-256: ${r.hash}`, duration: 12000 })
    } catch (e: any) {
      toast.error(`Falha ao gerar: ${e?.message ?? e}`)
    } finally {
      setSession({ busy: null })
      setBusy(null)
    }
  }
  const d = q.data
  const t = d?.summary.totals
  return (
    <div>
      <PageHeader
        icon={<Sparkles className="h-5 w-5" />}
        title="Análise completa"
        subtitle="Carregue as planilhas e pronto: bilhetagem, contatos, padrões de horário, vínculos entre alvos, coincidências, células em comum, cruzamento entre operadoras, ERB, WhatsApp/IPs e alertas são executados de uma só vez. Cada achado leva ao resultado detalhado e aos registros que o sustentam."
        actions={
          hasEvents && (
            <>
              <button className="btn-ghost" onClick={() => q.refetch()} disabled={q.isFetching}>
                <RefreshCw className={`h-4 w-4 ${q.isFetching ? 'animate-spin' : ''}`} /> Recalcular
              </button>
              {me?.can_export && (
                <>
                  <button className="btn-primary" onClick={() => exportAll('pdf')} disabled={!!busy || !d}>
                    <FileText className="h-4 w-4" /> {busy === 'pdf' ? 'Gerando…' : 'Relatório PDF'}
                  </button>
                  <button className="btn-ghost" onClick={() => exportAll('xlsx')} disabled={!!busy || !d}>
                    <FileSpreadsheet className="h-4 w-4" /> {busy === 'xlsx' ? 'Gerando…' : 'Excel'}
                  </button>
                </>
              )}
            </>
          )
        }
      />
      {!hasEvents ? (
        <Empty title="Nenhuma bilhetagem carregada" icon={<Upload className="h-6 w-6" />}>
          <p>Carregue as planilhas de bilhetagem ou o WhatsApp Records; a análise completa roda automaticamente.</p>
          <Link to={apath('arquivos')} className="btn-primary mt-4">
            <Upload className="h-4 w-4" /> Carregar arquivos
          </Link>
        </Empty>
      ) : (
        <>
          <FilterBar value={f} onChange={setF} compact />
          {q.isLoading ? (
            <Loading label="Executando todas as análises no navegador (bilhetagem, vínculos, cruzamentos, ERB, WhatsApp e alertas)…" />
          ) : q.error ? (
            <ErrorBox error={q.error} onRetry={() => q.refetch()} />
          ) : d && t ? (
            <div className="space-y-8">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Registros analisados" value={fmtInt(t.events)} hint={`${fmtInt(d.links.targets.length)} alvos · ${fmtInt(t.active_days)} dias com atividade`} />
                <Stat
                  label="Chamadas / SMS / dados"
                  value={`${fmtInt(t.calls)} / ${fmtInt(t.sms)} / ${fmtInt(t.data_sessions)}`}
                  hint={`duração total ${fmtDuration(t.call_seconds)}${t.whatsapp ? ` · ${fmtInt(t.whatsapp)} de WhatsApp` : ''}`}
                />
                <Stat
                  label="Contatos distintos"
                  value={fmtInt(t.distinct_contacts)}
                  hint={`${fmtInt(t.distinct_cells)} células · ${fmtInt(t.distinct_imeis)} IMEIs · ${fmtInt(t.distinct_ips)} IPs`}
                />
                <Stat
                  label="Alertas para revisão"
                  value={fmtInt(d.alerts.pending)}
                  tone={d.alerts.high ? 'red' : d.alerts.pending ? 'amber' : undefined}
                  hint={t.first_event ? `${fmtDate(t.first_event)} → ${fmtDate(t.last_event)}` : undefined}
                />
              </div>

              <section>
                <h2 className="section-title mb-3">Principais achados</h2>
                <Findings items={fullFindings(d, fmtNumber)} />
              </section>

              <div className="grid gap-4 lg:grid-cols-2">
                <BarsChart title="Atividade por hora do dia" data={hours(d.summary.by_hour)} x="hour" xFmt={(h) => `${h}h`} series={[{ key: 'n', name: 'Eventos' }]} height={200} />
                <BarsChart
                  title="Registros por dia"
                  data={d.summary.by_day}
                  x="day"
                  xFmt={(v) => fmtDate(v).slice(0, 5)}
                  series={[
                    { key: 'calls', name: 'Chamadas' },
                    { key: 'sms', name: 'SMS' },
                    { key: 'data', name: 'Dados' },
                  ]}
                  height={200}
                />
              </div>

              <ResultTable
                title="Contatos mais frequentes"
                subtitle="Ver todos e comparar períodos em Contatos."
                columns={[
                  { key: 'target_number', label: 'Alvo', fmt: (v) => fmtNumberPlain(v), render: (r) => <Num n={r.target_number} /> },
                  { key: 'other_number', label: 'Contato', fmt: (v) => fmtNumberPlain(v), render: (r) => <Num n={r.other_number} /> },
                  { key: 'events', label: 'Eventos', right: true },
                  { key: 'days', label: 'Dias', right: true },
                  { key: 'calls', label: 'Chamadas', right: true },
                  { key: 'sms', label: 'SMS', right: true },
                  { key: 'call_seconds', label: 'Duração', right: true, fmt: (v) => fmtDuration(v) },
                  { key: 'reciprocal', label: 'Recíproco', fmt: (v) => (v ? 'sim' : 'não') },
                  { key: 'last_event', label: 'Último', fmt: (v) => fmtDateTime(v) },
                ]}
                rows={d.contacts.items}
                criteria={d.contacts.criteria}
                pageSize={15}
              />

              <div className="grid gap-4 lg:grid-cols-3">
                <AreaCard title="Vínculos" to="vinculos">
                  <Line label="Conexões recíprocas" v={d.links.reciprocal.length} />
                  <Line label="Contatos em comum" v={d.links.common.shared.length} />
                  <Line label="Contato direto entre alvos" v={d.links.direct.length} />
                  <Line label="Coincidências (mesma célula)" v={`${fmtInt(d.links.coincidences.items.length)} (${fmtInt(d.links.same_cell)})`} />
                  <Line label="Células em comum" v={d.links.shared_cells.length} />
                  <Line label="Cruzamento: exatas / ausentes" v={`${fmtInt(d.links.cross.totals.exata ?? 0)} / ${fmtInt(d.links.cross.totals.ausente ?? 0)}`} />
                </AreaCard>
                <AreaCard title="ERB e localização" to="erb">
                  {d.erb ? (
                    <>
                      {d.erb.resolution.map((r: any) => (
                        <Line key={r.status} label={`Resolução ${ERB_LABEL[r.status] ?? r.status}`} v={r.n} />
                      ))}
                      <Line label="Registros sem célula" v={d.erb.events_without_cell} />
                      <Line label="Células distintas" v={t.distinct_cells} />
                    </>
                  ) : (
                    <p className="text-xs text-faint">Os arquivos não trazem identificação de célula.</p>
                  )}
                </AreaCard>
                <AreaCard title="WhatsApp e IPs" to="whatsapp">
                  {d.wa ? (
                    <>
                      <Line label="Mensagens enviadas / recebidas" v={`${fmtInt(d.wa.totals.sent)} / ${fmtInt(d.wa.totals.received)}`} />
                      <Line label="Chamadas (vídeo)" v={`${fmtInt(d.wa.totals.calls)} (${fmtInt(d.wa.totals.video_calls)})`} />
                      <Line label="Grupos" v={d.wa_groups} />
                      <Line label="IPs / aparelhos" v={`${fmtInt(d.wa.totals.ips)} / ${fmtInt(d.wa.totals.devices)}`} />
                      <Line label="IPs em comum entre alvos" v={d.links.shared_ips.length} />
                    </>
                  ) : (
                    <p className="text-xs text-faint">Nenhum WhatsApp Records carregado. {t.distinct_ips ? `${fmtInt(t.distinct_ips)} IPs vieram das sessões de dados.` : ''}</p>
                  )}
                </AreaCard>
              </div>
              <Notice tone="amber">
                Os achados são pontos para revisão do analista, calculados apenas com os registros carregados. Não constituem, isoladamente, prova de vínculo, de presença física ou
                de participação em fato ilícito.
              </Notice>
              <p className="text-xs text-faint">Calculado em {fmtDateTime(d.ran_at.replace('T', ' ').slice(0, 19))} UTC, nesta aba; nada foi gravado.</p>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

function hours(rows: Record<string, any>[]) {
  const by = new Map(rows.map((r) => [r.hour, r.n]))
  return Array.from({ length: 24 }, (_, h) => ({ hour: h, n: by.get(h) ?? 0 }))
}

function AreaCard({ title, to, children }: { title: string; to: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col p-4">
      <h3 className="mb-3 font-mono text-sm font-bold text-white">{title}</h3>
      <dl className="flex-1 space-y-1.5 text-sm">{children}</dl>
      <Link to={apath(to)} className="mt-4 text-xs text-accent hover:underline">
        Abrir resultado detalhado →
      </Link>
    </section>
  )
}

function Line({ label, v }: { label: string; v: number | string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/50 pb-1">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono text-white tabular-nums">{typeof v === 'number' ? fmtInt(v) : v}</dd>
    </div>
  )
}
