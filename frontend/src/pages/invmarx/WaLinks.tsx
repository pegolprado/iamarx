import clsx from 'clsx'
import cytoscape, { type Core } from 'cytoscape'
import { Clock, Download, FolderOpen, Globe2, Network, Search, Target, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge, Notice } from '../../components/ui'
import { type BFile, links, localTs } from '../../engine/waBilling'
import { loadWaFiles } from '../../engine/waFiles'
import { fmtNumber, fmtNumberPlain } from '../../lib/format'
import { downloadXlsx } from '../../lib/xlsxBook'
import { Dropzone, Extracts, Needed, Purpose, ToolTitle } from './common'
import { OrganizeFiles } from './Organize'

const br = (ms: number | null | undefined) => (ms ? localTs(ms).replace(/^(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1') : '—')
type Result = ReturnType<typeof links>

/** Bilhetagem do WhatsApp — vínculos entre vários alvos (até 150 arquivos). */
export default function WaLinks() {
  const [files, setFiles] = useState<File[]>([])
  const [res, setRes] = useState<(Result & { at: Date }) | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [tab, setTab] = useState<'contatos' | 'ips' | 'grupos'>('contatos')

  const run = async () => {
    try {
      setBusy('Lendo os arquivos…')
      const r = await loadWaFiles(files, (s) => setBusy(s))
      if (!r.files.length) return toast.error('Nenhum arquivo de bilhetagem do WhatsApp reconhecido.')
      if (r.skipped.length) toast.warning(`${r.skipped.length} arquivo(s) não reconhecido(s) foram ignorados.`)
      const targets = new Set(r.files.map((f: BFile) => f.account))
      if (targets.size < 2) toast.info('Só um alvo nos arquivos: os vínculos entre alvos precisam de dois ou mais. Para um alvo, use a Bilhetagem WhatsApp individual.')
      setBusy('Cruzando contatos, IPs e grupos…')
      await new Promise((x) => setTimeout(x, 0))
      setRes({ ...links(r.files), at: new Date() })
    } catch (e: any) {
      toast.error(`Falha ao processar: ${e?.message ?? e}`)
    } finally {
      setBusy(null)
    }
  }

  if (!res)
    return (
      <div>
        <ToolTitle icon={<Network />} title="Bilhetagem WhatsApp — vínculos" />
        <Purpose>
          Analisa arquivos de bilhetagem do WhatsApp (extratos de mensagens e chamadas) de vários alvos para identificar comunicação direta entre alvos, interlocutores em comum,
          grupos compartilhados e uso coincidente do mesmo endereço IP em janela de até 12 horas — indicando se os alvos podem ter estado no mesmo local ou compartilhado a mesma
          conexão.
        </Purpose>
        <Extracts
          items={[
            ['Alvos', <Target key="i" />],
            ['Interlocutores', <Users key="i" />],
            ['IP, porta e data/hora', <Globe2 key="i" />],
            ['Grupos (IDs)', <Users key="i" />],
          ]}
        />
        <OrganizeFiles onUse={(f) => setFiles(f)} />
        <Needed items={['Bilhetagem WhatsApp de vários alvos (HTML ou ZIP)']} />
        <Dropzone
          title="Upload de bilhetagem WhatsApp"
          hint="Selecione até 150 arquivos HTML de bilhetagem (vários alvos), ou os ZIPs/Organizado.zip."
          accept=".html,.htm,.zip,.txt"
          max={150}
          files={files}
          onFiles={setFiles}
          onRun={run}
          runLabel="Processar e cruzar bilhetagem"
          busy={busy}
        />
      </div>
    )

  const r = res
  const exportXlsx = () =>
    downloadXlsx(
      `INVMARX_vinculos_whatsapp_${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        {
          name: 'Alvos',
          columns: ['Alvo', 'Interlocutores', 'Mensagens', 'Chamadas'],
          rows: r.targets.map((t) => [
            fmtNumberPlain(t),
            r.interlocutors.get(t)!.length,
            r.msgs.filter((m) => m.account === t).length,
            r.calls.filter((c) => c.account === t).length,
          ]),
        },
        {
          name: 'Contato direto',
          columns: ['Alvo 1', 'Alvo 2', 'Mensagens', 'Chamadas', 'Primeiro', 'Último'],
          rows: r.direct.map((d) => [fmtNumberPlain(d.a), fmtNumberPlain(d.b), d.msgs, d.calls, br(d.first), br(d.last)]),
        },
        {
          name: 'Interlocutores em comum',
          columns: ['Interlocutor', 'Alvos', 'Qtde de alvos', 'Interações'],
          rows: r.common.map((c) => [fmtNumberPlain(c.number), c.targets.map(fmtNumberPlain).join(', '), c.targets.length, c.total]),
        },
        {
          name: 'IPs em comum',
          columns: ['IP', 'Alvo 1', 'Horário 1', 'Porta 1', 'Alvo 2', 'Horário 2', 'Porta 2', 'Mesma porta', 'Diferença (min)'],
          rows: r.ipHits.map((h) => [
            h.ip,
            fmtNumberPlain(h.a),
            br(h.tsA),
            h.portA,
            fmtNumberPlain(h.b),
            br(h.tsB),
            h.portB,
            h.samePort ? 'sim' : 'não',
            Math.round(h.delta / 60000),
          ]),
        },
        {
          name: 'Grupos',
          columns: ['Grupo (ID)', 'Alvos', 'Qtde de alvos', 'Mensagens'],
          rows: r.groups.map((g) => [g.id, g.targets.map(fmtNumberPlain).join(', '), g.targets.length, g.msgs]),
        },
      ],
      'Horários no fuso de Brasília. Gerado pelo MARX (INVMARX).',
    )

  return (
    <div className="space-y-4">
      <ToolTitle icon={<Network />} title="Bilhetagem WhatsApp — vínculos">
        <button
          className="btn-ghost"
          onClick={() => {
            setRes(null)
            setFiles([])
          }}
        >
          Nova análise
        </button>
      </ToolTitle>
      <div className="card grid gap-3 p-3 sm:grid-cols-3">
        <Stat icon={<FolderOpen />} label="Arquivos processados" value={r.files} />
        <Stat icon={<Users />} label="Alvos" value={r.targets.length} />
        <Stat icon={<Clock />} label="Registros de IPs cruzados" value={r.obsCount.toLocaleString('pt-BR')} />
      </div>
      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 font-semibold text-white">
            <Network className="h-4 w-4 text-teal" /> Análise de vínculos — bilhetagem
          </h2>
          <button className="btn-ghost ml-auto !py-1 text-xs" onClick={exportXlsx}>
            <Download className="h-3.5 w-3.5 text-ok" /> XLSX
          </button>
        </div>
        <div className="mb-4 grid grid-cols-3 border-b border-line" role="tablist">
          {(
            [
              ['contatos', `Contatos`],
              ['ips', `IPs (${r.ipHits.length})`],
              ['grupos', `Grupos (${r.sharedGroups.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={clsx('border-b-2 py-2 text-sm', tab === id ? 'border-teal text-teal' : 'border-transparent text-muted')}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'contatos' && <Contacts r={r} />}
        {tab === 'ips' && <Ips r={r} />}
        {tab === 'grupos' && <Groups r={r} />}
      </section>
      <Notice tone="amber">
        Vínculos são registros de comunicação e de rede; não provam relação pessoal ou presença conjunta. IPv4 de operadora móvel é compartilhado (CGNAT): considere a porta e o
        horário.
      </Notice>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-ink-2 px-3 py-2">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-teal [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <div>
        <div className="text-xs text-muted">{label}</div>
        <div className="font-mono text-lg font-bold text-ok">{value}</div>
      </div>
    </div>
  )
}

function Contacts({ r }: { r: Result }) {
  return (
    <div className="space-y-5">
      <Graph r={r} />
      <div>
        <h3 className="mb-2 text-[13px] font-semibold text-danger"># Comunicação direta entre alvos</h3>
        {!r.direct.length ? (
          <p className="text-sm text-faint">Nenhuma comunicação direta entre os alvos.</p>
        ) : (
          <ul className="space-y-1">
            {r.direct.map((d) => (
              <li key={d.a + d.b} className="flex flex-wrap items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
                <span className="font-mono font-semibold text-white">
                  {fmtNumber(d.a)} ⟷ {fmtNumber(d.b)}
                </span>
                <span className="ml-auto text-xs text-muted">
                  {d.msgs} mensagens · {d.calls} chamadas · {br(d.first)} → {br(d.last)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-[13px] font-semibold text-amber"># Comunicação com interlocutores em comum entre os alvos</h3>
        {!r.commonSets.length ? (
          <p className="text-sm text-faint">Os alvos não têm interlocutores em comum.</p>
        ) : (
          <ul className="space-y-1">
            {r.commonSets.map((g) => (
              <li key={g.targets.join()} className="rounded-lg border border-amber/40 bg-amber/5 px-3 py-2 text-sm">
                <div className="font-mono font-semibold text-white">{g.targets.map(fmtNumber).join(' ⟷ ')}</div>
                <div className="mt-0.5 text-xs text-muted">
                  Interlocutores em comum ({g.contacts.length}): <span className="font-mono text-text">{g.contacts.map(fmtNumber).join(', ')}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Grafo: alvos (vermelho) no topo, interlocutores em comum (âmbar) no meio, demais contatos (verde) embaixo. */
function Graph({ r }: { r: Result }) {
  const box = useRef<HTMLDivElement>(null)
  const cy = useRef<Core | null>(null)
  const [layout, setLayout] = useState<'org' | 'rede'>('org')
  const [showAll, setShowAll] = useState(false)
  const [q, setQ] = useState('')
  useEffect(() => {
    if (!box.current) return
    const tset = new Set(r.targets)
    const commonSet = new Set(r.common.map((c) => c.number))
    const nodes = new Map<string, { id: string; kind: string; label: string }>()
    const edges: { s: string; t: string; w: number; kind: string }[] = []
    for (const t of r.targets) nodes.set(t, { id: t, kind: 'alvo', label: fmtNumber(t) })
    for (const t of r.targets)
      for (const i of r.interlocutors.get(t)!) {
        if (tset.has(i.number)) continue
        const isCommon = commonSet.has(i.number)
        if (!isCommon && !showAll) continue
        nodes.set(i.number, { id: i.number, kind: isCommon ? 'comum' : 'contato', label: fmtNumber(i.number) })
        edges.push({ s: t, t: i.number, w: i.total, kind: 'contato' })
      }
    for (const d of r.direct) edges.push({ s: d.a, t: d.b, w: d.msgs + d.calls, kind: 'direto' })
    const rows: Record<string, string[]> = { alvo: [], comum: [], contato: [] }
    for (const n of nodes.values()) rows[n.kind].push(n.id)
    const W = Math.max(600, ...Object.values(rows).map((x) => x.length * 70))
    const pos = (kind: string, i: number) => ({ x: ((i + 0.5) * W) / Math.max(1, rows[kind].length), y: kind === 'alvo' ? 0 : kind === 'comum' ? 220 : 440 })
    cy.current?.destroy()
    cy.current = cytoscape({
      container: box.current,
      elements: [
        ...[...nodes.values()].map((n) => ({ data: { id: n.id, label: n.label, kind: n.kind }, position: pos(n.kind, rows[n.kind].indexOf(n.id)) })),
        ...edges.map((e, i) => ({ data: { id: `e${i}`, source: e.s, target: e.t, kind: e.kind } })),
      ],
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'font-size': 9,
            color: '#1f2937',
            'text-valign': 'bottom',
            'text-margin-y': 3,
            width: 22,
            height: 22,
            'border-width': 2,
            'border-color': '#fff',
          },
        },
        { selector: 'node[kind = "alvo"]', style: { 'background-color': '#dc2626', width: 32, height: 32, 'font-weight': 'bold', 'font-size': 11 } },
        { selector: 'node[kind = "comum"]', style: { 'background-color': '#f59e0b', shape: 'round-rectangle' } },
        { selector: 'node[kind = "contato"]', style: { 'background-color': '#16a34a' } },
        { selector: 'edge', style: { width: 1, 'line-color': '#94a3b8', 'line-style': 'dashed', 'curve-style': 'straight', opacity: 0.7 } },
        { selector: 'edge[kind = "direto"]', style: { width: 3, 'line-color': '#dc2626', 'line-style': 'solid', opacity: 1 } },
        { selector: '.hl', style: { 'border-color': '#2563eb', 'border-width': 4 } },
        { selector: '.dim', style: { opacity: 0.15 } },
      ],
      layout: layout === 'org' ? { name: 'preset', padding: 30 } : ({ name: 'cose', animate: false, nodeRepulsion: () => 8000, padding: 30 } as any),
      wheelSensitivity: 0.3,
    })
    cy.current.on('tap', 'node', (ev) => {
      const n = ev.target
      cy.current!.elements().addClass('dim')
      n.closedNeighborhood().removeClass('dim')
    })
    cy.current.on('tap', (ev) => ev.target === cy.current && cy.current!.elements().removeClass('dim'))
    return () => {
      cy.current?.destroy()
      cy.current = null
    }
  }, [r, layout, showAll])
  useEffect(() => {
    const c = cy.current
    if (!c) return
    c.nodes().removeClass('hl')
    const d = q.replace(/\D/g, '')
    if (d.length < 3) return
    const hit = c.nodes().filter((n) => String(n.id()).replace(/\D/g, '').includes(d))
    hit.addClass('hl')
    if (hit.length) c.animate({ fit: { eles: hit, padding: 80 } }, { duration: 300 })
  }, [q])
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-amber">🔗 Alvos com interlocutores em comum</h3>
      <div className="relative overflow-hidden rounded-xl border border-line bg-slate-100">
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
          <button
            className={clsx('rounded px-2 py-1 text-xs font-semibold', layout === 'rede' ? 'bg-blue-700 text-white' : 'bg-blue-500 text-white')}
            onClick={() => setLayout('rede')}
          >
            Rede
          </button>
          <button
            className={clsx('rounded px-2 py-1 text-xs font-semibold', layout === 'org' ? 'bg-blue-700 text-white' : 'bg-blue-500 text-white')}
            onClick={() => setLayout('org')}
          >
            Organização
          </button>
          <label className="mt-1 flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-gray-700">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> todos os contatos
          </label>
        </div>
        <div className="absolute top-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded bg-white px-2 py-1 shadow">
          <Search className="h-3.5 w-3.5 text-gray-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar no grafo…"
            className="w-36 border-0 !bg-transparent p-0 text-xs text-gray-800 outline-none"
          />
        </div>
        <button className="absolute top-2 right-2 z-10 rounded bg-blue-500 px-2 py-1 text-xs font-semibold text-white" onClick={() => cy.current?.fit(undefined, 30)}>
          Centralizar
        </button>
        <div ref={box} className="h-[460px] w-full" role="img" aria-label="Grafo de vínculos entre alvos" />
        <div className="absolute bottom-2 left-2 flex gap-2 rounded bg-white/90 px-2 py-1 text-[10px] text-gray-700">
          <span>
            <b className="text-red-600">●</b> alvo
          </span>
          <span>
            <b className="text-amber-500">■</b> interlocutor em comum
          </span>
          <span>
            <b className="text-green-600">●</b> contato
          </span>
          <span>
            <b className="text-red-600">━</b> contato direto
          </span>
        </div>
      </div>
    </div>
  )
}

function Ips({ r }: { r: Result }) {
  if (!r.ipHits.length) return <p className="text-sm text-faint">Nenhum IP usado por dois alvos em até 12 h.</p>
  return (
    <div className="scroll-x rounded-lg border border-line">
      <table>
        <thead>
          <tr>
            <th>IP</th>
            <th>Alvo 1 · horário · porta</th>
            <th>Alvo 2 · horário · porta</th>
            <th>Diferença</th>
          </tr>
        </thead>
        <tbody>
          {r.ipHits.slice(0, 2000).map((h, i) => (
            <tr key={i}>
              <td className="font-mono text-xs">{h.ip}</td>
              <td className="font-mono text-xs">
                {fmtNumber(h.a)} · {br(h.tsA)} · {h.portA ?? '—'}
              </td>
              <td className="font-mono text-xs">
                {fmtNumber(h.b)} · {br(h.tsB)} · {h.portB ?? '—'}
              </td>
              <td className="text-xs">
                {Math.round(h.delta / 60000)} min {h.samePort && <Badge tone="red">mesma porta</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Groups({ r }: { r: Result }) {
  if (!r.sharedGroups.length) return <p className="text-sm text-faint">Nenhum grupo com mensagens de dois ou mais alvos.</p>
  return (
    <ul className="space-y-1">
      {r.sharedGroups.map((g) => (
        <li key={g.id} className="rounded-lg border border-line bg-ink-2 px-3 py-2 text-sm">
          <div className="font-mono text-xs text-white">{g.id}</div>
          <div className="mt-0.5 text-xs text-muted">
            {g.targets.length} alvos · {g.msgs} mensagens: {g.targets.map((t) => `${fmtNumber(t)} (${g.per[t]})`).join(', ')}
          </div>
        </li>
      ))}
    </ul>
  )
}
