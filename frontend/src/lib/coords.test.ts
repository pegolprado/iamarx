import { parseCoord, parseInput, parseLine, parsePcscUrl } from './coords'

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-5)

describe('coordenadas', () => {
  it('formatos de coordenada', () => {
    near(parseCoord('-38.959390')!.v, -38.95939)
    near(parseCoord('38.959390N')!.v, 38.95939)
    near(parseCoord('-26,25623')!.v, -26.25623)
    near(parseCoord(`43°38'19.39"N`)!.v, 43.638719)
    near(parseCoord(`116°14'28.86"W`)!.v, -116.24135)
    near(parseCoord('-389593901')!.v, -38.9593901)
    near(parseCoord('-26-51-07,20')!.v, -26.852)
    expect(parseCoord('250')).toBeNull()
    expect(parseCoord('02-AUG-14')).toBeNull()
  })

  it('linhas de lugar e de ERB', () => {
    const l = parseLine('-26.25623   -49.2562')!
    near(l.lat, -26.25623)
    near(l.lon, -49.2562)
    expect(l.az).toBeNull()
    expect(parseLine('250   -26.25623   -49.2562')!.az).toBe(250)
    expect(parseLine('-26.25623   -49.2562   250')!.az).toBe(250)
    const v = parseLine('10  -26-52-54,00   -49-08-31,00')!
    expect(v.az).toBe(10)
    near(v.lat, -26.881667)
    near(v.lon, -49.141944)
    // ordem invertida
    const r = parseLine('-49.2562 -26.25623')!
    near(r.lat, -26.25623)
    expect(parseLine('texto sem coordenadas')).toBeNull()
  })

  it('link do Mapas/PCSC', () => {
    const url =
      'https://servicos.pc.sc.gov.br/antena/?t=e&d=ZXJiJkBlcmImQC0yNi4yNTYyMyZALTQ5LjI1NjImQDI1MCZAMTIwJkAxODAwJiRlcmIyJkBlcmImQC0yNi44ODE2NjY2NjY2NjY2NjgmQC00OS4xNDE5NDQ0NDQ0NDQ0NCZAMTAmQDExJkAxMDA-'
    const r = parsePcscUrl(url)!
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ name: 'erb', az: 250, beam: 120, dist: 1800 })
    near(r[0].lat, -26.25623)
    expect(r[1]).toMatchObject({ name: 'erb2', az: 10, beam: 11, dist: 100 })
  })

  it('várias linhas com falhas apontadas', () => {
    const r = parseInput('-26.25623 -49.2562\n\nlinha qualquer\n250 -26.1 -49.1')
    expect(r.items).toHaveLength(2)
    expect(r.failed).toEqual(['linha qualquer'])
  })
})
