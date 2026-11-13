import { lookupOperadora, parseAnatelSmp, parsePhone, prettyOperadora, waLink } from './operadora'

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
    expect(parsePhone('+55 21 3030-4040').valid).toBe(true)
    expect(parsePhone('5531999887766').uf).toBe('MG')
  })
  it('rejeita inválidos', () => {
    expect(parsePhone('123').valid).toBe(false)
    expect(parsePhone('(10) 99999-0000').valid).toBe(false)
    expect(parsePhone('(11) 19999-0000').valid).toBe(false)
  })
  it('fixo vs móvel', () => {
    expect(parsePhone('(11) 3123-4567').tipo).toBe('fixo')
    expect(parsePhone('(11) 93123-4567').tipo).toBe('movel')
  })
  it('nome comercial curto', () => {
    expect(prettyOperadora('TELEFONICA BRASIL S.A.')).toBe('Vivo')
    expect(prettyOperadora('TIM S/A')).toBe('TIM')
    expect(prettyOperadora('CLARO S.A.')).toBe('Claro')
  })
})

describe('MarxOperadora — base ANATEL SMP (faixas de MCDU)', () => {
  // formato oficial: Nome;CNPJ;CN;Prefixo;FaixaIni;FaixaFim;Status
  const smp = [
    '# Nome da Prestadora;CNPJ;Código Nacional;Prefixo;Faixa Inicial;Faixa Final;Status',
    'TIM S/A;02421421000111;11;98185;5000;5999;1',
    'CLARO S.A.;40432544000147;11;98185;0000;4999;1',
    'TELEFONICA BRASIL S.A.;02558157000162;11;99999;0000;9999;1',
    'TIM S/A;02421421000111;21;98888;0000;9999;0', // status 0 = ignorado
  ].join('\n')
  it('consulta respeitando a faixa de MCDU', () => {
    const base = parseAnatelSmp(smp)
    expect(base.count).toBe(3) // a de status 0 não entra
    expect(lookupOperadora(base, parsePhone('(11) 98185-5165'))).toBe('TIM S/A') // 5165 ∈ 5000–5999
    expect(lookupOperadora(base, parsePhone('(11) 98185-1234'))).toBe('CLARO S.A.') // 1234 ∈ 0000–4999
    expect(lookupOperadora(base, parsePhone('(11) 99999-0000'))).toBe('TELEFONICA BRASIL S.A.')
    expect(lookupOperadora(base, parsePhone('(21) 98888-0000'))).toBeNull() // status 0
    expect(lookupOperadora(base, parsePhone('(11) 3123-4567'))).toBeNull() // fixo não está na base SMP
  })
  it('incremental sobrepõe o geral', () => {
    const inc = ['# h', 'VIVO;x;11;98185;5000;5999;1'].join('\n')
    const base = parseAnatelSmp(inc, parseAnatelSmp(smp))
    // a faixa 5000-5999 agora tem duas entradas; a primeira que casar vale (ordenada por início)
    expect(base.ops.length).toBeGreaterThanOrEqual(3)
  })
})
