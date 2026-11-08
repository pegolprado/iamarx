import { ExternalLink, Map as MapIcon } from 'lucide-react'
import { ERB_SITE } from '../../lib/shareMap'
import { ErbMapsEditor } from '../MapasErb'
import { ToolTitle } from './common'

/** Mapas ERB dentro da plataforma: monta o mapa e gera o link público (erb.iamarx.com.br) para a equipe. */
export default function MapasErbTool() {
  return (
    <div>
      <ToolTitle icon={<MapIcon />} title="Mapas ERB">
        <a className="btn-ghost" href={ERB_SITE} target="_blank" rel="noopener noreferrer" title="Versão pública, sem login">
          <ExternalLink className="h-4 w-4" /> Abrir erb.iamarx.com.br
        </a>
      </ToolTitle>
      <ErbMapsEditor initial={null} standalone={false} />
    </div>
  )
}
