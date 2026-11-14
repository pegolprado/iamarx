import { clipConvex, polygonAreaM2, sectorIntersections, type Erb } from './geo'

describe('geometria — interseção de setores', () => {
  it('interseção de dois quadrados sobrepostos', () => {
    const a: [number, number][] = [
      [0, 0],
      [0, 2],
      [2, 2],
      [2, 0],
    ]
    const b: [number, number][] = [
      [1, 1],
      [1, 3],
      [3, 3],
      [3, 1],
    ]
    const r = clipConvex(a, b)
    // sobreposição = quadrado [1,1]..[2,2], área 1 (em graus²) — aqui só checamos que é um quadrado 1x1
    const lats = r.map((p) => p[0]).sort()
    const lons = r.map((p) => p[1]).sort()
    expect(Math.min(...lats)).toBeCloseTo(1, 6)
    expect(Math.max(...lats)).toBeCloseTo(2, 6)
    expect(Math.min(...lons)).toBeCloseTo(1, 6)
    expect(Math.max(...lons)).toBeCloseTo(2, 6)
  })

  it('setores apontando um para o outro se cruzam; opostos não', () => {
    // duas ERBs a ~400 m, apontando uma para a outra (azimutes 90 e 270): leques se cruzam no meio
    const d = 0.004 // ~440 m em longitude
    const erbs: Erb[] = [
      { lat: -23.5, lon: -46.6, az: 90, dist: 800, beam: 120 },
      { lat: -23.5, lon: -46.6 + d, az: 270, dist: 800, beam: 120 },
    ]
    const cross = sectorIntersections(erbs)
    expect(cross.length).toBe(1)
    expect(cross[0].areaM2).toBeGreaterThan(1000)

    // agora apontando para longe um do outro (0 e 180 no eixo lon): não se cruzam
    const away: Erb[] = [
      { lat: -23.5, lon: -46.6, az: 270, dist: 300, beam: 60 },
      { lat: -23.5, lon: -46.6 + d, az: 90, dist: 300, beam: 60 },
    ]
    expect(sectorIntersections(away).length).toBe(0)
  })

  it('área em m² é positiva e coerente', () => {
    const sq: [number, number][] = [
      [-23.5, -46.6],
      [-23.5, -46.59],
      [-23.49, -46.59],
      [-23.49, -46.6],
    ]
    expect(polygonAreaM2(sq)).toBeGreaterThan(900000) // ~0,01° x 0,01° ≈ 1 km x 1 km
  })
})
