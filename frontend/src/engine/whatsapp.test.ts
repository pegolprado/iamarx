import { waRecordsHtml } from './waSample'
import { looksLikeWhatsApp, parseWaTs, parseWhatsApp } from './whatsapp'

describe('WhatsApp Records', () => {
  it('reconhece o documento', () => {
    expect(looksLikeWhatsApp(waRecordsHtml())).toBe(true)
    expect(looksLikeWhatsApp('<html><body>Extrato de chamadas TIM</body></html>')).toBe(false)
  })

  it('lê cabeçalho, mensagens, chamadas e IPs', () => {
    const r = parseWhatsApp(waRecordsHtml())
    expect(r.account).toBe('+5561900000001')
    expect(r.header['internal ticket number']).toBe('9876543')
    expect(r.header['date range']).toContain('to 2026-03-31')
    expect(r.messages).toHaveLength(3)
    expect(r.messages[0]).toMatchObject({ sender: '5561900000001', recipients: ['5561980000001'], senderIp: '177.10.20.30', senderPort: '40000', device: 'android', type: 'text', style: 'individual' })
    expect(r.messages[2].recipients).toHaveLength(3)
    expect(r.messages[2].group).toBe('120363000000000001@g.us')
    expect(r.calls).toHaveLength(2)
    expect(r.calls[0]).toMatchObject({ id: 'ABC123', creator: '5561900000001' })
    expect(r.calls[0].events.map((e) => e.type)).toEqual(['offer', 'accept', 'terminate'])
    expect(r.calls[0].participants).toEqual(['5561980000001'])
    expect(r.ips).toEqual([
      { ts: Date.UTC(2026, 2, 1, 8), tsRaw: '2026-03-01 08:00:00 UTC', ip: '177.10.20.30', port: null },
      { ts: Date.UTC(2026, 2, 6, 9, 30), tsRaw: '2026-03-06 09:30:00 UTC', ip: '2804:14c:abcd::1', port: null },
    ])
    // a seção de definições (texto explicativo) não vira registro
    expect(r.discarded).toBe(0)
  })

  it('aceita o mesmo conteúdo em texto ("Rótulo: valor")', () => {
    const txt = [
      'WhatsApp Business Record', 'Service WhatsApp', 'Account Identifier: +55 61 90000-0001', 'Message Log',
      'Timestamp: 2026-03-02 13:15:05 UTC', 'Message Id: X1', 'Sender: 5561900000001', 'Recipients: 5561980000001', 'Sender Ip: 177.10.20.30', 'Type: text',
      'Timestamp: 2026-03-02 14:00:00 UTC', 'Message Id: X2', 'Sender: 5561980000001', 'Recipients: 5561900000001', 'Type: text',
    ].join('\n')
    const r = parseWhatsApp(txt, false)
    expect(r.account).toBe('+5561900000001')
    expect(r.messages.map((m) => m.id)).toEqual(['X1', 'X2'])
    expect(r.messages[0].senderIp).toBe('177.10.20.30')
  })

  it('descarta datas inválidas e IPs malformados', () => {
    expect(parseWaTs('2026-02-31 10:00:00 UTC')).toBeNull()
    expect(parseWaTs('2026-03-01T10:00:00Z')).toBe(Date.UTC(2026, 2, 1, 10))
    const r = parseWhatsApp(waRecordsHtml({ messages: [['data errada', '5561900000001', ['5561980000001'], null, 'não é ip']], calls: [], ips: [['2026-03-01 08:00:00 UTC', '999']] }))
    expect(r.messages).toHaveLength(0)
    expect(r.ips).toHaveLength(0)
    expect(r.discarded).toBe(2)
  })
})
