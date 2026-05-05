import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Moon } from "lucide-react";
import { fmtDateTime, fmtSP } from "@/lib/datetime";
import { fetchAllRows } from "@/lib/fetchAll";
import ValidacoesTardiasTab from "@/components/ValidacoesTardiasTab";

const canalLabel: Record<string, string> = {
  whatsapp_web: "WhatsApp Web",
  umbler_talk: "Umbler Talk",
  ligacao_3c: "Ligação 3C",
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

type Tarefa = {
  id_tarefa: number;
  empresa: string;
  data_tarefa: string;
  is_overnight?: boolean | null;
  validacao_status?: string | null;
  data_validacao_recebida?: string | null;
  data_upload_meu_chapa?: string | null;
  obs_validacao?: string | null;
};

type Chapa = {
  id: string;
  id_tarefa: number;
  nome_chapa: string | null;
  telefone_chapa: string | null;
  status_contato: string;
  validacao_presenca?: string | null;
  data_remocao?: string | null;
  motivo_remocao?: string | null;
};

type Fup = {
  id: string;
  id_tarefa: number;
  canal: string;
  data_disparo: string;
  observacao: string | null;
};

export default function Historico() {
  const [removals, setRemovals] = useState<Array<Chapa & { tarefa?: Tarefa }>>([]);
  const [fups, setFups] = useState<Array<Fup & { tarefa?: Tarefa }>>([]);
  const [validacoes, setValidacoes] = useState<
    Array<Tarefa & { counts: { presente: number; ausente: number; pendente: number } }>
  >([]);

  // Filters for validations tab
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");

  // Filters for FUPs tab
  const [fupTaskQ, setFupTaskQ] = useState("");
  const [fupDate, setFupDate] = useState("");
  const [fupStartHour, setFupStartHour] = useState("");
  const [fupEndHour, setFupEndHour] = useState("");
  const [fupCanal, setFupCanal] = useState("todos");

  useEffect(() => {
    (async () => {
      const [allChapas, fup, tarefas] = await Promise.all([
        fetchAllRows<Chapa>("chapas", "*"),
        fetchAllRows<Fup>("fup_log", "*"),
        fetchAllRows<Tarefa>("tarefas", "*"),
      ]);
      const sortedTarefas = [...tarefas].sort(
        (a, b) => new Date(b.data_tarefa).getTime() - new Date(a.data_tarefa).getTime(),
      );
      const sortedFup = [...fup].sort(
        (a, b) => new Date(b.data_disparo).getTime() - new Date(a.data_disparo).getTime(),
      );
      const rem = allChapas
        .filter((c) => c.status_contato === "removido")
        .sort(
          (a, b) =>
            new Date(b.data_remocao ?? 0).getTime() - new Date(a.data_remocao ?? 0).getTime(),
        );
      const byId = new Map(sortedTarefas.map((t) => [t.id_tarefa, t]));
      setRemovals(rem.map((r) => ({ ...r, tarefa: byId.get(r.id_tarefa) })));
      setFups(sortedFup.map((f) => ({ ...f, tarefa: byId.get(f.id_tarefa) })));

      const counts = new Map<number, { presente: number; ausente: number; pendente: number }>();
      allChapas.forEach((c) => {
        const cur = counts.get(c.id_tarefa) ?? { presente: 0, ausente: 0, pendente: 0 };
        const v = c.validacao_presenca ?? "pendente";
        if (v === "presente") cur.presente += 1;
        else if (v === "ausente") cur.ausente += 1;
        else cur.pendente += 1;
        counts.set(c.id_tarefa, cur);
      });
      setValidacoes(
        sortedTarefas.map((t) => ({
          ...t,
          counts: counts.get(t.id_tarefa) ?? { presente: 0, ausente: 0, pendente: 0 },
        })),
      );
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

  const filteredFups = useMemo(() => {
    return fups.filter((f) => {
      if (fupCanal !== "todos" && f.canal !== fupCanal) return false;
      if (fupTaskQ) {
        const q = fupTaskQ.replace(/\D/g, "");
        if (q && !String(f.id_tarefa).includes(q)) return false;
      }
      if (fupDate) {
        const d = fmtSP(f.data_disparo, "yyyy-MM-dd");
        if (d !== fupDate) return false;
      }
      if (fupStartHour || fupEndHour) {
        const hh = parseInt(fmtSP(f.data_disparo, "HH"), 10);
        const mm = parseInt(fmtSP(f.data_disparo, "mm"), 10);
        const minutes = hh * 60 + mm;
        if (fupStartHour) {
          const [sh, sm] = fupStartHour.split(":").map((n) => parseInt(n, 10) || 0);
          if (minutes < sh * 60 + (sm || 0)) return false;
        }
        if (fupEndHour) {
          const [eh, em] = fupEndHour.split(":").map((n) => parseInt(n, 10) || 0);
          if (minutes > eh * 60 + (em || 0)) return false;
        }
      }
      return true;
    });
  }, [fups, fupTaskQ, fupDate, fupStartHour, fupEndHour, fupCanal]);

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
                {removals.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground italic">
                      Sem remoções
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="fups">
          <div className="bg-card border border-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Nº da tarefa</label>
              <Input
                value={fupTaskQ}
                onChange={(e) => setFupTaskQ(e.target.value)}
                placeholder="ex: 427473"
                className="w-[140px]"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Dia</label>
              <Input type="date" value={fupDate} onChange={(e) => setFupDate(e.target.value)} className="w-[160px]" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Hora de</label>
              <Input
                type="time"
                value={fupStartHour}
                onChange={(e) => setFupStartHour(e.target.value)}
                className="w-[120px]"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Hora até</label>
              <Input
                type="time"
                value={fupEndHour}
                onChange={(e) => setFupEndHour(e.target.value)}
                className="w-[120px]"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Canal</label>
              <Select value={fupCanal} onValueChange={setFupCanal}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="whatsapp_web">WhatsApp Web</SelectItem>
                  <SelectItem value="umbler_talk">Umbler Talk</SelectItem>
                  <SelectItem value="ligacao_3c">Ligação 3C</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground ml-auto">
              {filteredFups.length} de {fups.length} FUP(s)
            </div>
          </div>

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
                {filteredFups.map((f) => (
                  <tr key={f.id} className="border-t border-border">
                    <td className="px-4 py-2 font-mono">#{f.id_tarefa}</td>
                    <td className="px-4 py-2">{f.tarefa?.empresa ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="font-semibold">
                        {canalLabel[f.canal] ?? f.canal}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs">{fmtDateTime(f.data_disparo)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{f.observacao ?? "—"}</td>
                  </tr>
                ))}
                {filteredFups.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground italic">
                      Sem FUPs nesse filtro
                    </td>
                  </tr>
                )}
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
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
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
                    <tr key={t.id_tarefa} className="border-t border-border">
                      <td className="px-4 py-2 font-mono">#{t.id_tarefa}</td>
                      <td className="px-4 py-2">{t.empresa}</td>
                      <td className="px-4 py-2 text-xs">{fmtDateTime(t.data_tarefa)}</td>
                      <td className="px-4 py-2">
                        {t.is_overnight ? (
                          <Badge variant="secondary" className="gap-1">
                            <Moon className="h-3 w-3" /> Overnight
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <span className="text-success font-medium">{t.counts.presente}</span>
                        {" / "}
                        <span className="text-destructive font-medium">{t.counts.ausente}</span>
                        {" / "}
                        <span className="text-muted-foreground font-medium">{t.counts.pendente}</span>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={statusVariant[status] ?? "outline"}>{statusLabel[status] ?? status}</Badge>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {t.data_validacao_recebida ? fmtDateTime(t.data_validacao_recebida) : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {t.data_upload_meu_chapa ? fmtDateTime(t.data_upload_meu_chapa) : "—"}
                      </td>
                      <td
                        className="px-4 py-2 text-muted-foreground max-w-[240px] truncate"
                        title={t.obs_validacao ?? ""}
                      >
                        {t.obs_validacao ?? "—"}
                      </td>
                    </tr>
                  );
                })}
                {filteredValidacoes.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground italic">
                      Nenhuma tarefa encontrada
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
