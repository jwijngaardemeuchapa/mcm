import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A tela de verdade, alimentada pelo motor de regras de verdade. Só o que é de fora (banco, fila de disparos,
// desfazer, o hook que lê o banco) é simulado.
const h = vi.hoisted(() => ({
  entrada: { tarefas: [] as unknown[], vivas: [] as unknown[], config: { limiteFupMin: 25, limitePrefupMin: 60 } },
  execute: vi.fn(async () => ({ rowsAffected: 1 })),
  select: vi.fn(async () => [{ status_contato: "pendente", data_remocao: null, motivo_remocao: null }]),
  startChapaJob: vi.fn(),
  abortChapaJob: vi.fn(),
  push: vi.fn(),
  undo: vi.fn(),
  posConfirmacao: vi.fn(),
}));

vi.mock("@/lib/useAlarmeChapas", () => ({ useAlarmeChapas: () => h.entrada }));
vi.mock("@/lib/db", () => ({ getDb: async () => ({ select: h.select, execute: h.execute }) }));
vi.mock("@/lib/dispatchQueue", () => ({ dispatchQueue: { startChapaJob: h.startChapaJob, abortChapaJob: h.abortChapaJob } }));
vi.mock("@/lib/useDispatchJob", () => ({ useChapaJobState: () => null }));
vi.mock("@/lib/undo", () => ({ useUndoActions: () => ({ push: h.push, undo: h.undo }) }));
vi.mock("@/lib/overlayStack", () => ({ useOverlaySlot: () => 0 }));
vi.mock("@/lib/mensagemPosConfirmacao", () => ({ enviarMensagemPosConfirmacao: h.posConfirmacao }));
vi.mock("sonner", () => Object.assign({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

import { PainelDeAlarme } from "./PainelDeAlarme";
import { diagnosticarTudo } from "@/lib/alarmeChapas";
import type { ChapaDoAlarme, TarefaDoAlarme } from "@/lib/alarmeDados";

const AGORA = Date.now();
const MIN = 60_000;

const chapa = (o: Partial<ChapaDoAlarme>): ChapaDoAlarme => ({
  id: "c", nome: "ANA GOMES", telefone: "11999990001", status: "pendente", semRespostaEnviado: false, naoLida: false,
  ultimoDisparo: null, disparos: 0, estrelas: null, faltas: null, chatId: null, ...o,
});
const disparo = (haMin: number) => ({ quando: AGORA - haMin * MIN, tipo: "fup" as const, canal: "umbler_talk" });

function monta(chapas: ChapaDoAlarme[], over: Partial<TarefaDoAlarme> = {}) {
  const t: TarefaDoAlarme = {
    id_tarefa: 7, empresa: "COMERCIAL PEREIRA", data_tarefa: new Date(AGORA + 40 * MIN).toISOString(), cidade_uf: "São Paulo/SP",
    minParaTarefa: 40, solicitados: 5, confirmados: 3, tipoSugerido: "fup", chapas, nomes: ["Ana", "Bia", "Caio"], ...over,
  };
  h.entrada.vivas = [t];
  h.entrada.tarefas = diagnosticarTudo<ChapaDoAlarme, TarefaDoAlarme>([t], AGORA);
}

function LocalAtual() {
  return <span data-testid="local">{useLocation().pathname + useLocation().search}</span>;
}
const renderizar = () => render(<MemoryRouter><PainelDeAlarme /><LocalAtual /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("fup_settings", JSON.stringify({ umblerSettings: { bearerToken: "t", fromPhone: "+5511", organizationId: "o", cancelTemplateId: "x" } }));
  Object.values(h).forEach((v) => typeof v === "function" && "mockClear" in v && (v as ReturnType<typeof vi.fn>).mockClear());
  h.select.mockResolvedValue([{ status_contato: "pendente", data_remocao: null, motivo_remocao: null }]);
});

const trio = () => [
  chapa({ id: "rem", nome: "DIEGO ROCHA", ultimoDisparo: disparo(30), disparos: 1, estrelas: 2, faltas: 2 }), // remover
  chapa({ id: "cob", nome: "BRUNO SOUZA", ultimoDisparo: disparo(16), disparos: 1 }), // cobrar
  chapa({ id: "esp", nome: "CAIO LIMA", ultimoDisparo: disparo(3), disparos: 1 }), // em dia
];

describe("PainelDeAlarme", () => {
  it("o cabeçalho conta quem precisa de você e resume por ação; quem está em dia não entra na conta", () => {
    monta(trio());
    renderizar();
    expect(screen.getByText("2 chapas precisam de você")).toBeTruthy();
    expect(screen.getByText("1 para remover · 1 para cobrar")).toBeTruthy();
    expect(screen.getByText(/Em dia \(1\)/)).toBeTruthy();
  });

  it("mostra a ação recomendada com os porquês, e marca a remoção como recomendada", () => {
    monta(trio());
    renderizar();
    expect(screen.getByText("recomendado")).toBeTruthy();
    expect(screen.getByText(/FUP há 30 min sem resposta/)).toBeTruthy();
    expect(screen.getByText(/limite: 25 min/)).toBeTruthy();
    expect(screen.getByText(/2 faltas em 15 dias/)).toBeTruthy();
    expect(screen.getByText("Ligar ou chamar no WhatsApp")).toBeTruthy();
  });

  it("'Remover e repor' remove a chapa, oferece desfazer e abre o BID na tarefa", async () => {
    monta(trio());
    renderizar();
    fireEvent.click(screen.getByRole("button", { name: "Remover e repor" }));
    await waitFor(() => expect(screen.getByTestId("local").textContent).toBe("/bid?taskId=7"));
    expect(h.execute).toHaveBeenCalledWith(expect.stringContaining("status_contato = 'removido'"), [expect.any(String), "rem"]);
    expect(h.push).toHaveBeenCalledWith(expect.objectContaining({ label: "remoção de DIEGO ROCHA" }));
  });

  it("'Só remover' remove sem sair da tela", async () => {
    monta(trio());
    renderizar();
    fireEvent.click(screen.getByText("Só remover"));
    await waitFor(() => expect(h.execute).toHaveBeenCalled());
    expect(screen.getByTestId("local").textContent).toBe("/");
  });

  it("'Já confirmou' marca como confirmado (conta como FUP)", async () => {
    monta(trio());
    renderizar();
    fireEvent.click(screen.getAllByText("Já confirmou")[0]);
    await waitFor(() => expect(h.execute).toHaveBeenCalledWith(expect.stringContaining("status_contato = 'confirmado'"), expect.any(Array)));
    expect(h.posConfirmacao).toHaveBeenCalled();
  });

  it("quem pede cobrança ganha o link do WhatsApp e o reenvio do FUP (com os 60 s da fila de disparos)", () => {
    monta(trio());
    renderizar();
    const link = screen.getByText("WhatsApp").closest("a")!;
    expect(link.getAttribute("href")).toBe("https://wa.me/5511999990001");
    fireEvent.click(screen.getByText("Reenviar FUP"));
    expect(h.startChapaJob).toHaveBeenCalledWith(
      "cob", "fup",
      expect.objectContaining({ id: "cob", nome_chapa: "BRUNO SOUZA" }),
      expect.objectContaining({ id_tarefa: 7, empresa: "COMERCIAL PEREIRA" }),
    );
  });

  it("'Avisar sem resposta' usa o template de cancelamento (60 s) e só aparece quando o aviso já não foi enviado", () => {
    monta([chapa({ id: "rem", ultimoDisparo: disparo(30), disparos: 1 }), chapa({ id: "ja", nome: "JÁ AVISADA", semRespostaEnviado: true, ultimoDisparo: disparo(30), disparos: 1 })]);
    renderizar();
    expect(screen.getAllByText("Avisar sem resposta")).toHaveLength(1);
    fireEvent.click(screen.getByText("Avisar sem resposta"));
    expect(h.startChapaJob).toHaveBeenCalledWith("rem", "cancel", expect.anything(), expect.anything());
  });

  it("resposta não lida: 'Ler a resposta' e nenhum botão de remover", () => {
    monta([chapa({ id: "n", naoLida: true, chatId: "chat-9", ultimoDisparo: disparo(90), disparos: 1 })]);
    renderizar();
    expect(screen.getByText("Ler a resposta", { selector: "div" })).toBeTruthy(); // o rótulo da recomendação (a ajuda também cita)
    expect(screen.queryByRole("button", { name: "Remover e repor" })).toBeNull();
    expect(screen.getByText("Abrir conversa").closest("a")!.getAttribute("href")).toBe("https://app-utalk.umbler.com/chats/chat-9");
  });

  it("'Como o alarme decide?' abre na 1ª vez com os prazos configurados e lembra que foi visto", () => {
    monta(trio());
    h.entrada.config = { limiteFupMin: 20, limitePrefupMin: 90 };
    renderizar();
    expect(screen.getByText(/20 min sem resposta ao FUP, 1 h 30 min ao PréFUP/)).toBeTruthy();
    fireEvent.click(screen.getByText("Como o alarme decide?"));
    expect(localStorage.getItem("alarme_ajuda_vista")).toBe("1");
    expect(screen.queryByText(/20 min sem resposta ao FUP/)).toBeNull();
    h.entrada.config = { limiteFupMin: 25, limitePrefupMin: 60 };
  });

  it("segunda vez a ajuda vem fechada", () => {
    localStorage.setItem("alarme_ajuda_vista", "1");
    monta(trio());
    renderizar();
    expect(screen.queryByText(/sem resposta ao FUP, 1 h ao PréFUP/)).toBeNull();
  });

  it("tarefa já completa: a chapa que sobra não aparece como alarme e o painel some", () => {
    monta([chapa({ ultimoDisparo: disparo(90), disparos: 1 })], { confirmados: 5 });
    const { container } = renderizar();
    expect(container.querySelector("[role=alert]")).toBeNull();
  });

  it("sem nada a fazer e sem portaria, não aparece", () => {
    monta([chapa({ ultimoDisparo: disparo(3), disparos: 1 })]);
    const { container } = renderizar();
    expect(container.querySelector("[role=alert]")).toBeNull();
  });

  it("desligado nas configurações, não aparece", () => {
    localStorage.setItem("fup_settings", JSON.stringify({ approachingAlertEnabled: false }));
    monta(trio());
    const { container } = renderizar();
    expect(container.querySelector("[role=alert]")).toBeNull();
  });

  it("'Abrir tarefa' fora do Dashboard navega com ?flash", () => {
    monta([chapa({ id: "t", telefone: null })], { minParaTarefa: 60 });
    renderizar();
    fireEvent.click(screen.getByText("Abrir tarefa"));
    expect(screen.getByTestId("local").textContent).toBe("/dashboard?flash=7");
  });

  it("'Abrir tarefa' dentro do Dashboard só destaca o card (evento), sem navegar", () => {
    window.history.pushState({}, "", "/dashboard");
    const ouvinte = vi.fn();
    window.addEventListener("fup:flash-task", ouvinte);
    try {
      monta([chapa({ id: "t", telefone: null })], { minParaTarefa: 60 });
      renderizar();
      fireEvent.click(screen.getByText("Abrir tarefa"));
      expect(ouvinte).toHaveBeenCalledTimes(1);
      expect((ouvinte.mock.calls[0][0] as CustomEvent).detail).toBe(7);
      expect(screen.getByTestId("local").textContent).toBe("/");
    } finally {
      window.removeEventListener("fup:flash-task", ouvinte);
      window.history.pushState({}, "", "/");
    }
  });
});
