// Linha "ID da tarefa + nome + telefone" pra copiar: `#475543 | João Silva | 11999990000`.
// Mesmo formato do botão por-chapa que já existia no TaskCard (ícone de
// prancheta) — agora compartilhado pelas listas e pelos menus por chapa, pra
// ninguém montar essa string à mão. Telefone só com dígitos.
export function linhaIdNomeTelefone(
  idTarefa: number,
  nome: string | null | undefined,
  telefone: string | null | undefined,
): string {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  return `#${idTarefa} | ${nome ?? ""} | ${digitos || "sem telefone"}`;
}
