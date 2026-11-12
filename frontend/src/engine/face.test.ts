import { compareVisual, descriptorDistance, distanceToSimilarity, faceMetrics, verdictFor, type Landmark } from './face'

const vec = (f: (i: number) => number) => Float32Array.from({ length: 128 }, (_, i) => f(i))

describe('MarxCompare — motor facial (cálculos)', () => {
  it('distância e semelhança', () => {
    const a = vec((i) => Math.sin(i))
    expect(descriptorDistance(a, a)).toBe(0)
    expect(distanceToSimilarity(0)).toBe(100)
    expect(distanceToSimilarity(0.2)).toBeCloseTo(92, 1)
    expect(distanceToSimilarity(0.6)).toBeCloseTo(60, 1)
    expect(distanceToSimilarity(1.3)).toBe(0)
    // monotônica decrescente
    expect(distanceToSimilarity(0.3)).toBeGreaterThan(distanceToSimilarity(0.5))
  })

  it('veredito por faixa de distância', () => {
    expect(verdictFor(0.3)).toBe('alta')
    expect(verdictFor(0.6)).toBe('media')
    expect(verdictFor(0.9)).toBe('baixa')
  })

  it('proporções invariantes à escala e comparação visual', () => {
    // 68 pontos de um rosto fictício, e o mesmo rosto 2× maior e deslocado
    const base: Landmark[] = Array.from({ length: 68 }, (_, i) => ({ x: Math.cos(i) * 50 + 100, y: Math.sin(i) * 60 + 120 }))
    const scaled: Landmark[] = base.map((p) => ({ x: p.x * 2 + 30, y: p.y * 2 - 10 }))
    const ma = faceMetrics(base)
    const mb = faceMetrics(scaled)
    // métricas normalizadas: iguais mesmo com escala/translação diferentes
    for (const k of Object.keys(ma) as (keyof typeof ma)[]) expect(mb[k]).toBeCloseTo(ma[k], 4)
    const traits = compareVisual(ma, mb)
    expect(traits.every((t) => t.similar)).toBe(true)
  })
})
