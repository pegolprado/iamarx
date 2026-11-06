import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Lock, ShieldCheck } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { NetworkBackground } from './NetworkBackground'

type Check = { label: string; value: string; ok: boolean | null; title: string }

/**
 * Indicadores reais (nada é afirmado sem verificar):
 * status = resposta do servidor (/api/health); ambiente seguro = contexto seguro do navegador;
 * conexão criptografada = página aberta por HTTPS (TLS); núcleo = motor local (WebAssembly + criptografia do navegador).
 */
function useChecks(): Check[] {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const r = await fetch('/api/health', { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      return r.json() as Promise<{ ok: boolean }>
    },
    retry: 1,
    refetchInterval: 60_000,
  })
  const [env] = useState(() => ({
    secure: typeof window !== 'undefined' && window.isSecureContext,
    https: typeof location !== 'undefined' && location.protocol === 'https:',
    core: typeof WebAssembly === 'object' && !!globalThis.crypto?.subtle,
  }))
  return [
    {
      label: 'SYSTEM STATUS',
      value: health.isLoading ? 'VERIFICANDO' : health.data?.ok ? 'ONLINE' : 'OFFLINE',
      ok: health.isLoading ? null : !!health.data?.ok,
      title: 'Resposta do servidor de autenticação, verificada agora.',
    },
    {
      label: 'SECURE ENVIRONMENT',
      value: env.secure ? 'VERIFIED' : 'NOT SECURE',
      ok: env.secure,
      title: 'Contexto seguro do navegador (isolamento e APIs de criptografia disponíveis).',
    },
    { label: 'ENCRYPTED CONNECTION', value: env.https ? 'TLS · HTTPS' : 'NO TLS', ok: env.https, title: 'A página foi aberta por HTTPS: o tráfego é criptografado (TLS).' },
    {
      label: 'INTELLIGENCE CORE',
      value: env.core ? 'LOCAL · READY' : 'UNAVAILABLE',
      ok: env.core,
      title: 'Motor de análise que roda no seu navegador (WebAssembly): os arquivos não saem do computador.',
    },
  ]
}

const SHORT: Record<string, string> = { 'SYSTEM STATUS': 'SYSTEM', 'SECURE ENVIRONMENT': 'SECURE ENV', 'ENCRYPTED CONNECTION': 'ENCRYPTED', 'INTELLIGENCE CORE': 'CORE' }

function StatusChip({ c, compact }: { c: Check; compact?: boolean }) {
  const color = c.ok === null ? 'bg-amber' : c.ok ? 'bg-ok' : 'bg-danger'
  return (
    <div className={clsx('flex items-center gap-2 font-mono tracking-[0.14em] whitespace-nowrap', compact ? 'text-[9.5px]' : 'text-[10.5px]')} title={c.title}>
      <span className="relative flex h-1.5 w-1.5">
        <span className={clsx('auth-dot absolute inset-0 rounded-full', color)} />
        <span className={clsx('absolute -inset-1 rounded-full opacity-30 blur-[3px]', color)} />
      </span>
      <span className="text-[#7f8bab]">{c.label}:</span>
      <span className={c.ok === false ? 'text-danger' : c.ok === null ? 'text-amber' : 'text-[#cfe0ff]'}>{c.value}</span>
    </div>
  )
}

/** Símbolo original da coruja (arquivo do projeto, sem alteração) com halo e anéis tecnológicos. */
function OwlEmblem() {
  return (
    <div className="relative mx-auto h-[92px] w-[92px] sm:h-[132px] sm:w-[132px] 2xl:h-[156px] 2xl:w-[156px] [@media(max-height:820px)]:h-[96px] [@media(max-height:820px)]:w-[96px]">
      <div className="auth-halo absolute -inset-8 rounded-full" aria-hidden="true" />
      <svg className="auth-ring absolute -inset-[14px]" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="48.5" fill="none" stroke="rgba(226,169,59,0.45)" strokeWidth="0.35" strokeDasharray="1.2 2.6" />
        <circle cx="50" cy="1.5" r="0.9" fill="#e2a93b" />
      </svg>
      <svg className="auth-ring-rev absolute -inset-[26px]" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="49" fill="none" stroke="rgba(96,165,250,0.28)" strokeWidth="0.25" strokeDasharray="18 6 2 6" />
        <circle cx="99" cy="50" r="0.8" fill="#60a5fa" />
      </svg>
      <img
        src="/icon-512.webp"
        alt="Símbolo MARX — coruja"
        width={512}
        height={512}
        className="auth-owl relative h-full w-full rounded-full object-cover ring-1 ring-[rgba(226,169,59,0.35)]"
        style={{ boxShadow: '0 0 0 6px rgba(8,13,24,0.9), 0 0 40px -6px rgba(226,169,59,0.35), inset 0 0 20px rgba(0,0,0,0.6)' }}
      />
    </div>
  )
}

/** Moldura das telas de acesso (login, recuperação, definição de senha, primeiro acesso). */
export function AuthShell({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon?: ReactNode; children: ReactNode }) {
  const checks = useChecks()
  return (
    <div className="auth-bg relative isolate flex min-h-[100dvh] flex-col overflow-hidden text-text">
      <div className="auth-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
      <div className="absolute inset-0 -z-10">
        <NetworkBackground />
      </div>

      {/* barra de status (telas médias e grandes) */}
      <header className="relative z-10 hidden items-center justify-between gap-4 border-b border-[rgba(96,140,255,0.12)] bg-[rgba(8,13,24,0.45)] px-6 py-2.5 backdrop-blur-sm md:flex">
        <div className="flex gap-6">
          <StatusChip c={checks[0]} />
          <StatusChip c={checks[1]} />
        </div>
        <div className="flex gap-6">
          <StatusChip c={checks[2]} />
          <StatusChip c={checks[3]} />
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pt-7 pb-4 sm:py-6 [@media(max-height:820px)]:py-3">
        <div className="w-full max-w-[440px]">
          <div className="mb-4 text-center sm:mb-5 [@media(max-height:820px)]:mb-3">
            <OwlEmblem />
            <h1 className="auth-in auth-in-1 mt-5 sm:mt-7 [@media(max-height:820px)]:mt-5">
              <span className="auth-wordmark block text-[30px] leading-none sm:text-[40px] [@media(max-height:820px)]:text-[32px]">
                MAR<span className="auth-gold">X</span>
              </span>
              <span className="mt-2 flex items-center justify-center gap-3 font-[family-name:var(--font-display)] text-[11px] font-semibold tracking-[0.42em] text-gold sm:text-[12px]">
                <span className="h-px w-8 bg-gradient-to-r from-transparent to-gold/70" />
                INTELLIGENCE PRO
                <span className="h-px w-8 bg-gradient-to-l from-transparent to-gold/70" />
              </span>
            </h1>
            <p className="auth-in auth-in-2 -mx-16 mt-3.5 font-[family-name:var(--font-display)] text-[12px] font-semibold tracking-[0.12em] text-[#dbe5ff] sm:text-[13.5px] [@media(max-height:820px)]:mt-3">
              <span className="block sm:inline">INTELIGÊNCIA QUE CONECTA.</span> <span className="block sm:inline">ANÁLISE QUE REVELA.</span>
            </p>
            <p className="auth-in auth-in-2 -mx-16 mt-1.5 font-mono text-[8.5px] tracking-[0.16em] text-[#6f7ea3] sm:text-[10px] sm:tracking-[0.22em]">
              DIGITAL INTELLIGENCE • DATA ANALYSIS • CYBER INVESTIGATION
            </p>
          </div>

          <section className="auth-glass auth-in auth-in-3 relative rounded-2xl p-5 sm:p-7 [@media(max-height:820px)]:py-5" aria-labelledby="auth-title">
            <span className="pointer-events-none absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-[#60a5fa] to-transparent opacity-70" aria-hidden="true" />
            <div className="mb-4 flex items-start gap-3 sm:mb-5 [@media(max-height:820px)]:mb-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[rgba(96,140,255,0.3)] bg-[rgba(37,99,235,0.12)] text-[#93c5fd]">
                {icon ?? <Lock className="h-4 w-4" />}
              </span>
              <div>
                <h2 id="auth-title" className="font-[family-name:var(--font-display)] text-[15px] font-bold tracking-[0.16em] text-white">
                  {title}
                </h2>
                {subtitle && <p className="mt-1 text-[12.5px] leading-snug text-[#8d9abb]">{subtitle}</p>}
              </div>
            </div>
            {children}
          </section>

          {/* indicadores no celular */}
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl border border-[rgba(96,140,255,0.12)] bg-[rgba(8,13,24,0.55)] px-3 py-2 md:hidden">
            {checks.map((c) => (
              <StatusChip key={c.label} c={{ ...c, label: SHORT[c.label] ?? c.label }} compact />
            ))}
          </div>
        </div>
      </main>

      <footer className="relative z-10 px-4 pb-4 text-center [@media(max-height:820px)]:pb-3">
        <div className="font-[family-name:var(--font-display)] text-[10.5px] font-bold tracking-[0.32em] text-[#aab6d3]">
          MARX INTELLIGENCE PRO <span className="mx-1.5 text-gold">·</span> <span className="font-semibold text-[#6f7ea3]">ADVANCED DIGITAL INTELLIGENCE</span>
        </div>
        <p className="mx-auto mt-1.5 flex max-w-xl items-start justify-center gap-1.5 text-[11.5px] leading-snug text-[#8d9abb]">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
          <span>Acesso restrito a usuários autorizados. Seus arquivos e consultas são processados só no seu navegador e apagados ao sair — nada fica salvo.</span>
        </p>
      </footer>
    </div>
  )
}

/** Campo das telas de acesso: ícone à esquerda, foco destacado e, para senha, botão de mostrar/ocultar. */
export function AuthField({ label, icon, hint, children, trailing }: { label: string; icon: ReactNode; hint?: ReactNode; children: ReactNode; trailing?: ReactNode }) {
  return (
    <label className="auth-field block">
      <span className="mb-1.5 block font-mono text-[10.5px] tracking-[0.16em] text-[#8d9abb] uppercase">{label}</span>
      <span className="relative block">
        <span className="auth-icon pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[#5d6a86] transition-colors [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        {children}
        {trailing && <span className="absolute top-1/2 right-2 -translate-y-1/2">{trailing}</span>}
      </span>
      {hint && <span className="mt-1 block text-xs text-[#6f7ea3]">{hint}</span>}
    </label>
  )
}
