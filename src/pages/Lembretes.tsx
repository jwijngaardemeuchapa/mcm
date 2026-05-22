import { useCallback, useEffect, useState } from "react";
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight, Clock } from "lucide-react";
import { getDb, uuid, errMsg } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Lembrete = {
  id: string;
  empresa: string;
  mensagem: string;
  minutos_antes: number;
  ativo: number;
};

const ANTES_OPTIONS = [
  { value: 15, label: "15 minutos antes" },
  { value: 30, label: "30 minutos antes" },
  { value: 60, label: "1 hora antes" },
  { value: 90, label: "1h 30min antes" },
  { value: 120, label: "2 horas antes" },
  { value: 180, label: "3 horas antes" },
  { value: 240, label: "4 horas antes" },
  { value: 480, label: "8 horas antes" },
  { value: 1440, label: "24 horas antes" },
];

function fmtAntes(min: number): string {
  const opt = ANTES_OPTIONS.find((o) => o.value === min);
  if (opt) return opt.label;
  if (min < 60) return `${min} min antes`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min antes` : `${h}h antes`;
}

export default function Lembretes() {
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  const [carteira, setCarteira] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Lembrete | null>(null);

  // Form state
  const [formEmpresa, setFormEmpresa] = useState("");
  const [formMensagem, setFormMensagem] = useState("");
  const [formMinutos, setFormMinutos] = useState(60);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const db = await getDb();
      const rows = await db.select<Lembrete[]>(
        "SELECT id, empresa, mensagem, minutos_antes, ativo FROM lembretes ORDER BY empresa ASC, minutos_antes ASC",
      );
      setLembretes(rows);

      const cart = await db.select<{ nome_fantasia: string }[]>(
        "SELECT nome_fantasia FROM carteira ORDER BY nome_fantasia ASC",
      );
      setCarteira(cart.map((c) => c.nome_fantasia));
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setFormEmpresa(carteira[0] ?? "");
    setFormMensagem("");
    setFormMinutos(60);
    setDialogOpen(true);
  }

  async function save() {
    if (!formEmpresa.trim()) { toast.error("Selecione a empresa"); return; }
    if (!formMensagem.trim()) { toast.error("Informe a mensagem"); return; }
    setSaving(true);
    try {
      const db = await getDb();
      await db.execute(
        "INSERT INTO lembretes (id, empresa, mensagem, minutos_antes, ativo, criado_em) VALUES (?, ?, ?, ?, 1, ?)",
        [uuid(), formEmpresa.trim(), formMensagem.trim(), formMinutos, new Date().toISOString()],
      );
      toast.success("Lembrete criado");
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleAtivo(l: Lembrete) {
    try {
      const db = await getDb();
      await db.execute("UPDATE lembretes SET ativo = ? WHERE id = ?", [l.ativo ? 0 : 1, l.id]);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      const db = await getDb();
      await db.execute("DELETE FROM lembretes WHERE id = ?", [deleteTarget.id]);
      toast.success("Lembrete removido");
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  const ativos = lembretes.filter((l) => l.ativo);
  const inativos = lembretes.filter((l) => !l.ativo);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Lembretes</h1>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          Novo Lembrete
        </Button>
      </div>

      {/* Explanation */}
      <p className="text-sm text-muted-foreground leading-relaxed">
        Lembretes são alertas automáticos vinculados a uma empresa. Quando uma tarefa dessa empresa
        entrar na janela de tempo configurada, o lembrete aparece no <strong>Banner de Alertas</strong> e
        no <strong>Painel de Prioridades</strong> do Dashboard.
      </p>

      {/* Empty state */}
      {lembretes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Bell className="h-10 w-10 opacity-30" />
          <p className="text-sm font-medium">Nenhum lembrete cadastrado</p>
          <p className="text-xs text-center max-w-xs">
            Crie um lembrete para receber alertas automáticos antes das tarefas de uma empresa específica.
          </p>
          <Button size="sm" variant="outline" className="gap-1.5 mt-2" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            Criar primeiro lembrete
          </Button>
        </div>
      )}

      {/* Ativos */}
      {ativos.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Ativos — {ativos.length}
          </h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-card divide-y divide-border">
            {ativos.map((l) => (
              <LembreteRow key={l.id} lembrete={l} onToggle={toggleAtivo} onDelete={setDeleteTarget} />
            ))}
          </div>
        </div>
      )}

      {/* Inativos */}
      {inativos.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Desativados — {inativos.length}
          </h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-card divide-y divide-border opacity-60">
            {inativos.map((l) => (
              <LembreteRow key={l.id} lembrete={l} onToggle={toggleAtivo} onDelete={setDeleteTarget} />
            ))}
          </div>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => !saving && setDialogOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              Novo Lembrete
            </DialogTitle>
            <DialogDescription>
              O alerta aparecerá automaticamente quando uma tarefa dessa empresa entrar na janela de tempo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Empresa */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Empresa</label>
              {carteira.length > 0 ? (
                <Select value={formEmpresa} onValueChange={setFormEmpresa}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {carteira.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="Nome da empresa"
                  value={formEmpresa}
                  onChange={(e) => setFormEmpresa(e.target.value)}
                />
              )}
              <p className="text-[11px] text-muted-foreground">
                A correspondência é flexível — ignora sufixos (LTDA, SA) e variações de escrita.
              </p>
            </div>

            {/* Tempo antes */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Quando avisar
              </label>
              <Select
                value={String(formMinutos)}
                onValueChange={(v) => setFormMinutos(Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANTES_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Mensagem */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Mensagem do lembrete</label>
              <Textarea
                placeholder="Ex: Verificar CPF dos chapas · Ligar para o responsável de portaria"
                value={formMensagem}
                onChange={(e) => setFormMensagem(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Preview */}
            {formEmpresa && formMensagem && (
              <div className="rounded-lg border border-info/30 bg-info/5 px-3 py-2.5 text-xs space-y-0.5">
                <div className="font-semibold text-info flex items-center gap-1.5">
                  <Bell className="h-3 w-3" />
                  Pré-visualização
                </div>
                <div className="text-foreground">
                  <span className="font-medium capitalize">{formEmpresa.toLowerCase()}</span>
                  {" · "}
                  {formMensagem}
                </div>
                <div className="text-muted-foreground">
                  Dispara {fmtAntes(formMinutos)}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {saving ? "Salvando…" : "Criar lembrete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover lembrete?</DialogTitle>
            <DialogDescription>
              O lembrete de <strong className="capitalize">{deleteTarget?.empresa.toLowerCase()}</strong> será removido permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LembreteRow({
  lembrete: l,
  onToggle,
  onDelete,
}: {
  lembrete: Lembrete;
  onToggle: (l: Lembrete) => void;
  onDelete: (l: Lembrete) => void;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {/* Toggle */}
      <button
        type="button"
        onClick={() => onToggle(l)}
        className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
        title={l.ativo ? "Desativar" : "Ativar"}
        aria-label={l.ativo ? "Desativar lembrete" : "Ativar lembrete"}
      >
        {l.ativo ? (
          <ToggleRight className="h-5 w-5 text-success" />
        ) : (
          <ToggleLeft className="h-5 w-5" />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground capitalize">
            {l.empresa.toLowerCase()}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-info/10 text-info border-info/30">
            <Clock className="h-2.5 w-2.5" />
            {fmtAntes(l.minutos_antes)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 leading-snug">{l.mensagem}</p>
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={() => onDelete(l)}
        className="shrink-0 h-7 w-7 flex items-center justify-center rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
        aria-label="Remover lembrete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
