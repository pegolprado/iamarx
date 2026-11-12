import { AlertTriangle, CheckCircle2, Download, Fingerprint, Image as ImageIcon, RefreshCw, ScanFace, ShieldCheck, Trash2, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Notice } from '../../components/ui'
import {
  type DetectedFace,
  type FaceMetrics,
  type ImageQuality,
  type Trait,
  type Verdict,
  compareVisual,
  descriptorDistance,
  detectFaces,
  distanceToSimilarity,
  faceMetrics,
  imageQuality,
  loadFace,
  verdictFor,
} from '../../engine/face'
import { ToolTitle } from './common'

type Mode = 'identidade' | 'semelhanca'
type Slot = { file: File; url: string; img: HTMLImageElement; canvas: HTMLCanvasElement; faces: DetectedFace[]; pick: number; quality: ImageQuality }

const MAXW = 1024 // trabalha numa escala padronizada (rápido e consistente)
const ACCEPT = 'image/jpeg,image/png,image/webp'

async function loadImage(file: File): Promise<{ img: HTMLImageElement; canvas: HTMLCanvasElement; url: string }> {
  const url = URL.createObjectURL(file)
  const img = new Image()
  await new Promise<void>((res, rej) => {
    img.onload = () => res()
    img.onerror = () => rej(new Error('Arquivo de imagem inválido ou corrompido.'))
    img.src = url
  })
  const scale = Math.min(1, MAXW / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { img, canvas, url }
}

/** Desenha a imagem com a caixa e os 68 pontos do rosto escolhido. */
function renderFace(slot: Slot, size = 420): HTMLCanvasElement {
  const { canvas, faces, pick } = slot
  const out = document.createElement('canvas')
  const scale = Math.min(size / canvas.width, size / canvas.height)
  out.width = Math.round(canvas.width * scale)
  out.height = Math.round(canvas.height * scale)
  const ctx = out.getContext('2d')!
  ctx.drawImage(canvas, 0, 0, out.width, out.height)
  faces.forEach((f, i) => {
    const sel = i === pick
    ctx.strokeStyle = sel ? '#22e06a' : 'rgba(120,180,255,0.6)'
    ctx.lineWidth = sel ? 3 : 1.5
    ctx.strokeRect(f.box.x * scale, f.box.y * scale, f.box.width * scale, f.box.height * scale)
    if (sel) {
      ctx.fillStyle = '#22e06a'
      for (const p of f.landmarks) {
        ctx.beginPath()
        ctx.arc(p.x * scale, p.y * scale, 1.8, 0, Math.PI * 2)
        ctx.fill()
      }
    } else {
      ctx.fillStyle = 'rgba(120,180,255,0.9)'
      ctx.fillText(String(i + 1), f.box.x * scale + 4, f.box.y * scale + 14)
    }
  })
  return out
}

export default function FaceCompare() {
  const [mode, setMode] = useState<Mode>('identidade')
  const [slots, setSlots] = useState<(Slot | null)[]>([null, null])
  const [busy, setBusy] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [result, setResult] = useState<CompareResult | null>(null)

  useEffect(
    () => () => slots.forEach((s) => s && URL.revokeObjectURL(s.url)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const setSlot = (i: number, s: Slot | null) =>
    setSlots((prev) => {
      const next = [...prev]
      if (prev[i]) URL.revokeObjectURL(prev[i]!.url)
      next[i] = s
      return next
    })

  const addImage = async (i: number, file: File) => {
    if (!ACCEPT.split(',').includes(file.type)) return toast.error('Formato não aceito. Use JPG, PNG ou WEBP.')
    if (file.size > 25 * 1024 * 1024) return toast.error('Imagem muito grande (máx. 25 MB).')
    setResult(null)
    setBusy('Analisando a imagem…')
    try {
      const needDesc = mode === 'identidade'
      const fa = await loadFace(setBusy, needDesc)
      const { img, canvas, url } = await loadImage(file)
      setBusy('Detectando rostos…')
      const faces = await detectFaces(fa, canvas, needDesc)
      if (!faces.length) {
        URL.revokeObjectURL(url)
        return toast.error('Nenhum rosto detectado nesta imagem. Use uma foto nítida, de frente.')
      }
      const quality = imageQuality(canvas, faces[0])
      setSlot(i, { file, url, img, canvas, faces, pick: 0, quality })
      if (faces.length > 1) toast.info(`${faces.length} rostos detectados na imagem ${i + 1}. Toque no rosto correto para selecioná-lo.`)
    } catch (e: any) {
      toast.error(`Falha ao analisar: ${e?.message ?? e}`)
    } finally {
      setBusy(null)
    }
  }

  const run = async () => {
    const [a, b] = slots
    if (!a || !b) return toast.error('Envie as duas fotografias.')
    if (mode === 'identidade' && !consent) return toast.error('Confirme o consentimento para a análise de identidade.')
    setBusy('Comparando…')
    try {
      let s0 = a
      let s1 = b
      // na modalidade de identidade precisamos do descritor; se a foto foi analisada no modo
      // semelhança (sem descritor), re-analisa agora carregando o modelo de identidade.
      if (mode === 'identidade' && (!a.faces[a.pick].descriptor || !b.faces[b.pick].descriptor)) {
        const fa = await loadFace(setBusy, true)
        const redo = async (s: Slot) => (s.faces[s.pick].descriptor ? s : { ...s, faces: await detectFaces(fa, s.canvas, true), pick: 0 })
        s0 = await redo(a)
        s1 = await redo(b)
        setSlots((prev) => prev.map((s, k) => (k === 0 ? s0 : k === 1 ? s1 : s)))
      }
      const fa = s0.faces[s0.pick]
      const fb = s1.faces[s1.pick]
      const dist = fa.descriptor && fb.descriptor ? descriptorDistance(fa.descriptor, fb.descriptor) : null
      setResult({
        mode,
        at: new Date(),
        distance: dist,
        similarity: dist === null ? null : distanceToSimilarity(dist),
        verdict: dist === null ? null : verdictFor(dist),
        traits: compareVisual(faceMetrics(fa.landmarks), faceMetrics(fb.landmarks)),
        quality: [s0.quality, s1.quality],
        imgs: [renderFace(s0).toDataURL('image/jpeg', 0.85), renderFace(s1).toDataURL('image/jpeg', 0.85)],
      })
    } catch (e: any) {
      toast.error(`Falha ao comparar: ${e?.message ?? e}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <ToolTitle icon={<ScanFace />} title="MarxCompare — análise e comparação de fotografias" />
      <p className="max-w-3xl text-[13.5px] text-muted">
        Compara dois rostos diretamente no seu navegador (os modelos rodam aqui; nenhuma foto é enviada ou guardada). Duas modalidades: <b className="text-text">Identidade</b>{' '}
        (compatibilidade biométrica entre duas fotos) e <b className="text-text">Semelhança visual</b> (descrição de formatos e proporções). O resultado é indicativo e não é prova
        de identidade, parentesco ou origem.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <ModeCard
          active={mode === 'identidade'}
          onClick={() => setMode('identidade')}
          icon={<Fingerprint className="h-4 w-4" />}
          title="Análise de identidade"
          text="Avalia a compatibilidade biométrica entre duas fotos (mesma pessoa?), com descritor facial e limiar de decisão."
        />
        <ModeCard
          active={mode === 'semelhanca'}
          onClick={() => setMode('semelhanca')}
          icon={<Users className="h-4 w-4" />}
          title="Semelhança visual"
          text="Descreve semelhanças e diferenças de formato e proporção do rosto, olhos, nariz e boca. Não determina identidade nem parentesco."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <ImageSlot
            key={i}
            index={i}
            slot={slots[i]}
            onPick={(file) => addImage(i, file)}
            onClear={() => (setSlot(i, null), setResult(null))}
            onSelectFace={(p) => setSlots((prev) => prev.map((s, k) => (k === i && s ? { ...s, pick: p } : s)))}
          />
        ))}
      </div>

      {mode === 'identidade' && (
        <label className="card flex items-start gap-2 p-3 text-sm">
          <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span className="text-muted">
            Declaro ter autorização/consentimento das pessoas retratadas para esta análise de identidade, em conformidade com a LGPD. As fotos são processadas apenas no meu
            navegador e não são armazenadas.
          </span>
        </label>
      )}

      <button className="btn-primary w-full" onClick={run} disabled={!!busy || !slots[0] || !slots[1]}>
        {busy ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" /> {busy}
          </>
        ) : (
          <>
            <ScanFace className="h-4 w-4" /> Comparar rostos
          </>
        )}
      </button>

      {result && <Report r={result} />}

      <Notice tone="amber">
        Ferramenta de apoio: o resultado é indicativo e pode errar com fotos de baixa qualidade, ângulos diferentes, idade distante, óculos ou oclusões. Não use como prova isolada
        de identidade, parentesco ou origem genética. Nada é enviado a servidor nem armazenado.
      </Notice>
    </div>
  )
}

type CompareResult = {
  mode: Mode
  at: Date
  distance: number | null
  similarity: number | null
  verdict: Verdict | null
  traits: Trait[]
  quality: [ImageQuality, ImageQuality]
  imgs: [string, string]
  metrics?: [FaceMetrics, FaceMetrics]
}

function ModeCard({ active, onClick, icon, title, text }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <button onClick={onClick} className={`card flex gap-3 p-4 text-left transition-colors ${active ? 'border-accent/60 bg-accent/5' : 'card-hover'}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border [&>svg]:h-4 [&>svg]:w-4 ${active ? 'border-accent/50 text-accent' : 'border-line text-muted'}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[14px] font-semibold text-white">
          {title}
          {active && <CheckCircle2 className="h-4 w-4 text-accent" />}
        </span>
        <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">{text}</span>
      </span>
    </button>
  )
}

function ImageSlot({
  index,
  slot,
  onPick,
  onClear,
  onSelectFace,
}: {
  index: number
  slot: Slot | null
  onPick: (f: File) => void
  onClear: () => void
  onSelectFace: (p: number) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState(false)
  useEffect(() => {
    if (!slot || !box.current) return
    box.current.innerHTML = ''
    const cv = renderFace(slot, 440)
    cv.className = 'w-full rounded-lg border border-line'
    cv.style.cursor = slot.faces.length > 1 ? 'pointer' : 'default'
    const scale = cv.width / slot.canvas.width
    cv.onclick = (e) => {
      if (slot.faces.length < 2) return
      const r = cv.getBoundingClientRect()
      const x = ((e.clientX - r.left) / r.width) * cv.width
      const y = ((e.clientY - r.top) / r.height) * cv.height
      const hit = slot.faces.findIndex((f) => x >= f.box.x * scale && x <= (f.box.x + f.box.width) * scale && y >= f.box.y * scale && y <= (f.box.y + f.box.height) * scale)
      if (hit >= 0) onSelectFace(hit)
    }
    box.current.appendChild(cv)
  }, [slot, onSelectFace])

  return (
    <div className="card p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <ImageIcon className="h-4 w-4 text-accent" /> Fotografia {index + 1}
      </h2>
      {slot ? (
        <div className="space-y-2">
          <div ref={box} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>
              {slot.canvas.width}×{slot.canvas.height}
            </span>
            {slot.faces.length > 1 && <span className="text-amber">{slot.faces.length} rostos — toque no correto</span>}
            {slot.quality.warnings.map((w) => (
              <span key={w} className="flex items-center gap-1 text-amber">
                <AlertTriangle className="h-3 w-3" /> {w}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 !py-1.5 text-xs" onClick={() => input.current?.click()}>
              <ImageIcon className="h-3.5 w-3.5 text-accent" /> Substituir
            </button>
            <button className="btn-ghost !py-1.5 text-xs" onClick={onClear}>
              <Trash2 className="h-3.5 w-3.5 text-danger" /> Remover
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => (e.preventDefault(), setDrag(false), e.dataTransfer.files[0] && onPick(e.dataTransfer.files[0]))}
          className={`flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-12 text-center transition-colors ${drag ? 'border-accent bg-accent/5' : 'border-line-2 hover:border-accent/60'}`}
        >
          <ImageIcon className="h-7 w-7 text-accent" />
          <span className="text-[13.5px] font-medium text-white">Arraste a foto aqui ou clique para selecionar</span>
          <span className="text-xs text-faint">JPG, PNG, WEBP</span>
        </button>
      )}
      <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => (e.target.files?.[0] && onPick(e.target.files[0]), (e.target.value = ''))} />
    </div>
  )
}

const VERDICT: Record<Verdict, { tone: string; label: string }> = {
  alta: { tone: 'text-ok', label: 'Alta compatibilidade — forte indício de ser a mesma pessoa' },
  media: { tone: 'text-amber', label: 'Compatibilidade intermediária — inconclusivo, reavalie com fotos melhores' },
  baixa: { tone: 'text-danger', label: 'Baixa compatibilidade — provavelmente pessoas diferentes' },
}

function Report({ r }: { r: CompareResult }) {
  const exportPdf = async () => {
    const { jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
    const W = 210
    doc.setFontSize(16)
    doc.text('MarxCompare — Relatório de análise facial', 14, 16)
    doc.setFontSize(10)
    doc.setTextColor(90)
    doc.text(`Modalidade: ${r.mode === 'identidade' ? 'Análise de identidade' : 'Semelhança visual'}`, 14, 24)
    doc.text(`Data: ${r.at.toLocaleString('pt-BR')}`, 14, 29)
    const iw = 88
    const ih = iw * 0.75
    doc.addImage(r.imgs[0], 'JPEG', 14, 34, iw, ih)
    doc.addImage(r.imgs[1], 'JPEG', W - 14 - iw, 34, iw, ih)
    let y = 34 + ih + 8
    doc.setTextColor(20)
    if (r.mode === 'identidade' && r.distance !== null && r.similarity !== null && r.verdict !== null) {
      doc.setFontSize(12)
      doc.text(`Nível de semelhança: ${r.similarity.toFixed(1)}%  ·  distância do descritor: ${r.distance.toFixed(3)}`, 14, y)
      y += 6
      doc.setFontSize(10)
      doc.setTextColor(90)
      const lines = doc.splitTextToSize(VERDICT[r.verdict].label, W - 28)
      doc.text(lines, 14, y)
      y += lines.length * 5 + 2
    }
    autoTable(doc, {
      startY: y,
      head: [['Característica', 'Foto 1', 'Foto 2', 'Diferença', 'Avaliação']],
      body: r.traits.map((t) => [t.label, t.a.toFixed(2), t.b.toFixed(2), `${t.diffPct}%`, t.similar ? 'Semelhante' : 'Diferente']),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [20, 30, 40] },
    })
    const fy = (doc as any).lastAutoTable.finalY + 8
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(
      doc.splitTextToSize(
        'Limitações: resultado indicativo, processado no navegador. Pode errar com fotos de baixa qualidade, ângulos, idade, óculos ou oclusões. Não constitui prova de identidade, parentesco ou origem genética. Nada é armazenado.',
        W - 28,
      ),
      14,
      fy,
    )
    doc.save(`MarxCompare_${r.at.toISOString().slice(0, 10)}.pdf`)
  }

  const similar = r.traits.filter((t) => t.similar)
  const diff = r.traits.filter((t) => !t.similar)

  return (
    <section className="card space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-white">
          <ShieldCheck className="h-4 w-4 text-teal" /> Relatório da análise
        </h2>
        <span className="text-xs text-muted">{r.at.toLocaleString('pt-BR')}</span>
        <button className="btn-ghost ml-auto !py-1 text-xs" onClick={exportPdf}>
          <Download className="h-3.5 w-3.5 text-ok" /> Exportar PDF
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {r.imgs.map((src, i) => (
          <img key={i} src={src} alt={`Rosto ${i + 1} analisado`} className="w-full rounded-lg border border-line" />
        ))}
      </div>

      {r.mode === 'identidade' && r.distance !== null && r.verdict !== null && r.similarity !== null ? (
        <div className="space-y-2">
          <div className="rounded-xl border border-line bg-ink-2 p-4 text-center">
            <div className="text-xs tracking-wide text-muted uppercase">Nível de semelhança</div>
            <div className={`font-mono text-4xl font-bold ${VERDICT[r.verdict].tone}`}>{r.similarity.toFixed(1)}%</div>
            <div className="mt-1 text-xs text-faint">distância do descritor: {r.distance.toFixed(3)} (limiar usual ≈ 0,60)</div>
          </div>
          <div className={`flex items-center justify-center gap-2 text-sm font-semibold ${VERDICT[r.verdict].tone}`}>
            {r.verdict === 'baixa' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {VERDICT[r.verdict].label}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">Comparação descritiva de formatos e proporções visíveis. Não indica identidade nem parentesco.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TraitList title="Características semelhantes" tone="ok" items={similar} />
        <TraitList title="Características diferentes" tone="danger" items={diff} />
      </div>

      {(r.quality[0].warnings.length > 0 || r.quality[1].warnings.length > 0) && (
        <div className="rounded-lg border border-amber/40 bg-amber/5 p-3 text-xs text-amber">
          <b>Qualidade das imagens:</b> {[...new Set([...r.quality[0].warnings, ...r.quality[1].warnings])].join(' ') || 'adequada'} Isso reduz a confiança do resultado.
        </div>
      )}
    </section>
  )
}

function TraitList({ title, tone, items }: { title: string; tone: 'ok' | 'danger'; items: Trait[] }) {
  const color = tone === 'ok' ? 'text-ok border-ok/30 bg-ok/5' : 'text-danger border-danger/30 bg-danger/5'
  return (
    <div>
      <h3 className={`mb-2 text-[13px] font-semibold ${tone === 'ok' ? 'text-ok' : 'text-danger'}`}># {title}</h3>
      {!items.length ? (
        <p className="text-xs text-faint">—</p>
      ) : (
        <ul className="space-y-1">
          {items.map((t) => (
            <li key={t.label} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs ${color}`}>
              <span className="text-text">{t.label}</span>
              <span className="font-mono text-muted">dif. {t.diffPct}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
