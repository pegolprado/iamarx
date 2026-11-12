/**
 * MarxCompare — motor de análise facial, 100% no navegador (nada é enviado nem salvo).
 *
 * Usa @vladmandic/face-api (TensorFlow.js) carregado sob demanda, com os modelos servidos pelo
 * próprio site (public/vendor/faceapi). Faz detecção de rostos, 68 pontos de referência e um
 * descritor de 128 dimensões por rosto. A comparação é a distância euclidiana entre descritores,
 * convertida numa escala de semelhança — não é prova de identidade.
 */
import type * as FaceApi from '@vladmandic/face-api'

type FA = typeof FaceApi
let faPromise: Promise<FA> | null = null
let loaded = false

/** Carrega a biblioteca e os modelos uma única vez. */
export async function loadFace(onStatus?: (s: string) => void): Promise<FA> {
  if (!faPromise)
    faPromise = (async () => {
      onStatus?.('Carregando o motor de análise facial…')
      const fa = (await import('@vladmandic/face-api')) as unknown as FA
      const tf = fa.tf as any
      // prefere WebGL (rápido); se o aparelho não tiver, cai para CPU em JS puro (sempre funciona)
      let ok = false
      try {
        ok = await tf.setBackend('webgl')
      } catch {
        ok = false
      }
      if (!ok) {
        try {
          await tf.setBackend('cpu')
        } catch {
          /* mantém o backend que houver */
        }
      }
      await tf.ready?.()
      onStatus?.('Carregando os modelos…')
      const url = '/vendor/faceapi'
      await Promise.all([fa.nets.ssdMobilenetv1.loadFromUri(url), fa.nets.faceLandmark68Net.loadFromUri(url), fa.nets.faceRecognitionNet.loadFromUri(url)])
      loaded = true
      return fa
    })()
  return faPromise
}
export const faceReady = () => loaded

export type Landmark = { x: number; y: number }
export type DetectedFace = {
  box: { x: number; y: number; width: number; height: number }
  landmarks: Landmark[] // 68 pontos
  descriptor: Float32Array // 128 dimensões
  score: number // confiança da detecção (0–1)
}
export type ImageQuality = {
  width: number
  height: number
  sharpness: number // variância do laplaciano (nitidez relativa)
  brightness: number // 0–255 médio
  faceFraction: number // quanto do quadro o rosto ocupa
  warnings: string[]
}

/** Detecta todos os rostos de uma imagem (com pontos e descritor). */
export async function detectFaces(fa: FA, img: HTMLImageElement | HTMLCanvasElement): Promise<DetectedFace[]> {
  const opts = new fa.SsdMobilenetv1Options({ minConfidence: 0.3 })
  const res = await fa.detectAllFaces(img, opts).withFaceLandmarks().withFaceDescriptors()
  return res
    .map((r) => ({
      box: { x: r.detection.box.x, y: r.detection.box.y, width: r.detection.box.width, height: r.detection.box.height },
      landmarks: r.landmarks.positions.map((p) => ({ x: p.x, y: p.y })),
      descriptor: r.descriptor,
      score: r.detection.score,
    }))
    .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)
}

/** Distância euclidiana entre dois descritores (0 = idênticos; ~0.6 = limiar usual). */
export function descriptorDistance(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    s += d * d
  }
  return Math.sqrt(s)
}

/**
 * Converte a distância em "semelhança" (0–100). Baseado no limiar clássico do descritor dlib/face-api
 * (distância ≈ 0.6 como fronteira). Valores apenas indicativos, nunca prova de identidade.
 */
export function distanceToSimilarity(dist: number): number {
  const MATCH = 0.4 // bem parecidos
  const LIMIT = 0.6 // fronteira usual
  let pct: number
  if (dist <= MATCH)
    pct = 100 - (dist / MATCH) * 20 // 0→100 ; 0.4→80
  else if (dist <= LIMIT)
    pct = 80 - ((dist - MATCH) / (LIMIT - MATCH)) * 30 // 0.4→80 ; 0.6→50
  else pct = Math.max(0, 50 - ((dist - LIMIT) / 0.6) * 50) // 0.6→50 ; 1.2→0
  return Math.round(pct * 100) / 100
}

export type Verdict = 'alta' | 'media' | 'baixa'
export function verdictFor(dist: number): Verdict {
  if (dist <= 0.45) return 'alta'
  if (dist <= 0.6) return 'media'
  return 'baixa'
}

/** Qualidade da imagem: nitidez (laplaciano), brilho e proporção ocupada pelo rosto. */
export function imageQuality(canvas: HTMLCanvasElement, face: DetectedFace | null): ImageQuality {
  const w = canvas.width
  const h = canvas.height
  const ctx = canvas.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, w, h)
  const gray = new Float32Array(w * h)
  let sum = 0
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const g = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
    gray[i] = g
    sum += g
  }
  const brightness = sum / (w * h)
  // variância do laplaciano (amostrado) como medida de nitidez
  let mean = 0
  let m2 = 0
  let n = 0
  const step = Math.max(1, Math.floor(Math.min(w, h) / 300))
  for (let y = step; y < h - step; y += step)
    for (let x = step; x < w - step; x += step) {
      const i = y * w + x
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w]
      n++
      const d = lap - mean
      mean += d / n
      m2 += d * (lap - mean)
    }
  const sharpness = n ? m2 / n : 0
  const faceFraction = face ? (face.box.width * face.box.height) / (w * h) : 0
  const warnings: string[] = []
  if (Math.min(w, h) < 200) warnings.push('Resolução baixa: a imagem é pequena.')
  if (brightness < 45) warnings.push('Imagem muito escura.')
  if (brightness > 215) warnings.push('Imagem muito clara/estourada.')
  if (sharpness < 60) warnings.push('Imagem pouco nítida (possível desfoque).')
  if (face && faceFraction < 0.04) warnings.push('O rosto ocupa pouco do quadro: aproxime/recorte.')
  return { width: w, height: h, sharpness, brightness, faceFraction, warnings }
}

// ---- análise descritiva (modalidade "semelhança visual"), a partir dos 68 pontos ----
const dist = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y)
const mid = (a: Landmark, b: Landmark) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** Proporções faciais normalizadas (independem de tamanho/escala), tiradas dos 68 pontos. */
export function faceMetrics(lm: Landmark[]) {
  // índices padrão dos 68 pontos (dlib/face-api)
  const jaw = lm.slice(0, 17)
  const browL = lm.slice(17, 22)
  const browR = lm.slice(22, 27)
  const nose = lm.slice(27, 36)
  const eyeL = lm.slice(36, 42)
  const eyeR = lm.slice(42, 48)
  const mouth = lm.slice(48, 68)
  const faceW = dist(jaw[0], jaw[16]) || 1
  const faceH = dist(mid(browL[0], browR[4]), jaw[8]) || 1
  const eyeWidth = (dist(eyeL[0], eyeL[3]) + dist(eyeR[0], eyeR[3])) / 2
  const interocular = dist(mid(eyeL[0], eyeL[3]), mid(eyeR[0], eyeR[3])) || 1
  const noseW = dist(nose[4], nose[8])
  const noseH = dist(nose[0], nose[6])
  const mouthW = dist(mouth[0], mouth[6])
  const mouthH = dist(mid(mouth[2], mouth[4]), mid(mouth[8], mouth[10]))
  const jawW = dist(jaw[4], jaw[12])
  const eyeOpenL = dist(mid(eyeL[1], eyeL[2]), mid(eyeL[5], eyeL[4]))
  const eyeOpenR = dist(mid(eyeR[1], eyeR[2]), mid(eyeR[5], eyeR[4]))
  return {
    aspect: faceH / faceW, // rosto alongado (↑) vs largo (↓)
    jawRatio: jawW / faceW, // mandíbula larga vs afilada
    eyeWidthRatio: eyeWidth / interocular,
    eyeOpenRatio: (eyeOpenL + eyeOpenR) / 2 / eyeWidth,
    noseWidthRatio: noseW / faceW,
    noseAspect: noseH / (noseW || 1),
    mouthWidthRatio: mouthW / faceW,
    mouthAspect: mouthH / (mouthW || 1),
    interocularRatio: interocular / faceW,
  }
}
export type FaceMetrics = ReturnType<typeof faceMetrics>

const LABELS: Record<keyof FaceMetrics, string> = {
  aspect: 'Proporção do rosto (altura × largura)',
  jawRatio: 'Largura da mandíbula',
  eyeWidthRatio: 'Largura dos olhos',
  eyeOpenRatio: 'Abertura dos olhos',
  noseWidthRatio: 'Largura do nariz',
  noseAspect: 'Formato do nariz (comprido × largo)',
  mouthWidthRatio: 'Largura da boca',
  mouthAspect: 'Espessura dos lábios',
  interocularRatio: 'Distância entre os olhos',
}

export type Trait = { label: string; a: number; b: number; diffPct: number; similar: boolean }

/** Compara as proporções de dois rostos e devolve traços semelhantes e diferentes (descritivo). */
export function compareVisual(a: FaceMetrics, b: FaceMetrics): Trait[] {
  return (Object.keys(LABELS) as (keyof FaceMetrics)[])
    .map((k) => {
      const va = a[k]
      const vb = b[k]
      const diffPct = (Math.abs(va - vb) / ((Math.abs(va) + Math.abs(vb)) / 2 || 1)) * 100
      return { label: LABELS[k], a: va, b: vb, diffPct: Math.round(diffPct * 10) / 10, similar: diffPct <= 12 }
    })
    .sort((x, y) => x.diffPct - y.diffPct)
}
