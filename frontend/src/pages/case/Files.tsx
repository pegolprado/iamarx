import { useQuery } from '@tanstack/react-query'
import { FileStack, ShieldCheck, Sparkles, Trash2, Upload, Wand2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useCase } from '../../app/layout'
import { GIngest } from '../../components/glyphs'
import { Badge, Empty, Field, Notice, PageHeader } from '../../components/ui'
import { q as sql } from '../../engine/db'
import { addFiles, removeFile } from '../../engine/importer'
import { importAccessLog } from '../../engine/accessLog'
import { detectWhatsApp, importWhatsApp } from '../../engine/whatsapp'
import { sha256 } from '../../engine/readers'
import { type SessionFile, setState, useSession } from '../../engine/session'
import { fmtBytes, fmtDateTime, fmtInt, shortHash } from '../../lib/format'

const STATUS_TONE: Record<string, any> = { processado: 'green', recebido: 'blue', em_processamento: 'amber', expandido: 'gray', rejeitado: 'red', nao_suportado: 'red' }

async function runWhatsApp(id: number) {
  setState({ busy: { label: 'Importando WhatsApp Records', progress: 0 } })
  try {
    const r = await importWhatsApp(id)
    toast.success(
      `WhatsApp Records de ${r.account}: ${r.messages} mensagens, ${r.calls} chamadas, ${r.ips} registros de IP${r.book ? `, ${r.book} contatos na agenda` : ''}${r.groups ? `, ${r.groups} grupos` : ''}`,
      {
        description: r.discarded ? `${r.discarded} trechos sem data/IP válidos foram ignorados.` : 'Veja a aba WhatsApp.',
        duration: 10000,
      },
    )
  } catch (e: any) {
    toast.error(`WhatsApp Records: ${e?.message ?? e}`)
  } finally {
    setState({ busy: null })
  }
}

async function runAccessLog(id: number, account: string, service: string) {
  setState({ busy: { label: 'Importando log de acesso', progress: 0 } })
  try {
    const r = await importAccessLog(id, { account: account.trim() || undefined, service: service.trim() || undefined })
    toast.success(`Log de acesso: ${r.rows} registros de IP (${r.services.join(', ')})`, {
      description: `${r.accounts.length} conta(s): ${r.accounts.slice(0, 3).join(', ')}${r.discarded ? ` · ${r.discarded} linhas sem IP/data válidos ignoradas` : ''}${r.assumedTz ? ' · horário sem fuso: considerado de Brasília' : ''}. Veja WhatsApp e IPs → Logs de acesso e IPs.`,
      duration: 12000,
    })
  } catch (e: any) {
    toast.error(`Log de acesso: ${e?.message ?? e}`)
  } finally {
    setState({ busy: null })
  }
}

export default function Files() {
  const { c, canWrite } = useCase()
  const navigate = useNavigate()
  const hasResults = useSession((x) => x.imports.some((i) => i.status === 'done' && i.kind !== 'erb_registry'))
  const files = useSession((s) => s.files)
  const imports = useSession((s) => s.imports)
  const counts = useQuery({
    queryKey: ['files-events', c.id],
    queryFn: async () => Object.fromEntries((await sql(`SELECT file_id, count(*)::INTEGER AS n FROM events WHERE NOT is_duplicate GROUP BY 1`)).map((r) => [r.file_id, r.n])),
  })
  const [kind, setKind] = useState('cdr')
  const [operator, setOperator] = useState('')
  const [account, setAccount] = useState('')
  const [service, setService] = useState('')
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const send = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      const r = await addFiles(files, kind as SessionFile['kind'], operator || null, (label) => setState({ busy: { label, progress: 0 } }))
      r.forEach((f) => f.meta?.duplicate_of && toast.warning(`${f.original_name}: conteúdo idêntico ao arquivo #${f.meta.duplicate_of} (mesmo SHA-256)`))
      toast.success(`${r.length} arquivo(s) carregado(s) na memória desta aba`)
      // WhatsApp Records (Meta) é reconhecido e importado automaticamente, sem mapeamento
      const wa: number[] = []
      for (const f of r) if (f.status === 'recebido' && (await detectWhatsApp(f.blob, f.original_name))) wa.push(f.id)
      for (const id of wa) await runWhatsApp(id)
      // log de acesso: colunas reconhecidas automaticamente, sem assistente
      const logs = kind === 'access_log' ? r.filter((f) => f.status === 'recebido' && f.detected_format !== 'zip' && !wa.includes(f.id)).map((f) => f.id) : []
      for (const id of logs) await runAccessLog(id, account, service)
      const tab = r.filter((f) => !['zip'].includes(f.detected_format) && f.status === 'recebido' && !wa.includes(f.id) && !logs.includes(f.id))
      if (tab.length === 1) navigate(`../importar/${tab[0].id}?tipo=${kind}`, { relative: 'path' })
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setState({ busy: null })
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  return (
    <div>
      <PageHeader
        icon={<FileStack className="h-5 w-5" />}
        title="Arquivos da análise"
        subtitle="Os arquivos são lidos diretamente do seu computador, nesta aba: nada é enviado a servidores nem gravado. O SHA-256 de cada original é calculado localmente e os registros normalizados mantêm o vínculo com a linha/página de origem."
        actions={
          hasResults && (
            <Link to="../completa" relative="path" className="btn-primary">
              <Sparkles className="h-4 w-4" /> Ver análise completa
            </Link>
          )
        }
      />
      {canWrite && (
        <div
          className={`card mb-6 overflow-hidden transition-[border-color,box-shadow] duration-200 ${drag ? '!border-accent shadow-[0_0_0_3px_rgba(0,217,245,0.12),0_0_40px_-12px_rgba(0,217,245,0.6)]' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            send(e.dataTransfer.files)
          }}
        >
          <div className="panel-head">
            Entrada de dados
            <span className="ml-auto flex items-center gap-1.5 normal-case">
              <ShieldCheck className="h-3.5 w-3.5 text-ok" /> leitura local · SHA-256 calculado na entrada
            </span>
          </div>
          <div className="grid lg:grid-cols-[1.15fr_1fr]">
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className={`group relative m-4 flex flex-col items-center justify-center gap-3 rounded-[10px] border border-dashed px-6 py-9 text-center transition-colors duration-200 disabled:opacity-60 ${drag ? 'border-accent bg-accent/[0.06]' : 'border-line-2 bg-[radial-gradient(circle_at_50%_20%,rgba(0,217,245,0.07),transparent_65%)] hover:border-accent/60'}`}
            >
              <span
                className={`grid h-14 w-14 place-items-center rounded-full border border-accent/35 bg-petrol text-accent shadow-[0_0_30px_-10px_rgba(0,217,245,0.9)] ${busy ? 'status-dot' : ''}`}
              >
                <GIngest className="h-7 w-7" />
              </span>
              <span className="text-[14.5px] font-semibold text-white">
                {busy ? 'Lendo arquivos…' : drag ? 'Solte para carregar' : 'Arraste os arquivos ou clique para selecionar'}
              </span>
              <span className="flex max-w-md flex-wrap justify-center gap-1">
                {['CSV', 'TXT', 'XLS', 'XLSX', 'XML', 'JSON', 'HTML', 'PDF + OCR', 'ZIP', 'WhatsApp Records'].map((x) => (
                  <span key={x} className="rounded-[4px] border border-line bg-petrol px-1.5 py-0.5 font-mono text-[10px] text-muted">
                    {x}
                  </span>
                ))}
              </span>
              <span className="text-[11.5px] text-faint">Seleção múltipla · formato e operadora identificados · duplicidades detectadas pelo SHA-256</span>
            </button>
            <div className="space-y-4 border-line p-4 lg:border-l lg:p-5">
              <Field label="Tipo de documento">
                <select className="w-full" value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="cdr">Bilhetagem / extrato de registros (CDR, ERB por evento)</option>
                  <option value="erb_registry">Cadastro técnico de ERB (células e coordenadas)</option>
                  <option value="access_log">Log de acesso (IP): Google, Meta, Apple, provedores…</option>
                  <option value="other">Documento complementar</option>
                </select>
              </Field>
              {kind === 'access_log' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Conta do alvo (se não vier no arquivo)">
                    <input className="w-full" value={account} placeholder="e-mail, usuário ou telefone" onChange={(e) => setAccount(e.target.value)} />
                  </Field>
                  <Field label="Serviço (opcional)">
                    <input className="w-full" value={service} placeholder="detectar (Google, Instagram…)" onChange={(e) => setService(e.target.value)} />
                  </Field>
                </div>
              ) : (
                <Field label="Operadora informada (opcional)">
                  <select className="w-full" value={operator} onChange={(e) => setOperator(e.target.value)}>
                    <option value="">detectar / informar depois</option>
                    {['TIM', 'VIVO', 'CLARO', 'OI', 'ALGAR', 'OUTRA'].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </Field>
              )}
              <input
                ref={input}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => send(e.target.files)}
                accept=".csv,.txt,.tsv,.xls,.xlsx,.xml,.json,.zip,.pdf,.html,.htm,.dat,.prn"
              />
              <button className="btn-primary w-full" disabled={busy} onClick={() => input.current?.click()}>
                <Upload className="h-4 w-4" /> {busy ? 'Lendo…' : 'Selecionar arquivos'}
              </button>
              <p className="text-[11.5px] leading-relaxed text-faint">
                TXT delimitado ou de largura fixa, PDF de texto ou digitalizado (OCR) e WhatsApp Records da Meta (records.html ou o ZIP recebido), reconhecido automaticamente.
                Depois de carregar, cada arquivo passa pelo assistente: pré-visualização, mapeamento, validação e confirmação antes de importar.
              </p>
            </div>
          </div>
        </div>
      )}
      {files.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-4">
          {(
            [
              ['Arquivos', files.length, ''],
              ['Processados', files.filter((f) => f.status === 'processado').length, 'text-ok'],
              ['Aguardando importação', files.filter((f) => f.status === 'recebido').length, 'text-accent'],
              [
                'Duplicados / com erro',
                files.filter((f) => f.meta?.duplicate_of || f.meta?.error || f.status === 'rejeitado' || f.status === 'nao_suportado').length,
                'text-amber',
              ],
            ] as const
          ).map(([k, v, tone]) => (
            <div key={k} className="bg-panel px-4 py-3">
              <div className="font-mono text-[10px] tracking-[0.06em] text-faint uppercase">{k}</div>
              <div className={`mt-1 font-mono text-[20px] tabular-nums ${v ? tone || 'text-white' : 'text-faint'}`}>{fmtInt(v)}</div>
            </div>
          ))}
        </div>
      )}
      {files.length === 0 ? (
        <Empty title="Nenhum arquivo">Selecione as bilhetagens e os cadastros de ERB recebidos das operadoras. Eles não sairão do seu computador.</Empty>
      ) : (
        <>
          <Notice>
            A identificação de operadora é um indício com nível de confiança; confirme no assistente de importação. Um mesmo layout pode variar conforme o tipo de requisição e o
            sistema de origem.
          </Notice>
          <div className="card scroll-x mt-4">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Arquivo</th>
                  <th>Tipo</th>
                  <th>Formato</th>
                  <th>Operadora</th>
                  <th>Tamanho</th>
                  <th>SHA-256</th>
                  <th>Carregado</th>
                  <th>Situação</th>
                  <th className="text-right">Registros</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id} className={f.parent_id ? 'text-muted' : ''}>
                    <td className="font-mono text-xs">{f.id}</td>
                    <td className="max-w-xs break-all">
                      {f.parent_id ? '↳ ' : ''}
                      {f.original_name}
                      {f.meta?.duplicate_of && <div className="text-xs text-amber">idêntico ao #{f.meta.duplicate_of}</div>}
                      {f.meta?.error && <div className="text-xs text-danger">{f.meta.error}</div>}
                    </td>
                    <td className="text-xs">
                      {f.kind === 'erb_registry'
                        ? 'cadastro ERB'
                        : f.kind === 'cdr'
                          ? 'bilhetagem'
                          : f.kind === 'whatsapp'
                            ? 'WhatsApp Records'
                            : f.kind === 'access_log'
                              ? 'log de acesso (IP)'
                              : 'complementar'}
                    </td>
                    <td className="font-mono text-xs uppercase">{f.detected_format}</td>
                    <td className="text-xs">
                      {f.operator_declared ?? '—'}
                      {f.operator_detected && (
                        <div className="text-faint">
                          detectado: {f.operator_detected} ({Math.round((f.operator_confidence ?? 0) * 100)}%)
                        </div>
                      )}
                    </td>
                    <td className="text-xs whitespace-nowrap">{fmtBytes(f.size_bytes)}</td>
                    <td className="font-mono text-[11px] text-faint" title={f.sha256}>
                      {shortHash(f.sha256)}
                    </td>
                    <td className="text-xs whitespace-nowrap">{fmtDateTime(f.received_at, false)}</td>
                    <td>
                      <Badge tone={STATUS_TONE[f.status] ?? 'gray'}>{f.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="text-right tabular-nums">{fmtInt(counts.data?.[f.id] ?? 0)}</td>
                    <td>
                      <div className="flex gap-1">
                        {canWrite && f.kind === 'whatsapp' && (
                          <button className="btn-ghost !px-2 !py-1 text-xs" title="Reimportar WhatsApp Records" onClick={() => runWhatsApp(f.id)}>
                            <Wand2 className="h-3.5 w-3.5" /> Reimportar
                          </button>
                        )}
                        {canWrite && f.kind === 'access_log' && (
                          <button className="btn-ghost !px-2 !py-1 text-xs" title="Reimportar log de acesso" onClick={() => runAccessLog(f.id, account, service)}>
                            <Wand2 className="h-3.5 w-3.5" /> Reimportar
                          </button>
                        )}
                        {canWrite &&
                          f.kind !== 'whatsapp' &&
                          f.kind !== 'access_log' &&
                          !['zip'].includes(f.detected_format) &&
                          f.status !== 'nao_suportado' &&
                          f.status !== 'rejeitado' && (
                            <Link to={`../importar/${f.id}?tipo=${f.kind}`} relative="path" className="btn-ghost !px-2 !py-1 text-xs" title="Configurar importação">
                              <Wand2 className="h-3.5 w-3.5" /> {imports.some((i) => i.file_id === f.id && i.status === 'done') ? 'Reimportar' : 'Importar'}
                            </Link>
                          )}
                        <button
                          className="btn-ghost !px-2 !py-1"
                          title="Verificar integridade (recalcula o SHA-256)"
                          onClick={async () => {
                            const h = await sha256(f.blob)
                            if (h === f.sha256) toast.success('Íntegro: SHA-256 confere com o calculado no carregamento')
                            else toast.error('ALTERADO: o SHA-256 atual não confere!')
                          }}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                        </button>
                        {canWrite && !f.parent_id && (
                          <button
                            className="btn-ghost !px-2 !py-1 hover:!text-danger"
                            title="Remover arquivo e seus registros da análise"
                            onClick={async () => {
                              if (!confirm(`Remover ${f.original_name} e os registros dele desta análise?`)) return
                              try {
                                await removeFile(f.id)
                              } catch (e: any) {
                                toast.error(e.message)
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
