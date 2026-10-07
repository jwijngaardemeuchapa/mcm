import { useEffect, useRef } from "react";
import { getDb, uuid } from "./db";
import { todayDateISO_SP, nowSP } from "./datetime";
import { companyMatches } from "./company";
import {
  chaveDisparo,
  JANELA_NOTIFICACOES_DIAS,
  planejarNotificacoes,
  somaDiasISO,
  type TarefaNotif,
} from "./notificacoesLogica";

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

        // Este ciclo roda a cada 60 s: só lê a janela de dias que pode gerar
        // lembrete (ver JANELA_NOTIFICACOES_DIAS) e o que já foi disparado nela,
        // em UMA consulta — nada de varrer o histórico nem de consultar por tarefa.
        // (referencia_data pode ficar 1 dia antes da data da tarefa, por isso a folga.)
        const desde = somaDiasISO(dateISO, -JANELA_NOTIFICACOES_DIAS);
        const [tarefas, carteira, disparadasRows] = await Promise.all([
          db.select<TarefaNotif[]>(
            "SELECT id_tarefa, data_tarefa, cidade_uf, empresa, status_tarefa, is_overnight, validacao_status FROM tarefas WHERE ativo = 1 AND substr(data_tarefa, 1, 10) >= ? AND substr(data_tarefa, 1, 10) <= ?",
            [somaDiasISO(desde, -1), somaDiasISO(dateISO, 1)],
          ),
          db.select<{ nome_fantasia: string }[]>("SELECT nome_fantasia FROM carteira"),
          db.select<{ tipo: string; id_tarefa: number | null; referencia_data: string }[]>(
            "SELECT tipo, id_tarefa, referencia_data FROM notificacoes_enviadas WHERE referencia_data >= ?",
            [somaDiasISO(desde, -2)],
          ),
        ]);
        const disparadas = new Set(disparadasRows.map((r) => chaveDisparo(r.tipo, r.id_tarefa, r.referencia_data)));

        if (hour >= 6 && hour <= 15 && minute < 5) {
          const tipo = `refresh_${hour}h`;
          if (!disparadas.has(chaveDisparo(tipo, null, dateISO))) {
            browserNotify("🔄 Atualizar planilha", "Importe a nova versão da planilha de tarefas");
            await markFired(tipo, null, dateISO);
            disparadas.add(chaveDisparo(tipo, null, dateISO));
          }
        }

        const names = carteira.map((c) => c.nome_fantasia);
        const aEnviar = planejarNotificacoes({
          tarefas,
          empresaNaCarteira: (empresa) => companyMatches(empresa, names),
          agoraMs: Date.now(),
          spNow,
          dateISO,
          quietHours: hour >= 22 || hour < 6,
          jaDisparada: (chave) => disparadas.has(chave),
        });
        for (const n of aEnviar) {
          browserNotify(n.titulo, n.corpo);
          await markFired(n.tipo, n.idTarefa, n.referencia);
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
