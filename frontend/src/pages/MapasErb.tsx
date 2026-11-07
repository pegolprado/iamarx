import clsx from 'clsx'
import { Download, Eye, EyeOff, Info, Lock, MapPin, Pencil, Plus, RadioTower, Share2, Trash2 } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { BrandLockup } from '../components/brand'
import { LocationMap, MARK_COLOR_HEX, MARK_STYLE, markHex } from '../components/LocationMap'
import { Modal, Notice } from '../components/ui'
import type { Tower } from '../engine/location'
import { parseCoord, parseInput, type ParsedItem } from '../lib/coords'
import { fmtDateTime, fmtInt } from '../lib/format'
import {
  decryptMap,
  decryptMapOpen,
  encryptShare,
  isOpenLink,
  MARK_COLORS,
  MARK_KINDS,
  type MapMark,
  type MarkColor,
  type MarkKind,
  type SharedMap,
  shareUrl,
  toKml,
  WrongPassword,
} from '../lib/shareMap'

const EMPTY: SharedMap = { v: 1, title: 'Mapas ERB', by: '', at: '', exp: null, period: [null, null], types: '', numbers: [], points: [] }
const DEF_DIST = 1000
const DEF_BEAM = 120

/** Torres da análise compartilhada no formato do mapa de localização. */
function toTowers(m: SharedMap): (Tower & { times?: string[] })[] {
  return m.points.map((p, i) => {
    const cells = (p.cl ?? p.az.map((az, j) => [p.cells[j] ?? `setor ${j + 1}`, az, 0] as [string, number | null, number])).map(([cell, az, n]) => ({
      cell,
      az,
      n,
      lat: p.lat,
      lon: p.lon,
      address: p.name ?? null,
      city: null,
      first: p.first,
      last: p.last,
    }))
    return { key: String(i), lat: p.lat, lon: p.lon, n: p.events, cells: cells as any, address: p.name ?? null, city: null, times: p.times }
  })
}

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** Dias e horários em que a ERB registrou eventos, agrupados por dia. */
export function TimesByDay({ times }: { times: string[] }) {
  const days = new Map<string, string[]>()
  for (const t of times) {
    const d = t.slice(0, 10)
    if (!days.has(d)) days.set(d, [])
    days.get(d)!.push(t.slice(11, 16))
  }
  return (
    <div className="mt-2 border-t border-line pt-2">
      <div className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
        Dias e horários · {times.length} evento{times.length === 1 ? '' : 's'} em {days.size} dia{days.size === 1 ? '' : 's'}
      </div>
      <ul className="max-h-56 space-y-1 overflow-auto pr-1 text-[12px]">
        {[...days].map(([d, hs]) => (
          <li key={d}>
            <span className="font-mono text-white">
              {d.slice(8, 10)}/{d.slice(5, 7)}/{d.slice(2, 4)}
            </span>{' '}
            <span className="text-faint">{WD[new Date(`${d}T12:00:00`).getDay()]}</span> <span className="font-mono text-muted">· {hs.join(', ')}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

type Draft = { mark: MapMark; index: number | null; latText: string; lonText: string }

function newDraft(lat: number | null, lon: number | null, kind: MarkKind, n: number): Draft {
  const mark: MapMark =
    kind === 'erb'
      ? { lat: lat ?? 0, lon: lon ?? 0, label: `ERB ${n}`, kind: 'erb', az: null, dist: DEF_DIST, beam: DEF_BEAM }
      : { lat: lat ?? 0, lon: lon ?? 0, label: kind === 'casa' ? 'Residência do alvo' : `Lugar ${n}`, kind }
  return { mark, index: null, latText: lat === null ? '' : lat.toFixed(6), lonText: lon === null ? '' : lon.toFixed(6) }
}

/** Formulário de lugar/antena (inclusão e edição). */
function MarkForm({ draft, onSave, onDelete, onClose }: { draft: Draft; onSave: (m: MapMark) => void; onDelete?: () => void; onClose: () => void }) {
  const [d, setD] = useState(draft)
  const m = d.mark
  const isErb = m.kind === 'erb'
  const set = (p: Partial<MapMark>) => setD({ ...d, mark: { ...m, ...p } })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const la = parseCoord(d.latText)
    const lo = parseCoord(d.lonText)
    if (!la || !lo || Math.abs(la.v) > 90 || Math.abs(lo.v) > 180) return toast.error('Informe latitude e longitude válidas.')
    if (!m.label.trim()) return toast.error('Informe um nome.')
    const az = isErb && m.az !== null && m.az !== undefined && Number.isFinite(m.az) ? ((m.az % 360) + 360) % 360 : null
    onSave({
      ...m,
      label: m.label.trim().slice(0, 80),
      lat: la.v,
      lon: lo.v,
      ...(isErb ? { az, dist: m.dist || DEF_DIST, beam: m.beam || DEF_BEAM } : { az: undefined, dist: undefined, beam: undefined }),
    })
  }
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
  return (
    <Modal open title={d.index === null ? 'Adicionar ao mapa' : 'Editar'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3 text-sm">
        <div className="flex gap-1 border-b border-line" role="tablist">
          {(
            [
              [false, 'Lugar', <MapPin key="l" className="h-4 w-4" />],
              [true, 'Antena (ERB)', <RadioTower key="a" className="h-4 w-4" />],
            ] as const
          ).map(([erb, label, icon]) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={isErb === erb}
              onClick={() =>
                set({
                  ...(erb
                    ? { kind: 'erb' as const, dist: m.dist || DEF_DIST, beam: m.beam || DEF_BEAM, az: m.az ?? null }
                    : { kind: m.kind === 'erb' ? ('outro' as const) : m.kind }),
                  // nome padrão acompanha o tipo (Lugar n ↔ ERB n)
                  label: m.label.replace(/^(Lugar|ERB) (\d+)$/, (_, _t, n) => `${erb ? 'ERB' : 'Lugar'} ${n}`),
                })
              }
              className={clsx('-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2', isErb === erb ? 'border-accent text-white' : 'border-transparent text-muted')}
            >
              {icon} {label}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="label">Nome *</span>
          <input autoFocus className="w-full" maxLength={80} value={m.label} onChange={(e) => set({ label: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">Latitude *</span>
            <input className="w-full font-mono" placeholder="-23.55052" value={d.latText} onChange={(e) => setD({ ...d, latText: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">Longitude *</span>
            <input className="w-full font-mono" placeholder="-46.63331" value={d.lonText} onChange={(e) => setD({ ...d, lonText: e.target.value })} />
          </label>
        </div>
        {isErb && (
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="label">Azimute (°)</span>
              <input className="w-full font-mono" inputMode="decimal" value={m.az ?? ''} onChange={(e) => set({ az: num(e.target.value) })} />
            </label>
            <label className="block">
              <span className="label">Distância (m)</span>
              <input className="w-full font-mono" inputMode="numeric" value={m.dist ?? ''} onChange={(e) => set({ dist: num(e.target.value) ?? undefined })} />
            </label>
            <label className="block">
              <span className="label">Abertura (°)</span>
              <input className="w-full font-mono" inputMode="numeric" value={m.beam ?? ''} onChange={(e) => set({ beam: num(e.target.value) ?? undefined })} />
            </label>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {!isErb && (
            <label className="block">
              <span className="label">Ícone</span>
              <select className="w-full" value={m.kind} onChange={(e) => set({ kind: e.target.value as MarkKind })}>
                {MARK_KINDS.filter((k) => k !== 'erb').map((k) => (
                  <option key={k} value={k}>
                    {MARK_STYLE[k].glyph} {MARK_STYLE[k].label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={clsx('block', isErb && 'col-span-2')}>
            <span className="label">Cor</span>
            <div className="flex items-center gap-2">
              <span className="h-5 w-5 shrink-0 rounded" style={{ background: markHex(m) }} />
              <select className="w-full" value={m.color ?? MARK_STYLE[m.kind].color} onChange={(e) => set({ color: e.target.value as MarkColor })}>
                {MARK_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {MARK_COLOR_HEX[c].label}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>
        <div className="flex items-center gap-2 pt-1">
          {onDelete && (
            <button type="button" className="btn-danger h-9" onClick={onDelete}>
              <Trash2 className="h-4 w-4" /> Excluir
            </button>
          )}
          <button type="button" className="btn-ghost ml-auto h-9" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary h-9">Salvar</button>
        </div>
      </form>
    </Modal>
  )
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal open title="Mapas ERB — como usar" onClose={onClose} wide>
      <div className="space-y-3 text-[13px] leading-relaxed text-text/90">
        <p>
          Representação cartográfica das informações técnicas fornecidas pelas operadoras (geolocalização da ERB e azimute de cada setor). A partir delas o mapa ilustra uma{' '}
          <b>estimativa</b> de direção e alcance do sinal com base em parâmetros médios — recurso visual de apoio, com caráter ilustrativo.
        </p>
        <p>
          <b>Adicionar:</b> clique com o <b>botão direito</b> no mapa (no celular, <b>toque longo</b>) ou use “Adicionar”. Para vários de uma vez, cole os dados no campo de
          importação e clique em <b>+</b> — copie como a operadora forneceu; datas e outros textos entre os valores são ignorados.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-[8px] border border-line bg-petrol/50 p-3 font-mono text-[12px]">
            <div className="mb-1 font-sans text-[11px] text-muted">Lugar</div>-26.25623 -49.2562
            <div className="mt-2 mb-1 font-sans text-[11px] text-muted">ERB (azimute antes ou depois)</div>250 -26.25623 -49.2562
            <br />
            -26.25623 -49.2562 250
          </div>
          <div className="rounded-[8px] border border-line bg-petrol/50 p-3 font-mono text-[12px]">
            <div className="mb-1 font-sans text-[11px] text-muted">Extrato da Vivo</div>10 -26-52-54,00 -49-08-31,00
            <div className="mt-2 mb-1 font-sans text-[11px] text-muted">Links</div>do próprio MARX e do Mapas/PCSC (?t=e&amp;d=…)
          </div>
        </div>
        <p>
          <b>Coordenadas aceitas:</b> decimal (-38.959390 ou 38.959390N), sexagesimal (43°38'19.39"N), E7 (-389593901) e com traços (-26-51-07,20).
        </p>
        <p>
          <b>Link único por análise:</b> cada inclusão, alteração ou troca de cor/ícone gera um link próprio, derivado do conteúdo. Quem abrir o link verá exatamente a mesma
          análise; qualquer alteração gera um link diferente e um link modificado à mão não abre — preservando a integridade do que foi enviado. Nada é gravado em servidor: os
          dados vão criptografados dentro do link.
        </p>
        <Notice tone="amber">
          Caráter ilustrativo: a distância e a abertura do setor são valores médios de referência e devem ser ajustados às características da antena e à realidade geográfica e
          urbana do local. Cabe ao analista validar a representação e garantir sua fidelidade com o extrato da operadora.
        </Notice>
      </div>
    </Modal>
  )
}

/**
 * Mapas ERB: editor de lugares e antenas com setores, importação de extratos e links únicos.
 * `standalone`: página pública do link (/m) — o endereço é atualizado a cada alteração.
 */
export function ErbMapsEditor({ initial, standalone }: { initial: SharedMap | null; standalone: boolean }) {
  const base = initial ?? EMPTY
  const [title, setTitle] = useState(base.title)
  const [marks, setMarks] = useState<MapMark[]>(base.marks ?? [])
  const [showAnalysis, setShowAnalysis] = useState(true)
  const [sel, setSel] = useState<(Tower & { times?: string[] }) | null>(null)
  const [picking, setPicking] = useState<MarkKind | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [input, setInput] = useState('')
  const [parsed, setParsed] = useState<{ items: ParsedItem[]; failed: string[] } | null>(null)
  const [frag, setFrag] = useState('')
  const [help, setHelp] = useState(false)
  const [filter, setFilter] = useState('')
  const [addMenu, setAddMenu] = useState(false)
  const towers = useMemo(() => (showAnalysis ? toTowers(base) : []), [base, showAnalysis])
  const path = useMemo(
    () => (showAnalysis ? (base.path ?? []).map((x) => ({ a: [x[0], x[1]] as [number, number], b: [x[2], x[3]] as [number, number], n: x[4] })) : []),
    [base, showAnalysis],
  )
  const radius = base.radius ?? DEF_DIST
  const beam = base.beam ?? DEF_BEAM

  // link único: recalculado a cada alteração (mesmo conteúdo → mesmo link)
  const current = useMemo<SharedMap>(() => ({ ...base, title: title.trim() || 'Mapas ERB', marks }), [base, title, marks])
  useEffect(() => {
    let alive = true
    const t = setTimeout(async () => {
      const f = await encryptShare(current)
      if (!alive) return
      setFrag(f)
      if (standalone) history.replaceState(null, '', `/m#${f}`)
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [current, standalone])
  const link = frag ? shareUrl(frag) : ''

  const onMapClick = useCallback(
    (lat: number, lon: number) => {
      if (!picking) return
      setDraft(newDraft(lat, lon, picking, marks.length + 1))
      setPicking(null)
    },
    [picking, marks.length],
  )
  const onContext = useCallback((lat: number, lon: number) => setDraft(newDraft(lat, lon, 'outro', marks.length + 1)), [marks.length])
  const onMark = useCallback((i: number) => setDraft({ ...newDraft(marks[i].lat, marks[i].lon, marks[i].kind, i + 1), mark: { ...marks[i] }, index: i }), [marks])

  const save = (m: MapMark) => {
    if (!draft) return
    if (draft.index === null) setMarks([...marks, m])
    else setMarks(marks.map((x, i) => (i === draft.index ? m : x)))
    setDraft(null)
  }
  const doImport = async () => {
    const txt = input.trim()
    if (!txt) return
    // link do próprio MARX: traz tudo
    const own = txt.match(/#(m[23]\.[\w.-]+)/)
    if (own) {
      try {
        const m = await decryptMapOpen(own[1])
        const fromPoints: MapMark[] = m.points.flatMap((p) =>
          (p.cl?.length ? p.cl : ([[p.name ?? 'ERB', p.az[0] ?? null, p.events]] as [string, number | null, number][])).map(([c, az]) => ({
            lat: p.lat,
            lon: p.lon,
            label: String(c),
            kind: 'erb' as const,
            az,
            dist: m.radius ?? DEF_DIST,
            beam: m.beam ?? DEF_BEAM,
          })),
        )
        setMarks([...marks, ...(m.marks ?? []), ...fromPoints])
        setInput('')
        toast.success('Link importado.')
      } catch (e: any) {
        toast.error(e?.message ?? 'Link inválido.')
      }
      return
    }
    const r = parseInput(txt)
    if (!r.items.length) return toast.error('Formato não reconhecido. Veja os formatos aceitos em ⓘ.')
    setParsed(r)
  }
  const insertParsed = () => {
    if (!parsed) return
    let n = marks.length
    const add: MapMark[] = parsed.items.map((p) => {
      n++
      return p.az !== null
        ? { lat: p.lat, lon: p.lon, label: p.name || `ERB ${n}`, kind: 'erb', az: p.az, dist: p.dist ?? DEF_DIST, beam: p.beam ?? DEF_BEAM }
        : { lat: p.lat, lon: p.lon, label: p.name || `Lugar ${n}`, kind: 'outro' }
    })
    setMarks([...marks, ...add])
    setParsed(null)
    setInput('')
    toast.success(`${add.length} item(ns) inserido(s) no mapa.`)
  }
  const kml = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([toKml({ ...current, points: showAnalysis ? current.points : [] }, radius)], { type: 'application/vnd.google-earth.kml+xml' }))
    a.download = `${(title || 'Mapas_ERB').replace(/[^\w.-]+/g, '_').slice(0, 60)}.kml`
    a.click()
  }
  const copy = () => link && navigator.clipboard.writeText(link).then(() => toast.success('Link copiado'))
  const list = marks.map((m, i) => ({ m, i })).filter(({ m }) => !filter || m.label.toLowerCase().includes(filter.toLowerCase()))
  const totalEvents = base.points.reduce((n, p) => n + p.events, 0)
  const addBtn = useRef<HTMLDivElement>(null)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <input
            className="w-full max-w-xl !border-transparent !bg-transparent !px-0 text-[18px] font-semibold text-white hover:!border-line focus:!border-accent/60 focus:!px-2 sm:text-[20px]"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Título da análise"
          />
          <p className="text-[12.5px] text-muted">
            {base.points.length > 0 && (
              <>
                {fmtInt(base.points.length)} ERBs da análise · {fmtInt(totalEvents)} eventos
                {base.period[0] ? ` · ${fmtDateTime(base.period[0])} → ${fmtDateTime(base.period[1])}` : ''} ·{' '}
              </>
            )}
            {fmtInt(marks.length)} ponto(s) marcados
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative" ref={addBtn}>
            <button className="btn-primary h-8" onClick={() => setAddMenu(!addMenu)}>
              <Plus className="h-4 w-4" /> Adicionar
            </button>
            {addMenu && (
              <div className="absolute top-9 left-0 z-[700] w-56 rounded-[8px] border border-line-2 bg-glass p-1 text-[13px] shadow-lg">
                {(
                  [
                    ['Lugar (digitar)', () => setDraft(newDraft(null, null, 'outro', marks.length + 1))],
                    ['Antena / ERB (digitar)', () => setDraft(newDraft(null, null, 'erb', marks.length + 1))],
                    ['Lugar — tocar no mapa', () => setPicking('outro')],
                    ['Antena — tocar no mapa', () => setPicking('erb')],
                  ] as const
                ).map(([l, fn]) => (
                  <button
                    key={l}
                    className="block w-full rounded px-3 py-2 text-left hover:bg-accent/10"
                    onClick={() => {
                      setAddMenu(false)
                      setSel(null)
                      fn()
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn-ghost h-8" onClick={copy} disabled={!link}>
            <Share2 className="h-4 w-4" /> Copiar link
          </button>
          {link && (
            <a className="btn-ghost h-8" href={`https://wa.me/?text=${encodeURIComponent(link)}`} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          )}
          <button className="btn-ghost h-8" onClick={kml}>
            <Download className="h-4 w-4" /> KML
          </button>
          <button className="btn-ghost h-8 !px-2" onClick={() => setHelp(true)} aria-label="Como usar">
            <Info className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <textarea
          className="min-h-[38px] flex-1 resize-y font-mono text-[12px]"
          rows={1}
          placeholder="Importar… cole aqui coordenadas, linhas do extrato (ex.: 250 -26.25623 -49.2562) ou um link"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn-primary h-[38px] !px-3" onClick={doImport} aria-label="Converter e importar">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {picking && (
        <p className="flex items-center gap-2 text-[12.5px] text-accent">
          Toque no ponto do mapa para adicionar {picking === 'erb' ? 'a antena' : 'o lugar'}.
          <button className="text-muted underline" onClick={() => setPicking(null)}>
            cancelar
          </button>
        </p>
      )}

      <div className="[&>div]:!h-[calc(100dvh-260px)] [&>div]:!min-h-[380px]">
        <LocationMap
          towers={towers}
          transitions={path}
          current={null}
          showSectors
          showPath
          radius={radius}
          beam={beam}
          onTower={(t) => setSel(t as any)}
          erbLayer={false}
          marks={marks}
          picking={!!picking}
          onMapClick={onMapClick}
          onContext={onContext}
          onMark={onMark}
          onCloseDetail={() => setSel(null)}
          detail={
            sel ? (
              <div className="space-y-1.5">
                <div className="font-semibold text-white">{sel.address ?? 'ERB'}</div>
                <div className="font-mono text-[11px] text-muted">
                  {sel.lat.toFixed(5)}, {sel.lon.toFixed(5)}
                </div>
                <div className="text-xs">{fmtInt(sel.n)} eventos</div>
                <table className="text-xs">
                  <tbody>
                    {sel.cells.map((x) => (
                      <tr key={x.cell}>
                        <td className="font-mono">{x.cell}</td>
                        <td>{x.az ?? '—'}°</td>
                        <td className="text-right">{x.n ? fmtInt(x.n) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sel.times?.length ? <TimesByDay times={sel.times} /> : null}
                <p className="text-[11px] text-faint">A coordenada é da antena, não do aparelho.</p>
              </div>
            ) : null
          }
        />
      </div>
      <p className="text-[11.5px] text-faint">Botão direito no mapa (ou toque longo no celular) adiciona um ponto no local. Clique num ponto marcado para editar.</p>

      <section className="card overflow-hidden">
        <div className="panel-head">
          Pontos
          <input className="ml-auto h-7 w-40 !py-0 text-[12px] normal-case" placeholder="filtrar…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th className="w-10" />
                <th>Nome</th>
                <th>Lat/Lng</th>
                <th className="text-right">Azimute</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {base.points.length > 0 && (
                <tr>
                  <td>
                    <button onClick={() => setShowAnalysis(!showAnalysis)} aria-label="Mostrar ou ocultar ERBs da análise" className="text-muted hover:text-text">
                      {showAnalysis ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  </td>
                  <td className="text-text" colSpan={4}>
                    ERBs da análise compartilhada ({fmtInt(base.points.length)}) — toque numa torre para ver dias e horários
                  </td>
                </tr>
              )}
              {list.map(({ m, i }) => (
                <tr key={i} className={m.hidden ? 'opacity-50' : ''}>
                  <td>
                    <button
                      onClick={() => setMarks(marks.map((x, j) => (j === i ? { ...x, hidden: !x.hidden } : x)))}
                      aria-label={m.hidden ? 'Mostrar' : 'Ocultar'}
                      className="text-muted hover:text-text"
                    >
                      {m.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </td>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] text-white" style={{ background: markHex(m) }}>
                        {m.kind === 'erb' ? <RadioTower className="h-3 w-3" /> : MARK_STYLE[m.kind].glyph}
                      </span>
                      <span className="text-white">{m.label}</span>
                    </span>
                  </td>
                  <td className="font-mono text-[12px]">
                    {m.lat.toFixed(5)}, {m.lon.toFixed(5)}
                  </td>
                  <td className="text-right font-mono text-[12px]">{m.kind === 'erb' && m.az !== null && m.az !== undefined ? `${m.az}°` : '—'}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn-ghost h-7 !px-2" onClick={() => onMark(i)} aria-label={`Editar ${m.label}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>{' '}
                    <button className="btn-danger h-7 !px-2" onClick={() => setMarks(marks.filter((_, j) => j !== i))} aria-label={`Excluir ${m.label}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {!marks.length && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted">
                    Nenhum ponto marcado. Use “Adicionar”, o botão direito no mapa ou cole dados no campo de importação.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {link && (
        <section className="card space-y-2 p-3 text-sm">
          <div className="flex items-center gap-2 font-semibold text-white">
            <Share2 className="h-4 w-4 text-accent" /> Link desta análise
            <span className="ml-auto font-mono text-[11px] font-normal text-faint">{fmtInt(link.length)} caracteres</span>
          </div>
          <textarea readOnly className="w-full font-mono text-[11px]" rows={2} value={link} onFocus={(e) => e.currentTarget.select()} />
          <p className="text-[12px] text-faint">
            O link muda a cada alteração e abre exatamente esta análise — sem login e sem senha. Nada fica gravado em servidor: envie só para a equipe da investigação.
          </p>
        </section>
      )}

      {parsed && (
        <Modal open title={`Importar — ${parsed.items.length} item(ns) reconhecido(s)`} onClose={() => setParsed(null)} wide>
          <div className="space-y-3 text-sm">
            <div className="max-h-80 overflow-auto rounded-[8px] border border-line">
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Nome</th>
                    <th>Latitude</th>
                    <th>Longitude</th>
                    <th className="text-right">Azimute</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.items.map((p, i) => (
                    <tr key={i}>
                      <td>{p.az !== null ? 'ERB' : 'Lugar'}</td>
                      <td>{p.name ?? '—'}</td>
                      <td className="font-mono">{p.lat.toFixed(6)}</td>
                      <td className="font-mono">{p.lon.toFixed(6)}</td>
                      <td className="text-right font-mono">{p.az ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.failed.length > 0 && (
              <Notice tone="amber" title={`${parsed.failed.length} linha(s) não reconhecida(s)`}>
                <span className="font-mono text-[11.5px]">{parsed.failed.slice(0, 5).join(' · ')}</span>
              </Notice>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setParsed(null)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={insertParsed}>
                Inserir no mapa
              </button>
            </div>
          </div>
        </Modal>
      )}
      {draft && (
        <MarkForm
          key={`${draft.index}-${draft.mark.lat}-${draft.mark.lon}`}
          draft={draft}
          onSave={save}
          onClose={() => setDraft(null)}
          onDelete={
            draft.index !== null
              ? () => {
                  setMarks(marks.filter((_, j) => j !== draft.index))
                  setDraft(null)
                }
              : undefined
          }
        />
      )}
      {help && <HelpModal onClose={() => setHelp(false)} />}
    </div>
  )
}

/**
 * Página pública do link (/m e /mapa-compartilhado): abre a análise criptografada no próprio
 * endereço (#…) — direto (m2/m3) ou com senha (m1, links antigos). Sem dados: Mapas ERB em branco.
 */
export default function MapasErbPage() {
  const frag = location.hash.slice(1)
  const open_ = !frag || isOpenLink(frag)
  const [map, setMap] = useState<SharedMap | null>(frag ? null : EMPTY)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(!!frag && open_)
  const [password, setPassword] = useState('')
  const accept = (m: SharedMap) => {
    if (m.exp && Date.parse(m.exp) < Date.now()) {
      setErr(`Este link expirou em ${fmtDateTime(m.exp.slice(0, 19).replace('T', ' '))}. Peça um novo a quem compartilhou.`)
      return
    }
    setMap(m)
  }
  useEffect(() => {
    if (!frag || !open_) return
    decryptMapOpen(frag)
      .then(accept)
      .catch((x) => setErr(x?.message ?? 'Não foi possível abrir o mapa.'))
      .finally(() => setBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const openPw = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      accept(await decryptMap(frag, password))
    } catch (x: any) {
      setErr(x instanceof WrongPassword ? 'Senha incorreta.' : (x?.message ?? 'Não foi possível abrir o mapa.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="min-h-[100dvh] px-3 py-3 sm:px-6 sm:py-4">
      <header className="mx-auto mb-3 flex max-w-[1600px] items-center gap-3 border-b border-line pb-3">
        <BrandLockup compact />
        <span className="ml-1 border-l border-line pl-3 text-[13px] text-muted">Mapas ERB</span>
      </header>
      <main className="mx-auto max-w-[1600px]">
        {map ? (
          <ErbMapsEditor initial={map} standalone />
        ) : err && open_ ? (
          <Notice tone="amber">{err}</Notice>
        ) : open_ || busy ? (
          <p className="py-10 text-center text-sm text-muted">Abrindo o mapa…</p>
        ) : (
          <form onSubmit={openPw} className="card mx-auto mt-6 max-w-md space-y-4 p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Lock className="h-4 w-4 text-teal" /> Mapa protegido por senha
            </div>
            <p className="text-sm text-muted">Digite a senha recebida de quem compartilhou. O mapa é aberto apenas neste navegador; nada é enviado ou gravado.</p>
            <input
              type="password"
              autoFocus
              className="w-full font-mono"
              placeholder="XXXX-XXXX-XXXX"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
            {err && (
              <p role="alert" className="text-sm text-danger">
                {err}
              </p>
            )}
            <button className="btn-primary w-full" disabled={busy || !password}>
              {busy ? 'Abrindo…' : 'Abrir mapa'}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
