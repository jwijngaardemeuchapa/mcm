import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Settings,
  Info,
  TriangleAlert,
  LayoutList,
  Table2,
  Check,
  Bell,
  DoorOpen,
  Plus,
  Trash2,
  Clock,
  Volume2,
  Zap,
  KanbanSquare,
  Database,
  User,
  HardDrive,
  TimerReset,
  Sheet,
  FileKey,
  RefreshCw,
  Upload,
  GanttChart,
  UserMinus,
} from "lucide-react";
import { getLeoConfig, saveLeoConfig, syncLeo, extractSpreadsheetId, parseRespostasBidCsv } from "@/pages/AnaliseBase/modules/M_leo";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { readSettings, writeSettings, type PortariaRule } from "@/lib/settings";
import { getDb } from "@/lib/db";

const isTauri = "__TAURI_INTERNALS__" in window;

/* ── seções do sumário ── */
const CONFIG_SECTIONS = [
  { id: "cfg-sons",         icon: Volume2,        label: "Sons",           desc: "Intro, alertas, confirmações, troca de turno" },
  { id: "cfg-alertas",      icon: Bell,          label: "Alertas",        desc: "Painel flutuante, sonoro, timers, portaria" },
  { id: "cfg-fillrate",     icon: TriangleAlert, label: "Fill Rate",      desc: "Threshold mínimo de preenchimento" },
  { id: "cfg-prioridades",  icon: Zap,           label: "Prioridades",    desc: "Painel de urgência no Dashboard" },
  { id: "cfg-visualizacao", icon: LayoutList,    label: "Visualização",   desc: "Modo padrão Cards ou Panorama" },
  { id: "cfg-agenda",       icon: KanbanSquare,  label: "Agenda",         desc: "Ordenação do Kanban" },
  { id: "cfg-operador",     icon: User,          label: "Operador",       desc: "Seu nome nos logs de FUP" },
  { id: "cfg-backup",       icon: HardDrive,     label: "Backup",         desc: "Copiar banco para Documentos/MCM" },
  { id: "cfg-leo",          icon: Sheet,         label: "Planilha LEO",   desc: "Histórico BID para ranqueamento" },
];

function scrollToCfg(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.pageYOffset - 76;
  window.scrollTo({ top, behavior: "smooth" });
}

export default function Configuracoes() {
  const [settings, setSettings] = useState(readSettings);
  const [companies, setCompanies] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEmpresa, setNewEmpresa] = useState("");
  const [newHoras, setNewHoras] = useState(4);
  const [backupLoading, setBackupLoading] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(
    () => localStorage.getItem("fup_last_backup"),
  );

  // LEO
  const [leoTotal, setLeoTotal] = useState(0);
  const [leoLastSync, setLeoLastSync] = useState<string | null>(null);
  const [leoSheetId, setLeoSheetId] = useState("");
  const [leoHasCred, setLeoHasCred] = useState(false);
  const [leoSyncing, setLeoSyncing] = useState(false);
  const [leoCsvLoading, setLeoCsvLoading] = useState(false);

  useEffect(() => {
    getDb()
      .then((db) => db.select<{ nome_fantasia: string }[]>("SELECT nome_fantasia FROM carteira ORDER BY nome_fantasia"))
      .then((data) => setCompanies(data.map((r) => r.nome_fantasia).filter(Boolean)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    getLeoConfig().then((c) => {
      if (c.spreadsheetId) setLeoSheetId(c.spreadsheetId);
      setLeoHasCred(!!c.serviceAccountJson);
      setLeoLastSync(c.lastSync);
      setLeoTotal(c.totalRegistros);
    }).catch(() => {});
  }, []);

  function handleThresholdChange(value: number[]) {
    setSettings(writeSettings({ fillRateWarningThreshold: value[0] }));
  }

  function handleViewChange(view: "detailed" | "panorama" | "timeline") {
    setSettings(writeSettings({ defaultDashboardView: view }));
  }

  function handleApproachingToggle(enabled: boolean) {
    setSettings(writeSettings({ approachingAlertEnabled: enabled }));
  }

  function openAddPortaria() {
    setNewEmpresa("");
    setNewHoras(4);
    setDialogOpen(true);
  }

  function addPortariaRule() {
    if (!newEmpresa) return;
    const rule: PortariaRule = { id: Date.now().toString(), empresa: newEmpresa, horasAntes: newHoras };
    setSettings(writeSettings({ portariaRules: [...settings.portariaRules, rule] }));
    setDialogOpen(false);
  }

  function removePortariaRule(id: string) {
    setSettings(writeSettings({ portariaRules: settings.portariaRules.filter((r) => r.id !== id) }));
  }

  async function handleLeoCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setLeoCsvLoading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const count = await parseRespostasBidCsv(String(ev.target?.result ?? ""));
        const refreshed = await getLeoConfig();
        setLeoTotal(refreshed.totalRegistros);
        setLeoLastSync(refreshed.lastSync);
        toast.success(`${count.toLocaleString("pt-BR")} números BID importados`);
      } catch (err) {
        toast.error(`Erro ao importar CSV: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLeoCsvLoading(false);
      }
    };
    reader.readAsText(f, "utf-8");
  }

  async function handleLeoCredFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const text = await f.text();
    try {
      JSON.parse(text);
    } catch {
      toast.error("Arquivo inválido — esperado JSON de Service Account Google.");
      return;
    }
    await saveLeoConfig("service_account_json", text);
    setLeoHasCred(true);
    toast.success("Credencial salva com sucesso.");
  }

  async function handleLeoSaveSheetId() {
    const id = extractSpreadsheetId(leoSheetId);
    await saveLeoConfig("spreadsheet_id", id);
    setLeoSheetId(id);
    toast.success("ID da planilha salvo.");
  }

  async function handleSyncLeo() {
    const id = extractSpreadsheetId(leoSheetId);
    if (!id) { toast.warning("Informe o ID ou URL da planilha primeiro."); return; }
    const cfg = await getLeoConfig();
    if (!cfg.serviceAccountJson) { toast.warning("Carregue a credencial JSON antes de sincronizar."); return; }
    setLeoSyncing(true);
    try {
      const count = await syncLeo(id, cfg.serviceAccountJson);
      const refreshed = await getLeoConfig();
      setLeoLastSync(refreshed.lastSync);
      setLeoTotal(refreshed.totalRegistros);
      toast.success(`${count.toLocaleString("pt-BR")} registros sincronizados da planilha`);
    } catch (err) {
      toast.error(`Erro ao sincronizar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLeoSyncing(false);
    }
  }

  async function handleBackup() {
    if (!isTauri) {
      toast.error("Backup disponível apenas na versão desktop.");
      return;
    }
    setBackupLoading(true);
    try {
      const path = await invoke<string>("backup_database");
      const now = new Date().toLocaleString("pt-BR");
      localStorage.setItem("fup_last_backup", now);
      setLastBackup(now);
      toast.success(`Backup salvo com sucesso!`, { description: path });
    } catch (e) {
      toast.error(`Erro ao fazer backup: ${e}`);
    } finally {
      setBackupLoading(false);
    }
  }

  const [snapshotExporting, setSnapshotExporting] = useState(false);
  const [snapshotImporting, setSnapshotImporting] = useState(false);

  async function handleExportSnapshot() {
    if (!isTauri) { toast.error("Disponível apenas na versão desktop."); return; }
    setSnapshotExporting(true);
    try {
      const dbBase64 = await invoke<string>("export_db_base64");
      const settingsObj: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        settingsObj[k] = localStorage.getItem(k)!;
      }
      const snapshot = {
        version: "1",
        app_version: "0.9.74",
        exported_at: new Date().toISOString(),
        db: dbBase64,
        local_storage: settingsObj,
      };
      const blob = new Blob([JSON.stringify(snapshot)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mcm_snapshot_${new Date().toISOString().slice(0, 10)}.mcmbak`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Snapshot exportado com sucesso.");
    } catch (e) {
      toast.error(`Erro ao exportar: ${e}`);
    } finally {
      setSnapshotExporting(false);
    }
  }

  function handleImportSnapshot(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isTauri) { toast.error("Disponível apenas na versão desktop."); return; }
    if (!window.confirm("Isso vai SUBSTITUIR todos os dados desta máquina. Um backup automático do banco atual será criado. Confirmar?")) {
      e.target.value = "";
      return;
    }
    setSnapshotImporting(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = ev.target?.result as string;
        const snapshot = JSON.parse(raw);
        if (!snapshot.db || !snapshot.local_storage) throw new Error("Arquivo inválido ou corrompido.");
        await invoke("import_db_base64", { data: snapshot.db });
        for (const [k, v] of Object.entries(snapshot.local_storage as Record<string, string>)) {
          localStorage.setItem(k, v);
        }
        toast.success("Snapshot importado.", { description: "Feche e reabra o MCM para aplicar completamente." });
      } catch (err) {
        toast.error(`Erro ao importar: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setSnapshotImporting(false);
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  const threshold = settings.fillRateWarningThreshold;
  const exampleBelow = Math.max(0, threshold - 10);
  const exampleAbove = Math.min(100, threshold + 10);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl mx-auto">

      {/* ── Cabeçalho ── */}
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="font-display font-semibold text-2xl">Configurações</h1>
          <p className="text-sm text-muted-foreground">Personalize o comportamento do MCM — as alterações são salvas automaticamente</p>
        </div>
      </div>

      {/* ── Sumário de acesso rápido ── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ir diretamente para</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CONFIG_SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => scrollToCfg(s.id)}
                className="flex flex-col items-start gap-1 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 hover:border-muted-foreground/30"
              >
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-semibold text-foreground">{s.label}</span>
                </div>
                <span className="text-[10px] text-muted-foreground leading-tight">{s.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Sons ── */}
      <div id="cfg-sons" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Volume2 className="h-5 w-5 text-muted-foreground" />
              Sons
            </CardTitle>
            <CardDescription>
              Controle quais sons o MCM reproduz durante o uso. As alterações entram em vigor imediatamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Áudio da intro</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Toca o áudio do vídeo de abertura exibido ao iniciar o MCM e toda segunda-feira.
                </p>
              </div>
              <Switch
                checked={settings.sons.intro}
                onCheckedChange={(v) => setSettings(writeSettings({ sons: { ...settings.sons, intro: v } }))}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Alertas de chapa</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Bipe curto quando um chapa entra na janela de 1 hora sem confirmação.
                </p>
              </div>
              <Switch
                checked={settings.sons.alertas}
                onCheckedChange={(v) => setSettings(writeSettings({ sons: { ...settings.sons, alertas: v } }))}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Confirmações e validações</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Chime ao concluir ou validar uma tarefa com sucesso.
                </p>
              </div>
              <Switch
                checked={settings.sons.confirmacoes}
                onCheckedChange={(v) => setSettings(writeSettings({ sons: { ...settings.sons, confirmacoes: v } }))}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Troca de turno</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Som ao copiar a mensagem de troca de turno para o Teams.
                </p>
              </div>
              <Switch
                checked={settings.sons.turno}
                onCheckedChange={(v) => setSettings(writeSettings({ sons: { ...settings.sons, turno: v } }))}
              />
            </div>

          </CardContent>
        </Card>
      </div>

      {/* ── Alertas ── */}
      <div id="cfg-alertas" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-5 w-5 text-muted-foreground" />
              Alertas
            </CardTitle>
            <CardDescription>
              Controle quais alertas e avisos aparecem durante o uso do dashboard.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">

            {/* Toggle: approaching alert */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Painel de chapas a confirmar</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Exibe o painel flutuante com chapas sem confirmação em tarefas que iniciam em até 1 hora.
                </p>
              </div>
              <Switch
                checked={settings.approachingAlertEnabled}
                onCheckedChange={handleApproachingToggle}
              />
            </div>

            {/* Toggle: sound alert */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-2.5">
                <Volume2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Alerta sonoro</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Emite um bipe curto quando um chapa entra na janela de 1 hora sem confirmação.
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.soundAlertEnabled}
                onCheckedChange={(enabled) => setSettings(writeSettings({ soundAlertEnabled: enabled }))}
              />
            </div>

            <Separator />

            {/* Umbler no-response timer */}
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <TimerReset className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Timer de sem-resposta — Disparos Umbler</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Após este tempo sem resposta, o badge <strong className="text-foreground">"Sem resposta"</strong> aparece
                    na tela de Disparos Umbler com destaque laranja. Depois de 2× esse tempo vira vermelho.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 pl-6">
                <Select
                  value={String(settings.umblerNoResponseMinutes)}
                  onValueChange={(v) => setSettings(writeSettings({ umblerNoResponseMinutes: Number(v) }))}
                >
                  <SelectTrigger className="w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutos</SelectItem>
                    <SelectItem value="20">20 minutos</SelectItem>
                    <SelectItem value="30">30 minutos (recomendado)</SelectItem>
                    <SelectItem value="45">45 minutos</SelectItem>
                    <SelectItem value="60">1 hora</SelectItem>
                    <SelectItem value="90">1h 30min</SelectItem>
                    <SelectItem value="120">2 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pl-6">
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-xs">
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    Com {settings.umblerNoResponseMinutes < 60
                      ? `${settings.umblerNoResponseMinutes} min`
                      : settings.umblerNoResponseMinutes === 60
                      ? "1h"
                      : `${Math.floor(settings.umblerNoResponseMinutes / 60)}h ${settings.umblerNoResponseMinutes % 60 > 0 ? `${settings.umblerNoResponseMinutes % 60}min` : ""}`} configurados:
                  </p>
                  <div className="space-y-1.5 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40 shrink-0" />
                      <span>0 – {settings.umblerNoResponseMinutes} min após o disparo: <span className="text-foreground">normal</span> — aguardando resposta</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-warning shrink-0" />
                      <span>Após {settings.umblerNoResponseMinutes} min sem resposta: <span className="text-warning font-medium">aviso laranja</span> + borda no card da tarefa</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-destructive shrink-0" />
                      <span>Após {settings.umblerNoResponseMinutes * 2} min sem resposta: <span className="text-destructive font-medium">alerta vermelho</span> — atenção urgente</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* FUP elapsed alert */}
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Sinalização de FUP disparado — tempo sem resposta</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Após este tempo sem confirmação, o badge <strong className="text-foreground">"FUP disparado"</strong> muda
                    para <strong className="text-warning">laranja</strong> com o tempo decorrido.
                    Com 2× esse tempo vira <strong className="text-destructive">vermelho</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 pl-6">
                <Select
                  value={String(settings.fupElapsedAlertMinutes)}
                  onValueChange={(v) => setSettings(writeSettings({ fupElapsedAlertMinutes: Number(v) }))}
                >
                  <SelectTrigger className="w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutos</SelectItem>
                    <SelectItem value="20">20 minutos</SelectItem>
                    <SelectItem value="30">30 minutos (padrão)</SelectItem>
                    <SelectItem value="45">45 minutos</SelectItem>
                    <SelectItem value="60">1 hora</SelectItem>
                    <SelectItem value="90">1h 30min</SelectItem>
                    <SelectItem value="120">2 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pl-6">
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-xs">
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    Com {settings.fupElapsedAlertMinutes < 60
                      ? `${settings.fupElapsedAlertMinutes}min`
                      : settings.fupElapsedAlertMinutes === 60
                      ? "1h"
                      : `${Math.floor(settings.fupElapsedAlertMinutes / 60)}h${settings.fupElapsedAlertMinutes % 60 > 0 ? ` ${settings.fupElapsedAlertMinutes % 60}min` : ""}`} configurados:
                  </p>
                  <div className="space-y-1.5 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-primary shrink-0" />
                      <span>0 – {settings.fupElapsedAlertMinutes}min: badge azul <span className="text-foreground">FUP disparado</span> — aguardando</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-warning shrink-0" />
                      <span>Após {settings.fupElapsedAlertMinutes}min: badge <span className="text-warning font-medium">laranja</span> — verifique resposta dos chapas</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-destructive shrink-0" />
                      <span>Após {settings.fupElapsedAlertMinutes * 2}min: badge <span className="text-destructive font-medium">vermelho</span> — atenção urgente</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Auto-cancel FUP */}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-2.5">
                  <UserMinus className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Cancelamento automático por falta de resposta</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Envia o template "sem resposta" automaticamente após o tempo configurado, se a tarefa ainda não tiver começado.
                      Avisa 5 minutos antes do disparo.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.autoCancelFupEnabled}
                  onCheckedChange={(v) => setSettings(writeSettings({ autoCancelFupEnabled: v }))}
                />
              </div>

              {settings.autoCancelFupEnabled && (
                <div className="flex items-center gap-3 pl-6">
                  <Select
                    value={String(settings.autoCancelFupMinutes)}
                    onValueChange={(v) => setSettings(writeSettings({ autoCancelFupMinutes: Number(v) }))}
                  >
                    <SelectTrigger className="w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 minutos</SelectItem>
                      <SelectItem value="45">45 minutos</SelectItem>
                      <SelectItem value="60">1 hora (recomendado)</SelectItem>
                      <SelectItem value="90">1h 30min</SelectItem>
                      <SelectItem value="120">2 horas</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">após o FUP</span>
                </div>
              )}
            </div>

            <Separator />

            {/* FUP automático — bloqueio por proximidade */}
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <RefreshCw className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Lembrete de aproximação do FUP automático</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Se um FUP manual foi enviado mais de X horas antes da tarefa, o disparo automático de aproximação ainda ocorre como reforço.
                      Abaixo desse limite, o auto-disparo é bloqueado (FUP recente já cobre).
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Select
                      value={String(settings.fupAutoDispatchBloqueioHoras)}
                      onValueChange={(v) => setSettings(writeSettings({ fupAutoDispatchBloqueioHoras: Number(v) }))}
                    >
                      <SelectTrigger className="w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 hora</SelectItem>
                        <SelectItem value="2">2 horas</SelectItem>
                        <SelectItem value="3">3 horas</SelectItem>
                        <SelectItem value="4">4 horas (recomendado)</SelectItem>
                        <SelectItem value="6">6 horas</SelectItem>
                        <SelectItem value="8">8 horas</SelectItem>
                        <SelectItem value="12">12 horas</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      FUP enviado há mais de {settings.fupAutoDispatchBloqueioHoras}h da tarefa → reforço automático ativo
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Portaria rules */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <DoorOpen className="h-4 w-4 text-muted-foreground" />
                    Alertas de portaria
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Avisa quando for hora de enviar a lista de nomes para liberação na portaria do cliente.
                  </p>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={openAddPortaria}>
                  <Plus className="h-3.5 w-3.5" /> Adicionar
                </Button>
              </div>

              {settings.portariaRules.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  Nenhum alerta de portaria configurado ainda.
                </div>
              ) : (
                <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                  {settings.portariaRules.map((rule) => (
                    <div key={rule.id} className="flex items-center gap-3 px-4 py-3">
                      <DoorOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{rule.empresa}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" />
                          Aviso {rule.horasAntes}h antes do início da tarefa
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePortariaRule(rule.id)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Remover regra"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-lg bg-muted/40 border border-border p-3 flex items-start gap-2">
                <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Quando uma tarefa da empresa configurada estiver no intervalo definido, um aviso aparece no painel
                  flutuante com o botão de copiar a lista de nomes para envio à portaria.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Fill rate threshold ── */}
      <div id="cfg-fillrate" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TriangleAlert className="h-5 w-5 text-warning" />
              Alertas de preenchimento
            </CardTitle>
            <CardDescription>
              Threshold usado pelo Painel de Prioridades e pelo painel flutuante para sinalizar tarefas com fill rate insuficiente.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Limite mínimo de fill rate</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Abaixo desse valor a tarefa entra em alerta de preenchimento
                  </p>
                </div>
                <span className="text-3xl font-display font-bold text-warning tabular-nums">{threshold}%</span>
              </div>
              <Slider min={10} max={100} step={5} value={[threshold]} onValueChange={handleThresholdChange} className="w-full" />
              <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums select-none">
                <span>10% — só em crise</span>
                <span>60% — padrão</span>
                <span>100% — sempre avisa</span>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-center gap-2 flex-1">
                <TriangleAlert className="h-4 w-4 text-destructive shrink-0" />
                <p className="text-xs text-destructive">
                  <strong>{exampleBelow}% de fill</strong> → alerta ativo
                </p>
              </div>
              <div className="rounded-lg border border-success/30 bg-success/5 p-3 flex items-center gap-2 flex-1">
                <Check className="h-4 w-4 text-success shrink-0" />
                <p className="text-xs text-success">
                  <strong>{exampleAbove}% de fill</strong> → sem alerta
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Priority panel ── */}
      <div id="cfg-prioridades" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-5 w-5 text-warning" />
              Painel de Prioridades
            </CardTitle>
            <CardDescription>
              Ranking de tarefas por urgência exibido no dashboard — Emergente, Urgente e Monitorar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Exibir painel no dashboard</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Aparece abaixo dos KPIs e do fill rate por empresa, apenas na visão de hoje.
                </p>
              </div>
              <Switch
                checked={settings.priorityPanelEnabled}
                onCheckedChange={(v) => setSettings(writeSettings({ priorityPanelEnabled: v }))}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Ocultar nível "Monitorar"</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Mostra apenas Emergente e Urgente — reduz o ruído quando há muitas tarefas no dia.
                </p>
              </div>
              <Switch
                checked={settings.priorityPanelHideMonitorar}
                onCheckedChange={(v) => setSettings(writeSettings({ priorityPanelHideMonitorar: v }))}
                disabled={!settings.priorityPanelEnabled}
              />
            </div>

            <div className="rounded-lg bg-muted/40 border border-border p-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong className="text-foreground">Emergente:</strong> sem chapas confirmados com início próximo, fill &lt; 50% em menos de 1h, ou tarefa urgente.</p>
                <p><strong className="text-foreground">Urgente:</strong> fill abaixo do threshold em até 1h30, overnight com fill baixo, tarefas grandes com vagas abertas.</p>
                <p><strong className="text-foreground">Monitorar:</strong> fill abaixo do threshold entre 1h30 e 8h.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Default view ── */}
      <div id="cfg-visualizacao" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LayoutList className="h-5 w-5 text-muted-foreground" />
              Visualização padrão do dashboard
            </CardTitle>
            <CardDescription>
              Define qual modo de exibição é carregado ao abrir o dashboard. Você pode alternar a qualquer momento com as teclas 1 e 2.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleViewChange("detailed")}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  settings.defaultDashboardView === "detailed"
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <LayoutList className="h-4 w-4 text-foreground" />
                    <span className="font-semibold text-sm text-foreground">Cards</span>
                  </div>
                  {settings.defaultDashboardView === "detailed" && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
                      <Check className="h-3 w-3" /> Padrão
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Card completo por tarefa. Todas as ações visíveis. Ideal para operação ativa.
                </p>
                <div className="mt-3 rounded-md bg-muted/60 p-2 space-y-1.5">
                  {["08:00", "10:30", "14:00"].map((h) => (
                    <div key={h} className="h-8 rounded bg-background border border-border flex items-center px-2 gap-2">
                      <div className="w-10 h-4 rounded bg-primary/20 text-[10px] flex items-center justify-center text-primary font-bold">{h}</div>
                      <div className="flex-1 h-2 rounded-full bg-muted">
                        <div className="h-full rounded-full bg-success/60" style={{ width: "70%" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleViewChange("panorama")}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  settings.defaultDashboardView === "panorama"
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Table2 className="h-4 w-4 text-foreground" />
                    <span className="font-semibold text-sm text-foreground">Panorama</span>
                  </div>
                  {settings.defaultDashboardView === "panorama" && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
                      <Check className="h-3 w-3" /> Padrão
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Linhas compactas. Clique para abrir o card lateral. Ideal para monitoramento.
                </p>
                <div className="mt-3 rounded-md bg-muted/60 p-2 space-y-1">
                  {[
                    { h: "08:00", fill: 100, color: "bg-success" },
                    { h: "10:30", fill: 45, color: "bg-warning" },
                    { h: "14:00", fill: 80, color: "bg-success" },
                  ].map((r) => (
                    <div key={r.h} className="h-6 rounded bg-background border border-border flex items-center px-2 gap-2">
                      <span className="text-[10px] font-bold text-foreground w-8 tabular-nums">{r.h}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted">
                        <div className={`h-full rounded-full ${r.color}`} style={{ width: `${r.fill}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums">{r.fill}%</span>
                    </div>
                  ))}
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleViewChange("timeline")}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  settings.defaultDashboardView === "timeline"
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <GanttChart className="h-4 w-4 text-foreground" />
                    <span className="font-semibold text-sm text-foreground">Timeline</span>
                  </div>
                  {settings.defaultDashboardView === "timeline" && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
                      <Check className="h-3 w-3" /> Padrão
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Gantt por horário. Blocos coloridos por fill rate. Clique para abrir em overlay.
                </p>
                <div className="mt-3 rounded-md bg-muted/60 p-2 space-y-1">
                  {[
                    { left: "0%", width: "35%", color: "bg-success" },
                    { left: "20%", width: "40%", color: "bg-warning" },
                    { left: "50%", width: "30%", color: "bg-destructive" },
                  ].map((r, i) => (
                    <div key={i} className="relative h-5 rounded bg-background border border-border overflow-hidden">
                      <div
                        className={`absolute top-1 bottom-1 rounded ${r.color} opacity-80`}
                        style={{ left: r.left, width: r.width }}
                      />
                    </div>
                  ))}
                </div>
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Agenda ── */}
      <div id="cfg-agenda" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KanbanSquare className="h-5 w-5 text-muted-foreground" />
              Agenda
            </CardTitle>
            <CardDescription>
              Comportamento do quadro Kanban de tarefas internas (Gestão → Agenda).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Ordenação padrão das tarefas</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Define como os cards são ordenados dentro de cada coluna do Kanban.
                </p>
              </div>
              <Select
                value={settings.agendaSortBy}
                onValueChange={(v) =>
                  setSettings(writeSettings({ agendaSortBy: v as "prazo" | "importancia" }))
                }
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prazo">Por prazo</SelectItem>
                  <SelectItem value="importancia">Por importância</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Operador ── */}
      <div id="cfg-operador" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-5 w-5 text-muted-foreground" />
              Operador
            </CardTitle>
            <CardDescription>
              Identificação registrada nos logs de FUP e ações do sistema para rastreabilidade.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Seu nome</label>
              <Input
                value={settings.operadorNome}
                onChange={(e) => setSettings(writeSettings({ operadorNome: e.target.value }))}
                placeholder="Ex.: Carlos, Mariana, Operação…"
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                Aparece nos logs de FUP e é visível no painel de histórico.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Backup ── */}
      <div id="cfg-backup" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HardDrive className="h-5 w-5 text-muted-foreground" />
              Backup do banco de dados
            </CardTitle>
            <CardDescription>
              Copia o banco de dados local para a pasta <strong>Documentos/MCM</strong> com timestamp.
              Faça backup regularmente para proteger seus dados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Backup rápido existente */}
            <div className="flex items-center gap-4 flex-wrap">
              <Button
                onClick={handleBackup}
                disabled={backupLoading || !isTauri}
                variant="outline"
                className="gap-2"
              >
                <Database className={`h-4 w-4 ${backupLoading ? "animate-pulse" : ""}`} />
                {backupLoading ? "Fazendo backup…" : "Backup rápido (.db)"}
              </Button>
              {lastBackup && (
                <p className="text-xs text-muted-foreground">
                  Último: <span className="text-foreground font-medium">{lastBackup}</span>
                </p>
              )}
            </div>

            <Separator />

            {/* Snapshot completo */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Snapshot completo</p>
              <p className="text-xs text-muted-foreground">
                Exporta banco de dados + configurações em um único arquivo <code>.mcmbak</code>. Use para migrar o MCM para outro computador ou restaurar tudo de uma vez.
              </p>
              <div className="flex flex-wrap gap-3 items-center">
                <Button
                  onClick={handleExportSnapshot}
                  disabled={snapshotExporting || !isTauri}
                  variant="outline"
                  className="gap-2"
                >
                  <HardDrive className={`h-4 w-4 ${snapshotExporting ? "animate-pulse" : ""}`} />
                  {snapshotExporting ? "Exportando…" : "Exportar snapshot"}
                </Button>

                <label className={`inline-flex items-center gap-2 cursor-pointer px-4 py-2 rounded-md border border-input bg-background text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground ${snapshotImporting || !isTauri ? "opacity-50 pointer-events-none" : ""}`}>
                  <Upload className={`h-4 w-4 ${snapshotImporting ? "animate-pulse" : ""}`} />
                  {snapshotImporting ? "Importando…" : "Importar snapshot"}
                  <input
                    type="file"
                    accept=".mcmbak"
                    className="hidden"
                    onChange={handleImportSnapshot}
                    disabled={snapshotImporting || !isTauri}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-lg bg-muted/40 border border-border p-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                A importação substitui <strong>todos os dados</strong> desta máquina. Um backup automático do banco atual é criado antes. Reabra o MCM após importar para aplicar completamente.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Planilha LEO ── */}
      <div id="cfg-leo" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sheet className="h-5 w-5 text-muted-foreground" />
              Planilha LEO — Histórico BID
            </CardTitle>
            <CardDescription>
              Dados de aceite/rejeição de BID usados pelo BID Dashboard para ranquear chapas.
              Importe o CSV exportado do MeuChapa ou sincronize pela planilha Google.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Status atual */}
            {leoTotal > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-4 py-2.5">
                <Check className="h-4 w-4 text-success shrink-0" />
                <p className="text-xs text-success font-medium">
                  {leoTotal.toLocaleString("pt-BR")} números carregados
                  {leoLastSync && ` · atualizado ${new Date(leoLastSync).toLocaleString("pt-BR")}`}
                </p>
              </div>
            )}

            {/* Importar CSV */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Importar CSV de Respostas BID</p>
              <p className="text-xs text-muted-foreground">
                Exporte o relatório "Respostas BID" do MeuChapa e importe aqui. Os dados ficam salvos localmente e ficam disponíveis no BID Dashboard imediatamente.
              </p>
              <label htmlFor="leo-csv-cfg" className="cursor-pointer">
                <Button variant="outline" size="sm" className="gap-2 pointer-events-none" asChild>
                  <span>
                    <Upload className={`h-3.5 w-3.5 ${leoCsvLoading ? "animate-pulse" : ""}`} />
                    {leoCsvLoading ? "Importando…" : "Selecionar CSV"}
                  </span>
                </Button>
                <input
                  id="leo-csv-cfg"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  disabled={leoCsvLoading}
                  onChange={handleLeoCsvImport}
                />
              </label>
            </div>

            <Separator />

            {/* Sincronizar pelo Google Sheets */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Sincronizar pela planilha Google</p>
              <p className="text-xs text-muted-foreground">
                Cole o URL ou ID da planilha LEO no Google Sheets e carregue a credencial de Service Account para sincronização automática.
              </p>
              <div className="flex gap-2">
                <Input
                  value={leoSheetId}
                  onChange={(e) => setLeoSheetId(e.target.value)}
                  placeholder="URL ou ID da planilha"
                  className="flex-1 text-sm"
                />
                <Button variant="outline" size="sm" onClick={handleLeoSaveSheetId} disabled={!leoSheetId}>
                  Salvar
                </Button>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <label htmlFor="leo-cred-cfg" className="cursor-pointer">
                  <Button variant="outline" size="sm" className="gap-2 pointer-events-none" asChild>
                    <span>
                      <FileKey className="h-3.5 w-3.5" />
                      {leoHasCred ? "Substituir credencial" : "Carregar JSON de credencial"}
                    </span>
                  </Button>
                  <input
                    id="leo-cred-cfg"
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleLeoCredFile}
                  />
                </label>
                {leoHasCred && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleSyncLeo}
                    disabled={leoSyncing}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${leoSyncing ? "animate-spin" : ""}`} />
                    {leoSyncing ? "Sincronizando…" : "Sincronizar agora"}
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-lg bg-muted/40 border border-border p-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Os dados LEO são usados pelo BID Dashboard para calcular o score de cada chapa (taxa de aceite, recorrência).
                Também alimentam a análise "Nunca Contatados via BID" na Análise de Base. Atualize sempre que receber um novo relatório do MeuChapa.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        As configurações são salvas automaticamente neste dispositivo.
      </p>

      {/* ── Dialog de portaria ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo alerta de portaria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Empresa</label>
              <Select value={newEmpresa} onValueChange={setNewEmpresa}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a empresa…" />
                </SelectTrigger>
                <SelectContent className="max-h-[260px]">
                  {companies.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Horas antes do início</label>
                <span className="text-2xl font-display font-bold text-primary tabular-nums">{newHoras}h</span>
              </div>
              <Slider min={1} max={24} step={1} value={[newHoras]} onValueChange={(v) => setNewHoras(v[0])} />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>1h — última hora</span>
                <span>4h — recomendado</span>
                <span>24h — antecipado</span>
              </div>
            </div>

            {newEmpresa && (
              <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground">
                O alerta vai aparecer quando uma tarefa de{" "}
                <strong className="text-foreground">{newEmpresa}</strong>{" "}
                estiver a <strong className="text-foreground">{newHoras}h</strong> ou menos do início.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={addPortariaRule} disabled={!newEmpresa}>Salvar alerta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
