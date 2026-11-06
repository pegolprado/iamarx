import { Clock, FileText, MapPin, Network } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Notice } from '../../components/ui'

export const INVMARX_TOOLS = [
  {
    to: '/invmarx/whatsapp',
    title: 'Bilhetagem WhatsApp',
    icon: <FileText />,
    tone: 'text-ok border-ok/40 bg-ok/10',
    text: 'Um alvo, até 15 arquivos diários: interlocutores, proximidade física (mesmo IP em 12 h), provedores, internet residencial, cidades e uso de VPN.',
  },
  {
    to: '/invmarx/whatsapp-vinculos',
    title: 'Bilhetagem WhatsApp — vínculos',
    icon: <Network />,
    tone: 'text-teal border-teal/40 bg-teal/10',
    text: 'Vários alvos, até 150 arquivos: contato direto entre alvos, interlocutores em comum, IPs em comum em 12 h e grupos compartilhados, com grafo.',
  },
  {
    to: '/invmarx/extrato',
    title: 'Extrato Tempo Real',
    icon: <Clock />,
    tone: 'text-accent border-accent/40 bg-accent/10',
    text: 'Planilha da operadora (Vigia / relatório de localização — Vivo, TIM, Claro): ERBs no mapa com azimute, deslocamentos, playback, provável residência e trabalho.',
  },
  {
    to: '/analise/localizacao',
    title: 'Localização do alvo (análise atual)',
    icon: <MapPin />,
    tone: 'text-amber border-amber/40 bg-amber/10',
    text: 'A mesma análise de localização sobre os arquivos já carregados na análise atual (bilhetagem, interceptação, cadastro de ERB).',
  },
]

/** INVMARX: ferramentas no modelo do INVTECH, separadas do restante do sistema para teste. */
export default function InvmarxHub() {
  return (
    <div>
      <div className="mb-6">
        <div className="font-mono text-xs tracking-[0.35em] text-faint">FERRAMENTAS</div>
        <h1 className="mt-1 text-3xl font-bold text-white">
          INV<span className="text-gold">MARX</span>
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">Ferramentas diretas: envie os arquivos e o resultado aparece. Tudo é processado no seu navegador e nada é guardado.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {INVMARX_TOOLS.map((t) => (
          <Link key={t.to} to={t.to} className="card card-hover flex gap-4 p-5">
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border [&>svg]:h-6 [&>svg]:w-6 ${t.tone}`}>{t.icon}</span>
            <span>
              <span className="block text-lg font-bold text-white">{t.title}</span>
              <span className="mt-1 block text-sm text-muted">{t.text}</span>
            </span>
          </Link>
        ))}
      </div>
      <div className="mt-6">
        <Notice tone="teal">Os resultados ficam só nesta aba do navegador. Exporte em Excel ou HTML o que precisar guardar.</Notice>
      </div>
    </div>
  )
}
