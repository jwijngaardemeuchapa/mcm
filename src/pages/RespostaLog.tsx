import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MessagesSquare, Download, RefreshCw, Filter } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { fmtSP, todayDateISO_SP } from "@/lib/datetime";
import { errMsg } from "@/lib/db";
import { toast } from "sonner";

type RespostaLogRow = {
  id: string;
  tipo: string;
  chapa_nome: string;
  chapa_telefone: string | null;
  resposta: string;
  id_tarefa: number | null;
  empresa: string | null;
  data_tarefa: string | null;
  disparo_id: string | null;
  fonte: string;
  message_body: string | null;
  received_at: string;
};

const RESPOSTA_LABEL: Record<string, string> = {
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  interesse_sim: "Interesse ✓",
  interesse_nao: "Sem interesse",
  aceita_app: "Aceita app",
  nao_aceita_app: "Não aceita app",
  precisa_ajuda: "Precisa de ajuda",
};

const RESPOSTA_COLOR: Record<string, string> = {
  confirmado: "bg-success/15 text-success border-success/30",
  interesse_sim: "bg-success/15 text-success border-success/30",
  aceita_app: "bg-success/15 text-success border-success/30",
  cancelado: "bg-destructive/15 text-destructive border-destructive/30",
  interesse_nao: "bg-destructive/15 text-destructive border-destructive/30",
  nao_aceita_app: "bg-destructive/15 text-destructive border-destructive/30",
  precisa_ajuda: "bg-warning/15 text-warning border-warning/30",
};

const FONTE_LABEL: Record<string, string> = {
  webhook: "Webhook",
  firestore: "Firebase",
  manual: "Manual",
  notificacao_windows: "Notificação Win",
};

const isTauri = "__TAURI_INTERNALS__" in window;

export default function RespostaLog() {
  const [rows, setRows] = useState<RespostaLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterTipo, setFilterTipo] = useState("todos");
  const [filterResposta, setFilterResposta] = useState("todos");
  const [filterDataInicio, setFilterDataInicio] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [filterDataFim, setFilterDataFim] = useState(todayDateISO_SP);

  const load = useCallback(async () => {
    if (!isTauri) return;
    setLoading(true);
    try {
      const tipoArg = filterTipo === "todos" ? null : filterTipo;
      const result = await invoke<RespostaLogRow[]>("get_resposta_log", {
        tipo: tipoArg,
        dataInicio: filterDataInicio ? `${filterDataInicio}T00:00:00Z` : null,
        dataFim: filterDataFim ? `${filterDataFim}T23:59:59Z` : null,
        limit: 500,
        offset: 0,
      });
      const filtered = filterResposta === "todos"
        ? result
        : filterResposta === "positivo"
        ? result.filter((r) => ["confirmado", "interesse_sim", "aceita_app"].includes(r.resposta))
        : result.filter((r) => ["cancelado", "interesse_nao", "nao_aceita_app", "precisa_ajuda"].includes(r.resposta));
      setRows(filtered);
    } catch (e) {
      toast.error(`Erro ao carregar respostas: ${errMsg(e)}`);
    } finally {
      setLoading(false);
    }
  }, [filterTipo, filterResposta, filterDataInicio, filterDataFim]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => { load(); };
    window.addEventListener("fup:refresh", onRefresh);
    return () => { window.removeEventListener("fup:refresh", onRefresh); };
  }, [load]);

  function exportXlsx() {
    const data = rows.map((r) => ({
      "Data/Hora": fmtSP(r.received_at, "dd/MM/yyyy HH:mm:ss"),
      "Tipo": r.tipo.toUpperCase(),
      "Chapa": r.chapa_nome,
      "Telefone": r.chapa_telefone ?? "",
      "Resposta": RESPOSTA_LABEL[r.resposta] ?? r.resposta,
      "Empresa": r.empresa ?? "",
      "Tarefa": r.id_tarefa ? `#${r.id_tarefa}` : "",
      "Data Tarefa": r.data_tarefa ? fmtSP(r.data_tarefa, "dd/MM/yyyy") : "",
      "Mensagem": r.message_body ?? "",
      "Fonte": FONTE_LABEL[r.fonte] ?? r.fonte,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Respostas");
    XLSX.writeFile(wb, `respostas_${todayDateISO_SP()}.xlsx`);
    toast.success(`${rows.length} registros exportados`);
  }

  const positivos = rows.filter((r) => ["confirmado", "interesse_sim", "aceita_app"].includes(r.resposta)).length;
  const negativos = rows.filter((r) => ["cancelado", "interesse_nao", "nao_aceita_app"].includes(r.resposta)).length;

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <MessagesSquare className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="font-display font-semibold text-2xl">Respostas</h1>
          <p className="text-sm text-muted-foreground">Histórico de respostas FUP e BID via webhook e manual</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={exportXlsx} disabled={rows.length === 0}>
            <Download className="h-3.5 w-3.5" />
            Exportar XLSX
          </Button>
        </div>
      </div>

      {/* Summary badges */}
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="bg-muted/50 border border-border rounded-md px-2.5 py-1">
            {rows.length} registros
          </span>
          <span className="bg-success/10 border border-success/30 text-success rounded-md px-2.5 py-1">
            {positivos} positivos
          </span>
          <span className="bg-destructive/10 border border-destructive/30 text-destructive rounded-md px-2.5 py-1">
            {negativos} negativos
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Input
          type="date"
          value={filterDataInicio}
          onChange={(e) => setFilterDataInicio(e.target.value)}
          className="w-36 text-xs h-8"
        />
        <span className="text-muted-foreground text-xs">até</span>
        <Input
          type="date"
          value={filterDataFim}
          onChange={(e) => setFilterDataFim(e.target.value)}
          className="w-36 text-xs h-8"
        />
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="fup">FUP</SelectItem>
            <SelectItem value="bid">BID</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterResposta} onValueChange={setFilterResposta}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas respostas</SelectItem>
            <SelectItem value="positivo">Positivas</SelectItem>
            <SelectItem value="negativo">Negativas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {!isTauri ? (
        <div className="text-center text-sm text-muted-foreground py-16">
          Disponível apenas no aplicativo desktop.
        </div>
      ) : loading ? (
        <div className="text-center text-sm text-muted-foreground py-16">Carregando…</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-16">
          Nenhuma resposta encontrada no período.
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Horário</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Chapa</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Resposta</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Empresa</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Tarefa</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Fonte</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} className={`border-b border-border/50 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                  <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">
                    {fmtSP(row.received_at, "dd/MM HH:mm:ss")}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      row.tipo === "bid"
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                    }`}>
                      {row.tipo.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">{row.chapa_nome}</td>
                  <td className="px-3 py-2">
                    <Badge className={`text-[10px] border ${RESPOSTA_COLOR[row.resposta] ?? "bg-muted text-muted-foreground"}`}>
                      {RESPOSTA_LABEL[row.resposta] ?? row.resposta}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[140px]">{row.empresa ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.id_tarefa ? `#${row.id_tarefa}` : "—"}
                    {row.data_tarefa && (
                      <span className="ml-1 text-[10px]">({fmtSP(row.data_tarefa, "dd/MM")})</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{FONTE_LABEL[row.fonte] ?? row.fonte}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
