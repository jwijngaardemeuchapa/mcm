import { fmtTime, parseTaskDate, somaDiasISO, toSP } from "./datetime";

export { somaDiasISO };

// Só tarefas dos últimos dias podem gerar lembrete: "validação pendente" de uma
// tarefa de semanas atrás não ajuda ninguém, e varrer o histórico inteiro a cada
// minuto (SELECT de todas as tarefas ativas + uma consulta por tarefa) travava a
// interface. 4 dias cobrem fim de semana/feriado com o app fechado.
export const JANELA_NOTIFICACOES_DIAS = 4;

export type TarefaNotif = {
  id_tarefa: number;
  data_tarefa: string;
  cidade_uf: string | null;
  empresa: string;
  status_tarefa: string;
  is_overnight?: number | null;
  validacao_status?: string | null;
};

export type NotificacaoAEnviar = {
  tipo: string;
  idTarefa: number;
  /** referencia_data gravada em notificacoes_enviadas (dedupe) */
  referencia: string;
  titulo: string;
  corpo: string;
};

export const chaveDisparo = (tipo: string, idTarefa: number | null, referencia: string) =>
  `${tipo}|${idTarefa ?? ""}|${referencia}`;

/**
 * Decide quais lembretes de tarefa disparar agora. Puro: quem chama traz as
 * tarefas já na janela, o conjunto do que já foi disparado e o "agora".
 * Mesmas regras de sempre:
 *  - fup_3h:    tarefa de hoje, status de pré-aprovação, começa em ≤ 3h
 *  - chapa_1h:  tarefa de hoje "Aguardando Início", começa em ≤ 1h (até 30min depois)
 *  - val_30m:   validação pendente 30min depois do início
 *  - val_2h:    validação pendente/recebida 2h depois do início (lembrete de subir)
 */
export function planejarNotificacoes(args: {
  tarefas: TarefaNotif[];
  empresaNaCarteira: (empresa: string) => boolean;
  agoraMs: number;
  /** nowSP() — Date "deslocado"; usado só pra comparar com toSP(data_tarefa) do mesmo jeito */
  spNow: Date;
  /** todayDateISO_SP() — referencia_data dos lembretes de hoje (fup_3h/chapa_1h) */
  dateISO: string;
  quietHours: boolean;
  jaDisparada: (chave: string) => boolean;
}): NotificacaoAEnviar[] {
  const { tarefas, empresaNaCarteira, agoraMs, spNow, dateISO, quietHours, jaDisparada } = args;
  const hojeSP = spNow.toISOString().slice(0, 10);
  const saida: NotificacaoAEnviar[] = [];
  // Datas em fuso são o item mais caro por tarefa: só calcula quando alguma
  // regra já passou nos testes baratos (status/horário).
  const dataSP = (t: TarefaNotif) => toSP(t.data_tarefa).toISOString().slice(0, 10);

  for (const t of tarefas) {
    if (!empresaNaCarteira(t.empresa)) continue;
    const startMs = parseTaskDate(t.data_tarefa, t.cidade_uf).getTime();
    const minutesSinceStart = (agoraMs - startMs) / 60000;
    const hUntil = (startMs - agoraMs) / 3600000;
    const vStatus = t.validacao_status ?? "aguardando";

    if (!quietHours) {
      const quer3h =
        ["Aguardando Aprovação", "Em Aberto", "Em Análise"].includes(t.status_tarefa) && hUntil <= 3 && hUntil > 0;
      const quer1h = t.status_tarefa === "Aguardando Início" && hUntil <= 1 && hUntil > -0.5;
      if ((quer3h || quer1h) && dataSP(t) === hojeSP) {
        if (quer3h && !jaDisparada(chaveDisparo("fup_3h", t.id_tarefa, dateISO))) {
          saida.push({
            tipo: "fup_3h",
            idTarefa: t.id_tarefa,
            referencia: dateISO,
            titulo: "📋 FUP pendente",
            corpo: `${t.empresa} às ${fmtTime(t.data_tarefa)}. Dispare os follow-ups.`,
          });
        }
        if (quer1h && !jaDisparada(chaveDisparo("chapa_1h", t.id_tarefa, dateISO))) {
          saida.push({
            tipo: "chapa_1h",
            idTarefa: t.id_tarefa,
            referencia: dateISO,
            titulo: "👷 Verificar chapas",
            corpo: `${t.empresa} às ${fmtTime(t.data_tarefa)}. Confirme presença.`,
          });
        }
      }

      const quer30m = vStatus === "pendente" && minutesSinceStart >= 30;
      const quer2h = (vStatus === "pendente" || vStatus === "validacao_recebida") && minutesSinceStart >= 120;
      if (quer30m || quer2h) {
        const refDate = dataSP(t);
        if (quer30m && !jaDisparada(chaveDisparo("val_30m", t.id_tarefa, refDate))) {
          saida.push({
            tipo: "val_30m",
            idTarefa: t.id_tarefa,
            referencia: refDate,
            titulo: "📋 Validação pendente",
            corpo: `${t.empresa} às ${fmtTime(t.data_tarefa)}. O cliente já pode ter confirmado presenças.`,
          });
        }
        if (quer2h && !jaDisparada(chaveDisparo("val_2h", t.id_tarefa, refDate))) {
          saida.push({
            tipo: "val_2h",
            idTarefa: t.id_tarefa,
            referencia: refDate,
            titulo: "⬆️ Lembrete Meu Chapa",
            corpo: `${t.empresa}. Suba as validações no sistema.`,
          });
        }
      }
    }
  }
  return saida;
}
