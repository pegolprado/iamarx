import { useQuery } from '@tanstack/react-query'
import { MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCase } from '../../app/layout'
import { ExportButtons } from '../../components/Export'
import { FilterBar } from '../../components/FilterBar'
import { Badge, Criteria, DrillLink, Empty, ErrorBox, Loading, Notice, Num, PageHeader, Stat, Tabs } from '../../components/ui'
import { contacts } from '../../engine/analytics'
import {
  bookCommon,
  bookContacts,
  groupsInfo,
  ipList,
  ipSequence,
  sharedGroupMembers,
  sharedIps,
  waAccounts,
  waEventFilter,
  waGroups,
  waProfiles,
  waSummary,
} from '../../engine/whatsapp'
import { date, int, num, nums } from '../../components/columns'
import { ResultTable } from '../../components/ResultTable'
import { useSession } from '../../engine/session'
import { fmtDateTime, fmtDuration, fmtInt, fmtNumber, fmtNumberPlain } from '../../lib/format'
import { useUrlFilter } from '../../lib/useUrlFilter'

type Tab = 'resumo' | 'cadastro' | 'contatos' | 'agenda' | 'ips' | 'ips_comuns' | 'sequencia' | 'grupos'

export default function WhatsApp() {
  const [sp] = useSearchParams()
  const [tab, setTab] = useState<Tab>((sp.get('aba') as Tab) || 'resumo')
  const hasWa = useSession((s) => s.imports.some((i) => i.kind === 'whatsapp' && i.status === 'done'))
  const [f, setF] = useUrlFilter()
  return (
    <div>
      <PageHeader
        icon={<MessageCircle className="h-5 w-5" />}
        title="WhatsApp Records"
        subtitle="Relatórios fornecidos pela Meta (registro de mensagens, chamadas e conexões). Horários convertidos de UTC para o horário de Brasília. O conteúdo das mensagens não faz parte desses relatórios — apenas os metadados."
      />
      {!hasWa ? (
        <Empty title="Nenhum WhatsApp Records carregado">
          Em{' '}
          <Link className="text-accent hover:underline" to="../arquivos" relative="path">
            Arquivos
          </Link>
          , selecione o <b>records.html</b> ou o <b>ZIP</b> recebido da Meta: ele é reconhecido e importado automaticamente.
        </Empty>
      ) : (
        <>
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            items={[
              { value: 'resumo', label: 'Resumo' },
              { value: 'cadastro', label: 'Dados cadastrais' },
              { value: 'contatos', label: 'Contatos' },
              { value: 'agenda', label: 'Agenda' },
              { value: 'ips', label: 'IPs' },
              { value: 'ips_comuns', label: 'IPs em comum' },
              { value: 'sequencia', label: 'Sequência de IPs' },
              { value: 'grupos', label: 'Grupos' },
            ]}
          />
          <FilterBar value={f} onChange={setF} compact />
          {tab === 'resumo' && <Summary f={f} />}
          {tab === 'cadastro' && <Profile />}
          {tab === 'contatos' && <Contacts f={f} />}
          {tab === 'agenda' && <Book f={f} />}
          {tab === 'ips' && <Ips f={f} />}
          {tab === 'ips_comuns' && <SharedIps f={f} />}
          {tab === 'sequencia' && <Sequence f={f} />}
          {tab === 'grupos' && (
            <div className="space-y-4">
              <Groups f={f} />
              <GroupsCadastro />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Summary({ f }: { f: any }) {
  const { c } = useCase()
  const acc = useQuery({ queryKey: ['wa-accounts', c.id], queryFn: waAccounts })
  const s = useQuery({ queryKey: ['wa-summary', c.id, f], queryFn: () => waSummary(f) as Promise<any> })
  if (s.isLoading) return <Loading />
  if (s.error) return <ErrorBox error={s.error} />
  const t = s.data.totals
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Mensagens enviadas / recebidas"
          value={`${fmtInt(t.sent)} / ${fmtInt(t.received)}`}
          hint={`${fmtInt(t.contacts)} interlocutores · ${fmtInt(t.groups)} grupos`}
        />
        <Stat label="Chamadas" value={fmtInt(t.calls)} hint={`${fmtInt(t.calls_answered)} atendidas · ${fmtInt(t.video_calls)} de vídeo`} />
        <Stat label="IPs distintos do alvo" value={fmtInt(t.ips)} hint={`${fmtInt(t.connections)} registros de conexão · ${fmtInt(t.devices)} tipos de aparelho`} />
        <Stat label="Período" value={<span className="text-base">{t.first_event ? `${fmtDateTime(t.first_event, false)} → ${fmtDateTime(t.last_event, false)}` : '—'}</span>} />
      </div>
      <section className="card scroll-x p-4">
        <h2 className="section-title mb-3 text-muted">Relatórios carregados</h2>
        <table>
          <thead>
            <tr>
              <th>Conta</th>
              <th>Chamado (ticket)</th>
              <th>Período do relatório</th>
              <th>Gerado em</th>
              <th className="text-right">Mensagens</th>
              <th className="text-right">Chamadas</th>
              <th className="text-right">IPs</th>
              <th className="text-right">Ignorados</th>
            </tr>
          </thead>
          <tbody>
            {(acc.data ?? []).map((a: any) => (
              <tr key={a.import_id}>
                <td>
                  <Num n={a.account} caseId={c.id} />
                </td>
                <td className="font-mono text-xs">{a.header?.['internal ticket number'] ?? '—'}</td>
                <td className="text-xs">{a.header?.['date range'] ?? '—'}</td>
                <td className="text-xs">{a.header?.generated ?? '—'}</td>
                <td className="text-right tabular-nums">{fmtInt(a.messages)}</td>
                <td className="text-right tabular-nums">{fmtInt(a.calls)}</td>
                <td className="text-right tabular-nums">{fmtInt(a.ips)}</td>
                <td className="text-right tabular-nums">{fmtInt(a.discarded)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="section-title mb-3 text-muted">Tipos de mensagem</h2>
          <table>
            <tbody>
              {s.data.media.map((m: any) => (
                <tr key={m.media}>
                  <td>{m.media}</td>
                  <td className="text-right tabular-nums">{fmtInt(m.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card p-4">
          <h2 className="section-title mb-3 text-muted">Aparelhos informados</h2>
          {s.data.devices.length === 0 ? (
            <p className="text-sm text-faint">Não informado nos relatórios.</p>
          ) : (
            <table>
              <tbody>
                {s.data.devices.map((d: any) => (
                  <tr key={d.device + d.target_number}>
                    <td>
                      <Badge>{d.device}</Badge>
                    </td>
                    <td>
                      <Num n={d.target_number} />
                    </td>
                    <td className="text-right tabular-nums">{fmtInt(d.n)}</td>
                    <td className="text-xs whitespace-nowrap">
                      {fmtDateTime(d.first_event, false)} → {fmtDateTime(d.last_event, false)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
      <Notice>
        Os relatórios trazem metadados (quem, quando, IP, tipo), nunca o conteúdo das conversas. O IP de mensagens <b>recebidas</b> é do remetente e por isso não é atribuído ao
        alvo.
      </Notice>
    </div>
  )
}

function Contacts({ f }: { f: any }) {
  const { c } = useCase()
  const ff = waEventFilter({
    ...f,
    event_types: (f.event_types ?? []).length ? f.event_types : ['wa_msg_enviada', 'wa_msg_recebida', 'wa_chamada_originada', 'wa_chamada_recebida'],
  })
  const q = useQuery({ queryKey: ['wa-contacts', c.id, ff], queryFn: () => contacts(ff, 500) as Promise<any> })
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
  return (
    <div className="card scroll-x p-3">
      <div className="mb-2 flex justify-end">
        <ExportButtons
          build={() => ({
            title: 'WhatsApp — contatos',
            columns: [
              { key: 'target_number', label: 'Alvo', fmt: (v) => fmtNumberPlain(v) },
              { key: 'other_number', label: 'Interlocutor', fmt: (v) => fmtNumberPlain(v) },
              { key: 'events', label: 'Registros' },
              { key: 'days', label: 'Dias' },
              { key: 'outgoing', label: 'Enviados/originados' },
              { key: 'incoming', label: 'Recebidos' },
              { key: 'first_event', label: 'Primeiro', fmt: (v) => fmtDateTime(v) },
              { key: 'last_event', label: 'Último', fmt: (v) => fmtDateTime(v) },
              { key: 'reciprocal', label: 'Recíproco', fmt: (v) => (v ? 'sim' : 'não') },
            ],
            rows: q.data.items,
            criteria: q.data.criteria,
          })}
        />
      </div>
      <table>
        <thead>
          <tr>
            <th>Alvo</th>
            <th>Interlocutor</th>
            <th className="text-right">Registros</th>
            <th className="text-right">Dias</th>
            <th className="text-right">Env./orig.</th>
            <th className="text-right">Receb.</th>
            <th>Primeiro → último</th>
            <th>Reciprocidade</th>
          </tr>
        </thead>
        <tbody>
          {q.data.items.map((r: any) => (
            <tr key={r.target_number + r.other_number}>
              <td>
                <Num n={r.target_number} />
              </td>
              <td>
                <Num n={r.other_number} caseId={c.id} />
              </td>
              <td className="text-right tabular-nums">
                <DrillLink caseId={c.id} filter={{ ...ff, targets: [r.target_number], others: [r.other_number] }}>
                  {fmtInt(r.events)}
                </DrillLink>
              </td>
              <td className="text-right tabular-nums">{r.days}</td>
              <td className="text-right tabular-nums">{r.outgoing}</td>
              <td className="text-right tabular-nums">{r.incoming}</td>
              <td className="text-xs whitespace-nowrap">
                {fmtDateTime(r.first_event, false)} → {fmtDateTime(r.last_event, false)}
              </td>
              <td>{r.reciprocal ? <Badge tone="teal">recíproca</Badge> : <Badge>unidirecional</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Criteria criteria={q.data.criteria} />
    </div>
  )
}

function Ips({ f }: { f: any }) {
  const { c } = useCase()
  const q = useQuery({ queryKey: ['ips', c.id, f], queryFn: () => ipList(f) as Promise<any> })
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
  return (
    <div className="card scroll-x p-3">
      <div className="mb-2 flex justify-end">
        <ExportButtons
          build={() => ({
            title: 'IPs dos alvos',
            subtitle: 'WhatsApp e sessões de dados das operadoras',
            columns: [
              { key: 'ip', label: 'IP' },
              { key: 'version', label: 'Versão' },
              { key: 'events', label: 'Registros' },
              { key: 'days', label: 'Dias' },
              { key: 'first_event', label: 'Primeiro uso', fmt: (v) => fmtDateTime(v) },
              { key: 'last_event', label: 'Último uso', fmt: (v) => fmtDateTime(v) },
              { key: 'ports', label: 'Portas' },
              { key: 'targets', label: 'Alvos', fmt: (v) => (v ?? []).map(fmtNumberPlain).join('; ') },
              { key: 'sources', label: 'Fonte' },
            ],
            rows: q.data.items,
            criteria: q.data.criteria,
          })}
        />
      </div>
      {q.data.items.length === 0 ? (
        <Empty title="Nenhum IP nos registros" />
      ) : (
        <table>
          <thead>
            <tr>
              <th>IP</th>
              <th>Versão</th>
              <th className="text-right">Registros</th>
              <th className="text-right">Dias</th>
              <th>Primeiro → último uso</th>
              <th>Portas</th>
              <th>Alvos</th>
              <th>Fonte</th>
            </tr>
          </thead>
          <tbody>
            {q.data.items.map((r: any) => (
              <tr key={r.ip}>
                <td className="font-mono text-xs">
                  <DrillLink caseId={c.id} filter={{ ...f, ip: r.ip }}>
                    {r.ip}
                  </DrillLink>
                </td>
                <td className="text-xs">{r.version}</td>
                <td className="text-right tabular-nums">{fmtInt(r.events)}</td>
                <td className="text-right tabular-nums">{r.days}</td>
                <td className="text-xs whitespace-nowrap">
                  {fmtDateTime(r.first_event)} → {fmtDateTime(r.last_event)}
                </td>
                <td className="max-w-40 truncate font-mono text-xs" title={(r.ports ?? []).join(', ')}>
                  {(r.ports ?? []).slice(0, 4).join(', ')}
                  {(r.ports ?? []).length > 4 ? '…' : ''}
                </td>
                <td className="text-xs">{(r.targets ?? []).map((t: string) => fmtNumber(t)).join(', ')}</td>
                <td className="text-xs">{(r.sources ?? []).map((s: string) => (s === 'whatsapp' ? 'WhatsApp' : 'operadora')).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Criteria criteria={q.data.criteria} />
    </div>
  )
}

function SharedIps({ f }: { f: any }) {
  const { c } = useCase()
  const q = useQuery({ queryKey: ['shared-ips', c.id, f], queryFn: () => sharedIps(f) as Promise<any> })
  const gm = useQuery({ queryKey: ['shared-group-members', c.id, f], queryFn: () => sharedGroupMembers(f) })
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
  const flat = q.data.items.flatMap((it: any) => it.per_target.map((p: any) => ({ ip: it.ip, targets: it.targets, ...p })))
  return (
    <div className="space-y-4">
      <div className="card scroll-x p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="section-title text-muted">IPs usados por mais de um alvo</h2>
          <ExportButtons
            build={() => ({
              title: 'IPs em comum entre alvos',
              columns: [
                { key: 'ip', label: 'IP' },
                { key: 'targets', label: 'Nº de alvos' },
                { key: 'target_number', label: 'Alvo', fmt: (v) => fmtNumberPlain(v) },
                { key: 'n', label: 'Registros' },
                { key: 'first_event', label: 'Primeiro uso', fmt: (v) => fmtDateTime(v) },
                { key: 'last_event', label: 'Último uso', fmt: (v) => fmtDateTime(v) },
                { key: 'ports', label: 'Portas' },
              ],
              rows: flat,
              criteria: q.data.criteria,
            })}
          />
        </div>
        {q.data.items.length === 0 ? (
          <p className="p-2 text-sm text-faint">Nenhum IP compartilhado entre os alvos no período e filtros selecionados.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>IP</th>
                <th>Alvo</th>
                <th className="text-right">Registros</th>
                <th>Primeiro → último uso</th>
                <th>Portas</th>
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((it: any) =>
                it.per_target.map((p: any, i: number) => (
                  <tr key={it.ip + p.target_number} className={i === 0 ? 'border-t-2 border-line-2' : ''}>
                    <td className="font-mono text-xs">{i === 0 ? it.ip : ''}</td>
                    <td>
                      <Num n={p.target_number} caseId={c.id} />
                    </td>
                    <td className="text-right tabular-nums">
                      <DrillLink caseId={c.id} filter={{ ...f, ip: it.ip, targets: [p.target_number] }}>
                        {fmtInt(p.n)}
                      </DrillLink>
                    </td>
                    <td className="text-xs whitespace-nowrap">
                      {fmtDateTime(p.first_event)} → {fmtDateTime(p.last_event)}
                    </td>
                    <td className="font-mono text-xs">{(p.ports ?? []).slice(0, 4).join(', ')}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        )}
        <Criteria criteria={q.data.criteria} />
      </div>
      {(gm.data ?? []).length > 0 && (
        <div className="card p-3">
          <h2 className="section-title mb-2 text-muted">Participantes presentes em grupos de mais de um alvo</h2>
          <table>
            <tbody>
              {gm.data!.map((r) => (
                <tr key={r.member}>
                  <td>
                    <Num n={r.member} caseId={c.id} />
                  </td>
                  <td className="text-xs">{r.targets.map((t) => fmtNumber(t)).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Sequence({ f }: { f: any }) {
  const { c } = useCase()
  const q = useQuery({ queryKey: ['ip-seq', c.id, f], queryFn: () => ipSequence(f) as Promise<any> })
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
  return (
    <div className="card scroll-x p-3">
      <div className="mb-2 flex justify-end">
        <ExportButtons
          build={() => ({
            title: 'Sequência de IPs',
            columns: [
              { key: 'target_number', label: 'Alvo', fmt: (v) => fmtNumberPlain(v) },
              { key: 'ip', label: 'IP' },
              { key: 'from', label: 'De', fmt: (v) => fmtDateTime(v) },
              { key: 'until', label: 'Até', fmt: (v) => fmtDateTime(v) },
              { key: 'events', label: 'Registros' },
            ],
            rows: q.data.items,
            criteria: q.data.criteria,
          })}
        />
      </div>
      <table>
        <thead>
          <tr>
            <th>Alvo</th>
            <th>IP</th>
            <th>De</th>
            <th>Até</th>
            <th className="text-right">Duração aparente</th>
            <th className="text-right">Registros</th>
          </tr>
        </thead>
        <tbody>
          {q.data.items.map((r: any, i: number) => (
            <tr key={i}>
              <td>
                <Num n={r.target_number} />
              </td>
              <td className="font-mono text-xs">{r.ip}</td>
              <td className="text-xs whitespace-nowrap">{fmtDateTime(r.from)}</td>
              <td className="text-xs whitespace-nowrap">{fmtDateTime(r.until)}</td>
              <td className="text-right font-mono text-xs">{fmtDuration(Math.round((Date.parse(r.until + 'Z') - Date.parse(r.from + 'Z')) / 1000))}</td>
              <td className="text-right tabular-nums">{r.events}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Criteria criteria={q.data.criteria} />
    </div>
  )
}

function Groups({ f }: { f: any }) {
  const { c } = useCase()
  const q = useQuery({ queryKey: ['wa-groups', c.id, f], queryFn: () => waGroups(f) as Promise<any> })
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
  return (
    <div className="card scroll-x p-3">
      <div className="mb-2 flex justify-end">
        <ExportButtons
          build={() => ({
            title: 'WhatsApp — grupos',
            columns: [
              { key: 'group_id', label: 'Grupo' },
              { key: 'target_number', label: 'Alvo', fmt: (v) => fmtNumberPlain(v) },
              { key: 'messages', label: 'Mensagens' },
              { key: 'sent', label: 'Enviadas' },
              { key: 'received', label: 'Recebidas' },
              { key: 'first_event', label: 'Primeira', fmt: (v) => fmtDateTime(v) },
              { key: 'last_event', label: 'Última', fmt: (v) => fmtDateTime(v) },
              { key: 'members', label: 'Participantes vistos', fmt: (v) => (v ?? []).map(fmtNumberPlain).join('; ') },
            ],
            rows: q.data.items,
            criteria: q.data.criteria,
          })}
        />
      </div>
      {q.data.items.length === 0 ? (
        <Empty title="Nenhuma mensagem de grupo nos registros" />
      ) : (
        <table>
          <thead>
            <tr>
              <th>Grupo</th>
              <th>Alvo</th>
              <th className="text-right">Mensagens</th>
              <th className="text-right">Env.</th>
              <th className="text-right">Receb.</th>
              <th>Primeira → última</th>
              <th>Participantes vistos</th>
            </tr>
          </thead>
          <tbody>
            {q.data.items.map((r: any) => (
              <tr key={r.group_id + r.target_number}>
                <td className="max-w-56 font-mono text-xs break-all">{r.group_id}</td>
                <td>
                  <Num n={r.target_number} />
                </td>
                <td className="text-right tabular-nums">{fmtInt(r.messages)}</td>
                <td className="text-right tabular-nums">{fmtInt(r.sent)}</td>
                <td className="text-right tabular-nums">{fmtInt(r.received)}</td>
                <td className="text-xs whitespace-nowrap">
                  {fmtDateTime(r.first_event, false)} → {fmtDateTime(r.last_event, false)}
                </td>
                <td className="text-xs">
                  {r.members.length} ·{' '}
                  {r.members
                    .slice(0, 6)
                    .map((m: string) => fmtNumber(m))
                    .join(', ')}
                  {r.members.length > 6 ? '…' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Criteria criteria={q.data.criteria} />
    </div>
  )
}

const HEADER_LABEL: Record<string, string> = {
  service: 'Serviço',
  'internal ticket number': 'Chamado (ticket)',
  'account identifier': 'Conta',
  'account type': 'Tipo de conta',
  generated: 'Gerado em',
  'date range': 'Período do relatório',
  target: 'Alvo',
  'connection state': 'Estado da conexão',
  'last seen': 'Visto por último',
  'device type': 'Tipo de aparelho',
  'app version': 'Versão do app',
  'device os build number': 'Sistema do aparelho',
  'device manufacturer': 'Fabricante',
  'device model': 'Modelo',
  'os version': 'Versão do sistema',
  'last ip': 'Último IP',
  'online since': 'On-line desde',
}

/** Dados cadastrais de cada conta: cabeçalho do relatório, Connection/Device/Web Info e e-mails. */
function Profile() {
  const list = waProfiles()
  const rows = list.flatMap((p) => [
    ...Object.entries(p.header)
      .filter(([, v]) => v)
      .map(([k, v]) => ({ account: p.account, section: 'Relatório', label: HEADER_LABEL[k] ?? k, value: v })),
    ...p.profile.map((x) => ({ account: p.account, section: x.section, label: x.label, value: x.value })),
    ...p.emails.map((e) => ({ account: p.account, section: 'E-mails', label: 'E-mail registrado', value: e })),
    { account: p.account, section: 'Agenda', label: 'Contatos simétricos / assimétricos', value: `${p.book_symmetric} / ${p.book_asymmetric}` },
    { account: p.account, section: 'Grupos', label: 'Grupos no cadastro', value: String(p.groups_info) },
  ])
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => (
          <section key={p.import_id} className="card p-4 text-sm">
            <div className="mb-2 font-mono text-base text-white">
              <Num n={p.account} />
            </div>
            <dl className="space-y-1">
              {[...p.profile.filter((x) => /push name|name|device|app version|os|last seen|connection state|service start|platform|version/i.test(x.label)).slice(0, 10)].map(
                (x, i) => (
                  <div key={i} className="flex justify-between gap-3 border-b border-line/50 pb-1">
                    <dt className="text-muted">{x.label}</dt>
                    <dd className="text-right text-white">{x.value}</dd>
                  </div>
                ),
              )}
              {p.emails.map((e) => (
                <div key={e} className="flex justify-between gap-3 border-b border-line/50 pb-1">
                  <dt className="text-muted">E-mail</dt>
                  <dd className="text-right break-all text-white">{e}</dd>
                </div>
              ))}
            </dl>
            {!p.profile.length && !p.emails.length && <p className="text-xs text-faint">O relatório não trouxe dados cadastrais além do cabeçalho.</p>}
          </section>
        ))}
      </div>
      <ResultTable
        title="WhatsApp — dados cadastrais"
        subtitle="Todos os campos identificados nos relatórios, por conta."
        columns={[num('account', 'Conta'), { key: 'section', label: 'Seção' }, { key: 'label', label: 'Campo' }, { key: 'value', label: 'Valor' }]}
        rows={rows}
        pageSize={100}
      />
    </div>
  )
}

/** Agenda (Address Book): contatos salvos, comunicação com cada um e cruzamento entre alvos. */
function Book({ f }: { f: any }) {
  const { c } = useCase()
  const b = useQuery({ queryKey: ['wa-book', c.id, f], queryFn: () => bookContacts(f) })
  const cm = useQuery({ queryKey: ['wa-book-common', c.id], queryFn: bookCommon })
  if (b.isLoading || cm.isLoading) return <Loading />
  if (b.error || cm.error) return <ErrorBox error={b.error ?? cm.error} />
  if (!b.data!.items.length) return <Empty title="Os relatórios carregados não trazem agenda (Address Book)" />
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {b.data!.totals.map((t: any) => (
          <Stat
            key={t.account}
            label={`Agenda de ${fmtNumber(t.account)}`}
            value={fmtInt(t.symmetric + t.asymmetric)}
            hint={`${fmtInt(t.symmetric)} simétricos · ${fmtInt(t.asymmetric)} assimétricos`}
          />
        ))}
      </div>
      <ResultTable
        title="Alvos salvos na agenda de outro alvo"
        columns={[num('account', 'Agenda de'), num('contact', 'Alvo salvo'), { key: 'kind', label: 'Tipo' }]}
        rows={cm.data!.targets_in_books}
        empty="Nenhum alvo encontrado na agenda de outro alvo."
      />
      <ResultTable
        title="Contatos na agenda de mais de um alvo"
        columns={[
          num('contact', 'Contato'),
          int('accounts', 'Agendas'),
          nums('in_books', 'Na agenda de'),
          { key: 'kinds', label: 'Tipos', fmt: (v) => (v ?? []).join(', ') },
          { key: 'is_target', label: 'É alvo', fmt: (v) => (v ? 'sim' : 'não') },
        ]}
        rows={cm.data!.shared}
        criteria={cm.data!.criteria}
        empty="Carregue o WhatsApp Records de dois ou mais alvos para cruzar as agendas."
      />
      <ResultTable
        title="WhatsApp — agenda"
        subtitle="Contatos salvos e a comunicação registrada com cada um (mensagens e chamadas no período). Contatos sem nenhum registro também são informação."
        columns={[
          num('account', 'Conta'),
          num('contact', 'Contato'),
          { key: 'kind', label: 'Tipo' },
          { key: 'is_target', label: 'É alvo', fmt: (v) => (v ? 'sim' : 'não'), render: (r) => (r.is_target ? <Badge tone="red">alvo</Badge> : '') },
          int('events', 'Registros'),
          date('first_event', 'Primeiro'),
          date('last_event', 'Último'),
        ]}
        rows={b.data!.items}
        criteria={b.data!.criteria}
      />
    </div>
  )
}

function GroupsCadastro() {
  const { c } = useCase()
  const q = useQuery({ queryKey: ['wa-groups-info', c.id], queryFn: groupsInfo })
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
  return (
    <>
      <ResultTable
        title="Grupos em comum entre alvos (cadastro)"
        columns={[
          { key: 'subject', label: 'Grupo', fmt: (v, r) => v ?? r.group_id },
          { key: 'group_id', label: 'ID' },
          int('size', 'Tamanho'),
          int('accounts', 'Alvos'),
          nums('members', 'Alvos no grupo'),
          nums('owners', 'Administrador/criador'),
        ]}
        rows={q.data!.common}
        empty="Nenhum grupo em comum no cadastro (Groups Info)."
      />
      <ResultTable
        title="WhatsApp — grupos no cadastro (Groups Info)"
        subtitle="Grupos que a conta criou ou de que participa, mesmo sem mensagens no período."
        columns={[
          num('account', 'Conta'),
          { key: 'subject', label: 'Assunto' },
          { key: 'group_id', label: 'ID' },
          { key: 'kind', label: 'Papel' },
          { key: 'creation', label: 'Criado em (UTC)' },
          int('size', 'Tamanho'),
          { key: 'description', label: 'Descrição' },
        ]}
        rows={q.data!.items}
        criteria={q.data!.criteria}
        empty="Os relatórios carregados não trazem a seção Groups Info."
      />
    </>
  )
}
