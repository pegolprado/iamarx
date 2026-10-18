import { suggestMapping } from './fields'

// Cabeçalhos típicos de extratos de operadoras brasileiras (variações reais de nomenclatura).
describe('mapeamento automático de colunas', () => {
  it.each([
    ['estilo TIM', ['Data', 'Hora', 'Duração', 'Origem', 'Destino', 'Tipo Chamada', 'CGI', 'ERB', 'IMEI'], { date: 'Data', time: 'Hora', a_number: 'Origem', b_number: 'Destino', event_type: 'Tipo Chamada', cgi: 'CGI' }],
    ['estilo Vivo', ['DATA_HORA_INICIO', 'NUM_A', 'NUM_B', 'DURACAO', 'CELULA', 'AZIMUTE', 'TIPO_SERVICO', 'SENTIDO'], { datetime: 'DATA_HORA_INICIO', a_number: 'NUM_A', b_number: 'NUM_B', direction: 'SENTIDO', cell_id: 'CELULA' }],
    ['estilo Claro', ['DT_CHAMADA', 'HR_CHAMADA', 'NR_ORIGEM', 'NR_DESTINO', 'TP_CHAMADA', 'CELL_ID', 'LAC', 'DURACAO_SEG'], { date: 'DT_CHAMADA', time: 'HR_CHAMADA', event_type: 'TP_CHAMADA', lac: 'LAC', cell_id: 'CELL_ID' }],
    ['estilo Oi', ['Data/Hora', 'Telefone A', 'Telefone B', 'Duração (seg)', 'Tipo', 'Estação Rádio Base', 'Latitude', 'Longitude'], { a_number: 'Telefone A', b_number: 'Telefone B', datetime: 'Data/Hora', lat: 'Latitude' }],
    ['dados/IP', ['Data Inicio', 'Hora Inicio', 'Linha', 'IP', 'Porta', 'Bytes Enviados', 'Bytes Recebidos', 'ECI', 'TAC'], { ip: 'IP', port: 'Porta', eci: 'ECI', tac: 'TAC', target_number: 'Linha' }],
  ])('%s', (_n, cols, expected) => {
    expect(suggestMapping(cols as string[], 'cdr')).toMatchObject(expected)
  })
})
