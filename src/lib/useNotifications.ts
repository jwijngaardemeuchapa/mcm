import { useEffect, useRef } from "react";
import { getDb, uuid } from "./db";
import { toSP, todayDateISO_SP, hoursUntil, fmtTime, nowSP, parseTaskDate } from "./datetime";
import { companyMatches } from "./company";

type Tarefa = {
  id_tarefa: number;
  data_tarefa: string;
  cidade_uf: string | null;
  empresa: string;
  status_tarefa: string;
  is_overnight?: number | null;
  validacao_status?: string | null;
};

async function alreadyFired(tipo: string, id_tarefa: number | null, dateISO: string): Promise<boolean> {
  const db = await getDb();
  const rows = id_tarefa !== null
    ? await db.select<{ id: string }[]>(
        "SELECT id FROM notificacoes_enviadas WHERE tipo = ? AND referencia_data = ? AND id_tarefa = ? LIMIT 1",
        [tipo, dateISO, id_tarefa],
      )
    : await db.select<{ id: string }[]>(
        "SELECT id FROM notificacoes_enviadas WHERE tipo = ? AND referencia_data = ? AND id_tarefa IS NULL LIMIT 1",
        [tipo, dateISO],
      );
  return rows.length > 0;
}

async function markFired(tipo: string, id_tarefa: number | null, dateISO: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO notificacoes_enviadas (id, tipo, id_tarefa, referencia_data) VALUES (?, ?, ?, ?)",
    [uuid(), tipo, id_tarefa, dateISO],
  );
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
        const db = await getDb();
        const spNow = nowSP();
        const hour = spNow.getHours();
        const minute = spNow.getMinutes();
        const dateISO = todayDateISO_SP();

        if (hour >= 6 && hour <= 15 && minute < 5) {
          const tipo = `refresh_${hour}h`;
          if (!(await alreadyFired(tipo, null, dateISO))) {
            browserNotify("🔄 Atualizar planilha", "Importe a nova versão da planilha de tarefas");
            await markFired(tipo, null, dateISO);
          }
        }

        const quietHours = hour >= 22 || hour < 6;

        const [tarefas, carteira] = await Promise.all([
          db.select<Tarefa[]>(
            "SELECT id_tarefa, data_tarefa, cidade_uf, empresa, status_tarefa, is_overnight, validacao_status FROM tarefas WHERE ativo = 1",
          ),
          db.select<{ nome_fantasia: string }[]>("SELECT nome_fantasia FROM carteira"),
        ]);

        const names = carteira.map((c) => c.nome_fantasia);
        const relevant = tarefas.filter((t) => companyMatches(t.empresa, names));

        for (const t of relevant) {
          const startMs = parseTaskDate(t.data_tarefa, t.cidade_uf).getTime();
          const minutesSinceStart = (Date.now() - startMs) / 60000;
          const hUntil = (startMs - Date.now()) / 3600000;
          const vStatus = t.validacao_status ?? "aguardando";
          const taskTimeStr = fmtTime(t.data_tarefa);
          const refDate = toSP(t.data_tarefa).toISOString().slice(0, 10);
          const isToday =
            toSP(t.data_tarefa).toISOString().slice(0, 10) === spNow.toISOString().slice(0, 10);

          if (isToday && !quietHours) {
            if (
              ["Aguardando Aprovação", "Em Aberto", "Em Análise"].includes(t.status_tarefa) &&
              hUntil <= 3 &&
              hUntil > 0
            ) {
              if (!(await alreadyFired("fup_3h", t.id_tarefa, dateISO))) {
                browserNotify("📋 FUP pendente", `${t.empresa} às ${taskTimeStr}. Dispare os follow-ups.`);
                await markFired("fup_3h", t.id_tarefa, dateISO);
              }
            }
            if (t.status_tarefa === "Aguardando Início" && hUntil <= 1 && hUntil > -0.5) {
              if (!(await alreadyFired("chapa_1h", t.id_tarefa, dateISO))) {
                browserNotify("👷 Verificar chapas", `${t.empresa} às ${taskTimeStr}. Confirme presença.`);
                await markFired("chapa_1h", t.id_tarefa, dateISO);
              }
            }
          }

          if (!quietHours) {
            if (vStatus === "pendente" && minutesSinceStart >= 30) {
              if (!(await alreadyFired("val_30m", t.id_tarefa, refDate))) {
                browserNotify(
                  "📋 Validação pendente",
                  `${t.empresa} às ${taskTimeStr}. O cliente já pode ter confirmado presenças.`,
                );
                await markFired("val_30m", t.id_tarefa, refDate);
              }
            }
            if (
              (vStatus === "pendente" || vStatus === "validacao_recebida") &&
              minutesSinceStart >= 120
            ) {
              if (!(await alreadyFired("val_2h", t.id_tarefa, refDate))) {
                browserNotify("⬆️ Lembrete Meu Chapa", `${t.empresa}. Suba as validações no sistema.`);
                await markFired("val_2h", t.id_tarefa, refDate);
              }
            }
          }
        }
      } finally {
        running.current = false;
      }
    };

    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, []);
}
