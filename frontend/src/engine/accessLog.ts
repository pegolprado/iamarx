/**
 * Logs de acesso (IP): registros de login/uso fornecidos por provedores de aplicação
 * (Google, Meta/Instagram/Facebook, Apple, Microsoft, provedores de internet…).
 *
 * O arquivo é lido como tabela (CSV, XLSX, TXT, HTML, PDF) e as colunas são reconhecidas
 * pelo nome ou pelo conteúdo: data/hora, IP, porta, conta e serviço/atividade. Relatórios
 * da Meta em HTML ("Ip Addresses" com Time/IP Address) também são aceitos.
 *
 * Cada linha vira um evento `acesso` com app = serviço e target_number = conta (telefone
 * normalizado ou o identificador, como e-mail). Assim os IPs entram na correlação entre
 * fontes (mesmo IP e porta, no mesmo horário, em contas/serviços diferentes).
 */
import { criteria, type EventFilter, where } from './analytics'
import { csvCell, exec, insertCsv, q, q1 } from './db'
import { recomputeDuplicates } from './importer'
import { normalizeNumber, parseLocalDatetime, quickHash, RULES_VERSION, toUtcMs, tzOffsetMs } from './normalize'
import { Table } from './readers'
import { getState, type ImportRec, nextId, nowIso, setState, updateFile, updateImport } from './session'
import { stripAccents } from './text'
import { parseWhatsApp, WA_COLS } from './whatsapp'

const N = (s: string) =>
  stripAccents(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
const IP_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7})$/i
/** IP (com ou sem porta "1.2.3.4:5678" / "[2804::1]:443") → [ip, porta]. */
export function splitIpPort(raw: string | null | undefined): [string | null, number | null] {
  let v = (raw ?? '').trim()
  if (!v) return [null, null]
  let port: number | null = null
  const b = /^\[([0-9a-f:.]+)\](?::(\d{1,5}))?$/i.exec(v)
  if (b) {
    v = b[1]
    port = b[2] ? +b[2] : null
  } else {
    const p4 = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/.exec(v)
    if (p4) {
      v = p4[1]
      port = +p4[2]
    }
  }
  if (!IP_RE.test(v) || !/[.:]/.test(v)) return [null, null]
  // IPv6: forma comprimida (::) ou completa (8 grupos) — evita confundir com horários (12:30:00)
  if (v.includes(':') && !v.includes('::') && v.split(':').length !== 8) return [null, null]
  if (v.includes('.') && v.split('.').some((o) => +o > 255)) return [null, null]
  return [v.toLowerCase(), port]
}

const SERVICES: [RegExp, string][] = [
  [/google|gmail|youtube|android/i, 'Google'],
  [/instagram/i, 'Instagram'],
  [/facebook|meta\b/i, 'Facebook'],
  [/whats/i, 'WhatsApp'],
  [/apple|icloud/i, 'Apple'],
  [/microsoft|outlook|hotmail|live\b/i, 'Microsoft'],
  [/telegram/i, 'Telegram'],
  [/tiktok/i, 'TikTok'],
  [/twitter|\bx\.com/i, 'X/Twitter'],
  [/uber/i, 'Uber'],
  [/ifood/i, 'iFood'],
  [/mercado ?(livre|pago)/i, 'Mercado Livre'],
]
export function guessService(text: string): string | null {
  return SERVICES.find(([re]) => re.test(text))?.[1] ?? null
}

/** Conta → identificador usado na análise: telefone normalizado ou texto em minúsculas. */
export function accountKey(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  if (!/@|[a-z]{3}/i.test(v)) {
    const n = normalizeNumber(v)[0]
    if (n) return n
  }
  return v.toLowerCase().slice(0, 120)
}

type Cols = { dt?: string; date?: string; time?: string; ip?: string; port?: string; account?: string; service?: string; activity?: string }

/** Reconhece as colunas pelo nome e confirma pelo conteúdo da amostra. */
export function detectColumns(columns: string[], sample: Record<string, unknown>[]): Cols {
  const c: Cols = {}
  const by = (re: RegExp, skip: (string | undefined)[] = []) => columns.find((k) => re.test(N(k)) && !skip.includes(k))
  const ipShare = (k: string) => sample.filter((r) => splitIpPort(String(r[k] ?? ''))[0]).length / Math.max(1, sample.filter((r) => String(r[k] ?? '').trim()).length)
  c.ip = by(/(^| )(ip|ipv4|ipv6|endereco ip|ip address|ip de origem|source ip|ip origem|client ip|ip do usuario|ip publico)( |$)/)
  if (!c.ip || ipShare(c.ip) < 0.5) c.ip = columns.filter((k) => sample.length && ipShare(k) >= 0.6).sort((a, b) => ipShare(b) - ipShare(a))[0]
  c.port = by(/(^| )(porta|port|source port|porta de origem|porta logica|src port)( |$)/, [c.ip])
  c.dt = by(/(data ?hora|date ?time|timestamp|data e hora|hora utc|time utc|datetime|login time|event time|horario|^time$|^hora$|^date$|^data$)/, [c.ip, c.port])
  const hasTime = (k?: string) => !!k && sample.some((r) => /\d{1,2}:\d{2}/.test(String(r[k] ?? '')))
  if (c.dt && !hasTime(c.dt)) {
    // data e hora em colunas separadas
    c.date = c.dt
    c.time = by(/(^| )(hora|horario|time)( |$)/, [c.dt, c.ip, c.port])
    c.dt = undefined
  }
  if (!c.dt && !c.date)
    c.dt = columns.find(
      (k) =>
        ![c.ip, c.port].includes(k) &&
        sample.filter((r) => /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/.test(String(r[k] ?? '')) && /\d{1,2}:\d{2}/.test(String(r[k] ?? ''))).length >= sample.length * 0.6,
    )
  c.account = by(/(conta|account|usuario|user|login|e ?mail|alvo|target|identificador|msisdn|telefone|linha|assinante|subscriber)/, [c.ip, c.port, c.dt, c.date, c.time])
  c.service = by(/(servico|service|aplicacao|aplicativo|produto|product|plataforma|platform|provedor)/, [c.ip, c.port, c.dt, c.account])
  c.activity = by(/(atividade|activity|evento|event|acao|action|tipo|type|descricao|description|status)/, [c.ip, c.port, c.dt, c.account, c.service])
  return c
}

export type AccessOptions = { account?: string; service?: string; tz?: string }

export async function importAccessLog(fileId: number, o: AccessOptions = {}) {
  const st = getState()
  const f = st.files.find((x) => x.id === fileId)
  if (!f) throw new Error('Arquivo não encontrado')
  const defaultTz = o.tz || 'America/Sao_Paulo'
  const imp: ImportRec = {
    id: nextId(),
    file_id: f.id,
    kind: 'access_log',
    mapping: {},
    options: { tz_name: defaultTz, account: o.account ?? null, service: o.service ?? null },
    status: 'running',
    rows_total: 0,
    rows_ok: 0,
    rows_error: 0,
    rows_warning: 0,
    rows_duplicate: 0,
    rows_out_of_scope: 0,
    rules_version: RULES_VERSION,
    summary: {},
    issues: [],
    progress: 0.1,
    message: 'lendo log de acesso',
    created_at: nowIso(),
    finished_at: null,
  }
  const prev = st.imports.filter((i) => i.file_id === f.id && i.kind === 'access_log' && i.status === 'done')
  for (const p of prev) await exec(`DELETE FROM events WHERE import_id = ${p.id}`)
  setState((s) => ({ imports: [imp, ...s.imports.map((i) => (prev.some((p) => p.id === i.id) ? { ...i, status: 'superseded' as const } : i))] }))
  updateFile(f.id, { kind: 'access_log', status: 'em_processamento' })
  const issues: ImportRec['issues'] = []
  try {
    const rows: string[] = []
    const accounts = new Map<string, number>()
    const services = new Map<string, number>()
    let n = 0
    let bad = 0
    let tzUtc = 0
    const fileService = o.service || guessService(f.original_name)
    const add = (ev: {
      ms: number
      tsRaw: string
      ip: string
      port: number | null
      account: string | null
      service: string | null
      activity: string | null
      tzStatus: string
      tzName: string
      raw: unknown
    }) => {
      n++
      const account = ev.account ?? 'conta não informada'
      const service = ev.service || fileService || 'Log de acesso'
      accounts.set(account, (accounts.get(account) ?? 0) + 1)
      services.set(service, (services.get(service) ?? 0) + 1)
      const full: Record<string, any> = {
        import_id: imp.id,
        file_id: f.id,
        file_sha256: f.sha256,
        row_number: n,
        operator: service,
        event_type: 'acesso',
        direction: 'unknown',
        target_number: account,
        a_raw: ev.account,
        ts_original: ev.tsRaw.slice(0, 80),
        ts_utc: iso(ev.ms),
        ts_local: iso(ev.ms + tzOffsetMs(ev.ms, 'America/Sao_Paulo')),
        tz_name: ev.tzName,
        tz_status: ev.tzStatus,
        ip: ev.ip,
        port: ev.port,
        status: ev.activity?.slice(0, 120) ?? null,
        app: service.toLowerCase(),
        warnings: '[]',
        n_warnings: 0,
        confidence: 1,
        out_of_scope: false,
        raw: JSON.stringify(ev.raw).slice(0, 2000),
      }
      full.dedup_hash = quickHash(['acesso', account, service, full.ts_utc, ev.ip, ev.port])
      rows.push(WA_COLS.map((c) => csvCell(full[c.name])).join(','))
    }

    // Relatório da Meta em HTML (Instagram/Facebook/WhatsApp): seção "Ip Addresses"
    const text = /html?$/i.test(f.detected_format) || /\.html?$/i.test(f.original_name) ? await f.blob.text() : ''
    if (text && /ip addresses/i.test(text) && /(account identifier|target|service)/i.test(text)) {
      const rec = parseWhatsApp(text, true)
      const acc = accountKey(o.account || rec.header['account identifier'] || rec.header['target'] || null)
      const service = o.service || rec.header['service'] || fileService
      for (const r of rec.ips)
        add({
          ms: r.ts,
          tsRaw: r.tsRaw,
          ip: r.ip,
          port: r.port ? Number(r.port) || null : null,
          account: acc,
          service,
          activity: 'conexão',
          tzStatus: 'confirmed',
          tzName: 'UTC',
          raw: r,
        })
      bad = rec.discarded
    } else {
      const table = await Table.open(f.blob, f.detected_format, {})
      const sample = await table.sample(60)
      const cols = detectColumns(table.info.columns, sample)
      if (!cols.ip) throw new Error('Não encontrei uma coluna com endereços IP no arquivo.')
      if (!cols.dt && !cols.date) throw new Error('Não encontrei a coluna de data/hora no arquivo.')
      imp.mapping = Object.fromEntries(Object.entries(cols).filter(([, v]) => v)) as Record<string, string>
      const headerUtc = [cols.dt, cols.date, cols.time].some((k) => k && /utc|gmt|z\b/i.test(k)) || /utc|gmt/i.test(table.info.preamble.join(' '))
      const preambleAccount = (table.info.preamble.join(' ').match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) ?? [])[0]
      for await (const [raw, rec] of table.rows()) {
        const [ip, p] = splitIpPort(rec[cols.ip])
        const dtS = cols.dt ? rec[cols.dt] : null
        const [local, offset, err] = parseLocalDatetime(cols.date ? rec[cols.date] : null, cols.time ? rec[cols.time] : null, dtS)
        if (!ip || !local || err?.startsWith('data')) {
          bad++
          if (issues.length < 500)
            issues.push({
              row: raw.row,
              field: !ip ? 'ip' : 'data/hora',
              severity: 'error',
              code: 'invalido',
              message: !ip ? `IP inválido: '${rec[cols.ip] ?? ''}'` : (err ?? 'data/hora inválida'),
              raw: rec,
            })
          continue
        }
        const utcText = /utc|gmt|z$/i.test(dtS ?? '') || headerUtc
        if (utcText || offset) tzUtc++
        const tz = utcText && !offset ? 'UTC' : defaultTz
        const ms = toUtcMs(local, offset, tz)
        const portCol = cols.port ? Number(String(rec[cols.port] ?? '').replace(/\D/g, '')) || null : null
        add({
          ms,
          tsRaw: dtS ?? `${rec[cols.date!] ?? ''} ${cols.time ? (rec[cols.time] ?? '') : ''}`,
          ip,
          port: portCol ?? p,
          account: accountKey(o.account || (cols.account ? rec[cols.account] : null) || preambleAccount || null),
          service: (cols.service ? rec[cols.service] : null) || null,
          activity: cols.activity ? (rec[cols.activity] ?? null) : null,
          tzStatus: utcText || offset ? 'confirmed' : 'assumed',
          tzName: offset ? `UTC${offset}` : tz,
          raw: rec,
        })
      }
    }
    if (!n) throw new Error('Nenhum registro de IP com data/hora válida foi encontrado.')
    for (let i = 0; i < rows.length; i += 20000) await insertCsv('events', WA_COLS, rows.slice(i, i + 20000).join('\n') + '\n')
    await recomputeDuplicates()
    const dup = (await q1<{ n: number }>(`SELECT count(*)::INTEGER AS n FROM events WHERE import_id = ${imp.id} AND is_duplicate`)).n
    const span = await q1(`SELECT min(ts_local) AS a, max(ts_local) AS b FROM events WHERE import_id = ${imp.id}`)
    updateImport(
      imp.id,
      {
        status: 'done',
        progress: 1,
        message: 'importação concluída',
        finished_at: nowIso(),
        mapping: imp.mapping,
        issues,
        rows_total: n + bad,
        rows_ok: n,
        rows_error: bad,
        rows_duplicate: dup,
        summary: { source: 'access_log', accounts: Object.fromEntries(accounts), services: Object.fromEntries(services), utc_rows: tzUtc, period: [span.a, span.b] },
      },
      true,
    )
    updateFile(f.id, { status: 'processado', operator_detected: [...services.keys()].join(', ').slice(0, 60), operator_confidence: 1 })
    return { rows: n, discarded: bad, duplicates: dup, accounts: [...accounts.keys()], services: [...services.keys()], assumedTz: n - tzUtc > 0 }
  } catch (e: any) {
    await exec(`DELETE FROM events WHERE import_id = ${imp.id}`)
    updateImport(imp.id, { status: 'failed', message: e?.message ?? String(e), issues }, true)
    updateFile(f.id, { status: 'recebido' })
    throw e
  }
}

function iso(ms: number) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
}

// ---------------------------------------------------------------- correlação de IPs entre fontes

export const STRENGTH: Record<string, string> = {
  forte: 'IP e porta idênticos, ou IPv6 idêntico',
  media: 'IPv4 idêntico, porta não informada em uma das fontes',
  fraca: 'IPv4 idêntico com portas diferentes (compatível com CGNAT)',
}

const SRC = `coalesce(app, CASE WHEN event_type = 'dados' THEN 'operadora (dados)' ELSE 'operadora' END)`

/**
 * Mesmo IP usado por fontes diferentes (conta × serviço) dentro de uma janela de tempo.
 * "Fonte" = conta + serviço: a mesma conta em dois serviços também é cruzada (uso compartilhado).
 */
export async function ipCorrelation(f: EventFilter, windowS = 1800, limit = 3000) {
  const win = Math.max(1, Math.trunc(windowS))
  const base = `SELECT id, coalesce(target_number, '?') AS acc, ${SRC} AS src, ip, port, ts_utc, ts_local FROM events e WHERE ${where(f)} AND ip IS NOT NULL`
  const sql = `WITH s AS (${base})
    SELECT a.acc AS acc1, a.src AS src1, b.acc AS acc2, b.src AS src2, a.ip, a.port AS port1, b.port AS port2, a.ts_local AS ts1, b.ts_local AS ts2,
      abs(epoch(b.ts_utc) - epoch(a.ts_utc))::INTEGER AS delta_s, a.id AS id1, b.id AS id2,
      CASE WHEN a.port IS NOT NULL AND a.port = b.port THEN 'forte' WHEN a.ip LIKE '%:%' THEN 'forte'
           WHEN a.port IS NULL OR b.port IS NULL THEN 'media' ELSE 'fraca' END AS strength
    FROM s a JOIN s b ON a.ip = b.ip AND b.ts_utc BETWEEN a.ts_utc - INTERVAL ${win} SECOND AND a.ts_utc + INTERVAL ${win} SECOND
     AND (a.acc < b.acc OR (a.acc = b.acc AND a.src < b.src))`
  const pairs = await q(`SELECT acc1, src1, acc2, src2, count(*)::INTEGER AS matches,
      (count(*) FILTER (WHERE strength = 'forte'))::INTEGER AS forte, (count(*) FILTER (WHERE strength = 'media'))::INTEGER AS media,
      (count(*) FILTER (WHERE strength = 'fraca'))::INTEGER AS fraca, count(DISTINCT ip)::INTEGER AS ips, list(DISTINCT ip) AS ip_list,
      min(delta_s)::INTEGER AS min_delta_s, min(ts1) AS first_match, max(ts1) AS last_match, (acc1 = acc2) AS same_account
    FROM (${sql}) x GROUP BY 1, 2, 3, 4 ORDER BY forte DESC, media DESC, matches DESC LIMIT 500`)
  for (const p of pairs) p.ip_list = (p.ip_list ?? []).slice(0, 20)
  const items = await q(`SELECT * FROM (${sql}) x ORDER BY CASE strength WHEN 'forte' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, delta_s, ts1 LIMIT ${Number(limit)}`)
  const sources = await q(`SELECT coalesce(target_number, '?') AS acc, ${SRC} AS src, count(*)::INTEGER AS events, count(DISTINCT ip)::INTEGER AS ips,
      (count(*) FILTER (WHERE port IS NOT NULL))::INTEGER AS with_port, min(ts_local) AS first_event, max(ts_local) AS last_event
    FROM events e WHERE ${where(f)} AND ip IS NOT NULL GROUP BY 1, 2 ORDER BY events DESC`)
  return {
    pairs,
    items,
    sources,
    truncated: items.length >= limit,
    criteria: criteria(f, {
      window_s: win,
      fonte: 'conta (número ou identificador) + serviço; operadora = sessões de dados da bilhetagem',
      forte: STRENGTH.forte,
      media: STRENGTH.media,
      fraca: STRENGTH.fraca,
      note: 'IPv4 de operadoras móveis é compartilhado por muitos clientes (CGNAT): sem a porta, a coincidência indica apenas a mesma rede. A confirmação de autoria exige IP, porta e data/hora exatos junto ao provedor.',
    }),
  }
}

/** Fontes de IP carregadas (contas e serviços dos logs de acesso). */
export async function accessSources() {
  return q(`SELECT target_number AS account, operator AS service, count(*)::INTEGER AS events, count(DISTINCT ip)::INTEGER AS ips, min(ts_local) AS first_event, max(ts_local) AS last_event
    FROM events WHERE event_type = 'acesso' AND NOT is_duplicate GROUP BY 1, 2 ORDER BY events DESC`)
}
