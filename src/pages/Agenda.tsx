import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  KanbanSquare,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  BookUser,
  Building2,
  Link2,
  AlertTriangle,
} from "lucide-react";
import { getDb, uuid } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "sonner";
import { readSettings } from "@/lib/settings";

type AgendaItem = {
  id: string;
  titulo: string;
  descricao: string | null;
  prazo: string | null;
  importancia: string;
  status: string;
  vinculo_tipo: string | null;
  vinculo_chapa_nome: string | null;
  vinculo_chapa_tel: string | null;
  vinculo_empresa: string | null;
  vinculo_id_tarefa: number | null;
  concluido_em: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: "a_fazer", label: "A Fazer", color: "border-t-slate-400" },
  { key: "em_andamento", label: "Em Andamento", color: "border-t-blue-500" },
  { key: "aguardando", label: "Aguardando", color: "border-t-amber-500" },
  { key: "concluido", label: "Concluído", color: "border-t-green-500" },
];

const IMP_RANK: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 };

const IMP_COLOR: Record<string, string> = {
  urgente: "border-l-red-500",
  alta: "border-l-orange-500",
  normal: "border-l-sky-500",
  baixa: "border-l-slate-400",
};

const IMP_BADGE: Record<string, string> = {
  urgente: "bg-destructive/15 text-destructive border-destructive/30",
  alta: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  normal: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  baixa: "bg-muted/60 text-muted-foreground border-border",
};

const IMP_LABEL: Record<string, string> = {
  urgente: "Urgente",
  alta: "Alta",
  normal: "Normal",
  baixa: "Baixa",
};

const EMPTY_FORM = {
  titulo: "",
  descricao: "",
  prazo: "",
  importancia: "normal",
  status: "a_fazer",
  vinculo_tipo: "",
  vinculo_chapa_nome: "",
  vinculo_chapa_tel: "",
  vinculo_empresa: "",
  vinculo_id_tarefa: "",
};

function fmtPrazo(prazo: string | null): { text: string; overdue: boolean; soon: boolean } {
  if (!prazo) return { text: "", overdue: false, soon: false };
  const d = new Date(prazo);
  if (isNaN(d.getTime())) return { text: prazo, overdue: false, soon: false };
  const now = Date.now();
  const diff = d.getTime() - now;
  const overdue = diff < 0;
  const soon = diff >= 0 && diff < 2 * 60 * 60 * 1000;
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const dd = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const text = dd === today ? `hoje ${hh}:${mm}` : `${dd} ${hh}:${mm}`;
  return { text, overdue, soon };
}

export default function Agenda() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AgendaItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgendaItem | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [movingCard, setMovingCard] = useState<{ id: string; dir: "left" | "right" } | null>(null);
  const [recentlyMoved, setRecentlyMoved] = useState<string | null>(null);
  const pendingMoveRef = useRef<(() => void) | null>(null);

  const sortBy = readSettings().agendaSortBy;

  const load = useCallback(async () => {
    try {
      const db = await getDb();
      const rows = await db.select<AgendaItem[]>("SELECT * FROM agenda");
      setItems(rows);
    } catch { /* silencioso — tabela pode não existir antes da migração */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  function sortItems(arr: AgendaItem[]): AgendaItem[] {
    return [...arr].sort((a, b) => {
      if (sortBy === "importancia") {
        const ir = (IMP_RANK[a.importancia] ?? 99) - (IMP_RANK[b.importancia] ?? 99);
        if (ir !== 0) return ir;
      }
      if (!a.prazo && !b.prazo) return 0;
      if (!a.prazo) return 1;
      if (!b.prazo) return -1;
      return new Date(a.prazo).getTime() - new Date(b.prazo).getTime();
    });
  }

  function openAdd(defaultStatus = "a_fazer") {
    setEditing(null);
    setForm({ ...EMPTY_FORM, status: defaultStatus });
    setDialogOpen(true);
  }

  function openEdit(item: AgendaItem) {
    setEditing(item);
    setForm({
      titulo: item.titulo,
      descricao: item.descricao ?? "",
      prazo: item.prazo ? new Date(item.prazo).toISOString().slice(0, 16) : "",
      importancia: item.importancia,
      status: item.status,
      vinculo_tipo: item.vinculo_tipo ?? "",
      vinculo_chapa_nome: item.vinculo_chapa_nome ?? "",
      vinculo_chapa_tel: item.vinculo_chapa_tel ?? "",
      vinculo_empresa: item.vinculo_empresa ?? "",
      vinculo_id_tarefa: item.vinculo_id_tarefa?.toString() ?? "",
    });
    setDialogOpen(true);
  }

  async function saveForm() {
    if (!form.titulo.trim()) return;
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      const prazo = form.prazo ? new Date(form.prazo).toISOString() : null;
      const concluido_em = form.status === "concluido" ? (editing?.concluido_em ?? now) : null;
      if (editing) {
        await db.execute(
          `UPDATE agenda SET titulo=?,descricao=?,prazo=?,importancia=?,status=?,vinculo_tipo=?,vinculo_chapa_nome=?,vinculo_chapa_tel=?,vinculo_empresa=?,vinculo_id_tarefa=?,concluido_em=?,updated_at=? WHERE id=?`,
          [form.titulo.trim(), form.descricao || null, prazo, form.importancia, form.status,
           form.vinculo_tipo || null, form.vinculo_chapa_nome || null, form.vinculo_chapa_tel || null,
           form.vinculo_empresa || null, form.vinculo_id_tarefa ? Number(form.vinculo_id_tarefa) : null,
           concluido_em, now, editing.id],
        );
        toast.success("Tarefa atualizada");
      } else {
        await db.execute(
          `INSERT INTO agenda (id,titulo,descricao,prazo,importancia,status,vinculo_tipo,vinculo_chapa_nome,vinculo_chapa_tel,vinculo_empresa,vinculo_id_tarefa,concluido_em,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [uuid(), form.titulo.trim(), form.descricao || null, prazo, form.importancia, form.status,
           form.vinculo_tipo || null, form.vinculo_chapa_nome || null, form.vinculo_chapa_tel || null,
           form.vinculo_empresa || null, form.vinculo_id_tarefa ? Number(form.vinculo_id_tarefa) : null,
           concluido_em, now, now],
        );
        toast.success("Tarefa criada");
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(`Erro ao salvar tarefa: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      const db = await getDb();
      await db.execute("DELETE FROM agenda WHERE id = ?", [deleteTarget.id]);
      setDeleteTarget(null);
      toast.success("Tarefa excluída");
      load();
    } catch (e) {
      toast.error(`Erro ao excluir: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function moveItem(item: AgendaItem, dir: "left" | "right") {
    const colIdx = COLUMNS.findIndex((c) => c.key === item.status);
    const nextIdx = colIdx + (dir === "right" ? 1 : -1);
    if (nextIdx < 0 || nextIdx >= COLUMNS.length) return;

    const nextStatus = COLUMNS[nextIdx].key;

    // Start exit animation
    setMovingCard({ id: item.id, dir });

    pendingMoveRef.current = async () => {
      try {
        const db = await getDb();
        const now = new Date().toISOString();
        const concluido_em = nextStatus === "concluido" ? now : null;
        await db.execute(
          "UPDATE agenda SET status=?,concluido_em=?,updated_at=? WHERE id=?",
          [nextStatus, concluido_em, now, item.id],
        );
        setMovingCard(null);
        await load();
        setRecentlyMoved(item.id);
        setTimeout(() => setRecentlyMoved(null), 700);
      } catch (e) {
        setMovingCard(null);
        toast.error(`Erro ao mover tarefa: ${e instanceof Error ? e.message : String(e)}`);
      }
    };

    setTimeout(() => {
      pendingMoveRef.current?.();
      pendingMoveRef.current = null;
    }, 220);
  }

  return (
    <div className="p-4 md:p-6 space-y-5 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-3">
          <KanbanSquare className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="font-display font-semibold text-2xl">Agenda</h1>
            <p className="text-sm text-muted-foreground">
              Gestão de tarefas internas
            </p>
          </div>
        </div>
        <Button onClick={() => openAdd()} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nova tarefa
        </Button>
      </div>

      {/* Kanban board */}
      <div className="flex gap-3 flex-1 overflow-x-auto pb-2 min-h-0">
        {COLUMNS.map((col, colIdx) => {
          const colItems = sortItems(items.filter((i) => i.status === col.key));
          return (
            <div
              key={col.key}
              className={`flex flex-col rounded-xl border border-border bg-muted/20 border-t-4 ${col.color} min-w-[260px] max-w-[320px] w-full flex-1`}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3 pt-3 pb-2 shrink-0">
                <span className="text-sm font-semibold text-foreground">{col.label}</span>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-bold text-muted-foreground tabular-nums bg-muted rounded-full px-2 py-0.5">
                    {colItems.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => openAdd(col.key)}
                    className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-colors"
                    title={`Adicionar em ${col.label}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-0">
                {colItems.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground/60 mt-1">
                    Vazio
                  </div>
                )}
                {colItems.map((item) => {
                  const isMoving = movingCard?.id === item.id;
                  const isNew = recentlyMoved === item.id;
                  const prazoInfo = fmtPrazo(item.prazo);
                  const canLeft = colIdx > 0;
                  const canRight = colIdx < COLUMNS.length - 1;

                  return (
                    <div
                      key={item.id}
                      style={{
                        opacity: isMoving ? 0 : 1,
                        transform: isMoving
                          ? `translateX(${movingCard.dir === "right" ? 24 : -24}px) scale(0.93)`
                          : "translateX(0) scale(1)",
                        transition: isMoving
                          ? "opacity 220ms ease, transform 220ms ease"
                          : "opacity 220ms ease, transform 220ms ease",
                        boxShadow: isNew
                          ? "0 0 0 2px rgba(99,102,241,0.45)"
                          : undefined,
                      }}
                      className={`rounded-lg border border-border bg-card p-3 border-l-4 ${IMP_COLOR[item.importancia] ?? "border-l-border"} transition-shadow duration-700`}
                    >
                      {/* Title + actions */}
                      <div className="flex items-start gap-2">
                        <p className="flex-1 text-sm font-medium text-foreground leading-snug break-words">
                          {item.titulo}
                        </p>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors"
                            title="Editar"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Description */}
                      {item.descricao && (
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                          {item.descricao}
                        </p>
                      )}

                      {/* Deadline */}
                      {prazoInfo.text && (
                        <div
                          className={`mt-2 inline-flex items-center gap-1 text-[11px] font-medium rounded-md px-2 py-0.5 ${
                            prazoInfo.overdue
                              ? "bg-destructive/15 text-destructive"
                              : prazoInfo.soon
                              ? "bg-warning/15 text-warning"
                              : "bg-muted/60 text-muted-foreground"
                          }`}
                        >
                          {prazoInfo.overdue ? (
                            <AlertTriangle className="h-3 w-3" />
                          ) : (
                            <CalendarClock className="h-3 w-3" />
                          )}
                          {prazoInfo.text}
                        </div>
                      )}

                      {/* Badges */}
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${IMP_BADGE[item.importancia] ?? ""}`}>
                          {IMP_LABEL[item.importancia] ?? item.importancia}
                        </span>
                        {item.vinculo_tipo === "chapa" && item.vinculo_chapa_nome && (
                          <button
                            type="button"
                            onClick={() => navigate(`/chapas?q=${encodeURIComponent(item.vinculo_chapa_nome!)}`)}
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/8 text-primary border border-primary/20 hover:bg-primary/15 transition-colors"
                            title="Ver no Caderno"
                          >
                            <BookUser className="h-2.5 w-2.5" />
                            {item.vinculo_chapa_nome.toLowerCase()}
                          </button>
                        )}
                        {item.vinculo_tipo === "empresa" && item.vinculo_empresa && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                            <Building2 className="h-2.5 w-2.5" />
                            {item.vinculo_empresa}
                          </span>
                        )}
                        {item.vinculo_tipo === "tarefa" && item.vinculo_id_tarefa && (
                          <a
                            href={`https://app.meu-chapa.net/admin/edit-task/${item.vinculo_id_tarefa}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border hover:text-primary transition-colors"
                          >
                            <Link2 className="h-2.5 w-2.5" />
                            #{item.vinculo_id_tarefa}
                          </a>
                        )}
                      </div>

                      {/* Move buttons */}
                      <div className="flex items-center gap-1 mt-2.5 pt-2 border-t border-border/50">
                        <button
                          type="button"
                          disabled={!canLeft || isMoving}
                          onClick={() => moveItem(item, "left")}
                          className="flex-1 h-6 inline-flex items-center justify-center gap-1 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={canLeft ? `← ${COLUMNS[colIdx - 1].label}` : undefined}
                        >
                          <ChevronLeft className="h-3 w-3" />
                          {canLeft && <span className="truncate">{COLUMNS[colIdx - 1].label}</span>}
                        </button>
                        <div className="w-px h-4 bg-border/60" />
                        <button
                          type="button"
                          disabled={!canRight || isMoving}
                          onClick={() => moveItem(item, "right")}
                          className="flex-1 h-6 inline-flex items-center justify-center gap-1 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={canRight ? `${COLUMNS[colIdx + 1].label} →` : undefined}
                        >
                          {canRight && <span className="truncate">{COLUMNS[colIdx + 1].label}</span>}
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Título *</label>
              <Input
                placeholder="Descreva a tarefa…"
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Descrição</label>
              <Textarea
                placeholder="Detalhes opcionais…"
                rows={2}
                value={form.descricao}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Prazo</label>
                <Input
                  type="datetime-local"
                  value={form.prazo}
                  onChange={(e) => setForm((f) => ({ ...f, prazo: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Importância</label>
                <Select value={form.importancia} onValueChange={(v) => setForm((f) => ({ ...f, importancia: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgente">Urgente</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="baixa">Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COLUMNS.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Vínculo</label>
                <Select
                  value={form.vinculo_tipo || "_none_"}
                  onValueChange={(v) => setForm((f) => ({ ...f, vinculo_tipo: v === "_none_" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none_">Nenhum</SelectItem>
                    <SelectItem value="chapa">Chapa</SelectItem>
                    <SelectItem value="empresa">Empresa</SelectItem>
                    <SelectItem value="tarefa">Tarefa (#ID)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.vinculo_tipo === "chapa" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Nome do chapa</label>
                  <Input
                    placeholder="Nome"
                    value={form.vinculo_chapa_nome}
                    onChange={(e) => setForm((f) => ({ ...f, vinculo_chapa_nome: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Telefone</label>
                  <Input
                    placeholder="Opcional"
                    value={form.vinculo_chapa_tel}
                    onChange={(e) => setForm((f) => ({ ...f, vinculo_chapa_tel: e.target.value }))}
                  />
                </div>
              </div>
            )}
            {form.vinculo_tipo === "empresa" && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Empresa</label>
                <Input
                  placeholder="Nome da empresa"
                  value={form.vinculo_empresa}
                  onChange={(e) => setForm((f) => ({ ...f, vinculo_empresa: e.target.value }))}
                />
              </div>
            )}
            {form.vinculo_tipo === "tarefa" && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">ID da tarefa</label>
                <Input
                  type="number"
                  placeholder="Ex: 432678"
                  value={form.vinculo_id_tarefa}
                  onChange={(e) => setForm((f) => ({ ...f, vinculo_id_tarefa: e.target.value }))}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveForm} disabled={!form.titulo.trim()}>
              {editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir tarefa?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{deleteTarget?.titulo}</strong> será excluída permanentemente.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
