import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BookUser,
  Plus,
  Search,
  Phone,
  Copy,
  Pencil,
  Trash2,
  Building2,
  Star,
  ChevronDown,
  ChevronUp,
  User,
  X,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { normalize } from "@/lib/normalize";

type ChapaEntry = {
  id: string;
  nome: string;
  telefone1: string | null;
  telefone2: string | null;
  cpf: string | null;
  empresas: string | null;
  grupo: string | null;
  status_chapa: string;
  observacoes: string | null;
  pedidos: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  ativo: { label: "Ativo", cls: "bg-success/15 text-success border-success/30" },
  inativo: { label: "Inativo", cls: "bg-muted/60 text-muted-foreground border-border" },
  bloqueado: { label: "Bloqueado", cls: "bg-destructive/15 text-destructive border-destructive/30" },
};

const EMPTY: Omit<ChapaEntry, "id" | "created_at" | "updated_at"> = {
  nome: "",
  telefone1: null,
  telefone2: null,
  cpf: null,
  empresas: null,
  grupo: null,
  status_chapa: "ativo",
  observacoes: null,
  pedidos: null,
};

async function clipCopy(text: string, msg: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
  toast.success(msg);
}

function formatPhone(p: string | null): string {
  if (!p) return "";
  const d = p.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p;
}

export default function ChapaBook() {
  const [searchParams] = useSearchParams();
  const [entries, setEntries] = useState<ChapaEntry[]>([]);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ChapaEntry | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ChapaEntry | null>(null);

  const load = useCallback(async () => {
    try {
      const db = await getDb();
      const rows = await db.select<ChapaEntry[]>(
        "SELECT * FROM chapa_book ORDER BY nome COLLATE NOCASE ASC",
      );
      setEntries(rows);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = entries.filter((e) => {
    if (statusFilter !== "__all__" && e.status_chapa !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = normalize(search);
    return (
      normalize(e.nome).includes(q) ||
      (e.telefone1 && e.telefone1.replace(/\D/g, "").includes(q.replace(/\D/g, ""))) ||
      (e.telefone2 && e.telefone2.replace(/\D/g, "").includes(q.replace(/\D/g, ""))) ||
      (e.empresas && normalize(e.empresas).includes(q)) ||
      (e.grupo && normalize(e.grupo).includes(q))
    );
  });

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY });
    setDialogOpen(true);
  }

  function openEdit(e: ChapaEntry) {
    setEditing(e);
    setForm({
      nome: e.nome,
      telefone1: e.telefone1,
      telefone2: e.telefone2,
      cpf: e.cpf,
      empresas: e.empresas,
      grupo: e.grupo,
      status_chapa: e.status_chapa,
      observacoes: e.observacoes,
      pedidos: e.pedidos,
    });
    setDialogOpen(true);
  }

  async function saveForm() {
    if (!form.nome.trim()) return;
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      if (editing) {
        await db.execute(
          `UPDATE chapa_book SET nome=?,telefone1=?,telefone2=?,cpf=?,empresas=?,grupo=?,status_chapa=?,observacoes=?,pedidos=?,updated_at=? WHERE id=?`,
          [form.nome.trim(), form.telefone1 || null, form.telefone2 || null, form.cpf || null,
           form.empresas || null, form.grupo || null, form.status_chapa,
           form.observacoes || null, form.pedidos || null, now, editing.id],
        );
        toast.success("Chapa atualizado");
      } else {
        await db.execute(
          `INSERT INTO chapa_book (id,nome,telefone1,telefone2,cpf,empresas,grupo,status_chapa,observacoes,pedidos,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [uuid(), form.nome.trim(), form.telefone1 || null, form.telefone2 || null, form.cpf || null,
           form.empresas || null, form.grupo || null, form.status_chapa,
           form.observacoes || null, form.pedidos || null, now, now],
        );
        toast.success("Chapa adicionado");
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(`Erro ao salvar: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      const db = await getDb();
      await db.execute("DELETE FROM chapa_book WHERE id = ?", [deleteTarget.id]);
      setDeleteTarget(null);
      toast.success("Chapa removido");
      load();
    } catch (e) {
      toast.error(`Erro ao remover: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BookUser className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="font-display font-semibold text-2xl">Caderno de Chapas</h1>
            <p className="text-sm text-muted-foreground">
              {entries.length} chapa{entries.length !== 1 ? "s" : ""} cadastrado{entries.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button onClick={openAdd} className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo chapa
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar nome, telefone, empresa…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos status</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
            <SelectItem value="bloqueado">Bloqueado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          <User className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{search ? "Nenhum resultado para a busca." : "Nenhum chapa cadastrado ainda."}</p>
          {!search && (
            <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5" /> Cadastrar primeiro chapa
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
          {filtered.map((e) => {
            const st = STATUS_LABELS[e.status_chapa] ?? STATUS_LABELS.ativo;
            const isExpanded = expanded.has(e.id);
            const empresaList = e.empresas ? e.empresas.split(",").map((s) => s.trim()).filter(Boolean) : [];
            return (
              <div key={e.id} className="bg-card">
                {/* Main row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold text-sm uppercase">
                    {e.nome.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-foreground capitalize">
                        {e.nome.toLowerCase()}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${st.cls}`}>
                        {st.label}
                      </span>
                      {e.grupo && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border flex items-center gap-1">
                          <Star className="h-2.5 w-2.5" /> {e.grupo}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {e.telefone1 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => clipCopy(e.telefone1!.replace(/\D/g, ""), "Telefone copiado")}
                              className="text-[12px] text-muted-foreground hover:text-primary hover:underline flex items-center gap-1"
                            >
                              <Phone className="h-2.5 w-2.5" />
                              {formatPhone(e.telefone1)}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Copiar telefone</TooltipContent>
                        </Tooltip>
                      )}
                      {e.telefone2 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => clipCopy(e.telefone2!.replace(/\D/g, ""), "Telefone 2 copiado")}
                              className="text-[12px] text-muted-foreground hover:text-primary hover:underline flex items-center gap-1"
                            >
                              <Phone className="h-2.5 w-2.5" />
                              {formatPhone(e.telefone2)}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Copiar telefone 2</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    {empresaList.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {empresaList.map((emp) => (
                          <span key={emp} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/8 text-primary border border-primary/20">
                            <Building2 className="h-2.5 w-2.5" /> {emp}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => clipCopy(e.nome, "Nome copiado")}
                          className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Copiar nome</TooltipContent>
                    </Tooltip>
                    <button
                      type="button"
                      onClick={() => openEdit(e)}
                      className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(e)}
                      className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    {(e.observacoes || e.pedidos || e.cpf) && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(e.id)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors"
                        title={isExpanded ? "Recolher" : "Expandir"}
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-3 border-t border-border/50 bg-muted/20 space-y-2 pt-3 ml-12">
                    {e.cpf && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">CPF:</span> {e.cpf}
                      </div>
                    )}
                    {e.observacoes && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Observações:</span>
                        <p className="mt-0.5 whitespace-pre-wrap">{e.observacoes}</p>
                      </div>
                    )}
                    {e.pedidos && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Pedidos / histórico:</span>
                        <p className="mt-0.5 whitespace-pre-wrap">{e.pedidos}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar chapa" : "Novo chapa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nome *</label>
              <Input
                placeholder="Nome completo"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Telefone 1</label>
                <Input
                  placeholder="(11) 99999-9999"
                  value={form.telefone1 ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, telefone1: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Telefone 2</label>
                <Input
                  placeholder="Opcional"
                  value={form.telefone2 ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, telefone2: e.target.value || null }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">CPF</label>
                <Input
                  placeholder="000.000.000-00"
                  value={form.cpf ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Grupo / equipe</label>
                <Input
                  placeholder="Ex: Turno A"
                  value={form.grupo ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, grupo: e.target.value || null }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Empresas (separadas por vírgula)
              </label>
              <Input
                placeholder="Ex: Empresa A, Empresa B"
                value={form.empresas ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, empresas: e.target.value || null }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select
                value={form.status_chapa}
                onValueChange={(v) => setForm((f) => ({ ...f, status_chapa: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="bloqueado">Bloqueado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Observações</label>
              <Textarea
                placeholder="Notas sobre este chapa…"
                rows={3}
                value={form.observacoes ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value || null }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Pedidos / histórico de solicitações
              </label>
              <Textarea
                placeholder="Ex: Pediu para não ser alocado em turno noturno…"
                rows={3}
                value={form.pedidos ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, pedidos: e.target.value || null }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveForm} disabled={!form.nome.trim()}>
              {editing ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir chapa?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground capitalize">{deleteTarget?.nome.toLowerCase()}</strong> será removido permanentemente do caderno.
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
