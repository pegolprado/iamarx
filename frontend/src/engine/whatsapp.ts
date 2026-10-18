/**
 * WhatsApp Records — relatórios fornecidos pela Meta às autoridades (records.html, normalmente
 * dentro de um ZIP): registro de mensagens (Message Log), chamadas (Call Logs) e conexões (IP).
 *
 * O leitor transforma o documento em uma sequência de textos e reconhece os rótulos conhecidos
 * ("Timestamp", "Sender", "Recipients", "Sender Ip", "Call Id"…), sem depender do HTML exato —
 * o formato varia entre versões. Valores inválidos (datas, números) são descartados e contados.
 * Horários vêm em UTC no documento e são convertidos para o fuso escolhido (fuso CONFIRMADO).
 */
import { criteria, type EventFilter, where } from './analytics'
import { csvCell, exec, insertCsv, q, q1 } from './db'
import { recomputeDuplicates, syncTargetsTable } from './importer'
import { normalizeNumber, quickHash, RULES_VERSION, tzOffsetMs } from './normalize'
import { getState, type ImportRec, nextId, nowIso, setState, updateFile, updateImport } from './session'
import { stripAccents } from './text'

// ---------------------------------------------------------------- leitura

type Section = 'header' | 'messages' | 'calls' | 'ips' | 'other' | 'ignore'

const SECTIONS: Record<string, Section> = {
  'message log': 'messages',
  'messages log': 'messages',
  'call logs': 'calls',
  'call log': 'calls',
  'ip addresses': 'ips',
  'ip address log': 'ips',
  'connection info': 'ips',
  'connection information': 'ips',
}
const OTHER_SECTIONS = ['groups', 'group info', 'address book', 'book', 'ncmec reports', 'emails', 'registered email addresses', 'devices', 'device info', 'profile picture', 'about', 'status']

const HEADER_LABELS = ['service', 'internal ticket number', 'target', 'account identifier', 'account type', 'generated', 'date range', 'registered email addresses', 'connection state', 'last seen', 'device type', 'app version', 'device os build number', 'device manufacturer', 'device model', 'os version', 'last ip', 'online since']
const MSG_LABELS = ['timestamp', 'message id', 'sender', 'recipients', 'recipient', 'group id', 'sender ip', 'sender port', 'sender device', 'type', 'message style', 'message size']
const CALL_LABELS = ['call id', 'call creator', 'events', 'type', 'timestamp', 'from', 'to', 'from ip', 'from port', 'media type', 'participants', 'phone number', 'state', 'platform']
const IP_LABELS = ['time', 'timestamp', 'ip address', 'ip', 'port']

const norm = (s: string) => stripAccents(s).toLowerCase().replace(/[:\s]+/g, ' ').trim()
const ALL_LABELS = [...new Set([...HEADER_LABELS, ...MSG_LABELS, ...CALL_LABELS, ...IP_LABELS])].sort((a, b) => b.length - a.length)

export type WaMessage = { ts: number; tsRaw: string; id: string | null; sender: string | null; recipients: string[]; group: string | null; senderIp: string | null; senderPort: string | null; device: string | null; type: string | null; style: string | null; size: string | null }
export type WaCallEvent = { type: string | null; ts: number | null; from: string | null; to: string | null; fromIp: string | null; fromPort: string | null; media: string | null }
export type WaCall = { id: string | null; creator: string | null; ts: number; tsRaw: string; events: WaCallEvent[]; participants: string[] }
export type WaIp = { ts: number; tsRaw: string; ip: string; port: string | null }
export type WaRecords = { header: Record<string, string>; account: string | null; messages: WaMessage[]; calls: WaCall[]; ips: WaIp[]; discarded: number }

/** Data/hora UTC do documento → milissegundos (aceita "2024-03-01 10:15:00 UTC" e ISO). */
export function parseWaTs(s: string | null | undefined): number | null {
  if (!s) return null
  const m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s)
  if (!m) return null
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))
  const d = new Date(ms)
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[4] < 24 ? ms : null
}

const IP_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]*:[0-9a-f:.]+)$/i
const cleanIp = (s: string | null | undefined) => {
  const v = (s ?? '').trim().replace(/^\[|\]$/g, '')
  return v && IP_RE.test(v) ? v.toLowerCase() : null
}

/** Extrai a sequência de textos de um HTML (ou linhas de um TXT). */
export function tokenize(content: string, isHtml: boolean): string[] {
  const out: string[] = []
  const push = (t: string) => {
    const v = t.replace(/\s+/g, ' ').trim()
    if (!v) return
    // "Label: valor" ou "Labelvalor" no mesmo texto → separa (rótulos e nomes de seção inteiros ficam como estão)
    const low = norm(v)
    if (SECTIONS[low] || OTHER_SECTIONS.includes(low) || ALL_LABELS.includes(low) || low.endsWith(' definition')) {
      out.push(v)
      return
    }
    for (const l of ALL_LABELS) {
      if (!low.startsWith(l) || low.length === l.length) continue
      if (!/^[:\s]|^\d|^\+/.test(low.slice(l.length))) continue
      const m = new RegExp(`^${l.replace(/ /g, '\\s+')}\\s*:?\\s*`, 'i').exec(v)
      if (m && m[0].length < v.length) {
        out.push(v.slice(0, m[0].length).replace(/[:\s]+$/, ''), v.slice(m[0].length))
        return
      }
    }
    out.push(v)
  }
  if (isHtml) {
    const doc = new DOMParser().parseFromString(content, 'text/html')
    doc.querySelectorAll('script,style,noscript').forEach((n) => n.remove())
    const walker = doc.createTreeWalker(doc.body ?? doc.documentElement, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) push(n.nodeValue ?? '')
  } else for (const line of content.split(/\r?\n/)) push(line)
  return out
}

export function looksLikeWhatsApp(text: string): boolean {
  const t = text.slice(0, 2_000_000)
  return /(message log|call logs)/i.test(t) && /(account identifier|whatsapp|internal ticket number)/i.test(t)
}

export function parseWhatsApp(content: string, isHtml = /<\s*(html|div|table|body)/i.test(content)): WaRecords {
  const toks = tokenize(content, isHtml)
  const header: Record<string, string> = {}
  const messages: WaMessage[] = []
  const calls: WaCall[] = []
  const ips: WaIp[] = []
  let discarded = 0
  let section: Section = 'header'
  let label: string | null = null

  type Rec = Record<string, string[]>
  let msg: Rec | null = null
  let call: { rec: Rec; events: Rec[]; ev: Rec | null; inEvents: boolean; participants: string[] } | null = null
  let ip: Rec | null = null

  const first = (r: Rec | null | undefined, k: string) => (r?.[k]?.length ? r[k].join(' ').trim() : null)

  const flushMsg = () => {
    if (!msg) return
    const tsRaw = first(msg, 'timestamp')
    const ts = parseWaTs(tsRaw)
    if (ts === null) discarded++
    else
      messages.push({
        ts, tsRaw: tsRaw!, id: first(msg, 'message id'), sender: first(msg, 'sender'),
        recipients: [...(msg['recipients'] ?? []), ...(msg['recipient'] ?? [])].flatMap((x) => x.split(/[,;\s]+/)).filter((x) => /\d{6,}/.test(x)),
        group: first(msg, 'group id'), senderIp: cleanIp(first(msg, 'sender ip')), senderPort: first(msg, 'sender port'), device: first(msg, 'sender device'),
        type: first(msg, 'type'), style: first(msg, 'message style'), size: first(msg, 'message size'),
      })
    msg = null
  }
  const flushEvent = () => {
    if (call?.ev && Object.keys(call.ev).length) call.events.push(call.ev)
    if (call) call.ev = null
  }
  const flushCall = () => {
    if (!call) return
    flushEvent()
    const evs: WaCallEvent[] = call.events.map((e) => ({
      type: first(e, 'type'), ts: parseWaTs(first(e, 'timestamp')), from: first(e, 'from'), to: first(e, 'to'),
      fromIp: cleanIp(first(e, 'from ip')), fromPort: first(e, 'from port'), media: first(e, 'media type'),
    }))
    const tsRaw = first(call.rec, 'timestamp') ?? call.events.map((e) => first(e, 'timestamp')).find(Boolean) ?? null
    const times = [parseWaTs(first(call.rec, 'timestamp')), ...evs.map((e) => e.ts)].filter((x): x is number => x !== null)
    if (!times.length) discarded++
    else calls.push({ id: first(call.rec, 'call id'), creator: first(call.rec, 'call creator'), ts: Math.min(...times), tsRaw: tsRaw ?? '', events: evs, participants: call.participants })
    call = null
  }
  const flushIp = () => {
    if (!ip) return
    const tsRaw = first(ip, 'time') ?? first(ip, 'timestamp')
    const ts = parseWaTs(tsRaw)
    const addr = cleanIp(first(ip, 'ip address') ?? first(ip, 'ip'))
    if (ts === null || !addr) discarded++
    else ips.push({ ts, tsRaw: tsRaw!, ip: addr, port: first(ip, 'port') })
    ip = null
  }
  const flushAll = () => {
    flushMsg()
    flushCall()
    flushIp()
  }

  for (const tok of toks) {
    const low = norm(tok)
    if (SECTIONS[low]) {
      flushAll()
      section = SECTIONS[low]
      label = null
      continue
    }
    if (low.endsWith(' definition') || low.endsWith(' definitions')) {
      flushAll()
      section = 'ignore'
      label = null
      continue
    }
    if (OTHER_SECTIONS.includes(low)) {
      flushAll()
      section = 'other'
      label = null
      continue
    }
    if (section === 'ignore' || section === 'other') continue

    if (section === 'header' && HEADER_LABELS.includes(low)) {
      label = low
      header[label] = ''
      continue
    }
    if (section === 'messages' && MSG_LABELS.includes(low)) {
      if (!msg) msg = {}
      if ((low === 'timestamp' && msg['timestamp']) || (low === 'message id' && msg['message id'])) {
        flushMsg()
        msg = {}
      }
      label = low
      msg[label] ??= []
      continue
    }
    if (section === 'calls' && CALL_LABELS.includes(low)) {
      if (low === 'call id') {
        flushCall()
        call = { rec: {}, events: [], ev: null, inEvents: false, participants: [] }
      }
      call ??= { rec: {}, events: [], ev: null, inEvents: false, participants: [] }
      if (low === 'events') {
        call.inEvents = true
        label = null
        continue
      }
      if (low === 'participants') {
        label = 'participants'
        continue
      }
      if (call.inEvents && low === 'type') {
        flushEvent()
        call.ev = {}
      }
      label = low
      const target = call.inEvents && !['call id', 'call creator', 'phone number', 'state', 'platform'].includes(low) ? (call.ev ??= {}) : call.rec
      target[label] ??= []
      continue
    }
    if (section === 'ips' && IP_LABELS.includes(low)) {
      if (!ip) ip = {}
      if ((low === 'time' || low === 'timestamp') && (ip['time'] || ip['timestamp'])) {
        flushIp()
        ip = {}
      }
      label = low
      ip[label] ??= []
      continue
    }
    if (!label) continue
    // valor do rótulo atual
    if (section === 'header') header[label] = header[label] ? `${header[label]} ${tok}` : tok
    else if (section === 'messages' && msg) msg[label].push(tok)
    else if (section === 'calls' && call) {
      if (label === 'phone number' || label === 'participants') {
        if (/\d{6,}/.test(tok)) call.participants.push(tok)
      } else if (call.inEvents && !['call id', 'call creator', 'state', 'platform'].includes(label)) {
        const ev = (call.ev ??= {})
        ;(ev[label] ??= []).push(tok)
      } else (call.rec[label] ??= []).push(tok)
    } else if (section === 'ips' && ip) ip[label].push(tok)
  }
  flushAll()
  const account = normalizeNumber(header['account identifier'] || header['target'] || '')[0]
  return { header, account, messages, calls, ips, discarded }
}

// ---------------------------------------------------------------- importação

export const WA_COLS = [
  ['import_id', 'INTEGER'], ['file_id', 'INTEGER'], ['file_sha256', 'VARCHAR'], ['row_number', 'INTEGER'], ['operator', 'VARCHAR'], ['event_type', 'VARCHAR'],
  ['direction', 'VARCHAR'], ['a_number', 'VARCHAR'], ['b_number', 'VARCHAR'], ['a_raw', 'VARCHAR'], ['b_raw', 'VARCHAR'], ['target_number', 'VARCHAR'],
  ['other_number', 'VARCHAR'], ['ts_original', 'VARCHAR'], ['ts_utc', 'TIMESTAMP'], ['ts_local', 'TIMESTAMP'], ['tz_name', 'VARCHAR'], ['tz_status', 'VARCHAR'],
  ['duration_s', 'INTEGER'], ['status', 'VARCHAR'], ['ip', 'VARCHAR'], ['raw', 'VARCHAR'], ['warnings', 'VARCHAR'], ['n_warnings', 'INTEGER'],
  ['confidence', 'DOUBLE'], ['out_of_scope', 'BOOLEAN'], ['dedup_hash', 'VARCHAR'], ['app', 'VARCHAR'], ['group_id', 'VARCHAR'],
  ['participants', 'VARCHAR'], ['port', 'INTEGER'], ['device', 'VARCHAR'], ['media', 'VARCHAR'], ['ext_id', 'VARCHAR'],
].map(([name, type]) => ({ name, type }))

const isoUtc = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
const isoLocal = (ms: number, tz: string) => isoUtc(ms + tzOffsetMs(ms, tz))
const num = (s: string | null | undefined) => (s ? normalizeNumber(s)[0] : null)
const port = (s: string | null | undefined) => (s && /^\d{1,5}$/.test(s.trim()) ? Number(s.trim()) : null)

async function readText(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

/** Confere se um arquivo carregado é um WhatsApp Records (lê só o começo). */
export async function detectWhatsApp(blob: Blob, name: string): Promise<boolean> {
  if (!/\.(html?|txt)$/i.test(name) && !/html|text/.test(blob.type)) return false
  return looksLikeWhatsApp(await readText(blob.slice(0, 2_000_000)))
}

export async function importWhatsApp(fileId: number, opts: { tz?: string } = {}) {
  const tz = opts.tz || 'America/Sao_Paulo'
  const st = getState()
  const f = st.files.find((x) => x.id === fileId)
  if (!f) throw new Error('Arquivo não encontrado')
  const imp: ImportRec = {
    id: nextId(), file_id: f.id, kind: 'whatsapp', mapping: {}, options: { tz_mode: 'confirmed', tz_name: tz, source: 'WhatsApp Records (UTC)' }, status: 'running',
    rows_total: 0, rows_ok: 0, rows_error: 0, rows_warning: 0, rows_duplicate: 0, rows_out_of_scope: 0, rules_version: RULES_VERSION,
    summary: {}, issues: [], progress: 0.1, message: 'lendo WhatsApp Records', created_at: nowIso(), finished_at: null,
  }
  // reimportação substitui a anterior do mesmo arquivo
  const prev = st.imports.filter((i) => i.file_id === f.id && i.kind === 'whatsapp' && i.status === 'done')
  for (const p of prev) await exec(`DELETE FROM events WHERE import_id = ${p.id}`)
  setState((s) => ({ imports: [imp, ...s.imports.map((i) => (prev.some((p) => p.id === i.id) ? { ...i, status: 'superseded' as const } : i))] }))
  updateFile(f.id, { kind: 'whatsapp', status: 'em_processamento', operator_detected: 'WhatsApp', operator_confidence: 1 })
  try {
    const rec = parseWhatsApp(await readText(f.blob), /\.html?$/i.test(f.original_name) || f.detected_format === 'html')
    const target = rec.account
    if (!target) throw new Error('Não encontrei o número da conta (Account Identifier) no documento.')
    if (!rec.messages.length && !rec.calls.length && !rec.ips.length) throw new Error('Nenhum registro de mensagem, chamada ou IP reconhecido no documento.')
    // a conta do relatório passa a ser um alvo da análise (editável em Alvos)
    if (!getState().targets.some((t) => t.number_normalized === target)) {
      setState((s) => ({
        targets: [...s.targets, { id: nextId(), number_normalized: target, number_original: rec.header['account identifier'] || target, operator: null, internal_id: null, label: 'WhatsApp', period_start: null, period_end: null, source: 'WhatsApp Records', notes: null, validation_status: 'pendente' }],
      }))
      await syncTargetsTable()
    }
    const meta = getState().meta
    const tg = getState().targets.find((t) => t.number_normalized === target)
    const outOfScope = (ms: number) => {
      const day = isoLocal(ms, tz).slice(0, 10)
      return !!((meta.period_start && day < meta.period_start) || (meta.period_end && day > meta.period_end) || (tg?.period_start && day < tg.period_start) || (tg?.period_end && day > tg.period_end))
    }
    const rows: string[] = []
    const types: Record<string, number> = {}
    let oos = 0
    let n = 0
    const add = (ev: Record<string, any>, ms: number, tsRaw: string) => {
      n++
      const out = outOfScope(ms)
      if (out) oos++
      types[ev.event_type] = (types[ev.event_type] ?? 0) + 1
      const full: Record<string, any> = {
        import_id: imp.id, file_id: f.id, file_sha256: f.sha256, row_number: n, operator: 'WhatsApp', target_number: target, ts_original: `${tsRaw}`.slice(0, 80),
        ts_utc: isoUtc(ms), ts_local: isoLocal(ms, tz), tz_name: tz, tz_status: 'confirmed', warnings: '[]', n_warnings: 0, confidence: 1, out_of_scope: out, app: 'whatsapp',
        ...ev,
      }
      full.dedup_hash = quickHash(['wa', target, full.event_type, full.ext_id ?? full.ts_utc, full.a_number, full.b_number, full.group_id, full.ip])
      rows.push(WA_COLS.map((c) => csvCell(full[c.name])).join(','))
    }

    for (const m of rec.messages) {
      const sender = num(m.sender)
      const recips = m.recipients.map((r) => num(r)).filter((x): x is string => !!x)
      const out = sender === target
      const single = recips.length === 1 ? recips[0] : null
      const group = m.group || (recips.length > 1 ? 'grupo sem identificação' : null)
      add({
        event_type: out ? 'wa_msg_enviada' : 'wa_msg_recebida', direction: out ? 'out' : 'in',
        a_number: sender, b_number: out ? (group ? null : single) : target, a_raw: m.sender, b_raw: m.recipients.slice(0, 3).join(', ').slice(0, 80),
        other_number: out ? (group ? null : single) : sender,
        // só o IP de quem enviou: quando é o alvo, é o IP do alvo
        ip: out ? m.senderIp : null, port: out ? port(m.senderPort) : null, device: out ? m.device : null,
        status: m.style, media: m.type, ext_id: m.id, group_id: m.group, participants: group ? recips.join(',') : null,
        raw: JSON.stringify(m),
      }, m.ts, m.tsRaw)
    }
    for (const c of rec.calls) {
      const creator = num(c.creator) ?? num(c.events[0]?.from)
      const out = creator === target
      const tos = [...c.events.map((e) => num(e.to)), ...c.participants.map(num)].filter((x): x is string => !!x && x !== target)
      const other = out ? tos[0] ?? null : creator
      const tAccept = c.events.find((e) => /accept|connect|answer/i.test(e.type ?? ''))?.ts ?? null
      const tEnd = c.events.filter((e) => /terminat|end|hangup|reject/i.test(e.type ?? '')).map((e) => e.ts).filter((x): x is number => x !== null).sort((a, b) => b - a)[0] ?? null
      const media = c.events.map((e) => e.media).find(Boolean) ?? null
      const myIp = c.events.find((e) => num(e.from) === target && e.fromIp)
      add({
        event_type: out ? 'wa_chamada_originada' : 'wa_chamada_recebida', direction: out ? 'out' : 'in',
        a_number: creator, b_number: out ? other : target, a_raw: c.creator, other_number: other,
        duration_s: tAccept !== null && tEnd !== null && tEnd >= tAccept ? Math.round((tEnd - tAccept) / 1000) : tAccept === null ? 0 : null,
        status: tAccept !== null ? 'atendida' : 'não atendida', media, ext_id: c.id,
        participants: c.participants.length > 2 || new Set(tos).size > 1 ? [...new Set(tos)].join(',') : null,
        ip: myIp?.fromIp ?? null, port: port(myIp?.fromPort),
        raw: JSON.stringify(c),
      }, c.ts, c.tsRaw)
    }
    for (const r of rec.ips) {
      add({ event_type: 'wa_conexao', direction: 'unknown', ip: r.ip, port: port(r.port), raw: JSON.stringify(r) }, r.ts, r.tsRaw)
    }
    for (let i = 0; i < rows.length; i += 20000) await insertCsv('events', WA_COLS, rows.slice(i, i + 20000).join('\n') + '\n')
    await recomputeDuplicates()
    const dup = (await q1<{ n: number }>(`SELECT count(*)::INTEGER AS n FROM events WHERE import_id = ${imp.id} AND is_duplicate`)).n
    const span = await q1(`SELECT min(ts_local) AS a, max(ts_local) AS b FROM events WHERE import_id = ${imp.id}`)
    updateImport(imp.id, {
      status: 'done', progress: 1, message: 'importação concluída', finished_at: nowIso(),
      rows_total: n + rec.discarded, rows_ok: n, rows_error: rec.discarded, rows_duplicate: dup, rows_out_of_scope: oos,
      summary: { source: 'whatsapp', account: target, header: rec.header, event_types: types, messages: rec.messages.length, calls: rec.calls.length, ips: rec.ips.length, discarded: rec.discarded, period: [span.a, span.b] },
    }, true)
    updateFile(f.id, { status: 'processado' })
    return { account: target, messages: rec.messages.length, calls: rec.calls.length, ips: rec.ips.length, discarded: rec.discarded, duplicates: dup }
  } catch (e: any) {
    await exec(`DELETE FROM events WHERE import_id = ${imp.id}`)
    updateImport(imp.id, { status: 'failed', message: e?.message ?? String(e) }, true)
    updateFile(f.id, { status: 'recebido' })
    throw e
  }
}

// ---------------------------------------------------------------- análises

const WA = `e.app = 'whatsapp'`

export async function waAccounts() {
  return getState().imports.filter((i) => i.kind === 'whatsapp' && i.status === 'done').map((i) => ({ import_id: i.id, file_id: i.file_id, ...i.summary }))
}

export async function waSummary(f: EventFilter) {
  const w = where(f)
  const t = await q1(`SELECT count(*)::INTEGER AS events,
      (count(*) FILTER (WHERE event_type = 'wa_msg_enviada'))::INTEGER AS sent,
      (count(*) FILTER (WHERE event_type = 'wa_msg_recebida'))::INTEGER AS received,
      (count(*) FILTER (WHERE event_type LIKE 'wa_chamada%'))::INTEGER AS calls,
      (count(*) FILTER (WHERE event_type LIKE 'wa_chamada%' AND status = 'atendida'))::INTEGER AS calls_answered,
      (count(*) FILTER (WHERE event_type LIKE 'wa_chamada%' AND lower(media) LIKE '%video%'))::INTEGER AS video_calls,
      (count(*) FILTER (WHERE event_type = 'wa_conexao'))::INTEGER AS connections,
      count(DISTINCT group_id)::INTEGER AS groups, count(DISTINCT ip)::INTEGER AS ips, count(DISTINCT device)::INTEGER AS devices,
      count(DISTINCT other_number)::INTEGER AS contacts, min(ts_local) AS first_event, max(ts_local) AS last_event
    FROM events e WHERE ${w} AND ${WA}`)
  const media = await q(`SELECT coalesce(media, 'não informado') AS media, count(*)::INTEGER AS n FROM events e WHERE ${w} AND ${WA} AND event_type LIKE 'wa_msg%' GROUP BY 1 ORDER BY 2 DESC`)
  const devices = await q(`SELECT device, target_number, count(*)::INTEGER AS n, min(ts_local) AS first_event, max(ts_local) AS last_event FROM events e WHERE ${w} AND ${WA} AND device IS NOT NULL GROUP BY 1, 2 ORDER BY 3 DESC`)
  return { totals: t, media, devices, criteria: criteria(f, { source: 'WhatsApp Records (Meta), horários convertidos de UTC' }) }
}

/** IPs usados pelos alvos (WhatsApp e sessões de dados das operadoras). */
export async function ipList(f: EventFilter, limit = 2000) {
  const items = await q(`SELECT ip, count(*)::INTEGER AS events, count(DISTINCT CAST(ts_local AS DATE))::INTEGER AS days,
      min(ts_local) AS first_event, max(ts_local) AS last_event, list(DISTINCT target_number) AS targets,
      list(DISTINCT port) FILTER (WHERE port IS NOT NULL) AS ports, list(DISTINCT coalesce(app, 'operadora')) AS sources,
      (CASE WHEN ip LIKE '%:%' THEN 'IPv6' ELSE 'IPv4' END) AS version
    FROM events e WHERE ${where(f)} AND ip IS NOT NULL GROUP BY ip ORDER BY events DESC LIMIT ${Number(limit)}`)
  return {
    items,
    criteria: criteria(f, {
      note: 'IPs registrados para o próprio alvo. IPv4 de operadoras móveis costuma ser compartilhado por muitos clientes (CGNAT): a identificação exige a porta e a data/hora exatas junto ao provedor.',
    }),
  }
}

/** IPs usados por dois ou mais alvos — com a proximidade temporal de uso. */
export async function sharedIps(f: EventFilter) {
  const rows = await q(`SELECT ip, target_number, count(*)::INTEGER AS n, min(ts_local) AS first_event, max(ts_local) AS last_event, list(DISTINCT port) FILTER (WHERE port IS NOT NULL) AS ports
    FROM events e WHERE ${where(f)} AND ip IS NOT NULL
      AND ip IN (SELECT ip FROM events e WHERE ${where(f)} AND ip IS NOT NULL GROUP BY ip HAVING count(DISTINCT target_number) > 1)
    GROUP BY 1, 2 ORDER BY 1, 2`)
  const by = new Map<string, any[]>()
  for (const r of rows) by.set(r.ip, [...(by.get(r.ip) ?? []), r])
  const items = [...by.entries()].map(([ip, per]) => ({ ip, targets: per.length, per_target: per, events: per.reduce((a, r) => a + r.n, 0) })).sort((a, b) => b.targets - a.targets || b.events - a.events)
  return {
    items,
    criteria: criteria(f, {
      note: 'O mesmo IP em números diferentes pode indicar mesma rede (residência, empresa, Wi-Fi público) ou apenas o mesmo bloco de CGNAT da operadora. Compare as datas, as portas e o tipo de rede antes de concluir.',
    }),
  }
}

/** Sequência de IPs de um número: cada troca de IP e por quanto tempo foi usado. */
export async function ipSequence(f: EventFilter, limit = 3000) {
  const rows = await q(`SELECT target_number, ip, port, event_type, ts_local FROM events e WHERE ${where(f)} AND ip IS NOT NULL ORDER BY target_number, ts_utc, id LIMIT ${Number(limit) * 20}`)
  const out: any[] = []
  for (const r of rows) {
    const last = out[out.length - 1]
    if (last && last.target_number === r.target_number && last.ip === r.ip) {
      last.until = r.ts_local
      last.events++
    } else out.push({ target_number: r.target_number, ip: r.ip, from: r.ts_local, until: r.ts_local, events: 1, ports: r.port ? [r.port] : [] })
  }
  return { items: out.slice(0, limit), truncated: out.length > limit, criteria: criteria(f, { note: 'períodos contínuos em que o mesmo IP aparece nos registros; não indica uso ininterrupto' }) }
}

export async function waGroups(f: EventFilter) {
  const rows = await q(`SELECT group_id, target_number, count(*)::INTEGER AS messages,
      (count(*) FILTER (WHERE event_type = 'wa_msg_enviada'))::INTEGER AS sent, (count(*) FILTER (WHERE event_type = 'wa_msg_recebida'))::INTEGER AS received,
      min(ts_local) AS first_event, max(ts_local) AS last_event, list(participants) FILTER (WHERE participants IS NOT NULL) AS plist,
      list(DISTINCT other_number) FILTER (WHERE other_number IS NOT NULL) AS senders
    FROM events e WHERE ${where(f)} AND ${WA} AND group_id IS NOT NULL GROUP BY 1, 2 ORDER BY messages DESC`)
  const items = rows.map((r) => {
    const members = new Set<string>([...(r.senders ?? [])])
    for (const p of r.plist ?? []) for (const x of String(p).split(',')) if (x) members.add(x)
    members.delete(r.target_number)
    return { group_id: r.group_id, target_number: r.target_number, messages: r.messages, sent: r.sent, received: r.received, first_event: r.first_event, last_event: r.last_event, members: [...members].sort() }
  })
  return { items, criteria: criteria(f, { note: 'participantes = números vistos como remetentes ou destinatários das mensagens do grupo no período' }) }
}

/** Números que aparecem em grupos de dois ou mais alvos. */
export async function sharedGroupMembers(f: EventFilter) {
  const g = await waGroups(f)
  const byMember = new Map<string, Set<string>>()
  for (const it of g.items) for (const m of it.members) byMember.set(m, (byMember.get(m) ?? new Set()).add(it.target_number))
  return [...byMember.entries()].filter(([, t]) => t.size > 1).map(([member, t]) => ({ member, targets: [...t] }))
}

export function waEventFilter(f: EventFilter): EventFilter {
  return { ...f, event_types: f.event_types?.length ? f.event_types : ['wa_msg_enviada', 'wa_msg_recebida', 'wa_chamada_originada', 'wa_chamada_recebida', 'wa_conexao'] }
}

