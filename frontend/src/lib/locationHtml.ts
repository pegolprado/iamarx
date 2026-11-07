/**
 * Relatório de localização em um único arquivo HTML (abre offline em qualquer navegador; o
 * fundo do mapa precisa de internet). Gerado no navegador e entregue como download.
 */
import leafletCss from 'leaflet/dist/leaflet.css?raw'
import leafletJs from 'leaflet/dist/leaflet.js?raw'
import type { CellStat, LocEvent, Tower } from '../engine/location'
import { EVENT_TYPE_LABEL, fmtNumberPlain } from './format'

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const br = (ts: string | null) => (ts ? `${ts.slice(8, 10)}/${ts.slice(5, 7)}/${ts.slice(0, 4)} ${ts.slice(11, 19)}` : '—')
const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

type Input = {
  title: string
  number: string
  operator: string | null
  events: LocEvent[]
  towers: Tower[]
  transitions: { a: [number, number]; b: [number, number]; n: number }[]
  patterns: {
    total: number
    located: number
    home: CellStat | null
    work: CellStat | null
    top: CellStat[]
    days: { day: string; n: number }[]
    first: string | null
    last: string | null
  }
  radius: number
  /** abertura do setor em graus (padrão 120) */
  beam?: number
  by: string
}

const cellCard = (title: string, c: CellStat | null, color: string) =>
  c
    ? `<div class="card" style="border-left:4px solid ${color}"><h3>${esc(title)}</h3><table class="kv">
<tr><th>ERB</th><td class="mono">${esc(c.cell)}</td></tr><tr><th>Endereço</th><td>${esc(c.address)}</td></tr><tr><th>Cidade</th><td>${esc(c.city)}</td></tr>
<tr><th>Coordenadas</th><td class="mono">${c.lat ?? '—'}, ${c.lon ?? '—'}</td></tr><tr><th>Azimute</th><td>${c.az ?? '—'}°</td></tr>
<tr><th>Registros</th><td>${c.n.toLocaleString('pt-BR')} (${pct(c.pct)})</td></tr></table></div>`
    : `<div class="card"><h3>${esc(title)}</h3><p class="muted">Sem registros nesse período.</p></div>`

export function locationHtml(d: Input): string {
  const p = d.patterns
  const maxDay = Math.max(1, ...p.days.map((x) => x.n))
  const data = JSON.stringify({
    towers: d.towers.map((t) => ({ lat: t.lat, lon: t.lon, n: t.n, a: t.address, c: t.city, cells: t.cells.map((c) => ({ id: c.cell, az: c.az, n: c.n })) })),
    path: d.transitions,
    radius: d.radius,
    beam: d.beam ?? 120,
  }).replace(/</g, '\\u003c')
  const rows = d.events
    .slice()
    .reverse()
    .map(
      (e) =>
        `<tr><td class="mono">${br(e.ts)}</td><td>${esc(EVENT_TYPE_LABEL[e.type] ?? e.type)}</td><td class="mono">${esc(fmtNumberPlain(e.other))}</td><td class="mono">${esc(e.cell ?? '')}</td><td>${esc(e.address ?? '')}</td><td>${esc(e.city ?? '')}</td><td>${e.az ?? ''}</td></tr>`,
    )
    .join('')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.title)}</title><style>${leafletCss}
:root{--bg:#0f1424;--panel:#171d31;--line:#2a3350;--text:#e6e9f2;--muted:#98a2bd;--accent:#4c8dff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:1200px;margin:0 auto;padding:16px}h1{font-size:22px;margin:0}h2{font-size:16px;margin:24px 0 10px}h3{font-size:14px;margin:0 0 8px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px}.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.muted{color:var(--muted)}.mono{font-family:ui-monospace,Menlo,monospace}.stats{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}.stat{background:#0b1020;border:1px solid var(--line);border-radius:10px;padding:8px 14px}.stat b{display:block;font-size:20px}
#map{height:560px;border-radius:12px;border:1px solid var(--line)}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--muted);font-weight:600}
.kv th{width:110px}.bars{display:flex;align-items:flex-end;gap:2px;height:160px;border-bottom:1px solid var(--line)}.bars div{flex:1;background:linear-gradient(#60a5fa,#2563eb);border-radius:3px 3px 0 0;min-width:3px}
.note{border:1px solid #a16207;background:#422006;color:#fde68a;border-radius:10px;padding:10px;font-size:12px;margin-top:16px}.tw{display:flex;flex-direction:column;align-items:center;color:#111;filter:drop-shadow(0 0 2px #fff)}.tw span{background:#b91c1c;color:#fff;border-radius:4px;padding:0 4px;font:700 10px/14px monospace;margin-top:-2px}
.leaflet-div-icon{background:none;border:0}.base{position:absolute;top:10px;right:10px;z-index:500;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px #0005}.base button{border:0;padding:6px 10px;font-weight:600;cursor:pointer;background:#fff}.base button.on{background:#111;color:#fff}
.scroll{max-height:520px;overflow:auto}@media print{#map{height:420px}.scroll{max-height:none}}
</style></head><body><main>
<h1>${esc(d.title)}</h1>
<p class="muted">Número <b class="mono" style="color:var(--text)">${esc(fmtNumberPlain(d.number))}</b>${d.operator ? ` · ${esc(d.operator)}` : ''} · período ${br(p.first)} a ${br(p.last)}</p>
<div class="stats"><div class="stat">Total de eventos<b>${p.total.toLocaleString('pt-BR')}</b></div><div class="stat">Com ERB<b>${p.located.toLocaleString('pt-BR')}</b></div><div class="stat">ERBs (torres) no mapa<b>${d.towers.length}</b></div><div class="stat">Células<b>${d.towers.reduce((a, t) => a + t.cells.length, 0)}</b></div></div>
<h2>Mapa</h2><div style="position:relative"><div id="map"></div><div class="base"><button id="b1" class="on">Mapa</button><button id="b2">Satélite</button></div></div>
<h2>Análise geográfica de ERBs</h2><p class="muted">Estimativas pela recorrência de antenas nos registros; a ERB indica a estação, não a posição exata do aparelho. A validação é do analista.</p>
<div class="grid">${cellCard('Maior incidência à noite (20h–6h) e nos fins de semana — provável residência', p.home, '#22c55e')}${cellCard('Maior incidência em dias úteis, 8h–18h — provável trabalho', p.work, '#f97316')}</div>
<h2>ERBs com maior incidência</h2><div class="card"><table><tr><th>#</th><th>ERB</th><th>Endereço</th><th>Cidade</th><th>Azimute</th><th>Registros</th><th>Primeiro</th><th>Último</th></tr>
${p.top.map((c, i) => `<tr><td>${i + 1}</td><td class="mono">${esc(c.cell)}</td><td>${esc(c.address)}</td><td>${esc(c.city)}</td><td>${c.az ?? '—'}°</td><td>${c.n.toLocaleString('pt-BR')} (${pct(c.pct)})</td><td class="mono">${br(c.first)}</td><td class="mono">${br(c.last)}</td></tr>`).join('')}</table></div>
<h2>Volume de eventos por dia</h2><div class="card"><div class="bars">${p.days.map((x) => `<div style="height:${(x.n / maxDay) * 100}%" title="${x.day.split('-').reverse().join('/')}: ${x.n}"></div>`).join('')}</div>
<p class="muted" style="font-size:11px">${p.days.length} dias · maior volume: ${(p.days.reduce((a, x) => (x.n > a.n ? x : a), { day: '', n: 0 }).day || '—').split('-').reverse().join('/')} (${maxDay})</p></div>
<h2>Eventos (${d.events.length.toLocaleString('pt-BR')})</h2><div class="card scroll"><table><tr><th>Data/hora</th><th>Tipo</th><th>Interlocutor</th><th>ERB</th><th>Endereço</th><th>Cidade</th><th>Az.</th></tr>${rows}</table></div>
<div class="note">Relatório gerado pelo MARX por ${esc(d.by)} em ${new Date().toLocaleString('pt-BR')}. Coordenadas e azimutes são da estação (antena); setores são representações esquemáticas, não cobertura real. Deslocamentos ligam ERBs registradas em sequência e não representam trajeto físico.</div>
</main><script>${leafletJs.replace(/<\/script/gi, '<\\/script')}</script><script>
(function(){var D=${data};var m=L.map('map');var osm='https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',sat='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
var base=L.tileLayer(osm,{maxZoom:19,attribution:'Esri · OpenStreetMap'}).addTo(m);
function sw(u,id){base.setUrl(u);document.getElementById('b1').className=id==='b1'?'on':'';document.getElementById('b2').className=id==='b2'?'on':''}
document.getElementById('b1').onclick=function(){sw(osm,'b1')};document.getElementById('b2').onclick=function(){sw(sat,'b2')};
function dest(la,lo,az,r){var a=az*Math.PI/180;return[la+r*Math.cos(a)/111320,lo+r*Math.sin(a)/(111320*Math.cos(la*Math.PI/180))]}
function sec(la,lo,az,r){var b=D.beam||120,p=[[la,lo]];for(var i=0;i<=18;i++)p.push(dest(la,lo,az-b/2+b*i/18,r));return p}
var mx=1;D.path.forEach(function(t){mx=Math.max(mx,t.n)});
D.towers.forEach(function(t){t.cells.forEach(function(c){if(c.az!==null)L.polygon(sec(t.lat,t.lon,c.az,D.radius),{color:'#2563eb',weight:1,fillOpacity:.12,interactive:false}).addTo(m)})});
D.path.forEach(function(t){L.polyline([t.a,t.b],{color:'#dc2626',weight:1.5+2.5*Math.sqrt(t.n/mx),dashArray:'6 6'}).addTo(m)});
var tw='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/><circle cx="12" cy="9" r="2"/><path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/><path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/><path d="M9.5 18h5"/><path d="m8 22 4-11 4 11"/></svg>';
var b=[];D.towers.forEach(function(t){b.push([t.lat,t.lon]);var e=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
L.marker([t.lat,t.lon],{icon:L.divIcon({className:'',html:'<div class="tw">'+tw+'<span>'+t.n+'</span></div>',iconSize:[44,40],iconAnchor:[22,30]})}).addTo(m)
.bindPopup('<b>'+e(t.a)+'</b><br>'+e(t.c)+'<br>'+t.n+' eventos<br>'+t.cells.map(function(c){return e(c.id)+' · az '+(c.az==null?'—':c.az)+'° · '+c.n}).join('<br>'))});
if(b.length)m.fitBounds(b,{padding:[30,30],maxZoom:15});else m.setView([-15.8,-47.9],4)})();
</script></body></html>`
}

export function downloadHtml(html: string, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 3000)
}
