/**
 * MARX Secret — esteganografia: oculta qualquer arquivo (de qualquer tamanho) dentro de uma
 * imagem e o recupera depois. Tudo acontece no navegador, sem servidor.
 *
 * Como funciona: o conteúdo é (opcionalmente) comprimido, (opcionalmente) criptografado com
 * AES-256-GCM (chave derivada da senha por PBKDF2-SHA-256) e acrescentado ao final dos bytes da
 * imagem. A imagem continua abrindo normalmente em qualquer visualizador — os dados ficam depois
 * do fim do arquivo de imagem, invisíveis para quem só olha a foto. Um rodapé de 16 bytes no fim
 * aponta onde o conteúdo oculto começa, para a recuperação ser exata e sem ambiguidade.
 */
import { deflate, inflate } from 'fflate'

const MAGIC = new Uint8Array([0x4d, 0x41, 0x52, 0x58, 0x53, 0x54, 0x47, 0x31]) // "MARXSTG1"
const VERSION = 1
const FLAG_ENCRYPTED = 1
const FLAG_COMPRESSED = 2
const PBKDF2_ITERS = 200_000

const enc = new TextEncoder()
const dec = new TextDecoder()
const eq = (a: Uint8Array, b: Uint8Array, ai = 0) => b.every((x, i) => a[ai + i] === x)

const zip = (data: Uint8Array) => new Promise<Uint8Array>((res, rej) => deflate(data, { level: 6 }, (e, d) => (e ? rej(e) : res(d))))
const unzip = (data: Uint8Array) => new Promise<Uint8Array>((res, rej) => inflate(data, (e, d) => (e ? rej(e) : res(d))))

async function deriveKey(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password) as BufferSource, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
}

export type HideOptions = { carrier: Uint8Array; payload: Uint8Array; name: string; password?: string; compress?: boolean }

/** Oculta `payload` (com o nome do arquivo) dentro de `carrier` (bytes da imagem). Devolve a nova imagem. */
export async function hideFile({ carrier, payload, name, password, compress = true }: HideOptions): Promise<Uint8Array> {
  let flags = 0
  let data: Uint8Array = payload
  if (compress) {
    const z = await zip(data)
    // só usa a versão comprimida se de fato ficou menor
    if (z.length < data.length) {
      data = z
      flags |= FLAG_COMPRESSED
    }
  }
  let salt = new Uint8Array(0)
  let iv = new Uint8Array(0)
  if (password) {
    salt = crypto.getRandomValues(new Uint8Array(16))
    iv = crypto.getRandomValues(new Uint8Array(12))
    const key = await deriveKey(password, salt)
    data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource))
    flags |= FLAG_ENCRYPTED
  }
  const nameBytes = enc.encode(name).slice(0, 65535)
  const head = new Uint8Array(2 + salt.length + iv.length + 2 + nameBytes.length + 8)
  const dv = new DataView(head.buffer)
  let o = 0
  dv.setUint8(o++, VERSION)
  dv.setUint8(o++, flags)
  head.set(salt, o)
  o += salt.length
  head.set(iv, o)
  o += iv.length
  dv.setUint16(o, nameBytes.length, true)
  o += 2
  head.set(nameBytes, o)
  o += nameBytes.length
  dv.setBigUint64(o, BigInt(data.length), true)
  o += 8
  const bodyStart = carrier.length
  const footer = new Uint8Array(16)
  footer.set(MAGIC, 0)
  new DataView(footer.buffer).setBigUint64(8, BigInt(bodyStart), true)
  const out = new Uint8Array(carrier.length + head.length + data.length + footer.length)
  out.set(carrier, 0)
  out.set(head, bodyStart)
  out.set(data, bodyStart + head.length)
  out.set(footer, out.length - 16)
  return out
}

export type Revealed = { name: string; data: Uint8Array; encrypted: boolean; compressed: boolean }

/** Indica se a imagem tem conteúdo oculto do MARX Secret e se ele está protegido por senha. */
export function inspect(stego: Uint8Array): { ok: boolean; encrypted: boolean } {
  if (stego.length < 16 + 11 || !eq(stego, MAGIC, stego.length - 16)) return { ok: false, encrypted: false }
  const start = Number(new DataView(stego.buffer, stego.byteOffset + stego.length - 8, 8).getBigUint64(0, true))
  if (start < 0 || start + 2 > stego.length - 16) return { ok: false, encrypted: false }
  return { ok: true, encrypted: (stego[start + 1] & FLAG_ENCRYPTED) !== 0 }
}

/** Recupera o arquivo oculto. Lança erro claro se a imagem não tiver conteúdo ou a senha estiver errada. */
export async function revealFile(stego: Uint8Array, password?: string): Promise<Revealed> {
  if (stego.length < 16 || !eq(stego, MAGIC, stego.length - 16)) throw new Error('Esta imagem não contém um arquivo oculto do MARX Secret.')
  const start = Number(new DataView(stego.buffer, stego.byteOffset + stego.length - 8, 8).getBigUint64(0, true))
  if (start < 0 || start + 2 > stego.length - 16) throw new Error('Esta imagem não contém um arquivo oculto do MARX Secret.')
  const dv = new DataView(stego.buffer, stego.byteOffset)
  let o = start
  const version = dv.getUint8(o++)
  if (version !== VERSION) throw new Error('Versão do conteúdo oculto não reconhecida.')
  const flags = dv.getUint8(o++)
  const encrypted = (flags & FLAG_ENCRYPTED) !== 0
  const compressed = (flags & FLAG_COMPRESSED) !== 0
  let salt = new Uint8Array(0)
  let iv = new Uint8Array(0)
  if (encrypted) {
    salt = stego.slice(o, o + 16)
    o += 16
    iv = stego.slice(o, o + 12)
    o += 12
  }
  const nameLen = dv.getUint16(o, true)
  o += 2
  const name = dec.decode(stego.slice(o, o + nameLen))
  o += nameLen
  const dataLen = Number(dv.getBigUint64(o, true))
  o += 8
  let data: Uint8Array = stego.slice(o, o + dataLen)
  if (encrypted) {
    if (!password) throw new Error('Esta imagem está protegida por senha. Informe a senha para revelar.')
    try {
      const key = await deriveKey(password, salt)
      data = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource))
    } catch {
      throw new Error('Senha incorreta ou imagem alterada: não foi possível revelar o arquivo.')
    }
  }
  if (compressed) {
    try {
      data = await unzip(data)
    } catch {
      throw new Error('Não foi possível descomprimir o conteúdo oculto.')
    }
  }
  return { name: name || 'arquivo', data, encrypted, compressed }
}
