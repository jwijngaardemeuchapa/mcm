import { useEffect, useMemo, useState } from "react";
import { X, Users, Copy, ExternalLink, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversationPane } from "@/components/ConversationPane";
import { useClienteInfo } from "@/lib/useClienteInfo";
import { useUndo } from "@/lib/undo";
import { getDb, errMsg } from "@/lib/db";
import { readSettings } from "@/lib/settings";
import { fmtTime } from "@/lib/datetime";
import { toast } from "sonner";
import { type TaskWithChapas } from "@/components/TaskCard";

const WIDTH_KEY = "task_detail_panel_width";
const MIN_WIDTH = 480;
const MAX_WIDTH = 1100;
const DEFAULT_WIDTH = 760;

async function clipboardWrite(text: string, successMsg: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMsg);
  } catch {
    toast.error("Não foi possível copiar");
  }
}

const STATUS_LABEL: Record<string, string> = {
  confirmado: "Confirmado",
  pendente: "Pendente",
  nao_respondeu: "Não respondeu",
  cancelado: "Negou FUP",
  removido: "Removido",
};

type TaskDetailPanelProps = {
  task: TaskWithChapas | null;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
};

const CLIENTE_KEY = "__cliente__";

// Painel de tarefa — lista de chapas + grupo do cliente à esquerda, conversa
// da pessoa selecionada à direita. Substitui o TaskFullScreenView (tela
// cheia) por um painel lateral fixo, redimensionável, não-modal (o resto do
// dashboard continua clicável) — desenho pedido pelo usuário (MCM-137).
export function TaskDetailPanel({ task, open, onClose, onRefresh }: TaskDetailPanelProps) {
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(WIDTH_KEY));
      return saved >= MIN_WIDTH && saved <= MAX_WIDTH ? saved : DEFAULT_WIDTH;
    } catch { return DEFAULT_WIDTH; }
  });
  const [resizing, setResizing] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { push } = useUndo();
  const umblerSettings = readSettings().umblerSettings;
  const [clienteInfo, reloadClienteInfo] = useClienteInfo(task?.empresa ?? "");

  useEffect(() => {
    if (!open) { setSelectedKey(null); return; }
    // Ao abrir, seleciona automaticamente o primeiro chapa com conversa —
    // senão o grupo do cliente, senão nada (fica vazio até o operador clicar).
    if (!task) return;
    const firstWithChat = task.chapas.find((c) =>
      task.fup_log.some((f) => f.chapa_id === c.id && f.umbler_chat_id),
    );
    if (firstWithChat) setSelectedKey(firstWithChat.id);
    else if (clienteInfo?.umbler_group_chat_id) setSelectedKey(CLIENTE_KEY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id_tarefa]);

  useEffect(() => {
    if (!resizing) return;
    function onMove(e: MouseEvent) {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
      setWidth(next);
    }
    function onUp() {
      setResizing(false);
      try { localStorage.setItem(WIDTH_KEY, String(width)); } catch { /* noop */ }
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing]);

  const chatEntryByChapa = useMemo(() => {
    if (!task) return new Map<string, { umbler_chat_id: string | null; data_disparo: string }>();
    const map = new Map<string, { umbler_chat_id: string | null; data_disparo: string }>();
    for (const f of task.fup_log) {
      if (!f.chapa_id || !f.umbler_chat_id) continue;
      const cur = map.get(f.chapa_id);
      if (!cur || f.data_disparo > cur.data_disparo) {
        map.set(f.chapa_id, { umbler_chat_id: f.umbler_chat_id, data_disparo: f.data_disparo });
      }
    }
    return map;
  }, [task]);

  if (!task) return null;

  const realChapas = task.chapas.filter((c) => c.nome_chapa);
  const confirmedCount = task.chapas.filter((c) => c.status_contato === "confirmado").length;
  const requested = task.quantidade_chapas || task.chapas.length;
  const fillPct = requested > 0 ? Math.round((confirmedCount / requested) * 100) : 0;

  const selectedChapa = selectedKey && selectedKey !== CLIENTE_KEY
    ? realChapas.find((c) => c.id === selectedKey) ?? null
    : null;
  const selectedChatId = selectedKey === CLIENTE_KEY
    ? clienteInfo?.umbler_group_chat_id ?? null
    : selectedChapa
    ? chatEntryByChapa.get(selectedChapa.id)?.umbler_chat_id ?? null
    : null;
  const selectedName = selectedKey === CLIENTE_KEY
    ? `Grupo — ${clienteInfo?.nome ?? task.empresa}`
    : selectedChapa?.nome_chapa ?? "";
  const selectedTelefone = selectedKey === CLIENTE_KEY
    ? null // envio pro grupo não confirmado ainda — só visualização
    : selectedChapa?.telefone_chapa ?? null;

  async function updateChapaStatus(chapaId: string, patch: Record<string, unknown>, label: string) {
    const chapa = task!.chapas.find((c) => c.id === chapaId);
    if (!chapa) return;
    const prev: Record<string, unknown> = {};
    Object.keys(patch).forEach((k) => { prev[k] = (chapa as Record<string, unknown>)[k] ?? null; });
    try {
      const db = await getDb();
      const setClauses = Object.keys(patch).map((k) => `${k} = ?`).join(", ");
      await db.execute(`UPDATE chapas SET ${setClauses} WHERE id = ?`, [...Object.values(patch), chapaId]);
    } catch (e) {
      toast.error(errMsg(e));
      return;
    }
    push({
      label,
      revert: async () => {
        const db = await getDb();
        const setClauses = Object.keys(prev).map((k) => `${k} = ?`).join(", ");
        await db.execute(`UPDATE chapas SET ${setClauses} WHERE id = ?`, [...Object.values(prev), chapaId]);
      },
      onReverted: onRefresh,
    });
    onRefresh();
  }

  function copyConfirmedList() {
    const confirmados = task!.chapas.filter((c) => c.status_contato === "confirmado" && c.nome_chapa);
    if (confirmados.length === 0) { toast.error("Nenhum confirmado ainda"); return; }
    const lines = confirmados.map((c) => `${c.nome_chapa}${c.telefone_chapa ? ` - ${c.telefone_chapa}` : ""}`);
    clipboardWrite(lines.join("\n"), `${confirmados.length} confirmado(s) copiado(s)`);
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-y-0 right-0 z-40 bg-card border-l border-border shadow-elevated flex flex-col"
          style={{ width, transition: resizing ? "none" : "width 120ms ease-out" }}
        >
          <div
            onMouseDown={() => setResizing(true)}
            className="absolute top-0 bottom-0 left-0 w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-primary/30 z-10"
            title="Arraste pra redimensionar"
          />

          {/* Header — informações da tarefa */}
          <div className="shrink-0 border-b border-border p-3">
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground transition-colors"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate capitalize">{task.empresa.toLowerCase()}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {fmtTime(task.data_tarefa)} · {task.cidade_uf ?? "—"} · {confirmedCount}/{requested} confirmados ({fillPct}%)
                </p>
              </div>
              <a
                href={`https://app.meu-chapa.com/admin/edit-task/${task.id_tarefa}`}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground transition-colors"
                title="Abrir no Meu Chapa"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={copyConfirmedList}>
                <Copy className="h-3 w-3" /> Copiar confirmados
              </Button>
            </div>
          </div>

          {/* Corpo — lista + conversa */}
          <div className="flex-1 flex min-h-0">
            <div className="w-[220px] shrink-0 border-r border-border overflow-y-auto">
              <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Chapas ({realChapas.length})
              </p>
              {realChapas.map((c) => {
                const hasChat = chatEntryByChapa.has(c.id);
                const selected = selectedKey === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedKey(c.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                      selected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/50 border-l-2 border-l-transparent"
                    }`}
                  >
                    <div className={`h-6 w-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-semibold ${
                      selected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {c.nome_chapa!.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[13px] truncate ${selected ? "font-medium" : ""}`}>{c.nome_chapa}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{STATUS_LABEL[c.status_contato] ?? c.status_contato}</p>
                    </div>
                    {c.status_contato === "confirmado" && <Check className="h-3 w-3 text-success shrink-0" />}
                    {c.status_contato === "nao_respondeu" && <AlertTriangle className="h-3 w-3 text-warning shrink-0" />}
                    {!hasChat && <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 shrink-0" title="Sem conversa vinculada" />}
                  </button>
                );
              })}

              {clienteInfo && (
                <>
                  <p className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground border-t border-border mt-1">
                    Cliente
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(CLIENTE_KEY)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                      selectedKey === CLIENTE_KEY ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/50 border-l-2 border-l-transparent"
                    }`}
                  >
                    <div className="h-6 w-6 rounded-full shrink-0 flex items-center justify-center bg-primary/10">
                      <Users className="h-3 w-3 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] truncate">Grupo — {clienteInfo.nome}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {clienteInfo.umbler_group_chat_id ? "Vinculado" : "Não vinculado"}
                      </p>
                    </div>
                  </button>
                </>
              )}
            </div>

            <div className="flex-1 flex flex-col min-w-0">
              {selectedChapa && (
                <div className="shrink-0 border-b border-border px-3 py-1.5 flex items-center gap-1.5">
                  <Button
                    size="sm"
                    className="h-6 text-[11px] gap-1 bg-success hover:bg-success/90 text-success-foreground"
                    onClick={() => updateChapaStatus(selectedChapa.id, { status_contato: "confirmado", data_contato: new Date().toISOString() }, `confirmar ${selectedChapa.nome_chapa}`)}
                    disabled={selectedChapa.status_contato === "confirmado"}
                  >
                    <Check className="h-3 w-3" /> Confirmar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px] gap-1"
                    onClick={() => updateChapaStatus(selectedChapa.id, { status_contato: "nao_respondeu" }, `não respondeu — ${selectedChapa.nome_chapa}`)}
                    disabled={selectedChapa.status_contato === "nao_respondeu"}
                  >
                    <AlertTriangle className="h-3 w-3" /> Sem resposta
                  </Button>
                </div>
              )}
              {selectedKey ? (
                <ConversationPane
                  key={selectedKey}
                  chatId={selectedChatId}
                  personName={selectedName}
                  personTelefone={selectedTelefone}
                  settings={umblerSettings}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-center p-6">
                  <p className="text-xs text-muted-foreground italic">
                    Selecione um chapa ou o grupo do cliente pra ver a conversa.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
