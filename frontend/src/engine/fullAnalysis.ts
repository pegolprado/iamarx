/**
 * Análise completa: executa de uma vez as análises que antes ficavam em telas
 * separadas (bilhetagem, padrões, vínculos, comparação entre alvos, coincidências,
 * cruzamento multifonte, ERB, WhatsApp/IPs e alertas) e resume os principais
 * achados, cada um com o caminho para os registros que o sustentam.
 *
 * Tudo roda no banco em memória desta aba; nada é gravado.
 */
import { ensureDefaultRules, runRules } from './alerts'
import { cells, commonContacts, compareNumbers, contacts, criteria, type EventFilter, linkGraph, normList, patterns, summary, where } from './analytics'
import { reciprocalMatch } from './crossmatch'
import { q } from './db'
import { getState } from './session'
import { sharedGroupMembers, sharedIps, waGroups, waSummary } from './whatsapp'

/** Limite de alvos comparados entre si (cada par gera consultas próprias). */
export const MAX_COMPARED = 12

/** Números-alvo com dados no filtro, do mais ao menos ativo. */
export async function activeTargets(f: EventFilter, limit = 50): Promise<string[]> {
  if (f.targets?.length) return normList(f.targets)
  const rows = await q(
    `SELECT target_number, count(*)::INTEGER AS n FROM events e WHERE ${where(f)} AND target_number IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT ${Number(limit)}`,
  )
  return rows.map((r) => r.target_number as string)
}

export type LinkOptions = { windowS?: number; minEvents?: number }

/** Vínculos completos: grafo, reciprocidade, contatos em comum, contatos diretos, células compartilhadas, coincidências, cruzamento e WhatsApp. */
export async function linkAnalysis(f: EventFilter, o: LinkOptions = {}) {
  const windowS = o.windowS ?? 300
  const nums = await activeTargets(f)
  const compared = nums.slice(0, MAX_COMPARED)
  const graph = await linkGraph(f, null, 2, o.minEvents ?? 1, false, 3000)
  const reciprocal = graph.edges.filter((e: any) => e.reciprocal).sort((a: any, b: any) => b.events - a.events)
  const cmp = compared.length > 1 ? await compareNumbers(compared, f, windowS) : null
  const common = cmp?.common_contacts ?? (await commonContacts(compared, f))
  const coin = cmp?.coincidences ?? { items: [], truncated: false, criteria: {} }
  const cross = await reciprocalMatch(f, 60, 5, 500)
  const ips = await sharedIps(f)
  const groups = await sharedGroupMembers(f)
  const crossTotal = Object.values(cross.totals).reduce((a, b) => a + b, 0)
  return {
    targets: nums,
    compared,
    graph,
    reciprocal,
    common,
    per_number: cmp?.per_number ?? [],
    direct: cmp?.direct_contacts ?? [],
    shared_cells: (cmp?.shared_cells ?? []) as any[],
    coincidences: coin,
    same_cell: coin.items.filter((c: any) => c.same_cell).length,
    cross: { ...cross, total: crossTotal },
    shared_ips: ips.items,
    shared_group_members: groups,
    criteria: criteria(f, {
      window_s: windowS,
      compared_targets: compared.length < nums.length ? `${compared.length} alvos mais ativos de ${nums.length}` : `${compared.length} alvos`,
      note: 'conexões, contatos em comum e coincidências são registros documentados; não provam vínculo pessoal, presença conjunta ou participação em fato ilícito',
    }),
  }
}

/** Análise automática completa (tudo o que é possível com os arquivos carregados). */
export async function fullAnalysis(f: EventFilter, o: LinkOptions = {}) {
  const s = await summary(f)
  const top = await contacts(f, 15)
  const pat = await patterns(f)
  const erb = s.totals.distinct_cells ? await cells(f, 15) : null
  const links = await linkAnalysis(f, o)
  const wa = s.totals.whatsapp ? await waSummary(f) : null
  const waGroupCount = wa ? (await waGroups(f)).items.length : 0
  ensureDefaultRules()
  await runRules()
  const alerts = getState().alerts
  const alertCount = {
    total: alerts.length,
    pending: alerts.filter((a) => a.review_status === 'pendente').length,
    high: alerts.filter((a) => a.severity === 'alta').length,
  }
  return { summary: s, contacts: top, patterns: pat, erb, links, wa, wa_groups: waGroupCount, alerts: alertCount, ran_at: new Date().toISOString() }
}

export type LinkResult = Awaited<ReturnType<typeof linkAnalysis>>
export type FullResult = Awaited<ReturnType<typeof fullAnalysis>>

export type Finding = { tone: 'red' | 'amber' | 'teal' | 'blue' | 'violet' | 'green' | 'gray'; area: string; title: string; detail: string; path: string; tab?: string }

type Fmt = (n?: string | null) => string

const plural = (n: number, s: string, p = `${s}s`) => `${n.toLocaleString('pt-BR')} ${n === 1 ? s : p}`

/** Achados de vínculos, já ordenados pela relevância para revisão. */
export function linkFindings(l: LinkResult, fmt: Fmt): Finding[] {
  const out: Finding[] = []
  for (const d of l.direct.slice(0, 3))
    out.push({
      tone: 'red',
      area: 'Vínculos',
      title: `Contato direto entre alvos: ${fmt(d.a_number)} → ${fmt(d.b_number)}`,
      detail: `${plural(d.n, 'registro')} entre ${d.first_event?.slice(0, 10)} e ${d.last_event?.slice(0, 10)}.`,
      path: 'vinculos',
      tab: 'diretos',
    })
  const shared = l.common.shared ?? []
  if (shared.length) {
    const best = shared[0]
    out.push({
      tone: 'amber',
      area: 'Vínculos',
      title: `${plural(shared.length, 'contato')} em comum entre alvos`,
      detail: `O mais relevante, ${fmt(best.contact)}, fala com ${best.numbers} alvos (${plural(best.total, 'registro')}).`,
      path: 'vinculos',
      tab: 'comum',
    })
  }
  if (l.reciprocal.length) {
    const e = l.reciprocal[0]
    out.push({
      tone: 'teal',
      area: 'Vínculos',
      title: `${plural(l.reciprocal.length, 'conexão recíproca', 'conexões recíprocas')}`,
      detail: `A mais intensa: ${fmt(e.n1)} ⟷ ${fmt(e.n2)} com ${plural(e.events, 'evento')} em ${plural(e.days, 'dia')}.`,
      path: 'vinculos',
      tab: 'reciprocas',
    })
  }
  if (l.coincidences.items.length)
    out.push({
      tone: l.same_cell ? 'amber' : 'blue',
      area: 'Vínculos',
      title: `${plural(l.coincidences.items.length, 'coincidência temporal', 'coincidências temporais')}${l.coincidences.truncated ? ' (ou mais)' : ''}`,
      detail: l.same_cell
        ? `${plural(l.same_cell, 'ocorrência')} na mesma célula. Isso não indica presença física conjunta.`
        : 'Eventos de alvos diferentes dentro da janela de tempo configurada.',
      path: 'vinculos',
      tab: 'coincidencias',
    })
  if (l.shared_cells.length)
    out.push({
      tone: 'amber',
      area: 'ERB',
      title: `${plural(l.shared_cells.length, 'célula usada', 'células usadas')} por mais de um alvo`,
      detail: `A principal${l.shared_cells[0].site_name ? ` (${l.shared_cells[0].site_name})` : ''} reúne ${plural(l.shared_cells[0].events, 'evento')} de ${l.shared_cells[0].numbers} alvos.`,
      path: 'vinculos',
      tab: 'celulas',
    })
  if (l.shared_ips.length)
    out.push({
      tone: 'amber',
      area: 'WhatsApp e IPs',
      title: `${plural(l.shared_ips.length, 'IP usado', 'IPs usados')} por mais de um alvo`,
      detail: `${l.shared_ips[0].ip} aparece para ${l.shared_ips[0].targets} alvos. Compare datas e portas (CGNAT).`,
      path: 'vinculos',
      tab: 'ips',
    })
  if (l.shared_group_members.length)
    out.push({
      tone: 'violet',
      area: 'WhatsApp e IPs',
      title: `${plural(l.shared_group_members.length, 'participante')} em grupos de mais de um alvo`,
      detail: `Por exemplo ${fmt(l.shared_group_members[0].member)}, visto em grupos de ${l.shared_group_members[0].targets.length} alvos.`,
      path: 'vinculos',
      tab: 'ips',
    })
  if (l.cross.total) {
    const t = l.cross.totals
    out.push({
      tone: t.ausente ? 'amber' : 'green',
      area: 'Cruzamento',
      title: `Cruzamento multifonte: ${plural(t.exata ?? 0, 'correspondência exata', 'correspondências exatas')}`,
      detail: `${t.provavel ?? 0} prováveis, ${t.ambigua ?? 0} ambíguas e ${t.ausente ?? 0} sem registro correspondente no outro arquivo.`,
      path: 'vinculos',
      tab: 'cruzamento',
    })
  }
  return out
}

/** Todos os achados da análise completa. */
export function fullFindings(r: FullResult, fmt: Fmt): Finding[] {
  const out: Finding[] = []
  const t = r.summary.totals
  if (r.alerts.high)
    out.push({
      tone: 'red',
      area: 'Alertas',
      title: `${plural(r.alerts.high, 'alerta')} de severidade alta`,
      detail: `${plural(r.alerts.pending, 'alerta')} aguardando revisão do analista.`,
      path: 'alertas',
    })
  out.push(...linkFindings(r.links, fmt))
  const c = r.contacts.items[0]
  if (c)
    out.push({
      tone: 'blue',
      area: 'Bilhetagem',
      title: `Contato mais frequente: ${fmt(c.other_number)}`,
      detail: `${plural(c.events, 'evento')} com ${fmt(c.target_number)} em ${plural(c.days, 'dia')}${c.reciprocal ? ', nos dois sentidos' : ''}.`,
      path: 'contatos',
    })
  const ph = [...r.patterns.hour_peaks].sort((a, b) => b.z - a.z)[0]
  if (ph)
    out.push({
      tone: 'violet',
      area: 'Padrões',
      title: `Pico de atividade às ${String(ph.hour).padStart(2, '0')}h`,
      detail: `${plural(ph.n, 'evento')} nesse horário (z = ${ph.z.toLocaleString('pt-BR')}).`,
      path: 'estatistica',
    })
  if (r.patterns.day_anomalies.length) {
    const d = [...r.patterns.day_anomalies].sort((a: any, b: any) => b.z - a.z)[0]
    out.push({
      tone: 'violet',
      area: 'Padrões',
      title: `${plural(r.patterns.day_anomalies.length, 'dia atípico', 'dias atípicos')}`,
      detail: `O mais destacado é ${d.day} com ${plural(d.n, 'evento')}.`,
      path: 'estatistica',
    })
  }
  if (r.patterns.days_without_events.length)
    out.push({
      tone: 'gray',
      area: 'Padrões',
      title: `${plural(r.patterns.days_without_events.length, 'dia')} sem nenhum registro dentro do período`,
      detail: `A partir de ${r.patterns.days_without_events[0]}. Pode indicar aparelho desligado, troca de chip ou lacuna no arquivo.`,
      path: 'linha-do-tempo',
    })
  if (t.distinct_imeis > 1)
    out.push({
      tone: 'amber',
      area: 'Bilhetagem',
      title: `${t.distinct_imeis} IMEIs (aparelhos) diferentes`,
      detail: 'Possível troca de aparelho; confira as datas na tela de eventos.',
      path: 'eventos',
    })
  if (r.erb) {
    const res = Object.fromEntries(r.erb.resolution.map((x: any) => [x.status, x.n]))
    // "pendente" inclui registros sem célula (WhatsApp, dados sem ERB), que não têm o que resolver
    const pending = Math.max(0, (res.pendente ?? 0) - r.erb.events_without_cell)
    const missing = (res.none ?? 0) + pending
    const unresolved = missing + (res.ambiguous ?? 0)
    if (unresolved)
      out.push({
        tone: 'amber',
        area: 'ERB',
        title: `${plural(unresolved, 'registro')} com célula sem localização definida`,
        detail: `${plural(res.ambiguous ?? 0, 'ambíguo')} e ${plural(missing, 'sem correspondência', 'sem correspondência')} no cadastro. Carregue ou revise o cadastro de ERB.`,
        path: 'erb',
        tab: 'resolucao',
      })
  }
  if (r.wa)
    out.push({
      tone: 'green',
      area: 'WhatsApp e IPs',
      title: `WhatsApp: ${plural(r.wa.totals.sent + r.wa.totals.received, 'mensagem', 'mensagens')} e ${plural(r.wa.totals.calls, 'chamada')}`,
      detail: `${plural(r.wa.totals.contacts, 'contato')}, ${plural(r.wa_groups, 'grupo')}, ${plural(r.wa.totals.ips, 'IP')} e ${plural(r.wa.totals.devices, 'aparelho')}.`,
      path: 'whatsapp',
    })
  if (t.tz_not_confirmed)
    out.push({
      tone: 'amber',
      area: 'Qualidade',
      title: `${plural(t.tz_not_confirmed, 'registro')} com fuso horário não confirmado`,
      detail: 'Interprete com cautela as comparações de horário entre fontes.',
      path: 'qualidade',
    })
  if (r.summary.excluded.duplicates)
    out.push({
      tone: 'gray',
      area: 'Qualidade',
      title: `${plural(r.summary.excluded.duplicates, 'registro duplicado', 'registros duplicados')} excluídos`,
      detail: 'Não entram nas estatísticas; veja a regra em Qualidade.',
      path: 'qualidade',
    })
  return out
}
