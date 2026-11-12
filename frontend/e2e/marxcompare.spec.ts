import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import zlib from 'node:zlib'
const TMP = '/tmp/claude-0/-home-user/53bc90e1-2a60-5711-8a90-820f86db5186/scratchpad/mc'
// PNG liso (sem rosto) para checar que os modelos carregam e a detecção roda de verdade
function flatPng(w: number, h: number): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0, o = 0; y < h; y++) {
    raw[o++] = 0
    for (let x = 0; x < w; x++) {
      raw[o++] = 180
      raw[o++] = 170
      raw[o++] = 160
    }
  }
  const crc = (buf: Buffer) => {
    let c = ~0
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i]
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
    }
    return ~c
  }
  const chunk = (t: string, d: Buffer) => {
    const l = Buffer.alloc(4)
    l.writeUInt32BE(d.length, 0)
    const td = Buffer.concat([Buffer.from(t), d])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(td) >>> 0, 0)
    return Buffer.concat([l, td, c])
  }
  const ih = Buffer.alloc(13)
  ih.writeUInt32BE(w, 0)
  ih.writeUInt32BE(h, 4)
  ih[8] = 8
  ih[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
test('MarxCompare: carrega os modelos e roda detecção real (imagem sem rosto é recusada)', async ({ page }) => {
  test.setTimeout(120000)
  fs.mkdirSync(TMP, { recursive: true })
  fs.writeFileSync(`${TMP}/liso.png`, flatPng(400, 400))
  await page.goto('/login')
  await page.fill('input[type=email]', 'admin@marx.local')
  await page.fill('input[type=password]', 'Teste!Marx2026')
  await page.click('form button.btn-primary')
  await expect(page.getByRole('link', { name: 'Ferramentas INVMARX' })).toBeVisible()
  await page.goto('/marxtool/compare')
  await expect(page.getByRole('heading', { name: /MarxCompare/ })).toBeVisible()
  // as duas modalidades aparecem
  await expect(page.getByRole('button', { name: /Análise de identidade/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Semelhança visual/ })).toBeVisible()
  await page.locator('input[type=file]').first().setInputFiles(`${TMP}/liso.png`)
  // os modelos carregam e a detecção roda; sem rosto, avisa (não inventa resultado)
  await expect(page.getByText(/Nenhum rosto detectado/)).toBeVisible({ timeout: 90000 })
})
