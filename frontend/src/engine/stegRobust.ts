/**
 * MARX Secret — marca d'água robusta (modo "resistente a redes sociais").
 *
 * Diferente do modo normal (que anexa o arquivo ao fim da imagem e morre quando a rede recomprime
 * a foto), este modo grava um SEGREDO PEQUENO dentro dos próprios pixels, no domínio da frequência
 * (DCT de blocos 8×8 do canal de luminância), com muita redundância. Isso sobrevive à recompressão
 * JPEG do WhatsApp/Instagram. A capacidade é pequena (algumas centenas de bytes) e a recuperação é
 * muito provável, mas não 100% garantida — cada rede comprime de um jeito, e recorte (feed do
 * Instagram) ainda pode quebrar.
 *
 * Técnica: QIM (quantization index modulation) num coeficiente de frequência média de cada bloco,
 * com passo Δ grande o bastante para sobreviver à quantização do JPEG; cada bit do quadro é repetido
 * e espalhado por toda a imagem (voto da maioria na leitura). Um CRC valida a recuperação.
 */

export const ROBUST_LONG_EDGE = 1280 // abaixo do teto do WhatsApp (~1600) para a foto não ser redimensionada
export const ROBUST_MAX_BYTES = 180 // capacidade do segredo (antes da criptografia)
const DELTA = 44 // passo do QIM — maior = mais robusto e mais visível
const COEFS: [number, number][] = [
  [2, 1],
  [1, 2],
  [3, 1],
  [1, 3],
  [2, 2],
  [3, 2],
  [2, 3],
  [4, 1],
] // coeficientes de frequência média usados em cada bloco
const MAGIC = 0x4d58 // "MX"
// máscara pseudoaleatória por slot: decorrelaciona o viés sistemático do JPEG do bit gravado
const mask = (slot: number) => {
  let x = (slot * 2654435761) >>> 0
  x ^= x >>> 15
  x = (x * 2246822519) >>> 0
  x ^= x >>> 13
  return x & 1
}

// ---- DCT-II / III 8×8 (separável, ortonormal) ----
const N = 8
const C: number[][] = Array.from({ length: N }, (_, u) => Array.from({ length: N }, (_, x) => Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N))))
const alpha = (u: number) => (u === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N))

function dct8x8(block: Float32Array, out: Float32Array) {
  const tmp = new Float32Array(64)
  for (let y = 0; y < N; y++)
    for (let u = 0; u < N; u++) {
      let s = 0
      for (let x = 0; x < N; x++) s += block[y * N + x] * C[u][x]
      tmp[y * N + u] = alpha(u) * s
    }
  for (let u = 0; u < N; u++)
    for (let v = 0; v < N; v++) {
      let s = 0
      for (let y = 0; y < N; y++) s += tmp[y * N + u] * C[v][y]
      out[v * N + u] = alpha(v) * s
    }
}
function idct8x8(coef: Float32Array, out: Float32Array) {
  const tmp = new Float32Array(64)
  for (let v = 0; v < N; v++)
    for (let y = 0; y < N; y++) {
      let s = 0
      for (let u = 0; u < N; u++) s += alpha(u) * coef[v * N + u] * C[u][y]
      tmp[v * N + y] = s
    }
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let s = 0
      for (let v = 0; v < N; v++) s += alpha(v) * tmp[v * N + x] * C[v][y]
      out[y * N + x] = s
    }
}

// ---- CRC32 ----
const CRC_TAB = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(b: Uint8Array) {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = CRC_TAB[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ---- quadro de bits: MAGIC(16) LEN(16) DADOS(MAX*8) CRC(32) ----
const FRAME_BITS = 16 + 16 + ROBUST_MAX_BYTES * 8 + 32
const bytesToBits = (bytes: Uint8Array, bits: Uint8Array, off: number, count: number) => {
  for (let i = 0; i < count; i++) bits[off + i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1
}
const putU16 = (bits: Uint8Array, off: number, v: number) => {
  for (let i = 0; i < 16; i++) bits[off + i] = (v >> (15 - i)) & 1
}
const getU16 = (bits: Uint8Array, off: number) => {
  let v = 0
  for (let i = 0; i < 16; i++) v = (v << 1) | bits[off + i]
  return v
}

function buildFrame(payload: Uint8Array): Uint8Array {
  if (payload.length > ROBUST_MAX_BYTES) throw new Error(`O segredo robusto cabe em até ${ROBUST_MAX_BYTES} bytes (tem ${payload.length}).`)
  const bits = new Uint8Array(FRAME_BITS)
  putU16(bits, 0, MAGIC)
  putU16(bits, 16, payload.length)
  bytesToBits(payload, bits, 32, payload.length * 8)
  const crc = crc32(payload)
  for (let i = 0; i < 32; i++) bits[32 + ROBUST_MAX_BYTES * 8 + i] = (crc >>> (31 - i)) & 1
  return bits
}

function readFrame(bits: Uint8Array): Uint8Array | null {
  if (getU16(bits, 0) !== MAGIC) return null
  const len = getU16(bits, 16)
  if (len > ROBUST_MAX_BYTES) return null
  const payload = new Uint8Array(len)
  for (let i = 0; i < len * 8; i++) payload[i >> 3] |= bits[32 + i] << (7 - (i & 7))
  let crc = 0
  for (let i = 0; i < 32; i++) crc = (crc << 1) | bits[32 + ROBUST_MAX_BYTES * 8 + i]
  return crc >>> 0 === crc32(payload) ? payload : null
}

// ---- slots (bloco × coeficiente) e embaralhamento determinístico ----
function slotCount(w: number, h: number) {
  return Math.floor(w / N) * Math.floor(h / N) * COEFS.length
}
export function robustCapacityOk(w: number, h: number) {
  return slotCount(w, h) >= FRAME_BITS * 6 // exige ao menos ~6× de redundância
}

/** Grava o quadro de bits no plano de luminância Y (w×h, 0–255). Altera Y no lugar. */
export function embedY(Y: Float32Array, w: number, h: number, payload: Uint8Array) {
  const frame = buildFrame(payload)
  const bw = Math.floor(w / N)
  const bh = Math.floor(h / N)
  const block = new Float32Array(64)
  const coef = new Float32Array(64)
  let slot = 0
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) block[y * N + x] = Y[(by * N + y) * w + (bx * N + x)]
      dct8x8(block, coef)
      const rot = (bx * 7 + by * 13) % COEFS.length
      for (let ci = 0; ci < COEFS.length; ci++) {
        const [r, c] = COEFS[(ci + rot) % COEFS.length]
        const bit = frame[slot % FRAME_BITS] ^ mask(slot)
        const idx = r * N + c
        let k = Math.round(coef[idx] / DELTA)
        if ((k & 1) !== bit) k += coef[idx] / DELTA - k >= 0 ? 1 : -1
        coef[idx] = k * DELTA
        slot++
      }
      idct8x8(coef, block)
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) Y[(by * N + y) * w + (bx * N + x)] = block[y * N + x]
    }
}

/** Lê o quadro de bits do plano Y por voto da maioria e devolve o segredo, ou null se não houver. */
export function extractY(Y: Float32Array, w: number, h: number): Uint8Array | null {
  const bw = Math.floor(w / N)
  const bh = Math.floor(h / N)
  const votes = new Int32Array(FRAME_BITS)
  const block = new Float32Array(64)
  const coef = new Float32Array(64)
  let slot = 0
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) block[y * N + x] = Y[(by * N + y) * w + (bx * N + x)]
      dct8x8(block, coef)
      const rot = (bx * 7 + by * 13) % COEFS.length
      for (let ci = 0; ci < COEFS.length; ci++) {
        const [r, c] = COEFS[(ci + rot) % COEFS.length]
        const k = Math.round(coef[r * N + c] / DELTA)
        const read = (k & 1) ^ mask(slot)
        votes[slot % FRAME_BITS] += read ? 1 : -1
        slot++
      }
    }
  const bits = new Uint8Array(FRAME_BITS)
  for (let i = 0; i < FRAME_BITS; i++) bits[i] = votes[i] > 0 ? 1 : 0
  return readFrame(bits)
}

// ---- cor: RGBA <-> Y (BT.601) ----
export function rgbaToY(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const Y = new Float32Array(w * h)
  for (let i = 0, p = 0; i < w * h; i++, p += 4) Y[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
  return Y
}
/** Reaplica o novo Y mantendo a cor original (Cb/Cr) — altera `data` no lugar. */
export function applyY(data: Uint8ClampedArray, Y: Float32Array, w: number, h: number) {
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const r = data[p]
    const g = data[p + 1]
    const b = data[p + 2]
    const y0 = 0.299 * r + 0.587 * g + 0.114 * b
    const d = Y[i] - y0
    data[p] = clamp(r + d)
    data[p + 1] = clamp(g + d)
    data[p + 2] = clamp(b + d)
  }
}
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

/** Tabela de quantização de luminância do JPEG (base, qualidade 50). */
const JPEG_Q = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64,
  81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
]

/** Simula a quantização JPEG do canal Y a uma dada qualidade (para testes, sem codec real). */
export function simulateJpegY(Y: Float32Array, w: number, h: number, quality = 70): Float32Array {
  const s = quality < 50 ? 5000 / quality : 200 - 2 * quality
  const q = JPEG_Q.map((v) => Math.max(1, Math.floor((v * s + 50) / 100)))
  const out = new Float32Array(Y.length)
  const bw = Math.floor(w / N)
  const bh = Math.floor(h / N)
  const block = new Float32Array(64)
  const coef = new Float32Array(64)
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) block[y * N + x] = Y[(by * N + y) * w + (bx * N + x)] - 128
      dct8x8(block, coef)
      for (let i = 0; i < 64; i++) coef[i] = Math.round(coef[i] / q[i]) * q[i]
      idct8x8(coef, block)
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) out[(by * N + y) * w + (bx * N + x)] = clamp(block[y * N + x] + 128)
    }
  return out
}

// ---- criptografia opcional (AES-256-GCM / PBKDF2) ----
const te = new TextEncoder()
async function keyFrom(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', te.encode(password) as BufferSource, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 150_000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
}
async function enc(secret: Uint8Array, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, await keyFrom(password, salt), secret as BufferSource))
  const out = new Uint8Array(1 + 16 + 12 + ct.length)
  out[0] = 1 // flag: criptografado
  out.set(salt, 1)
  out.set(iv, 17)
  out.set(ct, 29)
  return out
}
async function dec2(frame: Uint8Array, password?: string) {
  if (frame[0] !== 1) return frame.slice(1) // sem criptografia
  if (!password) throw new Error('A marca está protegida por senha. Informe a senha.')
  const salt = frame.slice(1, 17)
  const iv = frame.slice(17, 29)
  const ct = frame.slice(29)
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, await keyFrom(password, salt), ct as BufferSource))
  } catch {
    throw new Error('Senha incorreta: não foi possível ler a marca.')
  }
}
const plain = (secret: Uint8Array) => {
  const out = new Uint8Array(1 + secret.length)
  out[0] = 0
  out.set(secret, 1)
  return out
}

/** Capacidade útil do segredo (em bytes), descontando o cabeçalho de criptografia quando houver senha. */
export const robustSecretLimit = (encrypted: boolean) => ROBUST_MAX_BYTES - 1 - (encrypted ? 28 : 0)

// ---- canvas: dimensões canônicas (lado maior 1280, múltiplo de 8) ----
function canonDims(w: number, h: number) {
  const s = ROBUST_LONG_EDGE / Math.max(w, h)
  const cw = Math.max(N, Math.round((w * s) / N) * N)
  const ch = Math.max(N, Math.round((h * s) / N) * N)
  return [cw, ch] as const
}
async function drawCanon(file: File | Blob) {
  const bmp = await createImageBitmap(file)
  const [cw, ch] = canonDims(bmp.width, bmp.height)
  const cv = document.createElement('canvas')
  cv.width = cw
  cv.height = ch
  const ctx = cv.getContext('2d')!
  ctx.drawImage(bmp, 0, 0, cw, ch)
  bmp.close?.()
  return { cv, ctx, cw, ch }
}

/** Grava o segredo como marca d'água robusta e devolve a imagem JPEG (Blob) para baixar/enviar. */
export async function encodeRobustImage(file: File, secret: Uint8Array, password?: string): Promise<Blob> {
  const frame = password ? await enc(secret, password) : plain(secret)
  if (frame.length > ROBUST_MAX_BYTES) throw new Error(`O segredo é grande demais para o modo robusto (máx. ${robustSecretLimit(!!password)} bytes).`)
  const { cv, ctx, cw, ch } = await drawCanon(file)
  if (!robustCapacityOk(cw, ch)) throw new Error('A imagem é pequena demais para a marca robusta; use uma foto maior.')
  const img = ctx.getImageData(0, 0, cw, ch)
  const Y = rgbaToY(img.data, cw, ch)
  embedY(Y, cw, ch, frame)
  applyY(img.data, Y, cw, ch)
  ctx.putImageData(img, 0, 0)
  return new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Falha ao gerar a imagem.'))), 'image/jpeg', 0.95))
}

/** Lê a marca d'água robusta de uma imagem (mesmo recomprimida). Devolve o segredo ou null. */
export async function decodeRobustImage(file: File, password?: string): Promise<Uint8Array | null> {
  const { ctx, cw, ch } = await drawCanon(file)
  const img = ctx.getImageData(0, 0, cw, ch)
  const frame = extractY(rgbaToY(img.data, cw, ch), cw, ch)
  if (!frame) return null
  return dec2(frame, password)
}

/** Diz se a imagem traz uma marca robusta e se está protegida por senha (sem decifrar). */
export async function inspectRobust(file: File): Promise<{ ok: boolean; encrypted: boolean }> {
  const { ctx, cw, ch } = await drawCanon(file)
  const img = ctx.getImageData(0, 0, cw, ch)
  const frame = extractY(rgbaToY(img.data, cw, ch), cw, ch)
  return { ok: !!frame, encrypted: !!frame && frame[0] === 1 }
}
