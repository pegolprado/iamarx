import { lookupOperadora, parseOperadoraCsv, parsePhone, waLink } from './operadora'

describe('MarxOperadora — número', () => {
  it('celular de SP', () => {
    const p = parsePhone('(11) 98185-5165')
    expect(p.valid).toBe(true)
    expect(p.tipo).toBe('movel')
    expect(p.ddd).toBe('11')
    expect(p.uf).toBe('SP')
    expect(p.regiao).toBe('Sudeste')
    expect(p.e164).toBe('+5511981855165')
    expect(waLink(p)).toBe('https://wa.me/5511981855165')
  })
  it('aceita +55 e formatações variadas', () => {
    expect(parsePhone('+55 21 3030-4040').valid).toBe(true) // fixo RJ
    expect(parsePhone('5531999887766').uf).toBe('MG')
  })
  it('rejeita inválidos', () => {
    expect(parsePhone('123').valid).toBe(false)
    expect(parsePhone('(10) 99999-0000').valid).toBe(false) // DDD 10 não existe
    expect(parsePhone('(11) 19999-0000').valid).toBe(false) // celular tem que começar com 9
  })
  it('fixo vs móvel', () => {
    expect(parsePhone('(11) 3123-4567').tipo).toBe('fixo')
    expect(parsePhone('(11) 93123-4567').tipo).toBe('movel')
  })
})

describe('MarxOperadora — base ANATEL (CSV)', () => {
  const csv = ['CN;Prefixo;Operadora', '11;98185;TIM', '11;99;VIVO', '21;9;CLARO'].join('\n')
  it('indexa e consulta por maior prefixo', () => {
    const base = parseOperadoraCsv(csv)
    expect(base.count).toBe(3)
    expect(lookupOperadora(base, parsePhone('(11) 98185-5165'))).toBe('TIM') // prefixo mais específico
    expect(lookupOperadora(base, parsePhone('(11) 99000-0000'))).toBe('VIVO')
    expect(lookupOperadora(base, parsePhone('(21) 91234-5678'))).toBe('CLARO')
    expect(lookupOperadora(base, parsePhone('(31) 91234-5678'))).toBeNull() // sem faixa
  })
  it('CSV sem colunas certas falha claro', () => {
    expect(() => parseOperadoraCsv('a,b\n1,2')).toThrow(/não reconhecido/)
  })
})
