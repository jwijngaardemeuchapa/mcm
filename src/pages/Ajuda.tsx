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
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

/* ─────────────────────────── types ── */

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

/* ─────────────────────────── sections ── */

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
          "Dois modos de visualização: Cards (detalhado por tarefa) e Panorama (tabela compacta) — alterne com as teclas 1 e 2",
          "Busca unificada sem acento — encontre qualquer chapa, empresa, ID ou telefone — ative com a tecla /",
          "Filtros por empresa, horário de início, status de upload e 'só pendentes' — o filtro de empresa é lembrado entre visitas",
          "Filtro 'Sem FUP Umbler': mostra apenas tarefas onde nenhum chapa recebeu FUP via Umbler Talk — útil para identificar o que ainda precisa ser disparado",
          "Ocultar empresa: o ícone de olho na aba Carteira oculta a empresa de todo o Dashboard (cards do dia, overnight e contadores de fill rate) — funciona em tempo real sem precisar reimportar",
          "Fill rate geral no topo + breakdown expansível por empresa",
          "Navegação por data: setas ← → do teclado para ver tarefas de outros dias — tecla T volta para hoje",
          "Exportação Pré-FUP do dia seguinte: gera CSV agrupado por empresa em 1 clique",
          "Paleta de comandos CTRL+K: navegue para qualquer página ou tarefa sem usar o mouse — busca chapas em tempo real com 2+ caracteres digitados",
          "Atalhos rápidos: / (busca) · T (hoje) · ← → (dia) · 1/2 (modo) · R (importar)",
          "Botão BID nos cards com vagas em aberto: abre o BID Dashboard direto na tarefa, já expandido — aparece somente quando há slots sem chapa alocado",
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
          "Emergente (vermelho): sem chapas confirmados com início próximo, fill < 50% em menos de 1h, ou tarefa marcada como urgente",
          "Urgente (laranja): fill abaixo do threshold em até 1h30, overnight com fill baixo, ou tarefas grandes com vagas em aberto",
          "Monitorar (azul): fill abaixo do threshold entre 1h30 e 8h — pode ser ocultado nas Configurações",
          "Tarefas já validadas pelo cliente saem automaticamente do ranking",
          "Countdown ao lado de cada tarefa — fica vermelho quando faltam menos de 60 min",
          "Botão 'Ver' rola e destaca o card — você não perde o contexto do que estava fazendo",
          "Algoritmo considera impacto no fill rate (tarefas pequenas têm peso maior) e faturamento (tarefas grandes têm mais destaque)",
          "Colapsável: minimize para ganhar espaço sem perder o alerta no cabeçalho",
        ],
      },
      {
        icon: UserCheck,
        name: "Confirmações Automáticas",
        subtitle: "Registro em tempo real do listener de WhatsApp",
        color: "text-success bg-success/10 border-success/20",
        savings: null,
        features: [
          "Painel aparece automaticamente no Dashboard quando o listener detecta respostas — fica oculto quando não há atividade",
          "Três tipos de eventos registrados: Confirmado (chapa respondeu SIM), Recusou (respondeu NÃO), Removido (você clicou em Remover no aviso)",
          "Cada entrada mostra: nome do chapa, tipo de ação com badge colorido, empresa e horário da tarefa, tempo relativo ('agora', '3 min', '1h')",
          "Botão 'Ver' em cada entrada vai diretamente para o card da tarefa no Dashboard",
          "Botão 'Limpar' no cabeçalho apaga o log da sessão atual",
          "Os dados são da sessão — somem ao recarregar, evitando acúmulo de informações antigas",
          "Para o listener funcionar: notificações do Chrome precisam estar ativadas no Windows (veja Integrações)",
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
          "Botões Umbler aparecem apenas se o chapa tiver telefone cadastrado e Umbler estiver configurado",
          "Alerta de portaria: aviso antecipado configurável por empresa (1h a 24h antes do início)",
          "Copiar lista de nomes da tarefa para portaria com 1 clique",
          "Botão 'Concluído' em cada alerta de portaria: clique após enviar a lista para fechar o aviso — ele não reaparece na sessão atual",
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
          "Após cada atualização, o sistema compara o estado anterior com o novo e destaca o que mudou",
          "Chapas novos: exibidos com badge 'NOVO' verde no card por 20 minutos — persiste entre as atualizações automáticas enquanto o chapa continuar na tarefa",
          "Chapas removidos externamente (saíram da planilha): abre workflow de ocorrência",
          "7 tipos de ocorrência com mensagem formatada pronta para copiar e enviar ao time",
          "Detecção automática de validação coletiva do cliente: 3+ chapas removidos após início da tarefa geram alerta específico",
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
          "Enviar Umbler: dispara template de confirmação via API com delay de 60 s — a contagem continua mesmo se você navegar para outra página — clique no botão durante a contagem para cancelar",
          "Botão 'Enviado (Nx)': mostra quantas vezes aquele chapa já foi contactado via Umbler — sempre resendável, o contador atualiza automaticamente",
          "Sem resp.: dispara template de ausência de resposta — mesmo delay de 60 s com cancelamento",
          "FUP Todos: dispara confirmação para todos os chapas da tarefa de uma vez — delay de 3 min antes do primeiro, 10 s entre cada disparo — a contagem continua rodando mesmo se você navegar para outra página — 'FUP Todos (Nx)' mostra quantas rodadas foram feitas e permite reenviar",
          "Cancelar Tarefa: notifica todos os chapas sobre cancelamento geral — 60 s de delay",
          "Confirmar todos: confirma todos os chapas pendentes de uma vez (disponível quando faltam ≤ 2h para início)",
          "Indicador de fuso horário (−1h ou −2h) exibido abaixo do horário em tarefas de cidades fora do UTC-3 — ex: Cuiabá/MT, Manaus/AM, Rio Branco/AC; todos os cálculos de prazo e fill rate já consideram o fuso correto",
          "Flag de FUP some automaticamente quando todos os chapas estão confirmados — a sinalização reaparece se alguma confirmação for desfeita",
          "Validar presença: marque Presente ou Ausente por chapa após início da tarefa — marcar Presente confirma automaticamente o status de contato do chapa, sem etapa extra",
          "Exportar CSV pronto para upload no Meu Chapa — botão fica verde após o primeiro export",
          "Copiar lista completa (Nome + CPF) ou só nomes (todos ou só confirmados) — para portaria e outros usos",
          "CPF dos confirmados: opção no menu 'Copiar Nomes' que filtra chapas com status Confirmado, busca o CPF pelo telefone na base do cadastro geral e copia a lista 'Nome — CPF' para a área de transferência — útil para preencher CPFs faltantes antes da validação do cliente",
          "Registrar FUP manual: informe o canal e uma observação livre para registrar no histórico",
          "Histórico de FUPs: todos os disparos com data, canal e observação — colapsável no rodapé do card",
          "Remover chapa: informa motivo e gera mensagem formatada de substituição pronta para copiar",
          "Editar telefone diretamente no card sem sair da tela",
          "Menu ⋯ por chapa: Não respondeu, Ligação 3C, Editar telefone, Ver no Caderno de Chapas, Sinalizar remoção, Reabrir",
          "Acesso direto ao Caderno de Chapas pelo nome do chapa",
          "Undo/Redo em todas as ações da sessão — Ctrl+Z desfaz a última ação",
        ],
      },
    ],
  },
  {
    id: "comunicacao",
    label: "3. Comunicação via Umbler e FUPs",
    description: "Tudo que envolve enviar mensagens, acompanhar respostas e gerar relatórios de turno. O objetivo é fechar o ciclo: disparar, receber confirmação, registrar.",
    icon: Send,
    modules: [
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
          "PréFUPs realizados aparecem automaticamente na mensagem de Troca de Turno na seção de Confirmações",
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
          "Tarefas já validadas e subidas no Meu Chapa ficam ocultas automaticamente — a lista mostra apenas o que ainda precisa de ação",
          "Aba 'Aguardando Resposta': lista chapas contactados via Umbler de tarefas de hoje ou futuras que ainda não confirmaram nem foram removidos",
          "Timer pós-disparo: quando o tempo configurado passa sem resposta, aparece o badge laranja 'Sem resposta' ao lado do nome do chapa — o card da tarefa também recebe destaque de borda",
          "Após 2× o tempo configurado sem resposta: badge e borda viram vermelho (urgente)",
          "O timer é contado a partir do último disparo registrado em fup_log — se o chapa recebeu 'Sem resp.' depois do FUP inicial, o relógio reinicia a partir desse reenvio",
          "Contador no topo: 'X sem resposta >Nmin' mostra quantos chapas já passaram do limite",
          "Aba 'Histórico de Disparos': todos os FUPs via Umbler registrados no banco, mais recentes primeiro",
          "Três tipos de disparo no histórico: FUP Confirmação (azul), Sem Resposta (laranja), Cancelamento Geral (vermelho)",
          "Resumo do dia no topo do histórico: contadores por tipo de disparo",
          "Botão 'Ver tarefa' em cada linha navega direto ao card no Dashboard com destaque visual",
          "Botão 'Atualizar' no canto superior direito recarrega os dados em tempo real",
          "O tempo do timer é configurável em Configurações → Alertas → Timer de sem-resposta",
        ],
      },
      {
        icon: ArrowLeftRight,
        name: "Troca de Turno",
        subtitle: "Mensagem formatada para o Teams — gerada em segundos",
        color: "text-primary bg-primary/10 border-primary/20",
        savings: "~5min/turno",
        features: [
          "Acesse pelo botão 'Troca de Turno' no rodapé da barra lateral ou na barra do Dashboard",
          "A mensagem usa apenas tarefas da sua carteira cadastrada — mesma lógica de filtro do Dashboard",
          "Selector de Carteira: filtre por G1–G5 ou 'Todos' para gerar a mensagem do grupo correto",
          "Incluir item da Agenda: selecione uma tarefa da agenda para acrescentar ao final da mensagem",
          "Seção Validações Pendentes: mostra tarefas do dia que já iniciaram e ainda não foram validadas pelo cliente",
          "Seção Confirmações: todas as tarefas futuras com chapas ainda não confirmados — mostra X/Y confirmados sem exibir nomes individuais",
          "Label [PréFUP] aparece automaticamente para tarefas de amanhã ou tarefas de hoje a partir das 17h",
          "Seção BID — Captações em aberto: tarefas do dia a partir de 14h45 com vagas em aberto",
          "Cabeçalho com dia da semana, data e horário atual — formatado para copiar direto no Teams",
          "Botão 'Copiar para Teams': copia a mensagem com formatação markdown (*negrito*) pronta para colar",
          "Botão 'Atualizar': regenera a mensagem com os dados mais recentes sem fechar o modal",
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
          "Preservação de progresso: chapas já confirmados, validados ou removidos não regridem na reimportação — você não perde trabalho feito",
          "Auto-validação: tarefas com status 'Em Andamento' ou 'Finalizado' já entram como subidas no Meu Chapa",
          "Overnight automático: tarefas com horário ≥ 20h (fuso de SP) são marcadas como overnight",
          "Todas as tarefas são salvas no banco — o filtro por carteira acontece na exibição do Dashboard, não no import; nenhuma tarefa é descartada permanentemente",
          "Cadastro Geral de Chapas (XLSX): detecção automática de colunas pelo cabeçalho do arquivo — funciona mesmo que as colunas estejam em ordem diferente; aceita arquivos com 100k+ linhas sem travar; chapas sem CPF são incluídos normalmente",
          "Barra de progresso em tempo real durante importação do cadastro geral — a interface não congela mesmo com arquivos grandes",
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
        icon: Send,
        name: "BID Dashboard",
        subtitle: "Captação de chapas · Cadastro geral · Bloqueados · Disparo via Umbler",
        color: "text-primary bg-primary/10 border-primary/20",
        savings: null,
        isNew: true,
        features: [
          // ── Estrutura de abas
          "Três abas no topo: Tarefas (captação ativa), Bloqueados (análise e disparo de bloqueados) e Cadastro (registro completo) — as abas ficam sempre visíveis; quando o cadastro não foi importado, exibe aviso com botão para ir direto à tela de importação",

          // ── Aba Tarefas — cards
          "Aba Tarefas — layout multi-tarefa: um card expansível por tarefa com vagas em aberto, similar ao Dashboard de FUP — gerencie vários BIDs simultaneamente",
          "ID da tarefa no cabeçalho de cada card: link clicável que abre a tarefa diretamente no Meu Chapa (app.meu-chapa.net)",
          "Botão BID direto nos cards do FUP Dashboard: aparece nos cards com vagas em aberto e abre o BID Dashboard já expandido na tarefa correta",
          "Tarefas ignoradas automaticamente: Em Andamento, Concluído, Finalizado, Cancelado ou com início há mais de 2h — o BID só exibe o que ainda pode ser captado",

          // ── Configuração do disparo
          "CEP do local obrigatório: campo de CEP no painel de configuração — o disparo fica bloqueado até ser preenchido; é auto-preenchido quando o endereço vem do Caderno de Clientes",
          "Seletor de endereço pesquisável: clientes com múltiplos endereços usam um combobox com busca por texto — cada opção mostra o CEP salvo abaixo do rótulo",
          "Botão 'Salvar no cadastro': aparece quando o CEP digitado é diferente do CEP salvo no endereço selecionado — atualiza o Caderno de Clientes com 1 clique para agilizar disparos futuros",
          "Para clientes sem endereço cadastrado, aparece dica para registrar no Caderno de Clientes (menu Gestão → Caderno de Clientes)",
          "Link Maps opcional: informe a URL do Google Maps para ativar ranking por distância exata; sem link Maps, o CEP raiz é usado como filtro de proximidade",
          "Calculadora de Negociação: informe a receita da tarefa e a diária ofertada para calcular lucro, margem e máximo sustentável por chapa (30% de margem)",

          // ── Candidatos, ranking e filtros
          "Filtro de raio configurável: quando há link Maps com coordenadas GPS, escolha o raio de busca — 10 / 20 / 30 / 50 / 100 km ou sem limite — padrão 30 km; o seletor aparece no cabeçalho da lista de candidatos",
          "Filtro de proximidade híbrido: quando há link Maps com coordenadas, exibe candidatos dentro do raio selecionado; quando só há CEP, filtra por CEP raiz (5 primeiros dígitos = mesma micro-região); quando não há nenhum dos dois, exibe todos da cidade/UF",
          "Ranking automático de candidatos: score combinado por histórico de tarefas, proximidade (proporcional ao raio selecionado), recência da última tarefa (até +40 pts), situação ativa (+20 pts), CEP raiz (+20 pts sem GPS) e ASO válido (+10 pts)",
          "Geocoding em background: CEPs sem coordenadas são consultados na API Nominatim (1 req/seg) e cacheados no banco local — o score atualiza automaticamente quando as coordenadas chegam",
          "Chapas ocupados no mesmo dia ficam ocultos da lista principal — clique em 'Ver ocupados' para consultá-los",
          "Seleção múltipla + 'Disparar (N)': dispara BID em lote com 7 s de intervalo entre cada mensagem — cancelável durante o processo",
          "Disparo individual por chapa via ícone de envio",
          "Polling de respostas a cada 5 s: Interesse SIM/NÃO, aceita/não aceita App, Precisa Ajuda — cada resposta atualiza o badge em tempo real",

          // ── Tab Disponíveis / Bloqueados por tarefa
          "Cada card de tarefa tem duas sub-abas de candidatos: 'Disponíveis' (não bloqueados, filtro normal de distância) e 'Bloqueados' (chapas com bloqueio registrado na mesma cidade)",
          "Aba Bloqueados por tarefa: carrega sob demanda ao primeiro clique — aplica o mesmo filtro de raio e ranking de distância dos disponíveis",
          "Disparo para bloqueados: selecione um ou mais chapas bloqueados e use 'Disparar (N)' normalmente — aviso laranja lembra que o chapa está bloqueado",
          "Uso com critério: o disparo para bloqueados sobrescreve o impedimento registrado — utilize apenas quando houver autorização explícita",

          // ── Importar extras
          "Importar lista complementar: além do cadastro geral, importe uma lista avulsa de reforço — suporte a CSV (colunas nome + telefone) e ao arquivo XLSX legado do Busca Chapa",
          "A importação de extras é aditiva ao cadastro geral — os dois conjuntos aparecem na lista de candidatos com ranking unificado",

          // ── Aba Bloqueados (global)
          "Aba Bloqueados global — todos os chapas do cadastro com bloqueio registrado, agrupados por motivo — estatísticas de total bloqueado, não bloqueado e taxa de bloqueio",
          "Grupos expansíveis: busca por nome e filtro por estado (UF) dentro de cada grupo",
          "Enviar BID ad-hoc para bloqueado: ícone de envio em cada linha abre um formulário com data/hora, local, atividades e diária — envia via Umbler sem vínculo com uma tarefa específica",
          "Copiar qualquer dado da lista clicando sobre ele",

          // ── Aba Cadastro
          "Aba Cadastro — visualização completa do cadastro de chapas, com pesquisa e filtros avançados",
          "Filtros: nome/CPF, estado (UF), status de bloqueio (com/sem bloqueio), presença de ASO — paginação de 50 registros",
          "Exportar CSV: baixa os resultados filtrados com BOM UTF-8 — pronto para abrir no Excel",
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
          "Busca por número de telefone (parcial): filtra ajudantes pelo telefone cadastrado — insensível a formatação, basta digitar os dígitos",
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
          "Campos por chapa: nome, CPF, dois telefones, grupo, empresas associadas, observações e pedidos",
          "Status: Ativo / Inativo / Bloqueado — com filtro rápido no topo da página",
          "Busca por nome, telefone, empresa ou grupo — insensível a acentos",
          "Card expansível: revela CPF, grupo, empresas, observações e pedidos completos",
          "Copiar nome do chapa com 1 clique",
          "Acesso direto pelo card de tarefa no Dashboard: clique no ícone de caderno ao lado do nome do chapa para abrir já filtrado",
        ],
      },
      {
        icon: BookMarked,
        name: "Caderno de Clientes",
        subtitle: "Registro de particularidades, exigências e pedidos por empresa",
        color: "text-info bg-info/10 border-info/20",
        savings: null,
        features: [
          "Acesse pelo menu lateral em Gestão → Caderno de Clientes",
          "Registre informações permanentes de cada cliente que não estão nas planilhas operacionais",
          "Campos estruturados: nome fantasia, CNPJ, contato responsável, telefone, e-mail, segmento",
          "Múltiplos endereços por cliente com campo de CEP: o BID Dashboard lê esses endereços automaticamente ao abrir um card da empresa — ao selecionar um endereço, o CEP é preenchido no campo de disparo",
          "Botão 'Salvar no cadastro' no BID: quando o CEP é digitado manualmente no disparo, ele aparece para salvar de volta ao endereço do cliente — evita digitar o mesmo CEP toda vez",
          "Campos de texto livre dedicados: Particularidades (comportamentos, restrições), Exigências constantes (EPI, uniforme, documentos), Pedidos recorrentes, Observações gerais",
          "Status do cliente: Ativo / Inativo / Suspenso — com filtro rápido",
          "Busca por nome, CNPJ, contato, telefone, segmento ou e-mail — insensível a acentos",
          "Card expansível: revela todos os campos de texto sem poluir a listagem",
          "Use para documentar: 'Cliente exige chapa com CNH', 'Portaria fecha às 22h', 'Pagamento somente via NF' — tudo centralizado",
        ],
      },
      {
        icon: Building2,
        name: "Carteira",
        subtitle: "Lista de empresas autorizadas no sistema",
        color: "text-muted-foreground bg-muted/30 border-border",
        savings: null,
        features: [
          "A carteira controla quais empresas aparecem no Dashboard — empresas fora da carteira são filtradas na exibição; os dados permanecem no banco",
          "Upload de CSV com a lista de empresas",
          "Preview com duplicatas identificadas antes de confirmar",
          "Opção de substituir toda a carteira ou adicionar à existente",
          "Busca e remoção individual de empresas",
          "Ocultar empresa do Dashboard: o ícone de olho em cada linha permite ocultar pontualmente sem remover da carteira",
          "Configure o Grupo (G1–G5) de cada empresa para usar o filtro de carteira na Troca de Turno",
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
          "Indicador visual de prazo: laranja quando faltam ≤ 2h, vermelho quando vencido",
          "Banner de alertas no Dashboard avisa quando uma tarefa da agenda está com prazo próximo (≤ 2h)",
          "Itens da agenda podem ser incluídos na mensagem de Troca de Turno",
          "Dados persistidos no banco local — não se perdem ao fechar o app",
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
          "Importe um CSV de fill rate (uma linha por tarefa) para análise agregada",
          "Agrupa automaticamente por empresa: fill rate ponderado, take rate médio e faturamento",
          "Expansível por empresa: cidades, tipos de trabalho, financeiro e motivos de cancelamento",
          "Filtros por Grupo Econômico, Carteira, UF e busca por nome",
          "Ordenação por fill rate, tarefas finalizadas, chapas, valor ou nome",
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
          "Selecione qualquer empresa da base importada para análise detalhada",
          "KPIs da empresa: fill rate ponderado, take rate médio, número de tarefas e faturamento total",
          "Breakdown por Carteira (G1–G5): fill rate, take rate, chapas e valor por grupo",
          "Tabela de todas as tarefas da empresa com status, fill, take rate, cidade e valor",
          "Cada tarefa é expansível: data, grupo econômico, repasse e motivo de cancelamento",
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
          "Top 5 empresas com pior fill rate no período (mínimo 3 tarefas para entrar no ranking)",
          "Tempo médio entre disparo do FUP e confirmação do chapa",
          "KPIs no cabeçalho: fill rate médio, total de tarefas e tempo médio FUP→confirmação",
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
          "Exibe total de linhas, ajudantes únicos e líder do ranking",
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
          "Alerta sonoro ao entrar na janela de 1h: bipe quando um chapa fica pendente de confirmação",
          "Timer de sem-resposta (Disparos Umbler): define após quantos minutos sem resposta o aviso laranja aparece — opções de 15 min a 2h, padrão 30 min; após 2× o tempo, o aviso vira vermelho",
          "Portaria por empresa: configure antecedência de 1h a 24h para cada cliente que precisa de lista",
          "Fill rate threshold: defina o percentual mínimo aceitável (padrão 95%) — usado pelo Painel de Prioridades e painel flutuante",
          "Painel de Prioridades: ative/desative e opcionalmente oculte o nível 'Monitorar'",
          "Visualização padrão do Dashboard: escolha entre Cards ou Panorama",
          "Operador: registre seu nome para rastreabilidade nos logs de FUP",
          "Backup: copia o banco de dados SQLite para Documentos/MCM com timestamp em 1 clique",
        ],
      },
      {
        icon: Plug,
        name: "Integrações — Umbler Talk",
        subtitle: "Configurar a API de WhatsApp e o listener de respostas",
        color: "text-warning bg-warning/10 border-warning/20",
        savings: null,
        features: [
          "Tela protegida por bloqueio — exige confirmação antes de exibir credenciais",
          "Configure: Bearer Token (autenticação), número remetente, ID da organização",
          "Três templates configuráveis: Confirmação de Presença (param1=data/hora, param2=empresa), Ausência de Resposta (sem variáveis), Cancelamento Geral (param1=código da tarefa, param2=data/hora)",
          "Verificação de conectividade: teste enviando uma mensagem real para um número de teste antes de ativar em produção",
          "Credenciais armazenadas localmente no dispositivo — não são enviadas a nenhum servidor além da API da Umbler",
          "Listener de respostas WhatsApp: monitora as notificações do Windows em segundo plano (a cada 5 segundos)",
          "Como funciona o listener: quando um chapa responde 'SIM, tô nessa!' na mensagem do WhatsApp, o sistema confirma automaticamente; 'NÃO, quero cancelar!' exibe aviso com botão 'Remover'",
          "Ao clicar em 'Remover' na notificação de recusa, o comportamento varia por visão do Dashboard — na visão Cards: destaca (pisca) o card da tarefa e marca o nome do chapa com borda vermelha por 2,5 segundos; na visão Panorama: abre o painel lateral da tarefa com o diálogo de remoção já aberto para o chapa correto",
          "As confirmações e recusas detectadas aparecem no painel 'Confirmações Automáticas' no Dashboard",
          "Requisito do listener: notificações do Chrome precisam estar ativadas no Windows — o sistema fica dormente automaticamente se não conseguir acessar o banco de notificações",
        ],
      },
      {
        icon: ExternalLink,
        name: "Links Rápidos",
        subtitle: "Atalhos para sistemas externos na barra lateral",
        color: "text-muted-foreground bg-muted/30 border-border",
        savings: null,
        features: [
          "Adicione links para qualquer sistema externo: ERP, planilhas, painéis, sistemas do cliente",
          "Os links aparecem na seção 'Links Rápidos' no rodapé da barra lateral",
          "Todos os links abrem no navegador padrão do sistema",
          "Adicionar: clique no + no cabeçalho da seção, informe nome e URL",
          "Remover: clique no × que aparece ao passar o mouse sobre o link",
        ],
      },
    ],
  },
];

/* ─────────────────────────── automations ── */

const AUTOMATIONS = [
  { icon: RefreshCw, text: "Dashboard atualiza automaticamente a cada 30 segundos — sem nenhuma ação do usuário" },
  { icon: ArrowRight, text: "Status 'Aguardando' avança para 'Pendente' sozinho quando o horário da tarefa passa" },
  { icon: Zap, text: "Chapas novos e removidos são detectados e destacados após cada atualização automática" },
  { icon: Moon, text: "Tarefas com horário ≥ 20h são marcadas como overnight automaticamente na importação" },
  { icon: CheckCircle, text: "Tarefas 'Em Andamento' ou 'Finalizado' na importação já entram como subidas no Meu Chapa" },
  { icon: Shield, text: "Reimportação preserva confirmações, validações e remoções — nenhum trabalho feito é perdido" },
  { icon: UserCheck, text: "Resposta 'SIM, tô nessa!' via WhatsApp confirma o chapa automaticamente e registra no painel 'Confirmações Automáticas'" },
  { icon: Smartphone, text: "Resposta 'NÃO, quero cancelar!' via WhatsApp abre aviso de remoção com botão de ação rápida" },
  { icon: Volume2, text: "Bipe sonoro quando um chapa entra na janela de 1h sem confirmação (se ativado nas Configurações)" },
  { icon: Users, text: "3+ chapas removidos após início de uma tarefa geram alerta automático de possível validação coletiva do cliente" },
  { icon: Send, text: "Disparo Umbler aguarda 60 s antes de enviar — a contagem continua ao navegar para outra tela e o botão fica cancelável durante toda a contagem" },
  { icon: CheckCircle, text: "Marcar chapa como Presente no painel de validação confirma automaticamente o status_contato — elimina uma etapa de clique" },
  { icon: Clock, text: "Cálculos de prazo, Painel de Prioridades e alertas consideram fuso local da tarefa — UTC-4 para MT/AM/RO/MS/RR, UTC-5 para AC" },
  { icon: XCircle, text: "Cancelamento geral notifica todos os chapas da tarefa em sequência após delay de segurança" },
  { icon: CalendarDays, text: "Resumo diário aparece ao abrir o app: tarefas, chapas, pendências e overnight — exibido 1 vez por dia" },
  { icon: Command, text: "Paleta de comandos (CTRL+K): navegação instantânea por qualquer página, tarefa recente ou chapa — disponível em toda a aplicação" },
];

/* ─────────────────────────── time rows ── */

const TIME_ROWS = [
  { task: "Importar planilha do dia", manual: "15 min", fup: "30 seg", savings: "~14min", freq: "1×/dia" },
  { task: "Verificar fill rate geral", manual: "12 min", fup: "0 min", savings: "~12min", freq: "contínuo" },
  { task: "Confirmar chapas (40 chapas/dia)", manual: "100 min", fup: "3 min", savings: "~97min", freq: "40×/dia" },
  { task: "Exportar CSV por tarefa (10 tarefas)", manual: "70 min", fup: "1 min", savings: "~69min", freq: "10×/dia" },
  { task: "Exportar Pré-FUP do dia seguinte", manual: "25 min", fup: "0 min", savings: "~25min", freq: "1×/dia" },
  { task: "Buscas e verificações avulsas (~10×)", manual: "30 min", fup: "1 min", savings: "~29min", freq: "~10×/dia" },
  { task: "Alertas e listas de portaria (~3×)", manual: "9 min", fup: "0 min", savings: "~9min", freq: "~3×/dia" },
];

/* ─────────────────────────── keyboard shortcuts ── */

const SHORTCUTS = [
  { keys: ["CTRL", "K"], desc: "Abrir Paleta de Comandos — navegue para qualquer página ou tarefa, busque chapas em tempo real (2+ letras)" },
  { keys: ["/"], desc: "Focar na busca do Dashboard — encontre chapa, empresa, ID ou telefone" },
  { keys: ["T"], desc: "Voltar para o dia de hoje na navegação por data" },
  { keys: ["←", "→"], desc: "Navegar entre datas no Dashboard" },
  { keys: ["1"], desc: "Mudar para visualização Cards (detalhada)" },
  { keys: ["2"], desc: "Mudar para visualização Panorama (compacta)" },
  { keys: ["R"], desc: "Abrir a tela de Importação — funciona em qualquer tela exceto quando digitando num campo de texto" },
  { keys: ["Esc"], desc: "Fechar o campo de busca ativo" },
];

const TECH = [
  { label: "Interface", value: "React 18 + TypeScript + Tailwind CSS" },
  { label: "Componentes UI", value: "shadcn/ui (Radix)" },
  { label: "Banco de dados", value: "SQLite local (tauri-plugin-sql)" },
  { label: "Desktop (EXE)", value: "Tauri v2 (Rust)" },
  { label: "Gráficos", value: "Recharts" },
  { label: "Parsing CSV", value: "PapaParse" },
  { label: "Exportação Excel", value: "xlsx" },
  { label: "Mensageria", value: "Umbler Talk API (WhatsApp)" },
];

/* ─────────────────────────── sub-components ── */

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
              <Badge className="text-[9px] h-4 px-1.5 bg-success text-success-foreground font-bold">NOVO</Badge>
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

function SectionHeader({ section }: { section: Section }) {
  const Icon = section.icon;
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <h2 className="font-display font-bold text-lg text-foreground">{section.label}</h2>
        <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{section.description}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────── page ── */

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
          <Badge variant="outline" className="text-xs shrink-0 self-start">v0.9.60</Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <StatBadge icon={TrendingUp} value="~4h15min" label="economizados por dia (cenário base)" color="text-success" />
          <StatBadge icon={Zap} value="97%" label="mais rápido para confirmar um chapa" color="text-warning" />
          <StatBadge icon={RefreshCw} value="30s" label="ciclo de atualização automática" color="text-info" />
          <StatBadge icon={MousePointer} value="1 clique" label="para confirmar, exportar ou copiar" color="text-primary" />
        </div>

        {newModules > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-4 py-2.5">
            <Sparkles className="h-4 w-4 text-success shrink-0" />
            <span className="text-xs text-success font-medium">
              v0.9.60 — Importação: correção de erro UNIQUE constraint ao importar chapas com duplo espaço no nome (ex: "JOÃO  BRANCO"); deduplicação agora colapsa espaços internos de forma consistente. Listener WhatsApp: ao clicar em 'Remover' na notificação de recusa, o comportamento agora depende da visão ativa — na visão Cards, destaca o card da tarefa e marca o nome do chapa com borda vermelha; na visão Panorama, abre o painel da tarefa já com o diálogo de remoção pré-aberto para o chapa em questão. Card de Tarefa: novo botão 'CPF dos confirmados' no menu 'Copiar Nomes' — filtra chapas confirmados, busca o CPF pelo telefone na base do cadastro geral e copia a lista Nome — CPF pronta para preenchimento.
            </span>
          </div>
        )}
      </div>

      {/* ── Como usar este guia ── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="font-semibold text-sm text-foreground">Como usar este guia</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="font-bold text-primary shrink-0">1.</span>
            <span><strong className="text-foreground">Comece pelo Fluxo Operacional</strong> no final desta página — ele mostra o dia típico completo em 5 etapas.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-primary shrink-0">2.</span>
            <span><strong className="text-foreground">Use os tópicos como referência</strong> quando quiser entender melhor uma função específica — os módulos estão organizados por momento de uso.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-primary shrink-0">3.</span>
            <span><strong className="text-foreground">Modules com badge NOVO</strong> foram adicionados recentemente — leia-os para aproveitar as últimas funcionalidades.</span>
          </div>
        </div>
      </div>

      {/* ── Sections ── */}
      {SECTIONS.map((section, si) => (
        <section key={section.id} className="space-y-4">
          <SectionHeader section={section} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {section.modules.map((mod) => (
              <ModuleCard key={mod.name} mod={mod} />
            ))}
          </div>
          {si < SECTIONS.length - 1 && <Separator className="mt-6" />}
        </section>
      ))}

      <Separator />

      {/* ── Automações silenciosas ── */}
      <section className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-display font-bold text-xl text-foreground">Automações Silenciosas</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Estas ações acontecem sem nenhuma intervenção do usuário. O sistema trabalha em segundo plano — você só precisa prestar atenção quando algo aparece na tela.
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
      <section className="space-y-4">
        <div>
          <h2 className="font-display font-bold text-xl text-foreground">Atalhos de Teclado</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Os atalhos funcionam em qualquer tela, exceto quando você está digitando em um campo de texto. Pressione Esc para sair de qualquer campo e reativar os atalhos.
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

      {/* ── Fluxo operacional ── */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display font-bold text-xl text-foreground">Fluxo Operacional Típico</h2>
          <p className="text-sm text-muted-foreground mt-1">O dia completo em 5 etapas. Siga este fluxo até ele se tornar automático.</p>
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
                desc: "Use 'FUP Todos' para disparar Umbler para toda a tarefa de uma vez, ou 'Enviar Umbler' individualmente. Respostas SIM confirmam automaticamente e aparecem em 'Confirmações Automáticas'. Respostas NÃO mostram aviso de remoção.",
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
                    <Clock className="h-3.5 w-3.5 text-primary" />
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

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold text-sm text-foreground mb-3">Ganhos não quantificáveis (mas críticos)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            {[
              "Deduplicação elimina chapas duplicados na reimportação",
              "Preservação de estado evita reconfirmar chapas já confirmados",
              "Histórico completo de FUPs, remoções e validações — antes impossível",
              "Alerta automático: tempo de reação cai de 'quando eu lembro' para imediato",
              "Fill rate visível em tempo real evita surpresas de última hora",
              "Alertas de portaria eliminam esquecimento de envio de listas",
              "Rastreabilidade de quem foi confirmado, quando e por qual canal",
              "Cadernos de chapas e clientes centralizam informações que antes ficavam dispersas",
            ].map((g, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
                <span className="text-xs text-muted-foreground">{g}</span>
              </div>
            ))}
          </div>
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
            <Badge variant="outline" className="text-xs shrink-0">v0.9.60 · {totalModules} módulos</Badge>
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
        MCM v0.9.60 · © 2026 Wijngaarde Design
      </div>
    </div>
  );
}
