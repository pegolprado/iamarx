import { accountKey, detectColumns, guessService, splitIpPort } from './accessLog'

describe('logs de acesso', () => {
  it('separa IP e porta', () => {
    expect(splitIpPort('177.10.20.30')).toEqual(['177.10.20.30', null])
    expect(splitIpPort('177.10.20.30:51234')).toEqual(['177.10.20.30', 51234])
    expect(splitIpPort('[2804:14C:ABCD::1]:443')).toEqual(['2804:14c:abcd::1', 443])
    expect(splitIpPort('2804:14c:abcd::1')).toEqual(['2804:14c:abcd::1', null])
    expect(splitIpPort('300.1.1.1')).toEqual([null, null])
    expect(splitIpPort('12:30:00')).toEqual([null, null])
    expect(splitIpPort('login')).toEqual([null, null])
  })

  it('identifica conta e serviço', () => {
    expect(accountKey('Fulano.Teste@Gmail.com')).toBe('fulano.teste@gmail.com')
    expect(accountKey('(61) 98000-0001')).toBe('+5561980000001')
    expect(guessService('Google_subscriber_info_IP.csv')).toBe('Google')
    expect(guessService('instagram-records.html')).toBe('Instagram')
    expect(guessService('planilha.csv')).toBeNull()
  })

  it('reconhece as colunas pelo nome e pelo conteúdo', () => {
    const sample = [
      { 'Data/Hora (UTC)': '2026-03-21 10:00:00', 'Endereço IP': '177.10.20.30', Porta: '51234', Conta: 'a@b.com', Atividade: 'Login' },
      { 'Data/Hora (UTC)': '2026-03-21 11:00:00', 'Endereço IP': '2804::1', Porta: '', Conta: 'a@b.com', Atividade: 'Login' },
    ]
    expect(detectColumns(Object.keys(sample[0]), sample)).toMatchObject({ dt: 'Data/Hora (UTC)', ip: 'Endereço IP', port: 'Porta', account: 'Conta', activity: 'Atividade' })
    // nomes desconhecidos: o IP e a data/hora são achados pelo conteúdo
    const s2 = [
      { c1: '21/03/2026 07:00:00', c2: '10.0.0.1', c3: 'x' },
      { c1: '21/03/2026 08:00:00', c2: '10.0.0.2', c3: 'y' },
    ]
    expect(detectColumns(['c1', 'c2', 'c3'], s2)).toMatchObject({ dt: 'c1', ip: 'c2' })
    // data e hora separadas
    const s3 = [{ Data: '21/03/2026', Hora: '07:00:00', IP: '10.0.0.1' }]
    expect(detectColumns(['Data', 'Hora', 'IP'], s3)).toMatchObject({ date: 'Data', time: 'Hora', ip: 'IP' })
  })
})
