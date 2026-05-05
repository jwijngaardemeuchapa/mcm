import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/datetime";

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
  created_at: string;
};

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

export default function ValidacoesTardiasTab() {
  const [rows, setRows] = useState<ValidacaoTardia[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("validacoes_tardias")
      .select("*")
      .order("data_validacao_cliente", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar validações tardias");
      return;
    }
    setRows((data ?? []) as ValidacaoTardia[]);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    if (!form.id_tarefa_retroativa.trim()) {
      toast.error("Informe o ID da tarefa retroativa");
      return;
    }
    if (!form.data_validacao_cliente) {
      toast.error("Informe a data/hora da validação do cliente");
      return;
    }
    if (!form.motivo) {
      toast.error("Selecione o motivo");
      return;
    }
    setSaving(true);
    const payload = {
      id_tarefa_retroativa: parseInt(form.id_tarefa_retroativa, 10),
      data_tarefa_retroativa: form.data_tarefa_retroativa
        ? new Date(form.data_tarefa_retroativa).toISOString()
        : null,
      id_tarefa_original: form.id_tarefa_original ? parseInt(form.id_tarefa_original, 10) : null,
      data_tarefa_original: form.data_tarefa_original
        ? new Date(form.data_tarefa_original).toISOString()
        : null,
      data_validacao_cliente: new Date(form.data_validacao_cliente).toISOString(),
      motivo: form.motivo,
      observacao: form.observacao.trim() || null,
      empresa: form.empresa.trim() || null,
      registrado_por: form.registrado_por.trim() || null,
    };
    const { error } = await supabase.from("validacoes_tardias").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success("Validação tardia registrada");
    setOpen(false);
    setForm(emptyForm);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este registro?")) return;
    const { error } = await supabase.from("validacoes_tardias").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir");
      return;
    }
    toast.success("Registro excluído");
    load();
  };

  return (
    <div>
      <div className="bg-card border border-border rounded-xl p-4 mb-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{rows.length} registro(s)</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Nova validação tardia
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Registrar validação tardia</DialogTitle>
              <DialogDescription>
                Registre o retroativo solucionado com a tarefa retroativa, a tarefa original e a
                data da validação do cliente.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>ID tarefa retroativa *</Label>
                <Input
                  type="number"
                  value={form.id_tarefa_retroativa}
                  onChange={(e) => setForm({ ...form, id_tarefa_retroativa: e.target.value })}
                  placeholder="ex: 427473"
                />
              </div>
              <div>
                <Label>Data tarefa retroativa</Label>
                <Input
                  type="datetime-local"
                  value={form.data_tarefa_retroativa}
                  onChange={(e) => setForm({ ...form, data_tarefa_retroativa: e.target.value })}
                />
              </div>
              <div>
                <Label>ID tarefa original</Label>
                <Input
                  type="number"
                  value={form.id_tarefa_original}
                  onChange={(e) => setForm({ ...form, id_tarefa_original: e.target.value })}
                  placeholder="ex: 427001"
                />
              </div>
              <div>
                <Label>Data tarefa original</Label>
                <Input
                  type="datetime-local"
                  value={form.data_tarefa_original}
                  onChange={(e) => setForm({ ...form, data_tarefa_original: e.target.value })}
                />
              </div>
              <div>
                <Label>Validação do cliente (data e hora) *</Label>
                <Input
                  type="datetime-local"
                  value={form.data_validacao_cliente}
                  onChange={(e) => setForm({ ...form, data_validacao_cliente: e.target.value })}
                />
              </div>
              <div>
                <Label>Motivo *</Label>
                <Select
                  value={form.motivo}
                  onValueChange={(v) => setForm({ ...form, motivo: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTIVOS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Empresa</Label>
                <Input
                  value={form.empresa}
                  onChange={(e) => setForm({ ...form, empresa: e.target.value })}
                />
              </div>
              <div>
                <Label>Registrado por</Label>
                <Input
                  value={form.registrado_por}
                  onChange={(e) => setForm({ ...form, registrado_por: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Observação</Label>
                <Textarea
                  rows={3}
                  value={form.observacao}
                  onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                  placeholder="Detalhes do retroativo, ação tomada, etc."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
              <th className="text-left px-4 py-2">Por</th>
              <th className="text-left px-4 py-2">Observação</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-2 font-mono">#{r.id_tarefa_retroativa}</td>
                <td className="px-4 py-2 text-xs">
                  {r.data_tarefa_retroativa ? fmtDateTime(r.data_tarefa_retroativa) : "—"}
                </td>
                <td className="px-4 py-2 font-mono">
                  {r.id_tarefa_original ? `#${r.id_tarefa_original}` : "—"}
                </td>
                <td className="px-4 py-2 text-xs">
                  {r.data_tarefa_original ? fmtDateTime(r.data_tarefa_original) : "—"}
                </td>
                <td className="px-4 py-2 text-xs">{fmtDateTime(r.data_validacao_cliente)}</td>
                <td className="px-4 py-2">
                  <Badge variant={motivoVariant(r.motivo)}>{motivoLabel(r.motivo)}</Badge>
                </td>
                <td className="px-4 py-2">{r.empresa ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.registrado_por ?? "—"}</td>
                <td
                  className="px-4 py-2 text-muted-foreground max-w-[240px] truncate"
                  title={r.observacao ?? ""}
                >
                  {r.observacao ?? "—"}
                </td>
                <td className="px-4 py-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(r.id)}
                    aria-label="Excluir registro"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground italic">
                  Nenhuma validação tardia registrada
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
