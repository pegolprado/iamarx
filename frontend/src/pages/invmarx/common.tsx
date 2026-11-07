import clsx from 'clsx'
import { CloudUpload, FileText, FolderOpen, Info, Search, ShieldCheck } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { nextPaint, setProgress } from '../../app/progress'

export function ToolTitle({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-line pb-4">
      <div className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-panel-2 text-teal [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</div>
      <h1 className="text-[22px] leading-tight font-semibold text-white">{title}</h1>
      <div className="ml-auto flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

export function Panel({ icon, title, tone = 'text-accent', note, children }: { icon: ReactNode; title: string; tone?: string; note?: string; children: ReactNode }) {
  return (
    <section className="card mb-3 p-4">
      <h2 className="mb-3 flex items-center gap-2 border-b border-line pb-2.5 text-[14px] font-semibold text-white">
        <span className={clsx('grid h-6 w-6 place-items-center rounded-md bg-panel-2 [&>svg]:h-3.5 [&>svg]:w-3.5', tone)}>{icon}</span>
        {title}
        {note && <span className="text-xs font-normal text-faint">({note})</span>}
      </h2>
      {children}
    </section>
  )
}

export function Purpose({ children }: { children: ReactNode }) {
  return (
    <Panel icon={<Info />} title="Finalidade" tone="text-danger">
      <p className="text-sm leading-relaxed text-text/85">{children}</p>
    </Panel>
  )
}

export function Extracts({ items }: { items: [string, ReactNode][] }) {
  return (
    <Panel icon={<Search />} title="O que é extraído">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {items.map(([label, icon]) => (
          <div key={label} className="flex flex-col items-center gap-2 rounded-lg border border-line bg-panel-2/60 px-3 py-3 text-center text-[12px] font-medium text-text">
            {label}
            <span className="text-accent [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export function Needed({ items }: { items: string[] }) {
  return (
    <Panel icon={<FolderOpen />} title="Arquivos necessários" tone="text-amber">
      <div className="flex flex-wrap justify-center gap-2">
        {items.map((x) => (
          <span key={x} className="inline-flex items-center gap-1.5 rounded-lg border border-line-2 bg-ink-2 px-3 py-1.5 text-xs text-white">
            <FileText className="h-3.5 w-3.5 text-accent" /> {x}
          </span>
        ))}
      </div>
    </Panel>
  )
}

export const PRIVACY = (
  <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted">
    <ShieldCheck className="h-3.5 w-3.5 text-ok" /> Todo o processamento é feito no seu navegador. <span className="text-ok">Nada é armazenado nos nossos servidores.</span>
  </p>
)

/** Área de envio: arrastar e soltar ou clicar; mostra os arquivos escolhidos. */
export function Dropzone({
  title,
  hint,
  accept,
  max,
  files,
  onFiles,
  onRun,
  runLabel,
  busy,
}: {
  title: string
  hint: string
  accept: string
  max: number
  files: File[]
  onFiles: (f: File[]) => void
  onRun: () => unknown
  runLabel: string
  busy?: string | null
}) {
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [starting, setStarting] = useState(false)
  // indicador global enquanto a análise é criada
  useEffect(() => {
    setProgress(busy ?? (starting ? 'Preparando a análise…' : null))
    if (busy) setStarting(false)
  }, [busy, starting])
  useEffect(() => () => setProgress(null), [])
  const start = async () => {
    setStarting(true)
    await nextPaint()
    try {
      await onRun()
    } finally {
      setStarting(false)
    }
  }
  const add = (list: FileList | null) => {
    if (!list?.length) return
    const all = [...files, ...[...list].filter((f) => !files.some((x) => x.name === f.name && x.size === f.size))]
    onFiles(all.slice(0, max))
  }
  return (
    <Panel icon={<CloudUpload />} title={title}>
      <p className="mb-3 text-sm text-muted">{hint}</p>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          add(e.dataTransfer.files)
        }}
        className={clsx(
          'flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-9 text-center transition-colors duration-150',
          drag ? 'border-accent bg-accent/5' : 'border-line-2 hover:border-accent/60',
        )}
      >
        <CloudUpload className="h-7 w-7 text-accent" />
        <span className="text-[13.5px] font-medium text-white">Arraste os arquivos aqui ou clique para selecionar</span>
        <span className="text-xs text-faint">
          Até {max} arquivo{max > 1 ? 's' : ''} · {accept.replace(/\./g, '').toUpperCase().replace(/,/g, ', ')}
        </span>
      </button>
      <input ref={input} type="file" multiple={max > 1} accept={accept} className="hidden" onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
      {files.length > 0 && (
        <ul className="mt-3 max-h-40 space-y-1 overflow-auto text-xs">
          {files.map((f) => (
            <li key={f.name + f.size} className="flex items-center gap-2 rounded-lg border border-line bg-ink-2 px-2 py-1">
              <FileText className="h-3.5 w-3.5 text-accent" /> <span className="truncate">{f.name}</span>
              <span className="ml-auto text-faint">{(f.size / 1024).toFixed(0)} KB</span>
              <button type="button" className="text-faint hover:text-danger" onClick={() => onFiles(files.filter((x) => x !== f))} aria-label={`Remover ${f.name}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="btn-primary mt-4 w-full" disabled={!files.length || !!busy || starting} onClick={start}>
        {busy ?? (starting ? 'Preparando…' : runLabel)}
      </button>
      {(busy || starting) && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-accent/15">
          <div className="progress-indeterminate h-full w-1/3 rounded-full bg-accent" />
        </div>
      )}
      {PRIVACY}
    </Panel>
  )
}

export function Indicator({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex min-w-[96px] flex-col items-center gap-0.5 rounded-lg border border-line bg-panel-2/60 px-3 py-2 text-center">
      <span className="flex items-center gap-1 text-[11px] text-muted [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon} {label}
      </span>
      <span className="text-[18px] font-semibold text-white tabular-nums">{value}</span>
    </div>
  )
}
