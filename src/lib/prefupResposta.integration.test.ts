import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";

// SQLite de verdade + o pipeline real (poll do chat → processFirestoreMessage → canalConfirmacao →
// mensagem automática). Só a Umbler, o localStorage de configurações e a Central são simulados.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

const h = vi.hoisted(() => ({
  db: null as unknown as InstanceType<typeof DatabaseSync>,
  mensagens: new Map<string, Array<{ source: string; content: string | null; eventAtUTC: string; id: string; messageType: string }>>(),
  gatilhos: { prefup: true, fup: true, manual: false },
  uuid: 0,
}));
const sendUmblerFreeText = vi.hoisted(() => vi.fn(async () => {}));
const fetchUmblerRecentMessages = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("./db", () => ({
  getDb: async () => ({
    select: async (sql: string, params: unknown[] = []) => h.db.prepare(sql).all(...(params as never[])),
    execute: async (sql: string, params: unknown[] = []) => {
      const r = h.db.prepare(sql).run(...(params as never[]));
      return { rowsAffected: Number(r.changes) };
    },
  }),
  uuid: () => `u${++h.uuid}`,
}));
vi.mock("./central", () => ({ pushChapaStatusToCentral: vi.fn(), pushRespostaToCentral: vi.fn() }));
vi.mock("./settings", () => ({
  readSettings: () => ({
    umblerSettings: { bearerToken: "t", organizationId: "o" },
    mensagemPosConfirmacao: {
      ativo: true,
      gatilhos: h.gatilhos,
      mensagens: [{ id: "m1", nome: "Orientações", texto: "ORIENTAÇÕES", empresas: [] }],
      mensagemAtivaId: "m1",
    },
  }),
}));
vi.mock("./umbler", () => ({ fetchUmblerRecentMessages, sendUmblerFreeText }));

import { canalConfirmacao } from "./prefup";
import { pollOnce } from "./useTemplateReplyPoll";

const MIN = 60_000;
const agora = () => Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const tarefaIso = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 19) + "-03:00";

function criarBanco() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE tarefas (id_tarefa INTEGER PRIMARY KEY, data_tarefa TEXT, cidade_uf TEXT, empresa TEXT, ativo INTEGER);
    CREATE TABLE chapas (id TEXT PRIMARY KEY, id_tarefa INTEGER, nome_chapa TEXT, telefone_chapa TEXT, cpf TEXT,
      status_contato TEXT, data_contato TEXT, canal_contato TEXT, confirmado_via TEXT);
    CREATE TABLE fup_log (id TEXT PRIMARY KEY, id_tarefa INTEGER, canal TEXT, data_disparo TEXT, observacao TEXT,
      chapa_id TEXT, umbler_chat_id TEXT, aguarda_resposta_chat INTEGER DEFAULT 0);
    CREATE TABLE bid_disparos (id TEXT PRIMARY KEY, chapa_nome TEXT, chapa_telefone TEXT, id_tarefa INTEGER, empresa TEXT,
      data_tarefa TEXT, status TEXT, data_disparo TEXT, umbler_chat_id TEXT, data_resposta1 TEXT, data_resposta2 TEXT, motivo_nao TEXT);
    CREATE TABLE resposta_log (id TEXT PRIMARY KEY, tipo TEXT, chapa_nome TEXT, chapa_telefone TEXT, resposta TEXT, id_tarefa INTEGER,
      empresa TEXT, data_tarefa TEXT, disparo_id TEXT, fonte TEXT, message_body TEXT, received_at TEXT);
    CREATE TABLE captacao_log (id TEXT PRIMARY KEY, nome TEXT, telefone TEXT, resposta TEXT, data_resposta TEXT, data_disparo TEXT);
  `);
  return db;
}

type Seed = { tarefa: number; chapa: string; nome?: string; tel?: string; chat: string; disparoEm: number; prefup?: boolean; diasAteTarefa?: number; empresa?: string };
function semear(s: Seed) {
  const tel = s.tel ?? "5511999990001";
  const dias = s.diasAteTarefa ?? 1;
  const existe = h.db.prepare("SELECT 1 FROM tarefas WHERE id_tarefa = ?").get(s.tarefa);
  if (!existe) {
    h.db.prepare("INSERT INTO tarefas VALUES (?,?,?,?,1)").run(s.tarefa, tarefaIso(agora() + dias * 86_400_000), "São Paulo/SP", s.empresa ?? "ACME");
  }
  h.db
    .prepare("INSERT INTO chapas VALUES (?,?,?,?,?,?,?,?,NULL)")
    .run(s.chapa, s.tarefa, s.nome ?? "Maria", tel, null, "pendente", iso(s.disparoEm), "umbler_talk");
  h.db
    .prepare("INSERT INTO fup_log VALUES (?,?,?,?,?,?,?,?)")
    .run(`f-${s.chapa}`, s.tarefa, "umbler_talk", iso(s.disparoEm), "Disparado via API", s.chapa, s.chat, s.prefup === false ? 0 : 1);
}
const fala = (quando: number, texto: string, source = "Contact") => ({
  id: `m${quando}`, source, content: texto, eventAtUTC: iso(quando), messageType: "Text",
});
const chat = (id: string, ...msgs: ReturnType<typeof fala>[]) => h.mensagens.set(id, msgs);
const statusDe = (chapa: string) =>
  h.db.prepare("SELECT status_contato AS s, confirmado_via AS v FROM chapas WHERE id = ?").get(chapa) as { s: string; v: string | null };
const esperarFireAndForget = () => new Promise((r) => setTimeout(r, 40));

beforeEach(() => {
  h.db = criarBanco();
  h.mensagens.clear();
  h.gatilhos = { prefup: true, fup: true, manual: false };
  h.uuid = 0;
  localStorage.clear();
  sendUmblerFreeText.mockClear();
  fetchUmblerRecentMessages.mockReset();
  fetchUmblerRecentMessages.mockImplementation(async ({ chatId }: { chatId: string }) => [...(h.mensagens.get(chatId) ?? [])]);
});

describe("poll de resposta ao PréFUP — só vale a resposta DEPOIS do disparo", () => {
  it("um 'sim' de antes do PréFUP (outro momento) NÃO confirma o chapa nem manda mensagem", async () => {
    const D = agora() - 10 * MIN;
    semear({ tarefa: 1, chapa: "c1", chat: "A", disparoEm: D });
    chat("A", fala(D - 3 * 3_600_000, "SIM")); // "sim" de 3 h ANTES (ex.: resposta a outro BID/FUP)
    await pollOnce();
    await esperarFireAndForget();
    expect(statusDe("c1").s).toBe("pendente");
    expect(sendUmblerFreeText).not.toHaveBeenCalled();
  });

  it("o 'sim' que veio depois do PréFUP confirma como PréFUP e manda a mensagem (gatilho PréFUP ligado)", async () => {
    const D = agora() - 10 * MIN;
    semear({ tarefa: 1, chapa: "c1", chat: "A", disparoEm: D });
    chat("A", fala(D - 3 * 3_600_000, "SIM"), fala(D + 2 * MIN, "SIM"));
    await pollOnce();
    await esperarFireAndForget();
    expect(statusDe("c1")).toEqual({ s: "confirmado", v: "prefup" });
    expect(sendUmblerFreeText).toHaveBeenCalledTimes(1);
  });

  it("só o gatilho FUP ligado: confirma o PréFUP mas NÃO manda a mensagem", async () => {
    h.gatilhos = { prefup: false, fup: true, manual: false };
    const D = agora() - 10 * MIN;
    semear({ tarefa: 1, chapa: "c1", chat: "A", disparoEm: D });
    chat("A", fala(D + 2 * MIN, "SIM"));
    await pollOnce();
    await esperarFireAndForget();
    expect(statusDe("c1")).toEqual({ s: "confirmado", v: "prefup" });
    expect(sendUmblerFreeText).not.toHaveBeenCalled();
  });

  it("vale a última fala depois do disparo: 'sim' antigo + 'não' novo = cancelado", async () => {
    const D = agora() - 10 * MIN;
    semear({ tarefa: 1, chapa: "c1", chat: "A", disparoEm: D });
    chat("A", fala(D - 5 * 3_600_000, "SIM"), fala(D + 3 * MIN, "NÃO"));
    await pollOnce();
    expect(statusDe("c1").s).toBe("cancelado");
  });

  it("fala do próprio atendente depois do disparo não conta como resposta do chapa", async () => {
    const D = agora() - 10 * MIN;
    semear({ tarefa: 1, chapa: "c1", chat: "A", disparoEm: D });
    chat("A", fala(D + 1 * MIN, "SIM", "Member"));
    await pollOnce();
    expect(statusDe("c1").s).toBe("pendente");
  });

  it("depois de um disparo seguinte no MESMO chat (outra tarefa), o 'sim' é da outra tarefa — não confirma esta", async () => {
    const D1 = agora() - 60 * MIN;
    const D2 = agora() - 30 * MIN;
    semear({ tarefa: 1, chapa: "c1", chat: "A", disparoEm: D1 });
    semear({ tarefa: 2, chapa: "c2", chat: "A", disparoEm: D2 }); // mesmo chapa/telefone, outra tarefa
    chat("A", fala(D2 + 5 * MIN, "SIM")); // respondeu ao PréFUP da tarefa 2
    await pollOnce();
    expect(statusDe("c2")).toEqual({ s: "confirmado", v: "prefup" });
    expect(statusDe("c1").s).toBe("pendente"); // antes: o mesmo "sim" confirmava as duas, uma por ciclo
  });

  it("o 'sim' entre os dois disparos pertence ao primeiro", async () => {
    const D1 = agora() - 60 * MIN;
    const D2 = agora() - 30 * MIN;
    semear({ tarefa: 1, chapa: "c1", chat: "A", disparoEm: D1 });
    semear({ tarefa: 2, chapa: "c2", chat: "A", disparoEm: D2 });
    chat("A", fala(D1 + 10 * MIN, "SIM"));
    await pollOnce();
    expect(statusDe("c1")).toEqual({ s: "confirmado", v: "prefup" });
    expect(statusDe("c2").s).toBe("pendente");
  });

  it("um BID disparado depois no mesmo chat também separa as respostas", async () => {
    const D = agora() - 60 * MIN;
    semear({ tarefa: 1, chapa: "c1", chat: "A", disparoEm: D });
    h.db.prepare("INSERT INTO bid_disparos (id,chapa_nome,chapa_telefone,id_tarefa,empresa,data_tarefa,status,data_disparo,umbler_chat_id) VALUES (?,?,?,?,?,?,?,?,?)")
      .run("b1", "Maria", "5511999990001", 9, "OUTRA", tarefaIso(agora() + 86_400_000), "aguardando", iso(D + 20 * MIN), "A");
    chat("A", fala(D + 30 * MIN, "SIM")); // resposta ao BID, não ao PréFUP
    await pollOnce();
    expect(statusDe("c1").s).toBe("pendente");
  });

  it("chapa de tarefa antiga (semanas atrás) nunca confirmada não é mais consultada", async () => {
    const D = agora() - 20 * 86_400_000;
    semear({ tarefa: 1, chapa: "velho", chat: "A", disparoEm: D, diasAteTarefa: -20 });
    chat("A", fala(agora() - 5 * MIN, "SIM")); // "sim" recente de outra coisa
    await pollOnce();
    expect(fetchUmblerRecentMessages).not.toHaveBeenCalled();
    expect(statusDe("velho").s).toBe("pendente");
  });

  it("se o último disparo do chapa foi um FUP normal (não PréFUP), o poll do chat não mexe nele", async () => {
    const D = agora() - 60 * MIN;
    semear({ tarefa: 1, chapa: "c1", chat: "A", disparoEm: D });
    h.db.prepare("INSERT INTO fup_log VALUES (?,?,?,?,?,?,?,?)").run("fup2", 1, "umbler_talk", iso(D + 30 * MIN), "Disparado via API", "c1", "A", 0);
    chat("A", fala(D + 10 * MIN, "SIM"));
    await pollOnce();
    expect(fetchUmblerRecentMessages).not.toHaveBeenCalled();
    expect(statusDe("c1").s).toBe("pendente");
  });

  it("resposta de um chapa não confirma outro chapa do mesmo telefone em tarefa mais recente", async () => {
    const D1 = agora() - 60 * MIN;
    semear({ tarefa: 1, chapa: "c1", chat: "A", disparoEm: D1 });
    // outra tarefa, mesmo telefone, contato mais recente, mas SEM PréFUP pendente (canal já tratado)
    h.db.prepare("INSERT INTO tarefas VALUES (?,?,?,?,1)").run(2, tarefaIso(agora() + 2 * 86_400_000), "São Paulo/SP", "BETA");
    h.db.prepare("INSERT INTO chapas VALUES (?,?,?,?,?,?,?,?,NULL)").run("c2", 2, "Maria", "5511999990001", null, "pendente", iso(agora()), "umbler_talk");
    chat("A", fala(D1 + 5 * MIN, "SIM"));
    await pollOnce();
    expect(statusDe("c1").s).toBe("confirmado");
    expect(statusDe("c2").s).toBe("pendente"); // antes: o "chapa mais recente do telefone" (c2) levava a confirmação
  });
});

describe("canalConfirmacao — PréFUP em massa não vira 'fup'", () => {
  it("linha-resumo da tarefa com a MESMA data da linha do chapa: vale a do chapa (PréFUP)", async () => {
    const quando = iso(agora() - 5 * MIN);
    h.db.prepare("INSERT INTO fup_log (id,id_tarefa,canal,data_disparo,observacao) VALUES (?,?,?,?,?)").run("resumo", 7, "umbler_talk", quando, "FUP em massa — 3 enviado(s)");
    h.db.prepare("INSERT INTO fup_log VALUES (?,?,?,?,?,?,?,?)").run("f1", 7, "umbler_talk", quando, "Disparado via API (massa)", "chapa-1", "chat", 1);
    expect(await canalConfirmacao(7, "chapa-1")).toBe("prefup");
  });

  it("FUP normal (flag 0) segue 'fup'; depois de um PréFUP, o disparo mais novo do chapa manda", async () => {
    h.db.prepare("INSERT INTO fup_log VALUES (?,?,?,?,?,?,?,?)").run("a", 7, "umbler_talk", iso(agora() - 3 * 3_600_000), "x", "chapa-1", "chat", 1);
    expect(await canalConfirmacao(7, "chapa-1")).toBe("prefup");
    h.db.prepare("INSERT INTO fup_log VALUES (?,?,?,?,?,?,?,?)").run("b", 7, "umbler_talk", iso(agora() - 1 * 3_600_000), "x", "chapa-1", "chat", 0);
    expect(await canalConfirmacao(7, "chapa-1")).toBe("fup");
  });

  it("sem disparo próprio usa o registro geral da tarefa; sem nenhum, null", async () => {
    expect(await canalConfirmacao(8, "chapa-x")).toBeNull();
    h.db.prepare("INSERT INTO fup_log (id,id_tarefa,canal,data_disparo,observacao,aguarda_resposta_chat) VALUES (?,?,?,?,?,?)").run("g", 8, "whatsapp_web", iso(agora()), "manual", 0);
    expect(await canalConfirmacao(8, "chapa-x")).toBe("fup");
  });

  it("o PréFUP em massa confirmado pelo Firestore/notificação também respeita o gatilho: só FUP ligado → sem mensagem", async () => {
    // (mesmo cálculo de origem que o caminho do bot/notificação usa)
    const quando = iso(agora() - 5 * MIN);
    h.db.prepare("INSERT INTO fup_log (id,id_tarefa,canal,data_disparo,observacao) VALUES (?,?,?,?,?)").run("resumo", 7, "umbler_talk", quando, "FUP em massa");
    h.db.prepare("INSERT INTO fup_log VALUES (?,?,?,?,?,?,?,?)").run("f1", 7, "umbler_talk", quando, "x", "chapa-1", "chat", 1);
    const origem = (await canalConfirmacao(7, "chapa-1")) === "prefup" ? "prefup" : "fup";
    const { mensagemParaEnviar } = await import("./mensagemPosConfirmacao");
    const cfg = { ativo: true, gatilhos: { prefup: false, fup: true, manual: false }, mensagens: [{ id: "m1", nome: "x", texto: "T", empresas: [] }], mensagemAtivaId: "m1" };
    expect(mensagemParaEnviar(cfg, origem, "ACME")).toBeNull();
  });
});
