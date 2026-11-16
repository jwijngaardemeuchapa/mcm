import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ sucesso: vi.fn(), erro: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: h.sucesso, error: h.erro } }));

import { OfertaBadge, TarefaInfo } from "./TarefaInfo";

beforeEach(() => {
  h.sucesso.mockClear();
  h.erro.mockClear();
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
});

describe("TarefaInfo — tipo de trabalho, remessa e oferta", () => {
  it("sem nenhuma informação não desenha nada (zero ruído nas tarefas comuns)", () => {
    const { container } = render(<TarefaInfo t={{}} />);
    expect(container.textContent).toBe("");
    const vazio = render(<TarefaInfo t={{ tipo_trabalho: " ", remessa: "", em_oferta: 0 }} />);
    expect(vazio.container.textContent).toBe("");
  });

  it("mostra o tipo, a remessa curta (completa no hover) e a oferta com o nome do chapa", () => {
    render(<TarefaInfo t={{ tipo_trabalho: "Descarga", remessa: "CTE 35260 / container MSKU1234567-8", em_oferta: 1, chapa_em_oferta: "JOÃO SILVA" }} maxRemessa={14} />);
    expect(screen.getByText("Descarga")).toBeTruthy();
    expect(screen.getByText("CTE 35260 / c…")).toBeTruthy();
    expect(screen.getByTitle(/Remessa: CTE 35260 \/ container MSKU1234567-8/)).toBeTruthy();
    expect(screen.getByTitle(/Em oferta para JOÃO SILVA/).textContent).toBe("Em oferta · joão silva");
  });

  it("'Em oferta' vem com ícone e texto (nunca só a cor) e explica no hover que a vaga conta como aberta", () => {
    const { container } = render(<OfertaBadge chapa="Ana" />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(screen.getByTitle(/ainda não aceitou \(a vaga conta como aberta\)/)).toBeTruthy();
  });

  it("variante compacta mostra só 'Em oferta'; sem nome também", () => {
    render(<OfertaBadge chapa="Ana" compacto />);
    expect(screen.getByText("Em oferta")).toBeTruthy();
    const sem = render(<OfertaBadge chapa={null} />);
    expect(sem.container.textContent).toBe("Em oferta");
  });

  it("clicar na remessa copia o texto COMPLETO e não dispara o clique do card", async () => {
    const aoClicarNoCard = vi.fn();
    render(<div onClick={aoClicarNoCard}><TarefaInfo t={{ remessa: "CTE 35260 / container MSKU1234567-8" }} maxRemessa={10} /></div>);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(h.sucesso).toHaveBeenCalledWith("Remessa copiada"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("CTE 35260 / container MSKU1234567-8");
    expect(aoClicarNoCard).not.toHaveBeenCalled();
  });

  it("falha ao copiar: avisa, sem quebrar", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => { throw new Error("negado"); }) } });
    render(<TarefaInfo t={{ remessa: "CTE 1" }} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(h.erro).toHaveBeenCalled());
  });

  it("sobre fundo colorido (cabeçalho do detalhe) usa a variante clara", () => {
    const { container } = render(<TarefaInfo t={{ tipo_trabalho: "Carga", remessa: "R1", em_oferta: 1 }} sobreCor />);
    expect(container.innerHTML).toContain("text-white");
    expect(container.innerHTML).not.toContain("text-warning");
  });
});
