import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import zlib from 'node:zlib'
const TMP = '/tmp/claude-0/-home-user/53bc90e1-2a60-5711-8a90-820f86db5186/scratchpad/robust'

// PNG cinza w×h com textura (gradiente + ruído), sem dependências externas
function makePng(w: number, h: number): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  let o = 0
  for (let y = 0; y < h; y++) {
    raw[o++] = 0 // filtro none
    for (let x = 0; x < w; x++) {
      let v = 110 + 80 * Math.sin(x / 35) * Math.cos(y / 50) + ((x * 7 + y * 13) % 23) - 11
      v = Math.max(0, Math.min(255, Math.round(v)))
      raw[o++] = v
      raw[o++] = v
      raw[o++] = v
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td) >>> 0, 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2 // RGB
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
function crc32(buf: Buffer) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c
}

test('modo resistente: grava, recomprime como rede social e lê de volta', async ({ page }) => {
  fs.mkdirSync(TMP, { recursive: true })
  fs.writeFileSync(`${TMP}/foto.png`, makePng(1280, 960))
  const secret = 'ALVO +5511916144379 | cofre: Alpha26. | -23.5180,-46.7810'

  await page.goto('/login')
  await page.fill('input[type=email]', 'admin@marx.local')
  await page.fill('input[type=password]', 'Teste!Marx2026')
  await page.click('form button.btn-primary')
  await expect(page.getByRole('link', { name: 'Ferramentas INVMARX' })).toBeVisible()
  await page.goto('/marxtool/secret')
  await page.getByRole('tab', { name: 'Resistente a redes sociais' }).click()
  await page.getByRole('button', { name: 'Gravar mensagem' }).click()
  await page.locator('input[type=file][accept*="image"]').setInputFiles(`${TMP}/foto.png`)
  await page.getByLabel('Mensagem a gravar').fill(secret)
  await page.getByLabel('Senha', { exact: true }).fill('Alpha26.')
  await page.getByLabel('Confirmar senha').fill('Alpha26.')
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: /Gravar e baixar foto/ }).click()
  await (await dl).saveAs(`${TMP}/stego.jpg`)

  // recomprime como o WhatsApp (JPEG q~0.6), uma e duas vezes, no próprio navegador
  const stegoBytes = [...fs.readFileSync(`${TMP}/stego.jpg`)]
  const recompressed = await page.evaluate(async (bytes) => {
    const q = async (blob: Blob, quality: number): Promise<number[]> => {
      const bmp = await createImageBitmap(blob)
      const c = document.createElement('canvas')
      c.width = bmp.width
      c.height = bmp.height
      c.getContext('2d')!.drawImage(bmp, 0, 0)
      const out: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', quality))
      return [...new Uint8Array(await out.arrayBuffer())]
    }
    const src = new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })
    const once = await q(src, 0.6)
    const twice = await q(new Blob([new Uint8Array(await q(src, 0.7))], { type: 'image/jpeg' }), 0.6)
    return { once, twice }
  }, stegoBytes)
  fs.writeFileSync(`${TMP}/once.jpg`, Buffer.from(recompressed.once))
  fs.writeFileSync(`${TMP}/twice.jpg`, Buffer.from(recompressed.twice))

  for (const f of ['once.jpg', 'twice.jpg']) {
    await page.getByRole('button', { name: 'Ler mensagem' }).click()
    await page.locator('input[type=file][accept*="image"]').setInputFiles(`${TMP}/${f}`)
    await page.getByLabel('Senha', { exact: true }).fill('Alpha26.')
    await page
      .getByRole('button', { name: /Ler mensagem/ })
      .last()
      .click()
    await expect(page.getByRole('heading', { name: 'Mensagem recuperada' })).toBeVisible({ timeout: 20000 })
    await expect(page.getByText(secret, { exact: false })).toBeVisible()
    // volta para gravar para limpar o estado da próxima iteração
    await page.getByRole('button', { name: 'Gravar mensagem' }).click()
  }
})
