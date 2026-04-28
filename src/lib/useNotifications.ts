import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toSP, todayDateISO_SP, hoursUntil, fmtTime, nowSP } from "./datetime";
import { companyMatches } from "./company";

type Tarefa = {
  id: string;
  id_tarefa: number;
  data_tarefa: string;
  empresa: string;
  status_tarefa: string;
  is_overnight?: boolean | null;
  validacao_status?: string | null;
};
type Chapa = { id: string; id_tarefa: number; status_contato: string };

async function alreadyFired(tipo: string, id_tarefa: number | null, dateISO: string) {
  const q = supabase
    .from("notificacoes_enviadas")
    .select("id")
    .eq("tipo", tipo)
    .eq("referencia_data", dateISO)
    .limit(1);
  if (id_tarefa !== null) q.eq("id_tarefa", id_tarefa);
  else q.is("id_tarefa", null);
  const { data } = await q;
  return !!data && data.length > 0;
}

async function markFired(tipo: string, id_tarefa: number | null, dateISO: string) {
  await supabase.from("notificacoes_enviadas").insert({
    tipo,
    id_tarefa,
    referencia_data: dateISO,
  });
}

function browserNotify(title: string, body: string) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "granted") {
    try {
      new Notification(title, { body, icon: "/favicon.ico", tag: title });
    } catch (e) {
      console.warn("Notification error", e);
    }
  }
}

export function useNotifications() {
  const running = useRef(false);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const check = async () => {
      if (running.current) return;
      running.current = true;
      try {
        const spNow = nowSP();
        const hour = spNow.getHours();
        const minute = spNow.getMinutes();
        const dateISO = todayDateISO_SP();

        // 1) Hourly refresh reminder 06:00-15:00, fires on the hour
        if (hour >= 6 && hour <= 15 && minute < 5) {
          const tipo = `refresh_${hour}h`;
          if (!(await alreadyFired(tipo, null, dateISO))) {
            browserNotify("🔄 Atualizar planilha", "Importe a nova versão da planilha de tarefas");
            await markFired(tipo, null, dateISO);
          }
        }

        // Quiet hours (22:00 - 06:00) — suppress; will fire once 06:00 hits
        const quietHours = hour >= 22 || hour < 6;

        // Fetch today's tasks + portfolio
        const [{ data: tarefas }, { data: chapas }, { data: carteira }] = await Promise.all([
          supabase
            .from("tarefas")
            .select("id, id_tarefa, data_tarefa, empresa, status_tarefa, is_overnight, validacao_status")
            .eq("ativo", true),
          supabase.from("chapas").select("id, id_tarefa, status_contato"),
          supabase.from("carteira").select("nome_fantasia"),
        ]);

        if (!tarefas || !carteira) return;
        const names = carteira.map((c) => c.nome_fantasia);
        const relevant = (tarefas as Tarefa[]).filter((t) => companyMatches(t.empresa, names));

        for (const t of relevant) {
          const startMs = new Date(t.data_tarefa).getTime();
          const minutesSinceStart = (Date.now() - startMs) / 60000;
          const hUntil = hoursUntil(t.data_tarefa);
          const vStatus = t.validacao_status ?? "aguardando";
          const taskDateISO = fmtTime(t.data_tarefa); // only for msg
          const refDate = toSP(t.data_tarefa).toISOString().slice(0, 10);

          // Pre-start alerts only for today's tasks
          const isToday = toSP(t.data_tarefa).toISOString().slice(0, 10) === spNow.toISOString().slice(0, 10);

          if (isToday && !quietHours) {
            if (
              ["Aguardando Aprovação", "Em Aberto", "Em Análise"].includes(t.status_tarefa) &&
              hUntil <= 3 && hUntil > 0
            ) {
              if (!(await alreadyFired("fup_3h", t.id_tarefa, dateISO))) {
                browserNotify("📋 FUP pendente", `${t.empresa} às ${taskDateISO}. Dispare os follow-ups.`);
                await markFired("fup_3h", t.id_tarefa, dateISO);
              }
            }
            if (t.status_tarefa === "Aguardando Início" && hUntil <= 1 && hUntil > -0.5) {
              if (!(await alreadyFired("chapa_1h", t.id_tarefa, dateISO))) {
                browserNotify("👷 Verificar chapas", `${t.empresa} às ${taskDateISO}. Confirme presença.`);
                await markFired("chapa_1h", t.id_tarefa, dateISO);
              }
            }
          }

          // Validation alerts (respect quiet hours; queued alerts fire at/after 06:00)
          if (!quietHours) {
            // 30 min after start, still pendente
            if (vStatus === "pendente" && minutesSinceStart >= 30) {
              if (!(await alreadyFired("val_30m", t.id_tarefa, refDate))) {
                browserNotify(
                  "📋 Validação pendente",
                  `${t.empresa} às ${taskDateISO}. O cliente já pode ter confirmado presenças.`
                );
                await markFired("val_30m", t.id_tarefa, refDate);
              }
            }
            // 2h after start, not yet uploaded
            if (
              (vStatus === "pendente" || vStatus === "validacao_recebida") &&
              minutesSinceStart >= 120
            ) {
              if (!(await alreadyFired("val_2h", t.id_tarefa, refDate))) {
                browserNotify(
                  "⬆️ Lembrete Meu Chapa",
                  `${t.empresa}. Suba as validações no sistema.`
                );
                await markFired("val_2h", t.id_tarefa, refDate);
              }
            }
          }
        }

        void chapas;
      } finally {
        running.current = false;
      }
    };

    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, []);
}
