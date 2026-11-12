import { Download, Eye, EyeOff, FileUp, Image as ImageIcon, KeyRound, Lock, RefreshCw, ShieldCheck, Trash2, Unlock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Notice } from '../../components/ui'
import { hideFile, inspect, revealFile } from '../../engine/steg'
import { ToolTitle } from './common'

const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : n < 1024 ** 3 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`
const readBytes = async (f: File) => new Uint8Array(await f.arrayBuffer())
const save = (data: Uint8Array, name: string, type = 'application/octet-stream') => {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Força aproximada da senha (0–4). */
function strength(p: string) {
  let s = 0
  if (p.length >= 8) s++
  if (p.length >= 12) s++
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++
  return Math.min(4, s)
}
const STR_LABEL = ['muito fraca', 'fraca', 'razoável', 'boa', 'forte']
const STR_COLOR = ['#ef4444', '#f59e0b', '#eab308', '#84cc16', '#22c55e']

export default function Steg() {
  const [tab, setTab] = useState<'ocultar' | 'revelar'>('ocultar')
  return (
    <div className="space-y-4">
      <ToolTitle icon={<ShieldCheck />} title="MARX Secret — ocultar arquivo em imagem" />
      <p className="max-w-3xl text-[13.5px] text-muted">
        Esconda qualquer arquivo (documentos, planilhas, PDFs, ZIPs…), de qualquer tamanho, dentro de uma imagem. A imagem continua abrindo normalmente; o conteúdo vai
        criptografado (AES-256-GCM) e só volta com a senha. Tudo é feito no seu navegador e nada é enviado para servidor nenhum.
      </p>
      <div className="grid max-w-md grid-cols-2 rounded-lg border border-line bg-ink-2 p-1 text-sm" role="tablist">
        {(
          [
            ['ocultar', 'Ocultar arquivo', <Lock key="l" className="h-4 w-4" />],
            ['revelar', 'Revelar arquivo', <Unlock key="u" className="h-4 w-4" />],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex items-center justify-center gap-2 rounded-md py-1.5 font-medium transition-colors ${tab === id ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text'}`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
      {tab === 'ocultar' ? <Hide /> : <Reveal />}
      <Notice tone="amber">
        Guarde a senha: sem ela o conteúdo não volta, nem por nós. Evite reenviar a imagem por apps que recomprimem fotos (WhatsApp, Instagram): eles podem apagar o conteúdo
        oculto. Para enviar, use o arquivo original (anexo/documento) ou um ZIP.
      </Notice>
    </div>
  )
}

function ImagePicker({ label, file, onPick, onClear }: { label: string; file: File | null; onPick: (f: File) => void; onClear: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [dim, setDim] = useState<string>('')
  useEffect(() => {
    if (!file) return setUrl(null)
    const u = URL.createObjectURL(file)
    setUrl(u)
    const img = new Image()
    img.onload = () => setDim(`${img.naturalWidth} × ${img.naturalHeight} px`)
    img.src = u
    return () => URL.revokeObjectURL(u)
  }, [file])
  return (
    <div className="card p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <ImageIcon className="h-4 w-4 text-accent" /> {label}
      </h2>
      {url ? (
        <div className="space-y-2">
          <img src={url} alt="Imagem portadora" className="max-h-56 w-full rounded-lg border border-line object-contain" />
          <div className="text-center text-xs text-muted">
            {file!.name} · {dim || '…'} · {fmtBytes(file!.size)}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line-2 px-4 py-10 text-center hover:border-accent/60"
        >
          <ImageIcon className="h-7 w-7 text-accent" />
          <span className="text-[13.5px] font-medium text-white">Clique para escolher a imagem</span>
          <span className="text-xs text-faint">PNG, JPG, WEBP…</span>
        </button>
      )}
      <div className="mt-2 flex gap-2">
        <button type="button" className="btn-ghost flex-1 !py-1.5 text-xs" onClick={() => input.current?.click()}>
          <ImageIcon className="h-3.5 w-3.5 text-accent" /> Selecionar imagem
        </button>
        {file && (
          <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={onClear}>
            <Trash2 className="h-3.5 w-3.5 text-danger" /> Limpar
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/*"
        className="hidden"
        onChange={(e) => (e.target.files?.[0] && onPick(e.target.files[0]), (e.target.value = ''))}
      />
    </div>
  )
}

function PasswordBox({ pwd, setPwd, confirm, setConfirm }: { pwd: string; setPwd: (v: string) => void; confirm?: string; setConfirm?: (v: string) => void }) {
  const [show, setShow] = useState(false)
  const gen = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*'
    const a = crypto.getRandomValues(new Uint8Array(16))
    const p = [...a].map((x) => chars[x % chars.length]).join('')
    setPwd(p)
    setConfirm?.(p)
    setShow(true)
  }
  const st = strength(pwd)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <KeyRound className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            type={show ? 'text' : 'password'}
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="Senha"
            aria-label="Senha"
            className="w-full !pl-8"
            autoComplete="new-password"
          />
        </div>
        <button type="button" className="btn-ghost !px-2 !py-2" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        {setConfirm && (
          <button type="button" className="btn-ghost !px-2 !py-2" onClick={gen} aria-label="Gerar senha forte" title="Gerar senha forte">
            <RefreshCw className="h-4 w-4 text-accent" />
          </button>
        )}
      </div>
      {setConfirm && (
        <>
          <input
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirmar senha"
            aria-label="Confirmar senha"
            className="w-full"
            autoComplete="new-password"
          />
          {pwd && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full transition-all" style={{ width: `${(st / 4) * 100}%`, background: STR_COLOR[st] }} />
              </div>
              <span className="text-[11px]" style={{ color: STR_COLOR[st] }}>
                {STR_LABEL[st]}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Hide() {
  const [img, setImg] = useState<File | null>(null)
  const [payload, setPayload] = useState<File | null>(null)
  const [encrypt, setEncrypt] = useState(true)
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [compress, setCompress] = useState(true)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const run = async () => {
    if (!img) return toast.error('Escolha a imagem portadora.')
    if (!payload) return toast.error('Escolha o arquivo que será ocultado.')
    if (encrypt) {
      if (pwd.length < 4) return toast.error('Defina uma senha com pelo menos 4 caracteres.')
      if (pwd !== confirm) return toast.error('As senhas não conferem.')
    }
    setBusy(true)
    try {
      const [carrier, data] = await Promise.all([readBytes(img), readBytes(payload)])
      const out = await hideFile({ carrier, payload: data, name: payload.name, password: encrypt ? pwd : undefined, compress })
      const base = img.name.replace(/\.[^.]+$/, '')
      const extMatch = img.name.match(/\.[^.]+$/)
      const ext = extMatch ? extMatch[0] : '.png'
      save(out, `${base}_marx${ext}`, img.type || 'image/png')
      toast.success(`Pronto! Imagem gerada com o arquivo oculto (${fmtBytes(out.length)}).`)
    } catch (e: any) {
      toast.error(`Falha ao ocultar: ${e?.message ?? e}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ImagePicker label="Imagem portadora" file={img} onPick={setImg} onClear={() => setImg(null)} />
      <div className="space-y-4">
        <div className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <FileUp className="h-4 w-4 text-ok" /> Conteúdo a ocultar
          </h2>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex w-full items-center gap-3 rounded-lg border border-line bg-ink-2 px-3 py-3 text-left hover:border-accent/60"
          >
            <FileUp className="h-5 w-5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              {payload ? (
                <>
                  <span className="block truncate text-[13px] font-medium text-white">{payload.name}</span>
                  <span className="text-xs text-muted">{fmtBytes(payload.size)}</span>
                </>
              ) : (
                <span className="text-[13px] text-muted">Clique para escolher qualquer arquivo (sem limite de tamanho)</span>
              )}
            </span>
          </button>
          <input ref={fileInput} type="file" className="hidden" onChange={(e) => (e.target.files?.[0] && setPayload(e.target.files[0]), (e.target.value = ''))} />
        </div>

        <div className="card space-y-3 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Lock className="h-4 w-4 text-amber" /> Proteção
          </h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />
            <span>
              Criptografar com senha <span className="text-xs text-faint">(AES-256-GCM · PBKDF2-SHA-256)</span>
            </span>
          </label>
          {encrypt && <PasswordBox pwd={pwd} setPwd={setPwd} confirm={confirm} setConfirm={setConfirm} />}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={compress} onChange={(e) => setCompress(e.target.checked)} />
            <span>Comprimir o conteúdo antes de ocultar</span>
          </label>
        </div>

        <button className="btn-primary w-full" onClick={run} disabled={busy}>
          {busy ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" /> Ocultando…
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" /> Ocultar e baixar imagem
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function Reveal() {
  const [img, setImg] = useState<File | null>(null)
  const [state, setState] = useState<{ ok: boolean; encrypted: boolean } | null>(null)
  const [pwd, setPwd] = useState('')
  const [busy, setBusy] = useState(false)

  const pick = async (f: File) => {
    setImg(f)
    setState(null)
    try {
      setState(inspect(await readBytes(f)))
    } catch {
      setState({ ok: false, encrypted: false })
    }
  }

  const run = async () => {
    if (!img) return toast.error('Escolha a imagem com o conteúdo oculto.')
    setBusy(true)
    try {
      const r = await revealFile(await readBytes(img), pwd || undefined)
      save(r.data, r.name)
      toast.success(`Arquivo revelado: ${r.name} (${fmtBytes(r.data.length)}).`)
    } catch (e: any) {
      toast.error(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ImagePicker label="Imagem com conteúdo oculto" file={img} onPick={pick} onClear={() => (setImg(null), setState(null))} />
      <div className="space-y-4">
        {state && (
          <div className={`card flex items-center gap-2 p-3 text-sm ${state.ok ? 'text-ok' : 'text-danger'}`}>
            {state.ok ? <ShieldCheck className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {state.ok
              ? state.encrypted
                ? 'Imagem com arquivo oculto protegido por senha.'
                : 'Imagem com arquivo oculto (sem senha).'
              : 'Nenhum arquivo oculto do MARX Secret nesta imagem.'}
          </div>
        )}
        {state?.ok && state.encrypted && (
          <div className="card space-y-3 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <KeyRound className="h-4 w-4 text-amber" /> Senha
            </h2>
            <PasswordBox pwd={pwd} setPwd={setPwd} />
          </div>
        )}
        <button className="btn-primary w-full" onClick={run} disabled={busy || !img || (state ? !state.ok : false)}>
          {busy ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" /> Revelando…
            </>
          ) : (
            <>
              <Download className="h-4 w-4" /> Revelar e baixar arquivo
            </>
          )}
        </button>
      </div>
    </div>
  )
}
