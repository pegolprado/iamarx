import { useQuery } from '@tanstack/react-query'
import cytoscape, { type Core } from 'cytoscape'
import { Download, GitCompare, GitMerge, Network, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apath, useCase } from '../../app/layout'
import { ExportButtons } from '../../components/Export'
import { type EventFilter, FilterBar } from '../../components/FilterBar'
import { Findings } from '../../components/Findings'
import { type ResultColumn, ResultTable } from '../../components/ResultTable'
import { Badge, Criteria, DrillLink, ErrorBox, Field, Loading, Notice, Num, PageHeader, Tabs } from '../../components/ui'
import { linkGraph } from '../../engine/analytics'
import { type LinkResult, linkAnalysis, linkFindings, MAX_COMPARED } from '../../engine/fullAnalysis'
import { EVENT_TYPE_LABEL, fmtDateTime, fmtDuration, fmtInt, fmtNumber, fmtNumberPlain } from '../../lib/format'
import { useUrlFilter } from '../../lib/useUrlFilter'

const num = (key: string, label: string): ResultColumn => ({ key, label, fmt: (v) => fmtNumberPlain(v), render: (r) => <Num n={r[key]} /> })
const date = (key: string, label: string): ResultColumn => ({
  key,
  label,
  fmt: (v) => fmtDateTime(v),
  render: (r) => <span className="text-xs whitespace-nowrap">{fmtDateTime(r[key])}</span>,
})
const int = (key: string, label: string): ResultColumn => ({ key, label, right: true, render: (r) => fmtInt(r[key]) })
const nums = (key: string, label: string): ResultColumn => ({
  key,
  label,
  fmt: (v) => (v ?? []).map((x: string) => fmtNumberPlain(x)).join(', '),
  render: (r) => <span className="text-xs">{(r[key] ?? []).map((x: string) => fmtNumber(x)).join(', ')}</span>,
})

type Tab = 'reciprocas' | 'comum' | 'diretos' | 'coincidencias' | 'celulas' | 'atividade' | 'cruzamento' | 'ips' | 'conexoes'

/**
 * Análise de vínculos unificada: com um único carregamento roda grafo, reciprocidade,
 * contatos em comum, contatos diretos entre alvos, coincidências, células compartilhadas,
 * comparação de atividade, cruzamento multifonte e IPs/grupos em comum.
 */
export default function Links() {
  const [f, setF] = useUrlFilter()
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('aba') as Tab) || 'reciprocas'
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(sp)
    next.set('aba', t)
    setSp(next, { replace: true })
  }
  const [windowS, setWindowS] = useState(300)
  const q = useQuery({ queryKey: ['link-analysis', f, windowS], queryFn: () => linkAnalysis(f, { windowS }) })
  const d = q.data
  return (
    <div>
      <PageHeader
        icon={<Network className="h-5 w-5" />}
        title="Análise de vínculos"
        subtitle="Tudo de uma vez a partir dos arquivos carregados: rede de contatos, reciprocidade, contatos em comum, contatos diretos entre alvos, coincidências de horário e de célula, comparação de atividade, cruzamento entre operadoras e IPs/grupos em comum."
        actions={
          <>
            <Link to={apath('comparar')} className="btn-ghost text-xs" title="Escolher números e janelas manualmente">
              <GitCompare className="h-4 w-4" /> Comparação manual
            </Link>
            <Link to={apath('cruzamento')} className="btn-ghost text-xs" title="Ajustar tolerâncias do cruzamento multifonte">
              <GitMerge className="h-4 w-4" /> Ajustar cruzamento
            </Link>
          </>
        }
      />
      <FilterBar value={f} onChange={setF} compact />
      <div className="card mb-4 flex flex-wrap items-end gap-4 p-4">
        <Field label="Janela de coincidência" hint="eventos de alvos diferentes dentro deste intervalo">
          <select value={windowS} onChange={(e) => setWindowS(+e.target.value)}>
            {[60, 120, 300, 600, 1800, 3600].map((s) => (
              <option key={s} value={s}>
                {s < 3600 ? `${s / 60} min` : '1 hora'}
              </option>
            ))}
          </select>
        </Field>
        {d && (
          <div className="flex flex-wrap gap-2 pb-2 text-xs">
            <Badge tone="blue">{d.targets.length} alvos com dados</Badge>
            {d.compared.length < d.targets.length && <Badge tone="amber">comparação entre os {MAX_COMPARED} mais ativos</Badge>}
            <Badge>{fmtInt(d.graph.nodes.length)} números</Badge>
            <Badge>{fmtInt(d.graph.edges.length)} conexões</Badge>
          </div>
        )}
        <button className="btn-ghost ml-auto" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-4 w-4 ${q.isFetching ? 'animate-spin' : ''}`} /> Recalcular
        </button>
      </div>
      {q.isLoading ? (
        <Loading label="Executando todas as análises de vínculos no navegador…" />
      ) : q.error ? (
        <ErrorBox error={q.error} onRetry={() => q.refetch()} />
      ) : d ? (
        <div className="space-y-8">
          <section>
            <h2 className="section-title mb-3">Principais achados</h2>
            <Findings items={linkFindings(d, fmtNumber)} empty="Nenhuma ligação entre alvos encontrada. Carregue a bilhetagem de dois ou mais alvos para cruzar." />
          </section>
          <GraphPanel f={f} />
          <section>
            <h2 className="section-title mb-3">Resultados detalhados</h2>
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { value: 'reciprocas', label: `Recíprocas (${d.reciprocal.length})` },
                { value: 'comum', label: `Contatos em comum (${d.common.shared.length})` },
                { value: 'diretos', label: `Contato direto entre alvos (${d.direct.length})` },
                { value: 'coincidencias', label: `Coincidências (${d.coincidences.items.length}${d.coincidences.truncated ? '+' : ''})` },
                { value: 'celulas', label: `Células em comum (${d.shared_cells.length})` },
                { value: 'atividade', label: `Atividade dos alvos (${d.per_number.length})` },
                { value: 'cruzamento', label: `Cruzamento multifonte (${d.cross.total})` },
                { value: 'ips', label: `IPs e grupos em comum (${d.shared_ips.length + d.shared_group_members.length})` },
                { value: 'conexoes', label: `Todas as conexões (${d.graph.edges.length})` },
              ]}
            />
            <Section tab={tab} d={d} f={f} />
          </section>
          <Notice tone="amber">
            Conexões, contatos em comum e coincidências representam registros documentados de comunicação; não provam vínculo pessoal, presença física conjunta ou participação em
            fato ilícito.
          </Notice>
        </div>
      ) : null}
    </div>
  )
}

const EDGE_COLS: ResultColumn[] = [
  num('n1', 'Número 1'),
  num('n2', 'Número 2'),
  int('events', 'Eventos'),
  int('days', 'Dias'),
  int('n1_to_n2', '1 → 2'),
  int('n2_to_n1', '2 → 1'),
  { key: 'call_seconds', label: 'Duração (voz)', right: true, fmt: (v) => v, render: (r) => fmtDuration(r.call_seconds) },
  date('first_event', 'Primeiro'),
  date('last_event', 'Último'),
]

const MATCH_LABEL: Record<string, string> = { exata: 'exata', provavel: 'provável', ambigua: 'ambígua', ausente: 'ausente' }
const MATCH_TONE: Record<string, any> = { exata: 'green', provavel: 'teal', ambigua: 'amber', ausente: 'red' }

function Section({ tab, d, f }: { tab: Tab; d: LinkResult; f: EventFilter }) {
  const targets = d.compared
  if (tab === 'reciprocas')
    return (
      <ResultTable
        title="Conexões recíprocas"
        subtitle="Pares com comunicação nos dois sentidos, da mais à menos intensa."
        columns={[
          ...EDGE_COLS,
          { key: 'open', label: '', fmt: () => null, render: (r) => <DrillLink filter={{ ...f, targets: [r.n1, r.n2], others: [r.n1, r.n2] }}>registros</DrillLink> },
        ]}
        rows={d.reciprocal}
        criteria={d.graph.criteria}
      />
    )
  if (tab === 'comum')
    return (
      <ResultTable
        title="Contatos em comum entre alvos"
        subtitle="Interlocutores que aparecem na bilhetagem de dois ou mais alvos."
        columns={[
          num('contact', 'Contato'),
          int('numbers', 'Alvos'),
          int('total', 'Eventos'),
          ...targets.map(
            (t): ResultColumn => ({
              key: `t_${t}`,
              label: fmtNumberPlain(t),
              right: true,
              fmt: (_v, r) => r.per_number[t]?.n ?? 0,
              render: (r) => (r.per_number[t] ? <span title={`${r.per_number[t].days} dias`}>{fmtInt(r.per_number[t].n)}</span> : <span className="text-faint">—</span>),
            }),
          ),
          { key: 'open', label: '', fmt: () => null, render: (r) => <DrillLink filter={{ ...f, numbers: [r.contact] }}>registros</DrillLink> },
        ]}
        rows={d.common.shared}
        criteria={d.common.criteria}
        empty={targets.length < 2 ? 'É preciso ter a bilhetagem de pelo menos dois alvos.' : undefined}
      />
    )
  if (tab === 'diretos')
    return (
      <ResultTable
        title="Contato direto entre alvos"
        subtitle="Registros em que um alvo aparece falando diretamente com outro alvo."
        columns={[
          num('a_number', 'Origem'),
          num('b_number', 'Destino'),
          int('n', 'Registros'),
          date('first_event', 'Primeiro'),
          date('last_event', 'Último'),
          {
            key: 'open',
            label: '',
            fmt: () => null,
            render: (r) => <DrillLink filter={{ ...f, targets: [r.a_number, r.b_number], others: [r.a_number, r.b_number] }}>registros</DrillLink>,
          },
        ]}
        rows={d.direct}
        criteria={d.criteria}
        empty={targets.length < 2 ? 'É preciso ter a bilhetagem de pelo menos dois alvos.' : undefined}
      />
    )
  if (tab === 'coincidencias')
    return (
      <ResultTable
        title="Coincidências temporais"
        subtitle={`Eventos de alvos diferentes dentro da janela; ${d.same_cell} na mesma célula.`}
        columns={[
          num('number1', 'Alvo 1'),
          date('ts1', 'Horário 1'),
          { key: 'type1', label: 'Tipo 1', fmt: (v) => EVENT_TYPE_LABEL[v] ?? v },
          num('number2', 'Alvo 2'),
          date('ts2', 'Horário 2'),
          { key: 'type2', label: 'Tipo 2', fmt: (v) => EVENT_TYPE_LABEL[v] ?? v },
          int('delta_s', 'Diferença (s)'),
          { key: 'same_cell', label: 'Mesma célula', fmt: (v) => (v ? 'sim' : 'não'), render: (r) => (r.same_cell ? <Badge tone="amber">sim</Badge> : 'não') },
          { key: 'distance_m', label: 'Distância entre estações (m)', right: true, fmt: (v) => v ?? '', render: (r) => r.distance_m ?? '—' },
          { key: 'tz_mixed', label: 'Fuso', fmt: (v) => (v ? 'verificar' : 'confirmado'), render: (r) => (r.tz_mixed ? <Badge tone="amber">verificar</Badge> : 'confirmado') },
        ]}
        rows={d.coincidences.items}
        criteria={d.coincidences.criteria}
        empty={targets.length < 2 ? 'É preciso ter a bilhetagem de pelo menos dois alvos.' : undefined}
      />
    )
  if (tab === 'celulas')
    return (
      <ResultTable
        title="Células usadas por mais de um alvo"
        subtitle="A ERB registrada não comprova a posição exata do aparelho."
        columns={[
          { key: 'cell_key', label: 'Célula', render: (r) => <span className="font-mono text-xs">{r.cell_key}</span> },
          { key: 'site_name', label: 'Estação', fmt: (v) => v ?? '' },
          int('numbers', 'Alvos'),
          int('events', 'Eventos'),
          {
            key: 'per_number',
            label: 'Por alvo',
            fmt: (v) =>
              Object.entries(v ?? {})
                .map(([k, n]) => `${fmtNumberPlain(k)}: ${n}`)
                .join('; '),
            render: (r) => (
              <span className="text-xs">
                {Object.entries(r.per_number ?? {})
                  .map(([k, n]) => `${fmtNumber(k)}: ${n}`)
                  .join(' · ')}
              </span>
            ),
          },
          { key: 'open', label: '', fmt: () => null, render: (r) => <DrillLink filter={{ ...f, cell_keys: [r.cell_key] }}>registros</DrillLink> },
        ]}
        rows={d.shared_cells}
        criteria={d.criteria}
        empty={targets.length < 2 ? 'É preciso ter a bilhetagem de pelo menos dois alvos.' : undefined}
      />
    )
  if (tab === 'atividade')
    return (
      <ResultTable
        title="Comparação de atividade dos alvos"
        columns={[
          num('number', 'Alvo'),
          { key: 'events', label: 'Eventos', right: true, fmt: (_v, r) => r.totals.events, render: (r) => fmtInt(r.totals.events) },
          { key: 'calls', label: 'Chamadas', right: true, fmt: (_v, r) => r.totals.calls, render: (r) => fmtInt(r.totals.calls) },
          { key: 'sms', label: 'SMS', right: true, fmt: (_v, r) => r.totals.sms, render: (r) => fmtInt(r.totals.sms) },
          { key: 'dur', label: 'Duração', right: true, fmt: (_v, r) => fmtDuration(r.totals.call_seconds), render: (r) => fmtDuration(r.totals.call_seconds) },
          { key: 'days', label: 'Dias ativos', right: true, fmt: (_v, r) => r.totals.active_days, render: (r) => fmtInt(r.totals.active_days) },
          { key: 'contacts', label: 'Contatos', right: true, fmt: (_v, r) => r.totals.distinct_contacts, render: (r) => fmtInt(r.totals.distinct_contacts) },
          { key: 'cells', label: 'Células', right: true, fmt: (_v, r) => r.totals.distinct_cells, render: (r) => fmtInt(r.totals.distinct_cells) },
          { key: 'peak', label: 'Hora de pico', fmt: (_v, r) => peakHour(r), render: (r) => peakHour(r) },
          {
            key: 'period',
            label: 'Período',
            fmt: (_v, r) => `${fmtDateTime(r.totals.first_event, false)} → ${fmtDateTime(r.totals.last_event, false)}`,
            render: (r) => (
              <span className="text-xs">
                {fmtDateTime(r.totals.first_event, false)} → {fmtDateTime(r.totals.last_event, false)}
              </span>
            ),
          },
        ]}
        rows={d.per_number}
        criteria={d.criteria}
        empty={targets.length < 2 ? 'É preciso ter a bilhetagem de pelo menos dois alvos.' : undefined}
      />
    )
  if (tab === 'cruzamento')
    return (
      <ResultTable
        title="Cruzamento multifonte"
        subtitle="Cada chamada/SMS entre dois alvos procurada no arquivo do outro alvo (outra operadora ou outro arquivo)."
        intro={
          <div className="mb-3 flex flex-wrap gap-2">
            {Object.entries(MATCH_LABEL).map(([k, l]) => (
              <Badge key={k} tone={MATCH_TONE[k]}>
                {l}: {fmtInt(d.cross.totals[k] ?? 0)}
              </Badge>
            ))}
          </div>
        }
        columns={[
          date('ts_local', 'Horário'),
          num('target_number', 'Alvo'),
          num('other_number', 'Interlocutor'),
          { key: 'event_type', label: 'Tipo', fmt: (v) => EVENT_TYPE_LABEL[v] ?? v },
          { key: 'duration_s', label: 'Duração (s)', right: true, fmt: (v) => v ?? '' },
          {
            key: 'match_class',
            label: 'Correspondência',
            fmt: (v) => MATCH_LABEL[v] ?? v,
            render: (r) => <Badge tone={MATCH_TONE[r.match_class]}>{MATCH_LABEL[r.match_class]}</Badge>,
          },
          { key: 'best_delta', label: 'Diferença (s)', right: true, fmt: (v) => v ?? '' },
        ]}
        rows={d.cross.items}
        criteria={d.cross.criteria}
        empty="Sem chamadas ou SMS entre dois alvos que tenham bilhetagem carregada."
      />
    )
  if (tab === 'ips')
    return (
      <div className="space-y-4">
        <ResultTable
          title="IPs usados por mais de um alvo"
          subtitle="WhatsApp e sessões de dados. Um IPv4 de operadora móvel pode ser compartilhado (CGNAT): compare datas e portas."
          columns={[
            { key: 'ip', label: 'IP', render: (r) => <span className="font-mono text-xs">{r.ip}</span> },
            num('target_number', 'Alvo'),
            int('n', 'Registros'),
            date('first_event', 'Primeiro'),
            date('last_event', 'Último'),
            { key: 'ports', label: 'Portas', fmt: (v) => (v ?? []).join(', ') },
          ]}
          rows={d.shared_ips.flatMap((x: any) => x.per_target)}
        />
        <ResultTable
          title="Participantes em grupos de WhatsApp de mais de um alvo"
          columns={[
            num('member', 'Participante'),
            nums('targets', 'Alvos'),
            { key: 'open', label: '', fmt: () => null, render: (r) => <DrillLink filter={{ ...f, numbers: [r.member] }}>registros</DrillLink> },
          ]}
          rows={d.shared_group_members}
          empty="Nenhum participante em comum (requer WhatsApp Records de dois ou mais alvos)."
        />
      </div>
    )
  return (
    <ResultTable
      title="Todas as conexões documentadas"
      columns={[...EDGE_COLS, { key: 'reciprocal', label: 'Recíproca', fmt: (v) => (v ? 'sim' : 'não') }]}
      rows={d.graph.edges}
      criteria={d.graph.criteria}
    />
  )
}

function peakHour(r: any) {
  const top = [...(r.by_hour ?? [])].sort((a: any, b: any) => b.n - a.n)[0]
  return top ? `${String(top.hour).padStart(2, '0')}h (${top.n})` : '—'
}

function GraphPanel({ f }: { f: EventFilter }) {
  const { c } = useCase()
  const [center, setCenter] = useState('')
  const [depth, setDepth] = useState(2)
  const [minEvents, setMinEvents] = useState(2)
  const [reciprocal, setReciprocal] = useState(false)
  const [hideLeaves, setHideLeaves] = useState(false)
  const [sel, setSel] = useState<any>(null)
  const q = useQuery({
    queryKey: ['graph', c.id, f, center, depth, minEvents, reciprocal],
    queryFn: () => linkGraph(f, center || null, depth, minEvents, reciprocal) as Promise<any>,
  })
  const box = useRef<HTMLDivElement>(null)
  const cy = useRef<Core | null>(null)
  useEffect(() => {
    if (!q.data || !box.current) return
    const nodes = q.data.nodes.filter((n: any) => !hideLeaves || n.is_target || n.degree > 1)
    const ids = new Set(nodes.map((n: any) => n.id))
    const maxE = Math.max(1, ...q.data.edges.map((e: any) => e.events))
    cy.current?.destroy()
    cy.current = cytoscape({
      container: box.current,
      elements: [
        ...nodes.map((n: any) => ({
          data: {
            id: n.id,
            label: fmtNumber(n.id) + (n.label ? `\n${n.label}` : ''),
            kind: n.is_target ? 'target' : n.common_to_targets > 1 ? 'common' : 'other',
            size: n.is_target ? 46 : 18 + Math.min(22, Math.sqrt(n.events) * 3),
            raw: n,
          },
        })),
        ...q.data.edges
          .filter((e: any) => ids.has(e.n1) && ids.has(e.n2))
          .map((e: any) => ({ data: { id: `${e.n1}~${e.n2}`, source: e.n1, target: e.n2, w: 1 + (5 * e.events) / maxE, recip: e.reciprocal ? 1 : 0, raw: e } })),
      ],
      style: [
        {
          selector: 'node',
          style: {
            width: 'data(size)',
            height: 'data(size)',
            'background-color': '#5d6780',
            label: 'data(label)',
            color: '#c9d2e3',
            'font-size': 9,
            'text-wrap': 'wrap',
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'border-width': 2,
            'border-color': '#161b2e',
          },
        },
        { selector: 'node[kind = "target"]', style: { 'background-color': '#4c8dff', 'font-size': 11, 'font-weight': 'bold', color: '#ffffff' } },
        { selector: 'node[kind = "common"]', style: { 'background-color': '#c27f10' } },
        { selector: 'edge', style: { width: 'data(w)', 'line-color': '#34405f', 'curve-style': 'haystack', opacity: 0.85 } },
        { selector: 'edge[recip = 1]', style: { 'line-color': '#0f9e8e' } },
        { selector: ':selected', style: { 'border-color': '#ffffff', 'line-color': '#ffffff', 'border-width': 3 } },
      ],
      layout: { name: 'cose', animate: false, nodeRepulsion: () => 9000, idealEdgeLength: () => 90, padding: 30 } as any,
      wheelSensitivity: 0.3,
    })
    cy.current.on('tap', 'node', (ev) => setSel({ type: 'node', ...ev.target.data('raw') }))
    cy.current.on('tap', 'edge', (ev) => setSel({ type: 'edge', ...ev.target.data('raw') }))
    cy.current.on('dbltap', 'node', (ev) => setCenter(ev.target.id()))
    return () => {
      cy.current?.destroy()
      cy.current = null
    }
  }, [q.data, hideLeaves])
  const exportPng = async () => {
    if (!cy.current) return
    const a = document.createElement('a')
    a.href = cy.current.png({ bg: '#0b0f1a', full: true, scale: 2 })
    a.download = 'MARX-grafo-de-vinculos.png'
    a.click()
  }
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-mono text-base font-bold text-white">Rede de contatos</h2>
          <p className="mt-0.5 max-w-4xl text-xs text-muted">
            Azul: alvos; âmbar: contatos em comum a dois ou mais alvos; verde-água: comunicação nos dois sentidos; espessura proporcional à quantidade de eventos. Clique duas vezes
            num nó para centralizar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {' '}
          {c.can_export && (
            <button className="btn-ghost" onClick={exportPng}>
              <Download className="h-4 w-4" /> PNG
            </button>
          )}
          {q.data && (
            <ExportButtons
              build={() => ({
                title: 'Vínculos documentados',
                subtitle: `${q.data.nodes.length} números · ${q.data.edges.length} conexões`,
                columns: [
                  { key: 'n1', label: 'Número 1', fmt: (v) => fmtNumberPlain(v) },
                  { key: 'n2', label: 'Número 2', fmt: (v) => fmtNumberPlain(v) },
                  { key: 'events', label: 'Eventos' },
                  { key: 'days', label: 'Dias' },
                  { key: 'n1_to_n2', label: '1→2' },
                  { key: 'n2_to_n1', label: '2→1' },
                  { key: 'reciprocal', label: 'Recíproca', fmt: (v) => (v ? 'sim' : 'não') },
                  { key: 'call_seconds', label: 'Duração (s)' },
                  { key: 'first_event', label: 'Primeiro' },
                  { key: 'last_event', label: 'Último' },
                ],
                rows: q.data.edges,
                criteria: q.data.criteria,
              })}
            />
          )}
        </div>
      </div>
      <div className="card mb-4 flex flex-wrap items-end gap-4 p-4">
        <Field label="Número central (opcional)">
          <input value={center} placeholder="todos" onChange={(e) => setCenter(e.target.value)} />
        </Field>
        <Field label="Profundidade">
          <select value={depth} onChange={(e) => setDepth(+e.target.value)}>
            {[1, 2, 3].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>
        <Field label="Mínimo de eventos por conexão">
          <input type="number" min={1} className="w-24" value={minEvents} onChange={(e) => setMinEvents(Math.max(1, +e.target.value))} />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={reciprocal} onChange={(e) => setReciprocal(e.target.checked)} /> somente recíprocas
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={hideLeaves} onChange={(e) => setHideLeaves(e.target.checked)} /> ocultar contatos com uma única conexão
        </label>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <div className="card relative overflow-hidden">
            <div ref={box} className="h-[560px] w-full" role="img" aria-label="Grafo de contatos" />
            <div className="absolute bottom-3 left-3 flex gap-2 text-[11px] text-muted">
              <Badge tone="blue">{q.data.nodes.length} números</Badge>
              <Badge>{q.data.edges.length} conexões</Badge>
              {q.data.truncated && <Badge tone="amber">limitado às conexões mais fortes</Badge>}
            </div>
          </div>
          <aside className="card p-4 text-sm">
            {!sel ? (
              <p className="text-muted">Selecione um nó ou uma conexão para ver os detalhes e abrir os registros que a sustentam.</p>
            ) : sel.type === 'node' ? (
              <div className="space-y-2">
                <div className="font-mono text-lg text-white">{fmtNumber(sel.id)}</div>
                {sel.label && <div className="text-teal">{sel.label}</div>}
                <div>
                  {sel.is_target ? (
                    <Badge tone="blue">alvo</Badge>
                  ) : sel.common_to_targets > 1 ? (
                    <Badge tone="amber">em comum a {sel.common_to_targets} alvos</Badge>
                  ) : (
                    <Badge>contato</Badge>
                  )}
                </div>
                <div className="text-muted">
                  {sel.degree} conexões · {sel.events} eventos
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button className="btn-ghost !py-1 text-xs" onClick={() => setCenter(sel.id)}>
                    Centralizar / expandir
                  </button>
                  <DrillLink caseId={c.id} filter={{ ...f, numbers: [sel.id] }} className="btn-ghost !py-1 text-xs">
                    Abrir registros
                  </DrillLink>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="font-mono text-white">
                  {fmtNumber(sel.n1)} ⟷ {fmtNumber(sel.n2)}
                </div>
                {sel.reciprocal ? <Badge tone="teal">recíproca</Badge> : <Badge>unidirecional</Badge>}
                <dl className="grid grid-cols-2 gap-1 text-xs">
                  <dt className="text-muted">Eventos</dt>
                  <dd>{sel.events}</dd>
                  <dt className="text-muted">Dias distintos</dt>
                  <dd>{sel.days}</dd>
                  <dt className="text-muted">{fmtNumber(sel.n1)} → </dt>
                  <dd>{sel.n1_to_n2}</dd>
                  <dt className="text-muted">{fmtNumber(sel.n2)} → </dt>
                  <dd>{sel.n2_to_n1}</dd>
                  <dt className="text-muted">Duração (voz)</dt>
                  <dd>{fmtDuration(sel.call_seconds)}</dd>
                  <dt className="text-muted">Primeiro</dt>
                  <dd>{fmtDateTime(sel.first_event)}</dd>
                  <dt className="text-muted">Último</dt>
                  <dd>{fmtDateTime(sel.last_event)}</dd>
                  <dt className="text-muted">Arquivos</dt>
                  <dd>{sel.file_ids.map((x: number) => `#${x}`).join(', ')}</dd>
                </dl>
                <DrillLink caseId={c.id} filter={{ ...f, targets: [sel.n1, sel.n2], others: [sel.n1, sel.n2] }} className="btn-ghost !py-1 text-xs">
                  Abrir registros da conexão
                </DrillLink>
              </div>
            )}
            <div className="mt-6">
              <Notice tone="amber">Conexões representam registros documentados de comunicação; não provam vínculo pessoal ou associação.</Notice>
            </div>
          </aside>
        </div>
      )}
      {q.data && <Criteria criteria={q.data.criteria} />}
    </div>
  )
}
