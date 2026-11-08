import clsx from 'clsx'
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  Download,
  FileText,
  Globe2,
  Home,
  MapPin,
  MessageCircle,
  Phone,
  Server,
  ShieldAlert,
  Smartphone,
  Trophy,
  Users,
  Wifi,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../../app/auth'
import { Badge, Notice } from '../../components/ui'
import { loadIpdb, lookupIp } from '../../engine/ipdb'
import { type BFile, individual, localTs, tzLabel } from '../../engine/waBilling'
import { loadWaFiles } from '../../engine/waFiles'
import { fmtNumber, fmtNumberPlain } from '../../lib/format'
import { downloadXlsx } from '../../lib/xlsxBook'
import { Dropzone, Extracts, Indicator, Needed, Purpose, ToolTitle } from './common'
import { OrganizeFiles } from './Organize'

const br = (ms: number | null | undefined) => (ms ? localTs(ms).replace(/^(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1') : '—')
type Result = ReturnType<typeof individual>

/** Bilhetagem do WhatsApp — análise individual de um alvo (até 15 arquivos diários). */
export default function WaBilling() {
  const { me } = useAuth()
  const [files, setFiles] = useState<File[]>([])
  const [loaded, setLoaded] = useState<BFile[] | null>(null)
  const [account, setAccount] = useState('')
  const [res, setRes] = useState<Result | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [noGeo, setNoGeo] = useState(false)
  // nome dado ao alvo (só nesta análise, na memória)
  const [alias, setAlias] = useState<Record<string, string>>({})

  const analyze = async (bf: BFile[], acc: string) => {
    setBusy('Consultando provedores e cidades dos IPs…')
    let lookup = null
    try {
      const db = await loadIpdb()
      lookup = (ip: string) => lookupIp(db, ip)
      setNoGeo(false)
    } catch {
      setNoGeo(true)
    }
    setRes(individual(acc, bf, lookup))
    setAccount(acc)
    setBusy(null)
  }
  const run = async () => {
    try {
      setBusy('Lendo os arquivos…')
      const r = await loadWaFiles(files, (s) => setBusy(s))
      if (!r.files.length) {
        setBusy(null)
        return toast.error('Nenhum arquivo de bilhetagem do WhatsApp reconhecido.')
      }
      if (r.skipped.length) toast.warning(`${r.skipped.length} arquivo(s) não reconhecido(s) como bilhetagem do WhatsApp foram ignorados.`)
      setLoaded(r.files)
      const counts = new Map<string, number>()
      for (const f of r.files) counts.set(f.account!, (counts.get(f.account!) ?? 0) + 1)
      const acc = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      if (counts.size > 1) toast.info(`Os arquivos têm ${counts.size} alvos diferentes; analisando ${fmtNumberPlain(acc)}. Troque no seletor ou use a análise de vínculos.`)
      await analyze(r.files, acc)
    } catch (e: any) {
      setBusy(null)
      toast.error(`Falha ao processar: ${e?.message ?? e}`)
    }
  }
  const reset = () => {
    setRes(null)
    setLoaded(null)
    setFiles([])
  }

  if (!res)
    return (
      <div>
        <ToolTitle icon={<FileText />} title="Bilhetagem WhatsApp" />
        <Purpose>
          Processa os arquivos de bilhetagem diária do WhatsApp de um alvo (até 15 arquivos) e analisa os metadados de mensagens e chamadas: identifica os interlocutores mais
          frequentes, os endereços de IP por período, os provedores e cidades dos IPs, o uso de VPN e os interlocutores que compartilharam a mesma rede, indicando possível
          proximidade física.
        </Purpose>
        <Extracts
          items={[
            ['Message Log', <MessageCircle key="i" />],
            ['Call Log', <Phone key="i" />],
            ['Principais interlocutores', <Users key="i" />],
            ['IPs, provedores e cidades', <Globe2 key="i" />],
            ['Estatísticas avançadas', <BarChart3 key="i" />],
          ]}
        />
        <OrganizeFiles onUse={(f) => setFiles(f)} />
        <Needed items={['Bilhetagem WhatsApp — até 15 arquivos (HTML ou ZIP)']} />
        <Dropzone
          title="Upload de bilhetagem WhatsApp"
          hint="Envie até 15 arquivos HTML (ou ZIP) com registros de bilhetagem do WhatsApp de um único alvo."
          accept=".html,.htm,.zip,.txt"
          max={15}
          files={files}
          onFiles={setFiles}
          onRun={run}
          runLabel="Processar e analisar dados"
          busy={busy}
        />
      </div>
    )

  const r = res
  const accounts = [...new Set((loaded ?? []).map((f) => f.account!))]
  const exportXlsx = () =>
    downloadXlsx(
      `INVMARX_bilhetagem_${r.account.replace(/\D/g, '')}.xlsx`,
      [
        {
          name: 'Resumo',
          columns: ['Campo', 'Valor'],
          rows: [
            ['Alvo', fmtNumberPlain(r.account)],
            ['Nome do alvo', alias[r.account] ?? ''],
            ['Caso (ticket)', r.tickets.join(', ')],
            ['Período', `${br(r.period?.[0])} a ${br(r.period?.[1])} (horário de Brasília)`],
            ['Arquivos', r.files],
            ['Mensagens', r.msgs.length],
            ['Chamadas', r.calls.length],
            ['Interlocutores', r.interlocutors.length],
            ['Grupos', r.groups.length],
            ['Uso de VPN (% dos IPs do alvo)', Math.round(r.vpnPct)],
            ['Gerado por', me?.name ?? ''],
          ],
        },
        {
          name: 'Interlocutores',
          columns: ['Número', 'Mensagens', 'Enviadas', 'Recebidas', 'Chamadas', 'Total', 'Primeiro', 'Último'],
          rows: r.interlocutors.map((i) => [fmtNumberPlain(i.number), i.msgs, i.sent, i.received, i.calls, i.total, br(i.first), br(i.last)]),
        },
        {
          name: 'Proximidade física',
          columns: ['Número', 'IP', 'Horário alvo', 'Porta alvo', 'Horário interlocutor', 'Porta interlocutor', 'Mesma porta', 'Diferença (min)'],
          rows: r.proximity.flatMap((p) =>
            p.hits.map((h) => [fmtNumberPlain(p.number), h.ip, br(h.tsTarget), h.portTarget, br(h.tsOther), h.portOther, h.samePort ? 'sim' : 'não', Math.round(h.delta / 60000)]),
          ),
        },
        {
          name: 'IPs do alvo',
          columns: ['Data/hora', 'Fuso', 'IP', 'Porta', 'Origem', 'Provedor', 'ASN', 'Cidade', 'UF', 'País'],
          rows: r.targetObs.map((o) => [br(o.ts), tzLabel(o.ts), o.ip, o.port, o.source, o.info.org, o.info.asn, o.info.city, o.info.uf, o.info.country]),
        },
        {
          name: 'Mensagens',
          columns: ['Data/hora', 'De', 'Para', 'Grupo', 'Tipo', 'IP', 'Porta', 'Aparelho', 'ID'],
          rows: r.msgs.map((m) => [br(m.ts), fmtNumberPlain(m.from), m.to.map(fmtNumberPlain).join(', '), m.group, m.type, m.ip, m.port, m.device, m.id]),
        },
        {
          name: 'Chamadas',
          columns: ['Data/hora', 'Quem ligou', 'Participantes', 'Mídia', 'Atendida', 'Duração (s)', 'ID'],
          rows: r.calls.map((c) => [br(c.ts), fmtNumberPlain(c.creator), c.parts.map(fmtNumberPlain).join(', '), c.media, c.answered ? 'sim' : 'não', c.dur, c.id]),
        },
      ],
      'Horários no fuso de Brasília. Provedor e cidade estimados pela base IPtoASN/DB-IP. Gerado pelo MARX (INVMARX).',
    )

  return (
    <div className="space-y-4">
      <ToolTitle icon={<FileText />} title="Bilhetagem WhatsApp">
        <button className="btn-ghost" onClick={reset}>
          Nova análise
        </button>
      </ToolTitle>
      <div className="card flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
        <CalendarDays className="h-4 w-4 text-accent" /> <b className="text-accent">Período dos registros:</b> {br(r.period?.[0])} – {br(r.period?.[1])}
        {accounts.length > 1 && (
          <select className="ml-2" value={account} onChange={(e) => loaded && analyze(loaded, e.target.value)} aria-label="Alvo">
            {accounts.map((a) => (
              <option key={a} value={a}>
                {fmtNumber(a)}
                {alias[a] ? ` — ${alias[a]}` : ''}
              </option>
            ))}
          </select>
        )}
        <button className="btn-ghost ml-auto !py-1 text-xs" onClick={exportXlsx}>
          <Download className="h-3.5 w-3.5 text-ok" /> Exportar análise
        </button>
      </div>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold text-accent">Resumo da análise</h2>
        <p className="text-sm">
          <b>Caso:</b> <span className="font-mono">{r.tickets.join(', ') || '—'}</span>
        </p>
        <p className="text-sm">
          <b>Alvo:</b> <span className="font-mono">{fmtNumber(r.account)}</span> · {r.files} arquivo(s)
        </p>
        <label className="mt-1 flex max-w-sm items-center gap-2 text-sm">
          <b>Nome:</b>
          <input
            value={alias[r.account] ?? ''}
            onChange={(e) => setAlias((m) => ({ ...m, [r.account]: e.target.value }))}
            placeholder="Nome do alvo (opcional)"
            aria-label="Nome do alvo"
            className="min-w-0 flex-1 !py-1 text-sm"
          />
        </label>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Indicator label="Mensagens" value={r.msgs.length} icon={<MessageCircle />} />
          <Indicator label="Chamadas" value={r.calls.length} icon={<Phone />} />
          <Indicator label="Interlocutores" value={r.interlocutors.length} icon={<Users />} />
          <Indicator label="Grupos" value={r.groups.length} icon={<Users />} />
          <Indicator label="Uso de VPN" value={`${Math.round(r.vpnPct)}%`} icon={<ShieldAlert />} />
        </div>
      </section>

      {noGeo && <Notice tone="amber">A base de provedores/cidades não carregou; o restante da análise está completo. Recarregue a página para tentar de novo.</Notice>}

      <Proximity r={r} />

      <section className="card space-y-5 p-4">
        <h2 className="flex items-center gap-2 font-semibold text-white">
          <BarChart3 className="h-4 w-4 text-ok" /> Análise inteligente de bilhetagem
        </h2>
        <Ranking
          icon={<Trophy className="h-4 w-4 text-gold" />}
          title="Ranking geral de provedores (alvo)"
          hint="Provedores com mais ocorrências de IPs do alvo."
          items={r.providers}
          empty="Sem IPs do alvo nos arquivos."
          unit="ocorrências"
        />
        <Ranking
          icon={<Home className="h-4 w-4 text-ok" />}
          title="Análise de internet residencial (alvo)"
          hint="Provedores com mais IPs durante o período noturno (23h–6h) em conexões fixas (não 4G/5G)."
          items={r.residential.slice(0, 3)}
          empty="Nenhum IP noturno em conexão fixa."
          unit="ocorrências"
          tone="green"
        />
        {r.recentRes.length > 0 && (
          <RecentIps title="IPs mais recentes — internet residencial" icon={<Wifi className="h-4 w-4" />} provider={r.residential[0]?.name} items={r.recentRes} />
        )}
        <Ranking
          icon={<Smartphone className="h-4 w-4 text-violet" />}
          title="Análise de operadora móvel (alvo)"
          hint="Operadoras com mais IPs do alvo em rede móvel (4G/5G). IPv4 móvel é compartilhado (CGNAT): só IP, porta e horário exatos identificam o usuário."
          items={r.mobile.slice(0, 3)}
          empty="Nenhum IP de operadora móvel."
          unit="ocorrências"
        />
        {r.recentMobile.length > 0 && (
          <RecentIps title="IPs mais recentes — operadora móvel" icon={<Smartphone className="h-4 w-4" />} provider={r.mobile[0]?.name} items={r.recentMobile} />
        )}
        <Ranking
          icon={<MapPin className="h-4 w-4 text-teal" />}
          title="Cidades do alvo"
          hint="Cidades com mais ocorrências de IPs (aproximação pela base de IPs; pode indicar a sede do provedor)."
          items={r.cities.slice(0, 5)}
          empty="Sem IPs do alvo."
          unit="ocorrências"
          tone="green"
        />
        <div>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-violet">
            <Users className="h-4 w-4" /> Interlocutores mais comuns
          </h3>
          <p className="mb-2 text-xs text-muted">Contatos com maior número de interações com o alvo (grupos não entram).</p>
          <ol className="space-y-1">
            {r.interlocutors.slice(0, 30).map((i, k) => (
              <li key={i.number} className="flex items-center gap-2 rounded-lg border border-violet/30 bg-violet/5 px-3 py-1.5 text-sm">
                <span className="grid h-5 w-5 place-items-center rounded bg-violet/30 text-[10px] font-bold">{k + 1}</span>
                <span className="font-mono text-white">{fmtNumber(i.number)}</span>
                <span className="ml-auto flex gap-3 text-xs text-muted">
                  <span title="mensagens">
                    <MessageCircle className="mr-0.5 inline h-3 w-3" />
                    {i.msgs}
                  </span>
                  <span title="chamadas">
                    <Phone className="mr-0.5 inline h-3 w-3" />
                    {i.calls}
                  </span>
                  <span className="font-semibold text-text">{i.total} total</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <Ranking
          icon={<Server className="h-4 w-4 text-amber" />}
          title="Grupos"
          hint="Grupos em que o alvo trocou mensagens no período."
          items={r.groups.map((g) => ({ name: g, n: r.msgs.filter((m) => m.group === g).length }))}
          empty="Nenhuma mensagem em grupo."
          unit="mensagens"
        />
      </section>
      <Notice tone="amber">
        Provedor e cidade são estimados por bases públicas de IP (IPtoASN; IP Geolocation by DB-IP — db-ip.com, CC BY 4.0): a cidade pode ser a do provedor. IPv4 de operadora móvel
        é compartilhado (CGNAT): só IP, porta e horário exatos identificam o usuário junto ao provedor.
      </Notice>
    </div>
  )
}

function RecentIps({ title, icon, provider, items }: { title: string; icon: React.ReactNode; provider?: string; items: Result['recentRes'] }) {
  return (
    <div>
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-accent">
        {icon} {title}
      </h3>
      <p className="mb-2 text-xs text-muted">Provedor: {provider}</p>
      <div className="scroll-x rounded-lg border border-line">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Endereço de IP</th>
              <th>Porta lógica</th>
              <th>Data/hora</th>
              <th>Fuso</th>
              <th>Cidade</th>
            </tr>
          </thead>
          <tbody>
            {items.map((o, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td className="font-mono text-xs">{o.ip}</td>
                <td className="font-mono text-xs">{o.port ?? '—'}</td>
                <td className="font-mono text-xs">{br(o.ts)}</td>
                <td className="text-xs">{tzLabel(o.ts)}</td>
                <td className="text-xs">{o.info.city ? `${o.info.city}/${o.info.uf ?? ''}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Ranking({
  icon,
  title,
  hint,
  items,
  empty,
  unit,
  tone = 'blue',
}: {
  icon: React.ReactNode
  title: string
  hint: string
  items: { name: string; n: number }[]
  empty: string
  unit: string
  tone?: 'blue' | 'green'
}) {
  return (
    <div>
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-accent">
        {icon} {title}
      </h3>
      <p className="mb-2 text-xs text-muted">{hint}</p>
      {!items.length ? (
        <p className="text-xs text-faint">{empty}</p>
      ) : (
        <ol className="divide-y divide-line rounded-lg border border-line">
          {items.slice(0, 5).map((x, i) => (
            <li key={x.name} className={clsx('flex items-center gap-3 px-3 py-2 text-sm', i === 0 && tone === 'green' && 'bg-ok/5')}>
              <span className="w-5 text-center font-bold text-muted">{i + 1}</span>
              <span className="font-medium text-white">{x.name}</span>
              <Badge tone={tone === 'green' ? 'green' : 'blue'} className="ml-auto">
                {x.n} {unit}
              </Badge>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function Proximity({ r }: { r: Result }) {
  const [open, setOpen] = useState<string | null>(null)
  const list = useMemo(() => r.proximity, [r])
  return (
    <section className="card border-amber/50 bg-amber/5 p-4">
      <h2 className="flex items-center gap-2 font-semibold text-amber">
        <MapPin className="h-4 w-4" /> Proximidade física detectada
      </h2>
      <p className="mt-1 mb-3 text-xs text-muted">
        Números que usaram o mesmo IP que o alvo em até 12 h: possível presença no mesmo local ou mesma conexão. Mesma porta = mesma conexão; IPv4 com portas diferentes pode ser só
        a mesma operadora (CGNAT).
      </p>
      {!list.length ? (
        <p className="text-sm text-faint">Nenhum interlocutor usou o mesmo IP que o alvo no período.</p>
      ) : (
        <ul className="space-y-1">
          {list.map((p) => (
            <li key={p.number} className="rounded-lg border border-line bg-ink-2">
              <button className="flex w-full items-center gap-2 px-3 py-2 text-left" onClick={() => setOpen(open === p.number ? null : p.number)} aria-expanded={open === p.number}>
                <span className="font-mono text-sm text-white">{fmtNumber(p.number)}</span>
                {p.strong && <Badge tone="red">forte</Badge>}
                <Badge tone="amber" className="ml-auto">
                  {p.hits.length} coincidência{p.hits.length > 1 ? 's' : ''}
                </Badge>
                <ChevronDown className={clsx('h-4 w-4 transition-transform', open === p.number && 'rotate-180')} />
              </button>
              {open === p.number && (
                <div className="scroll-x border-t border-line">
                  <table>
                    <thead>
                      <tr>
                        <th>IP</th>
                        <th>Alvo (horário · porta)</th>
                        <th>Interlocutor (horário · porta)</th>
                        <th>Diferença</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.hits.map((h, i) => (
                        <tr key={i}>
                          <td className="font-mono text-xs">{h.ip}</td>
                          <td className="font-mono text-xs">
                            {br(h.tsTarget)} · {h.portTarget ?? '—'}
                          </td>
                          <td className="font-mono text-xs">
                            {br(h.tsOther)} · {h.portOther ?? '—'}
                          </td>
                          <td className="text-xs">
                            {Math.round(h.delta / 60000)} min {h.samePort && <Badge tone="red">mesma porta</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
