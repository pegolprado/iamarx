import { embedY, extractY, robustCapacityOk, ROBUST_MAX_BYTES, simulateJpegY } from './stegRobust'

// foto sintética com textura (gradiente + ruído), 1280×960
function photo(w: number, h: number): Float32Array {
  const Y = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) Y[y * w + x] = 110 + 90 * Math.sin(x / 40) * Math.cos(y / 55) + ((x * 7 + y * 13) % 17) - 8
  return Y
}
const dec = new TextDecoder()

describe('marca d’água robusta (resiste à recompressão)', () => {
  const w = 1280
  const h = 960
  const secret = new TextEncoder().encode('ALVO +5511916144379 | senha do cofre: Alpha26. | lat -23.5180 lon -46.7810')

  it('tem capacidade na resolução padrão', () => {
    expect(robustCapacityOk(w, h)).toBe(true)
    expect(secret.length).toBeLessThanOrEqual(ROBUST_MAX_BYTES)
  })

  it('recupera o segredo após recompressão JPEG de q85 até q45', () => {
    const Y = photo(w, h)
    embedY(Y, w, h, secret)
    for (const q of [85, 75, 65, 55, 45]) {
      const r = extractY(simulateJpegY(Y, w, h, q), w, h)
      expect(dec.decode(r!), `qualidade ${q}`).toBe(dec.decode(secret))
    }
  })

  it('imagem sem marca não devolve nada', () => {
    expect(extractY(photo(w, h), w, h)).toBeNull()
  })
})
