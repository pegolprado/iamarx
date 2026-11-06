/**
 * Bilhetagem do WhatsApp (pen register diário da Meta): análise individual de um alvo e
 * análise de vínculos entre vários alvos, direto sobre os HTML (nada é gravado).
 *
 * Cada mensagem e chamada traz o IP e a porta de quem enviou/participou — do alvo e dos
 * interlocutores —, o que permite apontar números que usaram o mesmo IP que o alvo em uma
 * janela de tempo (possível proximidade física ou mesma conexão).
 */
import { type IpInfo, isMobileNet, isVpnLike } from './ipdb'
import { normalizeNumber, tzOffsetMs } from './normalize'
import type { WaRecords } from './whatsapp'

export const TZ = 'America/Sao_Paulo'
const num = (s: string | null | undefined) => (s ? normalizeNumber(s)[0] : null)
const pad = (n: number) => String(n).padStart(2, '0')
/** Horário local (Brasília) "AAAA-MM-DD HH:MM:SS". */
export function localTs(ms: number) {
  const d = new Date(ms + tzOffsetMs(ms, TZ))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}
export function tzLabel(ms: number) {
  const h = tzOffsetMs(ms, TZ) / 3600000
  return `GMT${h >= 0 ? '+' : ''}${h}`
}

export type BFile = { name: string; account: string | null; ticket: string | null; range: string | null; rec: WaRecords }
export type BMsg = {
  id: string | null
  ts: number
  from: string | null
  to: string[]
  group: string | null
  ip: string | null
  port: string | null
  type: string | null
  device: string | null
  account: string
}
export type BCall = { id: string | null; ts: number; creator: string | null; parts: string[]; media: string | null; answered: boolean; dur: number | null; account: string }
/** Uso de um IP por um número em um instante (mensagem, chamada ou login). */
export type IpObs = { number: string; ip: string; port: string | null; ts: number; source: 'mensagem' | 'chamada' | 'login'; account: string }

/** Junta os arquivos (sem repetir mensagens/chamadas presentes em mais de um arquivo). */
export function collect(files: BFile[]) {
  const msgs = new Map<string, BMsg>()
  const calls = new Map<string, BCall>()
  const obs = new Map<string, IpObs>()
  const addObs = (o: IpObs) => {
    const k = `${o.number}|${o.ip}|${o.port}|${o.ts}|${o.account}`
    if (!obs.has(k)) obs.set(k, o)
  }
  for (const f of files) {
    const acc = f.account
    if (!acc) continue
    for (const m of f.rec.messages) {
      const from = num(m.sender)
      const to = m.recipients.map(num).filter((x): x is string => !!x)
      const k = m.id ?? `${m.ts}|${from}|${to.join(',')}`
      if (!msgs.has(`${acc}|${k}`))
        msgs.set(`${acc}|${k}`, { id: m.id, ts: m.ts, from, to, group: m.group, ip: m.senderIp, port: m.senderPort, type: m.type, device: m.device, account: acc })
      if (from && m.senderIp) addObs({ number: from, ip: m.senderIp, port: m.senderPort, ts: m.ts, source: 'mensagem', account: acc })
    }
    for (const c of f.rec.calls) {
      const creator = num(c.creator) ?? num(c.events[0]?.from)
      const parts = [...new Set([...c.events.flatMap((e) => [num(e.from), num(e.to)]), ...c.participants.map(num)].filter((x): x is string => !!x))]
      const tAcc = c.events.find((e) => /accept|connect/i.test(e.type ?? ''))?.ts ?? null
      const tEnd =
        c.events
          .filter((e) => /terminat|reject/i.test(e.type ?? ''))
          .map((e) => e.ts ?? 0)
          .sort((a, b) => b - a)[0] ?? null
      const k = c.id ?? `${c.ts}|${creator}`
      if (!calls.has(`${acc}|${k}`))
        calls.set(`${acc}|${k}`, {
          id: c.id,
          ts: c.ts,
          creator,
          parts,
          media: c.events.map((e) => e.media).find(Boolean) ?? null,
          answered: tAcc !== null,
          dur: tAcc !== null && tEnd ? Math.max(0, Math.round((tEnd - tAcc) / 1000)) : null,
          account: acc,
        })
      for (const e of c.events) {
        const from = num(e.from)
        if (from && e.fromIp && e.ts !== null) addObs({ number: from, ip: e.fromIp, port: e.fromPort, ts: e.ts, source: 'chamada', account: acc })
      }
    }
    for (const i of f.rec.ips) addObs({ number: acc, ip: i.ip, port: i.port, ts: i.ts, source: 'login', account: acc })
  }
  return { msgs: [...msgs.values()].sort((a, b) => a.ts - b.ts), calls: [...calls.values()].sort((a, b) => a.ts - b.ts), obs: [...obs.values()].sort((a, b) => a.ts - b.ts) }
}

const WINDOW = 12 * 3600 * 1000

/** Interlocutores do alvo: mensagens e chamadas trocadas com cada número. */
export function interlocutors(account: string, msgs: BMsg[], calls: BCall[]) {
  const by = new Map<string, { number: string; msgs: number; sent: number; received: number; calls: number; first: number; last: number }>()
  const hit = (n: string, ts: number) => {
    const r = by.get(n) ?? { number: n, msgs: 0, sent: 0, received: 0, calls: 0, first: ts, last: ts }
    r.first = Math.min(r.first, ts)
    r.last = Math.max(r.last, ts)
    by.set(n, r)
    return r
  }
  for (const m of msgs) {
    if (m.account !== account || m.group) continue
    if (m.from === account) {
      for (const t of m.to)
        if (t !== account) {
          const r = hit(t, m.ts)
          r.msgs++
          r.sent++
        }
    } else if (m.from) {
      const r = hit(m.from, m.ts)
      r.msgs++
      r.received++
    }
  }
  for (const c of calls) if (c.account === account) for (const p of c.parts) if (p !== account) hit(p, c.ts).calls++
  return [...by.values()].map((r) => ({ ...r, total: r.msgs + r.calls })).sort((a, b) => b.total - a.total)
}

/**
 * Números que usaram o mesmo IP que o alvo em até 12 h. Mesma porta = mesma conexão;
 * IPv4 com portas diferentes pode ser só o mesmo bloco da operadora (CGNAT).
 */
export function proximity(account: string, obs: IpObs[], window = WINDOW) {
  const mine = obs.filter((o) => o.number === account)
  const byIp = new Map<string, IpObs[]>()
  for (const o of obs) if (o.number !== account) byIp.set(o.ip, [...(byIp.get(o.ip) ?? []), o])
  const res = new Map<
    string,
    { number: string; hits: { ip: string; tsTarget: number; tsOther: number; portTarget: string | null; portOther: string | null; samePort: boolean; delta: number }[] }
  >()
  for (const t of mine)
    for (const o of byIp.get(t.ip) ?? []) {
      const delta = Math.abs(o.ts - t.ts)
      if (delta > window) continue
      const r = res.get(o.number) ?? { number: o.number, hits: [] }
      if (!r.hits.some((h) => h.ip === o.ip && h.tsOther === o.ts && h.tsTarget === t.ts))
        r.hits.push({ ip: o.ip, tsTarget: t.ts, tsOther: o.ts, portTarget: t.port, portOther: o.port, samePort: !!t.port && t.port === o.port, delta })
      res.set(o.number, r)
    }
  return [...res.values()]
    .map((r) => ({ ...r, ips: [...new Set(r.hits.map((h) => h.ip))], strong: r.hits.some((h) => h.samePort || h.ip.includes(':')) }))
    .sort((a, b) => Number(b.strong) - Number(a.strong) || b.hits.length - a.hits.length)
}

type Lookup = (ip: string) => IpInfo
const isNight = (ms: number) => {
  const h = +localTs(ms).slice(11, 13)
  return h >= 23 || h < 6
}

function rank<T>(items: T[], key: (x: T) => string | null) {
  const by = new Map<string, number>()
  for (const x of items) {
    const k = key(x)
    if (k) by.set(k, (by.get(k) ?? 0) + 1)
  }
  return [...by.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n)
}

/** Análise individual completa de um alvo. */
export function individual(account: string, files: BFile[], lookup: Lookup | null) {
  const mine = files.filter((f) => f.account === account)
  const { msgs, calls, obs } = collect(mine)
  const inter = interlocutors(account, msgs, calls)
  const groups = new Set(msgs.map((m) => m.group).filter(Boolean))
  const targetObs = obs.filter((o) => o.number === account)
  const info = (ip: string) => (lookup ? lookup(ip) : { asn: null, org: null, country: null, uf: null, city: null })
  const withInfo = targetObs.map((o) => ({ ...o, info: info(o.ip) }))
  const vpn = withInfo.filter((o) => isVpnLike(o.info)).length
  const providers = rank(withInfo, (o) => o.info.org)
  const residentialObs = withInfo.filter((o) => isNight(o.ts) && !isMobileNet(o.info))
  const residential = rank(residentialObs, (o) => o.info.org)
  const topRes = residential[0]?.name ?? null
  const recentRes = topRes
    ? residentialObs
        .filter((o) => o.info.org === topRes)
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 10)
    : []
  const cities = rank(withInfo, (o) =>
    o.info.city ? `${o.info.city}${o.info.uf ? ` · ${o.info.uf}` : ''}` : o.info.country && o.info.country !== 'BR' ? `Exterior (${o.info.country})` : null,
  )
  const all = [...msgs.map((m) => m.ts), ...calls.map((c) => c.ts), ...obs.map((o) => o.ts)]
  return {
    account,
    files: mine.length,
    tickets: [...new Set(mine.map((f) => f.ticket).filter(Boolean))] as string[],
    period: all.length ? ([Math.min(...all), Math.max(...all)] as [number, number]) : null,
    msgs,
    calls,
    obs,
    targetObs: withInfo,
    interlocutors: inter,
    groups: [...groups] as string[],
    vpnPct: targetObs.length ? (vpn / targetObs.length) * 100 : 0,
    proximity: proximity(account, obs),
    providers,
    residential,
    recentRes,
    cities,
    hasLookup: !!lookup,
  }
}

/** Análise de vínculos entre vários alvos (um ou mais arquivos por alvo). */
export function links(files: BFile[], window = WINDOW) {
  const targets = [...new Set(files.map((f) => f.account).filter((x): x is string => !!x))].sort()
  const { msgs, calls, obs } = collect(files)
  const inter = new Map(targets.map((t) => [t, interlocutors(t, msgs, calls)]))
  const tset = new Set(targets)
  // comunicação direta entre alvos
  const direct = new Map<string, { a: string; b: string; msgs: number; calls: number; first: number; last: number }>()
  for (const t of targets)
    for (const r of inter.get(t)!)
      if (tset.has(r.number)) {
        const [a, b] = [t, r.number].sort()
        const d = direct.get(`${a}|${b}`) ?? { a, b, msgs: 0, calls: 0, first: r.first, last: r.last }
        d.msgs = Math.max(d.msgs, r.msgs)
        d.calls = Math.max(d.calls, r.calls)
        d.first = Math.min(d.first, r.first)
        d.last = Math.max(d.last, r.last)
        direct.set(`${a}|${b}`, d)
      }
  // interlocutores em comum (não-alvos ligados a 2+ alvos)
  const byContact = new Map<string, Map<string, number>>()
  for (const t of targets)
    for (const r of inter.get(t)!) {
      if (tset.has(r.number)) continue
      const m = byContact.get(r.number) ?? new Map()
      m.set(t, r.total)
      byContact.set(r.number, m)
    }
  const common = [...byContact.entries()]
    .filter(([, m]) => m.size > 1)
    .map(([number, m]) => ({ number, targets: [...m.keys()].sort(), total: [...m.values()].reduce((a, b) => a + b, 0), per: Object.fromEntries(m) }))
    .sort((a, b) => b.targets.length - a.targets.length || b.total - a.total)
  // por grupo de alvos: quais interlocutores eles compartilham
  const byTargetSet = new Map<string, { targets: string[]; contacts: string[] }>()
  for (const c of common) {
    const k = c.targets.join('|')
    const g = byTargetSet.get(k) ?? { targets: c.targets, contacts: [] }
    g.contacts.push(c.number)
    byTargetSet.set(k, g)
  }
  // mesmo IP usado por alvos diferentes em até 12 h
  const tObs = obs.filter((o) => tset.has(o.number))
  const byIp = new Map<string, IpObs[]>()
  for (const o of tObs) byIp.set(o.ip, [...(byIp.get(o.ip) ?? []), o])
  const ipHits: { ip: string; a: string; b: string; tsA: number; tsB: number; portA: string | null; portB: string | null; samePort: boolean; delta: number }[] = []
  for (const [ip, list] of byIp) {
    if (new Set(list.map((o) => o.number)).size < 2) continue
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const x = list[i]
        const y = list[j]
        if (x.number === y.number || Math.abs(x.ts - y.ts) > window) continue
        const [p, q] = x.number < y.number ? [x, y] : [y, x]
        ipHits.push({ ip, a: p.number, b: q.number, tsA: p.ts, tsB: q.ts, portA: p.port, portB: q.port, samePort: !!p.port && p.port === q.port, delta: Math.abs(x.ts - y.ts) })
      }
  }
  ipHits.sort((a, b) => Number(b.samePort) - Number(a.samePort) || a.delta - b.delta)
  // grupos com mais de um alvo
  const byGroup = new Map<string, Map<string, number>>()
  for (const m of msgs)
    if (m.group) {
      const g = byGroup.get(m.group) ?? new Map()
      g.set(m.account, (g.get(m.account) ?? 0) + 1)
      byGroup.set(m.group, g)
    }
  const groups = [...byGroup.entries()]
    .map(([id, g]) => ({ id, targets: [...g.keys()].sort(), msgs: [...g.values()].reduce((a, b) => a + b, 0), per: Object.fromEntries(g) }))
    .sort((a, b) => b.targets.length - a.targets.length || b.msgs - a.msgs)
  return {
    targets,
    files: files.length,
    obsCount: obs.length,
    msgs,
    calls,
    interlocutors: inter,
    direct: [...direct.values()],
    common,
    commonSets: [...byTargetSet.values()].sort((a, b) => b.targets.length - a.targets.length || b.contacts.length - a.contacts.length),
    ipHits,
    groups,
    sharedGroups: groups.filter((g) => g.targets.length > 1),
  }
}

/** Arquivo é bilhetagem/records do WhatsApp? Lê só o começo. */
export function fileInfo(name: string, rec: WaRecords): BFile {
  return { name, account: rec.account, ticket: rec.header['internal ticket number'] ?? null, range: rec.header['date range'] ?? null, rec }
}
