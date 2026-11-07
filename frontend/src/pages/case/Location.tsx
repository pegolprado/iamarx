import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { ArrowDownUp, Briefcase, CalendarDays, FileCode2, Home, LineChart, MapPin, Pause, Play, RadioTower, Share2, Square, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../../app/auth'
import { apath, useCase } from '../../app/layout'
import { api } from '../../api/client'
import { BarsChart } from '../../components/charts'
import { LocationMap } from '../../components/LocationMap'
import { Badge, Empty, ErrorBox, Loading, Modal, Notice } from '../../components/ui'
import {
  type CellStat,
  isHomeTime,
  isWorkTime,
  type LocEvent,
  locationEvents,
  locationPatterns,
  locationTargets,
  rankCells,
  towers as toTowers,
  transitions as toTransitions,
  type Tower,
} from '../../engine/location'
import { useSession } from '../../engine/session'
import { EVENT_TYPE_LABEL, fmtDate, fmtInt, fmtNumber } from '../../lib/format'
import { downloadHtml, locationHtml } from '../../lib/locationHtml'
import { encryptMap, randomPassword, type SitePoint, toKml } from '../../lib/shareMap'

const br = (ts: string | null | undefined) => (ts ? `${ts.slice(8, 10)}/${ts.slice(5, 7)}/${ts.slice(0, 4)} ${ts.slice(11, 19)}` : '—')
const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
const TYPES: [string, string, (t: string) => boolean][] = [
  ['todos', 'Todos', () => true],
  ['voz', 'Voz', (t) => t.startsWith('voz') || t === 'desvio' || t.startsWith('wa_chamada')],
  ['dados', 'Dados', (t) => t === 'dados' || t === 'evento_rede' || t === 'outro' || t === 'wa_conexao'],
  ['sms', 'SMS', (t) => t.startsWith('sms') || t.startsWith('wa_msg')],
]
const SPEEDS = [1, 2, 3, 5]

/**
 * Localização do alvo: carregou o extrato com ERBs (bilhetagem, interceptação ou relatório de
 * localização da operadora) e aqui está tudo — mapa com torres, setores e deslocamentos, lista de
 * eventos com reprodução, provável residência e trabalho, ERBs mais frequentes e volume por dia.
 */
export default function Location() {
  const { c } = useCase()
  const hasData = useSession((s) => s.imports.some((i) => i.status === 'done' && i.kind !== 'erb_registry'))
  const tq = useQuery({ queryKey: ['loc-targets', c.id], queryFn: locationTargets, enabled: hasData })
  const [target, setTarget] = useState<string>('')
  const number = target || tq.data?.[0]?.number || ''
  const info = tq.data?.find((t: any) => t.number === number)
  const eq = useQuery({ queryKey: ['loc-events', c.id, number], queryFn: () => locationEvents(number), enabled: !!number })
  const [tab, setTab] = useState<'mapa' | 'padroes'>('mapa')

  if (!hasData)
    return (
      <div className="py-6">
        <Empty title="Carregue o extrato do alvo" icon={<RadioTower className="h-6 w-6" />}>
          <p>
            Bilhetagem, interceptação ou relatório de localização da operadora (Excel, CSV, PDF). As ERBs com coordenadas aparecem no mapa com os padrões de residência e trabalho.
          </p>
          <p className="mt-2 text-xs text-faint">Nada fica salvo: a cada acesso é preciso carregar os arquivos de novo.</p>
          <Link to={apath('arquivos')} className="btn-primary mt-4">
            <Upload className="h-4 w-4" /> Carregar arquivo
          </Link>
        </Empty>
      </div>
    )
  if (tq.isLoading || (number && eq.isLoading)) return <Loading label="Montando a análise de localização…" />
  if (tq.error || eq.error) return <ErrorBox error={tq.error ?? eq.error} />
  if (!number || !eq.data) return <Empty title="Nenhum número-alvo identificado nos registros" />
  return <LocationView number={number} info={info} targets={tq.data ?? []} setTarget={setTarget} events={eq.data} tab={tab} setTab={setTab} />
}

function LocationView({
  number,
  info,
  targets,
  setTarget,
  events: all,
  tab,
  setTab,
}: {
  number: string
  info: any
  targets: any[]
  setTarget: (n: string) => void
  events: LocEvent[]
  tab: 'mapa' | 'padroes'
  setTab: (t: 'mapa' | 'padroes') => void
}) {
  const { me } = useAuth()
  const { c } = useCase()
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api('/settings') })
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [type, setType] = useState('todos')
  const [slot, setSlot] = useState<'' | 'casa' | 'trabalho'>('')
  const [desc, setDesc] = useState(true)
  const [shown, setShown] = useState(500)
  const [sel, setSel] = useState<LocEvent | null>(null)
  const [showSectors, setShowSectors] = useState(true)
  const [showPath, setShowPath] = useState(true)
  const [radius, setRadius] = useState(800)
  const [tower, setTower] = useState<Tower | null>(null)
  const [share, setShare] = useState(false)

  // filtros (período, tipo e faixa casa/trabalho) valem para mapa, lista, padrões e exportações
  const events = useMemo(() => {
    const fn = TYPES.find((x) => x[0] === type)![2]
    return all.filter(
      (e) =>
        (!from || e.ts.slice(0, 10) >= from) &&
        (!to || e.ts.slice(0, 10) <= to) &&
        fn(e.type) &&
        (slot !== 'casa' || isHomeTime(e.ts)) &&
        (slot !== 'trabalho' || isWorkTime(e.ts)),
    )
  }, [all, from, to, type, slot])
  const cells = useMemo(() => rankCells(events), [events])
  const tw = useMemo(() => toTowers(cells), [cells])
  const tr = useMemo(() => toTransitions(events), [events])
  const pat = useMemo(() => locationPatterns(events), [events])

  // reprodução cronológica
  const located = useMemo(() => events.filter((e) => e.lat !== null), [events])
  const [playIdx, setPlayIdx] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setPlayIdx((i) => (i + 1 >= located.length ? (setPlaying(false), i) : i + 1)), 900 / speed)
    return () => clearInterval(t)
  }, [playing, speed, located.length])
  useEffect(() => {
    setPlayIdx(-1)
    setPlaying(false)
  }, [located])
  const current = playIdx >= 0 ? (located[playIdx] ?? null) : sel
  const list = useMemo(() => (desc ? [...events].reverse() : events), [events, desc])
  const onTower = useCallback((t: Tower) => setTower(t), [])

  const exportHtml = () => {
    const html = locationHtml({
      title: `Análise de localização — ${fmtNumber(number).replace(/•/g, '')}`,
      number,
      operator: info?.operator ?? null,
      events,
      towers: tw,
      transitions: tr,
      patterns: pat,
      radius,
      by: me?.name ?? '',
    })
    downloadHtml(html, `MARX_localizacao_${number.replace(/\D/g, '')}_${new Date().toISOString().slice(0, 10)}.html`)
    toast.success('Relatório HTML gerado (abre em qualquer navegador).')
  }
  const sites: SitePoint[] = tw.map((t) => ({
    lat: t.lat,
    lon: t.lon,
    events: t.n,
    voice: 0,
    sms: 0,
    data: 0,
    az: t.cells.map((x) => x.az).filter((x): x is number => x !== null),
    cells: t.cells.map((x) => x.cell),
    first: t.cells.map((x) => x.first).sort()[0] ?? null,
    last:
      t.cells
        .map((x) => x.last)
        .sort()
        .slice(-1)[0] ?? null,
    name: [t.address, t.city].filter(Boolean).join(' · ') || null,
  }))
  const exportKml = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([toKml({ title: `Localização ${number}`, points: sites }, radius)], { type: 'application/vnd.google-earth.kml+xml' }))
    a.download = `MARX_localizacao_${number.replace(/\D/g, '')}.kml`
    a.click()
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
        <CalendarDays className="h-4 w-4 text-accent" /> <span className="font-semibold text-accent">Período dos registros:</span> {br(pat.first)} até {br(pat.last)}
        {targets.length > 1 && (
          <select className="ml-auto" value={number} onChange={(e) => setTarget(e.target.value)} aria-label="Número-alvo">
            {targets.map((t: any) => (
              <option key={t.number} value={t.number}>
                {fmtNumber(t.number)} · {fmtInt(t.events)} eventos
              </option>
            ))}
          </select>
        )}
      </div>

      <section className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-danger/15 text-danger">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="text-[20px] font-semibold text-white">
              Número: <span className="font-mono text-accent">{fmtNumber(number)}</span>
            </div>
            {info?.operator && <Badge tone="red">{String(info.operator).toUpperCase()}</Badge>}
          </div>
          <div className="flex flex-wrap gap-2">
            {c.can_export && (
              <>
                <button className="btn-ghost !py-1.5 text-xs" onClick={exportHtml} disabled={!events.length}>
                  <FileCode2 className="h-4 w-4 text-ok" /> Exportar HTML
                </button>
                <button className="btn-ghost !py-1.5 text-xs" onClick={exportKml} disabled={!tw.length}>
                  <MapPin className="h-4 w-4 text-accent" /> Exportar mapa (KML)
                </button>
                <button className="btn-ghost !py-1.5 text-xs" onClick={() => setShare(true)} disabled={!tw.length}>
                  <Share2 className="h-4 w-4 text-accent" /> Link com senha
                </button>
              </>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {[
            ['Total eventos', pat.total],
            ['Com ERB', pat.located],
            ['ERBs no mapa', tw.length],
            ['Células', cells.length],
          ].map(([l, v]) => (
            <div key={l as string} className="rounded-xl border border-line bg-ink-2 px-5 py-2 text-center" data-stat={l}>
              <div className="text-xs text-muted">{l}</div>
              <div className="font-mono text-xl text-white tabular-nums">{fmtInt(v as number)}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="card grid grid-cols-2 gap-1 p-1" role="tablist">
        {(
          [
            ['mapa', 'Mapa / Eventos', <RadioTower key="i" className="h-4 w-4" />],
            ['padroes', 'Padrões e Estatísticas', <LineChart key="i" className="h-4 w-4" />],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold',
              tab === id ? 'border border-accent/50 bg-accent/15 text-accent' : 'text-muted hover:text-text',
            )}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === 'mapa' ? (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showSectors} onChange={(e) => setShowSectors(e.target.checked)} /> setores
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showPath} onChange={(e) => setShowPath(e.target.checked)} /> deslocamentos
            </label>
            <label className="flex items-center gap-2 text-muted">
              raio
              <select value={radius} onChange={(e) => setRadius(+e.target.value)}>
                {[300, 500, 800, 1200, 2000].map((r) => (
                  <option key={r} value={r}>
                    {r} m
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
            <LocationMap
              towers={tw}
              transitions={tr}
              current={current}
              showSectors={showSectors}
              showPath={showPath}
              radius={radius}
              tileUrl={settings.data?.map_tile_url}
              tileAttr={settings.data?.map_attribution}
              onTower={onTower}
            />
            <aside className="card p-4 text-sm">
              {current ? (
                <EventDetail e={current} />
              ) : tower ? (
                <div className="space-y-2">
                  <div className="font-semibold text-white">{tower.address ?? 'ERB'}</div>
                  <div className="text-xs text-muted">{tower.city}</div>
                  <div className="text-xs">{fmtInt(tower.n)} eventos</div>
                  <table className="text-xs">
                    <tbody>
                      {tower.cells.map((x) => (
                        <tr key={x.cell}>
                          <td className="font-mono">{x.cell}</td>
                          <td>{x.az ?? '—'}°</td>
                          <td className="text-right">{fmtInt(x.n)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted">Toque numa torre ou num evento da lista. Use o ▶ para reproduzir a sequência no mapa.</p>
              )}
              <div className="mt-4">
                <Notice tone="amber">A ERB é a estação (antena), não a posição exata do aparelho. Setores são esquemáticos.</Notice>
              </div>
            </aside>
          </div>

          <section className="card p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-2 font-semibold text-white">Eventos</div>
              <label className="text-xs text-muted">
                de
                <input type="date" className="ml-1" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="text-xs text-muted">
                até
                <input type="date" className="ml-1" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
              <div className="flex gap-1 rounded-xl border border-line bg-ink-2 p-1" role="group" aria-label="Tipo de evento">
                {TYPES.map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={type === id}
                    onClick={() => setType(id)}
                    className={clsx('rounded-lg px-2.5 py-1 text-xs', type === id ? 'bg-accent/15 text-accent' : 'text-muted')}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1" role="group" aria-label="Faixa de horário">
                <button
                  className={clsx('btn-ghost !px-2 !py-1', slot === 'casa' && '!border-ok !text-ok')}
                  title="Noite (20h–6h) e fins de semana"
                  aria-pressed={slot === 'casa'}
                  onClick={() => setSlot(slot === 'casa' ? '' : 'casa')}
                >
                  <Home className="h-4 w-4" />
                </button>
                <button
                  className={clsx('btn-ghost !px-2 !py-1', slot === 'trabalho' && '!border-amber !text-amber')}
                  title="Dias úteis, 8h–18h"
                  aria-pressed={slot === 'trabalho'}
                  onClick={() => setSlot(slot === 'trabalho' ? '' : 'trabalho')}
                >
                  <Briefcase className="h-4 w-4" />
                </button>
                <button className="btn-ghost !px-2 !py-1" title={desc ? 'Mais recentes primeiro' : 'Mais antigos primeiro'} onClick={() => setDesc(!desc)}>
                  <ArrowDownUp className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-line bg-ink-2 px-3 py-1.5" aria-label="Reprodução">
                <span className="text-[11.5px] font-medium text-muted">Playback</span>
                <button
                  aria-label={playing ? 'Pausar' : 'Reproduzir'}
                  onClick={() => (playIdx >= located.length - 1 ? (setPlayIdx(0), setPlaying(true)) : setPlaying(!playing))}
                  disabled={!located.length}
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button
                  aria-label="Parar"
                  onClick={() => {
                    setPlaying(false)
                    setPlayIdx(-1)
                  }}
                >
                  <Square className="h-4 w-4" />
                </button>
                {SPEEDS.map((s) => (
                  <button key={s} onClick={() => setSpeed(s)} className={clsx('rounded px-1.5 text-xs', speed === s ? 'bg-accent/15 text-accent' : 'text-muted')}>
                    {s}×
                  </button>
                ))}
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, located.length - 1)}
                  value={Math.max(0, playIdx)}
                  onChange={(e) => setPlayIdx(+e.target.value)}
                  className="w-32"
                  aria-label="Posição da reprodução"
                />
                {playIdx >= 0 && <span className="font-mono text-xs text-white">{br(located[playIdx]?.ts)}</span>}
              </div>
            </div>
            <p className="mt-3 text-xs text-faint">
              Exibindo {fmtInt(Math.min(shown, list.length))} de {fmtInt(list.length)} eventos filtrados
              {list.length !== all.length ? ` (${fmtInt(all.length)} no total)` : ''}
            </p>
            <ul className="mt-2 max-h-[520px] space-y-1 overflow-auto pr-1">
              {list.slice(0, shown).map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => {
                      setPlaying(false)
                      setPlayIdx(-1)
                      setSel(sel?.id === e.id ? null : e)
                    }}
                    className={clsx(
                      'flex w-full items-center gap-3 rounded-lg border px-3 py-1.5 text-left text-sm',
                      sel?.id === e.id ? 'border-amber bg-amber/10' : 'border-line bg-ink-2 hover:border-line-2',
                    )}
                  >
                    <span className="font-mono text-white">{fmtNumber(number)}</span>
                    {e.cell ? <RadioTower className="h-3.5 w-3.5 shrink-0 text-gold" aria-label="com ERB" /> : <span className="w-3.5" />}
                    <span className="font-mono text-xs text-muted">{br(e.ts)}</span>
                    <span className="hidden text-xs text-faint sm:inline">{EVENT_TYPE_LABEL[e.type] ?? e.type}</span>
                    {e.other && <span className="hidden font-mono text-xs text-text md:inline">{fmtNumber(e.other)}</span>}
                    {e.address && <span className="ml-auto hidden truncate text-xs text-faint lg:inline">{e.address}</span>}
                  </button>
                </li>
              ))}
            </ul>
            {list.length > shown && (
              <button className="btn-ghost mt-2 !py-1 text-xs" onClick={() => setShown(shown + 1500)}>
                Mostrar mais ({fmtInt(list.length - shown)} restantes)
              </button>
            )}
          </section>
        </>
      ) : (
        <Patterns pat={pat} />
      )}
      {share && <ShareLocation sites={sites} number={number} onClose={() => setShare(false)} />}
    </div>
  )
}

function EventDetail({ e }: { e: LocEvent }) {
  return (
    <dl className="grid grid-cols-[90px_1fr] gap-1 text-xs">
      <dt className="text-muted">Data/hora</dt>
      <dd className="font-mono text-white">{br(e.ts)}</dd>
      <dt className="text-muted">Tipo</dt>
      <dd>{EVENT_TYPE_LABEL[e.type] ?? e.type}</dd>
      {e.other && (
        <>
          <dt className="text-muted">Interlocutor</dt>
          <dd className="font-mono">{fmtNumber(e.other)}</dd>
        </>
      )}
      {e.dur !== null && (
        <>
          <dt className="text-muted">Duração</dt>
          <dd>{e.dur} s</dd>
        </>
      )}
      <dt className="text-muted">ERB</dt>
      <dd className="font-mono break-all">{e.cell ?? 'sem ERB'}</dd>
      <dt className="text-muted">Endereço</dt>
      <dd>{e.address ?? '—'}</dd>
      <dt className="text-muted">Cidade</dt>
      <dd>{e.city ?? '—'}</dd>
      <dt className="text-muted">Coordenadas</dt>
      <dd className="font-mono">{e.lat !== null ? `${e.lat}, ${e.lon}` : '—'}</dd>
      <dt className="text-muted">Azimute</dt>
      <dd>{e.az ?? '—'}°</dd>
      {e.lat !== null && (
        <dd className="col-span-2 pt-1">
          <a className="text-accent hover:underline" href={`https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lon}`} target="_blank" rel="noreferrer noopener">
            Abrir no Google Maps
          </a>
        </dd>
      )}
    </dl>
  )
}

function PlaceCard({ title, icon, tone, c }: { title: string; icon: React.ReactNode; tone: string; c: CellStat | null }) {
  return (
    <section className={clsx('card border-l-4 p-4', tone)}>
      <div className="mb-3 flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5">{icon}</div>
        <h3 className="font-semibold text-white">{title}</h3>
      </div>
      {!c ? (
        <p className="text-sm text-faint">Sem registros com ERB nesse período.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {[
              ['ERB', c.cell],
              ['Endereço', c.address ?? '—'],
              ['Cidade', c.city ?? '—'],
              ['Latitude', c.lat ?? '—'],
              ['Longitude', c.lon ?? '—'],
              ['Azimute', c.az !== null ? `${c.az}°` : '—'],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-[11.5px] font-medium text-faint">{k}</dt>
                <dd className="font-mono text-sm break-words text-white">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted">
            Registros: <span className="font-mono text-text">{fmtInt(c.n)}</span> ({pct(c.pct)}) · de {br(c.first).slice(0, 10)} a {br(c.last).slice(0, 10)}
          </p>
        </>
      )}
    </section>
  )
}

function Patterns({ pat }: { pat: ReturnType<typeof locationPatterns> }) {
  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h2 className="text-lg font-bold text-white">Análise geográfica de ERBs</h2>
        <p className="mt-1 text-sm text-muted">
          Estimativas pela recorrência de ERBs associadas ao alvo. A confiabilidade é menor em extratos com poucos registros e pode ser afetada por outros fatores.{' '}
          <b className="text-text">A validação é do analista</b>; nenhuma análise substitui as diligências.
        </p>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <PlaceCard
          title="Maior incidência à noite (20h–6h) e nos fins de semana — provável residência"
          icon={<Home className="h-5 w-5 text-ok" />}
          tone="border-l-ok"
          c={pat.home}
        />
        <PlaceCard title="Maior incidência em dias úteis, 8h–18h — provável trabalho" icon={<Briefcase className="h-5 w-5 text-amber" />} tone="border-l-amber" c={pat.work} />
      </div>
      <section className="card border-l-4 border-l-accent p-4">
        <h3 className="mb-3 font-semibold text-white">ERBs com maior incidência (alvo)</h3>
        <ol className="divide-y divide-line">
          {pat.top.map((c, i) => (
            <li key={c.cell} className="grid gap-1 py-3 sm:grid-cols-2">
              <div>
                <div className="text-[11.5px] font-medium text-faint">ERB {i + 1}</div>
                <div className="font-mono text-white">{c.cell}</div>
                <div className="text-xs text-muted">
                  Registros: <span className="font-mono text-text">{fmtInt(c.n)}</span> ({pct(c.pct)}) · azimute {c.az ?? '—'}°
                </div>
              </div>
              <div>
                <div className="text-[11.5px] font-medium text-faint">Localização</div>
                <div className="text-sm text-text">{[c.address, c.city].filter(Boolean).join(' · ') || '—'}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <BarsChart title="Volume de eventos por dia" data={pat.days} x="day" xFmt={(d) => fmtDate(d).slice(0, 5)} series={[{ key: 'n', name: 'Eventos' }]} height={240} />
      <BarsChart title="Eventos por hora do dia" data={pat.byHour} x="hour" xFmt={(h) => `${h}h`} series={[{ key: 'n', name: 'Eventos' }]} height={200} />
    </div>
  )
}

function ShareLocation({ sites, number, onClose }: { sites: SitePoint[]; number: string; onClose: () => void }) {
  const { me } = useAuth()
  const [password, setPassword] = useState(randomPassword)
  const [link, setLink] = useState('')
  const gen = async () => {
    if (password.length < 8) return toast.error('Use uma senha com pelo menos 8 caracteres.')
    const frag = await encryptMap(
      {
        v: 1,
        title: 'Mapa de localização (ERBs)',
        by: me?.name ?? '',
        at: new Date().toISOString(),
        exp: new Date(Date.now() + 7 * 86400000).toISOString(),
        period: [
          sites
            .map((s) => s.first)
            .filter(Boolean)
            .sort()[0] ?? null,
          sites
            .map((s) => s.last)
            .filter(Boolean)
            .sort()
            .slice(-1)[0] ?? null,
        ],
        types: 'todos os eventos',
        numbers: [],
        points: sites,
      },
      password,
    )
    setLink(`${location.origin}/mapa-compartilhado#${frag}`)
    void number
  }
  return (
    <Modal open title="Link do mapa com senha" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <Notice tone="teal">O mapa vai criptografado dentro do link (válido por 7 dias). Nada é gravado em servidor. Envie a senha por outro meio.</Notice>
        <label className="block">
          <span className="label">Senha</span>
          <input className="w-full font-mono" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {!link ? (
          <button className="btn-primary" onClick={gen}>
            <Share2 className="h-4 w-4" /> Gerar link
          </button>
        ) : (
          <>
            <textarea readOnly className="w-full font-mono text-[11px]" rows={3} value={link} onFocus={(e) => e.currentTarget.select()} />
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(password).then(() => toast.success('Senha copiada'))}>
                Copiar senha
              </button>
              <button className="btn-primary" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success('Link copiado'))}>
                Copiar link
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
