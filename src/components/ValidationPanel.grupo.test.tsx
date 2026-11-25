import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Card de GRUPO: "validação recebida" e "subido no Meu Chapa" valem pra todas as tarefas do grupo
// (a validação é por tarefa, no banco). Quem já subiu não volta atrás, e o desfazer restaura cada uma.

const h = vi.hoisted(() => ({
  execs: [] as Array<{ sql: string; params: unknown[] }>,
  push: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/db", () => ({
  getDb: async () => ({
    select: async () => [],
    execute: async (sql: string, params: unknown[] = []) => {
      h.execs.push({ sql, params });
      return { rowsAffected: 1 };
    },
  }),
  placeholders: (n: number) => Array(n).fill("?").join(","),
  errMsg: (e: unknown) => String(e),
}));
vi.mock("@/lib/fasesConfirmacao", () => ({ confirmarManualEmLote: vi.fn(async () => {}) }));
vi.mock("@/lib/undo", () => ({ useUndoActions: () => ({ push: h.push }) }));

import { ValidationPanel } from "./ValidationPanel";

const chapas = [
  { id: "c1", nome_chapa: "Ana", status_contato: "confirmado", validacao_presenca: "presente" },
  { id: "c2", nome_chapa: "Bia", status_contato: "confirmado", validacao_presenca: "presente" },
  { id: "c3", nome_chapa: "Caio", status_contato: "confirmado", validacao_presenca: "presente" },
];
const membros = [
  { id_tarefa: 100, validacao_status: "validacao_recebida", data_validacao_recebida: "2026-11-25T10:00:00Z", data_upload_meu_chapa: null, obs_validacao: null },
  { id_tarefa: 101, validacao_status: "subido_meu_chapa", data_validacao_recebida: "2026-11-25T09:00:00Z", data_upload_meu_chapa: "2026-11-25T11:00:00Z", obs_validacao: "ok" },
  { id_tarefa: 102, validacao_status: "validacao_recebida", data_validacao_recebida: "2026-11-25T10:30:00Z", data_upload_meu_chapa: null, obs_validacao: null },
];

function abrirEConfirmarUpload(extra: Partial<React.ComponentProps<typeof ValidationPanel>> = {}) {
  render(
    <ValidationPanel
      id_tarefa={100}
      chapas={chapas}
      validacao_status="validacao_recebida"
      data_validacao_recebida="2026-11-25T10:00:00Z"
      data_upload_meu_chapa={null}
      obs_validacao={null}
      onRefresh={() => {}}
      {...extra}
    />,
  );
  fireEvent.click(screen.getByText(/Validações/));
  fireEvent.click(screen.getByText(/Marcar como subido no Meu Chapa/));
  fireEvent.click(screen.getByText("Confirmar upload"));
}

const updates = () => h.execs.filter((e) => e.sql.startsWith("UPDATE tarefas"));

beforeEach(() => {
  h.execs.length = 0;
  h.push.mockClear();
});

describe("ValidationPanel — card de grupo", () => {
  it("subir no Meu Chapa marca TODAS as tarefas do grupo, menos as que já tinham subido", async () => {
    abrirEConfirmarUpload({ membros });
    await waitFor(() => expect(updates()).toHaveLength(2));
    expect(updates().map((u) => u.params[2])).toEqual([100, 102]); // a 101 já estava 'subido'
    expect(updates().every((u) => u.sql.includes("subido_meu_chapa"))).toBe(true);
  });

  it("desfazer restaura o estado anterior de cada tarefa", async () => {
    abrirEConfirmarUpload({ membros });
    await waitFor(() => expect(h.push).toHaveBeenCalled());
    h.execs.length = 0;
    await h.push.mock.calls[0][0].revert();
    expect(updates().map((u) => [u.params[3], u.params[0]])).toEqual([[100, "validacao_recebida"], [102, "validacao_recebida"]]);
  });

  it("tarefa única (sem grupo): grava só nela, como sempre", async () => {
    abrirEConfirmarUpload();
    await waitFor(() => expect(updates()).toHaveLength(1));
    expect(updates()[0].params[2]).toBe(100);
  });

  it("'validação recebida' num grupo também vale pra todas as tarefas que ainda não subiram", async () => {
    const pendentes = [
      { ...membros[0], validacao_status: "pendente", data_validacao_recebida: null },
      { ...membros[2], validacao_status: "pendente", data_validacao_recebida: null },
    ];
    render(
      <ValidationPanel
        id_tarefa={100}
        membros={pendentes}
        chapas={chapas}
        validacao_status="pendente"
        data_validacao_recebida={null}
        data_upload_meu_chapa={null}
        obs_validacao={null}
        onRefresh={() => {}}
      />,
    );
    fireEvent.click(screen.getByText(/Validações/));
    fireEvent.click(screen.getByText(/Marcar validação recebida do cliente/));
    await waitFor(() => expect(updates()).toHaveLength(2));
    expect(updates().map((u) => u.params[1])).toEqual([100, 102]);
    expect(updates().every((u) => u.sql.includes("validacao_recebida"))).toBe(true);
  });
});
