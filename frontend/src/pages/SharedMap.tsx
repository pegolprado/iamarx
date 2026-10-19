import { Download, Lock, MapPinned } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { ErbMap } from '../components/ErbMap'
import { Notice } from '../components/ui'
import { fmtDateTime, fmtInt, fmtNumberPlain } from '../lib/format'
import { decryptMap, type SharedMap, type SitePoint, toKml, WrongPassword } from '../lib/shareMap'

/**
 * Abertura de um mapa compartilhado. Página pública: os dados estão criptografados no próprio
 * link (#…) e só são abertos, no navegador de quem recebeu, com a senha. Nada é enviado ao servidor.
 */
export default function SharedMapPage() {
  const frag = location.hash.slice(1)
  const [password, setPassword] = useState('')
  const [map, setMap] = useState<SharedMap | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState<SitePoint | null>(null)
  const open = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      const m = await decryptMap(frag, password)
      if (m.exp && Date.parse(m.exp) < Date.now()) {
        setErr(`Este link expirou em ${fmtDateTime(m.exp.slice(0, 19).replace('T', ' '))}. Peça um novo a quem compartilhou.`)
        return
      }
      setMap(m)
    } catch (x: any) {
      setErr(x instanceof WrongPassword ? 'Senha incorreta.' : (x?.message ?? 'Não foi possível abrir o mapa.'))
    } finally {
      setBusy(false)
    }
  }
  const kml = () => {
    if (!map) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([toKml(map)], { type: 'application/vnd.google-earth.kml+xml' }))
    a.download = `${map.title.replace(/[^\w.-]+/g, '_').slice(0, 60)}.kml`
    a.click()
  }
  return (
    <div className="min-h-screen px-4 py-6 sm:px-8">
      <header className="mx-auto mb-6 flex max-w-7xl items-center gap-3">
        <img src="/icon-192.png" alt="" className="h-10 w-10 rounded-xl" />
        <div>
          <div className="text-lg leading-tight font-bold text-white">
            MAR<span className="text-gold">X</span> <span className="text-sm font-normal text-muted">· mapa compartilhado</span>
          </div>
          <div className="font-mono text-[10px] tracking-[0.25em] text-gold">ANÁLISE • CONEXÕES • INTELIGÊNCIA</div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl">
        {!frag ? (
          <Notice tone="amber">Link sem os dados do mapa. Confira se o link foi copiado inteiro.</Notice>
        ) : !map ? (
          <form onSubmit={open} className="card mx-auto max-w-md space-y-4 p-6">
            <div className="flex items-center gap-2 font-mono text-sm font-bold text-white">
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
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
                  <MapPinned className="h-6 w-6 text-accent" /> {map.title}
                </h1>
                <p className="mt-1 text-sm text-muted">
                  {fmtInt(map.points.length)} estações · {map.types} · período {fmtDateTime(map.period[0])} → {fmtDateTime(map.period[1])}
                  {map.numbers.length ? ` · números: ${map.numbers.map(fmtNumberPlain).join(', ')}` : ''}
                </p>
                <p className="text-xs text-faint">
                  Compartilhado por {map.by || '—'} em {fmtDateTime(map.at.slice(0, 19).replace('T', ' '))}
                  {map.exp ? ` · válido até ${fmtDateTime(map.exp.slice(0, 19).replace('T', ' '))}` : ''}
                </p>
              </div>
              <button className="btn-ghost" onClick={kml}>
                <Download className="h-4 w-4" /> KML (Google Earth)
              </button>
            </div>
            <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
              <ErbMap points={map.points} onSelect={setSel} height="h-[70vh]" />
              <aside className="card p-4 text-sm">
                {sel ? (
                  <dl className="grid grid-cols-2 gap-1 text-xs">
                    <dt className="text-muted">Coordenadas</dt>
                    <dd className="font-mono">
                      {sel.lat.toFixed(5)}, {sel.lon.toFixed(5)}
                    </dd>
                    <dt className="text-muted">Azimute(s)</dt>
                    <dd>{sel.az.map((a) => `${a}°`).join(', ') || '—'}</dd>
                    <dt className="text-muted">Eventos</dt>
                    <dd>
                      {fmtInt(sel.events)} (voz {fmtInt(sel.voice)}, SMS {fmtInt(sel.sms)}, dados {fmtInt(sel.data)})
                    </dd>
                    <dt className="text-muted">Primeiro</dt>
                    <dd>{fmtDateTime(sel.first)}</dd>
                    <dt className="text-muted">Último</dt>
                    <dd>{fmtDateTime(sel.last)}</dd>
                    <dt className="text-muted">Células</dt>
                    <dd className="font-mono text-[11px] break-all">{sel.cells.join(', ')}</dd>
                  </dl>
                ) : (
                  <p className="text-muted">Toque numa estação para ver os detalhes.</p>
                )}
                <div className="mt-4">
                  <Notice tone="amber">A coordenada é da estação (antena), não do aparelho. Azimutes e setores são representações esquemáticas.</Notice>
                </div>
              </aside>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
