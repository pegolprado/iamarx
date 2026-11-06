/**
 * Gera a base compacta de IP → provedor (ASN) e IP → cidade/UF (Brasil) ou país (exterior),
 * usada no navegador pelas análises de bilhetagem do WhatsApp (nada é consultado fora do site).
 *
 * Fontes (pacotes npm do projeto ip-location-db):
 *   @ip-location-db/iptoasn-asn  — IPtoASN, licença PDDL 1.0
 *   @ip-location-db/dbip-city    — DB-IP City Lite, licença CC BY 4.0 ("IP Geolocation by DB-IP")
 *
 * Uso: node scripts/build-ipdb.mjs <pasta iptoasn-asn/package> <pasta dbip-city/package>
 * Saída: public/vendor/ipdb/*.gz
 *
 * Formato binário (little-endian): ranges ordenados pelo início; cada entrada = início + índice do
 * valor (0xFFFFFFFF = sem dado). IPv4 usa 32 bits; IPv6 usa os 64 bits mais altos (/64).
 */
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import zlib from 'node:zlib'

const [asnDir, cityDir] = process.argv.slice(2)
if (!asnDir || !cityDir) {
  console.error('uso: node scripts/build-ipdb.mjs <iptoasn-asn/package> <dbip-city/package>')
  process.exit(1)
}
const out = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'vendor', 'ipdb')
fs.mkdirSync(out, { recursive: true })
const NONE = 0xffffffff

function v4(s) {
  return s.split('.').reduce((a, o) => a * 256 + Number(o), 0)
}
/** 64 bits mais altos de um IPv6, como BigInt. */
function v6hi(s) {
  let [head, tail] = s.split('::')
  const h = head ? head.split(':') : []
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : []
  const groups = tail !== undefined ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h
  return groups.slice(0, 4).reduce((a, g) => (a << 16n) | BigInt(parseInt(g || '0', 16)), 0n)
}

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"' && line[i + 1] === '"') ((cur += '"'), i++)
      else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') (out.push(cur), (cur = ''))
    else cur += ch
  }
  out.push(cur)
  return out
}

async function* lines(file) {
  const input = file.endsWith('.gz') ? fs.createReadStream(file).pipe(zlib.createGunzip()) : fs.createReadStream(file)
  for await (const l of readline.createInterface({ input, crlfDelay: Infinity })) if (l) yield parseCsvLine(l)
}

/** Monta a tabela de ranges, com lacunas como NONE e ranges vizinhos de mesmo valor fundidos. */
async function build(file, isV6, valueOf, names) {
  const index = new Map()
  const idx = (v) => {
    if (v === null) return NONE
    let i = index.get(v)
    if (i === undefined) (index.set(v, (i = names.length)), names.push(v))
    return i
  }
  const starts = []
  const vals = []
  let lastEnd = null
  const conv = isV6 ? v6hi : (s) => BigInt(v4(s))
  for await (const row of lines(file)) {
    const a = conv(row[0])
    const b = conv(row[1])
    const v = idx(valueOf(row))
    if (lastEnd !== null && a > lastEnd + 1n && vals[vals.length - 1] !== NONE) (starts.push(lastEnd + 1n), vals.push(NONE))
    if (vals.length && vals[vals.length - 1] === v && starts[starts.length - 1] <= a) {
      // mesmo valor do range anterior: estende
    } else if (starts.length && starts[starts.length - 1] === a) vals[vals.length - 1] = v
    else (starts.push(a), vals.push(v))
    if (lastEnd === null || b > lastEnd) lastEnd = b
  }
  const w = isV6 ? 8 : 4
  const buf = Buffer.alloc(starts.length * (w + 4))
  starts.forEach((s, i) => {
    const o = i * (w + 4)
    if (isV6) buf.writeBigUInt64LE(s, o)
    else buf.writeUInt32LE(Number(s), o)
    buf.writeUInt32LE(vals[i], o + w)
  })
  return buf
}

const write = (name, data) => {
  const gz = zlib.gzipSync(data, { level: 9 })
  fs.writeFileSync(path.join(out, name + '.gz'), gz)
  console.log(name, data.length, '→', gz.length)
}

// provedor (ASN)
const asnNames = []
const asnVal = (r) => `${r[2]}|${r[3]}`
write('asn4.bin', await build(path.join(asnDir, 'iptoasn-asn-ipv4.csv'), false, asnVal, asnNames))
write('asn6.bin', await build(path.join(asnDir, 'iptoasn-asn-ipv6.csv'), true, asnVal, asnNames))
write('asn.json', Buffer.from(JSON.stringify(asnNames)))

// cidade/UF no Brasil; só o país no exterior
const geoNames = []
const geoVal = (r) => (r[2] === 'BR' ? `BR|${r[3]}|${r[5]}` : r[2] || null)
write('geo4.bin', await build(path.join(cityDir, 'dbip-city-ipv4.csv.gz'), false, geoVal, geoNames))
write('geo6.bin', await build(path.join(cityDir, 'dbip-city-ipv6.csv.gz'), true, geoVal, geoNames))
write('geo.json', Buffer.from(JSON.stringify(geoNames)))

fs.writeFileSync(
  path.join(out, 'LICENSE.txt'),
  'Provedor (ASN): IPtoASN (https://iptoasn.com), licença PDDL 1.0.\nCidade/país: IP Geolocation by DB-IP (https://db-ip.com), licença CC BY 4.0.\nGerado por scripts/build-ipdb.mjs a partir dos pacotes @ip-location-db.\n',
)
