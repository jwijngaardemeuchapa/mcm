import {
  LayoutDashboard,
  Bell,
  RefreshCw,
  ClipboardList,
  Upload,
  History,
  Building2,
  Search,
  FileSpreadsheet,
  BarChart3,
  LineChart,
  Target,
  Settings,
  ExternalLink,
  BookOpen,
  Zap,
  CheckCircle,
  Volume2,
  Users,
  Moon,
  AlertTriangle,
  Clock,
  ArrowRight,
  MousePointer,
  MessageSquare,
  TrendingUp,
  Shield,
  Sparkles,
  ChevronRight,
  Plug,
  KanbanSquare,
  BookUser,
  Send,
  XCircle,
  Smartphone,
  CalendarDays,
  ArrowLeftRight,
  BookMarked,
  Inbox,
  UserCheck,
  MessageCircle,
  Command,
  MessagesSquare,
  GanttChartSquare,
  Map,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

/* ─── types ── */

type Module = {
  icon: LucideIcon;
  name: string;
  subtitle: string;
  color: string;
  features: string[];
  savings: string | null;
  isNew?: boolean;
};

type Section = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  modules: Module[];
};

/* ─── scroll helper ── */

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.pageYOffset - 76;
  window.scrollTo({ top, behavior: "smooth" });
}

/* ─── TOC items ── */

const TOC_ITEMS: { id: string; icon: LucideIcon; label: string; accent?: boolean }[] = [
  { id: "fluxo", icon: Clock, label: "Fluxo do Dia", accent: true },
  { id: "operacao", icon: LayoutDashboard, label: "1. Painel de Ops" },
  { id: "cards", icon: ClipboardList, label: "2. Cards de Tarefa" },
  { id: "comunicacao", icon: Send, label: "3. Comunicação" },
  { id: "dados", icon: Upload, label: "4. Dados" },
  { id: "gestao", icon: BookUser, label: "5. Gestão" },
  { id: "analise", icon: TrendingUp, label: "6. Análise" },
  { id: "sistema", icon: Settings, label: "7. Config & Integrações" },
  { id: "automacoes", icon: Sparkles, label: "Automações" },
  { id: "atalhos", icon: Command, label: "Atalhos" },
];

/* ─── sections data ── */

const SECTIONS: Section[] = [
  {
    id: "operacao",
    label: "1. Painel de Operações",
    description: "Tudo que você usa do momento que abre o app até fechar o turno. O Dashboard é o centro de controle — aprenda a ler os painéis de cima para baixo.",
    icon: LayoutDashboard,
    modules: [
      {
        icon: LayoutDashboard,
        name: "Dashboard",
        subtitle: "Central de operações em tempo real",
        color: "text-primary bg-primary/10 border-primary/20",
        savings: "~12min/dia",
        features: [
          "Atualização automática a cada 30 segundos — sem precisar clicar em nada",
          "Três modos de visualização: Cards (detalhado), Panorama (tabela compacta) e Timeline (Gantt por horário) — alterne com as teclas 1, 2 e 3",
          "Timeline (Gantt): veja todas as tarefas do dia como blocos no eixo de tempo — cor indica fill rate (verde ≥80%, amarelo 50–80%, vermelho <50%) — clique num bloco para abrir o card em overlay sem sair da Timeline — altura ajusta-se automaticamente ao número de linhas paralelas",
          "Busca unificada sem acento — encontre qualquer chapa, empresa, ID ou telefone — ative com a tecla /",
          "Filtros por empresa, horário de início, status de upload e 'só pendentes' — o filtro de empresa é lembrado entre visitas",
          "Filtro 'Sem FUP Umbler': mostra apenas tarefas onde nenhum chapa recebeu FUP via Umbler Talk",
          "Ocultar empresa: o ícone de olho na aba Carteira oculta a empresa de todo o Dashboard em tempo real",
          "Fill rate geral no topo + breakdown expansível por empresa",
          "Navegação por data: setas ← → do teclado para ver tarefas de outros dias — tecla T volta para hoje",
          "Exportação Pré-FUP do dia seguinte: gera CSV agrupado por empresa em 1 clique",
          "Paleta de comandos CTRL+K: navegue para qualquer página ou tarefa sem usar o mouse",
          "Atalhos rápidos: / (busca) · T (hoje) · ← → (dia) · 1/2 (modo) · R (importar)",
          "Botão BID nos cards com vagas em aberto: abre o BID Dashboard direto na tarefa, já expandido",
        ],
      },
      {
        icon: AlertTriangle,
        name: "Banner de Alertas",
        subtitle: "Urgências no topo da tela",
        color: "text-destructive bg-destructive/10 border-destructive/20",
        savings: null,
        features: [
          "Aparece automaticamente só quando há alertas — não polui a tela quando tudo está em ordem",
          "Urgente: tarefas iniciadas antes das 06h ou marcadas como críticas na importação",
          "Overnight: tarefas da véspera ainda em andamento que precisam de atenção",
          "Agenda: aparece quando um item da agenda está com prazo a menos de 2 horas",
          "Múltiplos alertas ciclam automaticamente — use os botões de navegação para ver todos",
          "Botão 'Ver →' rola a página e destaca o card correspondente com um pisca",
        ],
      },
      {
        icon: Zap,
        name: "Painel de Prioridades",
        subtitle: "Ranking automático de ação: Emergente · Urgente · Monitorar",
        color: "text-warning bg-warning/10 border-warning/20",
        savings: "~5min/dia",
        features: [
          "Classifica automaticamente todas as tarefas do dia em três níveis de urgência",
          "Emergente (vermelho): sem chapas confirmados com início próximo, fill < 50% em menos de 1h, ou tarefa urgente",
          "Urgente (laranja): fill abaixo do threshold em até 1h30, overnight com fill baixo, ou tarefas grandes com vagas em aberto",
          "Monitorar (azul): fill abaixo do threshold entre 1h30 e 8h — pode ser ocultado nas Configurações",
          "Tarefas já validadas pelo cliente saem automaticamente do ranking",
          "Countdown ao lado de cada tarefa — fica vermelho quando faltam menos de 60 min",
          "Botão 'Ver' rola e destaca o card sem perder o contexto do que estava fazendo",
          "Algoritmo considera impacto no fill rate e faturamento",
          "Colapsável: minimize para ganhar espaço sem perder o alerta no cabeçalho",
        ],
      },
      {
        icon: UserCheck,
        name: "Confirmações Automáticas",
        subtitle: "Registro em tempo real das respostas detectadas",
        color: "text-success bg-success/10 border-success/20",
        savings: null,
        features: [
          "Painel aparece automaticamente no Dashboard quando respostas são detectadas — fica oculto quando não há atividade",
          "Três tipos de eventos: Confirmado (chapa respondeu SIM), Recusou (respondeu NÃO), Removido (ação manual)",
          "Cada entrada mostra: nome do chapa, tipo de ação com badge colorido, empresa, horário e tempo relativo",
          "Botão 'Ver' em cada entrada vai diretamente para o card da tarefa no Dashboard",
          "Funciona com webhook Umbler Talk (em tempo real) e listener de notificações do Windows (requer Chrome aberto)",
          "Os dados são da sessão — somem ao recarregar, evitando acúmulo de informações antigas",
        ],
      },
      {
        icon: Bell,
        name: "Painel Flutuante",
        subtitle: "Chapas a confirmar · Portaria · Disparos rápidos",
        color: "text-warning bg-warning/10 border-warning/20",
        savings: "~2min por chapa",
        features: [
          "Lista em tempo real de chapas sem confirmação em tarefas com menos de 1 hora para início",
          "Confirmar (✓) ou remover (×) diretamente no painel — sem precisar abrir o card da tarefa",
          "Copiar telefone e abrir WhatsApp Web para cada chapa com 1 clique",
          "Enviar FUP de confirmação via Umbler com countdown de 60 s — cancele clicando no botão durante a contagem",
          "Avisar chapa de ausência de resposta via Umbler com o mesmo padrão de 60 s",
          "Alerta de portaria: aviso antecipado configurável por empresa (1h a 24h antes do início)",
          "Copiar lista de nomes da tarefa para portaria com 1 clique",
          "Alerta sonoro quando um novo chapa entra na janela de 1h (ativável nas Configurações)",
        ],
      },
      {
        icon: RefreshCw,
        name: "Alterações após Atualização",
        subtitle: "Diff automático · Ocorrências",
        color: "text-info bg-info/10 border-info/20",
        savings: null,
        features: [
          "Após cada atualização, o sistema compara o estado anterior e destaca o que mudou",
          "Chapas novos: exibidos com badge 'NOVO' verde por 20 minutos",
          "Chapas removidos externamente: abre workflow de ocorrência com 7 tipos e mensagem formatada pronta para copiar",
          "Detecção automática de validação coletiva do cliente: 3+ chapas removidos após início geram alerta específico",
        ],
      },
    ],
  },
  {
    id: "cards",
    label: "2. Trabalhando com Cards de Tarefa",
    description: "Cada tarefa é um card com todas as ações necessárias para o dia. Aprenda o fluxo completo: da confirmação à validação de presença.",
    icon: ClipboardList,
    modules: [
      {
        icon: ClipboardList,
        name: "Card de Tarefa",
        subtitle: "Todas as ações em um lugar",
        color: "text-muted-foreground bg-muted/30 border-border",
        savings: "~7min por tarefa",
        features: [
          "Confirmar chapa por canal: WhatsApp Web, Umbler Talk ou Ligação 3C — cada canal fica registrado no histórico",
          "Enviar Umbler: dispara template de confirmação com delay de 60 s — a contagem continua se você navegar — cancele clicando durante a contagem",
          "Botão 'Enviado (Nx)': mostra quantas vezes o chapa foi contactado via Umbler — sempre resendável",
          "Sem resp.: dispara template de ausência de resposta — mesmo delay de 60 s com cancelamento",
          "FUP Todos: dispara para todos os chapas de uma vez — delay de 3 min antes do primeiro, 10 s entre cada",
          "Cancelar Tarefa: notifica todos os chapas sobre cancelamento geral — 60 s de delay",
          "Confirmar todos: confirma todos os chapas pendentes de uma vez (quando faltam ≤ 2h para início)",
          "Indicador de fuso horário (−1h ou −2h) em tarefas de cidades fora do UTC-3",
          "Validar presença: marque Presente ou Ausente por chapa após início — Presente confirma automaticamente o status",
          "Exportar CSV pronto para upload no Meu Chapa — botão fica verde após o primeiro export",
          "Copiar lista completa (Nome + CPF) ou só nomes (todos ou só confirmados) — para portaria e outros usos",
          "CPF dos confirmados: filtra chapas com status Confirmado, busca o CPF pelo telefone e copia 'Nome — CPF'",
          "Registrar FUP manual: informe o canal e uma observação livre para registrar no histórico",
          "Histórico de FUPs: todos os disparos com data, canal e observação — colapsável no rodapé",
          "Remover chapa: informa motivo e gera mensagem formatada de substituição pronta para copiar",
          "Menu ⋯ por chapa: Não respondeu, Ligação 3C, Editar telefone, Ver no Caderno, Sinalizar remoção, Reabrir",
          "Undo/Redo em todas as ações da sessão — Ctrl+Z desfaz a última ação",
        ],
      },
    ],
  },
  {
    id: "comunicacao",
    label: "3. Comunicação e Respostas",
    description: "Tudo que envolve enviar mensagens, capturar respostas e acompanhar o histórico. O webhook fecha o ciclo: dispara, recebe, registra — em tempo real.",
    icon: Send,
    modules: [
      {
        icon: MessagesSquare,
        name: "Respostas",
        subtitle: "Histórico unificado FUP + BID · Webhook em tempo real · Export XLSX",
        color: "text-success bg-success/10 border-success/20",
        savings: null,
        isNew: true,
        features: [
          "Acesse em Operacional → Respostas (atalho de teclado: ge)",
          "Registra automaticamente respostas recebidas via webhook do Umbler Talk em tempo real — sem o WhatsApp Desktop aberto",
          "Três origens de registro: Webhook (Umbler Talk automático), Manual (botões do BID Dashboard) e Notificação Win (listener do Windows)",
          "Filtros combinados: intervalo de datas, tipo (FUP / BID / Todos) e resultado (Positivas / Negativas / Todas)",
          "Tabela com: horário exato, tipo, chapa, badge colorido de resposta, empresa, tarefa e fonte da resposta",
          "Auto-refresh: atualiza automaticamente quando chega uma nova resposta via webhook — sem precisar recarregar",
          "Exportar XLSX: planilha com Data/Hora, Tipo, Chapa, Telefone, Resposta, Empresa, Tarefa, Mensagem e Fonte — 1 clique",
          "Respostas detectadas via webhook: SIM / NÃO / 1 / 2 / 3 / Preciso de ajuda / Aceito app",
          "Para FUP: 'confirmado' ou 'cancelado'. Para BID: 'interesse_sim', 'interesse_nao', 'aceita_app', 'nao_aceita_app', 'precisa_ajuda'",
        ],
      },
      {
        icon: Send,
        name: "PréFUP",
        subtitle: "FUPs antecipados classificados automaticamente",
        color: "text-info bg-info/10 border-info/20",
        savings: null,
        features: [
          "Um FUP é classificado como PréFUP automaticamente — sem nenhuma configuração extra",
          "Critério 1 — Dia seguinte: FUP disparado para uma tarefa do dia seguinte ou posterior",
          "Critério 2 — Turno noturno: FUP disparado antes das 15h para tarefa com início às 17h ou mais tarde no mesmo dia",
          "Badge 'PréFUP' aparece ao lado do canal no histórico de FUPs de cada card",
          "PréFUPs realizados aparecem automaticamente na mensagem de Troca de Turno",
        ],
      },
      {
        icon: Inbox,
        name: "Disparos Umbler",
        subtitle: "Acompanhe quem está aguardando resposta e o histórico completo",
        color: "text-primary bg-primary/10 border-primary/20",
        savings: null,
        features: [
          "Acesse pelo menu lateral em Operacional → Disparos Umbler",
          "Tarefas já validadas ficam ocultas automaticamente — a lista mostra apenas o que precisa de ação",
          "Aba 'Aguardando Resposta': chapas contactados via Umbler que ainda não confirmaram nem foram removidos",
          "Timer pós-disparo: badge laranja 'Sem resposta' após o tempo configurado — vermelho após 2× esse tempo",
          "Aba 'Histórico de Disparos': todos os FUPs via Umbler, mais recentes primeiro, com resumo do dia",
          "Botão 'Ver tarefa' em cada linha navega direto ao card no Dashboard com destaque visual",
          "O tempo do timer é configurável em Configurações → Alertas → Timer de sem-resposta",
        ],
      },
      {
        icon: ArrowLeftRight,
        name: "Troca de Turno",
        subtitle: "Mensagem formatada para o Teams — gerada em segundos",
        color: "text-primary bg-primary/10 border-primary/20",
        savings: "~5min/turno",
        isNew: true,
        features: [
          "Acesse pelo botão 'Troca de Turno' no rodapé da barra lateral",
          "Rótulo de Carteira: dropdown para selecionar G1–G5 ou 'Geral' — serve apenas para identificação no texto da mensagem",
          "Exclusão de empresas por sessão: popover com checkbox por empresa — marque o que não deve aparecer na mensagem; reseta ao fechar o painel",
          "Horário de corte BID configurável: campo de hora editável (padrão 14:45) — ajuste conforme o turno do analista",
          "Seção Validações Pendentes: tarefas do dia que ainda não foram validadas pelo cliente",
          "Seção Confirmações: tarefas futuras com chapas ainda não confirmados — mostra X/Y confirmados",
          "Label [PréFUP] aplicado automaticamente a tarefas que iniciam em mais de 6 horas a partir do momento do envio",
          "Seção BID — Captações em aberto: tarefas com início no horário de corte ou depois, que ainda não começaram ou começaram há no máximo 30 min, e têm vagas em aberto",
          "Quantidade de vagas BID reflete apenas os slots realmente vazios (não o total da tarefa)",
          "Botão 'Copiar para Teams': copia com formatação markdown (*negrito*) pronta para colar",
        ],
      },
    ],
  },
  {
    id: "dados",
    label: "4. Importação e Histórico",
    description: "Como os dados chegam ao sistema e como acessar o passado. A importação é o ponto de entrada — tudo parte dela.",
    icon: Upload,
    modules: [
      {
        icon: Upload,
        name: "Importar",
        subtitle: "Ingestão diária de dados · CSV, JSON e XLSX",
        color: "text-success bg-success/10 border-success/20",
        savings: "~14min/dia",
        features: [
          "Suporte a CSV e JSON — arraste o arquivo ou clique para selecionar",
          "Detecção automática de colunas: ID da tarefa, data, empresa, chapas, CPF e telefone",
          "Deduplicação automática: chapas repetidos dentro da mesma tarefa são ignorados",
          "Preservação de progresso: chapas já confirmados, validados ou removidos não regridem na reimportação",
          "Auto-validação: tarefas com status 'Em Andamento' ou 'Finalizado' já entram como subidas no Meu Chapa",
          "Overnight automático: tarefas com horário ≥ 20h (fuso de SP) são marcadas como overnight",
          "Cadastro Geral de Chapas (XLSX): detecção automática de colunas — aceita arquivos com 100k+ linhas sem travar",
          "Barra de progresso em tempo real durante importação do cadastro geral",
        ],
      },
      {
        icon: History,
        name: "Histórico",
        subtitle: "Auditoria completa de tudo que aconteceu",
        color: "text-muted-foreground bg-muted/30 border-border",
        savings: null,
        features: [
          "Aba Remoções: todos os chapas removidos com data, motivo e empresa",
          "Aba FUPs: histórico de disparos filtráveis por tarefa, data, hora e canal",
          "Aba Validações: acompanhamento com datas de recebimento e upload, e cronômetro de quanto tempo levou",
          "Aba Validações Tardias: mostra recebimentos fora do prazo para análise e cobrança",
        ],
      },
      {
        icon: Target,
        name: "BID Dashboard",
        subtitle: "Captação de chapas · Cadastro geral · Bloqueados · Disparo via Umbler",
        color: "text-primary bg-primary/10 border-primary/20",
        savings: null,
        features: [
          "Três abas no topo: Tarefas (captação ativa), Bloqueados (análise global) e Cadastro (registro completo)",
          "Aba Tarefas — layout multi-tarefa: um card expansível por tarefa com vagas em aberto",
          "ID da tarefa no cabeçalho: link clicável que abre a tarefa no Meu Chapa",
          "Botão BID direto nos cards do FUP Dashboard: abre já expandido na tarefa correta",
          "CEP do local obrigatório: o disparo fica bloqueado até ser preenchido — auto-preenchido pelo Caderno de Clientes",
          "Ranking automático de candidatos: score por histórico, proximidade, recência, ASO e situação ativa",
          "Filtro de raio configurável: 10 / 20 / 30 / 50 / 100 km — quando há link Maps com GPS",
          "Seleção múltipla + 'Disparar (N)': dispara BID em lote com 7 s de intervalo — cancelável",
          "Polling de respostas a cada 5 s e captura automática via webhook",
          "Três visões de candidatos por tarefa (abas): Lista Clássica, Matchmaker e Radar / Heatmap",
          "Matchmaker: interface focada em 1 chapa por vez — mostra histórico e distância — botões Pular ou Disparar BID para alocação ágil",
          "Radar / Heatmap: mapa interativo (OpenStreetMap) centralizado no local da tarefa — raios de 15km e 30km — marcadores por disponibilidade (azul=disponível, verde=disparado, cinza=ocupado)",
          "Calculadora de Negociação: calcula lucro, margem e máximo sustentável por chapa",
          "Badges de score BID: ✓ Apr. (verde), ~ Med. (amarelo), ✗ Baixo (vermelho) — baseado no histórico da Planilha LEO",
          "Filtro por tier LEO: clique em 'aprovados', 'médios' ou 'baixo' no painel Análise BID para ver apenas aquele grupo na Lista, Matchmaker e Radar — clique novamente para limpar",
          "Importar CSV BID / Planilha LEO: enriquece o ranking com histórico de respostas — gerencie em Configurações → Planilha LEO",
        ],
      },
      {
        icon: FileSpreadsheet,
        name: "Conversor BID",
        subtitle: "Conversão de planilhas BID para CSV",
        color: "text-muted-foreground bg-muted/30 border-border",
        savings: null,
        features: [
          "Converte planilhas XLSX/XLS do formato BID para CSV limpo automaticamente",
          "Extrai colunas de nome e telefone — remove cabeçalhos e linhas vazias",
          "Preview de até 100 linhas antes de baixar",
          "Download em 1 clique — arquivo pronto para uso",
        ],
      },
      {
        icon: MessageSquare,
        name: "Consultor",
        subtitle: "Análise ad-hoc de arquivo avulso · IA integrada",
        color: "text-primary bg-primary/10 border-primary/20",
        savings: "~3min por busca",
        features: [
          "Analise qualquer arquivo CSV ou JSON sem salvar no banco de dados",
          "Busca por ajudante, tarefa, empresa ou data — resultados em tabela com links para o Meu Chapa",
          "Busca por número de telefone (parcial) — insensível a formatação",
          "Listagens rápidas: removidos, não responderam, tarefas de hoje",
          "Consulta em linguagem natural via IA: pergunte em português e receba a análise dos dados",
        ],
      },
    ],
  },
  {
    id: "gestao",
    label: "5. Gestão de Chapas, Clientes e Agenda",
    description: "Registros permanentes que ficam no sistema independente das importações diárias. Construa seu histórico de chapas e clientes ao longo do tempo.",
    icon: BookUser,
    modules: [
      {
        icon: BookUser,
        name: "Caderno de Chapas",
        subtitle: "Registro permanente de trabalhadores",
        color: "text-info bg-info/10 border-info/20",
        savings: null,
        features: [
          "Cadastro permanente de chapas — independente das tarefas diárias importadas",
          "Campos: nome, CPF, dois telefones, grupo, empresas associadas, observações e pedidos",
          "Status: Ativo / Inativo / Bloqueado — com filtro rápido no topo",
          "Busca por nome, telefone, empresa ou grupo — insensível a acentos",
          "Acesso direto pelo card de tarefa no Dashboard: clique no ícone de caderno ao lado do nome",
        ],
      },
      {
        icon: BookMarked,
        name: "Caderno de Clientes",
        subtitle: "Registro de particularidades, exigências e pedidos por empresa",
        color: "text-info bg-info/10 border-info/20",
        savings: null,
        features: [
          "Registre informações permanentes de cada cliente que não estão nas planilhas operacionais",
          "Campos estruturados: nome fantasia, CNPJ, contato, telefone, e-mail, segmento",
          "Múltiplos endereços por cliente com campo de CEP — lido automaticamente pelo BID Dashboard",
          "Campos de texto livre: Particularidades, Exigências constantes, Pedidos recorrentes, Observações",
          "Status do cliente: Ativo / Inativo / Suspenso — com filtro rápido",
          "Use para documentar: 'Portaria fecha às 22h', 'Exige CNH', 'Pagamento somente via NF'",
        ],
      },
      {
        icon: Building2,
        name: "Carteira",
        subtitle: "Lista de empresas autorizadas no sistema",
        color: "text-muted-foreground bg-muted/30 border-border",
        savings: null,
        features: [
          "Controla quais empresas aparecem no Dashboard — fora da carteira são filtradas na exibição",
          "Upload de CSV com a lista de empresas — preview com duplicatas identificadas",
          "Ocultar empresa: o ícone de olho oculta pontualmente sem remover da carteira",
          "Configure o Grupo (G1–G5) de cada empresa para o filtro de carteira na Troca de Turno",
        ],
      },
      {
        icon: KanbanSquare,
        name: "Agenda",
        subtitle: "Tarefas internas em quadro Kanban",
        color: "text-info bg-info/10 border-info/20",
        savings: null,
        features: [
          "Quadro Kanban com quatro colunas: A Fazer, Em Andamento, Aguardando e Concluído",
          "Criar tarefas com título, descrição, prazo e importância: Urgente / Alta / Normal / Baixa",
          "Mover cards com as setas ← → diretamente no card",
          "Banner de alertas no Dashboard avisa quando uma tarefa da agenda está com prazo próximo (≤ 2h)",
          "Itens da agenda podem ser incluídos na mensagem de Troca de Turno",
        ],
      },
    ],
  },
  {
    id: "analise",
    label: "6. Análise e Indicadores",
    description: "Páginas para entender o passado e identificar padrões. Use após o turno ou semanalmente para acompanhar performance.",
    icon: TrendingUp,
    modules: [
      {
        icon: LineChart,
        name: "Análise de Clientes",
        subtitle: "Fill rate e faturamento por empresa",
        color: "text-info bg-info/10 border-info/20",
        savings: null,
        features: [
          "Importe um CSV de fill rate para análise agregada por empresa",
          "Agrupa automaticamente: fill rate ponderado, take rate médio e faturamento",
          "Expansível por empresa: cidades, tipos de trabalho, financeiro e motivos de cancelamento",
          "Filtros por Grupo Econômico, Carteira, UF e busca por nome",
          "Dados persistem no dispositivo — não precisa reimportar a cada abertura",
        ],
      },
      {
        icon: Target,
        name: "Fill Rate 2.0",
        subtitle: "Análise detalhada por empresa e carteira",
        color: "text-info bg-info/10 border-info/20",
        savings: null,
        features: [
          "KPIs da empresa: fill rate ponderado, take rate médio, número de tarefas e faturamento",
          "Breakdown por Carteira (G1–G5): fill rate, take rate, chapas e valor por grupo",
          "Tabela de todas as tarefas da empresa — cada uma expansível com detalhes",
          "Compartilha a base importada com Análise de Clientes — uma importação serve as duas páginas",
        ],
      },
      {
        icon: TrendingUp,
        name: "Tendências",
        subtitle: "Padrões dos últimos 30 dias",
        color: "text-info bg-info/10 border-info/20",
        savings: null,
        features: [
          "Fill rate médio dos últimos 30 dias com gráfico de linha diário",
          "Mapa de calor hora × dia da semana — identifica picos de volume de tarefas",
          "Top 5 empresas com pior fill rate no período (mínimo 3 tarefas)",
          "Tempo médio entre disparo do FUP e confirmação do chapa",
        ],
      },
      {
        icon: BarChart3,
        name: "Contador de Tarefas",
        subtitle: "Ranking de frequência por ajudante",
        color: "text-muted-foreground bg-muted/30 border-border",
        savings: null,
        features: [
          "Importe CSV, JSON ou XLSX para contar ocorrências por ajudante",
          "Insensível a maiúsculas e espaços — agrupa variações do mesmo nome",
          "Gráfico de barras dos top 20 + tabela completa com busca",
        ],
      },
    ],
  },
  {
    id: "sistema",
    label: "7. Configurações e Integrações",
    description: "Configure o sistema uma vez e ele trabalha do jeito que você precisa. As integrações permitem automações que eliminam trabalho manual.",
    icon: Settings,
    modules: [
      {
        icon: Settings,
        name: "Configurações",
        subtitle: "Personalize o comportamento do sistema",
        color: "text-muted-foreground bg-muted/30 border-border",
        savings: null,
        features: [
          "Painel flutuante de chapas a confirmar: ative ou desative conforme preferência",
          "Alerta sonoro ao entrar na janela de 1h",
          "Timer de sem-resposta (Disparos Umbler): define após quantos minutos o aviso laranja aparece",
          "Portaria por empresa: configure antecedência de 1h a 24h para cada cliente",
          "Fill rate threshold: defina o percentual mínimo aceitável (padrão 95%)",
          "Painel de Prioridades: ative/desative e opcionalmente oculte o nível 'Monitorar'",
          "Visualização padrão do Dashboard: Cards, Panorama ou Timeline — escolha qual modo abre ao iniciar",
          "Planilha LEO (BID): importe o CSV de Respostas BID ou sincronize pelo Google Sheets — dados usados no ranqueamento do BID Dashboard e na Análise de Base",
          "Operador: registre seu nome para rastreabilidade nos logs de FUP",
          "Backup: copia o banco de dados SQLite para Documentos/MCM com timestamp",
        ],
      },
      {
        icon: Plug,
        name: "Integrações — Umbler Talk",
        subtitle: "API de WhatsApp, webhook de respostas e listener do Windows",
        color: "text-warning bg-warning/10 border-warning/20",
        savings: null,
        features: [
          "Tela protegida por bloqueio — exige confirmação antes de exibir credenciais",
          "Configure: Bearer Token, número remetente, ID da organização",
          "Três templates configuráveis: Confirmação de Presença, Ausência de Resposta, Cancelamento Geral",
          "Template BID: convite de tarefa com data/hora, local, atividades e diária",
          "Verificação de conectividade: teste enviando uma mensagem real antes de ativar em produção",
          "Credenciais armazenadas localmente — não são enviadas a nenhum servidor além da API da Umbler",
          "Card Webhook de Respostas: exibe a URL para configurar no Umbler Talk — edite o host (IP local ou domínio público) e a porta (padrão 9988) — botão Copiar URL",
          "Como ativar o webhook: no painel Umbler Talk → Configurações → Integrações → Webhook — cole a URL do card",
          "O servidor webhook inicia automaticamente com o MCM na porta 9988 — sem configuração extra",
          "Listener de notificações Windows (legado): monitora notificações do Chrome em segundo plano — requer WhatsApp Web aberto no Chrome",
          "Ambos coexistem: webhook (recomendado) e listener do Windows funcionam simultaneamente",
        ],
      },
      {
        icon: ExternalLink,
        name: "Links Rápidos",
        subtitle: "Atalhos para sistemas externos na barra lateral",
        color: "text-muted-foreground bg-muted/30 border-border",
        savings: null,
        features: [
          "Adicione links para qualquer sistema externo: ERP, planilhas, painéis",
          "Os links aparecem na seção 'Links Rápidos' no rodapé da barra lateral",
          "Adicionar: clique no + no cabeçalho da seção, informe nome e URL",
          "Remover: clique no × que aparece ao passar o mouse sobre o link",
        ],
      },
    ],
  },
];

/* ─── automations ── */

const AUTOMATIONS = [
  { icon: RefreshCw, text: "Dashboard atualiza automaticamente a cada 30 segundos — sem nenhuma ação do usuário" },
  { icon: ArrowRight, text: "Status 'Aguardando' avança para 'Pendente' sozinho quando o horário da tarefa passa" },
  { icon: Zap, text: "Chapas novos e removidos são detectados e destacados após cada atualização automática" },
  { icon: Moon, text: "Tarefas com horário ≥ 20h são marcadas como overnight automaticamente na importação" },
  { icon: CheckCircle, text: "Tarefas 'Em Andamento' ou 'Finalizado' na importação já entram como subidas no Meu Chapa" },
  { icon: Shield, text: "Reimportação preserva confirmações, validações e remoções — nenhum trabalho feito é perdido" },
  { icon: MessagesSquare, text: "Webhook Umbler Talk: respostas ao FUP e ao BID chegam em tempo real — status atualizado, toast exibido e histórico registrado automaticamente em Respostas" },
  { icon: UserCheck, text: "Resposta 'SIM, tô nessa!' via WhatsApp confirma o chapa automaticamente e registra no painel 'Confirmações Automáticas'" },
  { icon: Smartphone, text: "Resposta 'NÃO, quero cancelar!' via WhatsApp abre aviso de remoção com botão de ação rápida" },
  { icon: Volume2, text: "Bipe sonoro quando um chapa entra na janela de 1h sem confirmação (se ativado nas Configurações)" },
  { icon: Users, text: "3+ chapas removidos após início de uma tarefa geram alerta automático de possível validação coletiva" },
  { icon: Send, text: "Disparo Umbler aguarda 60 s antes de enviar — a contagem continua ao navegar e o botão fica cancelável" },
  { icon: CheckCircle, text: "Marcar chapa como Presente no painel de validação confirma automaticamente o status_contato" },
  { icon: MessageCircle, text: "BID Dashboard: cliques manuais nos botões de status são registrados automaticamente em Respostas (fonte: manual)" },
];

/* ─── keyboard shortcuts ── */

const SHORTCUTS = [
  { keys: ["CTRL", "K"], desc: "Abrir Paleta de Comandos — navegue para qualquer página ou tarefa, busque chapas em tempo real" },
  { keys: ["/"], desc: "Focar na busca do Dashboard — encontre chapa, empresa, ID ou telefone" },
  { keys: ["T"], desc: "Voltar para o dia de hoje na navegação por data" },
  { keys: ["←", "→"], desc: "Navegar entre datas no Dashboard" },
  { keys: ["1"], desc: "Mudar para visualização Cards (detalhada)" },
  { keys: ["2"], desc: "Mudar para visualização Panorama (compacta)" },
  { keys: ["3"], desc: "Mudar para visualização Timeline (Gantt por horário)" },
  { keys: ["R"], desc: "Abrir a tela de Importação — funciona em qualquer tela exceto quando digitando num campo de texto" },
  { keys: ["Esc"], desc: "Fechar o campo de busca ativo" },
];

/* ─── tech stack ── */

const TECH = [
  { label: "Interface", value: "React 18 + TypeScript + Tailwind CSS" },
  { label: "Componentes UI", value: "shadcn/ui (Radix)" },
  { label: "Banco de dados", value: "SQLite local (tauri-plugin-sql)" },
  { label: "Desktop (EXE)", value: "Tauri v2 (Rust)" },
  { label: "Servidor webhook", value: "axum 0.7 (Rust/Tokio)" },
  { label: "Gráficos", value: "Recharts" },
  { label: "Mapas", value: "Leaflet + React-Leaflet (OpenStreetMap)" },
  { label: "Parsing CSV", value: "PapaParse" },
  { label: "Exportação Excel", value: "xlsx" },
  { label: "Mensageria", value: "Umbler Talk API (WhatsApp)" },
];

/* ─── time rows ── */

const TIME_ROWS = [
  { task: "Importar planilha do dia", manual: "15 min", fup: "30 seg", savings: "~14min", freq: "1×/dia" },
  { task: "Verificar fill rate geral", manual: "12 min", fup: "0 min", savings: "~12min", freq: "contínuo" },
  { task: "Confirmar chapas (40 chapas/dia)", manual: "100 min", fup: "3 min", savings: "~97min", freq: "40×/dia" },
  { task: "Exportar CSV por tarefa (10 tarefas)", manual: "70 min", fup: "1 min", savings: "~69min", freq: "10×/dia" },
  { task: "Exportar Pré-FUP do dia seguinte", manual: "25 min", fup: "0 min", savings: "~25min", freq: "1×/dia" },
  { task: "Buscas e verificações avulsas (~10×)", manual: "30 min", fup: "1 min", savings: "~29min", freq: "~10×/dia" },
  { task: "Alertas e listas de portaria (~3×)", manual: "9 min", fup: "0 min", savings: "~9min", freq: "~3×/dia" },
];

/* ─── sub-components ── */

function StatBadge({ icon: Icon, value, label, color }: { icon: LucideIcon; value: string; label: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
      <Icon className={`h-4 w-4 ${color}`} />
      <div className={`text-2xl font-display font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground leading-tight">{label}</div>
    </div>
  );
}

function ModuleCard({ mod }: { mod: Module }) {
  const Icon = mod.icon;
  const borderClass = mod.color.includes("primary") ? "border-primary/20"
    : mod.color.includes("warning") ? "border-warning/20"
    : mod.color.includes("success") ? "border-success/20"
    : mod.color.includes("info") ? "border-info/20"
    : "border-border";
  const bgClass = mod.color.split(" ").slice(1).join(" ");
  const iconClass = mod.color.split(" ")[0];

  return (
    <div className={`rounded-xl border bg-card overflow-hidden ${borderClass}`}>
      <div className="px-4 pt-4 pb-3 flex items-start gap-3">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${bgClass}`}>
          <Icon className={`h-4 w-4 ${iconClass}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground">{mod.name}</span>
            {mod.isNew && (
              <Badge className="text-[10px] h-4 px-1.5 bg-success text-success-foreground font-bold">NOVO</Badge>
            )}
            {mod.savings && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-success border-success/40 bg-success/5 font-semibold">
                {mod.savings}
              </Badge>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">{mod.subtitle}</span>
        </div>
      </div>
      <div className="px-4 pb-4">
        <ul className="space-y-1.5">
          {mod.features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
              <ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground/50" />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SectionBlock({ section }: { section: Section }) {
  const Icon = section.icon;
  return (
    <section id={section.id} className="space-y-4 scroll-mt-20">
      <div className="flex items-start gap-3 py-2">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="font-display font-bold text-lg text-foreground">{section.label}</h2>
          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{section.description}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {section.modules.map((mod) => (
          <ModuleCard key={mod.name} mod={mod} />
        ))}
      </div>
    </section>
  );
}

/* ─── page ── */

export default function Ajuda() {
  const totalModules = SECTIONS.reduce((a, s) => a + s.modules.length, 0);
  const newModules = SECTIONS.reduce((a, s) => a + s.modules.filter((m) => m.isNew).length, 0);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-10 pb-16">

      {/* ── Hero ── */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/8 via-primary/4 to-transparent border border-primary/20 p-6 md:p-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Guia Completo do Sistema</span>
            </div>
            <h1 className="font-display font-bold text-3xl md:text-4xl text-foreground">MCM</h1>
            <p className="text-muted-foreground mt-2 text-sm max-w-2xl leading-relaxed">
              Sistema operacional para centralizar e acelerar o controle diário de tarefas de alocação de chapas.
              Substitui planilhas isoladas e anotações dispersas por um painel único integrado ao banco de dados em tempo real.
            </p>
          </div>
          <Badge variant="outline" className="text-xs shrink-0 self-start">v1.0.15</Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <StatBadge icon={TrendingUp} value="~4h15min" label="economizados por dia (cenário base)" color="text-success" />
          <StatBadge icon={Zap} value="97%" label="mais rápido para confirmar um chapa" color="text-warning" />
          <StatBadge icon={RefreshCw} value="30s" label="ciclo de atualização automática" color="text-info" />
          <StatBadge icon={MousePointer} value="1 clique" label="para confirmar, exportar ou copiar" color="text-primary" />
        </div>

        {newModules > 0 && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 px-4 py-3">
            <Sparkles className="h-4 w-4 text-success shrink-0 mt-0.5" />
            <span className="text-xs text-success font-medium leading-relaxed">
              <strong>v1.0.15 — Novidades desta versão:</strong>{" "}
              <strong>BID — nome do chapa corrigido</strong>: nomes trocados (aparecia o nome da mãe com o telefone do chapa) foram corrigidos no cadastro — agora sempre o nome correto do chapa.{" "}
              <strong>BID — ocupados por telefone</strong>: chapas já alocados em alguma tarefa do dia são ocultados de Disponíveis também pelo número de telefone (além de CPF e nome), evitando reofertas.{" "}
              <strong>Links de tarefa atualizados</strong>: botão "Abrir tarefa no Meu Chapa" agora aponta para o novo domínio (.com).{" "}
              <strong>BID — aba Leads</strong>: aba dedicada aos Leads Saac com busca, filtro por cidade, badges ATIVADO/APROVADO/BLOQUEADO e sincronização.{" "}
              <strong>Updater manual</strong>: verificação de atualização disponível em Integrações (senha de acesso).{" "}
              <strong>Notificações filtradas pela carteira</strong>: respostas de empresas fora do filtro de grupos não geram notificação — atualiza em tempo real ao trocar o filtro.
            </span>
          </div>
        )}
      </div>

      {/* ── Sumário ── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-sm text-foreground">Sumário — O que você quer ver?</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Clique para ir direto à seção desejada.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {TOC_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium text-left transition-colors ${
                  item.accent
                    ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                    : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="font-bold text-primary shrink-0">1.</span>
            <span>Clique em <strong className="text-foreground">Fluxo do Dia</strong> primeiro — ele mostra o turno completo em 5 etapas.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-primary shrink-0">2.</span>
            <span>Use os números (1–7) para navegar a módulos específicos quando quiser entender uma função.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-primary shrink-0">3.</span>
            <span>Módulos com badge <strong className="text-success">NOVO</strong> foram adicionados recentemente — leia-os para aproveitar as últimas funções.</span>
          </div>
        </div>
      </div>

      {/* ── Fluxo Operacional — MOVIDO PARA O TOPO ── */}
      <section id="fluxo" className="space-y-4 scroll-mt-20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="font-display font-bold text-xl text-foreground">Fluxo Operacional Típico</h2>
          </div>
          <p className="text-sm text-muted-foreground">O dia completo em 5 etapas. Siga este fluxo até ele se tornar automático.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="space-y-0">
            {[
              {
                time: "07:00 — Início do turno",
                title: "Importar e verificar",
                desc: "Receba a planilha → Importar em 30 segundos. O Dashboard abre com todas as tarefas do dia. Chapas já confirmados de importações anteriores estão preservados. Verifique o fill rate geral e o Painel de Prioridades.",
              },
              {
                time: "Manhã — FUPs e confirmações",
                title: "Disparar e confirmar",
                desc: "Use 'FUP Todos' para disparar Umbler para toda a tarefa de uma vez, ou 'Enviar Umbler' individualmente. Respostas SIM confirmam automaticamente via webhook e aparecem em 'Confirmações Automáticas'. Respostas NÃO mostram aviso de remoção. Todo o histórico fica em Operacional → Respostas.",
              },
              {
                time: "Ao longo do dia — Monitoramento",
                title: "Acompanhar e reagir",
                desc: "O Painel Flutuante avisa quando uma tarefa chega a menos de 1h sem fill suficiente. O Painel de Prioridades ranqueia o que precisa de atenção agora. Para portarias configuradas: copie a lista de nomes com 1 clique.",
              },
              {
                time: "Após início — Validação",
                title: "Marcar presenças e exportar",
                desc: "Marque Presente ou Ausente por chapa no card. Exporte o CSV pronto para o Meu Chapa. Registre ocorrências de remoção se necessário — a mensagem de substituição é gerada automaticamente.",
              },
              {
                time: "14h45 / Fim do turno — Passagem",
                title: "Gerar a Troca de Turno",
                desc: "Clique em 'Troca de Turno' na barra lateral. Selecione a carteira/grupo. Revise validações pendentes, confirmações em aberto e BID. Copie a mensagem para o Teams. Exporte o Pré-FUP de amanhã (1 clique → CSV pronto por empresa).",
              },
            ].map((step, i, arr) => (
              <div key={i} className="flex gap-4 relative">
                <div className="flex flex-col items-center">
                  <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0 z-10">
                    <span className="text-xs font-bold text-primary">{i + 1}</span>
                  </div>
                  {i < arr.length - 1 && <div className="w-px flex-1 bg-border mt-1 mb-1 min-h-[20px]" />}
                </div>
                <div className="pb-5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-[11px] font-bold text-primary">{step.time}</span>
                    <span className="text-sm font-semibold text-foreground">{step.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Sections 1–7 ── */}
      {SECTIONS.map((section, si) => (
        <div key={section.id}>
          <SectionBlock section={section} />
          {si < SECTIONS.length - 1 && <Separator className="mt-8" />}
        </div>
      ))}

      <Separator />

      {/* ── Automações silenciosas ── */}
      <section id="automacoes" className="space-y-4 scroll-mt-20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-display font-bold text-xl text-foreground">Automações Silenciosas</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Estas ações acontecem sem nenhuma intervenção do usuário. O sistema trabalha em segundo plano.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {AUTOMATIONS.map(({ icon: Icon, text }, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* ── Atalhos de teclado ── */}
      <section id="atalhos" className="space-y-4 scroll-mt-20">
        <div>
          <h2 className="font-display font-bold text-xl text-foreground">Atalhos de Teclado</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Funcionam em qualquer tela, exceto quando digitando em um campo de texto. Pressione Esc para sair do campo e reativar os atalhos.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <div className="flex items-center gap-1 shrink-0">
                {s.keys.map((k) => (
                  <kbd key={k} className="inline-flex min-h-[28px] min-w-[28px] items-center justify-center rounded-md border border-border bg-muted px-2 font-mono text-xs font-semibold text-foreground shadow-sm">
                    {k}
                  </kbd>
                ))}
              </div>
              <span className="text-sm text-muted-foreground">{s.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* ── Comparativo de tempo ── */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display font-bold text-xl text-foreground">Comparativo de Tempo</h2>
          <p className="text-sm text-muted-foreground mt-1">Cenário base: 10 tarefas/dia · média de 4 chapas por tarefa.</p>
        </div>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tarefa</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Processo manual</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">MCM</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-success uppercase tracking-wide">Economia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {TIME_ROWS.map((row, i) => (
                <tr key={i} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-foreground text-sm">{row.task}</td>
                  <td className="px-3 py-3 text-center text-muted-foreground tabular-nums text-sm">{row.manual}</td>
                  <td className="px-3 py-3 text-center text-success font-medium tabular-nums text-sm">{row.fup}</td>
                  <td className="px-3 py-3 text-center">
                    <Badge variant="outline" className="text-success border-success/30 bg-success/5 text-xs font-bold">{row.savings}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30">
                <td className="px-4 py-3 font-bold text-foreground text-sm">Total</td>
                <td className="px-3 py-3 text-center font-bold text-destructive tabular-nums">~261 min</td>
                <td className="px-3 py-3 text-center font-bold text-success tabular-nums">~6 min</td>
                <td className="px-3 py-3 text-center">
                  <Badge className="bg-success text-success-foreground text-xs font-bold">~255 min/dia</Badge>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <Separator />

      {/* ── Tech ── */}
      <section className="space-y-4">
        <h2 className="font-display font-bold text-xl text-foreground">Infraestrutura Técnica</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {TECH.map((t) => (
            <div key={t.label} className="rounded-lg border border-border bg-card px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">{t.label}</p>
              <p className="text-xs text-foreground font-medium">{t.value}</p>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* ── Sobre ── */}
      <section className="space-y-4">
        <h2 className="font-display font-bold text-xl text-foreground">Sobre</h2>
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h3 className="font-display font-bold text-lg text-foreground">MCM</h3>
              <p className="text-sm text-muted-foreground">Sistema operacional para gestão de tarefas de alocação de chapas</p>
            </div>
            <Badge variant="outline" className="text-xs shrink-0">v1.0.15 · {totalModules} módulos</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Desenvolvedor</p>
                <p className="text-foreground font-medium">Wijngaarde Design</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Contato</p>
                <p className="text-foreground">wijngaardedesign@gmail.com</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Plataforma</p>
                <p className="text-foreground">Windows — Tauri v2 + React 18</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Banco de dados</p>
                <p className="text-foreground">SQLite local — dados armazenados neste dispositivo</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              © 2026 <strong className="text-foreground">Wijngaarde Design</strong>. Todos os direitos reservados.
              Este software é de propriedade exclusiva de Wijngaarde Design e foi desenvolvido sob medida para uso interno.
              É vedada a reprodução, distribuição ou comercialização sem autorização expressa do titular.
            </p>
          </div>
        </div>
      </section>

      <div className="text-center text-xs text-muted-foreground pt-4">
        MCM v1.0.15 · © 2026 Wijngaarde Design
      </div>
    </div>
  );
}
