/**
 * Leitura dos arquivos de bilhetagem do WhatsApp enviados às ferramentas INVMARX: HTML soltos,
 * ZIP (inclusive vários) ou uma pasta inteira. Também organiza os arquivos por alvo e data.
 */
import { strToU8, zipSync } from 'fflate'
import { expandZip } from './readers'
import { type BFile, fileInfo } from './waBilling'
import { looksLikeWhatsApp, parseWhatsApp } from './whatsapp'

const decode = (u8: Uint8Array) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(u8)
  } catch {
    return new TextDecoder('windows-1252').decode(u8)
  }
}

/** Todos os HTML/TXT dentro do que foi enviado (ZIPs são abertos). */
export async function htmlEntries(files: File[]): Promise<{ name: string; text: string }[]> {
  const out: { name: string; text: string }[] = []
  for (const f of files) {
    const name = (f as any).webkitRelativePath || f.name
    if (/\.zip$/i.test(f.name)) {
      for (const e of await expandZip(f)) if (/\.(html?|txt)$/i.test(e.name)) out.push({ name: `${f.name}/${e.name}`, text: decode(e.data) })
    } else if (/\.(html?|txt)$/i.test(f.name)) out.push({ name, text: decode(new Uint8Array(await f.arrayBuffer())) })
  }
  return out
}

export async function loadWaFiles(files: File[], onStatus?: (s: string) => void) {
  const entries = await htmlEntries(files)
  const ok: BFile[] = []
  const skipped: string[] = []
  for (const [i, e] of entries.entries()) {
    onStatus?.(`lendo ${i + 1} de ${entries.length}: ${e.name.split('/').pop()}`)
    if (!looksLikeWhatsApp(e.text)) {
      skipped.push(e.name)
      continue
    }
    const rec = parseWhatsApp(e.text, /<\s*(html|div|table|body)/i.test(e.text))
    if (!rec.account) skipped.push(e.name)
    else ok.push(fileInfo(e.name, rec))
    await new Promise((r) => setTimeout(r, 0))
  }
  return { files: ok, skipped }
}

/**
 * Organiza: um arquivo por alvo e data, renomeado "AAAA-MM-DD_HHMM - alvo.html", em pastas por
 * alvo, dentro de "Organizado". Devolve o ZIP para baixar.
 */
export async function organize(files: File[]) {
  const entries = await htmlEntries(files)
  const tree: Record<string, Uint8Array> = {}
  const used = new Set<string>()
  let n = 0
  const skipped: string[] = []
  for (const e of entries) {
    if (!looksLikeWhatsApp(e.text)) {
      skipped.push(e.name)
      continue
    }
    const rec = parseWhatsApp(e.text, true)
    const acc = (rec.account ?? 'sem-alvo').replace(/\D/g, '') || 'sem-alvo'
    const when = (rec.header['date range'] ?? rec.header.generated ?? '').match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/)
    const base = `${when ? `${when[1]}_${when[2]}${when[3]}` : 'sem-data'} - ${acc}`
    let path = `Organizado/${acc}/${base}.html`
    for (let i = 2; used.has(path); i++) path = `Organizado/${acc}/${base} (${i}).html`
    used.add(path)
    tree[path] = strToU8(e.text)
    n++
  }
  return { zip: zipSync(tree, { level: 6 }), count: n, targets: new Set(Object.keys(tree).map((p) => p.split('/')[1])).size, skipped }
}
