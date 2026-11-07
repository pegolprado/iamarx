import { Download, Lock, MapPinned } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { BrandLockup } from '../components/brand'
import { LocationMap } from '../components/LocationMap'
import { Notice } from '../components/ui'
import type { Tower } from '../engine/location'
import { fmtDateTime, fmtInt, fmtNumberPlain } from '../lib/format'
import { decryptMap, decryptMapOpen, isOpenLink, type SharedMap, toKml, WrongPassword } from '../lib/shareMap'

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
    return { key: String(i), lat: p.lat, lon: p.lon, n: p.events, cells: cells as any, address: p.name ?? null, city: null }
  })
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
  const [sel, setSel] = useState<Tower | null>(null)
  const accept = (m: SharedMap) => {
    if (m.exp && Date.parse(m.exp) < Date.now()) {
      setErr(`Este link expirou em ${fmtDateTime(m.exp.slice(0, 19).replace('T', ' '))}. Peça um novo a quem compartilhou.`)
      return
    }
    setMap(m)
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
                <p className="text-[11.5px] text-faint">
                  Por {map.by || '—'} em {fmtDateTime(map.at.slice(0, 19).replace('T', ' '))}
                  {map.exp ? ` · válido até ${fmtDateTime(map.exp.slice(0, 19).replace('T', ' '))}` : ''}
                </p>
              </div>
              <button className="btn-ghost h-8" onClick={kml}>
                <Download className="h-4 w-4" /> KML
              </button>
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
                onTower={setSel}
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
                      <p className="text-[11px] text-faint">A coordenada é da antena, não do aparelho.</p>
                    </div>
                  ) : null
                }
              />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
