import { Download, Lock, MapPin, MapPinned, Share2, Trash2, X } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BrandLockup } from '../components/brand'
import { LocationMap, MARK_STYLE } from '../components/LocationMap'
import { Notice } from '../components/ui'
import type { Tower } from '../engine/location'
import { fmtDateTime, fmtInt, fmtNumberPlain } from '../lib/format'
import { decryptMap, decryptMapOpen, encryptShare, isOpenLink, type MapMark, type SharedMap, shareUrl, toKml, WrongPassword } from '../lib/shareMap'

/** Torres do mapa compartilhado no formato do mapa de localização. */
function toTowers(m: SharedMap): Tower[] {
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
    return { key: String(i), lat: p.lat, lon: p.lon, n: p.events, cells: cells as any, address: p.name ?? null, city: null, times: p.times } as Tower & { times?: string[] }
  })
}

const MARK_LABEL: Record<MapMark['kind'], string> = { casa: 'Residência do alvo', trabalho: 'Trabalho do alvo', outro: 'Ponto de interesse' }

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** Dias e horários em que a ERB registrou eventos, agrupados por dia. */
function TimesByDay({ times }: { times: string[] }) {
  const days = new Map<string, string[]>()
  for (const t of times) {
    const d = t.slice(0, 10)
    if (!days.has(d)) days.set(d, [])
    days.get(d)!.push(t.slice(11, 16))
  }
  return (
    <div className="mt-2 border-t border-line pt-2">
      <div className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">Dias e horários ({times.length})</div>
      <ul className="max-h-56 space-y-1 overflow-auto pr-1 text-[12px]">
        {[...days].map(([d, hs]) => (
          <li key={d}>
            <span className="font-mono text-white">
              {d.slice(8, 10)}/{d.slice(5, 7)}
            </span>{' '}
            <span className="text-faint">{WD[new Date(`${d}T12:00:00`).getDay()]}</span> <span className="font-mono text-muted">· {hs.join(', ')}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Abertura de um mapa compartilhado. Página pública: os dados estão criptografados no próprio
 * link (#…) e são abertos no navegador de quem recebeu — direto (link "m2") ou com a senha
 * (link "m1"). Nada é enviado ao servidor.
 */
export default function SharedMapPage() {
  const frag = location.hash.slice(1)
  const open_ = isOpenLink(frag)
  const [password, setPassword] = useState('')
  const [map, setMap] = useState<SharedMap | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(open_)
  const [sel, setSel] = useState<(Tower & { times?: string[] }) | null>(null)
  const [marks, setMarks] = useState<MapMark[]>([])
  const [picking, setPicking] = useState(false)
  const [draft, setDraft] = useState<MapMark | null>(null)
  const [newLink, setNewLink] = useState('')
  const accept = (m: SharedMap) => {
    if (m.exp && Date.parse(m.exp) < Date.now()) {
      setErr(`Este link expirou em ${fmtDateTime(m.exp.slice(0, 19).replace('T', ' '))}. Peça um novo a quem compartilhou.`)
      return
    }
    setMap(m)
    setMarks(m.marks ?? [])
  }
  useEffect(() => {
    if (!open_) return
    decryptMapOpen(frag)
      .then(accept)
      .catch((x) => setErr(x?.message ?? 'Não foi possível abrir o mapa.'))
      .finally(() => setBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const open = async (e: FormEvent) => {
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
  const towers = useMemo(() => (map ? toTowers(map) : []), [map])
  const onMapClick = useCallback(
    (lat: number, lon: number) => {
      if (!picking) return
      setPicking(false)
      setDraft({ lat, lon, label: 'Residência do alvo', kind: 'casa' })
    },
    [picking],
  )
  const regenerate = async () => {
    if (!map) return
    const frag = await encryptShare({ ...map, marks })
    setNewLink(shareUrl(frag))
  }
  const path = useMemo(() => (map?.path ?? []).map((x) => ({ a: [x[0], x[1]] as [number, number], b: [x[2], x[3]] as [number, number], n: x[4] })), [map])
  const kml = () => {
    if (!map) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([toKml(map, map.radius ?? 400)], { type: 'application/vnd.google-earth.kml+xml' }))
    a.download = `${map.title.replace(/[^\w.-]+/g, '_').slice(0, 60)}.kml`
    a.click()
  }
  return (
    <div className="min-h-[100dvh] px-3 py-3 sm:px-6 sm:py-5">
      <header className="mx-auto mb-3 flex max-w-[1600px] items-center gap-3 border-b border-line pb-3 sm:mb-4">
        <BrandLockup compact />
        <span className="ml-1 border-l border-line pl-3 text-[13px] text-muted">Mapa compartilhado</span>
      </header>
      <main className="mx-auto max-w-[1600px]">
        {!frag ? (
          <Notice tone="amber">Link sem os dados do mapa. Confira se o link foi copiado inteiro.</Notice>
        ) : !map && open_ ? (
          err ? (
            <Notice tone="amber">{err}</Notice>
          ) : (
            <p className="py-10 text-center text-sm text-muted">Abrindo o mapa…</p>
          )
        ) : !map ? (
          <form onSubmit={open} className="card mx-auto mt-6 max-w-md space-y-4 p-6">
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
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="flex items-center gap-2 text-[17px] font-semibold text-white sm:text-[19px]">
                  <MapPinned className="h-5 w-5 shrink-0 text-accent" /> {map.title}
                </h1>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  {fmtInt(map.points.length)} ERBs · {fmtInt(map.points.reduce((n, p) => n + p.events, 0))} eventos · {fmtDateTime(map.period[0])} → {fmtDateTime(map.period[1])}
                  {map.numbers.length ? ` · ${map.numbers.map(fmtNumberPlain).join(', ')}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={`btn-ghost h-8 ${picking ? '!border-accent !text-accent' : ''}`} onClick={() => (setSel(null), setPicking(!picking))}>
                  <MapPin className="h-4 w-4" /> {picking ? 'Toque no mapa…' : 'Marcar ponto'}
                </button>
                <button className="btn-ghost h-8" onClick={kml}>
                  <Download className="h-4 w-4" /> KML
                </button>
              </div>
            </div>
            <div className="[&>div]:!h-[calc(100dvh-170px)] [&>div]:!min-h-[360px]">
              <LocationMap
                towers={towers}
                transitions={path}
                current={null}
                showSectors
                showPath
                radius={map.radius ?? 1000}
                beam={map.beam ?? 120}
                onTower={(t) => setSel(t as any)}
                erbLayer={false}
                marks={marks}
                picking={picking}
                onMapClick={onMapClick}
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
            {picking && <p className="text-[12.5px] text-accent">Toque no ponto do mapa que deseja marcar.</p>}
            {(marks.length > 0 || newLink) && (
              <section className="card space-y-2 p-3 text-sm">
                <div className="font-semibold text-white">Pontos marcados</div>
                <ul className="space-y-1">
                  {marks.map((k, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: MARK_STYLE[k.kind].color }} />
                      <span className="text-muted">{MARK_STYLE[k.kind].label}:</span> <span className="text-white">{k.label}</span>
                      <span className="font-mono text-[11px] text-faint">
                        {k.lat.toFixed(5)}, {k.lon.toFixed(5)}
                      </span>
                      <button
                        className="ml-auto text-faint hover:text-danger"
                        onClick={() => (setMarks(marks.filter((_, j) => j !== i)), setNewLink(''))}
                        aria-label="Remover ponto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="text-[12px] text-faint">Os pontos ficam só neste aparelho. Para enviar, gere o link atualizado.</p>
                {!newLink ? (
                  <button className="btn-primary h-8" onClick={regenerate}>
                    <Share2 className="h-4 w-4" /> Gerar link atualizado
                  </button>
                ) : (
                  <div className="space-y-2">
                    <textarea readOnly className="w-full font-mono text-[11px]" rows={2} value={newLink} onFocus={(e) => e.currentTarget.select()} />
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-primary h-8" onClick={() => navigator.clipboard.writeText(newLink).then(() => toast.success('Link copiado'))}>
                        Copiar link
                      </button>
                      <a className="btn-ghost h-8" href={`https://wa.me/?text=${encodeURIComponent(newLink)}`} target="_blank" rel="noopener noreferrer">
                        Enviar pelo WhatsApp
                      </a>
                    </div>
                  </div>
                )}
              </section>
            )}
            {draft && (
              <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 p-4" onClick={() => setDraft(null)}>
                <form
                  className="card w-full max-w-sm space-y-3 p-4"
                  onClick={(e) => e.stopPropagation()}
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!draft.label.trim()) return
                    setMarks([...marks, { ...draft, label: draft.label.trim().slice(0, 80) }])
                    setDraft(null)
                    setNewLink('')
                  }}
                >
                  <div className="flex items-center justify-between font-semibold text-white">
                    Marcar ponto
                    <button type="button" onClick={() => setDraft(null)} aria-label="Fechar" className="text-muted">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    {(['casa', 'trabalho', 'outro'] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setDraft({ ...draft, kind: k, label: draft.label === MARK_LABEL[draft.kind] || !draft.label ? MARK_LABEL[k] : draft.label })}
                        className={`flex-1 rounded-[7px] border px-2 py-1.5 text-[12.5px] ${draft.kind === k ? 'border-accent/60 bg-accent/10 text-white' : 'border-line text-muted'}`}
                      >
                        {MARK_STYLE[k].label}
                      </button>
                    ))}
                  </div>
                  <label className="block">
                    <span className="label">Descrição</span>
                    <input autoFocus className="w-full" maxLength={80} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
                  </label>
                  <div className="font-mono text-[11px] text-faint">
                    {draft.lat.toFixed(5)}, {draft.lon.toFixed(5)}
                  </div>
                  <button className="btn-primary w-full">Adicionar ao mapa</button>
                </form>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
