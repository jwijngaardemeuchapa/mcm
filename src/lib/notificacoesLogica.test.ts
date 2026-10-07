import { describe, expect, it } from "vitest";
import { companyMatches } from "./company";
import { fmtTime, nowSP, parseTaskDate, todayDateISO_SP, toSP } from "./datetime";
import {
  chaveDisparo,
  planejarNotificacoes,
  somaDiasISO,
  type NotificacaoAEnviar,
  type TarefaNotif,
} from "./notificacoesLogica";

// ── laço ORIGINAL do useNotifications (antes da janela), com alreadyFired num Set ──
function referencia(args: {
  tarefas: TarefaNotif[];
  names: string[];
  agoraMs: number;
  spNow: Date;
  dateISO: string;
  quietHours: boolean;
  fired: Set<string>;
}): NotificacaoAEnviar[] {
  const { tarefas, names, agoraMs, spNow, dateISO, quietHours, fired } = args;
  const out: NotificacaoAEnviar[] = [];
  const dispara = (tipo: string, id: number, ref: string, titulo: string, corpo: string) => {
    if (fired.has(chaveDisparo(tipo, id, ref))) return;
    out.push({ tipo, idTarefa: id, referencia: ref, titulo, corpo });
  };
  const relevant = tarefas.filter((t) => companyMatches(t.empresa, names));
  for (const t of relevant) {
    const startMs = parseTaskDate(t.data_tarefa, t.cidade_uf).getTime();
    const minutesSinceStart = (agoraMs - startMs) / 60000;
    const hUntil = (startMs - agoraMs) / 3600000;
    const vStatus = t.validacao_status ?? "aguardando";
    const taskTimeStr = fmtTime(t.data_tarefa);
    const refDate = toSP(t.data_tarefa).toISOString().slice(0, 10);
    const isToday = toSP(t.data_tarefa).toISOString().slice(0, 10) === spNow.toISOString().slice(0, 10);
    if (isToday && !quietHours) {
      if (["Aguardando Aprovação", "Em Aberto", "Em Análise"].includes(t.status_tarefa) && hUntil <= 3 && hUntil > 0) {
        dispara("fup_3h", t.id_tarefa, dateISO, "📋 FUP pendente", `${t.empresa} às ${taskTimeStr}. Dispare os follow-ups.`);
      }
      if (t.status_tarefa === "Aguardando Início" && hUntil <= 1 && hUntil > -0.5) {
        dispara("chapa_1h", t.id_tarefa, dateISO, "👷 Verificar chapas", `${t.empresa} às ${taskTimeStr}. Confirme presença.`);
      }
    }
    if (!quietHours) {
      if (vStatus === "pendente" && minutesSinceStart >= 30) {
        dispara("val_30m", t.id_tarefa, refDate, "📋 Validação pendente", `${t.empresa} às ${taskTimeStr}. O cliente já pode ter confirmado presenças.`);
      }
      if ((vStatus === "pendente" || vStatus === "validacao_recebida") && minutesSinceStart >= 120) {
        dispara("val_2h", t.id_tarefa, refDate, "⬆️ Lembrete Meu Chapa", `${t.empresa}. Suba as validações no sistema.`);
      }
    }
  }
  return out;
}

function aleatorio(semente: number) {
  let s = semente >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const HORA = 3_600_000;
// instante real escrito com o offset -03:00 (como o app grava data_tarefa)
const iso = (ms: number) => new Date(ms - 3 * HORA).toISOString().slice(0, 19) + "-03:00";

function tarefasAleatorias(n: number, agoraMs: number, semente: number): TarefaNotif[] {
  const r = aleatorio(semente);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const status = ["Aguardando Aprovação", "Em Aberto", "Em Análise", "Aguardando Início", "Em Andamento", "Finalizado", "Cancelado"];
  const valid = [null, undefined, "aguardando", "pendente", "pendente", "validacao_recebida", "subido_meu_chapa"];
  const empresas = ["Alfa Ltda", "Beta S.A.", "Gama", "Delta ME", "Fora da Carteira"];
  return Array.from({ length: n }, (_, i) => ({
    id_tarefa: i + 1,
    data_tarefa: iso(agoraMs + (r() * 8 - 6) * 24 * HORA),
    cidade_uf: pick(["São Paulo/SP", "Manaus/AM", "Rio Branco/AC", null]),
    empresa: pick(empresas),
    status_tarefa: pick(status),
    is_overnight: r() < 0.2 ? 1 : 0,
    validacao_status: pick(valid),
  }));
}

// Tarefas coladas nos limites de cada regra (3h, 1h, -30min, +30min, +2h), pra uma
// mudança de "<" em "<=" ou de 0,5 em 0,4 não passar batida (as aleatórias quase
// nunca caem nessas faixas estreitas).
function tarefasNasFronteiras(agoraMs: number): TarefaNotif[] {
  const MIN = 60_000;
  const inicios = [180, 60, 0, -30, -120].flatMap((m) => [m - 1, m - 0.02, m, m + 0.02, m + 1]);
  const status = ["Aguardando Aprovação", "Em Aberto", "Em Análise", "Aguardando Início", "Em Andamento"];
  const valid = [null, "pendente", "validacao_recebida"];
  const out: TarefaNotif[] = [];
  let id = 1;
  for (const m of inicios) {
    for (const st of status) {
      for (const v of valid) {
        out.push({
          id_tarefa: id++, data_tarefa: iso(agoraMs + m * MIN), cidade_uf: "São Paulo/SP", empresa: "Alfa",
          status_tarefa: st, validacao_status: v,
        });
      }
    }
  }
  return out;
}

describe("planejarNotificacoes — mesmas decisões do laço original", () => {
  it("bate com a versão original em centenas de tarefas, com e sem horário silencioso", () => {
    const agoraMs = Date.now();
    const spNow = nowSP();
    const dateISO = todayDateISO_SP();
    const names = ["Alfa", "Beta", "Gama", "Delta"];
    let totalEnvios = 0;
    for (const semente of [1, 2, 3, 4]) {
      const tarefas = tarefasAleatorias(500, agoraMs, semente);
      // metade do que "já foi disparado" aleatoriamente, pra exercitar o dedupe
      const r = aleatorio(semente * 7);
      const fired = new Set<string>();
      for (const t of tarefas) {
        for (const tipo of ["fup_3h", "chapa_1h"]) if (r() < 0.3) fired.add(chaveDisparo(tipo, t.id_tarefa, dateISO));
        for (const tipo of ["val_30m", "val_2h"]) {
          if (r() < 0.3) fired.add(chaveDisparo(tipo, t.id_tarefa, toSP(t.data_tarefa).toISOString().slice(0, 10)));
        }
      }
      for (const quietHours of [false, true]) {
        const esperado = referencia({ tarefas, names, agoraMs, spNow, dateISO, quietHours, fired });
        const obtido = planejarNotificacoes({
          tarefas,
          empresaNaCarteira: (e) => companyMatches(e, names),
          agoraMs,
          spNow,
          dateISO,
          quietHours,
          jaDisparada: (c) => fired.has(c),
        });
        expect(obtido).toEqual(esperado);
        totalEnvios += obtido.length;
      }
    }
    // sanidade do teste: se nada disparasse, a igualdade acima não provaria nada
    expect(totalEnvios).toBeGreaterThan(100);
  }, 60_000);

  it("bate com a versão original colado nos limites de cada regra", () => {
    const agoraMs = Date.now();
    const spNow = nowSP();
    const dateISO = todayDateISO_SP();
    const tarefas = tarefasNasFronteiras(agoraMs);
    const esperado = referencia({ tarefas, names: ["Alfa"], agoraMs, spNow, dateISO, quietHours: false, fired: new Set() });
    const obtido = planejarNotificacoes({
      tarefas, empresaNaCarteira: (e) => companyMatches(e, ["Alfa"]), agoraMs, spNow, dateISO, quietHours: false,
      jaDisparada: () => false,
    });
    expect(obtido).toEqual(esperado);
    expect(obtido.length).toBeGreaterThan(50);
  });

  it("não dispara de novo o que já foi disparado", () => {
    const agoraMs = Date.now();
    const t: TarefaNotif = {
      id_tarefa: 7, data_tarefa: iso(agoraMs - 3 * HORA), cidade_uf: "São Paulo/SP", empresa: "Alfa",
      status_tarefa: "Em Andamento", validacao_status: "pendente",
    };
    const base = {
      tarefas: [t], empresaNaCarteira: () => true, agoraMs, spNow: nowSP(), dateISO: todayDateISO_SP(), quietHours: false,
    };
    const primeira = planejarNotificacoes({ ...base, jaDisparada: () => false });
    expect(primeira.map((n) => n.tipo)).toEqual(["val_30m", "val_2h"]);
    const feitas = new Set(primeira.map((n) => chaveDisparo(n.tipo, n.idTarefa, n.referencia)));
    expect(planejarNotificacoes({ ...base, jaDisparada: (c) => feitas.has(c) })).toEqual([]);
  });

  it("empresa fora da carteira não gera nada", () => {
    const agoraMs = Date.now();
    const t: TarefaNotif = {
      id_tarefa: 1, data_tarefa: iso(agoraMs - 3 * HORA), cidade_uf: null, empresa: "Outra",
      status_tarefa: "Em Andamento", validacao_status: "pendente",
    };
    expect(
      planejarNotificacoes({
        tarefas: [t], empresaNaCarteira: () => false, agoraMs, spNow: nowSP(), dateISO: todayDateISO_SP(),
        quietHours: false, jaDisparada: () => false,
      }),
    ).toEqual([]);
  });
});

describe("somaDiasISO", () => {
  it("anda no calendário, inclusive virando mês e ano", () => {
    expect(somaDiasISO("2026-10-07", -4)).toBe("2026-10-03");
    expect(somaDiasISO("2026-10-02", -4)).toBe("2026-09-28");
    expect(somaDiasISO("2026-01-02", -4)).toBe("2025-12-29");
    expect(somaDiasISO("2026-02-27", 3)).toBe("2026-03-02");
  });
});
