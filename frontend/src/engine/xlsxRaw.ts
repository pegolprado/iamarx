/**
 * Leitor próprio de XLSX, tolerante a planilhas geradas por sistemas (operadoras, interceptação):
 * sem sharedStrings (texto "inline"), células sem referência (sem r="A1"), dimensão do
 * cabeçalho errada (ex.: diz A1:T14 com 11 mil linhas). Lê o XML da planilha direto.
 */
import { unzipSync } from 'fflate'

const dec = new TextDecoder('utf-8')
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const unescape = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()],
  )
/** Texto de um <si>/<is>: junta todos os <t> (inclui texto rico). */
const textOf = (xml: string) => unescape([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''))

const colIndex = (ref: string) => {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? ''
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

const DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])
const pad = (n: number) => String(n).padStart(2, '0')
function serialToText(v: number): string {
  const ms = Math.round((v - 25569) * 86400000)
  const d = new Date(ms)
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  const secs = Math.round((v % 1) * 86400)
  return secs ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` : date
}

export type XlsxSheet = { name: string; rows: Iterable<string[]> }

/** Abre o arquivo e devolve os nomes das planilhas e um leitor de linhas da planilha escolhida. */
export function readXlsx(buf: Uint8Array, wanted?: string | null): { sheets: string[]; sheet: string; rows: () => Generator<[number, string[]]> } {
  const files = unzipSync(buf, { filter: (f) => f.name.startsWith('xl/') && !f.name.startsWith('xl/media/') })
  const read = (p: string) => (files[p] ? dec.decode(files[p]) : '')
  const wbXml = read('xl/workbook.xml')
  const rels = read('xl/_rels/workbook.xml.rels')
  const relTarget = new Map([...rels.matchAll(/<Relationship\b[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)].map((m) => [m[1], m[2]]))
  for (const m of rels.matchAll(/<Relationship\b[^>]*?Target="([^"]+)"[^>]*?Id="([^"]+)"/g)) relTarget.set(m[2], m[1])
  const sheets = [...wbXml.matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => {
    const name = unescape(/name="([^"]*)"/.exec(m[1])?.[1] ?? '')
    const rid = /r:id="([^"]*)"/.exec(m[1])?.[1] ?? ''
    let target = relTarget.get(rid) ?? ''
    target = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
    return { name, path: target }
  })
  if (!sheets.length)
    for (const p of Object.keys(files).filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))) sheets.push({ name: p.split('/').pop()!.replace('.xml', ''), path: p })
  if (!sheets.length) throw new Error('planilha sem abas reconhecíveis')
  // aba escolhida, ou a maior (mais dados)
  const pick = sheets.find((s) => s.name === wanted) ?? [...sheets].sort((a, b) => (files[b.path]?.length ?? 0) - (files[a.path]?.length ?? 0))[0]

  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
  const styles = read('xl/styles.xml')
  const customDate = new Set(
    [...styles.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)].filter((m) => /[dmyhs]/i.test(m[2].replace(/"[^"]*"|\[[^\]]*\]/g, ''))).map((m) => +m[1]),
  )
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? ''
  const dateStyle = [...xfs.matchAll(/<xf\b([^>]*)/g)].map((m) => {
    const id = +(/numFmtId="(\d+)"/.exec(m[1])?.[1] ?? 0)
    return DATE_IDS.has(id) || customDate.has(id)
  })
  const xml = read(pick.path)

  function* rows(): Generator<[number, string[]]> {
    let seq = 0
    for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rAttr = /\br="(\d+)"/.exec(rm[1])
      const rowNum = rAttr ? +rAttr[1] : seq + 1
      seq = rowNum
      const cells: string[] = []
      let col = 0
      for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1]
        const ref = /\br="([A-Z]+)\d*"/i.exec(attrs)
        if (ref) col = colIndex(ref[1])
        const t = /\bt="([^"]+)"/.exec(attrs)?.[1]
        const body = cm[2] ?? ''
        let v = ''
        if (t === 'inlineStr') v = textOf(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '')
        else {
          const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
          if (raw !== undefined) {
            if (t === 's') v = shared[+raw] ?? ''
            else if (t === 'str' || t === 'e') v = unescape(raw)
            else if (t === 'b') v = raw === '1' ? 'VERDADEIRO' : 'FALSO'
            else {
              const s = +(/\bs="(\d+)"/.exec(attrs)?.[1] ?? 0)
              const n = Number(raw)
              v = dateStyle[s] && Number.isFinite(n) ? serialToText(n) : raw
            }
          }
        }
        while (cells.length < col) cells.push('')
        cells[col] = v
        col++
      }
      yield [rowNum, cells]
    }
  }
  return { sheets: sheets.map((s) => s.name), sheet: pick.name, rows }
}
