import { CheckCircle2, Delete, Download, FileText, MapPin, Radio, RefreshCw, Search, Signal, Smartphone, Upload, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Notice } from '../../components/ui'
import { type OperadoraBase, type PhoneInfo, lookupOperadora, parseAnatelSmp, parsePhone, prettyOperadora, tgLink, waLink } from '../../engine/operadora'
import { idbDel, idbGet, idbSet } from '../../lib/idb'
import { ToolTitle } from '../invmarx/common'

const BASE_KEY = 'anatel-smp-v1'
// mantém a base em memória entre navegações de abas (evita reprocessar)
let memoBase: OperadoraBase | null = null

/** Lê os bytes de um arquivo .zip (ANATEL) ou .txt e devolve o texto (latin-1). */
async function readSmpText(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const dec = new TextDecoder('windows-1252')
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const { unzipSync } = await import('fflate')
    const files = unzipSync(buf, { filter: (f) => /\.txt$/i.test(f.name) })
    const name = Object.keys(files)[0]
    if (!name) throw new Error('O .zip não contém um arquivo .txt da ANATEL.')
    return dec.decode(files[name])
  }
  return dec.decode(buf)
}

export default function Operadora() {
  const [tab, setTab] = useState<'individual' | 'lote'>('individual')
  const [base, setBase] = useState<OperadoraBase | null>(memoBase)
  const [loading, setLoading] = useState(!memoBase)

  // ao abrir, tenta recuperar a base guardada no navegador (IndexedDB)
  useEffect(() => {
    if (memoBase) return setLoading(false)
    let alive = true
    ;(async () => {
      const text = await idbGet<string>(BASE_KEY)
      if (alive && text) {
        try {
          memoBase = parseAnatelSmp(text)
          if (alive) setBase(memoBase)
        } catch {
          /* ignora base inválida */
        }
      }
      if (alive) setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [])

  const setBaseAll = (b: OperadoraBase | null) => {
    memoBase = b
    setBase(b)
  }

  return (
    <div className="space-y-4">
      <ToolTitle icon={<Radio />} title="MarxOperadora — consulta de número" />
      <p className="max-w-3xl text-[13.5px] text-muted">
        Identifica DDD, região/UF e tipo (móvel/fixo) de qualquer número brasileiro, no próprio navegador. A <b className="text-text">operadora de origem</b> aparece quando você
        carrega a base pública da ANATEL (abaixo). Portabilidade pode ter mudado a operadora da faixa — o resultado é indicativo.
      </p>

      <OperadoraBaseLoader base={base} loading={loading} onBase={setBaseAll} />

      <div className="grid max-w-md grid-cols-2 rounded-lg border border-line bg-ink-2 p-1 text-sm" role="tablist">
        {(
          [
            ['individual', 'Consulta individual'],
            ['lote', 'Consulta em lote'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-md py-1.5 font-medium transition-colors ${tab === id ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'individual' ? <Individual base={base} /> : <Lote base={base} />}

      <Notice tone="amber">
        WhatsApp e Telegram: não fazemos a checagem automática de “tem conta / foto” — isso exige um servidor com acesso não-oficial a esses apps, fere os termos deles e expõe
        dados de terceiros. Use os links para abrir o número no WhatsApp/Telegram manualmente. Operadora depende da base ANATEL e pode diferir da atual por portabilidade. Nada é
        enviado nem guardado.
      </Notice>
    </div>
  )
}

function OperadoraBaseLoader({ base, loading, onBase }: { base: OperadoraBase | null; loading: boolean; onBase: (b: OperadoraBase | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const load = async (files: FileList) => {
    setBusy(true)
    try {
      // GERAL primeiro, depois os incrementais (por nome/data); aplica um sobre o outro
      const sorted = [...files].sort((a, b) => (a.name.includes('GERAL') ? -1 : b.name.includes('GERAL') ? 1 : a.name.localeCompare(b.name)))
      const texts: string[] = []
      let acc: OperadoraBase | undefined
      for (const f of sorted) {
        const text = await readSmpText(f)
        texts.push(text)
        acc = parseAnatelSmp(text, acc)
      }
      if (!acc || !acc.count) throw new Error('Nenhuma faixa válida encontrada (confira se é o arquivo SMP da ANATEL).')
      onBase(acc)
      await idbSet(BASE_KEY, texts.join('\n'))
      toast.success(`Base ANATEL carregada: ${acc.count.toLocaleString('pt-BR')} faixas, ${acc.ops.length} operadoras. Fica salva no navegador.`)
    } catch (e: any) {
      toast.error(`Não foi possível ler a base: ${e?.message ?? e}`)
    } finally {
      setBusy(false)
    }
  }
  const remove = () => {
    onBase(null)
    idbDel(BASE_KEY)
  }
  return (
    <div className="card flex flex-wrap items-center gap-3 p-3 text-sm">
      <Signal className="h-4 w-4 shrink-0 text-accent" />
      {loading ? (
        <span className="text-muted">Recuperando a base salva…</span>
      ) : base ? (
        <span className="text-ok">
          Base ANATEL ativa · {base.count.toLocaleString('pt-BR')} faixas · {base.ops.length} operadoras.{' '}
          <span className="text-faint">Operadora = origem da faixa (pode ter mudado por portabilidade).</span>
        </span>
      ) : (
        <span className="text-muted">
          Para ver a operadora, carregue a base pública da ANATEL (arquivo SMP — .zip ou .txt — de dados abertos). Fica salva no navegador; sem ela, mostramos DDD/região/tipo.
        </span>
      )}
      <button className="btn-ghost ml-auto !py-1.5 text-xs" onClick={() => input.current?.click()} disabled={busy || loading}>
        {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 text-accent" />} {base ? 'Atualizar base' : 'Carregar base ANATEL (.zip/.txt)'}
      </button>
      {base && (
        <button className="btn-ghost !py-1.5 text-xs" onClick={remove}>
          Remover
        </button>
      )}
      <input ref={input} type="file" accept=".zip,.txt" multiple className="hidden" onChange={(e) => (e.target.files?.length && load(e.target.files), (e.target.value = ''))} />
    </div>
  )
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']

function Individual({ base }: { base: OperadoraBase | null }) {
  const [num, setNum] = useState('')
  const [res, setRes] = useState<PhoneInfo | null>(null)
  const press = (k: string) => setNum((n) => (n + k).slice(0, 14))
  const consult = () => {
    const p = parsePhone(num)
    setRes(p)
    if (!p.valid) toast.error(p.erro ?? 'Número inválido.')
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <div className="mx-auto max-w-xs">
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-line bg-ink-2 px-3 py-2">
            <span aria-hidden>🇧🇷</span>
            <input
              value={num}
              onChange={(e) => setNum(e.target.value)}
              placeholder="(11) 99999-0000"
              aria-label="Número"
              inputMode="tel"
              className="min-w-0 flex-1 border-0 !bg-transparent p-0 font-mono text-lg !shadow-none outline-none"
            />
            <button aria-label="Apagar" onClick={() => setNum((n) => n.slice(0, -1))} className="text-muted hover:text-text">
              <Delete className="h-5 w-5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((k) => (
              <button
                key={k}
                onClick={() => press(k)}
                className="aspect-[2/1] rounded-xl border border-line bg-ink-2 text-xl font-semibold text-white transition-colors hover:border-accent/60 hover:bg-accent/5"
              >
                {k}
              </button>
            ))}
          </div>
          <button className="btn-primary mt-3 w-full" onClick={consult}>
            <Search className="h-4 w-4" /> Consultar número
          </button>
        </div>
      </div>
      <div>
        {res ? (
          <Resultado p={res} base={base} />
        ) : (
          <div className="card flex h-full items-center justify-center p-8 text-sm text-faint">O resultado aparece aqui após a consulta.</div>
        )}
      </div>
    </div>
  )
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-ink-2 px-3 py-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5 text-accent [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] tracking-wide text-faint uppercase">{label}</div>
        <div className="text-sm font-medium text-white">{children}</div>
      </div>
    </div>
  )
}

function Resultado({ p, base }: { p: PhoneInfo; base: OperadoraBase | null }) {
  const oper = prettyOperadora(lookupOperadora(base, p))
  const wa = waLink(p)
  const tg = tgLink(p)
  return (
    <section className="card space-y-2 p-4">
      <div className="flex items-center gap-2">
        {p.valid ? <CheckCircle2 className="h-5 w-5 text-ok" /> : <XCircle className="h-5 w-5 text-danger" />}
        <h2 className="font-semibold text-white">{p.valid ? p.pretty : 'Número inválido'}</h2>
        {p.valid && <span className="ml-auto font-mono text-xs text-faint">{p.e164}</span>}
      </div>
      {!p.valid ? (
        <p className="text-sm text-danger">{p.erro}</p>
      ) : (
        <>
          <Row icon={<Radio />} label="Operadora (origem da faixa · SMP)">
            {oper ? (
              <>
                {oper} {p.tipo === 'movel' && <span className="text-xs text-faint">· Móvel (SMP)</span>}
              </>
            ) : (
              <span className="text-faint">{!base ? 'carregue a base ANATEL' : p.tipo !== 'movel' ? 'base SMP cobre só celulares' : 'faixa não encontrada'}</span>
            )}
          </Row>
          <Row icon={<Smartphone />} label="Tipo">
            {p.tipo === 'movel' ? 'Celular (móvel)' : 'Telefone fixo'}
          </Row>
          <Row icon={<MapPin />} label="Região / DDD">
            ({p.ddd}) {p.ufName} · {p.regiao}
          </Row>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <a href={wa!} target="_blank" rel="noopener noreferrer" className="btn-ghost !py-2 text-xs">
              Abrir no WhatsApp
            </a>
            <a href={tg!} target="_blank" rel="noopener noreferrer" className="btn-ghost !py-2 text-xs">
              Abrir no Telegram
            </a>
          </div>
          <p className="pt-1 text-[11px] text-faint">Os links abrem o número no app (não confirmam se há conta). Operadora pode diferir da atual por portabilidade.</p>
        </>
      )}
    </section>
  )
}

function Lote({ base }: { base: OperadoraBase | null }) {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<{ p: PhoneInfo; oper: string | null }[] | null>(null)
  const run = () => {
    const list = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 500)
    if (!list.length) return toast.error('Cole ao menos um número.')
    setRows(list.map((l) => ({ p: parsePhone(l), oper: null })).map((r) => ({ ...r, oper: lookupOperadora(base, r.p) })))
  }
  const exportCsv = () => {
    if (!rows) return
    const head = ['Numero', 'Valido', 'E164', 'DDD', 'UF', 'Regiao', 'Tipo', 'Operadora (origem)']
    const body = rows.map((r) => [r.p.input, r.p.valid ? 'sim' : 'não', r.p.e164 ?? '', r.p.ddd ?? '', r.p.uf ?? '', r.p.regiao ?? '', r.p.tipo ?? '', r.oper ?? ''])
    const csv = [head, ...body].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `MarxOperadora_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  const ok = rows?.filter((r) => r.p.valid).length ?? 0
  return (
    <div className="space-y-3">
      <div className="card p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
          <FileText className="h-4 w-4 text-accent" /> Números de telefone
        </h2>
        <p className="mb-2 text-xs text-muted">Cole um número por linha (até 500).</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={'(11) 99999-0000\n(21) 98888-0000\n(31) 98765-4321'}
          aria-label="Números"
          className="w-full resize-y font-mono text-sm"
        />
        <div className="mt-2 flex gap-2">
          <button className="btn-primary flex-1" onClick={run}>
            <Search className="h-4 w-4" /> Consultar números
          </button>
          {rows && (
            <button className="btn-ghost" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5 text-ok" /> Exportar CSV
            </button>
          )}
        </div>
      </div>
      {rows && (
        <div className="card p-4">
          <div className="mb-2 text-xs text-muted">
            {rows.length} números · {ok} válidos{base ? '' : ' · (sem base: operadora não exibida)'}
          </div>
          <div className="scroll-x rounded-lg border border-line">
            <table>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Tipo</th>
                  <th>DDD · UF · Região</th>
                  <th>Operadora (origem)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono text-xs">{r.p.valid ? r.p.pretty : <span className="text-danger">{r.p.input || '—'}</span>}</td>
                    <td className="text-xs">{r.p.tipo === 'movel' ? 'Móvel' : r.p.tipo === 'fixo' ? 'Fixo' : '—'}</td>
                    <td className="text-xs">{r.p.valid ? `(${r.p.ddd}) ${r.p.uf} · ${r.p.regiao}` : '—'}</td>
                    <td className="text-xs">{r.oper ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
