import { useQuery } from '@tanstack/react-query'
import L from 'leaflet'
import { Download, Map as MapIcon, Upload, Pause, Play, Share2, SkipBack, SkipForward } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../../app/auth'
import { type AzMode, baseLayer, ErbMap, groupSites, STREETS } from '../../components/ErbMap'
import { useSession } from '../../engine/session'
import { encryptMap, randomPassword, type SitePoint, toKml } from '../../lib/shareMap'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../api/client'
import { cellSequence, geoPoints, registryMapPoints } from '../../engine/analytics'
import { apath, useCase } from '../../app/layout'
import { FilterBar } from '../../components/FilterBar'
import { Badge, Criteria, DrillLink, Empty, ErrorBox, Field, Loading, Modal, Notice, PageHeader, Tabs } from '../../components/ui'
import { EVENT_TYPE_LABEL, fmtDateTime, fmtDuration, fmtInt, fmtNumber } from '../../lib/format'
import { useUrlFilter } from '../../lib/useUrlFilter'

function sectorPolygon(lat: number, lon: number, az: number, bw: number, radiusM: number): [number, number][] {
  const pts: [number, number][] = [[lat, lon]]
  const steps = 16
  for (let i = 0; i <= steps; i++) {
    const a = ((az - bw / 2 + (bw * i) / steps) * Math.PI) / 180
    const dLat = (radiusM * Math.cos(a)) / 111320
    const dLon = (radiusM * Math.sin(a)) / (111320 * Math.cos((lat * Math.PI) / 180))
    pts.push([lat + dLat, lon + dLon])
  }
  return pts
}

function useLeaflet(tileUrl?: string, attribution?: string) {
  const ref = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  useEffect(() => {
    if (!ref.current || map.current || !tileUrl) return
    map.current = L.map(ref.current, { preferCanvas: true }).setView([-15.79, -47.88], 11)
    const t: L.TileLayer = baseLayer(tileUrl, attribution ?? '', () => t.setUrl(STREETS.url)).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [tileUrl, attribution])
  return { ref, map, layer }
}

export default function GeoMap() {
  const [sp] = useSearchParams()
  const [tab, setTab] = useState(sp.get('aba') ?? 'mapa')
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api('/settings') })
  return (
    <div>
      <PageHeader
        icon={<MapIcon className="h-5 w-5" />}
        title="Geolocalização"
        subtitle="Somente coordenadas válidas do cadastro técnico importado ou informadas no próprio documento. A coordenada é da estação (antena), não do aparelho; setores são representações esquemáticas, não cobertura real comprovada."
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'mapa', label: 'Mapa de estações' },
          { value: 'sequencia', label: 'Sequência de células' },
          { value: 'reproducao', label: 'Reprodução cronológica' },
        ]}
      />
      {settings.data && tab === 'mapa' && <StationsMap tile={settings.data.map_tile_url} attr={settings.data.map_attribution} />}
      {settings.data && tab !== 'mapa' && <SequenceView tile={settings.data.map_tile_url} attr={settings.data.map_attribution} playback={tab === 'reproducao'} />}
    </div>
  )
}

const QUICK: { label: string; types: string[] }[] = [
  { label: 'Todos', types: [] },
  { label: 'Voz', types: ['voz_originada', 'voz_recebida', 'voz', 'desvio'] },
  { label: 'Dados', types: ['dados'] },
  { label: 'SMS', types: ['sms_enviado', 'sms_recebido', 'sms'] },
]

function StationsMap({ tile, attr }: { tile: string; attr: string }) {
  const { c } = useCase()
  const [f, setF] = useUrlFilter()
  const [azMode, setAzMode] = useState<AzMode>('linha')
  const [azLen, setAzLen] = useState(600)
  const [sel, setSel] = useState<SitePoint | null>(null)
  const [share, setShare] = useState(false)
  const hasEvents = useSession((x) => x.imports.some((i) => i.status === 'done' && i.kind !== 'erb_registry'))
  const q = useQuery({ queryKey: ['geo', c.id, f], queryFn: () => geoPoints(f) as Promise<any> })
  const eventPoints = useMemo(() => (q.data ? groupSites([...q.data.registry_points, ...q.data.document_points]) : []), [q.data])
  // sem eventos com coordenada: mostra as células do cadastro técnico (se houver)
  const reg = useQuery({ queryKey: ['geo-registry', c.id], queryFn: () => registryMapPoints(), enabled: !!q.data && !eventPoints.length })
  const registryOnly = !eventPoints.length && !!reg.data?.length
  const points = useMemo(() => (registryOnly ? groupSites(reg.data!) : eventPoints), [registryOnly, reg.data, eventPoints])
  const tot = useMemo(
    () =>
      points.reduce((a, p) => ({ voice: a.voice + p.voice, data: a.data + p.data, sms: a.sms + p.sms, cells: a.cells + p.cells.length }), { voice: 0, data: 0, sms: 0, cells: 0 }),
    [points],
  )
  const quick = QUICK.find((x) => JSON.stringify(x.types) === JSON.stringify(f.event_types ?? [])) ?? null
  const onSelect = useCallback((p: SitePoint) => setSel(p), [])
  return (
    <>
      <FilterBar value={f} onChange={setF} compact />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ['Voz', tot.voice],
          ['Dados', tot.data],
          ['SMS', tot.sms],
          ['ERBs (células)', tot.cells],
          ['Estações no mapa', points.length],
        ].map(([l, v]) => (
          <div key={l as string} data-stat={l} className="card px-4 py-3 text-center">
            <div className="text-xs text-muted">{l}</div>
            <div className="font-mono text-2xl text-white tabular-nums">{fmtInt(v as number)}</div>
          </div>
        ))}
      </div>
      <div className="card mb-4 flex flex-wrap items-end gap-4 p-4 text-sm">
        <div>
          <span className="label">Eventos</span>
          <div className="flex gap-1 rounded-xl border border-line bg-ink-2 p-1" role="group" aria-label="Tipo de evento">
            {QUICK.map((x) => (
              <button
                key={x.label}
                aria-pressed={quick === x}
                className={`rounded-lg px-3 py-1 text-sm ${quick === x ? 'bg-accent text-white' : 'text-muted hover:text-text'}`}
                onClick={() => setF({ ...f, event_types: x.types.length ? x.types : undefined })}
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>
        <Field label="Azimute">
          <select value={azMode} onChange={(e) => setAzMode(e.target.value as AzMode)}>
            <option value="linha">linha</option>
            <option value="setor">setor (esquemático)</option>
            <option value="nenhum">não mostrar</option>
          </select>
        </Field>
        <Field label="Comprimento (m)">
          <input type="number" min={100} max={10000} step={100} className="w-24" value={azLen} onChange={(e) => setAzLen(Math.max(100, +e.target.value))} />
        </Field>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            className="btn-ghost"
            disabled={!points.length}
            onClick={() => downloadKml(points, `MARX_mapa_ERB_${new Date().toISOString().slice(0, 10)}.kml`)}
            title="Arquivo para Google Earth / Google Maps"
          >
            <Download className="h-4 w-4" /> KML
          </button>
          <button
            className="btn-primary"
            disabled={!points.length || !c.can_export}
            onClick={() => setShare(true)}
            title={c.can_export ? 'Gerar link protegido por senha' : 'Exportação desativada para seu usuário'}
          >
            <Share2 className="h-4 w-4" /> Compartilhar mapa
          </button>
        </div>
      </div>
      {q.error && <ErrorBox error={q.error} />}
      {registryOnly && (
        <div className="mb-4">
          <Notice tone="amber" title="Mostrando o cadastro de ERB (sem eventos)">
            Nenhum evento com localização foi importado, então o mapa mostra as {fmtInt(points.length)} estações do cadastro técnico, sem contagem. Para ver a quantidade de eventos
            por ERB, carregue o extrato (bilhetagem ou interceptação) em Arquivos.
          </Notice>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="relative">
          <ErbMap points={points} tileUrl={tile} tileAttr={attr} azMode={azMode} azLen={azLen} onSelect={onSelect} />
          {q.isLoading && (
            <div className="absolute inset-0 z-[600] grid place-items-center rounded-2xl bg-ink/50">
              <Loading />
            </div>
          )}
          {q.data && !points.length && (
            <div className="absolute inset-0 z-[600] grid place-items-center rounded-2xl bg-ink/70 p-6">
              {!hasEvents ? (
                <Empty title="Nenhum arquivo carregado nesta análise">
                  <p>
                    Nada fica salvo: a cada novo acesso é preciso carregar os arquivos de novo. Carregue o extrato (com latitude/longitude) ou a bilhetagem e o cadastro de ERB.
                  </p>
                  <Link to={apath('arquivos')} className="btn-primary mt-4">
                    <Upload className="h-4 w-4" /> Carregar arquivos
                  </Link>
                </Empty>
              ) : (
                <Empty title="Sem coordenadas válidas">
                  Os registros importados não trazem latitude/longitude. Carregue o cadastro técnico de ERB (planilha com célula e coordenadas) para posicionar as antenas.
                </Empty>
              )}
            </div>
          )}
        </div>
        <aside className="card p-4 text-sm">
          {sel ? (
            <div className="space-y-2">
              <div className="font-bold text-white">{sel.name ?? 'Estação (coordenada informada)'}</div>
              <dl className="grid grid-cols-2 gap-1 text-xs">
                <dt className="text-muted">Coordenadas</dt>
                <dd className="font-mono">
                  {sel.lat.toFixed(5)}, {sel.lon.toFixed(5)}
                </dd>
                <dt className="text-muted">Azimute(s)</dt>
                <dd>{sel.az.length ? sel.az.map((a) => `${a}°`).join(', ') : '—'}</dd>
                <dt className="text-muted">Eventos</dt>
                <dd>
                  {fmtInt(sel.events)} (voz {fmtInt(sel.voice)}, SMS {fmtInt(sel.sms)}, dados {fmtInt(sel.data)})
                </dd>
                <dt className="text-muted">Primeiro</dt>
                <dd>{fmtDateTime(sel.first)}</dd>
                <dt className="text-muted">Último</dt>
                <dd>{fmtDateTime(sel.last)}</dd>
                <dt className="text-muted">Números</dt>
                <dd>{(sel.numbers ?? []).map(fmtNumber).join(', ') || '—'}</dd>
                <dt className="text-muted">Células</dt>
                <dd className="font-mono text-[11px] break-all">{sel.cells.join(', ')}</dd>
              </dl>
              <div className="flex flex-wrap gap-2 pt-1">
                <DrillLink caseId={c.id} filter={{ ...f, cell_keys: sel.cells }} className="btn-ghost !py-1 text-xs">
                  Abrir registros
                </DrillLink>
                <a className="btn-ghost !py-1 text-xs" href={`https://www.google.com/maps/search/?api=1&query=${sel.lat},${sel.lon}`} target="_blank" rel="noreferrer noopener">
                  Google Maps
                </a>
              </div>
            </div>
          ) : (
            <p className="text-muted">Clique numa estação para ver as células, azimutes, horários e abrir os registros.</p>
          )}
          {q.data && (
            <div className="mt-6 space-y-2">
              <Notice tone="amber">{q.data.criteria.limit_note}</Notice>
              <p className="text-xs text-faint">Eventos sem coordenada (não resolvidos ou sem cadastro): {fmtInt(q.data.events_without_coordinates)}</p>
            </div>
          )}
        </aside>
      </div>
      {q.data && <Criteria criteria={q.data.criteria} />}
      {share && <ShareMapModal points={points} filter={f} onClose={() => setShare(false)} />}
    </>
  )
}

function downloadKml(points: SitePoint[], name: string) {
  const blob = new Blob([toKml({ title: name.replace(/\.kml$/, ''), points })], { type: 'application/vnd.google-earth.kml+xml' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

const EXPIRY: [string, number | null][] = [
  ['24 horas', 1],
  ['7 dias', 7],
  ['30 dias', 30],
  ['sem validade', null],
]

/** Gera o link do mapa: dados criptografados no próprio link, abertos só com a senha. */
function ShareMapModal({ points, filter, onClose }: { points: SitePoint[]; filter: any; onClose: () => void }) {
  const { me } = useAuth()
  const st = useSession((s) => s.meta)
  const [title, setTitle] = useState(`Mapa de ERBs — ${st.title}`)
  const [password, setPassword] = useState(randomPassword)
  const [days, setDays] = useState<number | null>(7)
  const [withNumbers, setWithNumbers] = useState(false)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const types = (filter.event_types ?? []).length ? (filter.event_types as string[]).map((t) => EVENT_TYPE_LABEL[t] ?? t).join(', ') : 'todos os eventos'
  const gen = async () => {
    if (password.length < 8) return toast.error('Use uma senha com pelo menos 8 caracteres.')
    setBusy(true)
    try {
      const firsts = points.map((p) => p.first).filter(Boolean) as string[]
      const lasts = points.map((p) => p.last).filter(Boolean) as string[]
      const frag = await encryptMap(
        {
          v: 1,
          title: title.trim() || 'Mapa de ERBs',
          by: me?.name ?? '',
          at: new Date().toISOString(),
          exp: days ? new Date(Date.now() + days * 86400000).toISOString() : null,
          period: [firsts.sort()[0] ?? null, lasts.sort().slice(-1)[0] ?? null],
          types,
          numbers: withNumbers ? [...new Set(points.flatMap((p) => p.numbers ?? []))] : [],
          points: points.map((p) => ({ ...p, numbers: withNumbers ? p.numbers : [] })),
        },
        password,
      )
      setLink(`${location.origin}/mapa-compartilhado#${frag}`)
    } finally {
      setBusy(false)
    }
  }
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${what} copiado`)
    } catch {
      toast.error('Não foi possível copiar; selecione e copie manualmente.')
    }
  }
  return (
    <Modal open title="Compartilhar mapa" onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        <Notice tone="teal">
          O mapa vai <b>criptografado dentro do próprio link</b> (AES-256): nada é gravado no MARX nem em outro servidor. Quem receber precisa do link <b>e</b> da senha — envie a
          senha por outro meio.
        </Notice>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Título" className="sm:col-span-2">
            <input className="w-full" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Senha do link" hint="gerada automaticamente; pode trocar (mínimo 8 caracteres)">
            <input className="w-full font-mono" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Validade">
            <select className="w-full" value={String(days)} onChange={(e) => setDays(e.target.value === 'null' ? null : +e.target.value)}>
              {EXPIRY.map(([l, d]) => (
                <option key={l} value={String(d)}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={withNumbers} onChange={(e) => setWithNumbers(e.target.checked)} /> incluir os números de telefone (por padrão o link leva só as estações,
          azimutes, contagens e horários)
        </label>
        <p className="text-xs text-faint">
          Conteúdo: {fmtInt(points.length)} estações · {types}. A validade é verificada ao abrir; como o link não fica guardado em lugar nenhum, ele não pode ser “desligado” depois
          — escolha a validade e a senha com cuidado.
        </p>
        {!link ? (
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={gen} disabled={busy}>
              <Share2 className="h-4 w-4" /> {busy ? 'Criptografando…' : 'Gerar link'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label={`Link (${fmtInt(link.length)} caracteres)`}>
              <textarea readOnly className="w-full font-mono text-[11px]" rows={3} value={link} onFocus={(e) => e.currentTarget.select()} />
            </Field>
            {link.length > 60000 && <Notice tone="amber">Link muito longo: alguns aplicativos de mensagem podem cortá-lo. Filtre o período/tipos ou envie o arquivo KML.</Notice>}
            <div className="flex flex-wrap justify-end gap-2">
              <button className="btn-ghost" onClick={() => copy(password, 'Senha')}>
                Copiar senha
              </button>
              <button className="btn-primary" onClick={() => copy(link, 'Link')}>
                Copiar link
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function SequenceView({ tile, attr, playback }: { tile: string; attr: string; playback: boolean }) {
  const { c, meta } = useCase()
  const targets = meta?.targets ?? []
  const [target, setTarget] = useState<string>(targets[0]?.number ?? '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [showLine, setShowLine] = useState(false)
  const filter = { targets: target ? [target] : [], ...(from ? { date_from: from } : {}), ...(to ? { date_to: to } : {}) }
  const q = useQuery({ queryKey: ['seq', c.id, filter], queryFn: () => cellSequence(filter) as Promise<any>, enabled: !!target })
  const { ref, map, layer } = useLeaflet(tile, attr)
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(700)
  const items: any[] = q.data?.items ?? []
  const withCoords = items.filter((x) => x.lat !== null)
  useEffect(() => setIdx(0), [q.data])
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setIdx((i) => (i + 1 >= items.length ? (setPlaying(false), i) : i + 1)), speed)
    return () => clearInterval(t)
  }, [playing, speed, items.length])
  useEffect(() => {
    if (!map.current || !layer.current) return
    layer.current.clearLayers()
    if (!withCoords.length) return
    const visible = playback ? items.slice(0, idx + 1).filter((x) => x.lat !== null) : withCoords
    const seen = new Map<string, number>()
    visible.forEach((x) => seen.set(`${x.lat},${x.lon}`, (seen.get(`${x.lat},${x.lon}`) ?? 0) + 1))
    for (const [k, n] of seen) {
      const [la, lo] = k.split(',').map(Number)
      L.circleMarker([la, lo], { radius: 5 + Math.min(10, Math.sqrt(n) * 2), color: '#0b0f1a', weight: 2, fillColor: '#4c8dff', fillOpacity: 0.55 })
        .bindTooltip(`${n} registro(s)`)
        .addTo(layer.current)
    }
    if (showLine && visible.length > 1) {
      L.polyline(
        visible.map((x) => [x.lat, x.lon]),
        { color: '#8d97ab', weight: 1, dashArray: '2 6', opacity: 0.7 },
      )
        .bindTooltip('sequência de registros de rede (não é trajeto físico)')
        .addTo(layer.current)
    }
    const cur = playback ? items[idx] : null
    if (cur && cur.lat !== null) {
      if (cur.azimuth !== null)
        L.polygon(sectorPolygon(cur.lat, cur.lon, cur.azimuth, cur.beamwidth ?? 65, 700), { color: '#f5a524', weight: 1, fillOpacity: 0.2, dashArray: '4 3' }).addTo(layer.current)
      L.circleMarker([cur.lat, cur.lon], { radius: 11, color: '#fff', weight: 2, fillColor: '#f5a524', fillOpacity: 1 }).addTo(layer.current)
    }
    if (!playback || idx === 0) map.current.fitBounds(withCoords.map((x) => [x.lat, x.lon]) as [number, number][], { padding: [40, 40], maxZoom: 15 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, idx, playback, showLine])
  const cur = items[idx]
  return (
    <>
      <div className="card mb-4 flex flex-wrap items-end gap-4 p-4 text-sm">
        <Field label="Número">
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {targets.map((t: any) => (
              <option key={t.number} value={t.number}>
                {fmtNumber(t.number)} {t.label ? `— ${t.label}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="De">
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Até">
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 pb-2">
          <input type="checkbox" checked={showLine} onChange={(e) => setShowLine(e.target.checked)} /> ligar a ordem dos registros (tracejado)
        </label>
      </div>
      <Notice tone="amber">
        Sequência documental de registros de rede. Não representa trajeto físico, velocidade, permanência ou endereço; a posição contínua do aparelho não é simulada.
      </Notice>
      {q.isLoading && <Loading />}
      {q.error && <ErrorBox error={q.error} />}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="card overflow-hidden">
          <div ref={ref} className="h-[560px] w-full" />
          {playback && items.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-t border-line p-3">
              <button className="btn-ghost !p-2" onClick={() => setIdx(Math.max(0, idx - 1))} aria-label="Retroceder">
                <SkipBack className="h-4 w-4" />
              </button>
              <button className="btn-primary !p-2" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pausar' : 'Reproduzir'}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button className="btn-ghost !p-2" onClick={() => setIdx(Math.min(items.length - 1, idx + 1))} aria-label="Avançar">
                <SkipForward className="h-4 w-4" />
              </button>
              <input type="range" min={0} max={items.length - 1} value={idx} onChange={(e) => setIdx(+e.target.value)} className="flex-1 !p-0" aria-label="Posição na sequência" />
              <select value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label="Velocidade">
                <option value={1500}>lenta</option>
                <option value={700}>normal</option>
                <option value={250}>rápida</option>
              </select>
              <span className="font-mono text-xs text-muted">
                {idx + 1}/{items.length}
              </span>
            </div>
          )}
        </div>
        <aside className="card max-h-[620px] overflow-auto p-3">
          {playback && cur && (
            <div className="mb-3 rounded-lg border border-amber/40 bg-amber/5 p-3 text-sm">
              <div className="font-mono text-amber">{fmtDateTime(cur.ts_local)}</div>
              <div>{EVENT_TYPE_LABEL[cur.event_type]}</div>
              <div className="font-mono text-xs break-all text-muted">{cur.cell_key}</div>
              <div className="text-xs text-muted">
                {cur.site_name ?? 'estação sem nome'} · coordenada: {cur.coord_source ?? 'indisponível'}
                {cur.interval_s !== null && ` · ${fmtDuration(cur.interval_s)} após o registro anterior`}
              </div>
            </div>
          )}
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Data/hora</th>
                <th>Célula / estação</th>
                <th>Intervalo</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x, i) => (
                <tr key={x.id} className={playback && i === idx ? 'bg-amber/10' : ''} onClick={() => setIdx(i)}>
                  <td className="font-mono text-xs text-faint">{i + 1}</td>
                  <td className="text-xs whitespace-nowrap">
                    {fmtDateTime(x.ts_local)}
                    {x.tz_status !== 'confirmed' && <span className="text-amber"> *</span>}
                  </td>
                  <td className="text-xs">
                    {x.cell_changed && (
                      <Badge tone="teal" className="mr-1">
                        troca
                      </Badge>
                    )}
                    {x.site_name ?? <span className="font-mono">{x.cell_key}</span>}
                    {x.lat === null && <span className="text-faint"> (sem coordenada)</span>}
                  </td>
                  <td className="font-mono text-xs">{x.interval_s !== null ? fmtDuration(x.interval_s) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {q.data?.truncated && <p className="mt-2 text-xs text-amber">Sequência limitada a 5.000 registros: reduza o período.</p>}
          <p className="mt-2 text-xs text-faint">* fuso horário não confirmado</p>
        </aside>
      </div>
      {q.data && <Criteria criteria={q.data.criteria} />}
    </>
  )
}
