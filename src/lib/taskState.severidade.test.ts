import { describe, expect, it } from "vitest";
import { severityLabel, type TaskSeverity } from "./taskState";

describe("severityLabel — a severidade em texto (nunca só cor)", () => {
  it("cada nível de destaque tem um texto; 'default' não diz nada", () => {
    const esperado: Record<TaskSeverity, RegExp | null> = {
      urgent: /^Urgente: nenhum confirmado/,
      "approach-alert": /^Atenção: começa em até 3 h/,
      andamento: /^Em andamento$/,
      done: /^Completa/,
      validated: /^Completa/,
      analise: null,
      default: null,
    };
    for (const [sev, re] of Object.entries(esperado) as [TaskSeverity, RegExp | null][]) {
      const t = severityLabel(sev);
      if (re) expect(t).toMatch(re);
      else expect(t).toBeNull();
    }
  });
});
