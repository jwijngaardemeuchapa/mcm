import { useEffect, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { timeAgo } from "@/lib/datetime";

function parseDateBR(s: string): string | null {
  if (!s) return null;
  const t = s.trim();
  // "dd/MM/yyyy HH:mm[:ss]"
  const m = t.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, d, mo, y, h, mi, se] = m;
    return `${y}-${mo}-${d}T${h}:${mi}:${se ?? "00"}-03:00`;
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const found = Object.keys(row).find((x) => x.toLowerCase().trim() === k.toLowerCase());
    if (found && row[found]) return row[found];
  }
  return "";
}

export default function Importar() {
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [lastImport, setLastImport] = useState<string | null>(null);

  async function loadLast() {
    const { data } = await supabase.from("tarefas").select("importado_em").order("importado_em", { ascending: false }).limit(1);
    if (data?.[0]) setLastImport(data[0].importado_em);
  }
  useEffect(() => { loadLast(); }, []);

  function onFile(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => {
        setPreview(r.data as Record<string, string>[]);
        toast.success(`${r.data.length} linhas carregadas`);
      },
    });
  }

  async function doImport() {
    if (!preview.length) return;
    const tarefasMap = new Map<number, Record<string, unknown>>();
    const chapas: Record<string, unknown>[] = [];

    for (const row of preview) {
      const id_tarefa = parseInt(pick(row, "ID Tarefa", "id_tarefa"), 10);
      if (!id_tarefa) continue;
      const data_tarefa = parseDateBR(pick(row, "Data da Tarefa", "data_tarefa"));
      if (!data_tarefa) continue;
      if (!tarefasMap.has(id_tarefa)) {
        tarefasMap.set(id_tarefa, {
          id_tarefa,
          data_tarefa,
          cidade_uf: pick(row, "Cidade/UF", "cidade_uf") || null,
          empresa: pick(row, "Empresa", "empresa"),
          cnpj: pick(row, "CNPJ", "cnpj") || null,
          status_tarefa: pick(row, "Status da Tarefa", "status_tarefa") || "Em Aberto",
          quantidade_chapas: parseInt(pick(row, "Quantidade de Chapas", "quantidade_chapas"), 10) || 0,
          ativo: true,
          importado_em: new Date().toISOString(),
        });
      }
      const nome = pick(row, "Nome do Chapa", "nome_chapa");
      if (nome) {
        chapas.push({
          id_tarefa,
          nome_chapa: nome,
          telefone_chapa: pick(row, "Telefone Chapa", "telefone_chapa") || null,
          cpf: pick(row, "CPF", "cpf") || null,
          status_contato: "pendente",
        });
      }
    }

    // replace tasks+chapas for the imported IDs
    const ids = Array.from(tarefasMap.keys());
    await supabase.from("chapas").delete().in("id_tarefa", ids);
    await supabase.from("tarefas").delete().in("id_tarefa", ids);
    const tErr = (await supabase.from("tarefas").insert(Array.from(tarefasMap.values()) as never)).error;
    const cErr = chapas.length ? (await supabase.from("chapas").insert(chapas as never)).error : null;
    if (tErr || cErr) { toast.error((tErr ?? cErr)!.message); return; }
    toast.success(`${tarefasMap.size} tarefas e ${chapas.length} chapas importados`);
    setPreview([]);
    loadLast();
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-2xl">Importar Planilha de Tarefas</h2>
          <p className="text-sm text-muted-foreground">Faça upload do CSV diário de tarefas</p>
        </div>
        <div className="text-sm">
          Última importação:{" "}
          <b className="text-primary">{lastImport ? timeAgo(lastImport) : "—"}</b>
        </div>
      </div>

      <label className="block border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary hover:bg-primary-soft transition-colors bg-card">
        <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <Upload className="h-10 w-10 mx-auto text-primary mb-2" />
        <div className="font-semibold">Clique ou arraste um CSV</div>
        <div className="text-xs text-muted-foreground mt-1">
          Colunas: ID Tarefa, Data da Tarefa, Cidade/UF, Empresa, CNPJ, Status da Tarefa, Nome do Chapa, Telefone Chapa, Quantidade de Chapas
        </div>
      </label>

      {preview.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 flex items-center justify-between border-b border-border">
            <div className="font-semibold">Preview — {preview.length} linhas</div>
            <Button onClick={doImport}>Confirmar importação</Button>
          </div>
          <div className="overflow-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  {Object.keys(preview[0]).slice(0, 8).map((k) => (
                    <th key={k} className="text-left px-2 py-2 font-semibold whitespace-nowrap">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    {Object.keys(preview[0]).slice(0, 8).map((k) => (
                      <td key={k} className="px-2 py-1.5 whitespace-nowrap">{r[k]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
