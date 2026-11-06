import { BarChart3, Clock, MapPin, Phone, Smartphone, Wifi } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { apath, CaseScope } from '../../app/layout'
import { Loading } from '../../components/ui'
import { addFiles, quickImport } from '../../engine/importer'
import { getState, setState, useSession } from '../../engine/session'
import { Dropzone, Extracts, Needed, Panel, Purpose, ToolTitle } from './common'

const Location = lazy(() => import('../case/Location'))

/**
 * Extrato Tempo Real (interceptação/Vigia) e relatórios de localização das operadoras:
 * envia a planilha e a análise de localização aparece (mapa, eventos, padrões).
 */
export default function Extrato() {
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const hasData = useSession((s) => s.imports.some((i) => i.status === 'done' && i.kind === 'cdr'))
  const [show, setShow] = useState(hasData)
  const [failed, setFailed] = useState<number | null>(null)

  const run = async () => {
    setFailed(null)
    try {
      setBusy('Lendo a planilha…')
      const [f] = await addFiles(files.slice(0, 1), 'cdr', null, (s) => setBusy(s))
      const r = await quickImport(f.id, (s) => setBusy(`Planilha: ${s}…`))
      const imp = getState().imports.find((i) => i.id === r.importId)
      if (!imp || imp.status !== 'done' || !imp.rows_ok) {
        setFailed(f.id)
        toast.error('Não foi possível reconhecer os registros automaticamente. Ajuste as colunas no assistente.')
        return
      }
      toast.success(
        `${imp.rows_ok.toLocaleString('pt-BR')} registros importados${imp.rows_duplicate ? ` (${imp.rows_duplicate.toLocaleString('pt-BR')} repetidos fora da contagem)` : ''}.`,
      )
      setFiles([])
      setShow(true)
    } catch (e: any) {
      toast.error(`Falha ao processar: ${e?.message ?? e}`)
    } finally {
      setState({ busy: null })
      setBusy(null)
    }
  }

  if (show)
    return (
      <div>
        <ToolTitle icon={<Clock />} title="Extrato Tempo Real">
          <button className="btn-ghost" onClick={() => setShow(false)}>
            Nova análise
          </button>
        </ToolTitle>
        <CaseScope>
          <Suspense fallback={<Loading />}>
            <Location />
          </Suspense>
        </CaseScope>
      </div>
    )

  return (
    <div>
      <ToolTitle icon={<Clock />} title="Extrato Tempo Real" />
      <Purpose>
        Análise de extratos de chamadas em tempo real (interceptação) e de relatórios de localização fornecidos pelas operadoras pelo sistema Vigia. A ferramenta extrai os
        registros com data e horário, associa IMEIs aos números, identifica padrões de comunicação e de rotina (provável residência e trabalho) e plota as antenas (ERBs) em mapa
        com cobertura azimutal, deslocamentos e reprodução cronológica.
      </Purpose>
      <Extracts
        items={[
          ['Ligações, SMS e dados', <Phone key="i" />],
          ['Datas e horários', <Clock key="i" />],
          ['Antenas (ERBs)', <Wifi key="i" />],
          ['Mapa de localização', <MapPin key="i" />],
          ['Padrões e duração', <BarChart3 key="i" />],
        ]}
      />
      <Panel icon={<Smartphone />} title="Operadoras suportadas">
        <div className="flex flex-wrap justify-center gap-2">
          {[
            ['Vivo', 'border-violet/50 bg-violet/10 text-violet'],
            ['TIM', 'border-accent/50 bg-accent/10 text-accent'],
            ['Claro', 'border-danger/50 bg-danger/10 text-danger'],
            ['Oi e outras (mapeamento de colunas)', 'border-line-2 text-muted'],
          ].map(([n, c]) => (
            <span key={n} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${c}`}>
              ● {n}
            </span>
          ))}
        </div>
      </Panel>
      <Needed items={['Planilha de telefonia (Excel, CSV, TXT ou PDF)']} />
      <Dropzone
        title="Upload da planilha"
        hint="Envie a planilha do extrato em tempo real ou do relatório de localização exportada pela operadora (Vivo, TIM ou Claro)."
        accept=".xlsx,.xls,.csv,.txt,.pdf,.zip"
        max={1}
        files={files}
        onFiles={setFiles}
        onRun={run}
        runLabel="Processar arquivo"
        busy={busy}
      />
      {failed !== null && (
        <p className="mt-2 text-center text-sm">
          <Link className="text-accent hover:underline" to={apath(`importar/${failed}`)}>
            Abrir o assistente de importação para ajustar as colunas →
          </Link>
        </p>
      )}
      {hasData && (
        <p className="mt-2 text-center text-sm">
          <button className="text-accent hover:underline" onClick={() => setShow(true)}>
            Ver a análise dos arquivos já carregados →
          </button>
        </p>
      )}
    </div>
  )
}
