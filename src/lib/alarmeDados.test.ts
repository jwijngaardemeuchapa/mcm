import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { carregarConfiabilidade, carregarEntradasDoAlarme, limparCacheConfiabilidade, tipoDoDisparo } from "./alarmeDados";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

// "Agora" = 28/10/2026 12:00 em São Paulo (15:00 UTC)
const AGORA = new Date("2026-10-28T15:00:00Z");
const MIN = 60_000;
const emSP = (horas: number, dia = "2026-10-28") => `${dia}T${String(horas).padStart(2, "0")}:00:00-03:00`;
const haMin = (m: number) => new Date(AGORA.getTime() - m * MIN).toISOString();

let db: InstanceType<typeof DatabaseSync>;
const banco = () => ({ select: async <T>(sql: string, p: unknown[] = []) => db.prepare(sql).all(...(p as never[])) as T });

function criar(comColunasNovas = true) {
  db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE tarefas (id_tarefa INTEGER PRIMARY KEY, data_tarefa TEXT, empresa TEXT, cidade_uf TEXT, status_tarefa TEXT, quantidade_chapas INTEGER, ativo INTEGER);
    CREATE TABLE chapas (id TEXT PRIMARY KEY, id_tarefa INTEGER, nome_chapa TEXT, telefone_chapa TEXT, cpf TEXT, status_contato TEXT,
      canal_contato TEXT, data_contato TEXT, validacao_presenca TEXT);
    CREATE TABLE fup_log (id TEXT PRIMARY KEY, id_tarefa INTEGER, chapa_id TEXT, canal TEXT, data_disparo TEXT${comColunasNovas ? ", aguarda_resposta_chat INTEGER, umbler_chat_id TEXT" : ""});`);
}
const tarefa = (id: number, quando: string, o: { empresa?: string; status?: string; qtd?: number | null; ativo?: number; cidade?: string } = {}) =>
  db.prepare("INSERT INTO tarefas VALUES (?,?,?,?,?,?,?)").run(id, quando, o.empresa ?? "ACME LTDA", o.cidade ?? "São Paulo/SP", o.status ?? "Aguardando Início", o.qtd === undefined ? 5 : o.qtd, o.ativo ?? 1);
const chapa = (id: string, t: number, nome: string | null, o: { tel?: string | null; status?: string; canal?: string | null; contato?: string | null; cpf?: string | null } = {}) =>
  db.prepare("INSERT INTO chapas (id, id_tarefa, nome_chapa, telefone_chapa, cpf, status_contato, canal_contato, data_contato) VALUES (?,?,?,?,?,?,?,?)")
    .run(id, t, nome, o.tel === undefined ? "11999990001" : o.tel, o.cpf ?? null, o.status ?? "pendente", o.canal ?? null, o.contato ?? null);
const log = (id: string, t: number, chapa_: string, canal: string, quando: string, aguarda: number | null = 0, chat: string | null = null) =>
  db.prepare("INSERT INTO fup_log (id, id_tarefa, chapa_id, canal, data_disparo, aguarda_resposta_chat, umbler_chat_id) VALUES (?,?,?,?,?,?,?)").run(id, t, chapa_, canal, quando, aguarda, chat);

const carregar = (o: Partial<Parameters<typeof carregarEntradasDoAlarme>[1]> = {}) =>
  carregarEntradasDoAlarme(banco(), { horizonteHoras: 30, carteira: [], naoLidas: new Set(), ...o });

beforeEach(() => {
  vi.useFakeTimers({ now: AGORA, toFake: ["Date"] });
  limparCacheConfiabilidade();
  criar();
});
afterEach(() => vi.useRealTimers());

describe("quais tarefas entram", () => {
  it("tarefa futura dentro do horizonte; tarefa que já começou, longe demais, inativa ou em andamento ficam de fora", async () => {
    tarefa(1, emSP(15));
    tarefa(2, emSP(11)); // já começou
    tarefa(3, emSP(20, "2026-10-30")); // 56 h: fora do horizonte de 30 h
    tarefa(4, emSP(15), { ativo: 0 });
    tarefa(5, emSP(15), { status: "Em Andamento" });
    tarefa(6, emSP(15), { status: "Cancelado" });
    tarefa(7, emSP(15), { status: "Concluído" });
    tarefa(8, emSP(15), { status: "Em Análise" });
    for (const t of [1, 2, 3, 4, 5, 6, 7, 8]) chapa(`c${t}`, t, `Chapa ${t}`);
    expect((await carregar()).map((t) => t.id_tarefa)).toEqual([1]);
  });

  it("o horizonte é configurável", async () => {
    tarefa(1, emSP(15));
    expect(await carregar({ horizonteHoras: 2 })).toEqual([]);
    expect(await carregar({ horizonteHoras: 4 })).toHaveLength(1);
  });

  it("carteira do analista: só as empresas dele; carteira vazia = sem restrição", async () => {
    tarefa(1, emSP(15), { empresa: "Transportes Alfa LTDA" });
    tarefa(2, emSP(16), { empresa: "Beta Logística S.A." });
    chapa("a", 1, "Ana");
    chapa("b", 2, "Bia");
    expect((await carregar({ carteira: ["Transportes Alfa"] })).map((t) => t.id_tarefa)).toEqual([1]);
    expect((await carregar({ carteira: [] })).map((t) => t.id_tarefa).sort()).toEqual([1, 2]);
  });

  it("amanhã entra (PréFUP), com minutos até a tarefa e o próximo disparo sugerido", async () => {
    tarefa(1, emSP(15)); // em 3 h
    tarefa(2, emSP(9, "2026-10-29")); // amanhã às 9 h = 21 h
    chapa("a", 1, "Ana");
    chapa("b", 2, "Bia");
    const r = await carregar();
    const t1 = r.find((t) => t.id_tarefa === 1)!;
    const t2 = r.find((t) => t.id_tarefa === 2)!;
    expect(Math.round(t1.minParaTarefa)).toBe(180);
    expect(t1.tipoSugerido).toBe("fup");
    expect(Math.round(t2.minParaTarefa)).toBe(21 * 60);
    expect(t2.tipoSugerido).toBe("prefup");
  });
});

describe("quem entra como pendente", () => {
  it("só quem não confirmou; removidos e vagas sem nome não contam; confirmados contam no fill", async () => {
    tarefa(1, emSP(15), { qtd: 5 });
    chapa("p", 1, "Pendente");
    chapa("n", 1, "Não respondeu", { status: "nao_respondeu" });
    chapa("x", 1, "Cancelou", { status: "cancelado" });
    chapa("c1", 1, "Conf 1", { status: "confirmado" });
    chapa("c2", 1, "Conf 2", { status: "confirmado" });
    chapa("r", 1, "Removido", { status: "removido" });
    chapa("v", 1, null);
    const [t] = await carregar();
    expect(t.chapas.map((c) => c.id).sort()).toEqual(["n", "p", "x"]);
    expect(t.confirmados).toBe(2);
    expect(t.solicitados).toBe(5);
    expect(t.nomes.sort()).toEqual(["Cancelou", "Conf 1", "Conf 2", "Não respondeu", "Pendente"]);
  });

  it("sem quantidade pedida, usa quantos chapas a tarefa tem", async () => {
    tarefa(1, emSP(15), { qtd: null });
    chapa("a", 1, "A");
    chapa("b", 1, "B");
    expect((await carregar())[0].solicitados).toBe(2);
  });

  it("tarefa sem nenhum pendente continua na lista (a portaria precisa dela)", async () => {
    tarefa(1, emSP(15), { qtd: 1 });
    chapa("c", 1, "Conf", { status: "confirmado" });
    const [t] = await carregar();
    expect(t.chapas).toEqual([]);
    expect(t.nomes).toEqual(["Conf"]);
  });

  it("telefone vazio vira null; mensagem não lida casa pelos 11 últimos dígitos", async () => {
    tarefa(1, emSP(15));
    chapa("a", 1, "A", { tel: "  " });
    chapa("b", 1, "B", { tel: "+55 (19) 99999-0002" });
    chapa("c", 1, "C", { tel: "(19) 98888-0003" });
    const [t] = await carregar({ naoLidas: new Set(["19999990002"]) });
    const por = Object.fromEntries(t.chapas.map((c) => [c.id, c]));
    expect(por.a.telefone).toBeNull();
    expect(por.b.naoLida).toBe(true);
    expect(por.c.naoLida).toBe(false);
  });
});

describe("o último disparo", () => {
  beforeEach(() => tarefa(1, emSP(15)));

  it("vem do fup_log: o mais recente, com contagem e o link da conversa", async () => {
    chapa("a", 1, "Ana");
    log("l1", 1, "a", "umbler_talk", haMin(120), 0, "chat-velho");
    log("l2", 1, "a", "umbler_talk", haMin(10), 0, "chat-novo");
    const [t] = await carregar();
    expect(t.chapas[0].ultimoDisparo).toMatchObject({ tipo: "fup", canal: "umbler_talk" });
    expect(t.chapas[0].ultimoDisparo!.quando).toBe(AGORA.getTime() - 10 * MIN);
    expect(t.chapas[0].disparos).toBe(2);
    expect(t.chapas[0].chatId).toBe("chat-novo");
  });

  it("a marca aguarda_resposta_chat diz que foi PréFUP", async () => {
    chapa("a", 1, "Ana");
    log("l1", 1, "a", "umbler_talk", haMin(30), 1);
    expect((await carregar())[0].chapas[0].ultimoDisparo!.tipo).toBe("prefup");
  });

  it("aviso de cancelamento e linha-resumo (sem chapa) não contam como disparo", async () => {
    chapa("a", 1, "Ana");
    log("l1", 1, "a", "umbler_cancelamento", haMin(5));
    log("l2", 1, "a", "umbler_cancelamento_auto", haMin(4));
    db.prepare("INSERT INTO fup_log (id, id_tarefa, chapa_id, canal, data_disparo) VALUES ('res', 1, NULL, 'umbler_talk', ?)").run(haMin(3));
    const [t] = await carregar();
    expect(t.chapas[0].ultimoDisparo).toBeNull();
    expect(t.chapas[0].disparos).toBe(0);
  });

  it("canal manual sem a marca: o tipo vem da janela da hora do disparo (dia anterior = PréFUP; perto da tarefa = FUP)", async () => {
    chapa("a", 1, "Ana");
    chapa("b", 1, "Bia");
    log("l1", 1, "a", "whatsapp_web", "2026-10-27T18:00:00Z"); // ontem
    log("l2", 1, "b", "whatsapp_web", haMin(20)); // agora, 3 h antes da tarefa
    const t = (await carregar())[0];
    expect(t.chapas.find((c) => c.id === "a")!.ultimoDisparo!.tipo).toBe("prefup");
    expect(t.chapas.find((c) => c.id === "b")!.ultimoDisparo!.tipo).toBe("fup");
  });

  it("sem fup_log, usa o contato gravado no chapa — menos o aviso de cancelamento e a sincronização", async () => {
    chapa("a", 1, "Ana", { canal: "umbler_talk", contato: haMin(12) });
    chapa("b", 1, "Bia", { canal: "umbler_cancelamento", contato: haMin(12) });
    chapa("c", 1, "Cida", { canal: "central_sync", contato: haMin(12) });
    chapa("d", 1, "Dani", { canal: null, contato: null });
    const por = Object.fromEntries((await carregar())[0].chapas.map((c) => [c.id, c]));
    expect(por.a.ultimoDisparo!.quando).toBe(AGORA.getTime() - 12 * MIN);
    expect(por.b.ultimoDisparo).toBeNull();
    expect(por.b.semRespostaEnviado).toBe(true);
    expect(por.c.ultimoDisparo).toBeNull();
    expect(por.d.ultimoDisparo).toBeNull();
  });

  it("funciona num banco ainda sem as colunas aguarda_resposta_chat / umbler_chat_id", async () => {
    criar(false);
    tarefa(1, emSP(15));
    chapa("a", 1, "Ana");
    db.prepare("INSERT INTO fup_log (id, id_tarefa, chapa_id, canal, data_disparo) VALUES ('l', 1, 'a', 'umbler_talk', ?)").run(haMin(8));
    const [t] = await carregar();
    expect(t.chapas[0].ultimoDisparo).toMatchObject({ tipo: "fup" });
    expect(t.chapas[0].chatId).toBeNull();
  });
});

describe("confiabilidade", () => {
  it("mostra estrelas e faltas só com participações suficientes", async () => {
    tarefa(1, emSP(15));
    chapa("a", 1, "Ana", { cpf: "111.111.111-11" });
    chapa("b", 1, "Bia", { cpf: "222.222.222-22" });
    const mapa = new Map([
      ["c:11111111111", { participacoes: 4, presencas: 2, faltas: 2, confirmacoes: 4, removidos: 0, score: 40, stars: 2 }],
      ["c:22222222222", { participacoes: 1, presencas: 1, faltas: 0, confirmacoes: 1, removidos: 0, score: 90, stars: 4.5 }],
    ]);
    const por = Object.fromEntries((await carregar({ confiabilidade: mapa })).flatMap((t) => t.chapas).map((c) => [c.id, c]));
    expect(por.a).toMatchObject({ estrelas: 2, faltas: 2 });
    expect(por.b).toMatchObject({ estrelas: null, faltas: null });
  });

  it("carregarConfiabilidade guarda o resultado por 10 min e devolve null se a consulta falha", async () => {
    tarefa(1, emSP(15));
    chapa("a", 1, "Ana", { cpf: "111.111.111-11" });
    const espia = vi.fn(banco().select);
    const comEspia = { select: espia as <T>(sql: string, p?: unknown[]) => Promise<T> };
    const t0 = AGORA.getTime();
    await carregarConfiabilidade(comEspia, t0);
    await carregarConfiabilidade(comEspia, t0 + 9 * MIN);
    expect(espia).toHaveBeenCalledTimes(1);
    await carregarConfiabilidade(comEspia, t0 + 11 * MIN);
    expect(espia).toHaveBeenCalledTimes(2);

    limparCacheConfiabilidade();
    expect(await carregarConfiabilidade({ select: async () => { throw new Error("banco ocupado"); } }, t0)).toBeNull();
  });
});

describe("tipoDoDisparo", () => {
  const t = { data_tarefa: emSP(18), cidade_uf: "São Paulo/SP" };
  it("a marca manda; umbler_talk sem marca é FUP; o resto segue a janela de 5 h", () => {
    const quando = AGORA.getTime();
    expect(tipoDoDisparo(quando, t, "umbler_talk", 1)).toBe("prefup");
    expect(tipoDoDisparo(quando, t, "umbler_talk", 0)).toBe("fup");
    expect(tipoDoDisparo(quando, t, "ligacao_3c", null)).toBe("prefup"); // 6 h antes
    expect(tipoDoDisparo(quando + 2 * 3_600_000, t, "ligacao_3c", null)).toBe("fup"); // 4 h antes
  });
});
