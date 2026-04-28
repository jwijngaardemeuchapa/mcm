import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { fmtDateTime } from "@/lib/datetime";

const canalLabel: Record<string, string> = {
  whatsapp_web: "WhatsApp Web", umbler_talk: "Umbler Talk", ligacao_3c: "Ligação 3C",
};

export default function Historico() {
  const [removals, setRemovals] = useState<any[]>([]);
  const [fups, setFups] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: rem }, { data: fup }, { data: tarefas }] = await Promise.all([
        supabase.from("chapas").select("*").eq("status_contato", "removido").order("data_remocao", { ascending: false }),
        supabase.from("fup_log").select("*").order("data_disparo", { ascending: false }),
        supabase.from("tarefas").select("id_tarefa, empresa, data_tarefa"),
      ]);
      const byId = new Map((tarefas ?? []).map((t) => [t.id_tarefa, t]));
      setRemovals((rem ?? []).map((r) => ({ ...r, tarefa: byId.get(r.id_tarefa) })));
      setFups((fup ?? []).map((f) => ({ ...f, tarefa: byId.get(f.id_tarefa) })));
    })();
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto">
      <h2 className="font-display font-bold text-2xl mb-4">Histórico & Auditoria</h2>
      <Tabs defaultValue="remocoes">
        <TabsList>
          <TabsTrigger value="remocoes">Remoções ({removals.length})</TabsTrigger>
          <TabsTrigger value="fups">FUPs Disparados ({fups.length})</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
