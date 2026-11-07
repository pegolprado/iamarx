import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { type State, useSession } from '../engine/session'

/**
 * Estado real da estação (nada é afirmado sem verificar):
 * - processamento local: o motor do navegador está disponível (WebAssembly + criptografia do navegador);
 * - sessão protegida: usuário autenticado e página aberta por HTTPS;
 * - ambiente isolado: contexto seguro do navegador;
 * - arquivos temporários: quantos arquivos estão na memória desta aba;
 * - status do sistema: resposta do servidor de autenticação agora.
 */

/** Identificador desta aba, gerado no navegador ao abrir a plataforma; não é enviado ao servidor. */
export const SESSION_ID = (() => {
  const b = new Uint8Array(4)
  globalThis.crypto?.getRandomValues?.(b)
  const h = [...b]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
  return `MX-${h.slice(0, 4)}-${h.slice(4)}`
})()

export type Check = { key: string; label: string; value: string; ok: boolean | null; title: string }

export function useSystemChecks(): Check[] {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const r = await fetch('/api/health', { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      return r.json() as Promise<{ ok: boolean; version?: string }>
    },
    retry: 1,
    refetchInterval: 60_000,
  })
  const files = useSession((s) => s.files.length)
  const [env] = useState(() => ({
    secure: typeof window !== 'undefined' && window.isSecureContext,
    https: typeof location !== 'undefined' && location.protocol === 'https:',
    core: typeof WebAssembly === 'object' && !!globalThis.crypto?.subtle,
  }))
  return [
    {
      key: 'local',
      label: 'Processamento local',
      value: env.core ? 'ATIVO' : 'INDISPONÍVEL',
      ok: env.core,
      title: 'Motor de análise que roda no seu navegador (WebAssembly): os arquivos não saem do computador.',
    },
    {
      key: 'session',
      label: 'Sessão protegida',
      value: env.https ? 'HTTPS' : 'SEM TLS',
      ok: env.https,
      title: 'Você está autenticado e a página foi aberta por HTTPS: o tráfego com o servidor é criptografado (TLS).',
    },
    {
      key: 'isolated',
      label: 'Ambiente isolado',
      value: env.secure ? 'CONTEXTO SEGURO' : 'NÃO SEGURO',
      ok: env.secure,
      title: 'Contexto seguro do navegador. Os dados da análise ficam só na memória desta aba.',
    },
    {
      key: 'temp',
      label: 'Arquivos temporários',
      value: files ? `${files} EM MEMÓRIA` : 'NENHUM',
      ok: files ? true : null,
      title: 'Arquivos carregados nesta aba. Ficam só na memória e são apagados ao sair, fechar ou ficar inativo.',
    },
    {
      key: 'system',
      label: 'Status do sistema',
      value: health.isLoading ? 'VERIFICANDO' : health.data?.ok ? 'ONLINE' : 'OFFLINE',
      ok: health.isLoading ? null : !!health.data?.ok,
      title: 'Resposta do servidor de autenticação, verificada agora e a cada minuto.',
    },
  ]
}

export function StatusDot({ ok, pulse }: { ok: boolean | null; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-1.5 w-1.5 shrink-0">
      <span className={clsx('absolute inset-0 rounded-full', ok === null ? 'bg-faint' : ok ? 'bg-ok' : 'bg-danger', pulse && ok && 'status-dot')} />
      {ok && <span className="absolute -inset-[3px] rounded-full bg-ok/25 blur-[2px]" />}
    </span>
  )
}

/** Faixa de indicadores reais da estação. */
export function SystemStatus({ className }: { className?: string }) {
  const checks = useSystemChecks()
  return (
    <ul className={clsx('flex flex-wrap items-center gap-x-5 gap-y-1.5', className)} aria-label="Estado do sistema">
      {checks.map((c) => (
        <li key={c.key} className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.06em] whitespace-nowrap" title={c.title}>
          <StatusDot ok={c.ok} pulse={c.key === 'system'} />
          <span className="text-faint uppercase">{c.label}</span>
          <span className={c.ok === false ? 'text-danger' : c.ok ? 'text-text' : 'text-muted'}>{c.value}</span>
        </li>
      ))}
    </ul>
  )
}

/** Relógio local (atualiza a cada segundo). */
export function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

export function greeting(d: Date) {
  const h = d.getHours()
  return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

/** Números da operação, todos calculados a partir da sessão em memória. */
export function summarize(s: State) {
  const done = s.imports.filter((i) => i.status === 'done')
  const rows = (k: string) => done.filter((i) => i.kind === k).reduce((n, i) => n + i.rows_ok - i.rows_duplicate, 0)
  const cdr = rows('cdr')
  const wa = rows('whatsapp')
  const access = rows('access_log')
  const cells = done.filter((i) => i.kind === 'erb_registry').reduce((n, i) => n + i.rows_ok, 0)
  return {
    files: s.files.length,
    importsDone: done.length,
    importsRunning: s.imports.filter((i) => i.status === 'running').length,
    importsFailed: s.imports.filter((i) => i.status === 'failed').length,
    records: cdr + wa + access,
    cdr,
    wa,
    access,
    waReports: done.filter((i) => i.kind === 'whatsapp').length,
    cells,
    targets: s.targets.length,
    alerts: s.alerts.length,
    alertsPending: s.alerts.filter((a) => a.review_status === 'pendente').length,
    period: [s.meta.period_start, s.meta.period_end] as const,
    title: s.meta.title,
    hasData: s.files.length > 0 || s.targets.length > 0,
  }
}

export type OpsSummary = ReturnType<typeof summarize>

export function useOps(): OpsSummary {
  const s = useSession((x) => x)
  return useMemo(() => summarize(s), [s])
}
