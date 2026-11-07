import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Crosshair, Download, Eye, EyeOff, FileSpreadsheet, Info, Lock, Pencil, Plus, Share2, Trash2, Upload } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { LocationMap, markHex } from '../components/LocationMap'
import { exportSheet } from '../lib/erbSheet'
import { fmtDateTime, fmtInt } from '../lib/format'
import { decryptMap, decryptMapOpen, isErbHost, isOpenLink, type SharedMap, WrongPassword } from '../lib/shareMap'
import { EMPTY, ErbDocModals, MarkGlyph, newDraft, TimesByDay, useErbDoc } from './MapasErb'

const PAGE = 8
const HOME = 'https://iamarx.com.br'

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-gray-200 px-4 py-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[11.5px] font-semibold tracking-[0.06em] text-gray-500 uppercase">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

/**
 * MARX Mapas ERB — site público (erb.iamarx.com.br): o mapa ocupa a tela; a seta azul abre o
 * painel com entrada de dados, pontos, exportação e o link curto da análise.
 */
export function ErbApp({ initial }: { initial: SharedMap | null }) {
  const urlPath = isErbHost() ? '/' : location.pathname === '/erb' ? '/erb' : '/m'
  const d = useErbDoc(initial ?? { ...EMPTY, title: 'MARX Mapas ERB' }, urlPath)
  const {
    base,
    sheetInput,
    title,
    setTitle,
    marks,
    setMarks,
    showAnalysis,
    setShowAnalysis,
    sel,
    setSel,
    picking,
    setPicking,
    setDraft,
    input,
    setInput,
    filter,
    setFilter,
    radius,
    beam,
    towers,
    path,
    withTimes,
    setWithTimes,
    hasTimes,
    current,
    link,
    onMapClick,
    onContext,
    onMark,
    doImport,
    kml,
    copy,
    list,
    totalEvents,
    setHelp,
    importSheetFile,
  } = d
  const [open, setOpen] = useState(() => !initial || (!initial.marks?.length && !initial.points.length))
  const [addMenu, setAddMenu] = useState(false)
  const [page, setPage] = useState(0)
  const [focus, setFocus] = useState<{ lat: number; lon: number; key: number } | null>(null)
  const pages = Math.max(1, Math.ceil(list.length / PAGE))
  const shown = useMemo(() => list.slice(page * PAGE, page * PAGE + PAGE), [list, page])
  useEffect(() => {
    if (page >= pages) setPage(pages - 1)
  }, [page, pages])

  // site público: tema claro, título próprio
  useEffect(() => {
    const prev = document.documentElement.dataset.theme
    const prevTitle = document.title
    document.documentElement.dataset.theme = 'light'
    document.title = 'MARX Mapas ERB'
    return () => {
      document.documentElement.dataset.theme = prev ?? 'dark'
      document.title = prevTitle
    }
  }, [])

  const startPick = (k: 'outro' | 'erb') => {
    setAddMenu(false)
    setSel(null)
    setPicking(k)
    if (window.innerWidth < 768) setOpen(false)
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-[var(--map-bg)] text-gray-900">
      <LocationMap
        layout="app"
        towers={towers}
        transitions={path}
        current={null}
        showSectors
        showPath
        radius={radius}
        beam={beam}
        onTower={(t) => setSel(t as any)}
        erbLayer
        marks={marks}
        picking={!!picking}
        onMapClick={onMapClick}
        onContext={onContext}
        onMark={onMark}
        focus={focus}
        onCloseDetail={() => setSel(null)}
        detail={
          sel ? (
            <div className="space-y-1.5">
              <div className="font-semibold">{sel.address ?? 'ERB'}</div>
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
            </div>
          ) : null
        }
      />

      {picking && (
        <div className="absolute top-3 left-1/2 z-[700] flex -translate-x-1/2 items-center gap-3 rounded-full bg-gray-900/90 px-4 py-2 text-[13px] text-[#fff] shadow-lg">
          <Crosshair className="h-4 w-4 text-sky-300" /> Toque no mapa para adicionar {picking === 'erb' ? 'a antena' : 'o lugar'}
          <button className="text-sky-300 underline" onClick={() => setPicking(null)}>
            cancelar
          </button>
        </div>
      )}

      {/* seta azul: abre o painel */}
      {!open && (
        <button
          className="absolute top-[84px] right-0 z-[700] grid h-12 w-9 place-items-center rounded-l-[10px] bg-blue-600 text-[#fff] shadow-lg transition-colors hover:bg-blue-700"
          onClick={() => setOpen(true)}
          aria-label="Abrir painel"
          title="Abrir painel"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      {/* símbolo MARX → site */}
      <a
        href={HOME}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute right-3 bottom-7 z-[600] rounded-full shadow-lg ring-2 ring-white transition-transform hover:scale-105"
        title="MARX Intelligence Pro — iamarx.com.br"
        aria-label="MARX Intelligence Pro — iamarx.com.br"
      >
        <img src="/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 rounded-full" />
      </a>

      {/* painel */}
      <aside
        className={clsx(
          'absolute top-0 right-0 bottom-0 z-[800] flex w-full flex-col bg-[#fff] shadow-[-12px_0_40px_-12px_rgba(0,0,0,0.35)] transition-transform duration-200 sm:w-[440px]',
          open ? 'visible translate-x-0' : 'pointer-events-none invisible translate-x-full',
        )}
        aria-hidden={!open}
        aria-label="Painel do Mapas ERB"
      >
        <header className="flex items-center gap-3 bg-gradient-to-r from-blue-700 to-blue-600 px-4 py-3 text-[#fff]">
          <img src="/icon-192.png" alt="" className="h-9 w-9 rounded-full ring-2 ring-white/70" />
          <div className="min-w-0 flex-1">
            <div className="text-[16px] leading-tight font-semibold">MARX Mapas ERB</div>
            <div className="text-[11.5px] text-blue-100">Antenas, setores e lugares no mapa</div>
          </div>
          <button className="rounded-md p-1.5 hover:bg-[#fff]/15" onClick={() => setHelp(true)} aria-label="Como usar" title="Como usar">
            <Info className="h-5 w-5" />
          </button>
          <button className="rounded-md p-1.5 hover:bg-[#fff]/15" onClick={() => setOpen(false)} aria-label="Fechar painel" title="Fechar painel">
            <ChevronRight className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <Section title="Entrada">
            <textarea
              className="w-full resize-y !border-gray-300 !bg-[#fff] font-mono text-[12.5px] !text-gray-900"
              rows={3}
              placeholder={'Importar… cole coordenadas, linhas do extrato ou um link\n250 -26.25623 -49.2562\n10  -26-52-54,00  -49-08-31,00'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[13px] font-medium text-[#fff] hover:bg-blue-700"
                onClick={doImport}
                aria-label="Converter e importar"
              >
                <Plus className="h-4 w-4" /> Converter
              </button>
              <div className="relative">
                <button
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-[13px] font-medium text-[#fff] hover:bg-emerald-700"
                  onClick={() => setAddMenu(!addMenu)}
                >
                  <Plus className="h-4 w-4" /> Adicionar ▾
                </button>
                {addMenu && (
                  <div className="absolute top-10 left-0 z-10 w-56 rounded-lg border border-gray-200 bg-[#fff] p-1 text-[13px] shadow-xl">
                    {(
                      [
                        ['Lugar (digitar)', () => setDraft(newDraft(null, null, 'outro', marks.length + 1))],
                        ['Antena / ERB (digitar)', () => setDraft(newDraft(null, null, 'erb', marks.length + 1))],
                        ['Lugar — tocar no mapa', () => startPick('outro')],
                        ['Antena — tocar no mapa', () => startPick('erb')],
                      ] as const
                    ).map(([l, fn]) => (
                      <button
                        key={l}
                        className="block w-full rounded px-3 py-2 text-left hover:bg-blue-50"
                        onClick={() => {
                          setAddMenu(false)
                          fn()
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-[#fff] px-3 text-[13px] font-medium text-gray-800 hover:bg-gray-50"
                onClick={() => sheetInput.current?.click()}
              >
                <Upload className="h-4 w-4" /> Planilha
              </button>
              <input
                ref={sheetInput}
                type="file"
                accept=".xlsx,.csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) void importSheetFile(f)
                }}
              />
            </div>
            <p className="mt-2 text-[11.5px] leading-snug text-gray-500">
              Dica: clique com o <b>botão direito</b> no mapa (no celular, <b>toque longo</b>) para adicionar um ponto no local.
            </p>
          </Section>

          <Section title="Compartilhar" right={link ? <span className="font-mono text-[10.5px] text-gray-400">{fmtInt(link.length)} caracteres</span> : null}>
            <label className="mb-2 block">
              <span className="text-[11.5px] text-gray-500">Título</span>
              <input className="mt-0.5 w-full !border-gray-300 !bg-[#fff] !text-gray-900" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <div className="flex gap-2">
              <input
                readOnly
                className="min-w-0 flex-1 !border-gray-300 !bg-gray-50 font-mono text-[11.5px] !text-gray-700"
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Link desta análise"
              />
              <button
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[13px] font-medium text-[#fff] hover:bg-blue-700"
                onClick={copy}
                disabled={!link}
              >
                <Share2 className="h-4 w-4" /> Copiar
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {link && (
                <a
                  className="inline-flex h-8 items-center rounded-md bg-[#25D366] px-3 text-[12.5px] font-medium text-[#fff] hover:brightness-95"
                  href={`https://wa.me/?text=${encodeURIComponent(link)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WhatsApp
                </a>
              )}
              <button
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-300 px-3 text-[12.5px] text-gray-800 hover:bg-gray-50"
                onClick={() => exportSheet(current, radius, `${(title || 'Mapas_ERB').replace(/[^\w.-]+/g, '_').slice(0, 60)}.xlsx`)}
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
              </button>
              <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-300 px-3 text-[12.5px] text-gray-800 hover:bg-gray-50" onClick={kml}>
                <Download className="h-4 w-4 text-blue-600" /> KML
              </button>
            </div>
            {hasTimes && (
              <label className="mt-2 flex items-center gap-2 text-[12.5px] text-gray-600">
                <input type="checkbox" checked={withTimes} onChange={(e) => setWithTimes(e.target.checked)} /> incluir dias e horários das ERBs no link
              </label>
            )}
            {link.length > 60000 && (
              <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[12px] text-amber-800">Link muito longo: desmarque os dias e horários ou envie a planilha.</p>
            )}
            <p className="mt-2 text-[11.5px] leading-snug text-gray-500">O link muda a cada alteração e abre exatamente este mapa. Nada é enviado nem guardado em servidor.</p>
          </Section>

          <Section
            title={`Pontos (${fmtInt(marks.length)})`}
            right={
              <input
                className="h-7 w-36 !border-gray-300 !bg-[#fff] !py-0 text-[12px] !text-gray-900"
                placeholder="filtrar…"
                value={filter}
                onChange={(e) => (setFilter(e.target.value), setPage(0))}
              />
            }
          >
            {base.points.length > 0 && (
              <div className="mb-2 flex items-center gap-2 rounded-md bg-blue-50 px-2.5 py-2 text-[12.5px] text-blue-900">
                <button onClick={() => setShowAnalysis(!showAnalysis)} aria-label="Mostrar ou ocultar ERBs da planilha" className="text-blue-700">
                  {showAnalysis ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <span>
                  {fmtInt(base.points.length)} ERBs da planilha/análise · {fmtInt(totalEvents)} eventos
                  {base.period[0] ? ` · ${fmtDateTime(base.period[0])} → ${fmtDateTime(base.period[1])}` : ''}
                </span>
              </div>
            )}
            {shown.length ? (
              <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
                {shown.map(({ m, i }) => (
                  <li key={i} className={clsx('flex items-center gap-2.5 px-2.5 py-2', m.hidden && 'opacity-50')}>
                    <button
                      onClick={() => setMarks(marks.map((x, j) => (j === i ? { ...x, hidden: !x.hidden } : x)))}
                      aria-label={m.hidden ? 'Mostrar' : 'Ocultar'}
                      className="text-gray-400 hover:text-gray-700"
                    >
                      {m.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <MarkGlyph kind={m.kind} color={markHex(m)} size={26} />
                    <button className="min-w-0 flex-1 text-left" onClick={() => setFocus({ lat: m.lat, lon: m.lon, key: Date.now() })} title="Centralizar no mapa">
                      <div className="truncate text-[13px] font-medium text-gray-900">{m.label}</div>
                      <div className="font-mono text-[11px] text-gray-500">
                        {m.lat.toFixed(5)}, {m.lon.toFixed(5)}
                        {m.kind === 'erb' && m.az !== null && m.az !== undefined ? ` · ${m.az}°` : ''}
                      </div>
                    </button>
                    <button className="rounded p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-700" onClick={() => onMark(i)} aria-label={`Editar ${m.label}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                      onClick={() => setMarks(marks.filter((_, j) => j !== i))}
                      aria-label={`Excluir ${m.label}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed border-gray-300 px-3 py-5 text-center text-[12.5px] text-gray-500">
                Nenhum ponto. Cole dados na entrada, use “Adicionar” ou o botão direito no mapa.
              </p>
            )}
            {pages > 1 && (
              <div className="mt-2 flex items-center justify-between text-[12px] text-gray-500">
                <span>
                  {page * PAGE + 1}–{Math.min(list.length, page * PAGE + PAGE)} de {list.length}
                </span>
                <div className="flex gap-1">
                  <button className="rounded border border-gray-300 px-2 py-0.5 disabled:opacity-40" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    ‹
                  </button>
                  <button className="rounded border border-gray-300 px-2 py-0.5 disabled:opacity-40" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
                    ›
                  </button>
                </div>
              </div>
            )}
          </Section>

          <p className="px-4 py-3 text-[11px] leading-snug text-gray-500">
            Caráter ilustrativo: distância (padrão 1000 m) e abertura (120°) do setor são valores médios de referência; cabe ao analista ajustá-los e validar a representação com o
            extrato da operadora. Antenas: dados de licenciamento da Anatel.{' '}
            <a className="text-blue-600 underline" href={HOME} target="_blank" rel="noopener noreferrer">
              iamarx.com.br
            </a>
          </p>
        </div>
      </aside>

      <ErbDocModals d={d} />
    </div>
  )
}

/**
 * Entrada do site/links públicos (erb.iamarx.com.br, /m, /erb e /mapa-compartilhado): abre o mapa
 * que está no próprio endereço (#…) — direto (z0/z1/m2/m3) ou com senha (m1, links antigos).
 */
export default function ErbPage() {
  const frag = location.hash.slice(1)
  const open_ = !frag || isOpenLink(frag)
  const [map, setMap] = useState<SharedMap | null | undefined>(frag ? undefined : null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
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
  if (map !== undefined) return <ErbApp initial={map} />
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-gray-100 p-4 text-gray-900">
      <div className="w-full max-w-md rounded-2xl bg-[#fff] p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <img src="/icon-192.png" alt="" className="h-10 w-10 rounded-full" />
          <div className="text-[17px] font-semibold">MARX Mapas ERB</div>
        </div>
        {err && open_ ? (
          <div className="space-y-3">
            <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-[13.5px] text-amber-900">
              {err}
            </p>
            <a className="inline-block rounded-md bg-blue-600 px-3 py-2 text-[13px] font-medium text-[#fff]" href={location.pathname}>
              Abrir um mapa em branco
            </a>
          </div>
        ) : open_ ? (
          <p className="text-[13.5px] text-gray-600">Abrindo o mapa…</p>
        ) : (
          <form onSubmit={openPw} className="space-y-3">
            <div className="flex items-center gap-2 text-[14px] font-semibold">
              <Lock className="h-4 w-4 text-blue-600" /> Mapa protegido por senha
            </div>
            <p className="text-[13px] text-gray-600">Digite a senha recebida de quem compartilhou. O mapa é aberto apenas neste navegador; nada é enviado ou gravado.</p>
            <input
              type="password"
              autoFocus
              className="w-full !border-gray-300 !bg-[#fff] font-mono !text-gray-900"
              placeholder="XXXX-XXXX-XXXX"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
            {err && (
              <p role="alert" className="text-[13px] text-red-600">
                {err}
              </p>
            )}
            <button className="w-full rounded-md bg-blue-600 py-2 text-[13.5px] font-medium text-[#fff] disabled:opacity-50" disabled={busy || !password}>
              {busy ? 'Abrindo…' : 'Abrir mapa'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
