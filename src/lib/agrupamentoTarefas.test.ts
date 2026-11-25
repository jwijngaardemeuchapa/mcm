import { beforeEach, describe, expect, it } from "vitest";
import {
  agruparCards,
  chaveDeAgrupamento,
  ehGrupo,
  fundirTarefas,
  gravarAgruparAtivo,
  gravarDesfeitos,
  idsDoCard,
  idTarefaDoChapa,
  lerAgruparAtivo,
  lerDesfeitos,
  novoCacheDeGrupos,
  type CardAgrupavel,
} from "./agrupamentoTarefas";

let seq = 0;
function card(id: number, extra: Partial<CardAgrupavel> = {}): CardAgrupavel {
  seq++;
  return {
    id_tarefa: id,
    data_tarefa: "2026-11-25T09:00:00-03:00",
    empresa: "Atacadista Pereira",
    cidade_uf: "Campinas/SP",
    status_tarefa: "Em Aberto",
    quantidade_chapas: 1,
    validacao_status: "aguardando",
    chapas: [{ id: `c${id}`, id_tarefa: id, nome_chapa: `Chapa ${id}` }],
    fup_log: [],
    urgent: false,
    ...extra,
  };
}

const agrupar = (lista: CardAgrupavel[], desfeitos: number[] = []) =>
  agruparCards(lista, new Set(desfeitos), novoCacheDeGrupos<CardAgrupavel>());

describe("chaveDeAgrupamento", () => {
  it("mesmo cliente, endereço e horário → mesma chave (ignora caixa, acento e espaço sobrando)", () => {
    const a = card(1, { empresa: "Atacadista  Pereira ", cidade_uf: "Campinas/SP" });
    const b = card(2, { empresa: "ATACADISTA PEREIRA", cidade_uf: "campinas/sp" });
    expect(chaveDeAgrupamento(a)).toBe(chaveDeAgrupamento(b));
    expect(chaveDeAgrupamento(card(3, { empresa: "Armazéns São José" }))).toBe(chaveDeAgrupamento(card(4, { empresa: "ARMAZENS SAO JOSE" })));
  });

  it("horário diferente (até por 1 minuto), endereço diferente ou outro cliente → chave diferente", () => {
    const base = chaveDeAgrupamento(card(1));
    expect(chaveDeAgrupamento(card(2, { data_tarefa: "2026-11-25T09:01:00-03:00" }))).not.toBe(base);
    expect(chaveDeAgrupamento(card(3, { cidade_uf: "Sorocaba/SP" }))).not.toBe(base);
    expect(chaveDeAgrupamento(card(4, { empresa: "Outra Empresa" }))).not.toBe(base);
  });

  it("segundos e milissegundos não separam tarefas do mesmo minuto", () => {
    expect(chaveDeAgrupamento(card(1, { data_tarefa: "2026-11-25T09:00:00.000-03:00" })))
      .toBe(chaveDeAgrupamento(card(2, { data_tarefa: "2026-11-25T09:00:45.500-03:00" })));
  });

  it("com o vínculo tarefa→endereço, o endereço é o id (duas ruas na mesma cidade não se juntam)", () => {
    const a = card(1, { endereco_id: "77" });
    const b = card(2, { endereco_id: "77" });
    const c = card(3, { endereco_id: "88" });
    expect(chaveDeAgrupamento(a)).toBe(chaveDeAgrupamento(b));
    expect(chaveDeAgrupamento(a)).not.toBe(chaveDeAgrupamento(c));
  });

  it("tarefa 'Em Análise' não se mistura com as aprovadas", () => {
    expect(chaveDeAgrupamento(card(1, { status_tarefa: "Em Análise" }))).not.toBe(chaveDeAgrupamento(card(2)));
    expect(chaveDeAgrupamento(card(3, { status_tarefa: "Em Análise" }))).toBe(chaveDeAgrupamento(card(4, { status_tarefa: "Em Análise" })));
  });
});

describe("agruparCards", () => {
  it("junta as tarefas iguais num card só e deixa as outras como estão (mesma referência)", () => {
    const solo = card(10, { empresa: "Cliente Solo" });
    const lista = [card(1), solo, card(2), card(3)];
    const r = agrupar(lista);
    expect(r).toHaveLength(2);
    expect(idsDoCard(r[0])).toEqual([1, 2, 3]);
    expect(r[1]).toBe(solo);
  });

  it("o grupo ocupa o lugar do primeiro membro e a ordem do resto se mantém", () => {
    const a = card(5, { data_tarefa: "2026-11-25T08:00:00-03:00", empresa: "A" });
    const g1 = card(1);
    const meio = card(6, { data_tarefa: "2026-11-25T09:30:00-03:00", empresa: "B" });
    const g2 = card(2);
    const r = agrupar([a, g1, meio, g2]);
    expect(r.map((t) => t.id_tarefa)).toEqual([5, 1, 6]);
    expect(ehGrupo(r[1])).toBe(true);
  });

  it("a tarefa líder é a de menor id, mesmo que ela não seja a primeira da lista", () => {
    const r = agrupar([card(9), card(4), card(7)]);
    expect(r).toHaveLength(1);
    expect(r[0].id_tarefa).toBe(4);
    expect(idsDoCard(r[0])).toEqual([4, 7, 9]);
  });

  it("uma tarefa sozinha não vira grupo", () => {
    const t = card(1);
    const r = agrupar([t]);
    expect(r[0]).toBe(t);
    expect(ehGrupo(r[0])).toBe(false);
    expect(idsDoCard(r[0])).toEqual([1]);
  });

  it("tarefas desfeitas pelo analista voltam a ser cards próprios; as demais seguem agrupadas", () => {
    const r = agrupar([card(1), card(2), card(3)], [2]);
    expect(r.map((t) => [t.id_tarefa, ehGrupo(t)])).toEqual([[1, true], [2, false]]);
    expect(idsDoCard(r[0])).toEqual([1, 3]);
    const todas = agrupar([card(1), card(2)], [1, 2]);
    expect(todas.map((t) => ehGrupo(t))).toEqual([false, false]);
  });

  it("cache: com os mesmos objetos devolve o MESMO card de grupo; muda um membro, refaz", () => {
    const cache = novoCacheDeGrupos<CardAgrupavel>();
    const a = card(1);
    const b = card(2);
    const vazio = new Set<number>();
    const r1 = agruparCards([a, b], vazio, cache);
    const r2 = agruparCards([a, b], vazio, cache);
    expect(r2[0]).toBe(r1[0]);
    const b2 = { ...b, validacao_status: "pendente" }; // card recarregado (objeto novo)
    const r3 = agruparCards([a, b2], vazio, cache);
    expect(r3[0]).not.toBe(r1[0]);
  });

  it("cache descarta grupos que deixaram de existir", () => {
    const cache = novoCacheDeGrupos<CardAgrupavel>();
    agruparCards([card(1), card(2)], new Set(), cache);
    expect(cache.size).toBe(1);
    agruparCards([card(1)], new Set(), cache);
    expect(cache.size).toBe(0);
  });

  it("lista vazia e entrada sem pares não quebram", () => {
    expect(agrupar([])).toEqual([]);
    const lista = [card(1, { empresa: "A" }), card(2, { empresa: "B" })];
    expect(agrupar(lista)).toEqual(lista);
  });
});

describe("fundirTarefas — o card do grupo", () => {
  it("soma as vagas, junta os chapas (cada um com o id da tarefa de origem) e os disparos (mais recente primeiro)", () => {
    const a = card(1, { fup_log: [{ id: "f1", data_disparo: "2026-11-25T07:00:00Z" }] });
    const b = card(2, {
      chapas: [{ id: "c2", nome_chapa: "Sem id de origem" }],
      fup_log: [{ id: "f2", data_disparo: "2026-11-25T08:00:00Z" }],
    });
    const g = fundirTarefas([a, b]);
    expect(g.quantidade_chapas).toBe(2);
    expect(g.chapas.map((c) => [c.id, c.id_tarefa])).toEqual([["c1", 1], ["c2", 2]]);
    expect(g.fup_log.map((f) => [f.id, f.id_tarefa])).toEqual([["f2", 2], ["f1", 1]]);
    expect(g.grupo.ids).toEqual([1, 2]);
    expect(g.grupo.membros).toEqual([a, b]);
    expect(g.id_tarefa).toBe(1);
  });

  it("vaga sem quantidade (0) conta pelos chapas alocados", () => {
    const a = card(1, { quantidade_chapas: 0, chapas: [{ id: "x", id_tarefa: 1 }, { id: "y", id_tarefa: 1 }] });
    const b = card(2, { quantidade_chapas: 3 });
    expect(fundirTarefas([a, b]).quantidade_chapas).toBe(5);
  });

  it("validação: o grupo só está 'subido' quando TODAS as tarefas estão (vale a menos avançada)", () => {
    const sub = (id: number, v: string | null) => card(id, { validacao_status: v });
    expect(fundirTarefas([sub(1, "subido_meu_chapa"), sub(2, "subido_meu_chapa")]).validacao_status).toBe("subido_meu_chapa");
    expect(fundirTarefas([sub(1, "subido_meu_chapa"), sub(2, "validacao_recebida")]).validacao_status).toBe("validacao_recebida");
    expect(fundirTarefas([sub(1, "validacao_recebida"), sub(2, "pendente")]).validacao_status).toBe("pendente");
    expect(fundirTarefas([sub(1, "subido_meu_chapa"), sub(2, null)]).validacao_status).toBe("aguardando");
  });

  it("urgente/overnight/em oferta: basta uma; remessa e tipo juntam os valores distintos", () => {
    const a = card(1, { urgent: true, remessa: "CTE 1", tipo_trabalho: "Descarga", em_oferta: 0 });
    const b = card(2, { is_overnight: true, remessa: "cte 1", tipo_trabalho: "Carga", em_oferta: 1, chapa_em_oferta: "Ana" });
    const g = fundirTarefas([a, b]);
    expect(g.urgent).toBe(true);
    expect(g.is_overnight).toBe(true);
    expect(g.em_oferta).toBe(1);
    expect(g.chapa_em_oferta).toBe("Ana");
    expect(g.remessa).toBe("CTE 1");
    expect(g.tipo_trabalho).toBe("Descarga · Carga");
  });

  it("datas da validação: usa a mais recente; criada_em: a mais antiga", () => {
    const a = card(1, { data_upload_meu_chapa: "2026-11-25T10:00:00Z", criada_em: "2026-11-24T10:00:00Z" });
    const b = card(2, { data_upload_meu_chapa: "2026-11-25T12:00:00Z", criada_em: "2026-11-23T10:00:00Z" });
    const g = fundirTarefas([a, b]);
    expect(g.data_upload_meu_chapa).toBe("2026-11-25T12:00:00Z");
    expect(g.criada_em).toBe("2026-11-23T10:00:00Z");
  });
});

describe("idTarefaDoChapa", () => {
  it("usa a tarefa de origem do chapa; sem ela, a do card", () => {
    expect(idTarefaDoChapa({ id_tarefa: 7 }, { id_tarefa: 1 })).toBe(7);
    expect(idTarefaDoChapa({}, { id_tarefa: 1 })).toBe(1);
    expect(idTarefaDoChapa({ id_tarefa: null }, { id_tarefa: 1 })).toBe(1);
  });
});

describe("preferências do analista", () => {
  beforeEach(() => localStorage.clear());

  it("o agrupamento vem ligado e lembra a escolha", () => {
    expect(lerAgruparAtivo()).toBe(true);
    gravarAgruparAtivo(false);
    expect(lerAgruparAtivo()).toBe(false);
    gravarAgruparAtivo(true);
    expect(lerAgruparAtivo()).toBe(true);
  });

  it("lembra as tarefas desfeitas e ignora lixo no armazenamento", () => {
    expect(lerDesfeitos().size).toBe(0);
    gravarDesfeitos(new Set([3, 5]));
    expect([...lerDesfeitos()].sort()).toEqual([3, 5]);
    localStorage.setItem("dash_grupos_desfeitos", "{não é json");
    expect(lerDesfeitos().size).toBe(0);
    localStorage.setItem("dash_grupos_desfeitos", JSON.stringify([1, "x", null, 2]));
    expect([...lerDesfeitos()].sort()).toEqual([1, 2]);
  });
});
