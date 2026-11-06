/** Planilha Excel com várias abas, gerada no navegador e entregue como download. */
export type Sheet = { name: string; columns: string[]; rows: (string | number | null)[][] }

export async function downloadXlsx(fileName: string, sheets: Sheet[], note?: string) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MARX'
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '))
    if (note) ws.addRow([note]).font = { italic: true, color: { argb: 'FF666666' } }
    const head = ws.addRow(s.columns)
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    head.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2A44' } }))
    for (const r of s.rows) ws.addRow(r)
    s.columns.forEach((c, i) => {
      const w = Math.max(c.length, ...s.rows.slice(0, 200).map((r) => String(r[i] ?? '').length))
      ws.getColumn(i + 1).width = Math.min(60, Math.max(10, w + 2))
    })
    ws.views = [{ state: 'frozen', ySplit: note ? 2 : 1 }]
  }
  const buf = await wb.xlsx.writeBuffer()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 3000)
}
