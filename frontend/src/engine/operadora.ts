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

// ---- base de operadora (ANATEL), carregada pelo usuário ----
export type OperadoraBase = { byPrefix: Map<string, string>; maxLen: number; count: number }

const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Lê um CSV da ANATEL (prefixos ou portabilidade) e monta um índice prefixo→operadora.
 * Detecta de forma flexível a coluna de prefixo/EOT e a de operadora/prestadora. Cada linha vira
 * um prefixo nacional (DDD+faixa) apontando para a operadora.
 */
export function parseOperadoraCsv(text: string): OperadoraBase {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) throw new Error('Arquivo vazio.')
  const delim = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const split = (l: string) => l.split(delim).map((c) => c.replace(/^"|"$/g, '').trim())
  const head = split(lines[0]).map(norm)
  const find = (...names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)))
  const iOper = find('operadora', 'prestadora', 'empresa', 'detentora', 'eild', 'razao')
  // colunas que ajudam a montar o prefixo nacional
  const iDDD = find('cn', 'ddd', 'codigo nacional', 'codnac')
  const iPref = find('prefixo', 'faixa', 'numero', 'telefone', 'msisdn', 'bloco')
  if (iOper < 0 || (iPref < 0 && iDDD < 0)) throw new Error('CSV não reconhecido: faltam colunas de prefixo/DDD e operadora.')
  const byPrefix = new Map<string, string>()
  let maxLen = 0
  for (let i = 1; i < lines.length; i++) {
    const c = split(lines[i])
    const oper = (c[iOper] || '').trim()
    if (!oper) continue
    let pref = ''
    if (iDDD >= 0) pref += (c[iDDD] || '').replace(/\D/g, '')
    if (iPref >= 0) pref += (c[iPref] || '').replace(/\D/g, '')
    pref = pref.slice(0, 7)
    if (pref.length < 3) continue
    byPrefix.set(pref, oper)
    if (pref.length > maxLen) maxLen = pref.length
  }
  if (!byPrefix.size) throw new Error('Nenhum prefixo válido encontrado no CSV.')
  return { byPrefix, maxLen, count: byPrefix.size }
}

/** Operadora de origem por casamento do maior prefixo (DDD+faixa). Null se não houver na base. */
export function lookupOperadora(base: OperadoraBase | null, p: PhoneInfo): string | null {
  if (!base || !p.valid) return null
  const key = p.digits
  for (let len = Math.min(base.maxLen, key.length); len >= 3; len--) {
    const hit = base.byPrefix.get(key.slice(0, len))
    if (hit) return hit
  }
  return null
}
