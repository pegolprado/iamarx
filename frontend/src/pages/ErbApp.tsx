import clsx from 'clsx'
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Download,
  FileText,
  X,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Info,
  Lock,
  Pencil,
  Plus,
  QrCode,
  RadioTower,
  Share2,
  Trash2,
  Upload,
} from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { LocationMap, markHex } from '../components/LocationMap'
import { exportSheet } from '../lib/erbSheet'
import { exportMapPdf, renderMapImage } from '../lib/mapImage'
import { toast } from 'sonner'
import { fmtDateTime, fmtInt } from '../lib/format'
import { estimateHomeWork } from '../lib/homework'
import { decryptMap, decryptMapOpen, isErbHost, isOpenLink, type SharedMap, shareUrl, WrongPassword } from '../lib/shareMap'
import { EMPTY, ErbDocModals, MarkGlyph, newDraft, TimesByDay, useErbDoc } from './MapasErb'

const PAGE = 8
const HOME = 'https://iamarx.com.br'

/** Marcador colorido do grupo (antena na cor do número). */
function GroupBadge({ color }: { color: string }) {
  return (
    <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full ring-2 ring-white" style={{ background: color, boxShadow: '0 1px 3px rgba(0,0,0,.35)' }}>
      <RadioTower className="h-3.5 w-3.5 text-[#fff]" />
    </span>
  )
}

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
    marks,
    setMarks,
    showAnalysis,
    setShowAnalysis,
    sel,
    setSel,
    picking,
    setPicking,
    setDraft,
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
    frag,
    onMapClick,
    onContext,
    onMark,
    copy,
    list,
    setHelp,
    importSheetFile,
    setGroupHidden,
    removeGroup,
    removeUngrouped,
  } = d
  const ungrouped = useMemo(() => base.points.filter((p) => p.g === undefined), [base.points])
  const hasContent = base.points.length > 0 || marks.some((m) => !m.hidden)
  const places = useMemo(() => estimateHomeWork(base.points), [base.points])
  useEffect(() => setShortUrl(null), [frag])
  const [working, setWorking] = useState<string | null>(null)
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [shortUrl, setShortUrl] = useState<string | null>(null)
  const [shortBusy, setShortBusy] = useState(false)
  const photoName = `${(title && !['Mapas ERB', 'MARX Mapas ERB'].includes(title) ? title : 'Mapa_ERB').replace(/[^\w.-]+/g, '_').slice(0, 60)}.png`
  const makeShort = async () => {
    if (!frag) return toast.error('Adicione ao menos uma ERB ou ponto.')
    if (shortUrl) {
      await navigator.clipboard.writeText(shortUrl).catch(() => {})
      return toast.success('Link curto copiado')
    }
    setShortBusy(true)
    try {
      const r = await fetch('/api/erb', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': 'erb' }, body: JSON.stringify({ data: frag }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Falha ao gerar o link curto.')
      const { id } = await r.json()
      const url = shareUrl(`s${id}`)
      setShortUrl(url)
      await navigator.clipboard.writeText(url).catch(() => {})
      toast.success('Link curto gerado e copiado — abre com um clique no WhatsApp.')
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao gerar o link curto.')
    } finally {
      setShortBusy(false)
    }
  }
  const showQr = async () => {
    const target = shortUrl || link
    if (!target) return
    try {
      const qrcode = (await import('qrcode-generator')).default
      const q = qrcode(0, 'M')
      q.addData(target)
      q.make()
      setQr(q.createDataURL(6, 8))
    } catch {
      toast.error('Não foi possível gerar o QR code.')
    }
  }
  const makePhoto = async () => {
    setWorking('Gerando a foto…')
    try {
      const blob = await renderMapImage(current, { radius, beam, showAnalysis }, (st) => setWorking(st))
      setPhoto({ blob, url: URL.createObjectURL(blob) })
    } catch (e: any) {
      toast.error(e?.message ?? 'Não foi possível gerar a foto.')
    } finally {
      setWorking(null)
    }
  }
  const makePdf = async () => {
    setWorking('Gerando o PDF…')
    try {
      await exportMapPdf(current, { radius, beam, showAnalysis, link }, (st) => setWorking(st))
    } catch (e: any) {
      toast.error(e?.message ?? 'Não foi possível gerar o PDF.')
    } finally {
      setWorking(null)
    }
  }
  const sharePhoto = async () => {
    if (!photo) return
    const file = new File([photo.blob], photoName, { type: 'image/png' })
    const text = `${title && !['Mapas ERB', 'MARX Mapas ERB'].includes(title) ? `${title}\n` : ''}${link}`
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text })
        return
      } catch (e: any) {
        if (e?.name === 'AbortError') return
      }
    }
    // sem compartilhamento nativo (computador): baixa a foto e copia o link
    downloadPhoto()
    await navigator.clipboard?.writeText(link).catch(() => {})
    toast.success('Foto baixada e link copiado: anexe a foto e cole o link na conversa.')
  }
  const downloadPhoto = () => {
    if (!photo) return
    const a = document.createElement('a')
    a.href = photo.url
    a.download = photoName
    a.click()
  }
  const copyPhoto = async () => {
    if (!photo) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': photo.blob })])
      toast.success('Foto copiada: cole na conversa (Ctrl+V) e depois o link.')
    } catch {
      toast.error('Este navegador não permite copiar imagens; use “Baixar foto”.')
    }
  }
  const [open, setOpen] = useState(false)
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
        places={places}
        onCloseDetail={() => setSel(null)}
        onBackgroundClick={() => (setOpen(false), setAddMenu(false))}
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
          <Crosshair className="h-4 w-4 text-sky-300" /> Toque no mapa para adicionar {picking === 'erb' ? 'a antena' : 'o ponto'}
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
          'absolute top-0 right-0 z-[800] flex max-h-full w-full flex-col overflow-hidden bg-[#fff] shadow-[-12px_8px_40px_-12px_rgba(0,0,0,0.35)] transition-transform duration-200 sm:w-[400px] sm:rounded-bl-xl',
          open ? 'visible translate-x-0' : 'pointer-events-none invisible translate-x-full',
        )}
        aria-hidden={!open}
        aria-label="Painel do Mapas ERB"
      >
        <header className="flex items-center gap-3 bg-gradient-to-r from-blue-700 to-blue-600 px-4 py-3 text-[#fff]">
          <img src="/icon-192.png" alt="" className="h-9 w-9 rounded-full ring-2 ring-white/70" />
          <div className="min-w-0 flex-1">
            <div className="text-[16px] leading-tight font-semibold">MARX Mapas ERB</div>
            <div className="text-[11.5px] text-blue-100">Antenas, setores e pontos no mapa</div>
          </div>
          <button className="rounded-md p-1.5 hover:bg-[#fff]/15" onClick={() => setHelp(true)} aria-label="Como usar" title="Como usar">
            <Info className="h-5 w-5" />
          </button>
          <button className="rounded-md p-1.5 hover:bg-[#fff]/15" onClick={() => setOpen(false)} aria-label="Fechar painel" title="Fechar painel">
            <ChevronRight className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto">
          <div className="flex flex-wrap gap-2 border-b border-gray-200 px-4 py-3.5">
            <div className="relative">
              <button
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-[13px] font-medium text-[#fff] hover:bg-emerald-700"
                onClick={() => setAddMenu(!addMenu)}
                aria-expanded={addMenu}
              >
                <Plus className="h-4 w-4" /> Adicionar ▾
              </button>
              {addMenu && (
                <div className="absolute top-10 left-0 z-10 w-60 rounded-lg border border-gray-200 bg-[#fff] p-1 text-[13px] shadow-xl">
                  {(
                    [
                      ['Ponto (digitar)', () => setDraft(newDraft(null, null, 'outro', marks.length + 1))],
                      ['Antena / ERB (digitar)', () => setDraft(newDraft(null, null, 'erb', marks.length + 1))],
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
              multiple
              className="hidden"
              onChange={async (e) => {
                const fs = [...(e.target.files ?? [])]
                e.target.value = ''
                for (const f of fs) await importSheetFile(f)
              }}
            />
          </div>

          <Section title="Link" right={link ? <span className="font-mono text-[10.5px] text-gray-400">{fmtInt(link.length)} caracteres</span> : null}>
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
              <button
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-gray-300 px-2.5 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                onClick={showQr}
                disabled={!link}
                aria-label="QR code do link"
                title="Mostra um QR code para abrir no celular"
              >
                <QrCode className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2">
              <button
                className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 text-[12.5px] font-medium text-[#fff] hover:bg-indigo-700 disabled:opacity-50"
                onClick={makeShort}
                disabled={!hasContent || shortBusy}
                title="Gera um link curto (abre com um clique no WhatsApp, sem cortar). O conteúdo fica guardado no servidor."
              >
                {shortBusy ? 'Gerando…' : shortUrl ? '✓ Link curto (copiar de novo)' : 'Gerar link curto (WhatsApp)'}
              </button>
              {shortUrl && <div className="mt-1 truncate font-mono text-[11px] text-indigo-600">{shortUrl}</div>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-[12.5px] font-medium text-[#fff] hover:bg-emerald-700 disabled:opacity-50"
                onClick={makePhoto}
                disabled={!hasContent || !!working}
                title="Gera uma foto do mapa (onde estão as ERBs) para enviar junto com o link"
              >
                <Camera className="h-4 w-4" /> Link com foto
              </button>
              <button
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-300 px-3 text-[12.5px] text-gray-800 hover:bg-gray-50"
                onClick={() => exportSheet(current, radius, `${(title || 'Mapas_ERB').replace(/[^\w.-]+/g, '_').slice(0, 60)}.xlsx`)}
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
              </button>
              <button
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-300 px-3 text-[12.5px] text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                onClick={makePdf}
                disabled={!hasContent || !!working}
              >
                <FileText className="h-4 w-4 text-red-600" /> PDF
              </button>
              {working && <span className="text-[12px] text-gray-500">{working}</span>}
            </div>
            {hasTimes && (
              <label className="mt-2 flex items-center gap-2 text-[12.5px] text-gray-600">
                <input type="checkbox" checked={withTimes} onChange={(e) => setWithTimes(e.target.checked)} /> incluir dias e horários das ERBs no link
              </label>
            )}
            {link.length > 60000 && (
              <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[12px] text-amber-800">Link muito longo: desmarque os dias e horários ou envie a planilha.</p>
            )}
          </Section>

          <Section
            title={`Pontos (${fmtInt(marks.length + (base.groups?.length ?? 0) + (ungrouped.length ? 1 : 0))})`}
            right={
              <input
                className="h-7 w-36 !border-gray-300 !bg-[#fff] !py-0 text-[12px] !text-gray-900"
                placeholder="filtrar…"
                value={filter}
                onChange={(e) => (setFilter(e.target.value), setPage(0))}
              />
            }
          >
            {(base.groups?.length || ungrouped.length) > 0 && (
              <ul className="mb-2 divide-y divide-gray-100 rounded-md border border-gray-200">
                {ungrouped.length > 0 && (
                  <li className={clsx('flex items-center gap-2.5 px-2.5 py-2', !showAnalysis && 'opacity-50')}>
                    <button
                      onClick={() => setShowAnalysis(!showAnalysis)}
                      aria-label={showAnalysis ? 'Ocultar ERBs da análise' : 'Mostrar ERBs da análise'}
                      className="text-gray-400 hover:text-gray-700"
                    >
                      {showAnalysis ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <GroupBadge color="#b91c1c" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-gray-900">ERBs da análise</div>
                      <div className="text-[11px] text-gray-500">
                        {fmtInt(ungrouped.length)} ERBs · {fmtInt(ungrouped.reduce((n, p) => n + p.events, 0))} eventos
                      </div>
                    </div>
                    <button className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600" onClick={removeUngrouped} aria-label="Excluir ERBs da análise">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                )}
                {(base.groups ?? []).map((g, i) => {
                  const pts = base.points.filter((p) => p.g === i)
                  const days = new Set(pts.flatMap((p) => (p.times ?? []).map((t) => t.slice(0, 10)))).size
                  return (
                    <li key={i} className={clsx('flex items-center gap-2.5 px-2.5 py-2', g.hidden && 'opacity-50')}>
                      <button
                        onClick={() => setGroupHidden(i, !g.hidden)}
                        aria-label={g.hidden ? `Mostrar ${g.name}` : `Ocultar ${g.name}`}
                        className="text-gray-400 hover:text-gray-700"
                      >
                        {g.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <GroupBadge color={g.color} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-gray-900" title={g.name}>
                          {g.name}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {fmtInt(pts.length)} ERBs · {fmtInt(pts.reduce((n, p) => n + p.events, 0))} eventos{days ? ` · ${days} dia${days > 1 ? 's' : ''}` : ''}
                        </div>
                      </div>
                      <button
                        className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                        onClick={() => confirm(`Excluir ${g.name} do mapa?`) && removeGroup(i)}
                        aria-label={`Excluir ${g.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  )
                })}
              </ul>
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
            ) : base.points.length ? null : (
              <p className="rounded-md border border-dashed border-gray-300 px-3 py-5 text-center text-[12.5px] text-gray-500">
                Nenhum ponto marcado. Use “Adicionar”, “Planilha” ou o botão direito no mapa.
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

      {qr && (
        <div className="fixed inset-0 z-[1100] grid place-items-center bg-black/50 p-3" onMouseDown={() => setQr(null)}>
          <div className="w-full max-w-xs rounded-xl bg-[#fff] p-4 text-gray-900 shadow-2xl" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="QR code do link">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[15px] font-semibold">QR code</div>
              <button className="rounded p-1 text-gray-500 hover:bg-gray-100" onClick={() => setQr(null)} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <img src={qr} alt="QR code do link desta análise" className="mx-auto w-full max-w-[260px] rounded-lg border border-gray-200" />
            <p className="mt-2 text-center text-[12px] text-gray-500">Aponte a câmera do celular para abrir este mapa.</p>
          </div>
        </div>
      )}

      {photo && (
        <div className="fixed inset-0 z-[1100] grid place-items-center bg-black/50 p-3" onMouseDown={() => (URL.revokeObjectURL(photo.url), setPhoto(null))}>
          <div className="w-full max-w-3xl rounded-xl bg-[#fff] p-4 text-gray-900 shadow-2xl" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Link com foto">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[15px] font-semibold">Link com foto</div>
              <button className="rounded p-1 text-gray-500 hover:bg-gray-100" onClick={() => (URL.revokeObjectURL(photo.url), setPhoto(null))} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <img src={photo.url} alt="Foto do mapa" className="max-h-[60vh] w-full rounded-lg border border-gray-200 object-contain" />
            <p className="mt-2 text-[12px] text-gray-500">
              A foto vai como imagem junto com o link (o link continua curto). No celular, “Compartilhar” envia os dois juntos para o WhatsApp ou outro app.
            </p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button className="h-9 rounded-md border border-gray-300 px-3 text-[13px]" onClick={copyPhoto}>
                Copiar foto
              </button>
              <button className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-300 px-3 text-[13px]" onClick={downloadPhoto}>
                <Download className="h-4 w-4" /> Baixar foto
              </button>
              <button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[13px] font-medium text-[#fff] hover:bg-blue-700" onClick={sharePhoto}>
                <Share2 className="h-4 w-4" /> Compartilhar foto + link
              </button>
            </div>
          </div>
        </div>
      )}
      <ErbDocModals d={d} />
    </div>
  )
}

/**
 * Entrada do site/links públicos (erb.iamarx.com.br, /m, /erb e /mapa-compartilhado): abre o mapa
 * que está no próprio endereço (#…) — direto (z0/z1/m2/m3) ou com senha (m1, links antigos).
 */
export default function ErbPage() {
  const raw = location.hash.slice(1)
  const isShort = /^s[A-Za-z0-9]{6,16}$/.test(raw)
  const [frag, setFrag] = useState(isShort ? '' : raw)
  const open_ = !frag || isOpenLink(frag)
  const [map, setMap] = useState<SharedMap | null | undefined>(raw ? undefined : null)
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
  // link curto (#s<id>): busca o conteúdo no servidor e segue como um link normal
  useEffect(() => {
    if (!isShort) return
    fetch(`/api/erb/${raw.slice(1)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Mapa não encontrado ou expirado.'))))
      .then((d) => setFrag(d.data))
      .catch((x) => setErr(x?.message ?? 'Não foi possível abrir o mapa.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!frag || !isOpenLink(frag)) return
    decryptMapOpen(frag)
      .then(accept)
      .catch((x) => setErr(x?.message ?? 'Não foi possível abrir o mapa.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frag])
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
