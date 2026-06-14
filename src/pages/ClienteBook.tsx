import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Building2,
  Plus,
  Search,
  Phone,
  Mail,
  Copy,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Tag,
  User,
  AlertCircle,
  ClipboardList,
  BookMarked,
  MapPin,
  ExternalLink,
  Star,
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
import { cepGeocoder } from "@/lib/geocode";

type ClienteAddress = {
  id: string;
  label: string;
  endereco: string;
  maps_link: string;
  lat: number | null;
  lng: number | null;
  cep: string | null;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  principal?: boolean;
};

const EMPTY_ADDR = {
  label: "", cep: "", logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", uf: "", maps_link: "",
};

function composeEndereco(a: typeof EMPTY_ADDR): string {
  const linha1 = [a.logradouro.trim(), a.numero.trim()].filter(Boolean).join(", ");
  const comp = a.complemento.trim();
  const parts = [
    comp ? `${linha1} - ${comp}` : linha1,
    a.bairro.trim(),
    a.cidade.trim() && a.uf.trim() ? `${a.cidade.trim()} - ${a.uf.trim()}` : a.cidade.trim() || a.uf.trim(),
  ].filter(Boolean);
  return parts.join(", ");
}

type ClienteEntry = {
  id: string;
  nome: string;
  cnpj: string | null;
  contato_nome: string | null;
  telefone: string | null;
  email: string | null;
  segmento: string | null;
  status_cliente: string;
  particularidades: string | null;
  exigencias: string | null;
  pedidos: string | null;
  observacoes: string | null;
  enderecos: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  ativo: { label: "Ativo", cls: "bg-success/15 text-success border-success/30" },
  inativo: { label: "Inativo", cls: "bg-muted/60 text-muted-foreground border-border" },
  suspenso: { label: "Suspenso", cls: "bg-destructive/15 text-destructive border-destructive/30" },
};

const EMPTY: Omit<ClienteEntry, "id" | "created_at" | "updated_at"> = {
  nome: "",
  cnpj: null,
  contato_nome: null,
  telefone: null,
  email: null,
  segmento: null,
  status_cliente: "ativo",
  particularidades: null,
  exigencias: null,
  pedidos: null,
  observacoes: null,
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

function parseLatLng(url: string): { lat: number; lng: number } | null {
  const m =
    url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
    url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/) ||
    url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
}

export default function ClienteBook() {
  const [searchParams] = useSearchParams();
  const [entries, setEntries] = useState<ClienteEntry[]>([]);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClienteEntry | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ClienteEntry | null>(null);
  const [formEnderecos, setFormEnderecos] = useState<ClienteAddress[]>([]);
  const [addingAddr, setAddingAddr] = useState(false);
  const [newAddr, setNewAddr] = useState({ ...EMPTY_ADDR });
  const [editingAddrId, setEditingAddrId] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);

  function startEditAddr(addr: ClienteAddress) {
    setNewAddr({
      label: addr.label,
      cep: addr.cep ? (addr.cep.length === 8 ? `${addr.cep.slice(0, 5)}-${addr.cep.slice(5)}` : addr.cep) : "",
      // endereços antigos não têm campos estruturados — joga o texto inteiro no logradouro para edição
      logradouro: addr.logradouro ?? addr.endereco ?? "",
      numero: addr.numero ?? "",
      complemento: addr.complemento ?? "",
      bairro: addr.bairro ?? "",
      cidade: addr.cidade ?? "",
      uf: addr.uf ?? "",
      maps_link: addr.maps_link ?? "",
    });
    setEditingAddrId(addr.id);
    setAddingAddr(true);
  }

  const load = useCallback(async () => {
    try {
      const db = await getDb();
      const rows = await db.select<ClienteEntry[]>(
        "SELECT * FROM cliente_book ORDER BY nome COLLATE NOCASE ASC",
      );
      setEntries(rows);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = entries.filter((e) => {
    if (statusFilter !== "__all__" && e.status_cliente !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = normalize(search);
    return (
      normalize(e.nome).includes(q) ||
      (e.cnpj && e.cnpj.replace(/\D/g, "").includes(q.replace(/\D/g, ""))) ||
      (e.contato_nome && normalize(e.contato_nome).includes(q)) ||
      (e.telefone && e.telefone.replace(/\D/g, "").includes(q.replace(/\D/g, ""))) ||
      (e.segmento && normalize(e.segmento).includes(q)) ||
      (e.email && normalize(e.email).includes(q))
    );
  });

  async function handleCepChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    const formatted = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    setNewAddr((a) => ({ ...a, cep: formatted }));
    if (digits.length === 8) {
      setCepLoading(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setNewAddr((a) => ({
            ...a,
            logradouro: a.logradouro || data.logradouro || "",
            bairro: a.bairro || data.bairro || "",
            cidade: a.cidade || data.localidade || "",
            uf: a.uf || data.uf || "",
          }));
        }
      } catch { /* noop */ }
      finally { setCepLoading(false); }
      cepGeocoder.enqueue(digits, () => {});
    }
  }

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY });
    setFormEnderecos([]);
    setAddingAddr(false);
    setEditingAddrId(null);
    setNewAddr({ ...EMPTY_ADDR });
    setDialogOpen(true);
  }

  function openEdit(e: ClienteEntry) {
    setEditing(e);
    setForm({
      nome: e.nome,
      cnpj: e.cnpj,
      contato_nome: e.contato_nome,
      telefone: e.telefone,
      email: e.email,
      segmento: e.segmento,
      status_cliente: e.status_cliente,
      particularidades: e.particularidades,
      exigencias: e.exigencias,
      pedidos: e.pedidos,
      observacoes: e.observacoes,
    });
    try {
      setFormEnderecos(e.enderecos ? JSON.parse(e.enderecos) : []);
    } catch {
      setFormEnderecos([]);
    }
    setAddingAddr(false);
    setEditingAddrId(null);
    setNewAddr({ ...EMPTY_ADDR });
    setDialogOpen(true);
  }

  async function saveForm() {
    if (!form.nome.trim()) return;
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      const enderecosJson = formEnderecos.length > 0 ? JSON.stringify(formEnderecos) : null;
      if (editing) {
        await db.execute(
          `UPDATE cliente_book SET nome=?,cnpj=?,contato_nome=?,telefone=?,email=?,segmento=?,status_cliente=?,particularidades=?,exigencias=?,pedidos=?,observacoes=?,enderecos=?,updated_at=? WHERE id=?`,
          [form.nome.trim(), form.cnpj || null, form.contato_nome || null, form.telefone || null,
           form.email || null, form.segmento || null, form.status_cliente,
           form.particularidades || null, form.exigencias || null, form.pedidos || null,
           form.observacoes || null, enderecosJson, now, editing.id],
        );
        toast.success("Cliente atualizado");
      } else {
        await db.execute(
          `INSERT INTO cliente_book (id,nome,cnpj,contato_nome,telefone,email,segmento,status_cliente,particularidades,exigencias,pedidos,observacoes,enderecos,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [uuid(), form.nome.trim(), form.cnpj || null, form.contato_nome || null, form.telefone || null,
           form.email || null, form.segmento || null, form.status_cliente,
           form.particularidades || null, form.exigencias || null, form.pedidos || null,
           form.observacoes || null, enderecosJson, now, now],
        );
        toast.success("Cliente adicionado");
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
      await db.execute("DELETE FROM cliente_book WHERE id = ?", [deleteTarget.id]);
      setDeleteTarget(null);
      toast.success("Cliente removido");
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

  const hasDetails = (e: ClienteEntry) =>
    !!(e.particularidades || e.exigencias || e.pedidos || e.observacoes || e.cnpj || e.email || e.enderecos);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BookMarked className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="font-display font-semibold text-2xl">Caderno de Clientes</h1>
            <p className="text-sm text-muted-foreground">
              {entries.length} cliente{entries.length !== 1 ? "s" : ""} cadastrado{entries.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button onClick={openAdd} className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo cliente
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar nome, contato, segmento…"
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
            <SelectItem value="suspenso">Suspenso</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{search ? "Nenhum resultado para a busca." : "Nenhum cliente cadastrado ainda."}</p>
          {!search && (
            <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5" /> Cadastrar primeiro cliente
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
          {filtered.map((e) => {
            const st = STATUS_LABELS[e.status_cliente] ?? STATUS_LABELS.ativo;
            const isExpanded = expanded.has(e.id);
            return (
              <div key={e.id} className="bg-card">
                {/* Main row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold text-sm uppercase">
                    {e.nome.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-foreground">
                        {e.nome}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${st.cls}`}>
                        {st.label}
                      </span>
                      {e.segmento && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border flex items-center gap-1">
                          <Tag className="h-2.5 w-2.5" /> {e.segmento}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {e.contato_nome && (
                        <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                          <User className="h-2.5 w-2.5" /> {e.contato_nome}
                        </span>
                      )}
                      {e.telefone && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => clipCopy(e.telefone!.replace(/\D/g, ""), "Telefone copiado")}
                              className="text-[12px] text-muted-foreground hover:text-primary hover:underline flex items-center gap-1"
                            >
                              <Phone className="h-2.5 w-2.5" />
                              {formatPhone(e.telefone)}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Copiar telefone</TooltipContent>
                        </Tooltip>
                      )}
                      {e.email && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => clipCopy(e.email!, "E-mail copiado")}
                              className="text-[12px] text-muted-foreground hover:text-primary hover:underline flex items-center gap-1"
                            >
                              <Mail className="h-2.5 w-2.5" />
                              {e.email}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Copiar e-mail</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
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
                    {hasDetails(e) && (
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
                    {e.cnpj && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">CNPJ:</span>{" "}
                        <button
                          type="button"
                          onClick={() => clipCopy(e.cnpj!, "CNPJ copiado")}
                          className="hover:text-primary hover:underline"
                        >
                          {e.cnpj}
                        </button>
                      </div>
                    )}
                    {e.email && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">E-mail:</span>{" "}
                        <button
                          type="button"
                          onClick={() => clipCopy(e.email!, "E-mail copiado")}
                          className="hover:text-primary hover:underline"
                        >
                          {e.email}
                        </button>
                      </div>
                    )}
                    {e.particularidades && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground flex items-center gap-1 mb-0.5">
                          <AlertCircle className="h-3 w-3 text-warning" /> Particularidades
                        </span>
                        <p className="whitespace-pre-wrap ml-4">{e.particularidades}</p>
                      </div>
                    )}
                    {e.exigencias && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground flex items-center gap-1 mb-0.5">
                          <ClipboardList className="h-3 w-3 text-primary" /> Exigências recorrentes
                        </span>
                        <p className="whitespace-pre-wrap ml-4">{e.exigencias}</p>
                      </div>
                    )}
                    {e.pedidos && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Pedidos / histórico:</span>
                        <p className="mt-0.5 whitespace-pre-wrap">{e.pedidos}</p>
                      </div>
                    )}
                    {e.observacoes && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Observações:</span>
                        <p className="mt-0.5 whitespace-pre-wrap">{e.observacoes}</p>
                      </div>
                    )}
                    {e.enderecos && (() => {
                      try {
                        const addrs: ClienteAddress[] = JSON.parse(e.enderecos);
                        if (!addrs.length) return null;
                        return (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground flex items-center gap-1 mb-0.5">
                              <MapPin className="h-3 w-3 text-primary" /> Endereços
                            </span>
                            <div className="ml-4 space-y-0.5">
                              {addrs.map((addr) => (
                                <div key={addr.id}>
                                  <span className="font-medium text-foreground">{addr.label}:</span>{" "}
                                  {addr.endereco}
                                  {addr.maps_link && (
                                    <a href={addr.maps_link} className="ml-1.5 text-primary hover:underline inline-flex items-center gap-0.5">
                                      <ExternalLink className="h-2.5 w-2.5" /> Maps
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      } catch { return null; }
                    })()}
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
            <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nome / Razão Social *</label>
              <Input
                placeholder="Nome fantasia ou razão social"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">CNPJ</label>
                <Input
                  placeholder="00.000.000/0001-00"
                  value={form.cnpj ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Segmento</label>
                <Input
                  placeholder="Ex: Logística, Varejo"
                  value={form.segmento ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, segmento: e.target.value || null }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Contato principal</label>
              <Input
                placeholder="Nome do responsável"
                value={form.contato_nome ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, contato_nome: e.target.value || null }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Telefone</label>
                <Input
                  placeholder="(11) 99999-9999"
                  value={form.telefone ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">E-mail</label>
                <Input
                  placeholder="contato@empresa.com"
                  type="email"
                  value={form.email ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value || null }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select
                value={form.status_cliente}
                onValueChange={(v) => setForm((f) => ({ ...f, status_cliente: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Particularidades</label>
              <Textarea
                placeholder="Características especiais, restrições, preferências do cliente…"
                rows={3}
                value={form.particularidades ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, particularidades: e.target.value || null }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Exigências recorrentes</label>
              <Textarea
                placeholder="Ex: NR-35 obrigatório, crachá, EPI completo…"
                rows={3}
                value={form.exigencias ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, exigencias: e.target.value || null }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Pedidos / histórico</label>
              <Textarea
                placeholder="Pedidos frequentes, histórico de solicitações…"
                rows={3}
                value={form.pedidos ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, pedidos: e.target.value || null }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Observações gerais</label>
              <Textarea
                placeholder="Outras anotações sobre este cliente…"
                rows={2}
                value={form.observacoes ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value || null }))}
              />
            </div>

            {/* Endereços */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Endereços
                </label>
                {!addingAddr && (
                  <button
                    type="button"
                    onClick={() => setAddingAddr(true)}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Adicionar local
                  </button>
                )}
              </div>

              {formEnderecos.length > 0 && (
                <div className="space-y-1.5">
                  {formEnderecos.map((addr) => (
                    <div key={addr.id} className="flex items-start gap-2 rounded-md bg-muted/40 border border-border px-2 py-1.5">
                      <button
                        type="button"
                        title={addr.principal ? "Endereço principal" : "Definir como principal"}
                        onClick={() =>
                          setFormEnderecos((prev) => prev.map((a) => ({ ...a, principal: a.id === addr.id })))
                        }
                        className={`mt-0.5 shrink-0 transition-colors ${addr.principal ? "text-warning" : "text-muted-foreground/40 hover:text-warning"}`}
                      >
                        <Star className={`h-3 w-3 ${addr.principal ? "fill-current" : ""}`} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">
                          {addr.label}
                          {addr.principal && <span className="ml-1.5 text-[10px] text-warning font-semibold uppercase">principal</span>}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{addr.endereco}</p>
                        {addr.maps_link && (
                          <a href={addr.maps_link} className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
                            <ExternalLink className="h-2.5 w-2.5" /> Abrir no Maps
                          </a>
                        )}
                        {(addr.lat != null || addr.lng != null) && (
                          <p className="text-[10px] text-muted-foreground/60">{addr.lat?.toFixed(4)}, {addr.lng?.toFixed(4)}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => startEditAddr(addr)}
                        className="text-muted-foreground/50 hover:text-primary transition-colors mt-0.5"
                        title="Editar endereço"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormEnderecos((prev) => prev.filter((a) => a.id !== addr.id))}
                        className="text-muted-foreground/50 hover:text-destructive transition-colors mt-0.5"
                        title="Remover endereço"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {addingAddr && (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">Nome do local *</label>
                      <Input
                        placeholder="Ex: Sede SP, CD Campinas"
                        value={newAddr.label}
                        onChange={(e) => setNewAddr((a) => ({ ...a, label: e.target.value }))}
                        className="text-xs h-7"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                        CEP
                        {cepLoading && <span className="text-[10px] text-muted-foreground/60 animate-pulse">buscando…</span>}
                      </label>
                      <Input
                        placeholder="00000-000"
                        value={newAddr.cep}
                        onChange={(e) => handleCepChange(e.target.value)}
                        className="text-xs h-7 font-mono"
                        maxLength={9}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1 col-span-2">
                      <label className="text-[11px] text-muted-foreground">Logradouro *</label>
                      <Input
                        placeholder="Rua / Avenida"
                        value={newAddr.logradouro}
                        onChange={(e) => setNewAddr((a) => ({ ...a, logradouro: e.target.value }))}
                        className="text-xs h-7"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">Número</label>
                      <Input
                        placeholder="123"
                        value={newAddr.numero}
                        onChange={(e) => setNewAddr((a) => ({ ...a, numero: e.target.value }))}
                        className="text-xs h-7"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">Complemento</label>
                      <Input
                        placeholder="Galpão 2, Portaria B…"
                        value={newAddr.complemento}
                        onChange={(e) => setNewAddr((a) => ({ ...a, complemento: e.target.value }))}
                        className="text-xs h-7"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">Bairro</label>
                      <Input
                        placeholder="Bairro"
                        value={newAddr.bairro}
                        onChange={(e) => setNewAddr((a) => ({ ...a, bairro: e.target.value }))}
                        className="text-xs h-7"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1 col-span-2">
                      <label className="text-[11px] text-muted-foreground">Cidade *</label>
                      <Input
                        placeholder="Cidade"
                        value={newAddr.cidade}
                        onChange={(e) => setNewAddr((a) => ({ ...a, cidade: e.target.value }))}
                        className="text-xs h-7"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">UF</label>
                      <Input
                        placeholder="SP"
                        value={newAddr.uf}
                        onChange={(e) => setNewAddr((a) => ({ ...a, uf: e.target.value.toUpperCase().slice(0, 2) }))}
                        className="text-xs h-7 uppercase"
                        maxLength={2}
                      />
                    </div>
                  </div>
                  {composeEndereco(newAddr) && (
                    <p className="text-[10px] text-muted-foreground/70 italic">📍 {composeEndereco(newAddr)}</p>
                  )}
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Link do Google Maps (opcional — se vazio, é gerado automaticamente das coordenadas)</label>
                    <Input
                      placeholder="https://maps.google.com/..."
                      value={newAddr.maps_link}
                      onChange={(e) => setNewAddr((a) => ({ ...a, maps_link: e.target.value }))}
                      className="text-xs h-7 font-mono"
                    />
                  </div>
                  <div className="flex gap-1.5 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => { setAddingAddr(false); setEditingAddrId(null); setNewAddr({ ...EMPTY_ADDR }); }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs px-2"
                      disabled={!newAddr.label.trim() || !newAddr.logradouro.trim() || !newAddr.cidade.trim()}
                      onClick={() => {
                        const parsed = newAddr.maps_link ? parseLatLng(newAddr.maps_link) : null;
                        const cepClean = newAddr.cep.replace(/\D/g, "") || null;
                        const id = editingAddrId ?? Date.now().toString();
                        const built = (prev: ClienteAddress[]): ClienteAddress => ({
                          id,
                          label: newAddr.label.trim(),
                          endereco: composeEndereco(newAddr),
                          maps_link: newAddr.maps_link.trim() || (parsed ? `https://www.google.com/maps?q=${parsed.lat},${parsed.lng}` : ""),
                          lat: parsed?.lat ?? null,
                          lng: parsed?.lng ?? null,
                          cep: cepClean,
                          logradouro: newAddr.logradouro.trim(),
                          numero: newAddr.numero.trim(),
                          complemento: newAddr.complemento.trim(),
                          bairro: newAddr.bairro.trim(),
                          cidade: newAddr.cidade.trim(),
                          uf: newAddr.uf.trim(),
                          principal: editingAddrId
                            ? prev.find((a) => a.id === editingAddrId)?.principal ?? false
                            : prev.length === 0,
                        });
                        setFormEnderecos((prev) =>
                          editingAddrId
                            ? prev.map((a) => (a.id === editingAddrId ? built(prev) : a))
                            : [...prev, built(prev)],
                        );
                        setEditingAddrId(null);
                        if (cepClean && !parsed) {
                          cepGeocoder.enqueue(cepClean, (_cep, coords) => {
                            if (coords) {
                              setFormEnderecos((prev) => prev.map((a) =>
                                a.id === id
                                  ? {
                                      ...a,
                                      lat: coords.lat,
                                      lng: coords.lng,
                                      maps_link: a.maps_link || `https://www.google.com/maps?q=${coords.lat},${coords.lng}`,
                                    }
                                  : a,
                              ));
                            }
                          });
                        }
                        setAddingAddr(false);
    setEditingAddrId(null);
                        setNewAddr({ ...EMPTY_ADDR });
                      }}
                    >
                      {editingAddrId ? "Salvar alterações" : "Salvar local"}
                    </Button>
                  </div>
                </div>
              )}
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
            <DialogTitle>Excluir cliente?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{deleteTarget?.nome}</strong> será removido permanentemente do caderno.
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
