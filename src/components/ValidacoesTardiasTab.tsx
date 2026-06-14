import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { getDb, uuid, errMsg } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Download, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/datetime";

type ChapaAlocado = { nome: string; telefone: string };

type ValidacaoTardia = {
  id: string;
  id_tarefa_retroativa: number;
  data_tarefa_retroativa: string | null;
  id_tarefa_original: number | null;
  data_tarefa_original: string | null;
  data_validacao_cliente: string;
  motivo: string;
  observacao: string | null;
  empresa: string | null;
  registrado_por: string | null;
  chapas_alocados: ChapaAlocado[] | null;
  created_at: string;
};

type RawRow = Omit<ValidacaoTardia, "chapas_alocados"> & { chapas_alocados: string | null };

const MOTIVOS = [
  { value: "erro_processo", label: "Erro de processo" },
  { value: "erro_validacao_cliente", label: "Erro de validação do cliente" },
  { value: "outro", label: "Outro" },
];

const motivoLabel = (v: string) => MOTIVOS.find((m) => m.value === v)?.label ?? v;
const motivoVariant = (v: string): "default" | "secondary" | "destructive" | "outline" => {
  if (v === "erro_processo") return "destructive";
  if (v === "erro_validacao_cliente") return "secondary";
  return "outline";
};

const emptyForm = {
  id_tarefa_retroativa: "",
  data_tarefa_retroativa: "",
  id_tarefa_original: "",
  data_tarefa_original: "",
  data_validacao_cliente: "",
  motivo: "erro_processo",
  observacao: "",
  empresa: "",
  registrado_por: "",
};

const LAST_EXPORT_KEY = "validacoes_tardias_last_export";

export default function ValidacoesTardiasTab() {
  const [rows, setRows] = useState<ValidacaoTardia[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [chapas, setChapas] = useState<ChapaAlocado[]>([]);
  const [saving, setSaving] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [motivoFilter, setMotivoFilter] = useState("todos");
  const [showWeeklyAlert, setShowWeeklyAlert] = useState(false);

  const load = async () => {
    try {
      const db = await getDb();
      const data = await db.select<RawRow[]>(
        "SELECT * FROM validacoes_tardias ORDER BY data_validacao_cliente DESC",
      );
      setRows(
        data.map((r) => ({
          ...r,
          chapas_alocados: r.chapas_alocados ? JSON.parse(r.chapas_alocados) : null,
        })),
      );
    } catch {
      toast.error("Erro ao carregar validações tardias");
    }
  };

  useEffect(() => {
    load();
    const last = localStorage.getItem(LAST_EXPORT_KEY);
    if (!last) {
      setShowWeeklyAlert(true);
    } else {
      const diffDays = (Date.now() - parseInt(last, 10)) / (1000 * 60 * 60 * 24);
      if (diffDays >= 7) setShowWeeklyAlert(true);
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (motivoFilter !== "todos" && r.motivo !== motivoFilter) return false;
      if (startDate && new Date(r.data_validacao_cliente) < new Date(startDate + "T00:00:00")) return false;
      if (endDate && new Date(r.data_validacao_cliente) > new Date(endDate + "T23:59:59")) return false;
      return true;
    });
  }, [rows, motivoFilter, startDate, endDate]);

  const setLastWeek = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };
  const setLastMonth = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };
  const clearFilters = () => { setStartDate(""); setEndDate(""); setMotivoFilter("todos"); };

  const addChapa = () => setChapas([...chapas, { nome: "", telefone: "" }]);
  const removeChapa = (i: number) => setChapas(chapas.filter((_, idx) => idx !== i));
  const updateChapa = (i: number, key: keyof ChapaAlocado, val: string) => {
    const next = [...chapas];
    next[i] = { ...next[i], [key]: val };
    setChapas(next);
  };

  const handleSave = async () => {
    if (!form.id_tarefa_retroativa.trim()) { toast.error("Informe o ID da tarefa retroativa"); return; }
    if (!form.data_validacao_cliente) { toast.error("Informe a data/hora da validação do cliente"); return; }
    if (!form.motivo) { toast.error("Selecione o motivo"); return; }
    setSaving(true);
    const cleanChapas = chapas.map((c) => ({ nome: c.nome.trim(), telefone: c.telefone.trim() })).filter((c) => c.nome || c.telefone);
    try {
      const db = await getDb();
      await db.execute(
        "INSERT INTO validacoes_tardias (id, id_tarefa_retroativa, data_tarefa_retroativa, id_tarefa_original, data_tarefa_original, data_validacao_cliente, motivo, observacao, empresa, registrado_por, chapas_alocados) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          uuid(),
          parseInt(form.id_tarefa_retroativa, 10),
          form.data_tarefa_retroativa ? new Date(form.data_tarefa_retroativa).toISOString() : null,
          form.id_tarefa_original ? parseInt(form.id_tarefa_original, 10) : null,
          form.data_tarefa_original ? new Date(form.data_tarefa_original).toISOString() : null,
          new Date(form.data_validacao_cliente).toISOString(),
          form.motivo,
          form.observacao.trim() || null,
          form.empresa.trim() || null,
          form.registrado_por.trim() || null,
          JSON.stringify(cleanChapas),
        ],
      );
      toast.success("Validação tardia registrada");
      setOpen(false);
      setForm(emptyForm);
      setChapas([]);
      load();
    } catch (e) {
      toast.error("Erro ao salvar: " + errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este registro?")) return;
    try {
      const db = await getDb();
      await db.execute("DELETE FROM validacoes_tardias WHERE id = ?", [id]);
      toast.success("Registro excluído");
      load();
    } catch {
      toast.error("Erro ao excluir");
    }
  };

  const exportXLSX = () => {
    if (filtered.length === 0) { toast.error("Nenhum registro para exportar"); return; }
    const main = filtered.map((r) => ({
      "ID tarefa retroativa": r.id_tarefa_retroativa,
      "Data tarefa retroativa": r.data_tarefa_retroativa ? fmtDateTime(r.data_tarefa_retroativa) : "",
      "ID tarefa original": r.id_tarefa_original ?? "",
      "Data tarefa original": r.data_tarefa_original ? fmtDateTime(r.data_tarefa_original) : "",
      "Validação cliente": fmtDateTime(r.data_validacao_cliente),
      Motivo: motivoLabel(r.motivo),
      Empresa: r.empresa ?? "",
      "Registrado por": r.registrado_por ?? "",
      "Qtd chapas alocados": (r.chapas_alocados ?? []).length,
      Observação: r.observacao ?? "",
    }));
    const chapasRows: Array<Record<string, string | number>> = [];
    filtered.forEach((r) => {
      (r.chapas_alocados ?? []).forEach((c) => {
        chapasRows.push({
          "ID tarefa retroativa": r.id_tarefa_retroativa,
          Empresa: r.empresa ?? "",
          "Validação cliente": fmtDateTime(r.data_validacao_cliente),
          Motivo: motivoLabel(r.motivo),
          "Nome do chapa": c.nome,
          Telefone: c.telefone,
        });
      });
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(main), "Validações Tardias");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(chapasRows.length ? chapasRows : [{ Aviso: "Nenhum chapa alocado" }]),
      "Chapas Alocados",
    );
    const stamp = new Date().toISOString().slice(0, 10);
    const range = startDate || endDate ? `_${startDate || "inicio"}_a_${endDate || "hoje"}` : "";
    XLSX.writeFile(wb, `validacoes_tardias${range}_${stamp}.xlsx`);
    localStorage.setItem(LAST_EXPORT_KEY, String(Date.now()));
    setShowWeeklyAlert(false);
    toast.success("Exportado com sucesso");
  };

  return (
    <div>
      {showWeeklyAlert && (
        <div className="bg-accent/40 border border-accent rounded-xl p-3 mb-4 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-accent-foreground shrink-0" />
          <div className="text-sm flex-1">
            <strong>Recomendação semanal:</strong> exporte os dados das validações tardias para backup e análise.
          </div>
          <Button size="sm" variant="outline" onClick={exportXLSX}>Exportar agora</Button>
          <Button size="icon" variant="ghost" onClick={() => setShowWeeklyAlert(false)} aria-label="Dispensar">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs text-muted-foreground">De (validação cliente)</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[160px]" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Até</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[160px]" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Motivo</Label>
          <Select value={motivoFilter} onValueChange={setMotivoFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {MOTIVOS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={setLastWeek}>Últimos 7 dias</Button>
        <Button size="sm" variant="outline" onClick={setLastMonth}>Últimos 30 dias</Button>
        <Button size="sm" variant="ghost" onClick={clearFilters}>Limpar</Button>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={exportXLSX} className="gap-2">
            <Download className="h-4 w-4" /> Exportar XLSX
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Nova validação tardia</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Registrar validação tardia</DialogTitle>
                <DialogDescription>Registre o retroativo solucionado.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>ID tarefa retroativa *</Label><Input type="number" value={form.id_tarefa_retroativa} onChange={(e) => setForm({ ...form, id_tarefa_retroativa: e.target.value })} placeholder="ex: 427473" /></div>
                <div><Label>Data tarefa retroativa</Label><Input type="datetime-local" value={form.data_tarefa_retroativa} onChange={(e) => setForm({ ...form, data_tarefa_retroativa: e.target.value })} /></div>
                <div><Label>ID tarefa original</Label><Input type="number" value={form.id_tarefa_original} onChange={(e) => setForm({ ...form, id_tarefa_original: e.target.value })} placeholder="ex: 427001" /></div>
                <div><Label>Data tarefa original</Label><Input type="datetime-local" value={form.data_tarefa_original} onChange={(e) => setForm({ ...form, data_tarefa_original: e.target.value })} /></div>
                <div><Label>Validação do cliente (data e hora) *</Label><Input type="datetime-local" value={form.data_validacao_cliente} onChange={(e) => setForm({ ...form, data_validacao_cliente: e.target.value })} /></div>
                <div>
                  <Label>Motivo *</Label>
                  <Select value={form.motivo} onValueChange={(v) => setForm({ ...form, motivo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MOTIVOS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Empresa</Label><Input value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} /></div>
                <div><Label>Registrado por</Label><Input value={form.registrado_por} onChange={(e) => setForm({ ...form, registrado_por: e.target.value })} /></div>
                <div className="md:col-span-2"><Label>Observação</Label><Textarea rows={3} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} /></div>
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <Label>Chapas alocados</Label>
                    <Button type="button" size="sm" variant="outline" onClick={addChapa} className="gap-1"><Plus className="h-3 w-3" /> Adicionar chapa</Button>
                  </div>
                  {chapas.length === 0 && <div className="text-xs text-muted-foreground italic px-2 py-3 border border-dashed border-border rounded-md text-center">Nenhum chapa adicionado</div>}
                  <div className="space-y-2">
                    {chapas.map((c, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Input placeholder="Nome do chapa" value={c.nome} onChange={(e) => updateChapa(i, "nome", e.target.value)} className="flex-1" />
                        <Input placeholder="Telefone" value={c.telefone} onChange={(e) => updateChapa(i, "telefone", e.target.value)} className="flex-1" />
                        <Button type="button" size="icon" variant="ghost" aria-label="Remover chapa" onClick={() => removeChapa(i)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
                <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="basis-full text-sm text-muted-foreground">{filtered.length} de {rows.length} registro(s)</div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">Tarefa retroativa</th>
              <th className="text-left px-4 py-2">Data retroativa</th>
              <th className="text-left px-4 py-2">Tarefa original</th>
              <th className="text-left px-4 py-2">Data original</th>
              <th className="text-left px-4 py-2">Validação cliente</th>
              <th className="text-left px-4 py-2">Motivo</th>
              <th className="text-left px-4 py-2">Empresa</th>
              <th className="text-left px-4 py-2">Chapas</th>
              <th className="text-left px-4 py-2">Por</th>
              <th className="text-left px-4 py-2">Observação</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const cs = r.chapas_alocados ?? [];
              return (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono">
                    <a href={`https://app.meu-chapa.net/admin/edit-task/${r.id_tarefa_retroativa}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" title="Abrir tarefa no Meu Chapa">#{r.id_tarefa_retroativa}</a>
                  </td>
                  <td className="px-4 py-2 text-xs">{r.data_tarefa_retroativa ? fmtDateTime(r.data_tarefa_retroativa) : "—"}</td>
                  <td className="px-4 py-2 font-mono">{r.id_tarefa_original ? <a href={`https://app.meu-chapa.net/admin/edit-task/${r.id_tarefa_original}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" title="Abrir tarefa no Meu Chapa">#{r.id_tarefa_original}</a> : "—"}</td>
                  <td className="px-4 py-2 text-xs">{r.data_tarefa_original ? fmtDateTime(r.data_tarefa_original) : "—"}</td>
                  <td className="px-4 py-2 text-xs">{fmtDateTime(r.data_validacao_cliente)}</td>
                  <td className="px-4 py-2"><Badge variant={motivoVariant(r.motivo)}>{motivoLabel(r.motivo)}</Badge></td>
                  <td className="px-4 py-2">{r.empresa ?? "—"}</td>
                  <td className="px-4 py-2">{cs.length === 0 ? <span className="text-muted-foreground">—</span> : <span title={cs.map((c) => `${c.nome} ${c.telefone}`).join("\n")} className="cursor-help"><Badge variant="outline">{cs.length}</Badge></span>}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.registrado_por ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground max-w-[240px] truncate" title={r.observacao ?? ""}>{r.observacao ?? "—"}</td>
                  <td className="px-4 py-2"><Button size="icon" variant="ghost" aria-label="Excluir registro" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4" /></Button></td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground italic">Nenhuma validação tardia encontrada</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
