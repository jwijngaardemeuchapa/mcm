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
        const spHourStr = new Date(data_tarefa).toLocaleString("en-US", {
          timeZone: "America/Sao_Paulo",
          hour: "2-digit",
          hour12: false,
        });
        const spHour = parseInt(spHourStr, 10);
        const is_overnight = Number.isFinite(spHour) && spHour >= 20;
        tarefasMap.set(id_tarefa, {
          id_tarefa,
          data_tarefa,
          cidade_uf: pick(row, "Cidade/UF", "cidade_uf") || null,
          empresa: pick(row, "Empresa", "empresa"),
          cnpj: pick(row, "CNPJ", "cnpj") || null,
          status_tarefa: pick(row, "Status da Tarefa", "status_tarefa") || "Em Aberto",
          quantidade_chapas: parseInt(pick(row, "Quantidade de Chapas", "quantidade_chapas"), 10) || 0,
          ativo: true,
          is_overnight,
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
        });
      }
    }

    const ids = Array.from(tarefasMap.keys());

    // 1) Preserve task progress fields across reimports
    const { data: existingTarefas } = await supabase
      .from("tarefas")
      .select(
        "id_tarefa, observacoes, observacoes_updated_at, validacao_status, data_validacao_recebida, data_upload_meu_chapa, obs_validacao",
      )
      .in("id_tarefa", ids);
    const tarefaPrev = new Map<number, Record<string, unknown>>();
    (existingTarefas ?? []).forEach((e: Record<string, unknown>) => {
      tarefaPrev.set(e.id_tarefa as number, e);
    });
    tarefasMap.forEach((t, id) => {
      const prev = tarefaPrev.get(id);
      t.observacoes = prev?.observacoes ?? null;
      t.observacoes_updated_at = prev?.observacoes_updated_at ?? null;
      t.validacao_status = prev?.validacao_status ?? "aguardando";
      t.data_validacao_recebida = prev?.data_validacao_recebida ?? null;
      t.data_upload_meu_chapa = prev?.data_upload_meu_chapa ?? null;
      t.obs_validacao = prev?.obs_validacao ?? null;
    });

    // 2) Preserve chapa progress (status_contato, validação, contato, remoção) by (id_tarefa, cpf || nome)
    const { data: existingChapas } = await supabase
      .from("chapas")
      .select(
        "id, id_tarefa, nome_chapa, cpf, telefone_chapa, status_contato, validacao_presenca, data_validacao, data_contato, canal_contato, data_remocao, motivo_remocao",
      )
      .in("id_tarefa", ids);

    const norm = (s: string | null | undefined) =>
      (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
    const chapaKey = (id_tarefa: number, cpf: string | null | undefined, nome: string | null | undefined) => {
      const c = (cpf ?? "").replace(/\D/g, "");
      return c ? `${id_tarefa}|cpf:${c}` : `${id_tarefa}|nome:${norm(nome)}`;
    };
    const chapaPrev = new Map<string, Record<string, unknown>>();
    (existingChapas ?? []).forEach((c: Record<string, unknown>) => {
      chapaPrev.set(
        chapaKey(c.id_tarefa as number, c.cpf as string | null, c.nome_chapa as string | null),
        c,
      );
    });

    const chapasToInsert = chapas.map((c) => {
      const prev = chapaPrev.get(
        chapaKey(c.id_tarefa as number, c.cpf as string | null, c.nome_chapa as string | null),
      );
      if (prev) {
        return {
          ...c,
          status_contato: prev.status_contato ?? "pendente",
          validacao_presenca: prev.validacao_presenca ?? "pendente",
          data_validacao: prev.data_validacao ?? null,
          data_contato: prev.data_contato ?? null,
          canal_contato: prev.canal_contato ?? null,
          data_remocao: prev.data_remocao ?? null,
          motivo_remocao: prev.motivo_remocao ?? null,
          telefone_chapa: c.telefone_chapa ?? prev.telefone_chapa ?? null,
        };
      }
      return { ...c, status_contato: "pendente", validacao_presenca: "pendente" };
    });

    // Replace tasks+chapas atomically (preserved progress is already merged into payload above)
    await supabase.from("chapas").delete().in("id_tarefa", ids);
    await supabase.from("tarefas").delete().in("id_tarefa", ids);
    const tErr = (await supabase.from("tarefas").insert(Array.from(tarefasMap.values()) as never)).error;
    const cErr = chapasToInsert.length
      ? (await supabase.from("chapas").insert(chapasToInsert as never)).error
      : null;
    if (tErr || cErr) {
      toast.error((tErr ?? cErr)!.message);
      return;
    }
    toast.success(
      `${tarefasMap.size} tarefas e ${chapasToInsert.length} chapas importados (progresso preservado)`,
    );
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
