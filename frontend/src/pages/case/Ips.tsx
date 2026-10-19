import { useQuery } from '@tanstack/react-query'
import { Globe, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apath } from '../../app/layout'
import { date, int, IP_PAIR_COLS, num } from '../../components/columns'
import { FilterBar } from '../../components/FilterBar'
import { ResultTable } from '../../components/ResultTable'
import { Badge, Empty, ErrorBox, Field, Loading, Notice, PageHeader, Stat } from '../../components/ui'
import { ipCorrelation, STRENGTH } from '../../engine/accessLog'
import { fmtInt } from '../../lib/format'
import { useUrlFilter } from '../../lib/useUrlFilter'

const TONE: Record<string, any> = { forte: 'red', media: 'amber', fraca: 'gray' }
const LABEL: Record<string, string> = { forte: 'forte', media: 'média', fraca: 'fraca' }

/**
 * Logs de acesso e correlação de IPs: junta os IPs de todas as fontes carregadas (WhatsApp,
 * logs de acesso do Google/Meta/provedores e sessões de dados das operadoras) e aponta onde
 * contas ou serviços diferentes usaram o mesmo IP no mesmo período.
 */
export default function Ips() {
  const [f, setF] = useUrlFilter()
  const [windowS, setWindowS] = useState(1800)
  const q = useQuery({ queryKey: ['ip-correlation', f, windowS], queryFn: () => ipCorrelation(f, windowS) })
  const d = q.data
  return (
    <div>
      <PageHeader
        icon={<Globe className="h-5 w-5" />}
        title="Logs de acesso e correlação de IPs"
        subtitle="Cruza os IPs de todas as fontes carregadas — WhatsApp Records, logs de acesso (Google, Instagram, Facebook, Apple, provedores…) e sessões de dados das operadoras — para identificar um mesmo usuário ou confirmar uso compartilhado entre serviços."
        actions={
          <Link to={apath('arquivos')} className="btn-ghost text-xs">
            <Upload className="h-4 w-4" /> Carregar log de acesso
          </Link>
        }
      />
      <FilterBar value={f} onChange={setF} compact />
      <div className="card mb-4 flex flex-wrap items-end gap-4 p-4">
        <Field label="Janela de tempo" hint="uso do mesmo IP por duas fontes dentro deste intervalo">
          <select value={windowS} onChange={(e) => setWindowS(+e.target.value)}>
            {[
              [300, '5 min'],
              [900, '15 min'],
              [1800, '30 min'],
              [3600, '1 hora'],
              [10800, '3 horas'],
              [21600, '6 horas'],
              [86400, '24 horas'],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex flex-wrap gap-2 pb-2 text-xs">
          {Object.entries(STRENGTH).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5">
              <Badge tone={TONE[k]}>{LABEL[k]}</Badge>
              <span className="text-muted">{v}</span>
            </span>
          ))}
        </div>
      </div>
      {q.isLoading ? (
        <Loading label="Cruzando os IPs de todas as fontes…" />
      ) : q.error ? (
        <ErrorBox error={q.error} onRetry={() => q.refetch()} />
      ) : !d || d.sources.length === 0 ? (
        <Empty title="Nenhum IP nos arquivos carregados" icon={<Globe className="h-6 w-6" />}>
          Em{' '}
          <Link className="text-accent hover:underline" to={apath('arquivos')}>
            Arquivos
          </Link>
          , escolha o tipo <b>Log de acesso (IP)</b> e carregue a planilha ou o HTML do provedor; o WhatsApp Records e as sessões de dados da bilhetagem entram automaticamente.
        </Empty>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Fontes de IP" value={fmtInt(d.sources.length)} hint="conta + serviço" />
            <Stat
              label="Pares com coincidência forte"
              value={fmtInt(d.pairs.filter((p: any) => p.forte).length)}
              tone={d.pairs.some((p: any) => p.forte) ? 'red' : undefined}
              hint="mesmo IP e porta, ou IPv6"
            />
            <Stat label="Pares com o mesmo IP" value={fmtInt(d.pairs.length)} hint="no mesmo período" />
            <Stat label="Coincidências" value={`${fmtInt(d.items.length)}${d.truncated ? '+' : ''}`} hint="registros pareados" />
          </div>
          <ResultTable
            title="Pares de fontes com o mesmo IP"
            subtitle="Do mais ao menos forte. A mesma conta em serviços diferentes confirma uso compartilhado; contas diferentes com coincidência forte indicam possível mesmo usuário."
            columns={IP_PAIR_COLS}
            rows={d.pairs}
            criteria={d.criteria}
            empty="Nenhum IP usado por duas fontes dentro da janela. Aumente a janela ou carregue mais fontes."
          />
          <ResultTable
            title="Coincidências detalhadas"
            columns={[
              { key: 'strength', label: 'Força', fmt: (v) => LABEL[v], render: (r) => <Badge tone={TONE[r.strength]}>{LABEL[r.strength]}</Badge> },
              { key: 'ip', label: 'IP', render: (r) => <span className="font-mono text-xs">{r.ip}</span> },
              num('acc1', 'Conta 1'),
              { key: 'src1', label: 'Serviço 1' },
              date('ts1', 'Horário 1'),
              { key: 'port1', label: 'Porta 1', fmt: (v) => v ?? '' },
              num('acc2', 'Conta 2'),
              { key: 'src2', label: 'Serviço 2' },
              date('ts2', 'Horário 2'),
              { key: 'port2', label: 'Porta 2', fmt: (v) => v ?? '' },
              int('delta_s', 'Diferença (s)'),
            ]}
            rows={d.items}
            criteria={d.criteria}
          />
          <ResultTable
            title="Fontes de IP carregadas"
            columns={[
              num('acc', 'Conta'),
              { key: 'src', label: 'Serviço' },
              int('events', 'Registros'),
              int('ips', 'IPs distintos'),
              int('with_port', 'Com porta'),
              date('first_event', 'Primeiro'),
              date('last_event', 'Último'),
            ]}
            rows={d.sources}
          />
          <Notice tone="amber">
            IPv4 de operadoras móveis é compartilhado por muitos clientes (CGNAT). Sem a porta lógica, o mesmo IP indica apenas a mesma rede. Para confirmar a autoria, solicite ao
            provedor o titular do IP com porta e data/hora exatas (com fuso).
          </Notice>
        </div>
      )}
    </div>
  )
}
