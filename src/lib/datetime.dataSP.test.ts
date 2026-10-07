import { describe, expect, it } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import { dataSP, fmtSP, TZ } from "./datetime";

const referencia = (d: string | Date) => formatInTimeZone(typeof d === "string" ? new Date(d) : d, TZ, "yyyy-MM-dd");

function aleatorio(semente: number) {
  let s = semente >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const p2 = (n: number) => String(n).padStart(2, "0");

describe("dataSP — mesmo resultado de fmtSP(d, 'yyyy-MM-dd'), sem o date-fns-tz", () => {
  it("bate com a referência em milhares de horários gravados como -03:00 (2020 a 2032, inclusive madrugada e virada de dia)", () => {
    const r = aleatorio(5);
    for (let i = 0; i < 4000; i++) {
      const ano = 2020 + Math.floor(r() * 13);
      const mes = 1 + Math.floor(r() * 12);
      const dia = 1 + Math.floor(r() * 28);
      const h = Math.floor(r() * 24);
      const m = Math.floor(r() * 60);
      const sec = Math.floor(r() * 60);
      const variantes = [
        `${ano}-${p2(mes)}-${p2(dia)}T${p2(h)}:${p2(m)}:${p2(sec)}-03:00`,
        `${ano}-${p2(mes)}-${p2(dia)}T${p2(h)}:${p2(m)}-03:00`,
        `${ano}-${p2(mes)}-${p2(dia)}T${p2(h)}:${p2(m)}:${p2(sec)}.123-03:00`,
      ];
      for (const t of variantes) expect(dataSP(t)).toBe(referencia(t));
    }
  }, 60_000);

  it("outros formatos (Z, outro offset, sem offset, só data, Date) usam o caminho completo e dão o mesmo", () => {
    const casos = [
      "2026-10-07T01:30:00Z",
      "2026-10-07T02:59:59Z", // ainda dia 06 em SP
      "2026-10-07T03:00:00Z", // já dia 07 em SP
      "2026-10-07T08:00:00+00:00",
      "2026-10-07T08:00:00-04:00",
      "2026-10-07T23:30:00-02:00",
      "2026-10-07T08:00:00",
      "2026-10-07",
    ];
    for (const t of casos) expect(dataSP(t)).toBe(referencia(t));
    const agora = new Date();
    expect(dataSP(agora)).toBe(referencia(agora));
    expect(dataSP(new Date("2026-10-07T02:00:00Z"))).toBe(referencia(new Date("2026-10-07T02:00:00Z")));
  });

  it("fmtSP continua igual (não foi alterada)", () => {
    expect(fmtSP("2026-10-07T08:00:00-03:00", "yyyy-MM-dd")).toBe("2026-10-07");
  });

  it("anos antes de 2020 não usam o atalho (SP tinha horário de verão até 2019)", () => {
    for (const t of ["2018-12-15T23:30:00-03:00", "2019-01-10T22:30:00-03:00", "2018-07-01T00:30:00-03:00"]) {
      expect(dataSP(t)).toBe(referencia(t));
    }
  });
});
