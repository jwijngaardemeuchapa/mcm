import { useEffect, useRef } from "react";
import { getDb, uuid } from "./db";
import { readSettings } from "./settings";
import { sendUmblerFup } from "./umbler";
import { toast } from "sonner";

type PendingChapa = {
  id: string;
  nome_chapa: string;
  telefone_chapa: string | null;
  data_contato: string;
  id_tarefa: number;
  data_tarefa: string;
  empresa: string;
};

export function useAutoCancelFup(onFired: () => void) {
  const warnedRef = useRef<Set<string>>(new Set());
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    async function check() {
      const s = readSettings();
      if (!s.autoCancelFupEnabled) return;

      const db = await getDb();
      const rows = await db.select<PendingChapa[]>(
        `SELECT c.id, c.nome_chapa, c.telefone_chapa, c.data_contato,
                t.id_tarefa, t.data_tarefa, t.empresa
         FROM chapas c
         JOIN tarefas t ON c.id_tarefa = t.id_tarefa
         WHERE c.canal_contato = 'umbler_talk'
           AND c.status_contato NOT IN ('confirmado', 'removido', 'cancelado')
           AND t.ativo = 1
           AND t.status_tarefa NOT LIKE 'Cancel%'
           AND t.status_tarefa NOT LIKE 'Finaliz%'
           AND datetime(t.data_tarefa) > datetime('now')
           AND c.data_contato IS NOT NULL`,
      );

      if (rows.length === 0) return;

      const now = Date.now();
      const threshold = s.autoCancelFupMinutes * 60 * 1000;
      const warnAt = threshold - 5 * 60 * 1000;

      const toWarn: PendingChapa[] = [];
      const toFire: PendingChapa[] = [];

      for (const chapa of rows) {
        const elapsed = now - new Date(chapa.data_contato).getTime();
        if (firedRef.current.has(chapa.id)) continue;

        if (elapsed >= threshold) {
          toFire.push(chapa);
        } else if (elapsed >= warnAt && !warnedRef.current.has(chapa.id)) {
          toWarn.push(chapa);
        }
      }

      if (toWarn.length > 0) {
        toWarn.forEach((c) => warnedRef.current.add(c.id));
        toast.warning(
          `Disparo automático de cancelamento em 5 minutos para ${toWarn.length} chapa(s) sem resposta`,
          { duration: 10_000 },
        );
      }

      if (toFire.length > 0) {
        const settings = s.umblerSettings;
        const nowISO = new Date().toISOString();

        for (const chapa of toFire) {
          firedRef.current.add(chapa.id);
          try {
            if (chapa.telefone_chapa) {
              await sendUmblerFup({
                chapaNome: chapa.nome_chapa,
                chapaTelefone: chapa.telefone_chapa,
                dataTarefa: chapa.data_tarefa,
                empresa: chapa.empresa,
                settings,
                overrideParams: [],
                templateIdOverride: settings.cancelTemplateId,
              });
            }
            await db.execute(
              "UPDATE chapas SET canal_contato = 'umbler_cancelamento', data_contato = ? WHERE id = ?",
              [nowISO, chapa.id],
            );
            await db.execute(
              `INSERT OR IGNORE INTO fup_log (id, id_tarefa, canal, data_disparo, observacao, chapa_id)
               VALUES (?, ?, 'umbler_cancelamento_auto', ?, 'Auto-cancelamento por falta de resposta', ?)`,
              [uuid(), chapa.id_tarefa, nowISO, chapa.id],
            );
          } catch {
            // falha silenciosa por chapa — continua processando os demais
            firedRef.current.delete(chapa.id);
          }
        }

        toast.info(`Template de cancelamento enviado para ${toFire.length} chapa(s) sem resposta`);
        onFired();
      }
    }

    check();
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, [onFired]);
}
