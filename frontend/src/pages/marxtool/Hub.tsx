import { ChevronRight, ScanFace, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

export const MARXTOOL_TOOLS = [
  {
    to: '/marxtool/compare',
    title: 'MarxCompare — comparação facial',
    icon: <ScanFace />,
    tone: 'text-teal border-line bg-panel-2',
    text: 'Compara dois rostos no próprio navegador (nada é enviado): modalidade de identidade (compatibilidade biométrica) e de semelhança visual (formatos e proporções), com caixa, pontos e relatório em PDF.',
  },
  {
    to: '/marxtool/secret',
    title: 'MARX Secret — ocultar arquivo',
    icon: <ShieldCheck />,
    tone: 'text-amber border-line bg-panel-2',
    text: 'Esconde qualquer arquivo (de qualquer tamanho) dentro de uma imagem, com senha (AES-256-GCM). Modo “resistente a redes sociais” grava uma mensagem curta que sobrevive ao WhatsApp/Instagram.',
  },
]

/** MARXTOOL: utilitários independentes (comparação facial e esteganografia), tudo no navegador. */
export default function MarxToolHub() {
  return (
    <div>
      <header className="mb-6 border-b border-line pb-5">
        <div className="eyebrow">Ferramentas</div>
        <h1 className="mt-1.5 text-[22px] leading-none font-semibold text-white">MARXTOOL</h1>
        <p className="mt-2 max-w-3xl text-[13.5px] text-muted">Utilitários independentes. Tudo é processado no seu navegador e nada é guardado.</p>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {MARXTOOL_TOOLS.map((t) => (
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
    </div>
  )
}
