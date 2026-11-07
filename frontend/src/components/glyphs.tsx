import type { SVGProps } from 'react'

/**
 * Ícones próprios do MARX (traço fino, geometria técnica). Seguem o tamanho e a cor do texto
 * (currentColor) como os ícones da biblioteca, para combinar com o resto da interface.
 */
function G({ children, ...p }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      {children}
    </svg>
  )
}

/** Análise atual — retícula de alvo. */
export const GTarget = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    <circle cx="12" cy="12" r=".6" fill="currentColor" />
  </G>
)
/** Importação — camadas recebendo dados. */
export const GIngest = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <path d="M12 3v8M8.5 7.5 12 11l3.5-3.5" />
    <path d="M4 13.5 12 17l8-3.5" />
    <path d="M4 17.5 12 21l8-3.5" opacity=".55" />
  </G>
)
/** Análise completa — núcleo hexagonal consolidando nós. */
export const GCore = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4z" />
    <circle cx="12" cy="12" r="2.2" />
    <path d="M12 9.8V5.6M13.9 13.1l3.6 2.1M10.1 13.1l-3.6 2.1" opacity=".7" />
  </G>
)
/** Bilhetagem e padrões — sinal/forma de onda. */
export const GSignal = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <path d="M2.5 12h3l2-5 3 10 3-13 3 11 2-3h4" />
  </G>
)
/** Vínculos — grafo de nós. */
export const GGraph = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <circle cx="6" cy="6.5" r="2.2" />
    <circle cx="18" cy="5.5" r="1.8" />
    <circle cx="16.5" cy="17.5" r="2.4" />
    <circle cx="5.5" cy="17" r="1.6" />
    <path d="m8.1 7.1 7.9 4.6M7.9 5.9l8.3-.3M17.8 7.3l-.9 7.8M8 7.9l-1.9 7.5M7.1 17.1l7 .4" />
  </G>
)
/** WhatsApp e IPs — mensagem com rede. */
export const GComms = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <path d="M4 5.5h16v10.5h-9l-4.5 3.5V16H4z" />
    <circle cx="8.5" cy="10.8" r="1" />
    <circle cx="15.5" cy="10.8" r="1" />
    <path d="M9.5 10.8h5" opacity=".7" />
  </G>
)
/** Localização (ERB) — torre com ondas. */
export const GTower = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <path d="M12 10.5 8.5 21M12 10.5 15.5 21M9.6 17.5h4.8" />
    <circle cx="12" cy="9" r="1.5" />
    <path d="M8.3 5.3a5.2 5.2 0 0 0 0 7.4M15.7 5.3a5.2 5.2 0 0 1 0 7.4" />
    <path d="M5.5 2.8a9 9 0 0 0 0 12.4M18.5 2.8a9 9 0 0 1 0 12.4" opacity=".55" />
  </G>
)
/** Alertas e relatórios — documento com barras e marca de alerta. */
export const GReport = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <path d="M6 2.8h8.5L19 7.3v13.9H6z" />
    <path d="M14.5 2.8v4.5H19" />
    <path d="M9 17.5v-3M12 17.5v-6M15 17.5v-4" />
  </G>
)
/** Privacidade e segurança — escudo com fechadura. */
export const GShield = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <path d="M12 2.8 19.5 5.6v6c0 4.6-3.2 8.2-7.5 9.6-4.3-1.4-7.5-5-7.5-9.6v-6z" />
    <rect x="9.3" y="10.6" width="5.4" height="4.4" rx=".8" />
    <path d="M10.4 10.6V9.4a1.6 1.6 0 0 1 3.2 0v1.2" />
  </G>
)
/** Painel geral / overview — quadrantes assimétricos. */
export const GOverview = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <rect x="3" y="3" width="10" height="8" rx="1.2" />
    <rect x="15" y="3" width="6" height="12" rx="1.2" />
    <rect x="3" y="13" width="10" height="8" rx="1.2" />
    <rect x="15" y="17" width="6" height="4" rx="1.2" />
  </G>
)
/** Arquivos — pilha de documentos. */
export const GFiles = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <path d="M8 3.5h8.5l3 3v11H8z" />
    <path d="M5 6.5v14h10.5" opacity=".6" />
    <path d="M11 10.5h5.5M11 13.5h5.5" opacity=".7" />
  </G>
)
/** Mapa — grade cartográfica com marcador. */
export const GMap = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" />
    <path d="M9 4v13.5M15 6.5V20" opacity=".55" />
  </G>
)
/** Alertas — triângulo técnico. */
export const GAlert = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <path d="M12 3.5 21 19.5H3z" />
    <path d="M12 9.5v4.5" />
    <circle cx="12" cy="16.8" r=".7" fill="currentColor" />
  </G>
)
/** Exportar — bandeja com seta para fora. */
export const GExport = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <path d="M12 15V3.5M8 7.5l4-4 4 4" />
    <path d="M4 13.5v6.5h16v-6.5" />
  </G>
)
/** Assistente — cursor de terminal. */
export const GConsole = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <rect x="3" y="4" width="18" height="16" rx="1.6" />
    <path d="m7 9.5 3 2.5-3 2.5M12.5 15h4.5" />
  </G>
)
