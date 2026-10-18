import { parse } from './assistant'

describe('assistente local', () => {
  it('interpreta datas, faixa e tipo', () => {
    const r = parse('Quantas chamadas recebidas entre 22h e 5h de 01/03/2026 a 05/03/2026?', [])
    expect(r.intent).toBe('summary')
    expect(r.filter).toMatchObject({ date_from: '2026-03-01', date_to: '2026-03-05', hour_from: 22, hour_to: 5, event_types: ['voz_recebida'] })
  })
  it('alvo por letra e contatos em comum', () => {
    const r = parse('contatos em comum entre alvo a e alvo b', ['+5561999990001', '+5561999990002'])
    expect(r.intent).toBe('common')
    expect(r.filter.targets).toEqual(['+5561999990001', '+5561999990002'])
  })
  it('entende WhatsApp', () => {
    const r = parse('mensagens de whatsapp do alvo a em 02/03/2026', ['+5561999990001'])
    expect(r.filter.event_types).toEqual(['wa_msg_enviada', 'wa_msg_recebida', 'wa_chamada_originada', 'wa_chamada_recebida'])
    expect(parse('chamadas no zap', []).filter.event_types).toEqual(['wa_chamada_originada', 'wa_chamada_recebida'])
  })
  it('sem critério', () => {
    expect(parse('olá', []).notes[0]).toContain('nenhum critério')
  })
})
