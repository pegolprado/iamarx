import { useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Fingerprint, KeyRound, Loader2, Lock, LogIn, Mail, ShieldCheck, User, UserPlus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { AuthField, AuthShell } from '../components/auth/AuthShell'
import { ErrorBox, Notice } from '../components/ui'
import { assertStrong, deriveKey, deriveWithSalt } from '../lib/passkey'

function AuthCard({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <AuthShell title={title} subtitle={subtitle} icon={icon}>
      {children}
    </AuthShell>
  )
}

/** Senha com botão de mostrar/ocultar. */
function PasswordInput({ value, onChange, autoComplete, placeholder }: { value: string; onChange: (v: string) => void; autoComplete: string; placeholder?: string }) {
  const [show, setShow] = useState(false)
  return (
    <>
      <input
        className="auth-input"
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        required
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="absolute top-1/2 right-2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#6f7ea3] transition-colors hover:bg-white/5 hover:text-[#cfe0ff]"
        onClick={() => setShow(!show)}
        aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={show}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [mfa, setMfa] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const next = sp.get('next') || '/'
  const setup = useQuery({ queryKey: ['setup'], queryFn: () => api<{ needed: boolean }>('/setup'), retry: false })
  useEffect(() => {
    if (setup.data?.needed) navigate('/primeiro-acesso', { replace: true })
  }, [setup.data, navigate])
  const finish = async () => {
    await qc.invalidateQueries({ queryKey: ['me'] })
    navigate(next.startsWith('/') ? next : '/')
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      if (!mfa) {
        const key = await deriveKey(email, password)
        const r = await api('/auth/login', { body: { email, key } })
        if (r.mfa_required) setMfa(true)
        else await finish()
      } else {
        await api('/auth/mfa', { body: { code } })
        await finish()
      }
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <AuthCard
      title={mfa ? 'VERIFICAÇÃO EM DUAS ETAPAS' : 'ACESSO AO SISTEMA'}
      subtitle={mfa ? 'Digite o código do seu aplicativo autenticador para concluir o acesso.' : 'Autenticação necessária para acessar a plataforma de análises.'}
      icon={mfa ? <ShieldCheck className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
    >
      <form onSubmit={submit} className="space-y-3 sm:space-y-4 [@media(max-height:820px)]:space-y-3" aria-busy={busy}>
        {!mfa ? (
          <>
            <AuthField label="E-mail" icon={<Mail />}>
              <input
                className="auth-input"
                type="email"
                autoComplete="username"
                required
                autoFocus
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </AuthField>
            <AuthField label="Senha" icon={<KeyRound />}>
              <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" placeholder="••••••••••••" />
            </AuthField>
          </>
        ) : (
          <AuthField label="Código do aplicativo autenticador" icon={<ShieldCheck />} hint="Seis dígitos exibidos no aplicativo (Google Authenticator, Authy, etc.)">
            <input
              className="auth-input text-center font-mono text-xl tracking-[0.5em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </AuthField>
        )}
        {err ? <ErrorBox error={err} /> : null}
        <button className="btn-primary auth-btn w-full !py-3 text-[13px] [@media(max-height:820px)]:!py-2.5" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mfa ? <ShieldCheck className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
          {busy ? 'VERIFICANDO CREDENCIAIS…' : mfa ? 'CONFIRMAR CÓDIGO' : 'ENTRAR NO SISTEMA'}
        </button>
        <div className="flex items-center justify-between gap-3 pt-1 text-[12px]">
          {!mfa ? (
            <Link to="/esqueci-senha" className="text-[#93c5fd] hover:text-white hover:underline">
              Esqueci minha senha
            </Link>
          ) : (
            <button type="button" className="text-[#93c5fd] hover:text-white hover:underline" onClick={() => (setMfa(false), setCode(''))}>
              Voltar
            </button>
          )}
          <span
            className="flex items-center gap-1.5 text-[#6f7ea3]"
            title="A senha é transformada no seu navegador (PBKDF2-SHA256, 600 mil iterações) antes de ser enviada: o servidor nunca recebe a senha."
          >
            <Fingerprint className="h-3.5 w-3.5 text-ok" />
            <span>
              Senha protegida<span className="hidden sm:inline">&nbsp;no navegador</span>
            </span>
          </span>
        </div>
        {!mfa && (
          <div className="border-t border-[rgba(96,140,255,0.14)] pt-3 text-center text-[12.5px] text-[#8d9abb]">
            Não tem acesso?{' '}
            <Link to="/cadastro" className="font-semibold text-gold hover:text-[#f7d27a] hover:underline">
              Solicitar cadastro
            </Link>
          </div>
        )}
      </form>
    </AuthCard>
  )
}

/** Cadastro pela própria pessoa: qualquer e-mail válido; o acesso é liberado pelo administrador. */
export function Register() {
  const [f, setF] = useState({ name: '', email: '', p1: '', p2: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  return (
    <AuthCard title="SOLICITAR CADASTRO" subtitle="Preencha os dados; o acesso é liberado pelo administrador." icon={<UserPlus className="h-4 w-4" />}>
      {done ? (
        <div className="space-y-4">
          <Notice tone="green" title="Cadastro enviado">
            Assim que o administrador liberar o seu acesso, entre com o e-mail <b>{f.email}</b> e a senha que você criou.
          </Notice>
          <Link to="/login" className="btn-primary auth-btn w-full !py-3">
            Ir para o login
          </Link>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            setErr(null)
            try {
              if (f.p1 !== f.p2) throw new Error('As senhas não conferem')
              assertStrong(f.p1)
              setBusy(true)
              const key = await deriveKey(f.email, f.p1)
              await api('/auth/register', { body: { name: f.name, email: f.email, key } })
              setDone(true)
            } catch (e) {
              setErr(e)
            } finally {
              setBusy(false)
            }
          }}
        >
          <AuthField label="Nome completo" icon={<User />}>
            <input className="auth-input" autoComplete="name" required maxLength={200} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </AuthField>
          <AuthField label="E-mail" icon={<Mail />}>
            <input
              className="auth-input"
              type="email"
              autoComplete="username"
              required
              placeholder="seu@email.com"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
          </AuthField>
          <AuthField label="Senha" icon={<KeyRound />} hint="Mínimo de 12 caracteres, com letras e números.">
            <PasswordInput value={f.p1} onChange={(v) => setF({ ...f, p1: v })} autoComplete="new-password" />
          </AuthField>
          <AuthField label="Repita a senha" icon={<KeyRound />}>
            <PasswordInput value={f.p2} onChange={(v) => setF({ ...f, p2: v })} autoComplete="new-password" />
          </AuthField>
          {err ? <ErrorBox error={err} /> : null}
          <button className="btn-primary auth-btn w-full !py-3" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} {busy ? 'PROTEGENDO A SENHA…' : 'ENVIAR CADASTRO'}
          </button>
          <div className="text-center text-[12px]">
            <Link to="/login" className="text-[#93c5fd] hover:text-white hover:underline">
              Já tenho acesso — voltar ao login
            </Link>
          </div>
        </form>
      )}
    </AuthCard>
  )
}

export function ForgotPassword() {
  return (
    <AuthCard title="RECUPERAR ACESSO" subtitle="A redefinição de senha é feita pelo administrador." icon={<KeyRound className="h-4 w-4" />}>
      <div className="space-y-4">
        <Notice>
          Por segurança, a redefinição de senha é feita pelo administrador do MARX: peça a ele um <b>link de redefinição</b> (válido por 24 horas e de uso único). Ao abrir o link,
          você define a nova senha.
        </Notice>
        <div className="text-center">
          <Link to="/login" className="text-sm text-accent hover:underline">
            Voltar ao login
          </Link>
        </div>
      </div>
    </AuthCard>
  )
}

export function ResetPassword() {
  const [sp] = useSearchParams()
  const token = sp.get('token') ?? ''
  const info = useQuery({
    queryKey: ['reset-info', token],
    queryFn: () => api<{ email: string; name: string; salt: string; iterations: number }>('/auth/password/reset-info', { body: { token } }),
    retry: false,
  })
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  return (
    <AuthCard title="DEFINIR SENHA" subtitle="Crie uma senha forte para o seu acesso." icon={<KeyRound className="h-4 w-4" />}>
      {info.error ? (
        <ErrorBox error={info.error} />
      ) : done ? (
        <div className="space-y-4">
          <Notice tone="green">Senha definida. Sessões anteriores foram encerradas.</Notice>
          <Link to="/login" className="btn-primary w-full">
            Ir para o login
          </Link>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setErr(null)
            try {
              if (p1 !== p2) throw new Error('As senhas não conferem')
              assertStrong(p1)
              setBusy(true)
              const key = await deriveWithSalt(p1, info.data!.salt, info.data!.iterations)
              await api('/auth/password/reset', { body: { token, key } })
              setDone(true)
            } catch (e) {
              setErr(e)
            } finally {
              setBusy(false)
            }
          }}
        >
          {info.data && (
            <p className="text-sm text-muted">
              {info.data.name} · <span className="font-mono">{info.data.email}</span>
            </p>
          )}
          <AuthField label="Nova senha" icon={<KeyRound />} hint="Mínimo de 12 caracteres, com letras e números.">
            <PasswordInput value={p1} onChange={setP1} autoComplete="new-password" />
          </AuthField>
          <AuthField label="Repita a senha" icon={<KeyRound />}>
            <PasswordInput value={p2} onChange={setP2} autoComplete="new-password" />
          </AuthField>
          {err ? <ErrorBox error={err} /> : null}
          <button className="btn-primary auth-btn w-full !py-3" disabled={busy || !info.data}>
            {busy ? 'Protegendo a senha…' : 'Salvar senha'}
          </button>
        </form>
      )}
    </AuthCard>
  )
}

/** Primeiro acesso: cria o administrador inicial usando o código SETUP_TOKEN definido no painel. */
export function FirstSetup() {
  const navigate = useNavigate()
  const [f, setF] = useState({ token: '', name: '', email: '', p1: '', p2: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const st = useQuery({ queryKey: ['setup'], queryFn: () => api<{ needed: boolean; token_configured: boolean }>('/setup'), retry: false })
  if (st.data && !st.data.needed)
    return (
      <AuthCard title="PRIMEIRO ACESSO">
        <Notice tone="green">O sistema já está configurado.</Notice>
        <Link to="/login" className="btn-primary mt-4 w-full">
          Ir para o login
        </Link>
      </AuthCard>
    )
  return (
    <AuthCard title="PRIMEIRO ACESSO" subtitle="Crie o administrador inicial do sistema." icon={<ShieldCheck className="h-4 w-4" />}>
      {st.data && !st.data.token_configured && (
        <div className="mb-4">
          <Notice tone="amber">
            Defina a variável <b>SETUP_TOKEN</b> no painel da Cloudflare (Settings → Variables) e publique de novo.
          </Notice>
        </div>
      )}
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          setErr(null)
          try {
            if (f.p1 !== f.p2) throw new Error('As senhas não conferem')
            assertStrong(f.p1)
            setBusy(true)
            const key = await deriveKey(f.email, f.p1)
            await api('/setup', { body: { token: f.token, name: f.name, email: f.email, key } })
            navigate('/login', { replace: true })
          } catch (e) {
            setErr(e)
          } finally {
            setBusy(false)
          }
        }}
      >
        <AuthField label="Código de configuração (SETUP_TOKEN)" icon={<ShieldCheck />}>
          <input className="auth-input font-mono" type="password" required value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} />
        </AuthField>
        <AuthField label="Seu nome" icon={<User />}>
          <input className="auth-input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </AuthField>
        <AuthField label="E-mail" icon={<Mail />}>
          <input className="auth-input" type="email" autoComplete="username" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </AuthField>
        <AuthField label="Senha" icon={<KeyRound />} hint="Mínimo de 12 caracteres, com letras e números.">
          <PasswordInput value={f.p1} onChange={(v) => setF({ ...f, p1: v })} autoComplete="new-password" />
        </AuthField>
        <AuthField label="Repita a senha" icon={<KeyRound />}>
          <PasswordInput value={f.p2} onChange={(v) => setF({ ...f, p2: v })} autoComplete="new-password" />
        </AuthField>
        {err ? <ErrorBox error={err} /> : null}
        <button className="btn-primary auth-btn w-full !py-3" disabled={busy}>
          {busy ? 'Criando…' : 'Criar administrador'}
        </button>
      </form>
    </AuthCard>
  )
}
