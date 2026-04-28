import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Moon } from "lucide-react";
import { fmtDateTime } from "@/lib/datetime";

const canalLabel: Record<string, string> = {
  whatsapp_web: "WhatsApp Web", umbler_talk: "Umbler Talk", ligacao_3c: "Ligação 3C",
};

const statusLabel: Record<string, string> = {
  aguardando: "Aguardando",
  pendente: "Pendente",
  validacao_recebida: "Validação recebida",
  subido_meu_chapa: "Subido no Meu Chapa",
};

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  aguardando: "outline",
  pendente: "secondary",
  validacao_recebida: "default",
  subido_meu_chapa: "default",
};

export default function Historico() {
  const [removals, setRemovals] = useState<any[]>([]);
  const [fups, setFups] = useState<any[]>([]);
  const [validacoes, setValidacoes] = useState<any[]>([]);

  // Filters for validations tab
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");

  useEffect(() => {
    (async () => {
      const [{ data: rem }, { data: fup }, { data: tarefas }, { data: chapas }] = await Promise.all([
        supabase.from("chapas").select("*").eq("status_contato", "removido").order("data_remocao", { ascending: false }),
        supabase.from("fup_log").select("*").order("data_disparo", { ascending: false }),
        supabase.from("tarefas").select("*").order("data_tarefa", { ascending: false }),
        supabase.from("chapas").select("id_tarefa, validacao_presenca"),
      ]);
      const byId = new Map((tarefas ?? []).map((t) => [t.id_tarefa, t]));
      setRemovals((rem ?? []).map((r) => ({ ...r, tarefa: byId.get(r.id_tarefa) })));
      setFups((fup ?? []).map((f) => ({ ...f, tarefa: byId.get(f.id_tarefa) })));

      // Aggregate chapas per task
      const counts = new Map<number, { presente: number; ausente: number; pendente: number }>();
      (chapas ?? []).forEach((c: any) => {
        const cur = counts.get(c.id_tarefa) ?? { presente: 0, ausente: 0, pendente: 0 };
        const v = c.validacao_presenca ?? "pendente";
        if (v === "presente") cur.presente += 1;
        else if (v === "ausente") cur.ausente += 1;
        else cur.pendente += 1;
        counts.set(c.id_tarefa, cur);
      });
      setValidacoes((tarefas ?? []).map((t: any) => ({ ...t, counts: counts.get(t.id_tarefa) ?? { presente: 0, ausente: 0, pendente: 0 } })));
    })();
  }, []);

  const filteredValidacoes = useMemo(() => {
    return validacoes.filter((t) => {
      if (statusFilter !== "todos" && (t.validacao_status ?? "aguardando") !== statusFilter) return false;
      if (startDate) {
        if (new Date(t.data_tarefa) < new Date(startDate + "T00:00:00")) return false;
      }
      if (endDate) {
        if (new Date(t.data_tarefa) > new Date(endDate + "T23:59:59")) return false;
      }
      return true;
    });
  }, [validacoes, startDate, endDate, statusFilter]);

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto">
      <h2 className="font-display font-bold text-2xl mb-4">Histórico & Auditoria</h2>
      <Tabs defaultValue="remocoes">
        <TabsList>
          <TabsTrigger value="remocoes">Remoções ({removals.length})</TabsTrigger>
          <TabsTrigger value="fups">FUPs Disparados ({fups.length})</TabsTrigger>
          <TabsTrigger value="validacoes">Validações ({validacoes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="remocoes">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Tarefa</th>
                  <th className="text-left px-4 py-2">Empresa</th>
                  <th className="text-left px-4 py-2">Chapa</th>
                  <th className="text-left px-4 py-2">Telefone</th>
                  <th className="text-left px-4 py-2">Removido em</th>
                  <th className="text-left px-4 py-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {removals.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-2 font-mono">#{r.id_tarefa}</td>
                    <td className="px-4 py-2">{r.tarefa?.empresa ?? "—"}</td>
                    <td className="px-4 py-2 font-medium">{r.nome_chapa}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.telefone_chapa ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">{r.data_remocao ? fmtDateTime(r.data_remocao) : "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.motivo_remocao ?? "—"}</td>
                  </tr>
                ))}
                {removals.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground italic">Sem remoções</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="fups">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Tarefa</th>
                  <th className="text-left px-4 py-2">Empresa</th>
                  <th className="text-left px-4 py-2">Canal</th>
                  <th className="text-left px-4 py-2">Disparado em</th>
                  <th className="text-left px-4 py-2">Observação</th>
                </tr>
              </thead>
              <tbody>
                {fups.map((f) => (
                  <tr key={f.id} className="border-t border-border">
                    <td className="px-4 py-2 font-mono">#{f.id_tarefa}</td>
                    <td className="px-4 py-2">{f.tarefa?.empresa ?? "—"}</td>
                    <td className="px-4 py-2">{canalLabel[f.canal] ?? f.canal}</td>
                    <td className="px-4 py-2 text-xs">{fmtDateTime(f.data_disparo)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{f.observacao ?? "—"}</td>
                  </tr>
                ))}
                {fups.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground italic">Sem FUPs registrados</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="validacoes">
          <div className="bg-card border border-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">De</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[160px]" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Até</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[160px]" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="aguardando">Aguardando</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="validacao_recebida">Validação recebida</SelectItem>
                  <SelectItem value="subido_meu_chapa">Subido no Meu Chapa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground ml-auto">{filteredValidacoes.length} tarefa(s)</div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Tarefa</th>
                  <th className="text-left px-4 py-2">Empresa</th>
                  <th className="text-left px-4 py-2">Horário</th>
                  <th className="text-left px-4 py-2">Overnight</th>
                  <th className="text-left px-4 py-2">Chapas (P/A/Pend)</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Validação recebida</th>
                  <th className="text-left px-4 py-2">Subido Meu Chapa</th>
                  <th className="text-left px-4 py-2">Observação</th>
                </tr>
              </thead>
              <tbody>
                {filteredValidacoes.map((t) => {
                  const status = t.validacao_status ?? "aguardando";
                  return (
                    <tr key={t.id} className="border-t border-border">
                      <td className="px-4 py-2 font-mono">#{t.id_tarefa}</td>
                      <td className="px-4 py-2">{t.empresa}</td>
                      <td className="px-4 py-2 text-xs">{fmtDateTime(t.data_tarefa)}</td>
                      <td className="px-4 py-2">
                        {t.is_overnight ? (
                          <Badge variant="secondary" className="gap-1"><Moon className="h-3 w-3" /> Overnight</Badge>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <span className="text-emerald-600 font-medium">{t.counts.presente}</span>
                        {" / "}
                        <span className="text-red-600 font-medium">{t.counts.ausente}</span>
                        {" / "}
                        <span className="text-muted-foreground font-medium">{t.counts.pendente}</span>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={statusVariant[status] ?? "outline"}>{statusLabel[status] ?? status}</Badge>
                      </td>
                      <td className="px-4 py-2 text-xs">{t.data_validacao_recebida ? fmtDateTime(t.data_validacao_recebida) : "—"}</td>
                      <td className="px-4 py-2 text-xs">{t.data_upload_meu_chapa ? fmtDateTime(t.data_upload_meu_chapa) : "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground max-w-[240px] truncate" title={t.obs_validacao ?? ""}>{t.obs_validacao ?? "—"}</td>
                    </tr>
                  );
                })}
                {filteredValidacoes.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground italic">Nenhuma tarefa encontrada</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
