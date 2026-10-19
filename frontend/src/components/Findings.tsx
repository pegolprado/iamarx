import clsx from 'clsx'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { apath } from '../app/layout'
import type { Finding } from '../engine/fullAnalysis'
import { Badge } from './ui'

const BAR: Record<Finding['tone'], string> = {
  red: 'border-l-danger',
  amber: 'border-l-amber',
  teal: 'border-l-teal',
  blue: 'border-l-accent',
  violet: 'border-l-violet',
  green: 'border-l-ok',
  gray: 'border-l-line-2',
}

/** Principais achados, cada um com o atalho para o resultado detalhado. */
export function Findings({ items, empty = 'Nenhum achado relevante com os dados e critérios atuais.' }: { items: Finding[]; empty?: string }) {
  if (!items.length)
    return (
      <div className="card flex items-center gap-2 p-4 text-sm text-muted">
        <CheckCircle2 className="h-4 w-4 text-ok" /> {empty}
      </div>
    )
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Principais achados">
      {items.map((f, i) => (
        <li key={i}>
          <Link to={`${apath(f.path)}${f.tab ? `?aba=${f.tab}` : ''}`} className={clsx('card card-hover group flex h-full flex-col gap-2 border-l-4 p-4', BAR[f.tone])}>
            <div className="flex items-center justify-between gap-2">
              <Badge tone={f.tone}>{f.area}</Badge>
              <ArrowRight className="h-4 w-4 text-faint group-hover:text-accent" />
            </div>
            <div className="text-sm font-semibold text-white">{f.title}</div>
            <p className="text-xs leading-relaxed text-muted">{f.detail}</p>
          </Link>
        </li>
      ))}
    </ul>
  )
}
