import { describe, expect, it } from "vitest";
import { criadaHa, rotuloDoDia, selecionarEmAnalise, soNaSecaoEmAnalise } from "./emAnalise";

const t = (id: number, data: string, status: string, extra: Record<string, unknown> = {}) => ({
  id_tarefa: id, empresa: `E${id}`, data_tarefa: data, status_tarefa: status, quantidade_chapas: 3, ...extra,
});

describe("selecionarEmAnalise", () => {
  const hoje = "2026-11-23";
  it("só 'Em Análise', de hoje em diante, da mais próxima para a mais distante", () => {
    const lista = selecionarEmAnalise(
      [
        t(1, "2026-11-25T08:00:00-03:00", "Em Análise"),
        t(2, "2026-11-23T14:00:00-03:00", "Em Análise"),
        t(3, "2026-11-23T10:00:00-03:00", "Aguardando Início"),
        t(4, "2026-11-22T10:00:00-03:00", "Em Análise"), // ontem: fora
        t(5, "2026-11-23T09:00:00-03:00", "Em Análise"),
      ],
      hoje,
    );
    expect(lista.map((x) => x.id_tarefa)).toEqual([5, 2, 1]);
  });

  it("sem tarefa em análise devolve lista vazia", () => {
    expect(selecionarEmAnalise([t(1, "2026-11-23T10:00:00-03:00", "Em Andamento")], hoje)).toEqual([]);
  });
});

describe("soNaSecaoEmAnalise", () => {
  it("em análise sem chapa alocado sai das listas; com chapa continua nelas", () => {
    expect(soNaSecaoEmAnalise(t(1, "2026-11-23T10:00:00-03:00", "Em Análise", { chapas: [] }))).toBe(true);
    expect(soNaSecaoEmAnalise(t(1, "2026-11-23T10:00:00-03:00", "Em Análise", { chapas: [{}] }))).toBe(false);
    expect(soNaSecaoEmAnalise(t(1, "2026-11-23T10:00:00-03:00", "Em Aberto", { chapas: [] }))).toBe(false);
  });
});

describe("rotuloDoDia / criadaHa", () => {
  const nome = (iso: string) => `dia ${iso}`;
  it("Hoje, Amanhã ou o nome do dia", () => {
    expect(rotuloDoDia("2026-11-23T10:00:00-03:00", "2026-11-23", nome)).toBe("Hoje");
    expect(rotuloDoDia("2026-11-24T10:00:00-03:00", "2026-11-23", nome)).toBe("Amanhã");
    expect(rotuloDoDia("2026-11-27T10:00:00-03:00", "2026-11-23", nome)).toBe("dia 2026-11-27");
  });

  it("criada há quanto tempo, em linguagem curta", () => {
    const agora = new Date("2026-11-23T12:00:00-03:00").getTime();
    expect(criadaHa("2026-11-23T11:59:30-03:00", agora)).toBe("agora");
    expect(criadaHa("2026-11-23T11:35:00-03:00", agora)).toBe("há 25 min");
    expect(criadaHa("2026-11-23T09:00:00-03:00", agora)).toBe("há 3 h");
    expect(criadaHa("2026-11-22T09:00:00-03:00", agora)).toBe("ontem");
    expect(criadaHa("2026-11-19T12:00:00-03:00", agora)).toBe("há 4 dias");
  });

  it("sem data ou data inválida: null (a tela mostra '—')", () => {
    expect(criadaHa(null, Date.now())).toBeNull();
    expect(criadaHa("lixo", Date.now())).toBeNull();
  });
});
