import { useState, useRef, useEffect, useCallback } from "react";
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
  Cloud,
  Lock,
  KeyRound,
  Wifi,
  Database,
  RefreshCw,
  Download,
  ArrowDownCircle,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ingestTarefas } from "@/lib/ingestTarefas";
import { sincronizarCarteira, sincronizarRegistro, sincronizarLeadsSaac, sincronizarEnderecos, sincronizarTarefaEnderecos, sincronizarChapas15d, sincronizarLeadsRegiao } from "@/lib/metabaseSync";
import { fmtDateTime } from "@/lib/datetime";
import { collection, query, where, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { getFirestoreDb, ensureAnonAuth, FIRESTORE_MESSAGES_COLLECTION, firebaseConfigPresent } from "@/lib/firebase";
import { extractPhone, extractBody, classifyResponse, type RespostaCode } from "@/lib/firestoreQueue";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { readSettings, writeSettings, type UmblerSettings } from "@/lib/settings";
import { sendUmblerFup, startUmblerBot } from "@/lib/umbler";
import { errMsg } from "@/lib/db";
import { toast } from "sonner";

const LISTENER_TIMEOUT_SECS = 180;
const SENHA_INTEGRACOES = "meuCh@p@";

type ListenerStep = "input" | "waiting" | "done";
type ListenerResult = RespostaCode | "timeout" | null;
type ListenerBotType = "fup" | "bid";

const RESPOSTA_LABEL: Record<string, string> = {
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  interesse_sim: "Interesse (SIM)",
  interesse_nao: "Sem interesse (NÃO)",
  aceita_app: "Aceita app",
  nao_aceita_app: "Não aceita app",
  precisa_ajuda: "Precisa de ajuda",
};

const RESPOSTA_POSITIVO: Record<string, boolean> = {
  confirmado: true, interesse_sim: true, aceita_app: true,
};

type BotEntry = { label: string; botId: string };

const FUP_D0_BOTS: BotEntry[] = [
  { label: "FUP_ERIC | D0",         botId: "aV__ocFdmFMzyOP5" },
  { label: "FUP_ELIDIANY | D0",     botId: "aXn0gZxj-7WGDBw-" },
  { label: "FUP_WALLACE | D0",      botId: "aXn040hi2Y-QhKZE" },
  { label: "FUP_LUANAMOURA | D0",   botId: "aXuXJnwIz18MZ-dL" },
  { label: "FUP_ISABELA| D0",       botId: "abFqSCNwTvBnSbgz" },
  { label: "FUP_SABRINA| D0",       botId: "abFu2V0cILE1_EOM" },
  { label: "FUP_JEREMIAH| D0",      botId: "abry27tO-13jrsi3" },
  { label: "FUP_Jonathan| D0",      botId: "ac10xUJ8K2MU3kNY" },
  { label: "FUP_Matheus | D0",      botId: "ac169EJ8K2MU8JKj" },
  { label: "FUP_VICTORIA | D0",     botId: "aV5dFA42PnbCuTXG" },
  { label: "FUP_ISAAC | D0",        botId: "aJX_f14daaS-uu8s" },
  { label: "FUP_ALANIS | D0",       botId: "aJX__UsQRpfSKFAc" },
  { label: "FUP_HILARY | D0",       botId: "aJYMeV4daaS-3IH8" },
  { label: "FUP_GUILHERME | D0",    botId: "aLmSyS9_r7wQX2MC" },
  { label: "FUP_JAKELINE | D0",     botId: "aUFq21RK_T9enOJf" },
  { label: "FUP_EMANUELLE | D0",    botId: "aUQ9nsNnXHj9ZCM2" },
  { label: "FUP_ANA R. | D0",       botId: "aUQ9wDIB26TfeGbI" },
  { label: "FUP_LUCAS V. | D0",     botId: "aUQ93vkLIBV3bQsI" },
  { label: "FUP_VITOR S. | D0",     botId: "aUQ-EmY0VXoP1TL1" },
  { label: "FUP_GEOVANA C. | D0",   botId: "aUQ-gPkLIBV3bzPY" },
];

const FUP_D1_BOTS: BotEntry[] = [
  { label: "FUP_Jonathan | D1",     botId: "aV5dKydtZ6Fk1Lit" },
  { label: "FUP_ELIDIANY | D1",     botId: "aXn0lJt03nJW2ysn" },
  { label: "FUP_ISABELA | D1",      botId: "aXn08bkI2KlxM2bX" },
  { label: "FUP_LUANAMOURA | D1",   botId: "aXuXeAdxiGyzd3H6" },
  { label: "FUP_SABRINA| D1",       botId: "abFvhDEvA1SuGZmu" },
  { label: "FUP_JEREMIAH| D1",      botId: "abry86xIPqGJg7Jl" },
  { label: "FUP_Matheus | D1",      botId: "ac1737JWbBIsvMPd" },
  { label: "FUP_VICTORIA | D1",     botId: "ac7FxG463tVTItRW" },
  { label: "FUP_WALLACE | D1",      botId: "ac7F_UUUKxBDo0oa" },
  { label: "FUP_LARYSSA | D1",      botId: "aKM0oDB-csnl0EXh" },
  { label: "FUP_ISAAC | D1",        botId: "aKM0zLZ-B3gfL0tP" },
  { label: "FUP_HILARY | D1",       botId: "aKM05LZ-B3gfL5VG" },
  { label: "FUP_ALANIS | D1",       botId: "aKM1B947HAxfNMsA" },
  { label: "FUP_JAKELINE | D1",     botId: "aUFq-FRK_T9enWRu" },
  { label: "FUP_GUILHERME | D1",    botId: "aLmS5i9_r7wQX6Y2" },
];

const BID_BOTS: BotEntry[] = [
  { label: "BID_ERIC | D0",          botId: "aV__0KcwKZ5WAnKz" },
  { label: "BID_ELIDIANY | D0",      botId: "aXn0Spxj-7WGC6aO" },
  { label: "BID_ELIDIANY | D1",      botId: "aXn0W5t03nJW2pTO" },
  { label: "BID_WALLACE | D0",       botId: "aXn1ObkI2KlxNGPe" },
  { label: "BID_WALLACE | D1",       botId: "aXn1SrkI2KlxNK5B" },
  { label: "BID_LUANAMOURA | D1",    botId: "aXuW3AdxiGyzdQSg" },
  { label: "BID_LUANAMOURA | D2",    botId: "aXuXAHwIz18MZ1Vt" },
  { label: "BID_ISABELA | D0",       botId: "abFudF0cILE1-o--" },
  { label: "BID_ISABELA | D1",       botId: "abFtDPUaqYILhtYR" },
  { label: "BID_SABRINA | D0",       botId: "aKNqKN47HAxfoH8o" },
  { label: "BID_SABRINA| D1",        botId: "aNP_7D1LMkmDJCkh" },
  { label: "BID_JEREMIAH | D0",      botId: "abrvT7tO-13jbq-Z" },
  { label: "BID_JEREMIAH | D1",      botId: "abryoLtO-13jqmdT" },
  { label: "BID_Jonathan | D0",      botId: "ac10l7JWbBIso2Lh" },
  { label: "BID_Jonathan | D1",      botId: "ac10WLJWbBIsoost" },
  { label: "BID_Matheus | D0",       botId: "ac17l0J8K2MU8fUT" },
  { label: "BID_Matheus | D1",       botId: "ac17GsFYnQ5MQem7" },
  { label: "BID_ALICE | D1",         botId: "aKMxLLZ-B3gfJH_X" },
  { label: "BID_GUILHERME | D0",     botId: "aLmSHx4t2mV79KuP" },
  { label: "BID_GUILHERME | D1",     botId: "aLmSmVJu3woN_9r7" },
  { label: "BID_ISAAC| D0",          botId: "aLGzwsBxzPDrbpgQ" },
  { label: "BID_GABRIEL P. | D0",    botId: "aJ1TgUUYd9zpTCQD" },
  { label: "BID_GABRIEL P. | D1",    botId: "aKMvLTB-csnlv5AU" },
  { label: "BID_ALANIS | D0",        botId: "aJ1Ts8NSi9fWvQp6" },
  { label: "BID_ALANIS | D1",        botId: "aKMwfLZ-B3gfIkOg" },
  { label: "BID_VICTORIA | D0",      botId: "aV1rYFEmPoQY4BBA" },
  { label: "BID_VICTORIA | D1",      botId: "aV1rejkiFJDh_q2C" },
  { label: "BID_JAKELINE | D0",      botId: "aUFqck1YZxY6KYlt" },
  { label: "BID_JAKELINE | D1",      botId: "aUFqtvlQfRBIjxgn" },
  { label: "BID_VITOR DOS S. | D0",  botId: "aUQml8NnXHj9HOOZ" },
  { label: "BID_LUCAS V. | D0",      botId: "aUQnJPkLIBV3Jzuw" },
  { label: "BID_EMANUELLE R. | D0",  botId: "aUQnYWY0VXoPjsS7" },
  { label: "BID_ANA V. | D0",        botId: "aUQnpmY0VXoPj5TU" },
  { label: "BID_GEOVANA C. | D0",    botId: "aUQn3TIB26TfOTN8" },
];

function SincronizarCarteiraBtn() {
  const [syncing, setSyncing] = useState(false);
  async function handle() {
    setSyncing(true);
    await sincronizarCarteira(false);
    setSyncing(false);
  }
  return (
    <Button variant="outline" size="sm" onClick={handle} disabled={syncing} className="gap-1.5">
      <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
      Sincronizar agora
    </Button>
  );
}

function SincronizarEnderecosBtn() {
  const [syncing, setSyncing] = useState(false);
  async function handle() {
    setSyncing(true);
    await sincronizarEnderecos(false);
    setSyncing(false);
  }
  return (
    <Button variant="outline" size="sm" onClick={handle} disabled={syncing} className="gap-1.5">
      <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
      Sincronizar agora
    </Button>
  );
}

function SincronizarTarefaEnderecosBtn() {
  const [syncing, setSyncing] = useState(false);
  async function handle() {
    setSyncing(true);
    await sincronizarTarefaEnderecos(false);
    setSyncing(false);
  }
  return (
    <Button variant="outline" size="sm" onClick={handle} disabled={syncing} className="gap-1.5">
      <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
      Sincronizar agora
    </Button>
  );
}

function SincronizarChapas15dBtn() {
  const [syncing, setSyncing] = useState(false);
  async function handle() {
    setSyncing(true);
    await sincronizarChapas15d(false);
    setSyncing(false);
  }
  return (
    <Button variant="outline" size="sm" onClick={handle} disabled={syncing} className="gap-1.5">
      <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
      Sincronizar agora
    </Button>
  );
}

function SincronizarLeadsRegiaoBtn() {
  const [syncing, setSyncing] = useState(false);
  async function handle() {
    setSyncing(true);
    await sincronizarLeadsRegiao(false);
    setSyncing(false);
  }
  return (
    <Button variant="outline" size="sm" onClick={handle} disabled={syncing} className="gap-1.5">
      <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
      Sincronizar agora
    </Button>
  );
}

function SincronizarRegistroBtn() {
  const [syncing, setSyncing] = useState(false);
  async function handle() {
    setSyncing(true);
    await sincronizarRegistro(false);
    setSyncing(false);
  }
  return (
    <Button variant="outline" size="sm" onClick={handle} disabled={syncing} className="gap-1.5">
      <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
      Sincronizar agora
    </Button>
  );
}

function SincronizarLeadsSaacBtn() {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(() => localStorage.getItem("saac_last_sync"));
  const s = readSettings();
  const configured = !!s.saacApiUrl && !!s.saacApiKey;
  async function handle() {
    setSyncing(true);
    await sincronizarLeadsSaac(false);
    setLastSync(localStorage.getItem("saac_last_sync"));
    setSyncing(false);
  }
  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" onClick={handle} disabled={syncing || !configured} className="gap-1.5">
        <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
        Sincronizar Leads Saac
      </Button>
      {lastSync && (
        <span className="text-xs text-muted-foreground">
          Última: {fmtDateTime(lastSync)}
        </span>
      )}
    </div>
  );
}

export default function Integracoes() {
  const [unlocked, setUnlocked] = useState(false);
  const [senhaInput, setSenhaInput] = useState("");
  const [senhaErro, setSenhaErro] = useState(false);
  const [showSenha, setShowSenha] = useState(false);
  const [umblerSettings, setUmblerSettings] = useState(() => readSettings().umblerSettings);
  const [fupAgendarMinAntes, setFupAgendarMinAntes] = useState(() => readSettings().fupAgendarMinAntes ?? 0);
  const [firestoreEnabled, setFirestoreEnabled] = useState(() => readSettings().firestoreEnabled);
  const [showToken, setShowToken] = useState(false);

  /* ── Metabase ── */
  const [metabaseConfigured, setMetabaseConfigured] = useState(false);
  const [metabaseUrl, setMetabaseUrl] = useState("");
  const [metabaseApiKey, setMetabaseApiKey] = useState("");
  const [metabaseCardIdInput, setMetabaseCardIdInput] = useState(() => {
    const s = readSettings();
    return s.metabaseTarefasCardId ? String(s.metabaseTarefasCardId) : "";
  });
  const [metabase30hCardIdInput, setMetabase30hCardIdInput] = useState(() => {
    const s = readSettings();
    return s.metabaseTarefas30hCardId ? String(s.metabaseTarefas30hCardId) : "";
  });
  const [metabaseCarteiraCardIdInput, setMetabaseCarteiraCardIdInput] = useState(() => {
    const s = readSettings();
    return s.metabaseCarteiraCardId ? String(s.metabaseCarteiraCardId) : "";
  });
  const [metabaseEnderecosCardIdInput, setMetabaseEnderecosCardIdInput] = useState(() => {
    const s = readSettings();
    return s.metabaseEnderecosCardId ? String(s.metabaseEnderecosCardId) : "";
  });
  const [metabaseTarefaEnderecosCardIdInput, setMetabaseTarefaEnderecosCardIdInput] = useState(() => {
    const s = readSettings();
    return s.metabaseTarefaEnderecosCardId ? String(s.metabaseTarefaEnderecosCardId) : "";
  });
  const [metabaseChapas15dCardIdInput, setMetabaseChapas15dCardIdInput] = useState(() => {
    const s = readSettings();
    return s.metabaseChapas15dCardId ? String(s.metabaseChapas15dCardId) : "";
  });
  const [metabaseLeadsRegiaoCardIdInput, setMetabaseLeadsRegiaoCardIdInput] = useState(() => {
    const s = readSettings();
    return s.metabaseLeadsRegiaoCardId ? String(s.metabaseLeadsRegiaoCardId) : "";
  });
  const [metabaseRegistroCardIdInput, setMetabaseRegistroCardIdInput] = useState(() => {
    const s = readSettings();
    return String(s.metabaseRegistroCardId);
  });
  const [metabaseSyncing, setMetabaseSyncing] = useState(false);
  const [metabaseLastSync, setMetabaseLastSync] = useState<string | null>(() =>
    localStorage.getItem("metabase_last_sync"),
  );

  /* ── Saac API ── */
  const [saacApiUrl, setSaacApiUrl] = useState(() => readSettings().saacApiUrl ?? "");
  const [saacApiKey, setSaacApiKey] = useState(() => readSettings().saacApiKey ?? "");
  const [showSaacKey, setShowSaacKey] = useState(false);

  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testMode, setTestMode] = useState<"cancel" | "taskCancel">("cancel");
  const [testPhone, setTestPhone] = useState("");
  const [testSending, setTestSending] = useState(false);

  /* ── listener test state ── */
  const [listenerOpen, setListenerOpen] = useState(false);
  const [listenerStep, setListenerStep] = useState<ListenerStep>("input");
  const [listenerPhone, setListenerPhone] = useState("");
  const [listenerBotType, setListenerBotType] = useState<ListenerBotType>("bid");
  const [listenerSending, setListenerSending] = useState(false);
  const [listenerResult, setListenerResult] = useState<ListenerResult>(null);
  const [listenerDebug, setListenerDebug] = useState<string | null>(null);
  const [listenerCountdown, setListenerCountdown] = useState(LISTENER_TIMEOUT_SECS);
  const listenerUnsubRef = useRef<Unsubscribe | null>(null);
  const listenerCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Updater ── */
  type UpdateStatus = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "installing";
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  async function verificarAtualizacao() {
    setUpdateStatus("checking");
    try {
      const update = await check();
      if (update?.available) {
        setPendingUpdate(update);
        setUpdateStatus("available");
      } else {
        setUpdateStatus("up-to-date");
      }
    } catch (e) {
      console.error("Erro ao verificar atualização:", e);
      setUpdateStatus("idle");
      toast.error(`Erro ao verificar atualização: ${errMsg(e)}`);
    }
  }

  async function instalarAtualizacao() {
    if (!pendingUpdate) return;
    setUpdateStatus("downloading");
    let downloaded = 0;
    let total = 0;
    try {
      await pendingUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setDownloadProgress(total > 0 ? Math.round((downloaded / total) * 100) : 0);
        }
        if (event.event === "Finished") setUpdateStatus("installing");
      });
      await relaunch();
    } catch (e) {
      console.error("Erro ao instalar atualização:", e);
      setUpdateStatus("available");
      toast.error(`Erro ao instalar atualização: ${errMsg(e)}`);
    }
  }

  /* cleanup when dialog closes */
  useEffect(() => {
    if (!listenerOpen) {
      if (listenerUnsubRef.current) { listenerUnsubRef.current(); listenerUnsubRef.current = null; }
      if (listenerCountdownRef.current) { clearInterval(listenerCountdownRef.current); listenerCountdownRef.current = null; }
    }
  }, [listenerOpen]);

  function closeListenerDialog() {
    setListenerOpen(false);
    setListenerStep("input");
    setListenerPhone("");
    setListenerBotType("fup");
    setListenerResult(null);
    setListenerCountdown(LISTENER_TIMEOUT_SECS);
  }

  function updateUmblerSetting(patch: Partial<UmblerSettings>) {
    const next = { ...umblerSettings, ...patch };
    setUmblerSettings(next);
    writeSettings({ umblerSettings: next });
  }

  function toggleFirestore() {
    const next = !firestoreEnabled;
    setFirestoreEnabled(next);
    writeSettings({ firestoreEnabled: next });
    toast.success(next ? "Recebimento via Firebase ativado — reinicie o app para conectar." : "Recebimento via Firebase desativado.");
  }

  /* ── Metabase: carregar status na montagem ── */
  const loadMetabaseStatus = useCallback(async () => {
    try {
      const s = await invoke<{ configured: boolean; base_url: string }>("metabase_status");
      setMetabaseConfigured(s.configured);
      if (s.base_url) setMetabaseUrl(s.base_url);
    } catch { /* fora do Tauri ou não configurado */ }
  }, []);

  useEffect(() => { loadMetabaseStatus(); }, [loadMetabaseStatus]);

  async function salvarMetabase() {
    if (!metabaseUrl.trim() || !metabaseApiKey.trim()) {
      toast.error("Informe a URL e a API key do Metabase");
      return;
    }
    try {
      await invoke("save_metabase_config", { baseUrl: metabaseUrl.trim(), apiKey: metabaseApiKey.trim() });
      setMetabaseApiKey("");
      toast.success("Conexão Metabase salva — chave guardada no backend");
      await loadMetabaseStatus();
      if (metabaseCardIdInput.trim()) {
        writeSettings({ metabaseTarefasCardId: parseInt(metabaseCardIdInput.trim(), 10) });
      }
    } catch (e) { toast.error(`Erro ao salvar: ${errMsg(e)}`); }
  }

  async function sincronizarMetabase(silent = false) {
    const cardId = parseInt(metabaseCardIdInput.trim(), 10);
    if (!cardId) { if (!silent) toast.error("Informe o ID da pergunta no Metabase"); return; }
    writeSettings({ metabaseTarefasCardId: cardId });
    setMetabaseSyncing(true);
    try {
      const rows = await invoke<Record<string, unknown>[]>("metabase_query_card", { cardId });
      const result = await ingestTarefas(rows);
      const now = new Date().toISOString();
      localStorage.setItem("metabase_last_sync", now);
      setMetabaseLastSync(now);
      if (!silent) toast.success(`✓ ${result.tarefas} tarefas · ${result.chapas} chapas sincronizados`);
    } catch (e) {
      if (!silent) toast.error(`Erro na sincronização: ${errMsg(e)}`);
    } finally {
      setMetabaseSyncing(false);
    }
  }

  function tentarSenha() {
    if (senhaInput === SENHA_INTEGRACOES) {
      setUnlocked(true);
      setSenhaErro(false);
      setSenhaInput("");
    } else {
      setSenhaErro(true);
    }
  }


  async function sendTest() {
    setTestSending(true);
    try {
      const overrideParams = testMode === "taskCancel" ? ["00000", "Hoje às 08:00"] : [];
      const templateIdOverride =
        testMode === "cancel" ? umblerSettings.cancelTemplateId : umblerSettings.taskCancelTemplateId;
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

  function openTest(mode: "cancel" | "taskCancel") {
    setTestMode(mode);
    setTestPhone("");
    setTestDialogOpen(true);
  }

  async function startListenerTest() {
    setListenerSending(true);

    /* 1. Disparo */
    try {
      if (listenerBotType === "fup") {
        await startUmblerBot({
          chapaTelefone: listenerPhone,
          settings: umblerSettings,
          initialData: { Data: "Hoje às 08:00", Cidade: "Teste MCM" },
          botIdOverride: umblerSettings.fupBotId,
          triggerNameOverride: umblerSettings.fupBotTriggerName,
        });
      } else {
        await startUmblerBot({
          chapaTelefone: listenerPhone,
          settings: umblerSettings,
          initialData: { Data: "Hoje às 08:00", Local: "Teste", Atividades: "Verificação MCM", "Diária": "Teste" },
          botIdOverride: "abrvT7tO-13jbq-Z",      // BID_JEREMIAH | D0
          triggerNameOverride: "BID_JEREMIAH | D0",
        });
      }
    } catch (e) {
      toast.error(`Falha no envio: ${errMsg(e)}`);
      setListenerSending(false);
      return;
    }

    /* 2. Conectar Firebase */
    try {
      await ensureAnonAuth();
    } catch (e) {
      toast.error(`Firebase: erro de autenticação — ${errMsg(e)}`);
      setListenerSending(false);
      return;
    }

    const testSuffix = listenerPhone.replace(/\D/g, "").slice(-11);

    const db = getFirestoreDb();
    const q = query(
      collection(db, FIRESTORE_MESSAGES_COLLECTION),
      where("status", "==", "pending"),
    );

    setListenerStep("waiting");
    setListenerCountdown(LISTENER_TIMEOUT_SECS);
    setListenerDebug(null);
    setListenerSending(false);

    /* 3. Escutar Firestore */
    listenerUnsubRef.current = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type !== "added") return;
        const data = change.doc.data();
        const payload = data?.payload ?? data;

        const phone = extractPhone(payload);
        const body = extractBody(payload);
        const code = body ? classifyResponse(body) : null;
        const phoneSuffix = phone ? phone.replace(/\D/g, "").slice(-11) : null;

        console.log("[MCM listener] doc recebido:", {
          docId: change.doc.id,
          rawData: data,
          payload,
          phoneSuffix,
          testSuffix,
          body,
          code,
        });

        if (!phone) {
          const p = payload as Record<string, unknown>;
          const chatRaw = p?.Chat ?? p?.chat;
          const chatStr = chatRaw && typeof chatRaw === "object" ? JSON.stringify(chatRaw) : String(chatRaw);
          setListenerDebug(`Doc recebido — telefone não encontrado. Campos: ${Object.keys(p ?? {}).join(", ")} | Chat=${chatStr}`);
          return;
        }
        if (phoneSuffix !== testSuffix) {
          setListenerDebug(`Doc recebido — telefone ${phoneSuffix} não bate com ${testSuffix}`);
          return;
        }
        if (!body) {
          setListenerDebug(`Telefone OK — corpo da mensagem não encontrado. Campos: ${Object.keys(payload ?? {}).join(", ")}`);
          return;
        }

        stopListenerTest();
        setListenerResult(code ?? "timeout");
        setListenerDebug(`Telefone: ${phoneSuffix} | Corpo: "${body}" | Código: ${code ?? "não classificado"}`);
        setListenerStep("done");
      });
    }, (err) => {
      console.error("Firebase listener erro:", err);
      setListenerDebug(`Erro Firebase: ${errMsg(err)}`);
    });

    /* 4. Countdown */
    let remaining = LISTENER_TIMEOUT_SECS;
    listenerCountdownRef.current = setInterval(() => {
      remaining -= 1;
      setListenerCountdown(remaining);
      if (remaining <= 0) {
        stopListenerTest();
        setListenerResult("timeout");
        setListenerStep("done");
      }
    }, 1_000);
  }

  function stopListenerTest() {
    if (listenerUnsubRef.current) { listenerUnsubRef.current(); listenerUnsubRef.current = null; }
    if (listenerCountdownRef.current) { clearInterval(listenerCountdownRef.current); listenerCountdownRef.current = null; }
  }

  /* ── Tela de senha ── */
  if (!unlocked) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-2xl bg-warning/10 border border-warning/30 flex items-center justify-center">
              <Lock className="h-8 w-8 text-warning" />
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

          <div className="space-y-3">
            <div className="relative">
              <Input
                type={showSenha ? "text" : "password"}
                placeholder="Senha de acesso"
                value={senhaInput}
                onChange={(e) => { setSenhaInput(e.target.value); setSenhaErro(false); }}
                onKeyDown={(e) => { if (e.key === "Enter") tentarSenha(); }}
                className={`pr-10 text-center ${senhaErro ? "border-destructive focus-visible:ring-destructive" : ""}`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowSenha((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showSenha ? "Ocultar senha" : "Exibir senha"}
              >
                {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {senhaErro && (
              <p className="text-xs text-destructive">Senha incorreta. Tente novamente.</p>
            )}
            <Button onClick={tentarSenha} className="gap-2 w-full" disabled={!senhaInput.trim()}>
              <KeyRound className="h-4 w-4" />
              Acessar área restrita
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Conteúdo desbloqueado ── */
  const coreReady = !!(
    umblerSettings.bearerToken &&
    umblerSettings.fromPhone &&
    umblerSettings.organizationId
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

          {/* fromPhone + organizationId */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Número remetente (formato internacional)
              </label>
              <Input
                value={umblerSettings.fromPhone}
                onChange={(e) => updateUmblerSetting({ fromPhone: e.target.value })}
                placeholder="+5519900000000"
                className="font-mono text-xs"
              />
            </div>
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
              Parâmetros enviados automaticamente: <strong className="text-foreground">parâm. 1</strong> — código da tarefa; <strong className="text-foreground">parâm. 2</strong> — data e horário.
            </p>
          </div>

          {/* FUP bots */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-foreground">Bot FUP — Chatbot de follow-up</p>

            {/* D0 */}
            <div className="rounded-md border border-border p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Bot D0 — dia da tarefa / futuro</p>
              <Select
                value={FUP_D0_BOTS.find((b) => b.botId === umblerSettings.fupBotId)?.botId ?? ""}
                onValueChange={(val) => {
                  const entry = FUP_D0_BOTS.find((b) => b.botId === val);
                  if (entry) updateUmblerSetting({ fupBotId: entry.botId, fupBotTriggerName: entry.label });
                }}
              >
                <SelectTrigger className="font-mono text-xs">
                  <SelectValue placeholder="Selecionar da lista…" />
                </SelectTrigger>
                <SelectContent>
                  {FUP_D0_BOTS.map((b) => (
                    <SelectItem key={b.botId} value={b.botId} className="font-mono text-xs">
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Trigger Name</label>
                  <Input
                    value={umblerSettings.fupBotTriggerName}
                    onChange={(e) => updateUmblerSetting({ fupBotTriggerName: e.target.value })}
                    placeholder="FUP_NOME | D0"
                    className="font-mono text-xs h-8"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Bot ID</label>
                  <Input
                    value={umblerSettings.fupBotId}
                    onChange={(e) => updateUmblerSetting({ fupBotId: e.target.value })}
                    placeholder="abry27tO-13jrsi3"
                    className="font-mono text-xs h-8"
                  />
                </div>
              </div>
            </div>

            {/* D1 */}
            <div className="rounded-md border border-border p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Bot D1 — pós-tarefa (dia seguinte em diante)</p>
              <Select
                value={FUP_D1_BOTS.find((b) => b.botId === umblerSettings.fupBotD1Id)?.botId ?? ""}
                onValueChange={(val) => {
                  const entry = FUP_D1_BOTS.find((b) => b.botId === val);
                  if (entry) updateUmblerSetting({ fupBotD1Id: entry.botId, fupBotD1TriggerName: entry.label });
                }}
              >
                <SelectTrigger className="font-mono text-xs">
                  <SelectValue placeholder="Selecionar da lista…" />
                </SelectTrigger>
                <SelectContent>
                  {FUP_D1_BOTS.map((b) => (
                    <SelectItem key={b.botId} value={b.botId} className="font-mono text-xs">
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Trigger Name</label>
                  <Input
                    value={umblerSettings.fupBotD1TriggerName}
                    onChange={(e) => updateUmblerSetting({ fupBotD1TriggerName: e.target.value })}
                    placeholder="FUP_NOME | D1"
                    className="font-mono text-xs h-8"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Bot ID</label>
                  <Input
                    value={umblerSettings.fupBotD1Id}
                    onChange={(e) => updateUmblerSetting({ fupBotD1Id: e.target.value })}
                    placeholder="abry86xIPqGJg7Jl"
                    className="font-mono text-xs h-8"
                  />
                </div>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              O disparo de FUP chama o robô via <strong className="text-foreground">start-bot</strong>.
              Variáveis enviadas em <code className="text-foreground">initialData</code>: <code className="text-foreground">Data</code> (Hoje/Amanhã às HH:mm / dd/MM às HH:mm), <code className="text-foreground">Cidade</code>.
            </p>
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-medium text-muted-foreground">
                Agendamento automático de FUP
              </label>
              <div className="flex items-center gap-3">
                <div className="relative w-28">
                  <Input
                    type="number"
                    min={0}
                    max={480}
                    value={fupAgendarMinAntes}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(480, Number(e.target.value) || 0));
                      setFupAgendarMinAntes(v);
                    }}
                    onBlur={() => writeSettings({ fupAgendarMinAntes })}
                    className="font-mono text-xs pr-8"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">min</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {fupAgendarMinAntes > 0
                    ? `FUP disparado automaticamente ${fupAgendarMinAntes} min antes da tarefa.`
                    : "Desativado — FUP somente manual."}
                </p>
              </div>
            </div>
          </div>

          {/* BID bots */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-foreground">Bot BID — Chatbot de convite de tarefa</p>

            {/* BID D0 */}
            <div className="rounded-md border border-border p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Bot D0 — dia da tarefa / futuro próximo</p>
              <Select
                value={BID_BOTS.find((b) => b.botId === umblerSettings.bidBotId)?.botId ?? ""}
                onValueChange={(val) => {
                  const entry = BID_BOTS.find((b) => b.botId === val);
                  if (entry) updateUmblerSetting({ bidBotId: entry.botId, bidBotTriggerName: entry.label });
                }}
              >
                <SelectTrigger className="font-mono text-xs">
                  <SelectValue placeholder="Selecionar da lista…" />
                </SelectTrigger>
                <SelectContent>
                  {BID_BOTS.map((b) => (
                    <SelectItem key={b.botId} value={b.botId} className="font-mono text-xs">
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Trigger Name</label>
                  <Input
                    value={umblerSettings.bidBotTriggerName}
                    onChange={(e) => updateUmblerSetting({ bidBotTriggerName: e.target.value })}
                    placeholder="BID_NOME | D0"
                    className="font-mono text-xs h-8"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Bot ID</label>
                  <Input
                    value={umblerSettings.bidBotId}
                    onChange={(e) => updateUmblerSetting({ bidBotId: e.target.value })}
                    placeholder="abrvT7tO-13jbq-Z"
                    className="font-mono text-xs h-8"
                  />
                </div>
              </div>
            </div>

            {/* BID D1 */}
            <div className="rounded-md border border-border p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Bot D1 — pós-tarefa (dia seguinte em diante)</p>
              <Select
                value={BID_BOTS.find((b) => b.botId === umblerSettings.bidBotD1Id)?.botId ?? ""}
                onValueChange={(val) => {
                  const entry = BID_BOTS.find((b) => b.botId === val);
                  if (entry) updateUmblerSetting({ bidBotD1Id: entry.botId, bidBotD1TriggerName: entry.label });
                }}
              >
                <SelectTrigger className="font-mono text-xs">
                  <SelectValue placeholder="Selecionar da lista…" />
                </SelectTrigger>
                <SelectContent>
                  {BID_BOTS.map((b) => (
                    <SelectItem key={b.botId} value={b.botId} className="font-mono text-xs">
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Trigger Name</label>
                  <Input
                    value={umblerSettings.bidBotD1TriggerName}
                    onChange={(e) => updateUmblerSetting({ bidBotD1TriggerName: e.target.value })}
                    placeholder="BID_NOME | D1"
                    className="font-mono text-xs h-8"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Bot ID</label>
                  <Input
                    value={umblerSettings.bidBotD1Id}
                    onChange={(e) => updateUmblerSetting({ bidBotD1Id: e.target.value })}
                    placeholder="abryoLtO-13jqmdT"
                    className="font-mono text-xs h-8"
                  />
                </div>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              O disparo de BID chama o robô via <strong className="text-foreground">start-bot</strong>.
              D0 = dia da tarefa ou mesmo dia, D1 = dia seguinte em diante.
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

          {/* Firebase listener test */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Teste de disparo + escuta Firebase</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Dispara um bot (FUP ou BID) para o número informado e aguarda a resposta chegar via fila Firebase — valida o ciclo completo de ponta a ponta.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => { setListenerOpen(true); setListenerStep("input"); setListenerResult(null); setListenerCountdown(LISTENER_TIMEOUT_SECS); }}
              disabled={!coreReady || !firebaseConfigPresent()}
            >
              <Wifi className="h-3.5 w-3.5" />
              Testar disparo + Firebase
            </Button>
            {!firebaseConfigPresent() && (
              <p className="text-[11px] text-destructive">Firebase não configurado — preencha as variáveis VITE_FIREBASE_* no .env.</p>
            )}
          </div>

          <div className="rounded-lg bg-muted/40 border border-border p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong className="text-foreground">Ausência de resposta:</strong> sem parâmetros — template deve ser configurado sem variáveis na plataforma.</p>
              <p><strong className="text-foreground">Cancelamento geral:</strong> parâm. 1 = código da tarefa; parâm. 2 = data/hora. Disparado para todos os chapas com telefone cadastrado.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Recebimento de Respostas via Firebase ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cloud className="h-5 w-5 text-muted-foreground" />
            Recebimento de Respostas (Firebase)
          </CardTitle>
          <CardDescription>
            As respostas dos chapas chegam por uma fila na nuvem (Umbler → Vercel → Firebase) e são consumidas pelo MCM em tempo real, sem depender do WhatsApp Desktop nem de abrir portas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Fila na nuvem</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {firestoreEnabled ? "Ativado — escutando a fila Firebase." : "Desativado."}
              </p>
            </div>
            <Button
              size="sm"
              variant={firestoreEnabled ? "default" : "outline"}
              className="gap-1.5"
              onClick={toggleFirestore}
            >
              {firestoreEnabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Cloud className="h-3.5 w-3.5" />}
              {firestoreEnabled ? "Ativado" : "Ativar"}
            </Button>
          </div>

          <div className="rounded-lg bg-muted/40 border border-border p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p>
                <strong className="text-foreground">Como funciona:</strong> o MCM escuta todas as respostas pendentes da fila Firebase e correlaciona cada uma ao disparo correspondente pelo telefone do chapa — sem filtro por bot.
              </p>
              <p>
                <strong className="text-foreground">Reinício:</strong> ao ativar/desativar, reinicie o MCM para (re)conectar a escuta.
              </p>
              <p>
                <strong className="text-foreground">Respostas detectadas:</strong> SIM / NÃO / 1 / 2 / 3 / Preciso de ajuda / Aceito app. Histórico completo em <strong className="text-foreground">Operacional → Respostas</strong>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Metabase — Fonte de Tarefas ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-5 w-5 text-muted-foreground" />
            Metabase — Fonte de Tarefas
            {metabaseConfigured && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> conectado
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Configure a conexão com o Metabase para importar tarefas diretamente via API. A chave fica
            somente no backend — nunca no navegador ou em arquivos de configuração visíveis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">URL do Metabase</label>
              <Input
                placeholder="https://metabase.suaempresa.com"
                value={metabaseUrl}
                onChange={(e) => setMetabaseUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">API key (x-api-key)</label>
              <Input
                type="password"
                placeholder={metabaseConfigured ? "•••••••• (deixe vazio p/ manter)" : "cole a chave aqui"}
                value={metabaseApiKey}
                onChange={(e) => setMetabaseApiKey(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              ID da pergunta (Question) no Metabase
              <span className="ml-1 text-muted-foreground/60">(número que aparece na URL: /question/42)</span>
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="ex: 42"
                value={metabaseCardIdInput}
                onChange={(e) => setMetabaseCardIdInput(e.target.value.replace(/\D/g, ""))}
                className="max-w-[120px]"
              />
              <Button onClick={salvarMetabase} variant="outline">
                Salvar conexão
              </Button>
              <Button
                onClick={() => sincronizarMetabase(false)}
                disabled={metabaseSyncing || !metabaseCardIdInput.trim()}
              >
                {metabaseSyncing
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Sincronizando...</>
                  : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Sincronizar agora</>}
              </Button>
            </div>
            {metabaseLastSync && (
              <p className="text-xs text-muted-foreground">
                Última sincronização: {new Date(metabaseLastSync).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              ID da pergunta — Próximas 30 horas
              <span className="ml-1 text-muted-foreground/60">(usado no botão "Sync amanhã" dos dashboards)</span>
            </label>
            <Input
              placeholder="ex: 43"
              value={metabase30hCardIdInput}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                setMetabase30hCardIdInput(v);
                writeSettings({ metabaseTarefas30hCardId: v ? parseInt(v, 10) : undefined });
              }}
              className="max-w-[120px]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              ID da pergunta — Carteira
              <span className="ml-1 text-muted-foreground/60">(sync semanal automático às segundas)</span>
            </label>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="ex: 44"
                value={metabaseCarteiraCardIdInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setMetabaseCarteiraCardIdInput(v);
                  writeSettings({ metabaseCarteiraCardId: v ? parseInt(v, 10) : undefined });
                }}
                className="max-w-[120px]"
              />
              <SincronizarCarteiraBtn />
            </div>
            {localStorage.getItem("carteira_last_sync") && (
              <p className="text-xs text-muted-foreground">
                Última sync: {new Date(localStorage.getItem("carteira_last_sync")!).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              ID da pergunta — Endereços
              <span className="ml-1 text-muted-foreground/60">(sync semanal automático às segundas — alimenta o Caderno de Clientes)</span>
            </label>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="ex: 1420"
                value={metabaseEnderecosCardIdInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setMetabaseEnderecosCardIdInput(v);
                  writeSettings({ metabaseEnderecosCardId: v ? parseInt(v, 10) : undefined });
                }}
                className="max-w-[120px]"
              />
              <SincronizarEnderecosBtn />
            </div>
            {localStorage.getItem("enderecos_last_sync") && (
              <p className="text-xs text-muted-foreground">
                Última sync: {new Date(localStorage.getItem("enderecos_last_sync")!).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              ID da pergunta — Tarefa → Endereço
              <span className="ml-1 text-muted-foreground/60">(sync diário — ID Tarefa + ID Endereço, cruza com Endereços acima pra preencher o local exato da tarefa no BID)</span>
            </label>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="ex: 1430"
                value={metabaseTarefaEnderecosCardIdInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setMetabaseTarefaEnderecosCardIdInput(v);
                  writeSettings({ metabaseTarefaEnderecosCardId: v ? parseInt(v, 10) : undefined });
                }}
                className="max-w-[120px]"
              />
              <SincronizarTarefaEnderecosBtn />
            </div>
            {localStorage.getItem("tarefa_enderecos_last_sync") && (
              <p className="text-xs text-muted-foreground">
                Última sync: {new Date(localStorage.getItem("tarefa_enderecos_last_sync")!).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              ID da pergunta — Chapas Recentes (15 dias)
              <span className="ml-1 text-muted-foreground/60">(sync diário — adianta a aparição de cadastros novos no BID)</span>
            </label>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="ex: 1425"
                value={metabaseChapas15dCardIdInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setMetabaseChapas15dCardIdInput(v);
                  writeSettings({ metabaseChapas15dCardId: v ? parseInt(v, 10) : undefined });
                }}
                className="max-w-[120px]"
              />
              <SincronizarChapas15dBtn />
            </div>
            {localStorage.getItem("chapas_15d_last_sync") && (
              <p className="text-xs text-muted-foreground">
                Última sync: {new Date(localStorage.getItem("chapas_15d_last_sync")!).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              ID da pergunta — Leads Regionais
              <span className="ml-1 text-muted-foreground/60">(sync semanal — últimos 365 dias, alimenta a nova categoria de interessados no BID)</span>
            </label>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="ex: 983"
                value={metabaseLeadsRegiaoCardIdInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setMetabaseLeadsRegiaoCardIdInput(v);
                  writeSettings({ metabaseLeadsRegiaoCardId: v ? parseInt(v, 10) : undefined });
                }}
                className="max-w-[120px]"
              />
              <SincronizarLeadsRegiaoBtn />
            </div>
            {localStorage.getItem("leads_regiao_last_sync") && (
              <p className="text-xs text-muted-foreground">
                Última sync: {new Date(localStorage.getItem("leads_regiao_last_sync")!).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              ID da pergunta — Cadastro Geral de Chapas
              <span className="ml-1 text-muted-foreground/60">(substitui importação manual do CSV de cadastro)</span>
            </label>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="1296"
                value={metabaseRegistroCardIdInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setMetabaseRegistroCardIdInput(v);
                  writeSettings({ metabaseRegistroCardId: v ? parseInt(v, 10) : 1296 });
                }}
                className="max-w-[120px]"
              />
              <SincronizarRegistroBtn />
            </div>
            {localStorage.getItem("chapa_registry_imported_at") && (
              <p className="text-xs text-muted-foreground">
                Última sync: {new Date(localStorage.getItem("chapa_registry_imported_at")!).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </p>
            )}
          </div>

          <div className="rounded-lg bg-muted/40 border border-border p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              O Dashboard sincroniza automaticamente a cada 5 minutos enquanto o app está aberto.
              O mesmo processamento do CSV é aplicado: estado dos chapas (confirmado, cancelado, observações) é preservado entre sincronizações.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Captação Saac (Lovable API) ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
            Captação de Leads — Saac
          </CardTitle>
          <CardDescription>
            Configure a URL e a chave da API (x-api-key) para consumir a base de chapas recém-captados ("Leads Saac"). Esses chapas entrarão no sistema de BIDs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">URL da API</label>
              <Input
                placeholder="https://fvvzqandckpdjidgfsjl.supabase.co/functions/v1/metabase-leads"
                value={saacApiUrl}
                onChange={(e) => setSaacApiUrl(e.target.value)}
                onBlur={() => writeSettings({ saacApiUrl: saacApiUrl.trim() })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">API key (x-api-key)</label>
              <div className="relative">
                <Input
                  type={showSaacKey ? "text" : "password"}
                  placeholder="Sua chave secreta"
                  value={saacApiKey}
                  onChange={(e) => setSaacApiKey(e.target.value)}
                  onBlur={() => writeSettings({ saacApiKey: saacApiKey.trim() })}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSaacKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showSaacKey ? "Ocultar chave" : "Exibir chave"}
                >
                  {showSaacKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-muted-foreground">
              Os leads sincronizam automaticamente toda vez que o app abre. Use o botão para atualizar agora.
            </p>
            <SincronizarLeadsSaacBtn />
          </div>
        </CardContent>
      </Card>

      {/* ── Atualização do Sistema ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
              <Download className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-sm">Atualização do Sistema</CardTitle>
              <CardDescription className="text-xs">Verifique e instale novas versões do MCM manualmente.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">
              {updateStatus === "idle" && "Clique para verificar se há uma versão mais recente disponível."}
              {updateStatus === "checking" && "Verificando atualização..."}
              {updateStatus === "up-to-date" && (
                <span className="flex items-center gap-1.5 text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Você já está na versão mais recente.
                </span>
              )}
              {updateStatus === "available" && (
                <span className="flex items-center gap-1.5 text-warning">
                  <ArrowDownCircle className="h-3.5 w-3.5" />
                  Nova versão disponível: <strong>{pendingUpdate?.version}</strong>
                </span>
              )}
              {updateStatus === "downloading" && `Baixando... ${downloadProgress}%`}
              {updateStatus === "installing" && "Instalando — o app será reiniciado em instantes..."}
            </div>
            <div className="flex gap-2 shrink-0">
              {(updateStatus === "idle" || updateStatus === "up-to-date") && (
                <Button size="sm" variant="outline" onClick={verificarAtualizacao} className="gap-1.5 text-xs">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Verificar
                </Button>
              )}
              {updateStatus === "checking" && (
                <Button size="sm" variant="outline" disabled className="gap-1.5 text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Verificando...
                </Button>
              )}
              {updateStatus === "available" && (
                <Button size="sm" onClick={instalarAtualizacao} className="gap-1.5 text-xs bg-warning text-warning-foreground hover:bg-warning/90">
                  <Download className="h-3.5 w-3.5" />
                  Instalar v{pendingUpdate?.version}
                </Button>
              )}
              {updateStatus === "downloading" && (
                <Button size="sm" variant="outline" disabled className="gap-1.5 text-xs min-w-[100px]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {downloadProgress}%
                </Button>
              )}
              {updateStatus === "installing" && (
                <Button size="sm" variant="outline" disabled className="gap-1.5 text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Reiniciando...
                </Button>
              )}
            </div>
          </div>
          {updateStatus === "downloading" && (
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          )}
          {updateStatus === "available" && pendingUpdate?.body && (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {pendingUpdate.body}
            </div>
          )}
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
              {testMode === "cancel"
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
              {testMode === "cancel" ? (
                <>Template sem variáveis — enviado sem parâmetros. Nome do contato: <strong className="text-foreground">Verificação MCM</strong>.</>
              ) : (
                <>Parâmetros enviados: <strong className="text-foreground">["00000", "Hoje às 08:00"]</strong>. Nome do contato: <strong className="text-foreground">Verificação MCM</strong>.</>
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

      {/* ── Dialog de teste disparo + Firebase ── */}
      <Dialog open={listenerOpen} onOpenChange={(open) => { if (!open) closeListenerDialog(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wifi className="h-4 w-4 text-muted-foreground" />
              Teste de disparo + escuta Firebase
            </DialogTitle>
          </DialogHeader>

          {listenerStep === "input" && (
            <div className="space-y-4 py-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Selecione o tipo de bot, informe o número WhatsApp e clique em enviar. O MCM disparará o bot e ficará aguardando a resposta chegar via Firebase.
              </p>

              {/* Tipo de bot */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Tipo de disparo</label>
                <div className="flex rounded-md border border-border overflow-hidden text-xs font-medium">
                  <button
                    type="button"
                    className={`flex-1 py-2 transition-colors ${listenerBotType === "fup" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/50"}`}
                    onClick={() => setListenerBotType("fup")}
                  >
                    FUP — Follow-up
                  </button>
                  <button
                    type="button"
                    className={`flex-1 py-2 transition-colors border-l border-border ${listenerBotType === "bid" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/50"}`}
                    onClick={() => setListenerBotType("bid")}
                  >
                    BID — Convite
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {listenerBotType === "fup"
                    ? `Bot: ${umblerSettings.fupBotTriggerName || "não configurado"}`
                    : `Bot: ${umblerSettings.bidBotTriggerName || "não configurado"}`}
                </p>
              </div>

              {/* Número */}
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
                O MCM escutará o Firebase por <strong className="text-foreground">{LISTENER_TIMEOUT_SECS} segundos</strong> após o envio.
              </div>
            </div>
          )}

          {listenerStep === "waiting" && (
            <div className="py-4 space-y-5">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="relative h-14 w-14">
                  <Loader2 className="h-14 w-14 text-primary/20 animate-spin" />
                  <Wifi className="absolute inset-0 m-auto h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm">Aguardando resposta via Firebase…</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {listenerBotType === "fup" ? "FUP" : "BID"} enviado para <strong className="text-foreground">{listenerPhone}</strong>
                  </p>
                  {listenerDebug && (
                    <p className="text-[11px] font-mono text-amber-500 mt-1 break-all">{listenerDebug}</p>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-center space-y-2">
                <p className="text-xs text-muted-foreground">Responda no WhatsApp. Exemplos aceitos:</p>
                <div className="flex flex-col gap-1.5">
                  {listenerBotType === "fup" ? (
                    <>
                      <span className="inline-flex items-center justify-center gap-1.5 rounded-md bg-success/10 border border-success/30 px-3 py-1.5 text-xs font-semibold text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        SIM, estou nessa!
                      </span>
                      <span className="text-[10px] text-muted-foreground">ou</span>
                      <span className="inline-flex items-center justify-center gap-1.5 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive">
                        <XCircle className="h-3.5 w-3.5" />
                        NÃO, quero cancelar!
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center justify-center gap-1.5 rounded-md bg-success/10 border border-success/30 px-3 py-1.5 text-xs font-semibold text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        SIM (interesse) / Sim (aceita app)
                      </span>
                      <span className="text-[10px] text-muted-foreground">ou</span>
                      <span className="inline-flex items-center justify-center gap-1.5 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive">
                        <XCircle className="h-3.5 w-3.5" />
                        NÃO / 2 / Preciso de ajuda
                      </span>
                    </>
                  )}
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

          {listenerStep === "done" && (
            <div className="py-4 space-y-4">
              {listenerResult !== null && listenerResult !== "timeout" ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className={`h-14 w-14 rounded-full flex items-center justify-center ${RESPOSTA_POSITIVO[listenerResult] ? "bg-success/10 border border-success/30" : "bg-warning/10 border border-warning/30"}`}>
                    {RESPOSTA_POSITIVO[listenerResult]
                      ? <CheckCircle2 className="h-7 w-7 text-success" />
                      : <AlertCircle className="h-7 w-7 text-warning" />}
                  </div>
                  <div>
                    <p className={`font-semibold text-sm ${RESPOSTA_POSITIVO[listenerResult] ? "text-success" : "text-warning"}`}>
                      {RESPOSTA_LABEL[listenerResult] ?? listenerResult}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Resposta recebida e classificada pelo Firebase. O ciclo ponta a ponta está funcionando corretamente.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="h-14 w-14 rounded-full bg-warning/10 border border-warning/30 flex items-center justify-center">
                    <AlertCircle className="h-7 w-7 text-warning" />
                  </div>
                  <div>
                    <p className="font-semibold text-warning text-sm">
                      {listenerDebug ? "Mensagem recebida — não lida" : "Nenhuma resposta detectada"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {listenerDebug
                        ? "O Firebase recebeu uma mensagem mas não conseguiu processá-la. Veja o diagnóstico abaixo."
                        : `O tempo de ${LISTENER_TIMEOUT_SECS}s expirou. Verifique se o bot foi disparado e se a resposta chegou ao Firestore.`}
                    </p>
                  </div>
                </div>
              )}
              {listenerDebug && (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] font-mono text-muted-foreground break-all">
                  {listenerDebug}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {listenerStep === "input" && (
              <>
                <Button variant="outline" onClick={closeListenerDialog}>Cancelar</Button>
                <Button
                  onClick={startListenerTest}
                  disabled={!listenerPhone.trim() || listenerSending}
                  className="gap-1.5"
                >
                  {listenerSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
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
              <Button onClick={closeListenerDialog} className="w-full">Fechar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
