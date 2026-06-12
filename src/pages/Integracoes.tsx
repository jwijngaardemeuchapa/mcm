import { useState, useRef, useEffect } from "react";
import {
  Plug,
  MessageSquare,
  Send,
  Eye,
  EyeOff,
  Loader2,
  UserMinus,
  XCircle,
  Info,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Clock,
  Webhook,
  Copy,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { readSettings, writeSettings, type UmblerSettings } from "@/lib/settings";
import { sendUmblerFup } from "@/lib/umbler";
import { errMsg } from "@/lib/db";
import { toast } from "sonner";

const LISTENER_TIMEOUT_SECS = 120;

type ListenerStep = "input" | "waiting" | "done";
type ListenerResult = "sim" | "nao" | "timeout" | null;

interface NotificationMatch {
  chapa_nome: string;
  resposta: "sim" | "nao";
  arrival_time_secs: number;
}

export default function Integracoes() {
  const [unlocked, setUnlocked] = useState(false);
  const [umblerSettings, setUmblerSettings] = useState(() => readSettings().umblerSettings);
  const [webhookHost, setWebhookHost] = useState("127.0.0.1");
  const [webhookPort, setWebhookPort] = useState(() => readSettings().umblerSettings.webhookPort ?? 9988);
  const [showToken, setShowToken] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testMode, setTestMode] = useState<"fup" | "cancel" | "taskCancel">("fup");
  const [testPhone, setTestPhone] = useState("");
  const [testSending, setTestSending] = useState(false);

  /* ── listener test state ── */
  const [listenerOpen, setListenerOpen] = useState(false);
  const [listenerStep, setListenerStep] = useState<ListenerStep>("input");
  const [listenerPhone, setListenerPhone] = useState("");
  const [listenerSending, setListenerSending] = useState(false);
  const [listenerResult, setListenerResult] = useState<ListenerResult>(null);
  const [listenerCountdown, setListenerCountdown] = useState(LISTENER_TIMEOUT_SECS);
  const listenerPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listenerCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listenerSinceRef = useRef<number>(0);

  /* cleanup intervals when dialog closes */
  useEffect(() => {
    if (!listenerOpen) {
      if (listenerPollRef.current) clearInterval(listenerPollRef.current);
      if (listenerCountdownRef.current) clearInterval(listenerCountdownRef.current);
      listenerPollRef.current = null;
      listenerCountdownRef.current = null;
    }
  }, [listenerOpen]);

  function closeListenerDialog() {
    setListenerOpen(false);
    setListenerStep("input");
    setListenerPhone("");
    setListenerResult(null);
    setListenerCountdown(LISTENER_TIMEOUT_SECS);
  }

  function updateUmblerSetting(patch: Partial<UmblerSettings>) {
    const next = { ...umblerSettings, ...patch };
    setUmblerSettings(next);
    writeSettings({ umblerSettings: next });
  }

  function saveWebhookPort(port: number) {
    setWebhookPort(port);
    updateUmblerSetting({ webhookPort: port });
  }

  const webhookUrl = `http://${webhookHost}:${webhookPort}/webhook/umbler`;

  async function sendTest() {
    setTestSending(true);
    try {
      const overrideParams =
        testMode === "cancel" ? [] :
        testMode === "taskCancel" ? ["00000", "Hoje às 08:00"] :
        ["teste", "teste"];
      const templateIdOverride =
        testMode === "cancel" ? umblerSettings.cancelTemplateId :
        testMode === "taskCancel" ? umblerSettings.taskCancelTemplateId :
        undefined;
      await sendUmblerFup({
        chapaNome: "Verificação MCM",
        chapaTelefone: testPhone,
        dataTarefa: new Date().toISOString(),
        empresa: "MCM",
        settings: umblerSettings,
        overrideParams,
        templateIdOverride,
      });
      toast.success("Verificação enviada com sucesso.");
      setTestDialogOpen(false);
      setTestPhone("");
    } catch (e) {
      toast.error(`Falha na verificação: ${errMsg(e)}`);
    } finally {
      setTestSending(false);
    }
  }

  function openTest(mode: "fup" | "cancel" | "taskCancel") {
    setTestMode(mode);
    setTestPhone("");
    setTestDialogOpen(true);
  }

  async function startListenerTest() {
    setListenerSending(true);
    try {
      await sendUmblerFup({
        chapaNome: "Verificação MCM",
        chapaTelefone: listenerPhone,
        dataTarefa: new Date().toISOString(),
        empresa: "MCM",
        settings: umblerSettings,
        overrideParams: ["teste", "teste"],
      });
    } catch (e) {
      toast.error(`Falha no envio: ${errMsg(e)}`);
      setListenerSending(false);
      return;
    }

    listenerSinceRef.current = Math.floor(Date.now() / 1000);
    setListenerStep("waiting");
    setListenerCountdown(LISTENER_TIMEOUT_SECS);
    setListenerSending(false);

    /* poll every 3 s */
    listenerPollRef.current = setInterval(async () => {
      try {
        const matches: NotificationMatch[] = await invoke("check_notification_responses", {
          chapaNames: [],
          sinceEpochSecs: listenerSinceRef.current,
        });
        if (matches.length > 0) {
          stopListenerPolling();
          setListenerResult(matches[0].resposta);
          setListenerStep("done");
        }
      } catch {
        /* dormant if DB inaccessible */
      }
    }, 3_000);

    /* countdown */
    let remaining = LISTENER_TIMEOUT_SECS;
    listenerCountdownRef.current = setInterval(() => {
      remaining -= 1;
      setListenerCountdown(remaining);
      if (remaining <= 0) {
        stopListenerPolling();
        setListenerResult("timeout");
        setListenerStep("done");
      }
    }, 1_000);
  }

  function stopListenerPolling() {
    if (listenerPollRef.current) { clearInterval(listenerPollRef.current); listenerPollRef.current = null; }
    if (listenerCountdownRef.current) { clearInterval(listenerCountdownRef.current); listenerCountdownRef.current = null; }
  }

  /* ── Tela de bloqueio ── */
  if (!unlocked) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-2xl bg-warning/10 border border-warning/30 flex items-center justify-center">
              <ShieldAlert className="h-8 w-8 text-warning" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="font-display font-semibold text-2xl text-foreground">
              Configurações de Integração
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Esta área armazena credenciais de acesso a serviços externos. Alterações incorretas podem interromper o envio automatizado de mensagens aos operadores.
            </p>
          </div>

          <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-left space-y-2">
            <p className="text-xs font-semibold text-warning">Antes de prosseguir, confirme que:</p>
            <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
              <li>Você tem autorização para modificar configurações de integração</li>
              <li>As credenciais disponíveis pertencem ao ambiente correto</li>
              <li>Qualquer alteração entra em vigor imediatamente</li>
            </ul>
          </div>

          <Button onClick={() => setUnlocked(true)} className="gap-2 w-full sm:w-auto">
            <ShieldCheck className="h-4 w-4" />
            Acessar área restrita
          </Button>
        </div>
      </div>
    );
  }

  /* ── Conteúdo desbloqueado ── */
  const coreReady = !!(
    umblerSettings.bearerToken &&
    umblerSettings.fromPhone &&
    umblerSettings.organizationId &&
    umblerSettings.templateId
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Plug className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="font-display font-semibold text-2xl">Integrações</h1>
          <p className="text-sm text-muted-foreground">
            Credenciais e parâmetros de conexão com serviços externos
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto gap-1.5 text-xs text-muted-foreground"
          onClick={() => setUnlocked(false)}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          Bloquear
        </Button>
      </div>

      {/* ── Umbler Talk ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            Umbler Talk — Mensageria automatizada
          </CardTitle>
          <CardDescription>
            Parâmetros de autenticação e identificação para disparo de templates WhatsApp via API da plataforma Umbler Talk.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Bearer token */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Chave de autenticação da API
            </label>
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                value={umblerSettings.bearerToken}
                onChange={(e) => updateUmblerSetting({ bearerToken: e.target.value })}
                placeholder="Bearer token fornecido pela plataforma"
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showToken ? "Ocultar chave" : "Exibir chave"}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* fromPhone */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Número remetente — canal de saída (formato internacional)
            </label>
            <Input
              value={umblerSettings.fromPhone}
              onChange={(e) => updateUmblerSetting({ fromPhone: e.target.value })}
              placeholder="+5519900000000"
              className="font-mono text-xs"
            />
          </div>

          {/* org + template FUP */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Identificador da organização
              </label>
              <Input
                value={umblerSettings.organizationId}
                onChange={(e) => updateUmblerSetting({ organizationId: e.target.value })}
                placeholder="Z6tcYuFXi6pOKFCf"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Template — Confirmação de presença
              </label>
              <Input
                value={umblerSettings.templateId}
                onChange={(e) => updateUmblerSetting({ templateId: e.target.value })}
                placeholder="aG6yWYsgj8AxCG3W"
                className="font-mono text-xs"
              />
            </div>
          </div>

          {/* cancel template */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Template — Ausência de resposta (sem variáveis)
            </label>
            <Input
              value={umblerSettings.cancelTemplateId}
              onChange={(e) => updateUmblerSetting({ cancelTemplateId: e.target.value })}
              placeholder="aN0wfU8RFjQx8lKo"
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Ativa o botão <strong className="text-foreground">Sem resp.</strong> no dashboard.
              O template deve ser configurado sem variáveis na plataforma.
            </p>
          </div>

          {/* task cancel template */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Template — Cancelamento geral de tarefa
            </label>
            <Input
              value={umblerSettings.taskCancelTemplateId}
              onChange={(e) => updateUmblerSetting({ taskCancelTemplateId: e.target.value })}
              placeholder="aJOP1sA_R8oNdffY"
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Ativa o botão <strong className="text-foreground">Cancelar Tarefa</strong> no dashboard.
              Parâmetros enviados automaticamente: <strong className="text-foreground">parâm. 1</strong> — código da tarefa; <strong className="text-foreground">parâm. 2</strong> — data e horário. Disparado para todos os chapas com telefone cadastrado.
            </p>
          </div>

          {/* FUP bot (start-bot) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Bot ID — FUP (chatbot)
              </label>
              <Input
                value={umblerSettings.fupBotId}
                onChange={(e) => updateUmblerSetting({ fupBotId: e.target.value })}
                placeholder="abrvT7tO-xxxxx"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Trigger Name — FUP (chatbot)
              </label>
              <Input
                value={umblerSettings.fupBotTriggerName}
                onChange={(e) => updateUmblerSetting({ fupBotTriggerName: e.target.value })}
                placeholder="FUP_JEREMIAH | D0"
                className="font-mono text-xs"
              />
            </div>
            <p className="text-[11px] text-muted-foreground sm:col-span-2">
              O disparo de FUP (confirmação de presença) chama o robô via <strong className="text-foreground">start-bot</strong>.
              Variáveis enviadas em <code className="text-foreground">initialData</code>: <code className="text-foreground">Data</code>, <code className="text-foreground">Empresa</code>.
            </p>
          </div>

          {/* BID bot (start-bot) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Bot ID — BID (chatbot)
              </label>
              <Input
                value={umblerSettings.bidBotId}
                onChange={(e) => updateUmblerSetting({ bidBotId: e.target.value })}
                placeholder="abrvT7tO-13jbq-Z"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Trigger Name — BID (chatbot)
              </label>
              <Input
                value={umblerSettings.bidBotTriggerName}
                onChange={(e) => updateUmblerSetting({ bidBotTriggerName: e.target.value })}
                placeholder="BID_JEREMIAH | D0"
                className="font-mono text-xs"
              />
            </div>
            <p className="text-[11px] text-muted-foreground sm:col-span-2">
              O disparo de BID (convite de tarefa) chama o robô via <strong className="text-foreground">start-bot</strong>.
              Variáveis enviadas em <code className="text-foreground">initialData</code>: Data, Local, Atividades, Diária.
            </p>
          </div>

          <Separator />

          {/* Verificação */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Verificação de conectividade</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Envia uma mensagem real para confirmar que as credenciais e os templates estão operacionais.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => openTest("fup")}
                disabled={!coreReady}
              >
                <Send className="h-3.5 w-3.5" />
                Testar confirmação
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-muted-foreground"
                onClick={() => openTest("cancel")}
                disabled={!coreReady || !umblerSettings.cancelTemplateId}
              >
                <UserMinus className="h-3.5 w-3.5" />
                Testar ausência de resposta
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-muted-foreground"
                onClick={() => openTest("taskCancel")}
                disabled={!coreReady || !umblerSettings.taskCancelTemplateId}
              >
                <XCircle className="h-3.5 w-3.5" />
                Testar cancelamento geral
              </Button>
            </div>
          </div>

          <Separator />

          {/* Listener test */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Teste do listener de respostas</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Envia um FUP de teste e aguarda que o destinatário responda <strong className="text-foreground">SIM, tô nessa!</strong> ou <strong className="text-foreground">NÃO, quero cancelar!</strong> — confirma que o mecanismo de leitura de notificações do Windows está funcionando.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => { setListenerOpen(true); setListenerStep("input"); setListenerResult(null); setListenerCountdown(LISTENER_TIMEOUT_SECS); }}
              disabled={!coreReady}
            >
              <Smartphone className="h-3.5 w-3.5" />
              Testar listener de respostas
            </Button>
          </div>

          <div className="rounded-lg bg-muted/40 border border-border p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong className="text-foreground">Confirmação:</strong> parâm. 1 = data/hora da tarefa (ex.: "Hoje às 08:00"); parâm. 2 = razão social da empresa.</p>
              <p><strong className="text-foreground">Ausência de resposta:</strong> sem parâmetros — template deve ser configurado sem variáveis na plataforma.</p>
              <p><strong className="text-foreground">Cancelamento geral:</strong> parâm. 1 = código da tarefa; parâm. 2 = data/hora. Disparado para todos os chapas com telefone cadastrado.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Webhook de Respostas ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Webhook className="h-5 w-5 text-muted-foreground" />
            Captura de Respostas via Webhook
          </CardTitle>
          <CardDescription>
            Configure o Umbler Talk para enviar as respostas dos chapas em tempo real para o MCM — sem depender do WhatsApp Desktop.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              URL do Webhook (para configurar no Umbler Talk)
            </label>
            <div className="flex gap-2">
              <Input
                value={webhookHost}
                onChange={(e) => setWebhookHost(e.target.value)}
                placeholder="127.0.0.1 ou seu IP local"
                className="font-mono text-xs flex-1"
              />
              <Input
                type="number"
                value={webhookPort}
                onChange={(e) => saveWebhookPort(Number(e.target.value))}
                className="font-mono text-xs w-28"
                min={1024}
                max={65535}
              />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 text-xs font-mono bg-muted/50 border border-border rounded px-3 py-2 text-foreground truncate">
                {webhookUrl}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5"
                onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("URL copiada!"); }}
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar
              </Button>
            </div>
          </div>

          <div className="rounded-lg bg-muted/40 border border-border p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p>
                <strong className="text-foreground">Como configurar:</strong> No painel do Umbler Talk, acesse <strong className="text-foreground">Configurações → Integrações → Webhook</strong> e cole a URL acima.
              </p>
              <p>
                <strong className="text-foreground">IP:</strong> Use o IP local desta máquina (ex.: <code className="font-mono">192.168.1.x</code>) para que o Umbler Talk (nuvem) alcance o MCM. Se estiver usando ngrok ou similar, use o domínio público.
              </p>
              <p>
                <strong className="text-foreground">Porta padrão:</strong> 9988. O servidor webhook inicia automaticamente com o MCM — não requer configuração adicional.
              </p>
              <p>
                <strong className="text-foreground">Respostas detectadas:</strong> SIM / NÃO / 1 / 2 / 3 / Preciso de ajuda / Aceito app. Histórico completo em <strong className="text-foreground">Operacional → Respostas</strong>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        As credenciais são armazenadas localmente neste dispositivo e não são transmitidas a nenhum servidor externo além dos endpoints configurados.
      </p>

      {/* ── Dialog de verificação simples ── */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {testMode === "fup"
                ? "Verificar template de confirmação"
                : testMode === "cancel"
                ? "Verificar template de ausência de resposta"
                : "Verificar template de cancelamento geral"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Número de destino
              </label>
              <Input
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="(19) 99999-9999"
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {testMode === "fup" ? (
                <>
                  Parâmetros enviados:{" "}
                  <strong className="text-foreground">["teste", "teste"]</strong>. Nome do
                  contato:{" "}
                  <strong className="text-foreground">Verificação MCM</strong>.
                </>
              ) : testMode === "cancel" ? (
                <>
                  Template sem variáveis — enviado sem parâmetros. Nome do contato:{" "}
                  <strong className="text-foreground">Verificação MCM</strong>.
                </>
              ) : (
                <>
                  Parâmetros enviados:{" "}
                  <strong className="text-foreground">["00000", "Hoje às 08:00"]</strong>. Nome do
                  contato:{" "}
                  <strong className="text-foreground">Verificação MCM</strong>.
                </>
              )}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={sendTest}
              disabled={!testPhone.trim() || testSending}
              className="gap-1.5"
            >
              {testSending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {testSending ? "Enviando…" : "Enviar verificação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog de teste do listener ── */}
      <Dialog open={listenerOpen} onOpenChange={(open) => { if (!open) closeListenerDialog(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-muted-foreground" />
              Teste do listener de respostas
            </DialogTitle>
          </DialogHeader>

          {/* ── step: input ── */}
          {listenerStep === "input" && (
            <div className="space-y-4 py-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Informe um número WhatsApp para receber o FUP de teste. Após o envio, o sistema ficará aguardando a resposta — responda{" "}
                <strong className="text-foreground">SIM, tô nessa!</strong> ou{" "}
                <strong className="text-foreground">NÃO, quero cancelar!</strong> no WhatsApp para validar o mecanismo.
              </p>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Número de destino</label>
                <Input
                  value={listenerPhone}
                  onChange={(e) => setListenerPhone(e.target.value)}
                  placeholder="(19) 99999-9999"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter" && listenerPhone.trim() && !listenerSending) startListenerTest(); }}
                />
              </div>
              <div className="rounded-md bg-muted/40 border border-border px-3 py-2.5 text-xs text-muted-foreground">
                Template de confirmação enviado com parâmetros <strong className="text-foreground">["teste", "teste"]</strong>. O listener monitorará notificações do Windows por <strong className="text-foreground">{LISTENER_TIMEOUT_SECS} segundos</strong>.
              </div>
            </div>
          )}

          {/* ── step: waiting ── */}
          {listenerStep === "waiting" && (
            <div className="py-4 space-y-5">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="relative h-14 w-14">
                  <Loader2 className="h-14 w-14 text-primary/20 animate-spin" />
                  <Smartphone className="absolute inset-0 m-auto h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm">Aguardando resposta…</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    FUP enviado para <strong className="text-foreground">{listenerPhone}</strong>
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-center space-y-2">
                <p className="text-xs text-muted-foreground">No WhatsApp, responda com exatamente:</p>
                <div className="flex flex-col gap-1.5">
                  <span className="inline-flex items-center justify-center gap-1.5 rounded-md bg-success/10 border border-success/30 px-3 py-1.5 text-xs font-semibold text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    SIM, tô nessa!
                  </span>
                  <span className="text-[10px] text-muted-foreground">ou</span>
                  <span className="inline-flex items-center justify-center gap-1.5 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive">
                    <XCircle className="h-3.5 w-3.5" />
                    NÃO, quero cancelar!
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  Tempo restante:{" "}
                  <strong className={listenerCountdown <= 30 ? "text-destructive" : "text-foreground"}>
                    {listenerCountdown}s
                  </strong>
                </span>
              </div>
            </div>
          )}

          {/* ── step: done ── */}
          {listenerStep === "done" && (
            <div className="py-4 space-y-4">
              {listenerResult === "sim" && (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="h-14 w-14 rounded-full bg-success/10 border border-success/30 flex items-center justify-center">
                    <CheckCircle2 className="h-7 w-7 text-success" />
                  </div>
                  <div>
                    <p className="font-semibold text-success text-sm">Resposta SIM detectada!</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      O listener leu a notificação corretamente. Chapas que responderem{" "}
                      <strong className="text-foreground">SIM, tô nessa!</strong> serão confirmados automaticamente no dashboard.
                    </p>
                  </div>
                </div>
              )}
              {listenerResult === "nao" && (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="h-14 w-14 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center">
                    <XCircle className="h-7 w-7 text-destructive" />
                  </div>
                  <div>
                    <p className="font-semibold text-destructive text-sm">Resposta NÃO detectada!</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      O listener leu a notificação corretamente. Chapas que responderem{" "}
                      <strong className="text-foreground">NÃO, quero cancelar!</strong> gerarão um popup de sugestão de remoção no dashboard.
                    </p>
                  </div>
                </div>
              )}
              {listenerResult === "timeout" && (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="h-14 w-14 rounded-full bg-warning/10 border border-warning/30 flex items-center justify-center">
                    <AlertCircle className="h-7 w-7 text-warning" />
                  </div>
                  <div>
                    <p className="font-semibold text-warning text-sm">Nenhuma resposta detectada</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      O tempo de {LISTENER_TIMEOUT_SECS} segundos expirou sem que o listener encontrasse a resposta. Verifique se:{" "}
                      as notificações do Chrome estão ativadas no Windows, o Umbler Talk está aberto no navegador, e a resposta foi enviada com o texto exato.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {listenerStep === "input" && (
              <>
                <Button variant="outline" onClick={closeListenerDialog}>
                  Cancelar
                </Button>
                <Button
                  onClick={startListenerTest}
                  disabled={!listenerPhone.trim() || listenerSending}
                  className="gap-1.5"
                >
                  {listenerSending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {listenerSending ? "Enviando…" : "Enviar e monitorar"}
                </Button>
              </>
            )}
            {listenerStep === "waiting" && (
              <Button variant="outline" onClick={closeListenerDialog} className="w-full">
                Cancelar teste
              </Button>
            )}
            {listenerStep === "done" && (
              <Button onClick={closeListenerDialog} className="w-full">
                Fechar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
