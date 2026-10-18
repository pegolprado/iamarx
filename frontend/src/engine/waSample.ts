/** Documento sintético no formato do WhatsApp Records (tabelas aninhadas, como o records.html da Meta). */
const row = (k: string, v: string) => `<tr><th class="i">${k}</th><td class="i"><div class="m"><div>${v}</div></div></td></tr>`
const block = (rows: [string, string][]) => `<div class="m"><div><table class="t i">${rows.map(([k, v]) => row(k, v)).join('')}</table></div></div>`

export function waRecordsHtml(opts: { account?: string; messages?: [string, string, string[], string | null, string | null][]; calls?: [string, string, string, [string, string][]][]; ips?: [string, string][] } = {}) {
  const account = opts.account ?? '5561900000001'
  const msgs = (opts.messages ?? [
    ['2026-03-02 13:15:05 UTC', account, ['5561980000001'], null, '177.10.20.30'],
    ['2026-03-02 13:16:40 UTC', '5561980000001', [account], null, '200.1.2.3'],
    ['2026-03-03 01:02:03 UTC', account, ['5561980000002', '5561980000003', '5561980000004'], '120363000000000001@g.us', '177.10.20.31'],
  ]) as [string, string, string[], string | null, string | null][]
  const calls = opts.calls ?? [
    ['ABC123', account, 'audio', [['offer', '2026-03-04 10:00:00 UTC'], ['accept', '2026-03-04 10:00:05 UTC'], ['terminate', '2026-03-04 10:02:05 UTC']]],
    ['DEF456', '5561980000009', 'video', [['offer', '2026-03-05 22:10:00 UTC'], ['terminate', '2026-03-05 22:10:30 UTC']]],
  ]
  const ips = opts.ips ?? [['2026-03-01 08:00:00 UTC', '177.10.20.30'], ['2026-03-06 09:30:00 UTC', '2804:14c:abcd::1']]
  const msgHtml = msgs
    .map(([ts, from, to, group, ip], i) =>
      block([
        ['Timestamp', ts], ['Message Id', `3EB0${i}AB`], ['Sender', from], ['Recipients', to.join(' ')], ...(group ? [['Group Id', group] as [string, string]] : []),
        ['Sender Ip', ip ?? ''], ['Sender Port', String(40000 + i)], ['Sender Device', 'android'], ['Type', i === 1 ? 'image' : 'text'], ['Message Style', group ? 'group' : 'individual'], ['Message Size', '120'],
      ]),
    )
    .join('')
  const callHtml = calls
    .map(([id, creator, media, evs]) => {
      const other = creator === account ? '5561980000001' : account
      const events = evs.map(([type, ts]) => block([['Type', type], ['Timestamp', ts], ['From', type === 'accept' ? other : creator], ['To', type === 'accept' ? creator : other], ['From Ip', creator === account ? '177.10.20.30' : '191.5.6.7'], ['From Port', '50000'], ['Media Type', media]])).join('')
      return `<div class="m"><div><table class="t i">${row('Call Id', id)}${row('Call Creator', creator)}<tr><th class="i">Events</th><td class="i">${events}</td></tr><tr><th class="i">Participants</th><td class="i">${block([['Phone Number', other], ['State', 'connected'], ['Platform', 'android']])}</td></tr></table></div></div>`
    })
    .join('')
  const ipHtml = ips.map(([ts, ip]) => block([['Time', ts], ['IP Address', ip]])).join('')
  return `<!DOCTYPE html><html><head><style>.t{}</style></head><body>
<div id="property-request_parameters"><table class="t o">
${row('Service', 'WhatsApp')}${row('Internal Ticket Number', '9876543')}${row('Account Identifier', `+${account}`)}${row('Account Type', 'WhatsApp')}
${row('Generated', '2026-04-01 12:00:00 UTC')}${row('Date Range', '2026-03-01 00:00:00 UTC to 2026-03-31 23:59:59 UTC')}</table></div>
<div id="property-ncmec_reports_definition"><table class="t o"><tr><th class="o">Message Log Definition</th><td class="o">Timestamp The time the message was sent. Sender The phone number of the sender.</td></tr></table></div>
<div id="property-message_log"><table class="t o"><tr><th class="o">Message Log</th><td class="o">${msgHtml}</td></tr></table></div>
<div id="property-call_logs"><table class="t o"><tr><th class="o">Call Logs</th><td class="o">${callHtml}</td></tr></table></div>
<div id="property-ip_addresses"><table class="t o"><tr><th class="o">Ip Addresses</th><td class="o">${ipHtml}</td></tr></table></div>
</body></html>`
}
