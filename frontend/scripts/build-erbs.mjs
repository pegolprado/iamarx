/**
 * Gera a camada "ERBs" do mapa: todas as estações do Serviço Móvel Pessoal (SMP) licenciadas
 * na Anatel (dados abertos, "Estações do SMP"), agrupadas por posição e divididas em quadrículas
 * de 1° para o navegador baixar só a região visível.
 *
 * Fonte: https://www.anatel.gov.br/dadosabertos/paineis_de_dados/outorga_e_licenciamento/estacoes_smp.zip
 * Uso: unzip estacoes_smp.zip && node scripts/build-erbs.mjs Estacoes_SMP.csv
 * Saída: public/vendor/erbs/index.json + public/vendor/erbs/<lat>_<lon>.json.gz
 *
 * Quadrícula: { o: [operadoras], s: [[lat×1e5, lon×1e5, máscara de operadoras, máscara 2G/3G/4G/5G, endereço, município/UF], ...] }
 */
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import zlib from 'node:zlib'

const file = process.argv[2]
if (!file) {
  console.error('uso: node scripts/build-erbs.mjs Estacoes_SMP.csv')
  process.exit(1)
}
const out = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'vendor', 'erbs')
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

function parse(line) {
  const r = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"' && line[i + 1] === '"') ((cur += '"'), i++)
      else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ';') (r.push(cur), (cur = ''))
    else cur += ch
  }
  r.push(cur)
  return r
}

const OPS = ['VIVO', 'TIM', 'CLARO', 'OUTRAS']
const opIndex = (e) => {
  const i = OPS.indexOf(e)
  return i >= 0 && i < 3 ? i : 3
}
const GEN = { '2G': 1, '3G': 2, '4G': 4, '5G': 8 }
const clean = (s) => s.replace(/\s+/g, ' ').trim()
const title = (s) =>
  clean(s)
    .toLowerCase()
    .replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())

// estação → dados; depois agrupadas por posição
const st = new Map()
let ix = null
const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity })
for await (let line of rl) {
  if (!ix) {
    ix = Object.fromEntries(parse(line.replace(/^﻿/, '')).map((k, i) => [k, i]))
    continue
  }
  const r = parse(line)
  const lat = parseFloat((r[ix['Latitude decimal']] || r[ix['Latitude']] || '').replace(',', '.'))
  const lon = parseFloat((r[ix['Longitude decimal']] || r[ix['Longitude']] || '').replace(',', '.'))
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 35 || lon > -28 || lon < -75) continue
  const id = r[ix['Número Estação']]
  let s = st.get(id)
  if (!s) {
    const end = [clean(r[ix['EnderecoEstacao']] || ''), clean(r[ix['EndNumero']] || '')].filter(Boolean).join(', ')
    const bairro = clean(r[ix['EndBairro']] || '')
    st.set(
      id,
      (s = {
        lat,
        lon,
        op: opIndex(r[ix['Empresa Estação']]),
        name: r[ix['Empresa Estação']],
        gen: 0,
        addr: [title(end), title(bairro)].filter(Boolean).join(' - '),
        mun: '',
        uf: r[ix['UF']] || '',
      }),
    )
  }
  s.gen |= GEN[r[ix['Geração']]] || 0
  if (!s.mun && r[ix['Município-UF']]) s.mun = title(r[ix['Município-UF']]).replace(/-(\w\w)$/, (m, u) => '/' + u.toUpperCase())
}

// agrupa por posição (~1 m) — várias operadoras no mesmo ponto viram um único marcador
const sites = new Map()
for (const s of st.values()) {
  const k = `${Math.round(s.lat * 1e5)},${Math.round(s.lon * 1e5)}`
  let g = sites.get(k)
  if (!g) sites.set(k, (g = { la: Math.round(s.lat * 1e5), lo: Math.round(s.lon * 1e5), ops: 0, gen: 0, addr: s.addr, mun: s.mun || s.uf, others: new Set() }))
  g.ops |= 1 << s.op
  g.gen |= s.gen
  if (s.op === 3) g.others.add(s.name)
  if (!g.mun.includes('/') && s.mun) g.mun = s.mun
  if (!g.addr && s.addr) g.addr = s.addr
}

const tiles = new Map()
for (const g of sites.values()) {
  const k = `${Math.floor(g.la / 1e5)}_${Math.floor(g.lo / 1e5)}`
  if (!tiles.has(k)) tiles.set(k, [])
  tiles.get(k).push([g.la, g.lo, g.ops, g.gen, g.addr, g.mun, [...g.others].join(', ')])
}
let bytes = 0
for (const [k, s] of tiles) {
  const gz = zlib.gzipSync(JSON.stringify({ s }), { level: 9 })
  bytes += gz.length
  fs.writeFileSync(path.join(out, `${k}.json.gz`), gz)
}
const counts = [0, 0, 0, 0]
for (const s of st.values()) counts[s.op]++
fs.writeFileSync(
  path.join(out, 'index.json'),
  JSON.stringify({
    source: 'Anatel — Dados Abertos, Estações do SMP',
    generated: new Date().toISOString().slice(0, 10),
    stations: st.size,
    sites: sites.size,
    operators: OPS,
    counts,
    tiles: [...tiles.keys()].sort(),
  }),
)
fs.writeFileSync(
  path.join(out, 'LICENSE.txt'),
  'Estações do SMP licenciadas — Anatel, Dados Abertos (https://www.gov.br/anatel/pt-br/dados/dados-abertos).\nPosição informada pelas operadoras; gerado por scripts/build-erbs.mjs.\n',
)
console.log(`${st.size} estações, ${sites.size} posições, ${tiles.size} quadrículas, ${(bytes / 1e6).toFixed(1)} MB`, counts)
