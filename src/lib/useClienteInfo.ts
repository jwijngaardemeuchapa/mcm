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

type ClienteNormalizado = { info: ClienteInfo; nome: string };

// Antes cada TaskCard (e cada painel de tarefa) rodava seu próprio SELECT da
// tabela cliente_book inteira — com 150+ cards na tela eram 150+ consultas
// iguais a cada montagem, mais a normalização de todos os nomes em cada uma.
// Agora há UMA consulta compartilhada (as que chegam juntas esperam a mesma),
// guardada por TTL_MS; quem edita cliente_book chama invalidarClienteBook().
const TTL_MS = 30_000;
let guardado: { lista: ClienteNormalizado[]; em: number } | null = null;
let emVoo: Promise<ClienteNormalizado[]> | null = null;

export function invalidarClienteBook(): void {
  guardado = null;
}

export async function carregarClientes(): Promise<ClienteNormalizado[]> {
  if (guardado && Date.now() - guardado.em < TTL_MS) return guardado.lista;
  if (emVoo) return emVoo;
  const busca = (async () => {
    const db = await getDb();
    const rows = await db.select<ClienteInfo[]>(
      "SELECT id, nome, status_cliente, particularidades, exigencias, pedidos, observacoes, contato_nome, segmento, telefone, umbler_group_chat_id FROM cliente_book",
    );
    const lista = rows.map((info) => ({ info, nome: normalizeCompany(info.nome) }));
    guardado = { lista, em: Date.now() };
    return lista;
  })();
  emVoo = busca;
  const limpa = () => { if (emVoo === busca) emVoo = null; };
  busca.then(limpa, limpa);
  return busca;
}

// Cruza task.empresa com cliente_book por nome normalizado (fuzzy — contains
// nos dois sentidos).
export function acharCliente(lista: ClienteNormalizado[], empresa: string): ClienteInfo | null {
  const e = normalizeCompany(empresa);
  if (!e) return null;
  const achado = lista.find(({ nome: n }) => n && (e === n || e.includes(n) || n.includes(e)));
  return achado?.info ?? null;
}

// Extraído do TaskCard.tsx pra reusar no painel de tarefa (MCM-137) sem
// duplicar a query.
export function useClienteInfo(empresa: string): [ClienteInfo | null, () => void] {
  const [clienteInfo, setClienteInfo] = useState<ClienteInfo | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let vivo = true;
    carregarClientes()
      .then((lista) => {
        if (!vivo) return;
        const achado = acharCliente(lista, empresa);
        // mesmo cliente de antes → não re-renderiza o card à toa
        setClienteInfo((atual) => (atual && achado && JSON.stringify(atual) === JSON.stringify(achado) ? atual : achado));
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [empresa, reloadKey]);

  return [clienteInfo, () => { invalidarClienteBook(); setReloadKey((k) => k + 1); }];
}
