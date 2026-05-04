import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { timeAgo, todayDateISO_SP, fmtSP } from "@/lib/datetime";
import { companyMatches } from "@/lib/company";

function parseDateBR(s: string): string | null {
  if (!s) return null;
  const t = s.trim();
  // "dd/MM/yyyy HH:mm[:ss]"
  const m = t.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, d, mo, y, h, mi, se] = m;
    return `${y}-${mo}-${d}T${h}:${mi}:${se ?? "00"}-03:00`;
  }
  // "April 29, 2026, 8:29 AM"
  const m2 = t.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (m2) {
    const [, monStr, d, y, hStr, mi, ampm] = m2;
    const months: Record<string, number> = {
      january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
      july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    };
    const mo = months[monStr.toLowerCase()];
    if (!mo) return null;
    let h = parseInt(hStr, 10);
    if (ampm) {
      const upper = ampm.toUpperCase();
      if (upper === "PM" && h < 12) h += 12;
      if (upper === "AM" && h === 12) h = 0;
    }
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${y}-${pad(mo)}-${pad(parseInt(d, 10))}T${pad(h)}:${mi}:00-03:00`;
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

// Chunked .in() to avoid URL-length limits when importing 900+ rows
async function chunkedSelect<T>(ids: number[], chunkSize: number, fetcher: (chunk: number[]) => Promise<T[]>): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const part = await fetcher(chunk);
    results.push(...part);
  }
  return results;
}

async function chunkedDelete(table: "chapas" | "tarefas", ids: number[], chunkSize = 200) {
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    await supabase.from(table).delete().in("id_tarefa", chunk);
  }
}

async function chunkedInsert(table: "chapas" | "tarefas", rows: Record<string, unknown>[], chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).insert(chunk as never);
    if (error) return error;
  }
  return null;
}

export default function Importar() {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [lastImport, setLastImport] = useState<string | null>(null);
  const [carteiraNames, setCarteiraNames] = useState<string[]>([]);

  async function loadLast() {
    const { data } = await supabase.from("tarefas").select("importado_em").order("importado_em", { ascending: false }).limit(1);
    if (data?.[0]) setLastImport(data[0].importado_em);
  }
  async function loadCarteira() {
    const { data } = await supabase.from("carteira").select("nome_fantasia");
    setCarteiraNames((data ?? []).map((c) => c.nome_fantasia));
  }
  useEffect(() => { loadLast(); loadCarteira(); }, []);

  function onFile(file: File) {
    const isJson = file.name.toLowerCase().endsWith(".json") || file.type.includes("json");
    if (isJson) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          if (!Array.isArray(parsed)) {
            toast.error("JSON precisa ser uma lista de objetos");
            return;
          }
          // Normalize all values to strings so pick() works uniformly
          const rows = parsed.map((r: Record<string, unknown>) => {
            const out: Record<string, string> = {};
            Object.keys(r).forEach((k) => {
              const v = r[k];
              out[k] = v == null ? "" : String(v);
            });
            return out;
          });
          setPreview(rows);
          toast.success(`${rows.length} linhas carregadas (JSON)`);
        } catch (e) {
          toast.error("JSON inválido: " + (e as Error).message);
        }
      };
      reader.readAsText(file);
      return;
    }
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
    let skippedNotInCarteira = 0;
    let totalParsed = 0;

    for (const row of preview) {
      const id_tarefa = parseInt(pick(row, "ID Tarefa", "id_tarefa"), 10);
      if (!id_tarefa) continue;
      const data_tarefa = parseDateBR(pick(row, "Data da Tarefa", "data_tarefa"));
      if (!data_tarefa) continue;
      totalParsed++;
      const empresa = pick(row, "Empresa", "empresa");
      // Pre-filter by carteira (lighter pipeline downstream)
      if (carteiraNames.length > 0 && !companyMatches(empresa, carteiraNames)) {
        skippedNotInCarteira++;
        continue;
      }

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
          empresa,
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
        // Dedupe chapa lines for the same task (FUP exports repeat rows per FUP entry)
        const cpf = pick(row, "CPF", "cpf") || null;
        const tel = pick(row, "Telefone Chapa", "telefone_chapa") || null;
        chapas.push({
          id_tarefa,
          nome_chapa: nome,
          telefone_chapa: tel,
          cpf,
        });
      }
    }

    // Dedupe chapas by (id_tarefa, cpf || nome) — JSON FUP exports repeat rows
    const seen = new Set<string>();
    const dedupedChapas: Record<string, unknown>[] = [];
    for (const c of chapas) {
      const cpf = (c.cpf as string | null) ?? "";
      const nome = (c.nome_chapa as string | null) ?? "";
      const key = `${c.id_tarefa}|${cpf || nome.toLowerCase().trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedupedChapas.push(c);
    }

    const ids = Array.from(tarefasMap.keys());
    if (ids.length === 0) {
      toast.error(
        skippedNotInCarteira > 0
          ? `Nenhuma das ${totalParsed} tarefas pertence à sua carteira`
          : "Nenhuma tarefa válida encontrada",
      );
      return;
    }

    // Date sanity check — warn if any task is not for today
    const todayISO = todayDateISO_SP();
    const dateBuckets = new Map<string, number>();
    tarefasMap.forEach((t) => {
      const d = fmtSP(t.data_tarefa as string, "yyyy-MM-dd");
      dateBuckets.set(d, (dateBuckets.get(d) ?? 0) + 1);
    });
    const otherDates = Array.from(dateBuckets.entries()).filter(([d]) => d !== todayISO);
    if (otherDates.length > 0) {
      const summary = Array.from(dateBuckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([d, n]) => `• ${fmtSP(`${d}T12:00:00-03:00`, "dd/MM/yyyy")}: ${n} tarefa(s)${d === todayISO ? " (hoje)" : ""}`)
        .join("\n");
      const ok = window.confirm(
        `Atenção: o arquivo contém tarefas de datas diferentes de hoje.\n\n${summary}\n\nDeseja importar mesmo assim?`,
      );
      if (!ok) return;
    }


    const existingTarefas = await chunkedSelect(ids, 200, async (chunk) => {
      const { data } = await supabase
        .from("tarefas")
        .select(
          "id_tarefa, observacoes, observacoes_updated_at, validacao_status, data_validacao_recebida, data_upload_meu_chapa, obs_validacao",
        )
        .in("id_tarefa", chunk);
      return data ?? [];
    });
    const tarefaPrev = new Map<number, Record<string, unknown>>();
    existingTarefas.forEach((e: Record<string, unknown>) => {
      tarefaPrev.set(e.id_tarefa as number, e);
    });
    tarefasMap.forEach((t, id) => {
      const prev = tarefaPrev.get(id);
      t.observacoes = prev?.observacoes ?? null;
      t.observacoes_updated_at = prev?.observacoes_updated_at ?? null;

      // Auto-validation logic for tasks already in progress / finished:
      const status = String(t.status_tarefa ?? "");
      const inProgressOrDone = /em\s*andamento|finalizado/i.test(status);
      // If task is in progress / finished AND there's no prior progress, mark as fully done
      const prevValStatus = prev?.validacao_status as string | undefined;
      if (inProgressOrDone && (!prev || !prevValStatus || prevValStatus === "aguardando")) {
        t.validacao_status = "subido_meu_chapa";
        t.data_validacao_recebida = prev?.data_validacao_recebida ?? new Date(t.data_tarefa as string).toISOString();
        t.data_upload_meu_chapa = prev?.data_upload_meu_chapa ?? new Date().toISOString();
        t.obs_validacao = prev?.obs_validacao ?? "Importada já validada";
      } else {
        t.validacao_status = prevValStatus ?? "aguardando";
        t.data_validacao_recebida = prev?.data_validacao_recebida ?? null;
        t.data_upload_meu_chapa = prev?.data_upload_meu_chapa ?? null;
        t.obs_validacao = prev?.obs_validacao ?? null;
      }
    });

    // 2) Preserve chapa progress (chunked)
    const existingChapas = await chunkedSelect(ids, 200, async (chunk) => {
      const { data } = await supabase
        .from("chapas")
        .select(
          "id, id_tarefa, nome_chapa, cpf, telefone_chapa, status_contato, validacao_presenca, data_validacao, data_contato, canal_contato, data_remocao, motivo_remocao",
        )
        .in("id_tarefa", chunk);
      return data ?? [];
    });

    const norm = (s: string | null | undefined) =>
      (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
    const chapaKey = (id_tarefa: number, cpf: string | null | undefined, nome: string | null | undefined) => {
      const c = (cpf ?? "").replace(/\D/g, "");
      return c ? `${id_tarefa}|cpf:${c}` : `${id_tarefa}|nome:${norm(nome)}`;
    };
    const chapaPrev = new Map<string, Record<string, unknown>>();
    existingChapas.forEach((c: Record<string, unknown>) => {
      chapaPrev.set(
        chapaKey(c.id_tarefa as number, c.cpf as string | null, c.nome_chapa as string | null),
        c,
      );
    });

    const chapasToInsert = dedupedChapas.map((c) => {
      const prev = chapaPrev.get(
        chapaKey(c.id_tarefa as number, c.cpf as string | null, c.nome_chapa as string | null),
      );
      const taskStatus = String((tarefasMap.get(c.id_tarefa as number)?.status_tarefa) ?? "");
      const taskInProgressOrDone = /em\s*andamento|finalizado/i.test(taskStatus);

      if (prev) {
        return {
          ...c,
          status_contato: prev.status_contato ?? (taskInProgressOrDone ? "confirmado" : "pendente"),
          validacao_presenca:
            prev.validacao_presenca ?? (taskInProgressOrDone ? "presente" : "pendente"),
          data_validacao: prev.data_validacao ?? (taskInProgressOrDone ? new Date().toISOString() : null),
          data_contato: prev.data_contato ?? null,
          canal_contato: prev.canal_contato ?? null,
          data_remocao: prev.data_remocao ?? null,
          motivo_remocao: prev.motivo_remocao ?? null,
          telefone_chapa: c.telefone_chapa ?? prev.telefone_chapa ?? null,
        };
      }
      // New chapa — if task is in progress/finished, auto-mark as confirmed/present
      return {
        ...c,
        status_contato: taskInProgressOrDone ? "confirmado" : "pendente",
        validacao_presenca: taskInProgressOrDone ? "presente" : "pendente",
        data_validacao: taskInProgressOrDone ? new Date().toISOString() : null,
      };
    });

    // Replace tasks+chapas atomically (chunked to avoid URL/payload limits)
    await chunkedDelete("chapas", ids);
    await chunkedDelete("tarefas", ids);
    const tErr = await chunkedInsert("tarefas", Array.from(tarefasMap.values()));
    const cErr = chapasToInsert.length ? await chunkedInsert("chapas", chapasToInsert) : null;
    if (tErr || cErr) {
      toast.error((tErr ?? cErr)!.message);
      return;
    }
    // Count spot tasks (heuristic: status contains "spot")
    const spotCount = Array.from(tarefasMap.values()).filter((t) =>
      /spot/i.test(String((t as Record<string, unknown>).status_tarefa ?? "")),
    ).length;
    toast.success(
      `✓ ${tarefasMap.size} tarefas · ${chapasToInsert.length} chapas${
        spotCount > 0 ? ` · ${spotCount} spot detectada${spotCount > 1 ? "s" : ""}` : ""
      }`,
    );
    setPreview([]);
    loadLast();
    navigate("/dashboard");
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-2xl">Importar Planilha de Tarefas</h2>
          <p className="text-sm text-muted-foreground">Faça upload do CSV ou JSON diário de tarefas</p>
        </div>
        <div className="text-sm">
          Última importação:{" "}
          <b className="text-primary">{lastImport ? timeAgo(lastImport) : "—"}</b>
        </div>
      </div>

      <label className="block border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary hover:bg-primary-soft transition-colors bg-card">
        <input
          type="file"
          accept=".csv,.json,application/json,text/csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <Upload className="h-10 w-10 mx-auto text-primary mb-2" />
        <div className="font-semibold">Clique ou arraste um CSV ou JSON</div>
        <div className="text-xs text-muted-foreground mt-1">
          Colunas: ID Tarefa, Data da Tarefa, Cidade/UF, Empresa, CNPJ, Status da Tarefa, Nome do Chapa, Telefone Chapa, Quantidade de Chapas
        </div>
      </label>

      <div className="space-y-2">
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-success/10 border border-success/30 text-success text-sm">
          <span>✓</span>
          <span>Progresso preservado — chapas confirmados, validados, contatados ou removidos mantêm seu estado entre importações.</span>
        </div>
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-info/10 border border-info/30 text-info text-sm">
          <span>ℹ</span>
          <span>Tarefas "Em Andamento" ou "Finalizado" são importadas já validadas e subidas no Meu Chapa.</span>
        </div>
        {carteiraNames.length > 0 && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20 text-foreground text-sm">
            <span>🎯</span>
            <span>Filtro por carteira ativo — {carteiraNames.length} empresas. Linhas fora são descartadas no import.</span>
          </div>
        )}
      </div>

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
