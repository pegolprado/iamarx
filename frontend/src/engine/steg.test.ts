import { hideFile, inspect, revealFile } from './steg'

const carrier = () => {
  const c = new Uint8Array(20000)
  crypto.getRandomValues(c)
  return c
}

describe('MARX Secret — esteganografia', () => {
  it('oculta e revela sem senha', async () => {
    const payload = new TextEncoder().encode('relatório confidencial '.repeat(50))
    const img = await hideFile({ carrier: carrier(), payload, name: 'alvo.txt' })
    expect(inspect(img)).toEqual({ ok: true, encrypted: false })
    const r = await revealFile(img)
    expect(r.name).toBe('alvo.txt')
    expect(new TextDecoder().decode(r.data)).toBe('relatório confidencial '.repeat(50))
  })

  it('oculta e revela com senha (AES-256-GCM)', async () => {
    const payload = crypto.getRandomValues(new Uint8Array(5000))
    const img = await hideFile({ carrier: carrier(), payload, name: 'planilha.xlsx', password: 'Alpha26.' })
    expect(inspect(img)).toEqual({ ok: true, encrypted: true })
    const r = await revealFile(img, 'Alpha26.')
    expect(r.data).toEqual(payload)
    await expect(revealFile(img, 'errada')).rejects.toThrow(/Senha incorreta/)
    await expect(revealFile(img)).rejects.toThrow(/protegida por senha/)
  })

  it('a imagem portadora continua intacta no começo do arquivo', async () => {
    const c = carrier()
    const img = await hideFile({ carrier: c, payload: new Uint8Array([1, 2, 3]), name: 'x', compress: false })
    expect(img.slice(0, c.length)).toEqual(c)
  })

  it('imagem sem conteúdo oculto é reconhecida', async () => {
    expect(inspect(carrier())).toEqual({ ok: false, encrypted: false })
    await expect(revealFile(carrier())).rejects.toThrow(/não contém/)
  })

  it('arquivo grande (2 MB) ida e volta com compressão e senha', async () => {
    const payload = new Uint8Array(2 * 1024 * 1024)
    for (let i = 0; i < payload.length; i += 65536) crypto.getRandomValues(payload.subarray(i, i + 65536))
    const img = await hideFile({ carrier: carrier(), payload, name: 'grande.zip', password: 'segredo-forte-123', compress: true })
    const r = await revealFile(img, 'segredo-forte-123')
    expect(r.data.length).toBe(payload.length)
    expect(r.data).toEqual(payload)
  }, 60000)
})
