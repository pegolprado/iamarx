import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

/** Paleta categórica validada (tema escuro, superfície #101B26; verde fica reservado a estado): ordem fixa, nunca reciclada. */
export const SERIES = ['#159FBC', '#BA7F2D', '#8A7BE6', '#D35F78', '#5C8FE0']
const AXIS = { stroke: '#64778A', fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', tickLine: false, axisLine: false } as const
const GRID = 'rgba(95, 150, 180, 0.1)'

function Tip({ active, payload, label, labelFmt }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line-2 bg-panel-2 px-3 py-2 text-[12px] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]">
      <div className="mb-1 font-mono text-[11px] text-muted tabular-nums">{labelFmt ? labelFmt(label) : label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-text">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
          {p.name}: <b className="tabular-nums">{Number(p.value).toLocaleString('pt-BR')}</b>
        </div>
      ))}
    </div>
  )
}

export type Series = { key: string; name: string }

/** Barras (verticais) com tooltip; >1 série = empilhadas com legenda. Inclui alternância para tabela. */
export function BarsChart({
  data,
  x,
  series,
  height = 240,
  xFmt,
  onBarClick,
  title,
}: {
  data: any[]
  x: string
  series: Series[]
  height?: number
  xFmt?: (v: any) => string
  onBarClick?: (row: any) => void
  title?: string
}) {
  const [table, setTable] = useState(false)
  return (
    <figure className="card overflow-hidden">
      <div className="panel-head justify-between">
        {title ? <figcaption>{title}</figcaption> : <span />}
        <button className="font-mono text-[10.5px] tracking-[0.06em] text-faint uppercase hover:text-accent" onClick={() => setTable(!table)}>
          {table ? 'ver gráfico' : 'ver tabela'}
        </button>
      </div>
      <div className="p-4">
        {table ? (
          <div className="max-h-72 overflow-auto">
            <table>
              <thead>
                <tr>
                  <th>{x}</th>
                  {series.map((s) => (
                    <th key={s.key} className="text-right">
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono text-xs">{xFmt ? xFmt(r[x]) : r[x]}</td>
                    {series.map((s) => (
                      <td key={s.key} className="text-right tabular-nums">
                        {(r[s.key] ?? 0).toLocaleString('pt-BR')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -12 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="0" />
                <XAxis dataKey={x} {...AXIS} tickFormatter={xFmt} minTickGap={8} />
                <YAxis {...AXIS} allowDecimals={false} width={44} />
                <Tooltip content={<Tip labelFmt={xFmt} />} cursor={{ fill: 'rgba(0,217,245,0.06)' }} />
                {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11.5, color: '#9aaaba' }} iconType="square" iconSize={8} />}
                {series.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.name}
                    stackId={series.length > 1 ? 'a' : undefined}
                    fill={SERIES[i]}
                    stroke="#101b26"
                    strokeWidth={series.length > 1 ? 2 : 0}
                    animationDuration={650}
                    animationEasing="ease-out"
                    radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                    maxBarSize={36}
                    onClick={onBarClick ? (d: any) => onBarClick(d.payload ?? d) : undefined}
                    cursor={onBarClick ? 'pointer' : undefined}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </figure>
  )
}
