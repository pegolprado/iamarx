import clsx from 'clsx'
import { type ReactNode, useState } from 'react'
import type { Column } from '../engine/exporter'
import { ExportButtons } from './Export'
import { Criteria } from './ui'

export type ResultColumn = Column & { render?: (row: any) => ReactNode; right?: boolean }

/**
 * Tabela de resultado com exportação (Excel, PDF, CSV) e critérios.
 * `fmt` de cada coluna gera o texto da exportação (sempre completo, sem ocultar números);
 * `render` é o que aparece na tela.
 */
export function ResultTable({
  title,
  subtitle,
  columns,
  rows,
  criteria,
  empty = 'Nenhum resultado com os critérios atuais.',
  pageSize = 50,
  intro,
}: {
  title: string
  subtitle?: string
  columns: ResultColumn[]
  rows: any[]
  criteria?: Record<string, any>
  empty?: string
  pageSize?: number
  intro?: ReactNode
}) {
  const [shown, setShown] = useState(pageSize)
  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-mono text-sm font-bold text-white">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {rows.length > 0 && <ExportButtons build={() => ({ title, subtitle, columns, rows, criteria })} />}
      </div>
      {intro}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-faint">{empty}</p>
      ) : (
        <>
          <div className="scroll-x max-h-[560px] overflow-y-auto rounded-lg border border-line">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className={clsx(c.right && 'text-right')}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, shown).map((r, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.key} className={clsx(c.right && 'text-right tabular-nums')}>
                        {c.render ? c.render(r) : c.fmt ? c.fmt(r[c.key], r) : (r[c.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > shown && (
            <button className="btn-ghost mt-3 !py-1 text-xs" onClick={() => setShown((n) => n + pageSize * 4)}>
              Mostrar mais ({(rows.length - shown).toLocaleString('pt-BR')} restantes)
            </button>
          )}
        </>
      )}
      {criteria && <Criteria criteria={criteria} />}
    </section>
  )
}
