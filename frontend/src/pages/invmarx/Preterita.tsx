import clsx from 'clsx'
import { Activity, BarChart3, Clock, Database, FileSpreadsheet, FileText, History, MapPin, Phone, RadioTower, Users, X } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BarsChart } from '../../components/charts'
import { ErbMap } from '../../components/ErbMap'
import { Modal, Notice } from '../../components/ui'
import { parseCallSheet, parseCsvRows, parseErbSheet, readCdrWorkbook, type CdrEvent, type ErbInfo, type EventDir, type EventKind, type ParsedFile } from '../../engine/preterita'
import { analyze, applyFilter, autoReport, distinctDays, EMPTY_CDR_FILTER, filterActive, mergeFiles, type CdrFilter } from '../../engine/preteritaStats'
import { fmtDuration, fmtInt } from '../../lib/format'
import { downloadXlsx } from '../../lib/xlsxBook'
import { Dropzone, Indicator, Panel, Purpose, ToolTitle } from './common'

const KIND_LABEL: Record<EventKind, string> = { voz: 'Voz', sms: 'SMS', dados: 'Dados', outro: 'Outro' }
const DIR_LABEL: Record<EventDir, string> = { orig: 'Originada', term: 'Recebida', unknown: 'Indefinida' }
const brTs = (ts: string | null) => (ts ? `${ts.slice(8, 10)}/${ts.slice(5, 7)}/${ts.slice(0, 4)} ${ts.slice(11, 16)}` : '—')
const toHHMM = (min: number) => `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const toMin = (v: string) => {
  const [h, m] = v.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Leitura de um arquivo (xlsx/csv) → ParsedFile. */
async function readFile(f: File): Promise<ParsedFile> {
  const buf = new Uint8Array(await f.arrayBuffer())
  if (/\.csv$|\.txt$/i.test(f.name)) {
    const text = new TextDecoder('utf-8').decode(buf)
    const rows = parseCsvRows(text)
    // reusa os parsers de linhas montando um "workbook" de uma aba
    const erbs = parseErbSheet(rows)
    const events = parseCallSheet(rows, f.name, 'csv')
    events.forEach((e, i) => (e.id = i + 1))
    return { file: f.name, events, erbs, target: events[0]?.target ?? '', sheets: [{ name: 'csv', kind: events.length ? 'chamadas' : 'erbs', rows: events.length }], warnings: [] }
  }
  return readCdrWorkbook(buf, f.name)
}

type Sub = 'painel' | 'tempo' | 'numeros' | 'erbs' | 'mapa' | 'relatorio'
const SUBS: { id: Sub; label: string; icon: ReactNode }[] = [
  { id: 'painel', label: 'Painel', icon: <BarChart3 /> },
  { id: 'tempo', label: 'Linha do tempo', icon: <Clock /> },
  { id: 'numeros', label: 'Números', icon: <Users /> },
  { id: 'erbs', label: 'ERBs', icon: <RadioTower /> },
  { id: 'mapa', label: 'Mapa', icon: <MapPin /> },
  { id: 'relatorio', label: 'Relatório', icon: <FileText /> },
]

export default function Preterita() {
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedFile[]>([])
  const [sub, setSub] = useState<Sub>('painel')
  const [filter, setFilter] = useState<CdrFilter>(EMPTY_CDR_FILTER)
  const [page, setPage] = useState(0)
  const [detail, setDetail] = useState<CdrEvent | null>(null)

  const run = async () => {
    setBusy('Lendo as planilhas…')
    try {
      const out: ParsedFile[] = []
      for (const f of files) {
        setBusy(`Lendo ${f.name}…`)
        out.push(await readFile(f))
      }
      const total = out.reduce((n, p) => n + p.events.length, 0)
      if (!total) {
        toast.error('Nenhum registro de chamada reconhecido. Confira se é um extrato de operadora (ex.: Vivo "Relatório de chamadas").')
        return
      }
      setParsed(out)
      setFiles([])
      setFilter(EMPTY_CDR_FILTER)
      setPage(0)
      toast.success(`${fmtInt(total)} registros lidos de ${out.length} arquivo(s).`)
    } catch (e: any) {
      toast.error(`Falha ao processar: ${e?.message ?? e}`)
    } finally {
      setBusy(null)
    }
  }

  const ds = useMemo(() => mergeFiles(parsed), [parsed])
  const allDays = useMemo(() => distinctDays(ds.events), [ds.events])
  const filtered = useMemo(() => applyFilter(ds.events, ds.erbs, filter), [ds.events, ds.erbs, filter])
  const st = useMemo(() => analyze(filtered, ds.erbs), [filtered, ds.erbs])
  const active = filterActive(filter)

  if (!parsed.length) {
    return (
      <div>
        <ToolTitle icon={<History />} title="Pretérita — Operadoras" />
        <Purpose>
          Análise de dados telefônicos pretéritos: importe o extrato histórico fornecido pela operadora (ligações, SMS, dados, ERBs) e o sistema lê a planilha inteira, normaliza os
          registros, calcula indicadores, organiza a cronologia, plota as ERBs com localização confirmada no mapa e produz uma análise automática fundamentada nos próprios dados.
          Tudo é processado no seu navegador; nada é enviado ou guardado.
        </Purpose>
        <Panel icon={<Database />} title="O que o sistema lê">
          <div className="grid grid-cols-2 gap-2 text-[12.5px] sm:grid-cols-3 lg:grid-cols-4">
            {[
              ['Relatório de chamadas (voz/SMS)', <Phone key="i" />],
              ['Data, hora, duração e status', <Clock key="i" />],
              ['Célula (CGI) e tecnologia', <Activity key="i" />],
              ['Endereço das ERBs → mapa', <MapPin key="i" />],
            ].map(([l, icon]) => (
              <div key={l as string} className="flex flex-col items-center gap-2 rounded-lg border border-line bg-panel-2/60 px-3 py-3 text-center font-medium text-text">
                {l}
                <span className="text-accent [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[12px] text-muted">
            Formato validado: <b className="text-violet">Vivo</b> (Relatório de chamadas + Endereço das ERBs). Outras operadoras e CSV são lidos por mapeamento automático de colunas.
          </p>
        </Panel>
        <Dropzone
          title="Importar planilhas"
          hint="Envie um ou mais extratos de chamadas da operadora (Excel .xlsx ou CSV). Várias planilhas podem ser analisadas juntas."
          accept=".xlsx,.csv,.txt"
          max={20}
          files={files}
          onFiles={setFiles}
          onRun={run}
          runLabel="Processar"
          busy={busy}
        />
      </div>
    )
  }

  const toggleKind = (k: EventKind) => setFilter({ ...filter, kinds: filter.kinds.includes(k) ? filter.kinds.filter((x) => x !== k) : [...filter.kinds, k] })
  const toggleDir = (d: EventDir) => setFilter({ ...filter, dirs: filter.dirs.includes(d) ? filter.dirs.filter((x) => x !== d) : [...filter.dirs, d] })
  const toggleDay = (d: string) => setFilter({ ...filter, days: filter.days.includes(d) ? filter.days.filter((x) => x !== d) : [...filter.days, d] })
  const chip = (on: boolean) =>
    clsx('rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors', on ? 'border-accent bg-accent/15 text-accent' : 'border-line text-muted hover:border-line-2')

  const exportXlsx = () => {
    const resumo: (string | number)[][] = [
      ['Linha(s) sob análise', ds.targets.join(', ') || '—'],
      ['Arquivos', ds.files.join(', ')],
      ['Período', `${brTs(st.period[0])} a ${brTs(st.period[1])}`],
      ['Registros (no filtro)', st.total],
      ['Concluídos', st.completed],
      ['Não concluídos', st.failed],
      ['Voz / SMS / Dados', `${st.byKind.voz} / ${st.byKind.sms} / ${st.byKind.dados}`],
      ['Originadas / Recebidas', `${st.byDir.orig} / ${st.byDir.term}`],
      ['Tempo de conversação (voz concluída)', fmtDuration(st.talkSec)],
      ['Células distintas', st.distinctCgi],
      ['ERBs geolocalizadas', st.erbWithGeo],
      ['ERBs sem coordenada', st.erbNoGeo],
    ]
    const eventos = filtered.map((e) => {
      const info = ds.erbs.get(e.cgi)
      return [
        e.dateBr,
        e.time,
        DIR_LABEL[e.dir],
        KIND_LABEL[e.kind],
        e.status,
        e.durationSec,
        e.other || '',
        e.cgi,
        e.tech,
        info?.az ?? '',
        info?.city ?? '',
        info?.district ?? '',
        info?.lat ?? '',
        info?.lon ?? '',
        info?.address ?? '',
        e.file,
      ]
    })
    const erbs = st.erbs.map((u) => [
      u.cgi,
      u.info?.sector ?? '',
      u.info?.az ?? '',
      u.info?.tech ?? '',
      u.info?.lat ?? '',
      u.info?.lon ?? '',
      u.info?.uf ?? '',
      u.info?.city ?? '',
      u.info?.district ?? '',
      u.info?.address ?? '',
      u.count,
      brTs(u.first),
      brTs(u.last),
      u.info?.found ? 'Sim' : 'Não',
    ])
    const numeros = st.contacts.map((c) => [c.number, c.total, c.orig, c.term, c.voz, c.sms, brTs(c.first), brTs(c.last)])
    downloadXlsx(
      `Preterita_${(ds.targets[0] || 'analise').replace(/\D/g, '') || 'analise'}.xlsx`,
      [
        { name: 'Resumo', columns: ['Campo', 'Valor'], rows: resumo },
        {
          name: 'Eventos',
          columns: ['Data', 'Hora', 'Direção', 'Tipo', 'Status', 'Duração(s)', 'Contraparte', 'CGI', 'Tecnologia', 'Azimute', 'Cidade ERB', 'Bairro', 'Latitude', 'Longitude', 'Endereço', 'Arquivo'],
          rows: eventos,
        },
        { name: 'ERBs', columns: ['CGI', 'Setor', 'Azimute', 'Tecnologia', 'Latitude', 'Longitude', 'UF', 'Cidade', 'Bairro', 'Endereço', 'Registros', 'Primeiro', 'Último', 'Localizada'], rows: erbs },
        { name: 'Números', columns: ['Número', 'Total', 'Originadas', 'Recebidas', 'Voz', 'SMS', 'Primeiro', 'Último'], rows: numeros },
      ],
      'MARX · Análise de telefonia pretérita — a ERB indica associação de rede, não a posição exata do aparelho.',
    )
  }

  const reportLines = autoReport(st, { ...ds, events: filtered })

  return (
    <div>
      <ToolTitle icon={<History />} title="Pretérita — Operadoras">
        <button className="btn-ghost" onClick={exportXlsx}>
          <FileSpreadsheet className="h-4 w-4 text-ok" /> Excel
        </button>
        <button
          className="btn-ghost"
          onClick={() => {
            setParsed([])
            setFilter(EMPTY_CDR_FILTER)
          }}
        >
          Nova análise
        </button>
      </ToolTitle>

      {/* indicadores */}
      <div className="mb-3 flex flex-wrap gap-2">
        <Indicator label="Registros" value={fmtInt(st.total)} icon={<Database />} />
        <Indicator label="Concluídas" value={fmtInt(st.completed)} icon={<Phone />} />
        <Indicator label="Originadas" value={fmtInt(st.byDir.orig)} />
        <Indicator label="Recebidas" value={fmtInt(st.byDir.term)} />
        <Indicator label="Voz / SMS" value={`${fmtInt(st.byKind.voz)}/${fmtInt(st.byKind.sms)}`} />
        <Indicator label="Conversação" value={fmtDuration(st.talkSec)} icon={<Clock />} />
        <Indicator label="Contrapartes" value={fmtInt(st.distinctOthers)} icon={<Users />} />
        <Indicator label="Células" value={fmtInt(st.distinctCgi)} icon={<RadioTower />} />
        <Indicator label="ERBs no mapa" value={fmtInt(st.distinctSites)} icon={<MapPin />} />
      </div>

      {/* período */}
      <p className="mb-3 text-[12.5px] text-muted">
        Linha(s): <b className="text-text">{ds.targets.join(', ') || '—'}</b> · Período {brTs(st.period[0])} → {brTs(st.period[1])} · {ds.files.length} arquivo(s)
        {active && <span className="ml-1 text-accent">· filtro ativo</span>}
      </p>

      {/* filtros */}
      <FilterBar
        filter={filter}
        setFilter={setFilter}
        allDays={allDays}
        files={ds.files}
        active={active}
        chip={chip}
        toggleKind={toggleKind}
        toggleDir={toggleDir}
        toggleDay={toggleDay}
        onClear={() => (setFilter(EMPTY_CDR_FILTER), setPage(0))}
      />

      {/* sub-navegação */}
      <div className="mt-4 mb-3 flex flex-wrap gap-1 border-b border-line">
        {SUBS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSub(s.id)}
            className={clsx(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium [&>svg]:h-4 [&>svg]:w-4',
              sub === s.id ? 'border-accent text-white' : 'border-transparent text-muted hover:text-text',
            )}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {sub === 'painel' && <PainelTab st={st} />}
      {sub === 'tempo' && <TempoTab st={st} filtered={filtered} page={page} setPage={setPage} onRow={setDetail} />}
      {sub === 'numeros' && <NumerosTab st={st} />}
      {sub === 'erbs' && <ErbsTab st={st} />}
      {sub === 'mapa' && <MapaTab st={st} />}
      {sub === 'relatorio' && <RelatorioTab lines={reportLines} />}

      {detail && <EventDetail e={detail} erb={ds.erbs.get(detail.cgi) ?? null} onClose={() => setDetail(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------

function FilterBar({
  filter,
  setFilter,
  allDays,
  files,
  active,
  chip,
  toggleKind,
  toggleDir,
  toggleDay,
  onClear,
}: {
  filter: CdrFilter
  setFilter: (f: CdrFilter) => void
  allDays: string[]
  files: string[]
  active: boolean
  chip: (on: boolean) => string
  toggleKind: (k: EventKind) => void
  toggleDir: (d: EventDir) => void
  toggleDay: (d: string) => void
  onClear: () => void
}) {
  return (
    <section className="card space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11.5px] font-medium text-muted">Tipo:</span>
          {(['voz', 'sms', 'dados'] as EventKind[]).map((k) => (
            <button key={k} className={chip(filter.kinds.includes(k))} onClick={() => toggleKind(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11.5px] font-medium text-muted">Direção:</span>
          {(['orig', 'term'] as EventDir[]).map((d) => (
            <button key={d} className={chip(filter.dirs.includes(d))} onClick={() => toggleDir(d)}>
              {DIR_LABEL[d]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11.5px] font-medium text-muted">Status:</span>
          {(['all', 'completed', 'failed'] as const).map((s) => (
            <button key={s} className={chip(filter.status === s && s !== 'all' ? true : filter.status === s)} onClick={() => setFilter({ ...filter, status: s })}>
              {s === 'all' ? 'Todas' : s === 'completed' ? 'Concluídas' : 'Não concl.'}
            </button>
          ))}
        </div>
        {active && (
          <button className="ml-auto text-[12px] font-medium text-accent hover:underline" onClick={onClear}>
            limpar filtros
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="h-8 w-40 !border-line !bg-ink-2 text-[12.5px]"
          placeholder="número (contraparte)…"
          value={filter.number}
          onChange={(e) => setFilter({ ...filter, number: e.target.value })}
        />
        <input className="h-8 w-28 !border-line !bg-ink-2 text-[12.5px]" placeholder="tecnologia…" value={filter.tech} onChange={(e) => setFilter({ ...filter, tech: e.target.value })} />
        <input className="h-8 w-32 !border-line !bg-ink-2 text-[12.5px]" placeholder="cidade da ERB…" value={filter.city} onChange={(e) => setFilter({ ...filter, city: e.target.value })} />
        <input className="h-8 w-28 !border-line !bg-ink-2 font-mono text-[12.5px]" placeholder="CGI…" value={filter.cgi} onChange={(e) => setFilter({ ...filter, cgi: e.target.value })} />
        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          duração ≥
          <input
            type="number"
            min={0}
            className="h-8 w-16 !border-line !bg-ink-2 text-[12.5px]"
            value={filter.minDur || ''}
            onChange={(e) => setFilter({ ...filter, minDur: +e.target.value || 0 })}
          />
          s
        </label>
        {files.length > 1 && (
          <select className="h-8 !border-line !bg-ink-2 text-[12.5px]" value={filter.file} onChange={(e) => setFilter({ ...filter, file: e.target.value })}>
            <option value="">todos os arquivos</option>
            {files.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-1 text-[12px] text-muted">
          <span>hora</span>
          <input type="time" className="h-8 !border-line !bg-ink-2 text-[12px]" value={toHHMM(filter.from)} onChange={(e) => setFilter({ ...filter, from: toMin(e.target.value) })} />
          <span>–</span>
          <input type="time" className="h-8 !border-line !bg-ink-2 text-[12px]" value={toHHMM(filter.to)} onChange={(e) => setFilter({ ...filter, to: toMin(e.target.value) })} />
          {([['Dia', 360, 1080], ['Noite', 1080, 360], ['Madrug.', 0, 360]] as const).map(([l, a, b]) => (
            <button key={l} className={chip(filter.from === a && filter.to === b)} onClick={() => setFilter({ ...filter, from: a, to: b })}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {allDays.length > 0 && (
        <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto rounded-md border border-line bg-ink-2/50 p-1.5">
          <button className={chip(!filter.days.length)} onClick={() => setFilter({ ...filter, days: [] })}>
            Todos os dias
          </button>
          {allDays.map((d) => (
            <button key={d} className={chip(filter.days.includes(d))} onClick={() => toggleDay(d)}>
              {d.slice(8, 10)}/{d.slice(5, 7)}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function PainelTab({ st }: { st: ReturnType<typeof analyze> }) {
  const kindData = [
    { x: 'Voz', total: st.byKind.voz },
    { x: 'SMS', total: st.byKind.sms },
    { x: 'Dados', total: st.byKind.dados },
    { x: 'Outro', total: st.byKind.outro },
  ].filter((d) => d.total)
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <BarsChart title="Registros por dia" data={st.byDay} x="x" series={[{ key: 'total', name: 'Registros' }]} xFmt={(v) => `${v.slice(8, 10)}/${v.slice(5, 7)}`} />
      <BarsChart title="Registros por hora" data={st.byHour} x="x" series={[{ key: 'total', name: 'Registros' }]} />
      <BarsChart title="Por dia da semana" data={st.byWeekday} x="x" series={[{ key: 'total', name: 'Registros' }]} />
      <BarsChart title="Por tipo de comunicação" data={kindData} x="x" series={[{ key: 'total', name: 'Registros' }]} />
    </div>
  )
}

function TempoTab({
  st,
  filtered,
  page,
  setPage,
  onRow,
}: {
  st: ReturnType<typeof analyze>
  filtered: CdrEvent[]
  page: number
  setPage: (n: number) => void
  onRow: (e: CdrEvent) => void
}) {
  const PER = 60
  const pages = Math.max(1, Math.ceil(filtered.length / PER))
  const p = Math.min(page, pages - 1)
  const shown = filtered.slice(p * PER, p * PER + PER)
  return (
    <div className="space-y-3">
      <BarsChart title="Linha do tempo — registros por dia" data={st.byDay} x="x" series={[{ key: 'voz', name: 'Voz' }, { key: 'sms', name: 'SMS' }, { key: 'dados', name: 'Dados' }]} xFmt={(v) => `${v.slice(8, 10)}/${v.slice(5, 7)}`} height={220} />
      <section className="card overflow-hidden">
        <div className="panel-head justify-between">
          <span>Eventos ({fmtInt(filtered.length)})</span>
          {pages > 1 && (
            <span className="flex items-center gap-1 text-[12px] text-muted">
              <button className="btn-ghost h-6 !px-2" disabled={p === 0} onClick={() => setPage(p - 1)}>
                ‹
              </button>
              {p + 1}/{pages}
              <button className="btn-ghost h-6 !px-2" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>
                ›
              </button>
            </span>
          )}
        </div>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Dir.</th>
                <th>Tipo</th>
                <th>Status</th>
                <th className="text-right">Duração</th>
                <th>Contraparte</th>
                <th>Tec</th>
                <th>Célula (CGI)</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className="cursor-pointer hover:bg-accent/5" onClick={() => onRow(e)}>
                  <td className="font-mono text-[12px] whitespace-nowrap">
                    {e.dateBr} {e.time.slice(0, 5)}
                  </td>
                  <td>{DIR_LABEL[e.dir]}</td>
                  <td>{KIND_LABEL[e.kind]}</td>
                  <td className={e.completed ? 'text-ok' : 'text-muted'}>{e.status || '—'}</td>
                  <td className="text-right font-mono text-[12px]">{e.durationSec ? fmtDuration(e.durationSec) : '—'}</td>
                  <td className="font-mono text-[12px]">{e.other || '—'}</td>
                  <td className="text-[12px]">{e.tech || '—'}</td>
                  <td className="font-mono text-[11px]">{e.cgi || '—'}</td>
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-muted">
                    Nenhum evento no filtro atual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-[11.5px] text-faint">Clique numa linha para ver todos os campos da planilha original.</p>
    </div>
  )
}

function NumerosTab({ st }: { st: ReturnType<typeof analyze> }) {
  if (!st.contacts.length)
    return (
      <Notice tone="amber" title="Sem contrapartes identificadas">
        Este extrato não traz o número da outra ponta das comunicações (as colunas de origem/destino contêm apenas a própria linha ou ficam vazias) — comum em alguns relatórios de
        operadora. A análise de números fica disponível automaticamente quando a planilha informa os números dos interlocutores.
      </Notice>
    )
  return (
    <section className="card overflow-hidden">
      <div className="panel-head">Ranking de contrapartes ({fmtInt(st.contacts.length)})</div>
      <div className="scroll-x">
        <table>
          <thead>
            <tr>
              <th>Número</th>
              <th className="text-right">Total</th>
              <th className="text-right">Originadas</th>
              <th className="text-right">Recebidas</th>
              <th className="text-right">Voz</th>
              <th className="text-right">SMS</th>
              <th>Primeiro</th>
              <th>Último</th>
            </tr>
          </thead>
          <tbody>
            {st.contacts.slice(0, 300).map((c) => (
              <tr key={c.number}>
                <td className="font-mono text-[12.5px] text-white">{c.number}</td>
                <td className="text-right tabular-nums">{fmtInt(c.total)}</td>
                <td className="text-right tabular-nums">{fmtInt(c.orig)}</td>
                <td className="text-right tabular-nums">{fmtInt(c.term)}</td>
                <td className="text-right tabular-nums">{fmtInt(c.voz)}</td>
                <td className="text-right tabular-nums">{fmtInt(c.sms)}</td>
                <td className="font-mono text-[11.5px] text-muted">{brTs(c.first)}</td>
                <td className="font-mono text-[11.5px] text-muted">{brTs(c.last)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="p-3 text-[11.5px] text-faint">Frequência de contato é indicativo estatístico; não comprova, por si, vínculo pessoal.</p>
    </section>
  )
}

function ErbsTab({ st }: { st: ReturnType<typeof analyze> }) {
  return (
    <section className="card overflow-hidden">
      <div className="panel-head">Células / ERBs ({fmtInt(st.erbs.length)})</div>
      <div className="scroll-x">
        <table>
          <thead>
            <tr>
              <th>CGI</th>
              <th className="text-right">Registros</th>
              <th>Tec</th>
              <th className="text-right">Azi</th>
              <th>Cidade/Bairro</th>
              <th>Endereço</th>
              <th>Coord.</th>
            </tr>
          </thead>
          <tbody>
            {st.erbs.slice(0, 500).map((u) => (
              <tr key={u.cgi} className={u.info?.found ? '' : 'opacity-60'}>
                <td className="font-mono text-[11.5px]">{u.cgi}</td>
                <td className="text-right tabular-nums">{fmtInt(u.count)}</td>
                <td className="text-[12px]">{u.info?.tech || '—'}</td>
                <td className="text-right font-mono text-[12px]">{u.info?.az ?? '—'}</td>
                <td className="text-[12px]">{[u.info?.district, u.info?.city].filter(Boolean).join(' / ') || '—'}</td>
                <td className="max-w-[260px] truncate text-[12px] text-muted" title={u.info?.address ?? ''}>
                  {u.info?.address || '—'}
                </td>
                <td className="text-[11.5px]">
                  {u.info?.found ? (
                    <span className="font-mono text-ok">
                      {u.info.lat!.toFixed(5)}, {u.info.lon!.toFixed(5)}
                    </span>
                  ) : (
                    <span className="text-amber">sem coordenada</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {st.erbNoGeo > 0 && (
        <p className="p-3 text-[11.5px] text-amber">
          {fmtInt(st.erbNoGeo)} célula(s) sem coordenada confirmada na planilha não são plotadas no mapa — nenhuma localização é presumida.
        </p>
      )}
    </section>
  )
}

function MapaTab({ st }: { st: ReturnType<typeof analyze> }) {
  if (!st.sites.length)
    return (
      <Notice tone="amber" title="Nenhuma ERB com coordenada">
        As células deste recorte não têm coordenada confirmada na planilha, então nada é plotado — o sistema não inventa posições. Importe a aba “Endereço das ERBs” ou ajuste o
        filtro.
      </Notice>
    )
  return (
    <div>
      <ErbMap
        points={st.sites}
        azMode="setor"
        legend={
          <div className="text-[11px] text-muted">
            {fmtInt(st.sites.length)} ERBs · setor pelo azimute informado. A antena indica associação de rede, não a posição exata do aparelho.
          </div>
        }
      />
    </div>
  )
}

function RelatorioTab({ lines }: { lines: string[] }) {
  return (
    <div className="space-y-3">
      <Panel icon={<FileText />} title="Análise automática (fundamentada nos registros)">
        <ul className="space-y-2 text-[13.5px] leading-relaxed text-text/90">
          {lines.map((l, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {l}
            </li>
          ))}
        </ul>
      </Panel>
      <Notice tone="blue">
        Esta análise é gerada por regras determinísticas a partir dos números efetivamente importados — não usa modelo externo nem inventa dados. Use o botão <b>Excel</b> no topo para
        exportar as tabelas completas (resumo, eventos, ERBs e números).
      </Notice>
    </div>
  )
}

function EventDetail({ e, erb, onClose }: { e: CdrEvent; erb: ErbInfo | null; onClose: () => void }) {
  return (
    <Modal open title="Registro — campos originais" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {Object.entries(e.raw).map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <span className="text-[10.5px] tracking-wide text-faint uppercase">{k}</span>
              <span className="font-mono text-[12.5px] text-text">{v || '—'}</span>
            </div>
          ))}
        </div>
        {erb?.found && (
          <div className="rounded-lg border border-line bg-ink-2 p-2.5 text-[12.5px]">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-white">
              <MapPin className="h-3.5 w-3.5 text-accent" /> ERB localizada
            </div>
            <div className="text-muted">
              {[erb.address, erb.district, erb.city, erb.uf].filter(Boolean).join(' · ')}
            </div>
            <div className="mt-1 font-mono text-[11.5px] text-ok">
              {erb.lat!.toFixed(5)}, {erb.lon!.toFixed(5)} · azimute {erb.az ?? '—'}° · {erb.tech ?? '—'}
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <button className="btn-ghost h-8" onClick={onClose}>
            <X className="h-4 w-4" /> Fechar
          </button>
        </div>
      </div>
    </Modal>
  )
}
