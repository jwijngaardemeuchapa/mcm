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
} from "lucide-react";
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

  useEffect(() => {
    getDb()
      .then((db) => db.select<{ nome_fantasia: string }[]>("SELECT nome_fantasia FROM carteira ORDER BY nome_fantasia"))
      .then((data) => setCompanies(data.map((r) => r.nome_fantasia).filter(Boolean)))
      .catch(() => {});
  }, []);

  function handleThresholdChange(value: number[]) {
    setSettings(writeSettings({ fillRateWarningThreshold: value[0] }));
  }

  function handleViewChange(view: "detailed" | "panorama") {
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

  const threshold = settings.fillRateWarningThreshold;
  const exampleBelow = Math.max(0, threshold - 10);
  const exampleAbove = Math.min(100, threshold + 10);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="font-display font-semibold text-2xl">Configurações</h1>
          <p className="text-sm text-muted-foreground">Personalize o comportamento do MCM</p>
        </div>
      </div>

      {/* ── Alertas ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-5 w-5 text-muted-foreground" />
            Alertas
          </CardTitle>
          <CardDescription>
            Controle quais alertas aparecem durante o uso do dashboard.
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
                  Após este tempo sem resposta de um chapa contactado via Umbler, o aviso{" "}
                  <strong className="text-foreground">"Sem resposta"</strong> aparece na tela de Disparos Umbler
                  com destaque laranja. Depois de 2× esse tempo o destaque vira vermelho (urgente).
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

            {/* Live preview */}
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
                    <span>Após {settings.umblerNoResponseMinutes} min sem resposta: <span className="text-warning font-medium">aviso laranja</span> "Sem resposta" + borda no card da tarefa</span>
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
                  Com 2× esse tempo vira <strong className="text-destructive">vermelho</strong> (urgente).
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

      {/* ── Fill rate threshold ── */}
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

      {/* ── Priority panel ── */}
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
            <p className="text-xs text-muted-foreground">
              O nível <strong className="text-foreground">Emergente</strong> cobre: sem chapas confirmados e início próximo, fill &lt; 50% em menos de 1h, ou tarefa marcada como urgente.
              O nível <strong className="text-foreground">Urgente</strong> cobre: fill abaixo do threshold em até 1h30, tarefas overnight com fill baixo, e tarefas grandes com vagas abertas.
              O nível <strong className="text-foreground">Monitorar</strong> cobre tarefas entre 1h30 e 8h com fill abaixo do threshold.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Default view ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LayoutList className="h-5 w-5 text-muted-foreground" />
            Visualização padrão do dashboard
          </CardTitle>
          <CardDescription>
            Define qual modo de exibição é carregado ao abrir o dashboard.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <span className="font-semibold text-sm text-foreground">Cards (detalhada)</span>
                </div>
                {settings.defaultDashboardView === "detailed" && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
                    <Check className="h-3 w-3" /> Padrão
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Um card completo por tarefa com todas as ações disponíveis.
              </p>
              <div className="mt-3 rounded-md bg-muted/60 p-2 space-y-1.5">
                {["08:00", "10:30", "14:00"].map((h) => (
                  <div key={h} className="h-10 rounded bg-background border border-border flex items-center px-2 gap-2">
                    <div className="w-10 h-5 rounded bg-primary/20 text-[9px] flex items-center justify-center text-primary font-bold">{h}</div>
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
                  <span className="font-semibold text-sm text-foreground">Panorama (tabela)</span>
                </div>
                {settings.defaultDashboardView === "panorama" && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
                    <Check className="h-3 w-3" /> Padrão
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Todas as tarefas em linhas compactas. Clique para abrir o card lateral.
              </p>
              <div className="mt-3 rounded-md bg-muted/60 p-2 space-y-1">
                {[
                  { h: "08:00", fill: 100, color: "bg-success" },
                  { h: "10:30", fill: 45, color: "bg-warning" },
                  { h: "14:00", fill: 80, color: "bg-success" },
                ].map((r) => (
                  <div key={r.h} className="h-7 rounded bg-background border border-border flex items-center px-2 gap-2">
                    <span className="text-[9px] font-bold text-foreground w-8 tabular-nums">{r.h}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted">
                      <div className={`h-full rounded-full ${r.color}`} style={{ width: `${r.fill}%` }} />
                    </div>
                    <span className="text-[9px] text-muted-foreground tabular-nums">{r.fill}%</span>
                  </div>
                ))}
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ── Agenda ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KanbanSquare className="h-5 w-5 text-muted-foreground" />
            Agenda
          </CardTitle>
          <CardDescription>
            Comportamento do quadro Kanban de tarefas internas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Ordenação padrão das tarefas</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Define como os cards são ordenados dentro de cada coluna.
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

      {/* ── Operador ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-5 w-5 text-muted-foreground" />
            Operador
          </CardTitle>
          <CardDescription>
            Identificação registrada nos logs de FUP e ações do sistema.
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
              Aparece nos logs de FUP e é visível no painel de histórico para rastreabilidade.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Backup ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="h-5 w-5 text-muted-foreground" />
            Backup do banco de dados
          </CardTitle>
          <CardDescription>
            Copia o banco de dados local para a pasta <strong>Documentos/MCM</strong> com timestamp.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <Button
              onClick={handleBackup}
              disabled={backupLoading || !isTauri}
              variant="outline"
              className="gap-2"
            >
              <Database className={`h-4 w-4 ${backupLoading ? "animate-pulse" : ""}`} />
              {backupLoading ? "Fazendo backup…" : "Fazer backup agora"}
            </Button>
            {lastBackup && (
              <p className="text-xs text-muted-foreground">
                Último backup: <span className="text-foreground font-medium">{lastBackup}</span>
              </p>
            )}
          </div>
          <div className="rounded-lg bg-muted/40 border border-border p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              O arquivo de backup contém todas as tarefas, chapas, logs e configurações.
              Guarde uma cópia regularmente — o backup não substitui configurações do sistema operacional.
            </p>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        As configurações são salvas automaticamente neste dispositivo.
      </p>

      {/* Add portaria rule dialog */}
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
