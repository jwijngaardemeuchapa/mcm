import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const h = vi.hoisted(() => ({
  db: null as unknown as InstanceType<typeof DatabaseSync>,
  ligado: true,
  startChapaJob: vi.fn(),
  getChapaJobState: vi.fn(() => null as unknown),
  toast: { info: vi.fn(), warning: vi.fn(), success: vi.fn(), error: vi.fn() },
  logActivity: vi.fn(async () => {}),
  carteira: vi.fn(async () => [] as string[]),
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("./db", () => ({
  getDb: async () => ({
    select: async (sql: string, p: unknown[] = []) => h.db.prepare(sql).all(...(p as never[])),
    execute: async (sql: string, p: unknown[] = []) => ({ rowsAffected: Number(h.db.prepare(sql).run(...(p as never[])).changes) }),
  }),
}));
vi.mock("./settings", () => ({ readSettings: () => ({ fupAutoNovosChapas: h.ligado }) }));
vi.mock("./dispatchQueue", () => ({ dispatchQueue: { startChapaJob: h.startChapaJob, getChapaJobState: h.getChapaJobState } }));
vi.mock("./activityLog", () => ({ logActivity: h.logActivity }));
vi.mock("./carteira", () => ({ getCarteiraDoAnalista: h.carteira }));

import { escolherAlvos, INTERVALO_ENTRE_CHAPAS_MS, LIMITE_NOVOS_POR_SYNC, reagirAChapasNovos } from "./fupNovosChapas";

const HORA = 3_600_000;
const daqui = (horas: number) => new Date(Date.now() + horas * HORA).toISOString();

function banco() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE tarefas (id_tarefa INTEGER PRIMARY KEY, data_tarefa TEXT, empresa TEXT, cidade_uf TEXT, status_tarefa TEXT, ativo INTEGER);
    CREATE TABLE chapas (id TEXT PRIMARY KEY, id_tarefa INTEGER, nome_chapa TEXT, telefone_chapa TEXT, status_contato TEXT);
    CREATE TABLE fup_log (id TEXT PRIMARY KEY, id_tarefa INTEGER, chapa_id TEXT);`);
  return db;
}
const tarefa = (id: number, quando = daqui(5), status = "Aguardando Início", ativo = 1) =>
  h.db.prepare("INSERT INTO tarefas VALUES (?,?,?,?,?,?)").run(id, quando, "ACME", "São Paulo/SP", status, ativo);
const chapa = (id: string, tarefaId: number, nome: string, tel: string | null = "(19) 99999-0001", status = "pendente") =>
  h.db.prepare("INSERT INTO chapas VALUES (?,?,?,?,?)").run(id, tarefaId, nome, tel, status);
const fup = (chapaId: string, tarefaId: number) => h.db.prepare("INSERT INTO fup_log VALUES (?,?,?)").run(`f-${chapaId}`, tarefaId, chapaId);
const novos = (...ids: Array<[string, number]>) => ids.map(([id, id_tarefa]) => ({ id, id_tarefa, nome_chapa: id }));
const ids = (alvos: Awaited<ReturnType<typeof escolherAlvos>>) => alvos.map((a) => a.chapa.id);

const dbAdaptado = () => ({ select: async <T>(sql: string, p: unknown[] = []) => h.db.prepare(sql).all(...(p as never[])) as T });

beforeEach(() => {
  h.db = banco();
  h.ligado = true;
  h.startChapaJob.mockClear();
  h.getChapaJobState.mockReset().mockReturnValue(null);
  Object.values(h.toast).forEach((f) => f.mockClear());
  h.logActivity.mockClear();
  h.carteira.mockReset().mockResolvedValue([]); // carteira vazia = sem restrição
});
afterEach(() => vi.useRealTimers());

describe("escolherAlvos — quem recebe o FUP automático", () => {
  it("pendente, com telefone, em tarefa ativa que ainda não começou", async () => {
    tarefa(1);
    chapa("a", 1, "Ana");
    expect(ids(await escolherAlvos(dbAdaptado(), novos(["a", 1])))).toEqual(["a"]);
  });

  it("não entra: já confirmado/removido/cancelado, sem telefone, ou que já recebeu algum FUP", async () => {
    tarefa(1);
    chapa("conf", 1, "C", "(19) 90000-0001", "confirmado");
    chapa("rem", 1, "R", "(19) 90000-0002", "removido");
    chapa("canc", 1, "X", "(19) 90000-0003", "cancelado");
    chapa("semtel", 1, "S", null);
    chapa("vazio", 1, "V", "");
    chapa("jafup", 1, "J", "(19) 90000-0004");
    fup("jafup", 1);
    chapa("ok", 1, "OK", "(19) 90000-0005");
    expect(ids(await escolherAlvos(dbAdaptado(), novos(["conf", 1], ["rem", 1], ["canc", 1], ["semtel", 1], ["vazio", 1], ["jafup", 1], ["ok", 1])))).toEqual(["ok"]);
  });

  it("tarefa que já começou, em andamento, concluída, cancelada ou inativa fica de fora", async () => {
    tarefa(1, daqui(-1));
    tarefa(2, daqui(5), "Em Andamento");
    tarefa(3, daqui(5), "Concluído");
    tarefa(4, daqui(5), "Cancelado");
    tarefa(5, daqui(5), "Aguardando Início", 0);
    tarefa(6, daqui(5));
    for (const t of [1, 2, 3, 4, 5, 6]) chapa(`c${t}`, t, `Chapa ${t}`, `(19) 9000-000${t}`);
    expect(ids(await escolherAlvos(dbAdaptado(), novos(["c1", 1], ["c2", 2], ["c3", 3], ["c4", 4], ["c5", 5], ["c6", 6])))).toEqual(["c6"]);
  });

  it("não manda de novo pro telefone que JÁ foi contatado na tarefa (nome corrigido no Metabase vira 'novo')", async () => {
    tarefa(1);
    chapa("antigo", 1, "Joao Silva", "(19) 99999-0001");
    fup("antigo", 1);
    chapa("corrigido", 1, "João Silva", "+55 19 99999-0001");
    chapa("outro", 1, "Outro", "(19) 98888-0002");
    expect(ids(await escolherAlvos(dbAdaptado(), novos(["corrigido", 1], ["outro", 1])))).toEqual(["outro"]);
  });

  it("dois novos com o mesmo telefone: só o primeiro", async () => {
    tarefa(1);
    chapa("a", 1, "A", "(19) 99999-0001");
    chapa("b", 1, "B", "(19) 99999-0001");
    expect(ids(await escolherAlvos(dbAdaptado(), novos(["a", 1], ["b", 1])))).toEqual(["a"]);
  });

  it("o mesmo telefone em OUTRA tarefa é outro assunto (entra)", async () => {
    tarefa(1);
    tarefa(2);
    chapa("a", 1, "A", "(19) 99999-0001");
    fup("a", 1);
    chapa("b", 2, "B", "(19) 99999-0001");
    expect(ids(await escolherAlvos(dbAdaptado(), novos(["b", 2])))).toEqual(["b"]);
  });

  it("mantém a ordem do sync e leva a tarefa junto (inclusive cidade pra janela do PréFUP)", async () => {
    tarefa(1);
    chapa("a", 1, "A", "(19) 90000-0001");
    chapa("b", 1, "B", "(19) 90000-0002");
    const alvos = await escolherAlvos(dbAdaptado(), novos(["b", 1], ["a", 1]));
    expect(ids(alvos)).toEqual(["b", "a"]);
    expect(alvos[0].task).toMatchObject({ id_tarefa: 1, empresa: "ACME", cidade_uf: "São Paulo/SP" });
  });
});

describe("reagirAChapasNovos", () => {
  it("recurso desligado: não faz nada (nem consulta)", async () => {
    h.ligado = false;
    tarefa(1);
    chapa("a", 1, "A");
    const iniciar = vi.fn();
    expect(await reagirAChapasNovos(novos(["a", 1]), { db: dbAdaptado(), iniciar })).toBe(0);
    expect(iniciar).not.toHaveBeenCalled();
    expect(h.toast.info).not.toHaveBeenCalled();
  });

  it("ligado: o 1º sai na hora e os demais espaçados; avisa e registra na atividade", async () => {
    vi.useFakeTimers();
    tarefa(1);
    for (const [i, n] of ["a", "b", "c"].entries()) chapa(n, 1, n.toUpperCase(), `(19) 9000-000${i}`);
    const iniciar = vi.fn();
    expect(await reagirAChapasNovos(novos(["a", 1], ["b", 1], ["c", 1]), { db: dbAdaptado(), iniciar })).toBe(3);

    expect(iniciar).toHaveBeenCalledTimes(1);
    expect(iniciar.mock.calls[0][0].chapa.id).toBe("a");
    vi.advanceTimersByTime(INTERVALO_ENTRE_CHAPAS_MS);
    expect(iniciar).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(INTERVALO_ENTRE_CHAPAS_MS);
    expect(iniciar.mock.calls.map((c) => c[0].chapa.id)).toEqual(["a", "b", "c"]);

    expect(h.toast.info).toHaveBeenCalledTimes(1);
    expect(h.logActivity).toHaveBeenCalledTimes(3);
    expect(h.logActivity.mock.calls[0]).toEqual([expect.objectContaining({ tipo: "fup_auto", chapa_nome: "A", id_tarefa: 1 })]);
  });

  describe("carteira do analista (o sync traz as tarefas de todo mundo)", () => {
    const duasEmpresas = () => {
      h.db.prepare("INSERT INTO tarefas VALUES (?,?,?,?,?,?)").run(1, daqui(5), "Transportes Alfa LTDA", "São Paulo/SP", "Aguardando Início", 1);
      h.db.prepare("INSERT INTO tarefas VALUES (?,?,?,?,?,?)").run(2, daqui(5), "Beta Logística S.A.", "São Paulo/SP", "Aguardando Início", 1);
    };
    const monta = () => {
      duasEmpresas();
      chapa("a", 1, "Ana", "(19) 90000-0001");
      chapa("b", 2, "Bia", "(19) 90000-0002");
    };

    it("só dispara pras empresas da carteira dele", async () => {
      monta();
      h.carteira.mockResolvedValue(["Transportes Alfa"]);
      const iniciar = vi.fn();
      expect(await reagirAChapasNovos(novos(["a", 1], ["b", 2]), { db: dbAdaptado(), iniciar })).toBe(1);
      expect(iniciar.mock.calls.map((c) => c[0].chapa.id)).toEqual(["a"]);
    });

    it("nenhuma empresa na carteira dele: nada dispara, sem aviso", async () => {
      monta();
      h.carteira.mockResolvedValue(["Outra Empresa"]);
      const iniciar = vi.fn();
      expect(await reagirAChapasNovos(novos(["a", 1], ["b", 2]), { db: dbAdaptado(), iniciar })).toBe(0);
      expect(iniciar).not.toHaveBeenCalled();
      expect(h.toast.info).not.toHaveBeenCalled();
    });

    it("carteira vazia (analista sem carteira configurada) = sem restrição", async () => {
      monta();
      vi.useFakeTimers();
      const iniciar = vi.fn();
      expect(await reagirAChapasNovos(novos(["a", 1], ["b", 2]), { db: dbAdaptado(), iniciar })).toBe(2);
    });

    it("não consegue ler a carteira: na dúvida não dispara", async () => {
      monta();
      h.carteira.mockRejectedValue(new Error("banco ocupado"));
      const iniciar = vi.fn();
      expect(await reagirAChapasNovos(novos(["a", 1], ["b", 2]), { db: dbAdaptado(), iniciar })).toBe(0);
      expect(iniciar).not.toHaveBeenCalled();
    });

    it("o limite por sync conta só quem passou pela carteira", async () => {
      duasEmpresas();
      const lista: Array<[string, number]> = [];
      for (let i = 0; i < LIMITE_NOVOS_POR_SYNC + 5; i++) {
        chapa("o" + i, 2, "Outro " + i, "(19) 9" + String(i).padStart(4, "0") + "-1111"); // carteira de outro analista
        lista.push(["o" + i, 2]);
      }
      chapa("a", 1, "Ana", "(19) 90000-0001");
      lista.push(["a", 1]);
      h.carteira.mockResolvedValue(["Transportes Alfa"]);
      const iniciar = vi.fn();
      expect(await reagirAChapasNovos(novos(...lista), { db: dbAdaptado(), iniciar })).toBe(1);
      expect(h.toast.warning).not.toHaveBeenCalled();
    });
  });

  it("nenhum qualificado: nada de aviso", async () => {
    tarefa(1);
    chapa("a", 1, "A", "(19) 90000-0001", "confirmado");
    const iniciar = vi.fn();
    expect(await reagirAChapasNovos(novos(["a", 1]), { db: dbAdaptado(), iniciar })).toBe(0);
    expect(h.toast.info).not.toHaveBeenCalled();
  });

  it(`mais de ${LIMITE_NOVOS_POR_SYNC} de uma vez: não dispara, só avisa`, async () => {
    tarefa(1);
    const lista: Array<[string, number]> = [];
    for (let i = 0; i < LIMITE_NOVOS_POR_SYNC + 1; i++) {
      chapa(`c${i}`, 1, `Chapa ${i}`, `(19) 9${String(i).padStart(4, "0")}-0000`);
      lista.push([`c${i}`, 1]);
    }
    const iniciar = vi.fn();
    expect(await reagirAChapasNovos(novos(...lista), { db: dbAdaptado(), iniciar })).toBe(0);
    expect(iniciar).not.toHaveBeenCalled();
    expect(h.toast.warning).toHaveBeenCalledTimes(1);
  });

  it("no limite exato ainda dispara", async () => {
    vi.useFakeTimers();
    tarefa(1);
    const lista: Array<[string, number]> = [];
    for (let i = 0; i < LIMITE_NOVOS_POR_SYNC; i++) {
      chapa(`c${i}`, 1, `Chapa ${i}`, `(19) 9${String(i).padStart(4, "0")}-0000`);
      lista.push([`c${i}`, 1]);
    }
    expect(await reagirAChapasNovos(novos(...lista), { db: dbAdaptado(), iniciar: vi.fn() })).toBe(LIMITE_NOVOS_POR_SYNC);
    expect(h.toast.warning).not.toHaveBeenCalled();
  });

  describe("disparo padrão (fila de disparos)", () => {
    it("agenda o FUP individual do chapa com a conferência de última hora", async () => {
      tarefa(1);
      chapa("a", 1, "Ana");
      await reagirAChapasNovos(novos(["a", 1]), { db: dbAdaptado() });
      expect(h.startChapaJob).toHaveBeenCalledTimes(1);
      const [chapaId, acao, chapaSnap, task, opcoes] = h.startChapaJob.mock.calls[0];
      expect([chapaId, acao]).toEqual(["a", "fup"]);
      expect(chapaSnap).toMatchObject({ id: "a", nome_chapa: "Ana" });
      expect(task).toMatchObject({ id_tarefa: 1, empresa: "ACME" });

      const aindaVale = opcoes.aindaVale as () => Promise<boolean>;
      expect(await aindaVale()).toBe(true);
      h.db.prepare("UPDATE chapas SET status_contato = 'confirmado' WHERE id = 'a'").run(); // o analista confirmou na mão
      expect(await aindaVale()).toBe(false);
      h.db.prepare("UPDATE chapas SET status_contato = 'pendente' WHERE id = 'a'").run();
      fup("a", 1); // ou mandou o FUP na mão
      expect(await aindaVale()).toBe(false);
    });

    it("desiste se a tarefa começou durante a contagem", async () => {
      tarefa(1, daqui(0.01));
      chapa("a", 1, "Ana");
      await reagirAChapasNovos(novos(["a", 1]), { db: dbAdaptado() });
      const aindaVale = h.startChapaJob.mock.calls[0][4].aindaVale as () => Promise<boolean>;
      expect(await aindaVale()).toBe(true);
      vi.useFakeTimers({ now: Date.now() + HORA });
      expect(await aindaVale()).toBe(false);
    });

    it("chapa que já tem disparo em contagem não é agendado de novo", async () => {
      tarefa(1);
      chapa("a", 1, "Ana");
      h.getChapaJobState.mockReturnValue({ status: "countdown", remaining: 30, action: "fup" });
      await reagirAChapasNovos(novos(["a", 1]), { db: dbAdaptado() });
      expect(h.startChapaJob).not.toHaveBeenCalled();
    });
  });
});
