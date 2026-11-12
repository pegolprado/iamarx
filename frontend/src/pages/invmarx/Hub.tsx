import { ChevronRight, Clock, FileText, Map as MapIcon, Network, ShieldCheck } from 'lucide-react'
import { MarxLogo } from '../../components/brand'
import { Link } from 'react-router-dom'
import { Notice } from '../../components/ui'

export const INVMARX_TOOLS = [
  {
    to: '/invmarx/whatsapp',
    title: 'Bilhetagem WhatsApp',
    icon: <FileText />,
    tone: 'text-ok border-line bg-panel-2',
    text: 'Um alvo, até 15 arquivos diários: interlocutores, proximidade física (mesmo IP em 12 h), provedores, internet residencial, cidades e uso de VPN.',
  },
  {
    to: '/invmarx/whatsapp-vinculos',
    title: 'Bilhetagem WhatsApp — vínculos',
    icon: <Network />,
    tone: 'text-teal border-line bg-panel-2',
    text: 'Vários alvos, até 150 arquivos: contato direto entre alvos, interlocutores em comum, IPs em comum em 12 h e grupos compartilhados, com grafo.',
  },
  {
    to: '/invmarx/extrato',
    title: 'Extrato Tempo Real',
    icon: <Clock />,
    tone: 'text-accent border-line bg-panel-2',
    text: 'Planilha da operadora (Vigia / relatório de localização — Vivo, TIM, Claro): ERBs no mapa com azimute, deslocamentos, playback, provável residência e trabalho.',
  },
  {
    to: '/invmarx/mapas-erb',
    title: 'Mapas ERB',
    icon: <MapIcon />,
    tone: 'text-violet border-line bg-panel-2',
    text: 'Plote antenas (com azimute, distância e abertura) e lugares colando dados do extrato em vários formatos; cada alteração gera um link único para a equipe abrir só clicando.',
  },
  {
    to: '/invmarx/secret',
    title: 'MARX Secret — ocultar arquivo',
    icon: <ShieldCheck />,
    tone: 'text-amber border-line bg-panel-2',
    text: 'Esconda qualquer arquivo (documentos, planilhas, PDFs, ZIPs…), de qualquer tamanho, dentro de uma imagem, com senha (AES-256-GCM). Modo “resistente a redes sociais” grava uma mensagem curta que sobrevive ao WhatsApp/Instagram.',
  },
]

/** INVMARX: ferramentas no modelo do INVTECH, separadas do restante do sistema para teste. */
export default function InvmarxHub() {
  return (
    <div>
      <header className="mb-6 border-b border-line pb-5">
        <div className="eyebrow">Ferramentas</div>
        <h1 className="mt-1.5 flex items-center gap-[3px] text-[22px] leading-none font-semibold text-white" aria-label="INVMARX">
          <span className="tracking-[0.02em]">INV</span>
          <MarxLogo className="h-[17px]" alt="" />
        </h1>
        <p className="mt-2 max-w-3xl text-[13.5px] text-muted">
          Ferramentas diretas: envie os arquivos e o resultado aparece. Tudo é processado no seu navegador e nada é guardado.
        </p>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {INVMARX_TOOLS.map((t) => (
          <Link key={t.to} to={t.to} className="group card card-hover flex gap-3.5 p-4">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border [&>svg]:h-4 [&>svg]:w-4 ${t.tone}`}>{t.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2 text-[14px] font-semibold text-white">
                {t.title}
                <ChevronRight className="h-4 w-4 shrink-0 text-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-muted" />
              </span>
              <span className="mt-1 block text-[13px] leading-relaxed text-muted">{t.text}</span>
            </span>
          </Link>
        ))}
      </div>
      <div className="mt-5">
        <Notice tone="teal">Os resultados ficam só nesta aba do navegador. Exporte em Excel ou HTML o que precisar guardar.</Notice>
      </div>
    </div>
  )
}
