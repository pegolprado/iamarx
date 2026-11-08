/**
 * Foto do mapa (PNG) gerada no navegador: enquadra automaticamente as ERBs, setores e pontos,
 * baixa as imagens do mapa (OpenStreetMap; Esri se falhar) e desenha por cima os setores, a
 * linha do azimute, as antenas e os nomes. Nada é enviado a servidor.
 */
import { dest, markHex, MARK_ICON_SVG, pinSvg, sector } from '../components/LocationMap'
import type { MapMark, SharedMap } from './shareMap'

const TILE = 256
const W = 1280
const H = 860
const FOOT = 0

type XY = [number, number]
const worldPx = (lat: number, lon: number, z: number): XY => {
  const s = TILE * 2 ** z
  const sin = Math.sin((lat * Math.PI) / 180)
  return [((lon + 180) / 360) * s, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s]
}

function loadImg(src: string, cors: boolean, ms = 9000): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image()
    if (cors) {
      img.crossOrigin = 'anonymous'
      img.referrerPolicy = 'strict-origin-when-cross-origin'
    }
    const t = setTimeout(() => res(null), ms)
    img.onload = () => (clearTimeout(t), res(img))
    img.onerror = () => (clearTimeout(t), res(null))
    img.src = src
  })
}
const svgImg = (svg: string) => loadImg(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, false)

const towerSvg = (c: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="${c}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${MARK_ICON_SVG.erb}</svg>`

type Layer = { lat: number; lon: number; az: number | null; dist: number; beam: number; color: string; label: string; count?: number; redLine: boolean }

/** Gera o PNG do mapa. `onStep` informa o andamento. */
export async function renderMapImage(m: SharedMap, opts: { radius: number; beam: number; showAnalysis?: boolean }, onStep?: (s: string) => void): Promise<Blob> {
  const layers: Layer[] = []
  if (opts.showAnalysis !== false)
    for (const p of m.points) {
      const g = p.g !== undefined ? m.groups?.[p.g] : undefined
      if (g?.hidden) continue
      const cells = p.cl ?? p.az.map((a) => ['', a, 0] as [string, number | null, number])
      const azs = cells.map((c) => c[1]).filter((x): x is number => x !== null)
      const color = g?.color ?? '#2563eb'
      if (!azs.length) layers.push({ lat: p.lat, lon: p.lon, az: null, dist: opts.radius, beam: opts.beam, color, label: '', count: p.events, redLine: false })
      azs.forEach((az, i) =>
        layers.push({ lat: p.lat, lon: p.lon, az, dist: opts.radius, beam: opts.beam, color, label: '', count: i === 0 ? p.events : undefined, redLine: false }),
      )
    }
  const pins: MapMark[] = []
  for (const k of m.marks ?? []) {
    if (k.hidden) continue
    if (k.kind === 'erb')
      layers.push({ lat: k.lat, lon: k.lon, az: k.az ?? null, dist: k.dist || opts.radius, beam: k.beam || opts.beam, color: markHex(k), label: k.label, redLine: true })
    else pins.push(k)
  }
  if (!layers.length && !pins.length) throw new Error('Adicione uma ERB ou um ponto antes de gerar a foto.')

  // enquadramento: tudo o que está desenhado (inclusive a ponta dos setores)
  const ll: XY[] = []
  for (const l of layers) {
    ll.push([l.lat, l.lon])
    if (l.az !== null) ll.push(...sector(l.lat, l.lon, l.az, l.dist, l.beam))
  }
  for (const p of pins) ll.push([p.lat, p.lon])
  const PAD = 70
  let z = 18
  for (; z > 3; z--) {
    const px = ll.map(([a, b]) => worldPx(a, b, z))
    const w = Math.max(...px.map((p) => p[0])) - Math.min(...px.map((p) => p[0]))
    const h = Math.max(...px.map((p) => p[1])) - Math.min(...px.map((p) => p[1]))
    if (w <= W - 2 * PAD && h <= H - FOOT - 2 * PAD - 30) break
  }
  z = Math.min(z, 17)
  const px = ll.map(([a, b]) => worldPx(a, b, z))
  const cx = (Math.max(...px.map((p) => p[0])) + Math.min(...px.map((p) => p[0]))) / 2
  const cy = (Math.max(...px.map((p) => p[1])) + Math.min(...px.map((p) => p[1]))) / 2
  const ox = cx - W / 2
  const oy = cy - H / 2 + 12
  const at = (lat: number, lon: number): XY => {
    const [x, y] = worldPx(lat, lon, z)
    return [x - ox, y - oy]
  }

  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#e9edf1'
  ctx.fillRect(0, 0, W, H)

  // imagens do mapa
  onStep?.('Baixando o mapa…')
  const n = 2 ** z
  const jobs: Promise<void>[] = []
  let failed = 0
  for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + W) / TILE); tx++)
    for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + H) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue
      const x = ((tx % n) + n) % n
      jobs.push(
        (async () => {
          const img =
            (await loadImg(`https://tile.openstreetmap.org/${z}/${x}/${ty}.png`, true)) ??
            (await loadImg(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${ty}/${x}`, true))
          if (img) ctx.drawImage(img, tx * TILE - ox, ty * TILE - oy)
          else failed++
        })(),
      )
    }
  await Promise.all(jobs)

  onStep?.('Desenhando as ERBs…')
  const font = (w: number, s: number) => `${w} ${s}px 'Inter Variable', Inter, system-ui, sans-serif`
  // setores
  for (const l of layers) {
    if (l.az === null) continue
    const poly = sector(l.lat, l.lon, l.az, l.dist, l.beam).map(([a, b]) => at(a, b))
    ctx.beginPath()
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.globalAlpha = 0.18
    ctx.fillStyle = l.color
    ctx.fill()
    ctx.globalAlpha = 0.9
    ctx.strokeStyle = l.color
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.globalAlpha = 1
    if (l.redLine) {
      const [x1, y1] = at(l.lat, l.lon)
      const [x2, y2] = at(...dest(l.lat, l.lon, l.az, l.dist))
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2.6
      ctx.stroke()
    }
  }
  const label = (text: string, x: number, y: number, bg = '#fff', fg = '#111827') => {
    ctx.font = font(600, 14)
    const w = ctx.measureText(text).width + 16
    ctx.fillStyle = bg
    ctx.strokeStyle = '#9ca3af'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x - w / 2, y, w, 24, 6)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = fg
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y + 12.5)
  }
  // antenas
  const icons = new Map<string, HTMLImageElement | null>()
  const icon = async (c: string) => {
    if (!icons.has(c)) icons.set(c, await svgImg(towerSvg(c)))
    return icons.get(c)!
  }
  const seen = new Set<string>()
  for (const l of layers) {
    const key = `${l.lat},${l.lon},${l.color},${l.label}`
    if (seen.has(key)) continue
    seen.add(key)
    const [x, y] = at(l.lat, l.lon)
    const img = await icon(l.color)
    if (img) {
      ctx.save()
      ctx.shadowColor = '#fff'
      ctx.shadowBlur = 4
      ctx.drawImage(img, x - 15, y - 15, 30, 30)
      ctx.restore()
    }
    if (l.label) label(l.label, x, y + 18)
    else if (l.count !== undefined) {
      ctx.font = font(700, 12)
      const t = l.count.toLocaleString('pt-BR')
      const w = ctx.measureText(t).width + 10
      ctx.fillStyle = l.color
      ctx.beginPath()
      ctx.roundRect(x - w / 2, y + 14, w, 17, 4)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(t, x, y + 23)
    }
  }
  // pontos
  for (const p of pins) {
    const [x, y] = at(p.lat, p.lon)
    const img = await svgImg(pinSvg(p.kind, markHex(p), 40))
    if (img) ctx.drawImage(img, x - 20, y - 48, 40, 50)
    if (p.label) label(p.label, x, y + 6)
  }
  // só o mapa e os desenhos; crédito mínimo do mapa no canto (exigido pelo OpenStreetMap)
  ctx.font = font(500, 10)
  const credit = '© OpenStreetMap'
  const cw = ctx.measureText(credit).width + 8
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fillRect(W - cw, H - 15, cw, 15)
  ctx.fillStyle = '#4b5563'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText(credit, W - 4, H - 7.5)
  void failed

  return new Promise((res, rej) => {
    try {
      cv.toBlob((b) => (b ? res(b) : rej(new Error('Não foi possível gerar a imagem.'))), 'image/png')
    } catch {
      rej(new Error('O navegador bloqueou a imagem do mapa. Tente de novo em instantes.'))
    }
  })
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = () => rej(r.error)
    r.readAsDataURL(b)
  })

/** PDF para relatório: foto do mapa, link da análise e a lista de ERBs e pontos. */
export async function exportMapPdf(m: SharedMap, opts: { radius: number; beam: number; showAnalysis?: boolean; link: string }, onStep?: (s: string) => void) {
  const png = await renderMapImage(m, opts, onStep)
  onStep?.('Montando o PDF…')
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  const w = doc.internal.pageSize.getWidth()
  const title = m.title && !['Mapas ERB', 'MARX Mapas ERB'].includes(m.title) ? m.title : 'Mapa de ERBs'
  doc.setFillColor(29, 78, 216)
  doc.rect(0, 0, w, 14, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('MARX Mapas ERB', 10, 9)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`${title} · gerado em ${new Date().toLocaleString('pt-BR')}`, w - 10, 9, { align: 'right' })
  // mantém a proporção da foto (sem achatar)
  const imgH = Math.min(((w - 20) * H) / W, 150)
  const imgW = (imgH * W) / H
  doc.addImage(await blobToDataUrl(png), 'PNG', (w - imgW) / 2, 18, imgW, imgH)
  let y = 18 + imgH + 6
  doc.setTextColor(60, 60, 60)
  doc.setFontSize(8)
  doc.text(doc.splitTextToSize(`Link da análise (abre exatamente este mapa): ${opts.link}`, w - 20), 10, y)
  y += 8
  const rows: (string | number)[][] = []
  for (const k of m.marks ?? [])
    if (!k.hidden)
      rows.push([k.kind === 'erb' ? 'ERB' : 'Ponto', k.label, k.lat.toFixed(6), k.lon.toFixed(6), k.kind === 'erb' && k.az !== null && k.az !== undefined ? `${k.az}°` : '—', '—'])
  if (opts.showAnalysis !== false)
    for (const p of m.points) {
      const g = p.g !== undefined ? m.groups?.[p.g] : undefined
      if (g?.hidden) continue
      const az = (p.cl ?? []).map((c) => c[1]).filter((x) => x !== null)
      rows.push([
        g?.name ?? 'ERB da análise',
        p.name ?? (p.cl ?? []).map((c) => c[0]).join(', '),
        p.lat.toFixed(6),
        p.lon.toFixed(6),
        az.length ? `${az.join('/')}°` : '—',
        p.events,
      ])
    }
  autoTable(doc, {
    startY: y,
    head: [['Tipo / número', 'Nome / endereço', 'Latitude', 'Longitude', 'Azimute', 'Eventos']],
    body: rows,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [29, 78, 216] },
    margin: { left: 10, right: 10 },
  })
  const end = (doc as any).lastAutoTable?.finalY ?? y
  doc.setFontSize(7.5)
  doc.setTextColor(110, 110, 110)
  doc.text(
    doc.splitTextToSize(
      `Caráter ilustrativo: distância (${opts.radius} m) e abertura (${opts.beam}°) do setor são valores médios de referência e devem ser ajustados às características da antena e do local; cabe ao analista validar a representação com o extrato da operadora. Antenas plotadas a partir das coordenadas informadas; a posição da ERB não é a posição do aparelho.`,
      w - 20,
    ),
    10,
    Math.min(end + 6, doc.internal.pageSize.getHeight() - 12),
  )
  doc.save(`${title.replace(/[^\w.-]+/g, '_').slice(0, 60)}.pdf`)
}
