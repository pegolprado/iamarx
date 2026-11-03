import { strToU8, zipSync } from 'fflate'
import { readXlsx } from './xlsxRaw'

const SHEET_INLINE = (rows: string[][]) =>
  `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:T3"/><sheetData>${rows
    .map((r) => `<row>${r.map((c) => (c ? `<c t="inlineStr"><is><t>${c}</t></is></c>` : '<c s="7"/>')).join('')}</row>`)
    .join('')}</sheetData></worksheet>`

function book(sheetXml: string, extra: Record<string, string> = {}) {
  return zipSync({
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Relatório" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml),
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, strToU8(v)])),
  })
}

describe('leitor XLSX próprio', () => {
  it('lê planilha de sistema: texto inline, sem referência de célula e dimensão errada', () => {
    const rows = [
      ['Alvo:', '5511900000001'],
      ['Alvo', 'Incio', 'Célula Origem'],
      ...Array.from({ length: 50 }, (_, i) => ['5511900000001', `03/11/2026–17:09:${String(i).padStart(2, '0')}`, '724-05-28620553']),
    ]
    const x = readXlsx(book(SHEET_INLINE(rows)))
    expect(x.sheets).toEqual(['Relatório'])
    const out = [...x.rows()]
    expect(out).toHaveLength(52) // a dimensão dizia 3 linhas
    expect(out[1]).toEqual([2, ['Alvo', 'Incio', 'Célula Origem']])
    expect(out[51][1][1]).toBe('03/11/2026–17:09:49')
  })

  it('lê planilha comum: textos compartilhados, referências, células vazias e datas', () => {
    const sheet = `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="3"><c r="A3" s="1"><v>46329.5</v></c><c r="B3"><v>12.5</v></c><c r="C3" t="str"><v>a &amp; b</v></c></row></sheetData></worksheet>`
    const x = readXlsx(
      book(sheet, {
        'xl/sharedStrings.xml': '<sst><si><t>Data</t></si><si><r><t>Va</t></r><r><t>lor</t></r></si></sst>',
        'xl/styles.xml': '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="22"/></cellXfs></styleSheet>',
      }),
    )
    expect([...x.rows()]).toEqual([
      [1, ['Data', '', 'Valor']],
      [3, ['2026-11-03 12:00:00', '12.5', 'a & b']],
    ])
  })
})
