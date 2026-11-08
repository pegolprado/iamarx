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
  // cada mensagem, evento de chamada e login conta como um registro (o mesmo registro em dois arquivos do mesmo alvo conta uma vez)
  const addObs = (o: IpObs, id: string) => {
    const k = `${o.source}|${o.account}|${id}|${o.number}|${o.ip}|${o.port}|${o.ts}`
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
      if (from && m.senderIp) addObs({ number: from, ip: m.senderIp, port: m.senderPort, ts: m.ts, source: 'mensagem', account: acc }, k)
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
      c.events.forEach((e, i) => {
        const from = num(e.from)
        if (from && e.fromIp && e.ts !== null) addObs({ number: from, ip: e.fromIp, port: e.fromPort, ts: e.ts, source: 'chamada', account: acc }, `${k}#${i}`)
      })
    }
    for (const i of f.rec.ips) addObs({ number: acc, ip: i.ip, port: i.port, ts: i.ts, source: 'login', account: acc }, '')
  }
  return { msgs: [...msgs.values()].sort((a, b) => a.ts - b.ts), calls: [...calls.values()].sort((a, b) => a.ts - b.ts), obs: [...obs.values()].sort((a, b) => a.ts - b.ts) }
}

const WINDOW = 12 * 3600 * 1000

/** Interlocutores do alvo: mensagens e chamadas trocadas com cada número. */
export function interlocutors(account: string, msgs: BMsg[], calls: BCall[]) {
  const by = new Map<string, { number: string; msgs: number; sent: number; received: number; calls: number; callsOut: number; callsIn: number; first: number; last: number }>()
  const hit = (n: string, ts: number) => {
    const r = by.get(n) ?? { number: n, msgs: 0, sent: 0, received: 0, calls: 0, callsOut: 0, callsIn: 0, first: ts, last: ts }
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
  for (const c of calls)
    if (c.account === account)
      for (const p of c.parts)
        if (p !== account) {
          const r = hit(p, c.ts)
          r.calls++
          if (c.creator === account) r.callsOut++
          else r.callsIn++
        }
  return [...by.values()].map((r) => ({ ...r, total: r.msgs + r.calls })).sort((a, b) => b.total - a.total)
}

/**
 * Números que usaram o mesmo IP que o alvo em até 12 h. Mesma porta = mesma conexão;
 * IPv4 com portas diferentes pode ser só o mesmo bloco da operadora (CGNAT).
 */
export function proximity(account: string, obs: IpObs[], window = WINDOW) {
  const mine = obs.filter((o) => o.number === account)
  const byIp = new Map<string, IpObs[]>()
  for (const o of obs)
    if (o.number !== account) {
      const l = byIp.get(o.ip)
      if (l) l.push(o)
      else byIp.set(o.ip, [o])
    }
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

/** Os IPs mais recentes, um por endereço (o uso mais recente de cada), até 10. */
function recentByIp<T extends { ip: string; ts: number }>(list: T[], n = 10) {
  const seen = new Set<string>()
  const out: T[] = []
  for (const o of [...list].sort((a, b) => b.ts - a.ts)) {
    if (seen.has(o.ip)) continue
    seen.add(o.ip)
    out.push(o)
    if (out.length >= n) break
  }
  return out
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
  const recentRes = topRes ? recentByIp(residentialObs.filter((o) => o.info.org === topRes)) : []
  const mobileObs = withInfo.filter((o) => isMobileNet(o.info))
  const mobile = rank(mobileObs, (o) => o.info.org)
  const topMob = mobile[0]?.name ?? null
  const recentMobile = topMob ? recentByIp(mobileObs.filter((o) => o.info.org === topMob)) : []
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
    mobile,
    recentMobile,
    cities,
    hasLookup: !!lookup,
  }
}

/** Análise de vínculos entre vários alvos (um ou mais arquivos por alvo). */
export function links(files: BFile[], window = WINDOW, lookup: Lookup | null = null) {
  const targets = [...new Set(files.map((f) => f.account).filter((x): x is string => !!x))].sort()
  const { msgs, calls, obs } = collect(files)
  const inter = new Map(targets.map((t) => [t, interlocutors(t, msgs, calls)]))
  const tset = new Set(targets)
  // comunicação direta entre alvos: mensagens e chamadas distintas (a mesma mensagem nos arquivos dos dois alvos conta uma vez)
  const dsets = new Map<string, { a: string; b: string; m: Set<string>; c: Set<string>; first: number; last: number }>()
  const dhit = (x: string, y: string, kind: 'm' | 'c', id: string, ts: number) => {
    const [a, b] = x < y ? [x, y] : [y, x]
    const d = dsets.get(`${a}|${b}`) ?? { a, b, m: new Set(), c: new Set(), first: ts, last: ts }
    d[kind].add(id)
    d.first = Math.min(d.first, ts)
    d.last = Math.max(d.last, ts)
    dsets.set(`${a}|${b}`, d)
  }
  for (const m of msgs)
    if (!m.group && m.from && tset.has(m.from)) for (const t of m.to) if (t !== m.from && tset.has(t)) dhit(m.from, t, 'm', m.id ?? `${m.ts}|${m.from}|${t}`, m.ts)
  for (const c of calls) {
    const ps = [...new Set([...c.parts, ...(c.creator ? [c.creator] : [])])].filter((p) => tset.has(p))
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) dhit(ps[i], ps[j], 'c', c.id ?? `${c.ts}|${c.creator}`, c.ts)
  }
  const direct = new Map([...dsets].map(([k, d]) => [k, { a: d.a, b: d.b, msgs: d.m.size, calls: d.c.size, first: d.first, last: d.last }]))
  // interlocutores em comum (ligados a 2+ alvos; um alvo também pode ser interlocutor em comum de outros alvos)
  const byContact = new Map<string, Map<string, number>>()
  for (const t of targets)
    for (const r of inter.get(t)!) {
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
  for (const o of tObs) {
    const l = byIp.get(o.ip)
    if (l) l.push(o)
    else byIp.set(o.ip, [o])
  }
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
  const coloc = colocation(obs, tset, inter, window, lookup)
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
    obsBy: {
      mensagem: obs.filter((o) => o.source === 'mensagem').length,
      chamada: obs.filter((o) => o.source === 'chamada').length,
      login: obs.filter((o) => o.source === 'login').length,
    },
    msgs,
    calls,
    interlocutors: inter,
    direct: [...direct.values()],
    common,
    commonSets: [...byTargetSet.values()].sort((a, b) => b.targets.length - a.targets.length || b.contacts.length - a.contacts.length),
    ipHits,
    coloc,
    groups,
    sharedGroups: groups.filter((g) => g.targets.length > 1),
  }
}

export type Coloc = {
  ip: string
  info: IpInfo | null
  numbers: { number: string; target: boolean; first: number; last: number; n: number }[]
  days: string[]
  samePort: boolean
}

/**
 * Alvos e interlocutores que usaram o mesmo IP em até 12 h (possivelmente no mesmo local).
 * Agrupa por IP e conjunto de números; IPv4 de operadora móvel (CGNAT) fica de fora quando
 * a base de provedores está disponível, pois é compartilhado por milhares de usuários.
 */
export function colocation(obs: IpObs[], tset: Set<string>, inter: Map<string, { number: string }[]>, window = WINDOW, lookup: Lookup | null = null): Coloc[] {
  // números relevantes: alvos e interlocutores diretos dos alvos
  const known = new Set(tset)
  for (const l of inter.values()) for (const i of l) known.add(i.number)
  const byIp = new Map<string, IpObs[]>()
  const seen = new Set<string>()
  for (const o of obs) {
    if (!known.has(o.number)) continue
    const k = `${o.number}|${o.ip}|${o.port}|${o.ts}`
    if (seen.has(k)) continue
    seen.add(k)
    const l = byIp.get(o.ip)
    if (l) l.push(o)
    else byIp.set(o.ip, [o])
  }
  const out = new Map<string, Coloc>()
  for (const [ip, list] of byIp) {
    if (list.length < 2) continue
    const first = list[0].number
    if (list.every((o) => o.number === first)) continue
    const info = lookup ? lookup(ip) : null
    if (info && !ip.includes(':') && isMobileNet(info)) continue
    list.sort((a, b) => a.ts - b.ts)
    // janela deslizante: registros com outro número a até 12 h
    const cnt = new Map<string, number>()
    let lo = 0
    let hi = 0
    const hit: boolean[] = new Array(list.length).fill(false)
    for (let i = 0; i < list.length; i++) {
      while (hi < list.length && list[hi].ts - list[i].ts <= window) {
        cnt.set(list[hi].number, (cnt.get(list[hi].number) ?? 0) + 1)
        hi++
      }
      while (list[i].ts - list[lo].ts > window) {
        const c = cnt.get(list[lo].number)! - 1
        if (c) cnt.set(list[lo].number, c)
        else cnt.delete(list[lo].number)
        lo++
      }
      if (cnt.size > 1) hit[i] = true
    }
    // por dia: conjunto de números que coincidiram
    const byDay = new Map<string, IpObs[]>()
    list.forEach((o, i) => {
      if (!hit[i]) return
      const d = localTs(o.ts).slice(0, 10)
      const l = byDay.get(d)
      if (l) l.push(o)
      else byDay.set(d, [o])
    })
    for (const [day, l] of byDay) {
      const nums = [...new Set(l.map((o) => o.number))].sort()
      if (nums.length < 2) continue
      // ao menos um alvo, ou números ligados a alvos diferentes
      if (!nums.some((n) => tset.has(n)) && new Set(l.map((o) => o.account)).size < 2) continue
      const key = `${ip}|${nums.join(',')}`
      const c = out.get(key) ?? { ip, info, numbers: nums.map((n) => ({ number: n, target: tset.has(n), first: Infinity, last: 0, n: 0 })), days: [], samePort: false }
      if (!c.days.includes(day)) c.days.push(day)
      for (const o of l) {
        const x = c.numbers.find((y) => y.number === o.number)!
        x.first = Math.min(x.first, o.ts)
        x.last = Math.max(x.last, o.ts)
        x.n++
      }
      const ports = new Map<string, Set<string>>()
      for (const o of l) if (o.port) ports.set(o.port, (ports.get(o.port) ?? new Set()).add(o.number))
      if ([...ports.values()].some((s) => s.size > 1)) c.samePort = true
      out.set(key, c)
    }
  }
  return [...out.values()].sort(
    (a, b) => b.numbers.filter((n) => n.target).length - a.numbers.filter((n) => n.target).length || b.days.length - a.days.length || b.numbers.length - a.numbers.length,
  )
}

/** Arquivo é bilhetagem/records do WhatsApp? Lê só o começo. */
export function fileInfo(name: string, rec: WaRecords): BFile {
  return { name, account: rec.account, ticket: rec.header['internal ticket number'] ?? null, range: rec.header['date range'] ?? null, rec }
}
