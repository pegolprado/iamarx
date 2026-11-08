import clsx from 'clsx'
import cytoscape, { type Core } from 'cytoscape'
import { Clock, Download, FolderOpen, Globe2, Network, Pencil, Search, Target, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { GraphControls, hoverFocus, reducedMotion } from '../../components/graph'
import { Badge, Notice } from '../../components/ui'
import { type IpInfo, isMobileNet, loadIpdb, lookupIp } from '../../engine/ipdb'
import { type BFile, type Coloc, links, localTs } from '../../engine/waBilling'
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
  const [names, setNames] = useState<Names>({})
  const setName: SetName = (n, v) =>
    setNames((m) => {
      const x = { ...m }
      if (v.trim()) x[n] = v.trimStart()
      else delete x[n]
      return x
    })

  const run = async () => {
    try {
      setBusy('Lendo os arquivos…')
      const r = await loadWaFiles(files, (s) => setBusy(s))
      if (!r.files.length) return toast.error('Nenhum arquivo de bilhetagem do WhatsApp reconhecido.')
      if (r.skipped.length) toast.warning(`${r.skipped.length} arquivo(s) não reconhecido(s) foram ignorados.`)
      const targets = new Set(r.files.map((f: BFile) => f.account))
      if (targets.size < 2) toast.info('Só um alvo nos arquivos: os vínculos entre alvos precisam de dois ou mais. Para um alvo, use a Bilhetagem WhatsApp individual.')
      setBusy('Consultando provedores e cidades dos IPs…')
      let lookup: ((ip: string) => IpInfo) | null = null
      try {
        const db = await loadIpdb()
        lookup = (ip: string) => lookupIp(db, ip)
      } catch {
        toast.warning('A base de provedores/cidades não carregou: os IPs aparecem sem provedor e sem filtro de operadora móvel.')
      }
      setBusy('Cruzando contatos, IPs e grupos…')
      await new Promise((x) => setTimeout(x, 0))
      setNames({})
      setRes({ ...links(r.files, undefined, lookup), at: new Date() })
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
  const nm = (n: string) => (names[n] ? `${names[n]} (${fmtNumberPlain(n)})` : fmtNumberPlain(n))
  const exportXlsx = () =>
    downloadXlsx(
      `INVMARX_vinculos_whatsapp_${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        {
          name: 'Alvos',
          columns: ['Alvo', 'Nome', 'Interlocutores', 'Mensagens', 'Chamadas'],
          rows: r.targets.map((t) => [
            fmtNumberPlain(t),
            names[t] ?? '',
            r.interlocutors.get(t)!.length,
            r.msgs.filter((m) => m.account === t).length,
            r.calls.filter((c) => c.account === t).length,
          ]),
        },
        {
          name: 'Contato direto',
          columns: ['Alvo 1', 'Alvo 2', 'Mensagens', 'Chamadas', 'Primeiro', 'Último'],
          rows: r.direct.map((d) => [nm(d.a), nm(d.b), d.msgs, d.calls, br(d.first), br(d.last)]),
        },
        {
          name: 'Interlocutores em comum',
          columns: ['Interlocutor', 'Alvos', 'Qtde de alvos', 'Interações'],
          rows: r.common.map((c) => [nm(c.number), c.targets.map(nm).join(', '), c.targets.length, c.total]),
        },
        {
          name: 'Mesmo local (IP)',
          columns: ['IP', 'Provedor', 'Cidade', 'Número', 'Tipo', 'Primeiro', 'Último', 'Registros', 'Dias com coincidência', 'Dias', 'Mesma porta'],
          rows: r.coloc.flatMap((c) =>
            c.numbers.map((n) => [
              c.ip,
              c.info?.org ?? '',
              c.info?.city ? `${c.info.city}/${c.info.uf ?? ''}` : '',
              nm(n.number),
              n.target ? 'alvo' : 'interlocutor',
              br(n.first),
              br(n.last),
              n.n,
              c.days.length,
              c.days.map((d) => d.split('-').reverse().join('/')).join(', '),
              c.samePort ? 'sim' : 'não',
            ]),
          ),
        },
        {
          name: 'IPs em comum',
          columns: ['IP', 'Alvo 1', 'Horário 1', 'Porta 1', 'Alvo 2', 'Horário 2', 'Porta 2', 'Mesma porta', 'Diferença (min)'],
          rows: r.ipHits.map((h) => [h.ip, nm(h.a), br(h.tsA), h.portA, nm(h.b), br(h.tsB), h.portB, h.samePort ? 'sim' : 'não', Math.round(h.delta / 60000)]),
        },
        {
          name: 'Grupos',
          columns: ['Grupo (ID)', 'Alvos', 'Qtde de alvos', 'Mensagens'],
          rows: r.groups.map((g) => [g.id, g.targets.map(nm).join(', '), g.targets.length, g.msgs]),
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
        <Stat
          icon={<Clock />}
          label="Registros de IPs cruzados"
          value={r.obsCount.toLocaleString('pt-BR')}
          sub={`${r.obsBy.mensagem.toLocaleString('pt-BR')} mensagens · ${r.obsBy.chamada.toLocaleString('pt-BR')} eventos de chamada · ${r.obsBy.login.toLocaleString('pt-BR')} logins`}
        />
      </div>
      <TargetNames r={r} names={names} setName={setName} />
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
              ['ips', `IPs (${r.coloc.length})`],
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
        {tab === 'contatos' && <Contacts r={r} names={names} setName={setName} />}
        {tab === 'ips' && <Ips r={r} names={names} setName={setName} />}
        {tab === 'grupos' && <Groups r={r} names={names} />}
      </section>
      <Notice tone="amber">
        Vínculos são registros de comunicação e de rede; não provam relação pessoal ou presença conjunta. Na aba IPs, IPv4 de operadora móvel (compartilhado por CGNAT) fica de
        fora; IPv6 e internet fixa entram. Provedor e cidade são estimados por bases públicas de IP (IPtoASN; DB-IP, CC BY 4.0).
      </Notice>
    </div>
  )
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-ink-2 px-3 py-2">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-teal [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <div>
        <div className="text-xs text-muted">{label}</div>
        <div className="font-mono text-lg font-bold text-ok">{value}</div>
        {sub && <div className="text-[10px] text-faint">{sub}</div>}
      </div>
    </div>
  )
}

function Contacts({ r, names, setName }: { r: Result; names: Names; setName: SetName }) {
  return (
    <div className="space-y-5">
      <Graph r={r} names={names} setName={setName} />
      <div>
        <h3 className="mb-2 text-[13px] font-semibold text-danger"># Comunicação direta entre alvos</h3>
        {!r.direct.length ? (
          <p className="text-sm text-faint">Nenhuma comunicação direta entre os alvos.</p>
        ) : (
          <ul className="space-y-1">
            {r.direct.map((d) => (
              <li key={d.a + d.b} className="flex flex-wrap items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
                <span className="font-mono font-semibold text-white">
                  {who(names, d.a)} ⟷ {who(names, d.b)}
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
                <div className="font-mono font-semibold text-white">{g.targets.map((t) => who(names, t)).join(' ⟷ ')}</div>
                <div className="mt-0.5 text-xs text-muted">
                  Interlocutores em comum ({g.contacts.length}): <span className="font-mono text-text">{g.contacts.map((c) => who(names, c)).join(', ')}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Cores no padrão INVTECH: fundo claro, alvos vermelhos, em comum laranja, contatos verdes, IPs azuis. */
const INV = { bg: '#f3f4f6', target: '#e53935', common: '#22a34a', contact: '#86c79a', ip: '#1e88e5', edge: '#b0bec5', direct: '#e53935', label: '#263238', badge: '#1e88e5' }
const svgUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
const PERSON = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
)
const PHONE = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>',
)
/** Selo no meio da ligação alvo → interlocutor: ↗ enviadas pelo alvo (verde), ↙ recebidas (vermelho). */
const badgeSvg = (out: number, inn: number) => {
  const w = Math.max(30, 14 + 6 * Math.max(String(out).length, String(inn).length))
  return {
    w,
    img: svgUri(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="26" viewBox="0 0 ${w} 26"><rect x="0.5" y="0.5" width="${w - 1}" height="12" rx="2.5" fill="#16a34a"/><rect x="0.5" y="13.5" width="${w - 1}" height="12" rx="2.5" fill="#dc2626"/><g font-family="Arial,Helvetica,sans-serif" font-size="9" font-weight="700" fill="#fff"><text x="3" y="10">↗ ${out}</text><text x="3" y="23">↙ ${inn}</text></g></svg>`,
    ),
  }
}
type Names = Record<string, string>
type SetName = (n: string, v: string) => void
const label = (names: Names, n: string) => (names[n] ? `${names[n]}\n${fmtNumber(n)}` : fmtNumber(n))
const who = (names: Names, n: string) => (names[n] ? `${names[n]} (${fmtNumber(n)})` : fmtNumber(n))

const baseStyle: any[] = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'font-size': 9,
      'font-family': 'JetBrains Mono, monospace',
      color: INV.label,
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.85,
      'text-background-padding': '1.5px',
      'text-margin-y': 3,
      width: 20,
      height: 20,
      'border-width': 2,
      'border-color': '#ffffff',
    },
  },
  {
    selector: 'node[kind = "alvo"]',
    style: {
      'background-color': INV.target,
      'background-image': PERSON,
      'background-width': '62%',
      'background-height': '62%',
      width: 32,
      height: 32,
      'font-weight': 'bold',
      'font-size': 10.5,
    },
  },
  { selector: 'node[big]', style: { width: 'data(big)', height: 'data(big)' } },
  {
    selector: 'node[kind = "comum"]',
    style: { 'background-color': INV.common, 'background-image': PHONE, 'background-width': '62%', 'background-height': '62%', width: 28, height: 28 },
  },
  {
    selector: 'node[kind = "contato"]',
    style: { 'background-color': INV.contact, 'background-image': PHONE, 'background-width': '62%', 'background-height': '62%', width: 20, height: 20 },
  },
  {
    selector: 'node[kind = "badge"]',
    style: {
      shape: 'rectangle',
      'background-opacity': 0,
      'border-width': 0,
      'background-image': 'data(img)',
      'background-fit': 'contain',
      width: 'data(w)',
      height: 26,
      label: '',
      'z-index': 10,
    },
  },
  { selector: 'node[kind = "ip"]', style: { 'background-color': INV.ip, shape: 'round-rectangle', width: 26, height: 26, 'font-size': 8.5 } },
  { selector: 'edge', style: { width: 0.8, 'line-color': '#37474f', 'curve-style': 'straight', opacity: 0.75 } },
  {
    selector: 'edge[kind = "direto"]',
    style: {
      width: 3,
      'line-color': INV.direct,
      label: 'data(w)',
      'font-size': 9,
      'font-weight': 'bold',
      color: '#ffffff',
      'text-background-color': INV.badge,
      'text-background-opacity': 1,
      'text-background-shape': 'roundrectangle',
      'text-background-padding': '3px',
    },
  },
  { selector: 'edge[kind = "ip"]', style: { width: 1.6, 'line-color': '#90caf9' } },
  { selector: '.hl', style: { 'border-color': '#fdd835', 'border-width': 4 } },
  { selector: '.dim', style: { opacity: 0.12 } },
  { selector: '.faded', style: { opacity: 0.12 } },
]

function useCy(box: React.RefObject<HTMLDivElement | null>, build: () => { elements: any[]; layout: any } | null, deps: unknown[], setName: SetName, names: Names) {
  const cy = useRef<Core | null>(null)
  const namesRef = useRef(names)
  namesRef.current = names
  useEffect(() => {
    if (!box.current) return
    const b = build()
    if (!b) return
    cy.current?.destroy()
    cy.current = cytoscape({ container: box.current, elements: b.elements, style: baseStyle, layout: b.layout, wheelSensitivity: 0.3 })
    // com poucos nós o enquadramento aproxima demais: limita o zoom inicial
    const c = cy.current
    const cap = () => {
      if (c.zoom() > 1.2) {
        c.zoom(1.2)
        c.center()
      }
    }
    cap()
    c.one('layoutstop', cap)
    hoverFocus(cy.current)
    cy.current.on('tap', 'node', (ev) => {
      cy.current!.elements().addClass('dim')
      ev.target.closedNeighborhood().removeClass('dim')
    })
    cy.current.on('tap', (ev) => ev.target === cy.current && cy.current!.elements().removeClass('dim'))
    // duplo clique num número: dar ou trocar o nome
    cy.current.on('dbltap', 'node', (ev) => {
      const id = String(ev.target.id())
      if (ev.target.data('kind') === 'ip' || ev.target.data('kind') === 'badge') return
      const v = window.prompt(`Nome para ${fmtNumber(id)} (vazio remove):`, namesRef.current[id] ?? '')
      if (v !== null) setName(id, v)
    })
    return () => {
      cy.current?.destroy()
      cy.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  // nomes trocados: só atualiza os rótulos
  useEffect(() => {
    cy.current?.nodes().forEach((n) => {
      if (n.data('kind') !== 'ip' && n.data('kind') !== 'badge') n.data('label', label(names, String(n.id())))
    })
  }, [names])
  return cy
}

function GraphBox({
  cy,
  boxRef,
  title,
  aria,
  legend,
  children,
}: {
  cy: React.RefObject<Core | null>
  boxRef: React.RefObject<HTMLDivElement | null>
  title: string
  aria: string
  legend: { color: string; label: string; shape?: 'square' | 'line' | 'round' }[]
  children?: React.ReactNode
}) {
  const [q, setQ] = useState('')
  useEffect(() => {
    const c = cy.current
    if (!c) return
    c.nodes().removeClass('hl')
    const t = q.trim().toLowerCase()
    if (t.length < 3) return
    const d = t.replace(/\D/g, '')
    const hit = c.nodes().filter((n) => (d.length >= 3 && String(n.id()).replace(/\D/g, '').includes(d)) || String(n.data('label')).toLowerCase().includes(t))
    hit.addClass('hl')
    if (hit.length) c.animate({ fit: { eles: hit, padding: 80 } }, { duration: 300 })
  }, [q, cy])
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-amber">{title}</h3>
      <div className="relative overflow-hidden rounded-[10px] border border-line" style={{ background: INV.bg }}>
        {children && <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">{children}</div>}
        <div className="absolute top-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-[6px] border border-[#cfd8dc] bg-[#fff] px-2 py-1">
          <Search className="h-3.5 w-3.5 text-[#78909c]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar número ou nome…"
            className="w-40 border-0 !bg-transparent p-0 text-xs text-[#263238] outline-none !shadow-none"
          />
        </div>
        <GraphControls cy={cy} />
        <div ref={boxRef} className="h-[560px] w-full" role="img" aria-label={aria} />
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-x-3 gap-y-1 rounded-[6px] border border-[#cfd8dc] bg-[#fff] px-2 py-1 font-mono text-[10px] text-[#37474f]">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1">
              {l.shape === 'line' ? (
                <span className="inline-block h-0 w-4 border-t-[3px]" style={{ borderColor: l.color }} />
              ) : (
                <span className={l.shape === 'square' ? 'h-2.5 w-2.5' : 'h-2.5 w-2.5 rounded-full'} style={{ background: l.color }} />
              )}
              {l.label}
            </span>
          ))}
          <span className="text-[#78909c]">· duplo clique no número para dar nome</span>
        </div>
      </div>
    </div>
  )
}

const toggle = (on: boolean) =>
  clsx('rounded-[6px] border px-2 py-1 text-xs font-medium', on ? 'border-[#1e88e5] bg-[#e3f2fd] text-[#1565c0]' : 'border-[#cfd8dc] bg-[#fff] text-[#546e7a] hover:text-[#263238]')

/** Grafo: alvos (vermelho) no topo, interlocutores em comum (laranja) no meio, demais contatos (verde) embaixo. */
function Graph({ r, names, setName }: { r: Result; names: Names; setName: SetName }) {
  const box = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<'org' | 'rede'>('org')
  const [showAll, setShowAll] = useState(false)
  const cy = useCy(
    box,
    () => {
      const tset = new Set(r.targets)
      const commonSet = new Set(r.common.map((c) => c.number))
      const nodes = new Map<string, { id: string; kind: string }>()
      const links: { t: string; c: string; out: number; inn: number }[] = []
      for (const t of r.targets) nodes.set(t, { id: t, kind: 'alvo' })
      for (const t of r.targets)
        for (const i of r.interlocutors.get(t)!) {
          if (tset.has(i.number)) continue
          const isCommon = commonSet.has(i.number)
          if (!isCommon && !showAll) continue
          nodes.set(i.number, { id: i.number, kind: isCommon ? 'comum' : 'contato' })
          links.push({ t, c: i.number, out: i.sent + i.callsOut, inn: i.received + i.callsIn })
        }
      const rows: Record<string, string[]> = { alvo: [], comum: [], contato: [] }
      for (const n of nodes.values()) rows[n.kind].push(n.id)
      // alvos com mais interlocutores ficam maiores
      const deg = new Map<string, number>()
      for (const l of links) deg.set(l.t, (deg.get(l.t) ?? 0) + 1)
      const maxDeg = Math.max(1, ...deg.values())
      const W = Math.max(700, ...Object.values(rows).map((x) => x.length * 90))
      const P = new Map<string, { x: number; y: number }>()
      for (const [kind, ids] of Object.entries(rows))
        ids.forEach((id, i) => P.set(id, { x: ((i + 0.5) * W) / Math.max(1, ids.length), y: kind === 'alvo' ? 0 : kind === 'comum' ? 480 : 640 }))
      const els: any[] = [...nodes.values()].map((n) => ({
        data: { id: n.id, label: label(names, n.id), kind: n.kind, ...(n.kind === 'alvo' ? { big: 30 + Math.round((18 * (deg.get(n.id) ?? 0)) / maxDeg) } : {}) },
        position: P.get(n.id),
      }))
      links.forEach((l, i) => {
        const a = P.get(l.t)!
        const b = P.get(l.c)!
        const bd = badgeSvg(l.out, l.inn)
        const id = `b${i}`
        els.push({ data: { id, kind: 'badge', img: bd.img, w: bd.w, label: '' }, position: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } })
        els.push({ data: { id: `e${i}a`, source: l.t, target: id, kind: 'contato' } })
        els.push({ data: { id: `e${i}b`, source: id, target: l.c, kind: 'contato' } })
      })
      r.direct.forEach((d, i) => els.push({ data: { id: `d${i}`, source: d.a, target: d.b, kind: 'direto', w: d.msgs + d.calls } }))
      return {
        elements: els,
        layout:
          layout === 'org'
            ? { name: 'preset', padding: 30 }
            : { name: 'cose', animate: reducedMotion() ? false : 'end', animationDuration: 650, nodeRepulsion: () => 8000, padding: 30 },
      }
    },
    [r, layout, showAll],
    setName,
    names,
  )
  return (
    <GraphBox
      cy={cy}
      boxRef={box}
      title="🔗 Alvos com interlocutores em comum"
      aria="Grafo de vínculos entre alvos"
      legend={[
        { color: INV.target, label: 'alvo' },
        { color: INV.common, label: 'interlocutor em comum' },
        { color: INV.contact, label: 'contato' },
        { color: INV.direct, label: 'contato direto (nº de interações)', shape: 'line' },
        { color: '#16a34a', label: '↗ enviadas pelo alvo', shape: 'square' },
        { color: '#dc2626', label: '↙ recebidas pelo alvo', shape: 'square' },
      ]}
    >
      <button className={toggle(layout === 'rede')} onClick={() => setLayout('rede')}>
        Rede
      </button>
      <button className={toggle(layout === 'org')} onClick={() => setLayout('org')}>
        Organização
      </button>
      <label className="mt-1 flex items-center gap-1 rounded-[6px] border border-[#cfd8dc] bg-[#fff] px-1.5 py-0.5 text-[10px] text-[#546e7a]">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> todos os contatos
      </label>
    </GraphBox>
  )
}

const ipLabel = (c: Coloc) => {
  const i = c.info
  const place = i?.city ? `${i.city}${i.uf ? `/${i.uf}` : ''}` : ''
  return [c.ip, i?.org ? i.org.replace(/\s+(LTDA|S\.?A\.?|ME|EIRELI|EPP)\b.*$/i, '') : '', place, i && !isMobileNet(i) ? 'Wi-Fi / fixa' : ''].filter(Boolean).join('\n')
}

/** Diagrama da aba IPs: IP (azul) ligado aos alvos (vermelho) e interlocutores (verde) que o usaram em até 12 h. */
function IpGraph({ r, names, setName }: { r: Result; names: Names; setName: SetName }) {
  const box = useRef<HTMLDivElement>(null)
  const cy = useCy(
    box,
    () => {
      const els: any[] = []
      const nodes = new Set<string>()
      const ips = new Map<string, Coloc>()
      for (const c of r.coloc) if (!ips.has(c.ip)) ips.set(c.ip, c)
      for (const [ip, c] of ips) els.push({ data: { id: `ip:${ip}`, label: ipLabel(c), kind: 'ip' } })
      const seenEdge = new Set<string>()
      for (const c of r.coloc)
        for (const n of c.numbers) {
          if (!nodes.has(n.number)) {
            nodes.add(n.number)
            els.push({ data: { id: n.number, label: label(names, n.number), kind: n.target ? 'alvo' : 'contato' } })
          }
          const k = `${n.number}|${c.ip}`
          if (seenEdge.has(k)) continue
          seenEdge.add(k)
          els.push({ data: { id: `x${els.length}`, source: n.number, target: `ip:${c.ip}`, kind: 'ip' } })
        }
      return { elements: els, layout: { name: 'cose', animate: false, nodeRepulsion: () => 9000, idealEdgeLength: () => 90, padding: 30 } }
    },
    [r],
    setName,
    names,
  )
  return (
    <GraphBox
      cy={cy}
      boxRef={box}
      title="🌐 Alvos e interlocutores no mesmo IP (até 12 h)"
      aria="Diagrama de IPs em comum"
      legend={[
        { color: INV.target, label: 'alvo' },
        { color: INV.contact, label: 'interlocutor' },
        { color: INV.ip, label: 'IP (provedor · cidade)', shape: 'square' },
      ]}
    />
  )
}

function Ips({ r, names, setName }: { r: Result; names: Names; setName: SetName }) {
  return (
    <div className="space-y-5">
      {r.coloc.length > 0 ? (
        <IpGraph r={r} names={names} setName={setName} />
      ) : (
        <p className="text-sm text-faint">Nenhum IP usado por dois números (alvos ou interlocutores) em até 12 h.</p>
      )}
      {r.coloc.length > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-semibold text-danger"># Alvos e interlocutores que possivelmente estiveram no mesmo local</h3>
          <ul className="space-y-1.5">
            {r.coloc.slice(0, 500).map((c, i) => (
              <li key={i} className="rounded-lg border border-line bg-ink-2 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold text-white">{c.ip}</span>
                  {c.info?.org && <span className="text-xs text-muted">{c.info.org}</span>}
                  {c.info?.city && (
                    <span className="text-xs text-muted">
                      · {c.info.city}
                      {c.info.uf ? `/${c.info.uf}` : ''}
                    </span>
                  )}
                  {c.samePort && <Badge tone="red">mesma porta</Badge>}
                  <span className="ml-auto text-xs font-semibold text-amber">{c.days.length} dia(s) com coincidência</span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {c.numbers.map((n) => (
                    <li key={n.number} className="flex flex-wrap gap-2 font-mono text-xs">
                      <span className={n.target ? 'font-semibold text-danger' : 'text-ok'}>{who(names, n.number)}</span>
                      <span className="text-muted">
                        {br(n.first)}
                        {n.last !== n.first ? ` → ${br(n.last)}` : ''} · {n.n} registro(s)
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-0.5 text-[11px] text-faint">Dias: {c.days.map((d) => d.split('-').reverse().join('/')).join(', ')}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.ipHits.length > 0 && (
        <details className="rounded-lg border border-line">
          <summary className="cursor-pointer px-3 py-2 text-sm text-muted">Detalhe: registros de alvo com alvo no mesmo IP ({r.ipHits.length})</summary>
          <div className="scroll-x">
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
                      {who(names, h.a)} · {br(h.tsA)} · {h.portA ?? '—'}
                    </td>
                    <td className="font-mono text-xs">
                      {who(names, h.b)} · {br(h.tsB)} · {h.portB ?? '—'}
                    </td>
                    <td className="text-xs">
                      {Math.round(h.delta / 60000)} min {h.samePort && <Badge tone="red">mesma porta</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}

/** Nomes dos alvos (ficam só nesta análise, na memória). */
function TargetNames({ r, names, setName }: { r: Result; names: Names; setName: SetName }) {
  return (
    <section className="card p-4">
      <h2 className="mb-1 flex items-center gap-2 font-semibold text-white">
        <Pencil className="h-4 w-4 text-teal" /> Nomes dos alvos
      </h2>
      <p className="mb-3 text-xs text-muted">
        Dê um nome a cada alvo: ele aparece nos grafos, nas listas e no Excel. Nos grafos, dê duplo clique em qualquer número para nomeá-lo.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {r.targets.map((t) => (
          <label key={t} className="flex items-center gap-2 rounded-lg border border-line bg-ink-2 px-2 py-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: INV.target }} />
            <span className="shrink-0 font-mono text-xs text-white">{fmtNumber(t)}</span>
            <input
              value={names[t] ?? ''}
              onChange={(e) => setName(t, e.target.value)}
              placeholder="Nome do alvo"
              aria-label={`Nome do alvo ${fmtNumberPlain(t)}`}
              className="min-w-0 flex-1 !py-1 text-xs"
            />
          </label>
        ))}
      </div>
    </section>
  )
}

function Groups({ r, names }: { r: Result; names: Names }) {
  if (!r.sharedGroups.length) return <p className="text-sm text-faint">Nenhum grupo com mensagens de dois ou mais alvos.</p>
  return (
    <ul className="space-y-1">
      {r.sharedGroups.map((g) => (
        <li key={g.id} className="rounded-lg border border-line bg-ink-2 px-3 py-2 text-sm">
          <div className="font-mono text-xs text-white">{g.id}</div>
          <div className="mt-0.5 text-xs text-muted">
            {g.targets.length} alvos · {g.msgs} mensagens: {g.targets.map((t) => `${who(names, t)} (${g.per[t]})`).join(', ')}
          </div>
        </li>
      ))}
    </ul>
  )
}
