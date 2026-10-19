import { Activity, AlertTriangle, FileSearch, FileText, FolderKanban, GitMerge, MessageCircle, Network, PhoneCall, RadioTower, Sparkles, Upload } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Tone } from '../components/ui'

/** Módulos da tela inicial (cartões grandes) — `path` relativo à análise quando `inCase`. */
export type ModuleDef = { key: string; title: string; description: string; icon: ReactNode; path: string; inCase: boolean; tone: Tone }

export const MODULES: ModuleDef[] = [
  {
    key: 'cases',
    title: 'Análise Atual',
    description: 'Identificação, alvos, período autorizado e escopo da análise aberta nesta aba (nada é salvo).',
    icon: <FolderKanban />,
    path: '',
    inCase: true,
    tone: 'blue',
  },
  {
    key: 'import',
    title: 'Importação Inteligente',
    description: 'Carregue planilhas, PDFs (com OCR), ZIP ou WhatsApp Records: layout, operadora, fusos, validação e duplicidades tratados automaticamente.',
    icon: <Upload />,
    path: 'arquivos',
    inCase: true,
    tone: 'blue',
  },
  {
    key: 'full',
    title: 'Análise Completa',
    description: 'Importou, está pronto: todas as análises de uma só vez, com os principais achados e relatório único em PDF ou Excel.',
    icon: <Sparkles />,
    path: 'completa',
    inCase: true,
    tone: 'violet',
  },
  {
    key: 'cdr',
    title: 'Bilhetagem e Padrões',
    description: 'Chamadas, SMS e dados, contatos frequentes, comparação de períodos, horários de pico, dias atípicos, lacunas e linha do tempo.',
    icon: <PhoneCall />,
    path: 'eventos',
    inCase: true,
    tone: 'blue',
  },
  {
    key: 'links',
    title: 'Análise de Vínculos',
    description: 'Rede de contatos, reciprocidade, contatos em comum, contato direto, coincidências, células em comum e cruzamento entre operadoras — tudo junto.',
    icon: <Network />,
    path: 'vinculos',
    inCase: true,
    tone: 'teal',
  },
  {
    key: 'whatsapp',
    title: 'WhatsApp e IPs',
    description:
      'Relatórios da Meta (mensagens, chamadas, dados cadastrais, agenda e grupos) e logs de acesso do Google e outros provedores, com correlação de IPs entre contas e serviços.',
    icon: <MessageCircle />,
    path: 'whatsapp',
    inCase: true,
    tone: 'green',
  },
  {
    key: 'erb',
    title: 'ERB e Geolocalização',
    description: 'Resolução de células com cadastro versionado, inconsistências, mapa de estações, sequência de células e reprodução cronológica.',
    icon: <RadioTower />,
    path: 'erb',
    inCase: true,
    tone: 'amber',
  },
  {
    key: 'reports',
    title: 'Alertas e Relatórios',
    description: 'Alertas automáticos para revisão e relatórios técnicos em PDF, Excel e CSV com critérios, hashes e rastreabilidade.',
    icon: <FileText />,
    path: 'relatorios',
    inCase: true,
    tone: 'blue',
  },
  {
    key: 'audit',
    title: 'Privacidade e Segurança',
    description: 'Processamento local, nenhum dado gravado, sessão individual e apagamento automático ao sair.',
    icon: <Activity />,
    path: '/configuracoes',
    inCase: false,
    tone: 'red',
  },
]

/** Uma ferramenta reúne várias análises que rodam juntas; `includes` lista o que ela entrega. */
export type Tool = { title: string; description: string; path: string; tab?: string; includes: string[] }
export type ToolGroup = { title: string; icon: ReactNode; tone: Tone; tools: Tool[] }

export const TOOL_GROUPS: ToolGroup[] = [
  {
    title: 'Comece aqui',
    icon: <Sparkles className="h-5 w-5" />,
    tone: 'violet',
    tools: [
      {
        title: 'Importação inteligente',
        description: 'Carregue os arquivos como vieram da operadora ou da Meta: o sistema identifica o formato e já deixa tudo pronto para análise.',
        path: 'arquivos',
        includes: [
          'CSV, TXT, XLS, XLSX, XML, JSON, HTML, PDF (com OCR) e ZIP',
          'Extratos de voz, SMS e conexão (dados) de TIM, Vivo, Claro e Oi',
          'Layout, separador e operadora detectados',
          'Datas, fusos, durações e números padronizados',
          'Validação por linha e prévia',
          'Duplicidades e registros fora do período',
          'WhatsApp Records e logs de acesso reconhecidos',
          'SHA-256 de cada original',
        ],
      },
      {
        title: 'Análise completa automática',
        description: 'Um clique depois de importar: todas as análises rodam juntas e o painel mostra os principais achados, cada um levando aos registros que o sustentam.',
        path: 'completa',
        includes: [
          'Bilhetagem e contatos',
          'Padrões de horário e dias atípicos',
          'Vínculos e cruzamentos entre alvos',
          'ERB e WhatsApp/IPs',
          'Alertas automáticos',
          'Relatório único em PDF ou Excel',
        ],
      },
    ],
  },
  {
    title: 'Análises',
    icon: <PhoneCall className="h-5 w-5" />,
    tone: 'blue',
    tools: [
      {
        title: 'Bilhetagem e padrões',
        description: 'Explorador de registros com filtros combinados, frequência de contatos e o comportamento ao longo do tempo.',
        path: 'eventos',
        includes: [
          'Chamadas, SMS e sessões de dados',
          'Frequência e reciprocidade de contatos',
          'Comparação entre períodos',
          'Picos por hora e dia da semana',
          'Dias atípicos, lacunas e intervalos incomuns',
          'Linha do tempo com anotações',
        ],
      },
      {
        title: 'Análise de vínculos',
        description: 'Com um único carregamento, cruza todos os alvos entre si e mostra o grafo e cada tipo de ligação encontrada.',
        path: 'vinculos',
        includes: [
          'Rede de contatos interativa',
          'Reciprocidade de chamadas',
          'Contatos em comum',
          'Contato direto entre alvos',
          'Coincidências de horário e de célula',
          'Comparação de atividades',
          'Cruzamento multifonte entre operadoras',
          'IPs e grupos de WhatsApp em comum',
        ],
      },
      {
        title: 'WhatsApp e IPs',
        description:
          'Relatórios da Meta (records.html, ZIP ou vários HTML diários do mesmo alvo, sem duplicar) com horários convertidos de UTC, cruzados com as sessões de dados das operadoras.',
        path: 'whatsapp',
        includes: [
          'Dados cadastrais (aparelho, versão, e-mail, nome)',
          'Mensagens e chamadas (voz e vídeo)',
          'Interlocutores mais frequentes',
          'Agenda: alvos e contatos em comum',
          'Grupos (cadastro e mensagens) em comum',
          'IPs, portas e sequência de IPs',
          'IPs em comum entre alvos',
        ],
      },
      {
        title: 'Log de acesso e correlação de IPs',
        description:
          'Logs de IP de Google, Instagram, Facebook, Apple, provedores e outros (planilha ou HTML), cruzados com WhatsApp e operadoras para identificar o mesmo usuário ou uso compartilhado.',
        path: 'ips',
        includes: [
          'Colunas reconhecidas automaticamente',
          'Fuso UTC detectado',
          'Mesmo IP e porta no mesmo horário (forte)',
          'Mesmo IP sem porta (média)',
          'CGNAT sinalizado (fraca)',
          'Mesma conta em serviços diferentes',
        ],
      },
      {
        title: 'ERB e geolocalização',
        description: 'Resolve as células dos registros com o cadastro técnico e mostra onde e em que ordem as estações foram registradas.',
        path: 'erb',
        includes: [
          'Resolução por regras versionadas',
          'Revisão manual de ambiguidades',
          'Cadastro de células pesquisável',
          'Inconsistências de coordenadas',
          'Células por período e por número',
          'Mapa, sequência de células e reprodução cronológica',
        ],
      },
    ],
  },
  {
    title: 'Saídas e assistência',
    icon: <FileSearch className="h-5 w-5" />,
    tone: 'amber',
    tools: [
      {
        title: 'Alertas',
        description: 'Regras configuráveis que apontam o que merece revisão, com os registros de suporte e a decisão do analista.',
        path: 'alertas',
        includes: [
          'Volume diário elevado',
          'Atividade de madrugada',
          'Mudança de frequência de contatos',
          'Alvos no mesmo local de estação',
          'Divergências de cadastro e horário',
          'Duplicidades',
        ],
      },
      {
        title: 'Relatórios técnicos',
        description: 'Relatórios de bilhetagem, vínculos, ERB, WhatsApp ou completo, gerados no navegador e entregues direto no seu computador.',
        path: 'relatorios',
        includes: ['PDF, Excel e CSV', 'Critérios e filtros aplicados', 'SHA-256 dos arquivos de entrada', 'Limitações dos dados', 'Exportação de qualquer tabela da tela'],
      },
      {
        title: 'Assistente analítico',
        description: 'Perguntas em português convertidas em consultas verificáveis, executadas no seu navegador.',
        path: 'assistente',
        includes: ['“Quem mais falou com o alvo?”', '“Contatos em comum”', '“IPs do WhatsApp”', 'Consulta mostrada e auditável'],
      },
    ],
  },
]

export const ICONS = { AlertTriangle, GitMerge, Sparkles }
