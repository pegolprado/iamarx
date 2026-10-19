import type { ResultColumn } from './ResultTable'
import { Badge, Num } from './ui'
import { fmtDateTime, fmtInt, fmtNumber, fmtNumberPlain } from '../lib/format'

/** Colunas reutilizáveis: na tela respeitam "ocultar números"; na exportação saem completas. */
export const num = (key: string, label: string): ResultColumn => ({ key, label, fmt: (v) => fmtNumberPlain(v), render: (r) => <Num n={r[key]} /> })
export const date = (key: string, label: string): ResultColumn => ({
  key,
  label,
  fmt: (v) => fmtDateTime(v),
  render: (r) => <span className="text-xs whitespace-nowrap">{fmtDateTime(r[key])}</span>,
})
export const int = (key: string, label: string): ResultColumn => ({ key, label, right: true, render: (r) => fmtInt(r[key]) })
export const nums = (key: string, label: string): ResultColumn => ({
  key,
  label,
  fmt: (v) => (v ?? []).map((x: string) => fmtNumberPlain(x)).join(', '),
  render: (r) => <span className="text-xs">{(r[key] ?? []).map((x: string) => fmtNumber(x)).join(', ')}</span>,
})

export const IP_PAIR_COLS: ResultColumn[] = [
  {
    key: 'acc1',
    label: 'Fonte 1',
    fmt: (v, r) => `${fmtNumberPlain(v)} · ${r.src1}`,
    render: (r) => (
      <span className="text-xs">
        <Num n={r.acc1} /> <Badge>{r.src1}</Badge>
      </span>
    ),
  },
  {
    key: 'acc2',
    label: 'Fonte 2',
    fmt: (v, r) => `${fmtNumberPlain(v)} · ${r.src2}`,
    render: (r) => (
      <span className="text-xs">
        <Num n={r.acc2} /> <Badge>{r.src2}</Badge>
      </span>
    ),
  },
  { key: 'forte', label: 'Fortes', right: true, render: (r) => (r.forte ? <Badge tone="red">{fmtInt(r.forte)}</Badge> : '0') },
  { key: 'media', label: 'Médias', right: true, render: (r) => fmtInt(r.media) },
  { key: 'fraca', label: 'Fracas', right: true, render: (r) => fmtInt(r.fraca) },
  { key: 'ips', label: 'IPs', right: true },
  {
    key: 'ip_list',
    label: 'Endereços',
    fmt: (v) => (v ?? []).join(', '),
    render: (r) => (
      <span className="font-mono text-[11px]">
        {(r.ip_list ?? []).slice(0, 3).join(', ')}
        {r.ip_list?.length > 3 ? '…' : ''}
      </span>
    ),
  },
  { key: 'min_delta_s', label: 'Menor diferença (s)', right: true },
  date('first_match', 'Primeira'),
  date('last_match', 'Última'),
  { key: 'same_account', label: 'Mesma conta', fmt: (v) => (v ? 'sim' : 'não') },
]
