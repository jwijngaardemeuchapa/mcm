import { useEffect, useState } from "react";
import { getDb } from "@/lib/db";
import { normalizeCompany } from "@/lib/company";

export type ClienteInfo = {
  id: string;
  nome: string;
  status_cliente: string;
  particularidades: string | null;
  exigencias: string | null;
  pedidos: string | null;
  observacoes: string | null;
  contato_nome: string | null;
  segmento: string | null;
  telefone: string | null;
  umbler_group_chat_id: string | null;
};

// Cruza task.empresa com cliente_book por nome normalizado (fuzzy — contains
// nos dois sentidos). Extraído do TaskCard.tsx pra reusar no painel de
// tarefa (MCM-137) sem duplicar a query.
export function useClienteInfo(empresa: string): [ClienteInfo | null, () => void] {
  const [clienteInfo, setClienteInfo] = useState<ClienteInfo | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    getDb()
      .then((db) =>
        db.select<ClienteInfo[]>(
          "SELECT id, nome, status_cliente, particularidades, exigencias, pedidos, observacoes, contato_nome, segmento, telefone, umbler_group_chat_id FROM cliente_book",
        ),
      )
      .then((rows) => {
        const e = normalizeCompany(empresa);
        const match = rows.find((r) => {
          const n = normalizeCompany(r.nome);
          return e && n && (e === n || e.includes(n) || n.includes(e));
        });
        setClienteInfo(match ?? null);
      })
      .catch(() => {});
  }, [empresa, reloadKey]);

  return [clienteInfo, () => setReloadKey((k) => k + 1)];
}
