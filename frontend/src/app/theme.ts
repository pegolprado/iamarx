import { useEffect, useSyncExternalStore } from 'react'

/**
 * Tema da interface: escuro, claro ou automático (segue o sistema).
 * A preferência fica num cookie simples ("marx_tema"), sem nenhum dado da análise; assim ela
 * sobrevive ao "Sair e apagar", que limpa a memória e o armazenamento do navegador.
 */
export type ThemePref = 'dark' | 'light' | 'auto'
const COOKIE = 'marx_tema'
const listeners = new Set<() => void>()

function read(): ThemePref {
  const m = typeof document !== 'undefined' ? document.cookie.match(/(?:^|;\s*)marx_tema=(dark|light|auto)/) : null
  return (m?.[1] as ThemePref) ?? 'dark'
}
let pref: ThemePref = read()

export function setThemePref(p: ThemePref) {
  pref = p
  document.cookie = `${COOKIE}=${p}; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  listeners.forEach((l) => l())
}

const media = () => window.matchMedia?.('(prefers-color-scheme: light)')

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => pref,
  )
}

function useSystemLight() {
  return useSyncExternalStore(
    (l) => {
      const m = media()
      m?.addEventListener('change', l)
      return () => m?.removeEventListener('change', l)
    },
    () => !!media()?.matches,
  )
}

/** Tema efetivo ('dark' | 'light'), aplicado ao documento enquanto a plataforma está aberta. */
export function useAppliedTheme(): 'dark' | 'light' {
  const p = useThemePref()
  const sysLight = useSystemLight()
  const resolved = p === 'auto' ? (sysLight ? 'light' : 'dark') : p
  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    return () => {
      // telas de acesso e mapa compartilhado são sempre escuras
      document.documentElement.dataset.theme = 'dark'
    }
  }, [resolved])
  return resolved
}
