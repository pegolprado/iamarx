import { Map as MapIcon } from 'lucide-react'
import { ErbMapsEditor } from '../MapasErb'
import { ToolTitle } from './common'

/** Mapas ERB dentro da plataforma: monta o mapa e gera o link público (/m#…) para a equipe. */
export default function MapasErbTool() {
  return (
    <div>
      <ToolTitle icon={<MapIcon />} title="Mapas ERB" />
      <ErbMapsEditor initial={null} standalone={false} />
    </div>
  )
}
