import { describe, expect, it, vi } from "vitest";

// Espiona o date-fns-tz pra provar que o atalho está ATIVO. O teste de equivalência
// (datetime.dataSP.test.ts) passaria mesmo com o atalho quebrado, porque o caminho
// completo dá o mesmo resultado — só mais devagar (foi exatamente o que aconteceu
// quando o regex perdeu as barras invertidas).
const chamadas = vi.hoisted(() => ({ n: 0 }));
vi.mock("date-fns-tz", async (importOriginal) => {
  const real = await importOriginal<typeof import("date-fns-tz")>();
  return {
    ...real,
    formatInTimeZone: (...args: Parameters<typeof real.formatInTimeZone>) => {
      chamadas.n++;
      return real.formatInTimeZone(...args);
    },
  };
});

import { dataSP } from "./datetime";

describe("dataSP — atalho ativo", () => {
  it("horário gravado como -03:00 não passa pelo date-fns-tz", () => {
    chamadas.n = 0;
    for (const t of [
      "2026-10-07T08:00:00-03:00",
      "2026-10-07T08:00-03:00",
      "2026-10-07T23:59:59.999-03:00",
      "2031-01-01T00:00:00-03:00",
    ]) {
      dataSP(t);
    }
    expect(chamadas.n).toBe(0);
  });

  it("outros formatos e anos antigos usam o caminho completo", () => {
    chamadas.n = 0;
    dataSP("2026-10-07T08:00:00Z");
    dataSP("2026-10-07T08:00:00-04:00");
    dataSP("2018-12-15T08:00:00-03:00");
    dataSP(new Date());
    expect(chamadas.n).toBe(4);
  });
});
