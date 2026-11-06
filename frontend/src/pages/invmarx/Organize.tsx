import { FileArchive, FolderOpen } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { organize } from '../../engine/waFiles'
import { Panel } from './common'

/**
 * Organização de arquivos (opcional): escolhe uma pasta (ou ZIPs), acha os HTML de bilhetagem
 * em subpastas e compactados, renomeia por data e alvo e entrega "Organizado.zip".
 */
export function OrganizeFiles({ onUse }: { onUse?: (files: File[]) => void }) {
  const folder = useRef<HTMLInputElement>(null)
  const zips = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const run = async (list: FileList | null) => {
    if (!list?.length) return
    setBusy(true)
    try {
      const r = await organize([...list])
      if (!r.count) return toast.error('Nenhum arquivo de bilhetagem do WhatsApp encontrado.')
      const blob = new Blob([r.zip], { type: 'application/zip' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'Organizado.zip'
      a.click()
      toast.success(`${r.count} arquivo(s) de ${r.targets} alvo(s) organizados em Organizado.zip`, {
        description: r.skipped.length ? `${r.skipped.length} arquivo(s) não eram bilhetagem e ficaram de fora.` : undefined,
      })
      onUse?.([new File([blob], 'Organizado.zip', { type: 'application/zip' })])
    } catch (e: any) {
      toast.error(`Falha ao organizar: ${e?.message ?? e}`)
    } finally {
      setBusy(false)
      if (folder.current) folder.current.value = ''
      if (zips.current) zips.current.value = ''
    }
  }
  return (
    <Panel icon={<FolderOpen />} title="Organização de arquivos" note="etapa prévia e opcional">
      <p className="text-sm leading-relaxed text-text/85">
        Organiza automaticamente os arquivos de “bilhetagem do WhatsApp”: a partir da pasta indicada (ou de arquivos ZIP), procura em subpastas e compactados, identifica os HTML,
        renomeia por data e alvo e monta uma estrutura pronta para análise, entregue como <b>Organizado.zip</b>. Os arquivos organizados também já ficam selecionados abaixo.
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <button className="btn-primary !py-1.5 text-sm" disabled={busy} onClick={() => folder.current?.click()}>
          <FolderOpen className="h-4 w-4" /> {busy ? 'Organizando…' : 'Escolher pasta'}
        </button>
        <button className="btn-ghost !py-1.5 text-sm" disabled={busy} onClick={() => zips.current?.click()}>
          <FileArchive className="h-4 w-4" /> Escolher ZIPs
        </button>
      </div>
      <input ref={folder} type="file" className="hidden" multiple {...({ webkitdirectory: '', directory: '' } as any)} onChange={(e) => run(e.target.files)} />
      <input ref={zips} type="file" className="hidden" multiple accept=".zip,.html,.htm" onChange={(e) => run(e.target.files)} />
    </Panel>
  )
}
