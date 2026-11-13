/**
 * MarxOperadora — inteligência de número de telefone brasileiro, 100% no navegador.
 *
 * O que é confiável e feito localmente: validação, formato E.164, DDD → região/UF e tipo
 * (móvel/fixo). A OPERADORA só é informada quando o usuário carrega a base pública da ANATEL
 * (dados abertos de numeração/portabilidade) — aí a consulta é real; sem a base, fica indisponível
 * (nada é inventado). Portabilidade pode ter mudado a operadora de origem da faixa.
 */

const DDD_UF: Record<string, string> = {
  '11': 'SP',
  '12': 'SP',
  '13': 'SP',
  '14': 'SP',
  '15': 'SP',
  '16': 'SP',
  '17': 'SP',
  '18': 'SP',
  '19': 'SP',
  '21': 'RJ',
  '22': 'RJ',
  '24': 'RJ',
  '27': 'ES',
  '28': 'ES',
  '31': 'MG',
  '32': 'MG',
  '33': 'MG',
  '34': 'MG',
  '35': 'MG',
  '37': 'MG',
  '38': 'MG',
  '41': 'PR',
  '42': 'PR',
  '43': 'PR',
  '44': 'PR',
  '45': 'PR',
  '46': 'PR',
  '47': 'SC',
  '48': 'SC',
  '49': 'SC',
  '51': 'RS',
  '53': 'RS',
  '54': 'RS',
  '55': 'RS',
  '61': 'DF',
  '62': 'GO',
  '64': 'GO',
  '63': 'TO',
  '65': 'MT',
  '66': 'MT',
  '67': 'MS',
  '68': 'AC',
  '69': 'RO',
  '71': 'BA',
  '73': 'BA',
  '74': 'BA',
  '75': 'BA',
  '77': 'BA',
  '79': 'SE',
  '81': 'PE',
  '87': 'PE',
  '82': 'AL',
  '83': 'PB',
  '84': 'RN',
  '85': 'CE',
  '88': 'CE',
  '86': 'PI',
  '89': 'PI',
  '91': 'PA',
  '93': 'PA',
  '94': 'PA',
  '92': 'AM',
  '97': 'AM',
  '95': 'RR',
  '96': 'AP',
  '98': 'MA',
  '99': 'MA',
}
const UF_NAME: Record<string, string> = {
  SP: 'São Paulo',
  RJ: 'Rio de Janeiro',
  ES: 'Espírito Santo',
  MG: 'Minas Gerais',
  PR: 'Paraná',
  SC: 'Santa Catarina',
  RS: 'Rio Grande do Sul',
  DF: 'Distrito Federal',
  GO: 'Goiás',
  TO: 'Tocantins',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  AC: 'Acre',
  RO: 'Rondônia',
  BA: 'Bahia',
  SE: 'Sergipe',
  PE: 'Pernambuco',
  AL: 'Alagoas',
  PB: 'Paraíba',
  RN: 'Rio Grande do Norte',
  CE: 'Ceará',
  PI: 'Piauí',
  PA: 'Pará',
  AM: 'Amazonas',
  RR: 'Roraima',
  AP: 'Amapá',
  MA: 'Maranhão',
}
const UF_REGIAO: Record<string, string> = {
  SP: 'Sudeste',
  RJ: 'Sudeste',
  ES: 'Sudeste',
  MG: 'Sudeste',
  PR: 'Sul',
  SC: 'Sul',
  RS: 'Sul',
  DF: 'Centro-Oeste',
  GO: 'Centro-Oeste',
  MT: 'Centro-Oeste',
  MS: 'Centro-Oeste',
  TO: 'Norte',
  AC: 'Norte',
  RO: 'Norte',
  PA: 'Norte',
  AM: 'Norte',
  RR: 'Norte',
  AP: 'Norte',
  BA: 'Nordeste',
  SE: 'Nordeste',
  PE: 'Nordeste',
  AL: 'Nordeste',
  PB: 'Nordeste',
  RN: 'Nordeste',
  CE: 'Nordeste',
  PI: 'Nordeste',
  MA: 'Nordeste',
}

export type PhoneInfo = {
  input: string
  digits: string // só dígitos nacionais (DDD + número), sem o 55
  valid: boolean
  e164: string | null // +55DDDNUMERO
  ddd: string | null
  uf: string | null
  ufName: string | null
  regiao: string | null
  tipo: 'movel' | 'fixo' | null
  pretty: string | null // (DD) 9XXXX-XXXX
  erro?: string
}

/** Lê um número brasileiro em qualquer formato e devolve os dados confiáveis (sem operadora). */
export function parsePhone(raw: string): PhoneInfo {
  const only = (raw || '').replace(/\D/g, '')
  const base: PhoneInfo = { input: raw, digits: '', valid: false, e164: null, ddd: null, uf: null, ufName: null, regiao: null, tipo: null, pretty: null }
  let d = only
  if (d.startsWith('55') && d.length > 11) d = d.slice(2) // tira o código do país
  if (d.length === 12 && d.startsWith('0')) d = d.slice(1)
  if (d.length < 10 || d.length > 11) return { ...base, digits: d, erro: 'Número inválido: informe DDD + número (10 ou 11 dígitos).' }
  const ddd = d.slice(0, 2)
  const uf = DDD_UF[ddd]
  if (!uf) return { ...base, digits: d, ddd, erro: `DDD ${ddd} não existe no plano de numeração brasileiro.` }
  const rest = d.slice(2)
  const movel = rest.length === 9 && rest[0] === '9'
  const fixo = rest.length === 8 && /^[2-5]/.test(rest)
  if (!movel && !fixo) return { ...base, digits: d, ddd, uf, ufName: UF_NAME[uf], regiao: UF_REGIAO[uf], erro: 'Número não parece um celular (9XXXX-XXXX) nem um fixo válido.' }
  const pretty = movel ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}` : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`
  return {
    input: raw,
    digits: d,
    valid: true,
    e164: `+55${d}`,
    ddd,
    uf,
    ufName: UF_NAME[uf],
    regiao: UF_REGIAO[uf],
    tipo: movel ? 'movel' : 'fixo',
    pretty,
  }
}

export const waLink = (p: PhoneInfo) => (p.valid ? `https://wa.me/55${p.digits}` : null)
export const tgLink = (p: PhoneInfo) => (p.valid ? `https://t.me/+55${p.digits}` : null)

/** Nome comercial curto a partir da razão social da ANATEL (ex.: "TELEFONICA BRASIL S.A." → "Vivo"). */
export function prettyOperadora(name: string | null): string | null {
  if (!name) return name
  const u = name.toUpperCase()
  if (u.includes('TELEFONICA') || u.includes('VIVO')) return 'Vivo'
  if (u.startsWith('TIM')) return 'TIM'
  if (u.includes('CLARO')) return 'Claro'
  if (u.includes('ALGAR')) return 'Algar'
  if (u.includes('SERCOMTEL')) return 'Sercomtel'
  if (u.includes('BRISANET')) return 'Brisanet'
  if (u.includes('SURF')) return 'Surf'
  if (u.includes('ARQIA')) return 'Arqia'
  if (u.includes('AMERICA NET')) return 'America Net'
  // demais MVNOs: usa a razão social sem os sufixos de tipo societário
  return name.replace(/\s+(S\/?A|S\.A\.?|LTDA|EIRELI|ME|EPP|SA)\b.*/i, '').trim() || name
}

// ---- base de operadora (ANATEL SMP), carregada pelo usuário ----
// Formato oficial (txt, separado por ';', codificação latin-1):
//   Nome da Prestadora;CNPJ;Código Nacional (DDD);Prefixo(5);Faixa Inicial(4);Faixa Final(4);Status
// Cada linha é uma faixa de MCDU (últimos 4 dígitos) dentro de DDD+Prefixo → operadora de origem.
export type OperadoraBase = {
  groups: Map<string, { ini: Uint16Array; fim: Uint16Array; op: Uint16Array }>
  ops: string[]
  count: number
}

/** Lê o arquivo SMP da ANATEL (GERAL ou incremental) e monta o índice DDD+Prefixo → faixas. */
export function parseAnatelSmp(text: string, into?: OperadoraBase): OperadoraBase {
  const ops = into?.ops ?? []
  const opId = new Map<string, number>()
  ops.forEach((n, i) => opId.set(n, i))
  // grupos temporários como arrays, depois compactados em TypedArray
  const tmp = new Map<string, { ini: number[]; fim: number[]; op: number[] }>()
  if (into) for (const [k, g] of into.groups) tmp.set(k, { ini: [...g.ini], fim: [...g.fim], op: [...g.op] })
  let count = into?.count ?? 0
  let nl = 0
  const n = text.length
  for (let i = 0; i < n; i = nl + 1) {
    nl = text.indexOf('\n', i)
    if (nl < 0) nl = n
    const line = text[nl - 1] === '\r' ? text.slice(i, nl - 1) : text.slice(i, nl)
    if (!line || line.charCodeAt(0) === 35) continue // vazia ou cabeçalho '#'
    const p = line.split(';')
    if (p.length < 7) continue
    if (p[6].trim() !== '1') continue // só faixas ativas
    const cn = p[2].trim()
    const pref = p[3].trim()
    if (cn.length !== 2 || pref.length !== 5) continue
    const name = p[0].trim()
    let id = opId.get(name)
    if (id === undefined) {
      id = ops.length
      ops.push(name)
      opId.set(name, id)
    }
    const key = cn + pref
    let g = tmp.get(key)
    if (!g) tmp.set(key, (g = { ini: [], fim: [], op: [] }))
    g.ini.push(+p[4])
    g.fim.push(+p[5])
    g.op.push(id)
    count++
  }
  const groups = new Map<string, { ini: Uint16Array; fim: Uint16Array; op: Uint16Array }>()
  for (const [k, g] of tmp) {
    // ordena por início
    const idx = g.ini.map((_, i) => i).sort((a, b) => g.ini[a] - g.ini[b])
    groups.set(k, {
      ini: Uint16Array.from(idx, (i) => g.ini[i]),
      fim: Uint16Array.from(idx, (i) => g.fim[i]),
      op: Uint16Array.from(idx, (i) => g.op[i]),
    })
  }
  return { groups, ops, count }
}

/** Operadora de origem do número pela base ANATEL (respeita a faixa de MCDU). Null se não houver. */
export function lookupOperadora(base: OperadoraBase | null, p: PhoneInfo): string | null {
  if (!base || !p.valid || p.tipo !== 'movel') return null // a base SMP é só de celulares
  const key = p.digits.slice(0, 7) // DDD(2) + Prefixo(5)
  const mcdu = +p.digits.slice(7) // últimos 4 dígitos
  const g = base.groups.get(key)
  if (!g) return null
  for (let i = 0; i < g.ini.length; i++) if (mcdu >= g.ini[i] && mcdu <= g.fim[i]) return base.ops[g.op[i]]
  return null
}
