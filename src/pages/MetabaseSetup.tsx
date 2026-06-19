import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Database, RefreshCw, Eye, Search, CheckCircle2, KeyRound, ListChecks, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errMsg } from "@/lib/db";
import { toast } from "sonner";
import { readSettings, writeSettings } from "@/lib/settings";
import { ingestTarefas } from "@/lib/ingestTarefas";

/**
 * Config da fonte de dados (Metabase) + mapeamento das Questions.
 * A API key é gravada/usada SOMENTE no backend Rust (metabase_config.json no
 * app_data). Esta tela nunca lê a chave de volta — só envia ao salvar.
 */

type Card = { id: number; name: string; collection_id: number | null; collection: string | null };
type MetabaseStatus = { configured: boolean; base_url: string };

export default function MetabaseSetup() {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<MetabaseStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [filter, setFilter] = useState("");
  const [preview, setPreview] = useState<{ cardId: number; cols: string[]; rows: number } | null>(null);
  const [previewing, setPreviewing] = useState<number | null>(null);
  const [tarefasCardId, setTarefasCardId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const s = await invoke<MetabaseStatus>("metabase_status");
      setStatus(s);
      if (s.base_url) setBaseUrl(s.base_url);
    } catch { /* fora do Tauri */ }
  }, []);

  useEffect(() => {
    loadStatus();
    const s = readSettings();
    if (s.metabaseTarefasCardId) setTarefasCardId(s.metabaseTarefasCardId);
  }, [loadStatus]);

  async function salvar() {
    if (!baseUrl.trim() || !apiKey.trim()) { toast.error("Informe a URL e a API key"); return; }
    setSaving(true);
    try {
      await invoke("save_metabase_config", { baseUrl: baseUrl.trim(), apiKey: apiKey.trim() });
      setApiKey("");
      toast.success("Configuração salva — a chave fica só no backend");
      await loadStatus();
    } catch (e) { toast.error(`Erro ao salvar: ${errMsg(e)}`); }
    finally { setSaving(false); }
  }

  async function listar() {
    setLoadingCards(true);
    try {
      const data = await invoke<Card[]>("metabase_listar_perguntas");
      setCards(data ?? []);
      toast.success(`${data?.length ?? 0} perguntas carregadas`);
    } catch (e) { toast.error(`Erro ao listar: ${errMsg(e)}`); }
    finally { setLoadingCards(false); }
  }

  async function verAmostra(cardId: number) {
    setPreviewing(cardId);
    try {
      const rows = await invoke<Record<string, unknown>[]>("metabase_query_card", { cardId });
      const cols = rows.length ? Object.keys(rows[0]) : [];
      setPreview({ cardId, cols, rows: rows.length });
    } catch (e) { toast.error(`Erro na amostra: ${errMsg(e)}`); }
    finally { setPreviewing(null); }
  }

  function definirComoTarefas(cardId: number) {
    writeSettings({ metabaseTarefasCardId: cardId });
    setTarefasCardId(cardId);
    toast.success(`Pergunta #${cardId} definida como fonte de tarefas`);
  }

  async function sincronizarTarefas() {
    if (!tarefasCardId) return;
    setSyncing(true);
    try {
      const rows = await invoke<Record<string, unknown>[]>("metabase_query_card", { cardId: tarefasCardId });
      const result = await ingestTarefas(rows);
      toast.success(`✓ ${result.tarefas} tarefas · ${result.chapas} chapas sincronizados`);
    } catch (e) {
      toast.error(`Erro na sincronização: ${errMsg(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  const filtered = cards.filter((c) =>
    !filter || c.name?.toLowerCase().includes(filter.toLowerCase()) || String(c.id) === filter.trim(),
  );

  const tarefasCard = cards.find((c) => c.id === tarefasCardId);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Database className="h-6 w-6 text-primary" />
        <div>
          <h2 className="font-display font-bold text-2xl text-foreground">Fonte de Dados — Metabase</h2>
          <p className="text-sm text-muted-foreground">A API key fica só no backend. Use para mapear as perguntas (Questions).</p>
        </div>
      </div>

      {/* Config */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4" /> Conexão
          {status?.configured && (
            <span className="inline-flex items-center gap-1 text-success text-xs ml-2">
              <CheckCircle2 className="h-3.5 w-3.5" /> configurado ({status.base_url})
            </span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">URL do Metabase</label>
            <Input placeholder="https://metabase.suaempresa.com" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">API key (x-api-key)</label>
            <Input type="password" placeholder={status?.configured ? "•••••••• (deixe vazio p/ manter)" : "cole a chave aqui"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar conexão"}</Button>
          <Button variant="outline" onClick={listar} disabled={loadingCards || !status?.configured}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loadingCards ? "animate-spin" : ""}`} /> Listar perguntas
          </Button>
        </div>
      </div>

      {/* Painel de sincronização (visível quando fonte de tarefas definida) */}
      {tarefasCardId && (
        <div className="bg-card border border-primary/25 rounded-xl p-4 flex items-center gap-4">
          <ListChecks className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Fonte de tarefas: #{tarefasCardId}</div>
            <div className="text-xs text-muted-foreground truncate">
              {tarefasCard?.name ?? "Clique em \"Listar perguntas\" para ver o nome"}
            </div>
          </div>
          <Button onClick={sincronizarTarefas} disabled={syncing}>
            {syncing
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sincronizando...</>
              : <><RefreshCw className="h-4 w-4 mr-2" /> Sincronizar tarefas</>}
          </Button>
        </div>
      )}

      {/* Lista de Questions */}
      {cards.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-3 border-b border-border flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              className="flex-1 bg-transparent text-sm outline-none"
              placeholder="Filtrar por nome ou ID..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">{filtered.length} de {cards.length}</span>
          </div>
          <div className="max-h-[480px] overflow-auto divide-y divide-border">
            {filtered.map((c) => (
              <div key={c.id} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 ${tarefasCardId === c.id ? "bg-primary/5" : ""}`}>
                <span className="text-xs font-mono text-muted-foreground w-12 shrink-0">#{c.id}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-foreground truncate flex items-center gap-2">
                    {c.name}
                    {tarefasCardId === c.id && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">TAREFAS</span>
                    )}
                  </div>
                  {c.collection && <div className="text-[11px] text-muted-foreground">{c.collection}</div>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => definirComoTarefas(c.id)}
                  className={tarefasCardId === c.id ? "text-primary" : ""}
                >
                  <ListChecks className="h-3.5 w-3.5 mr-1" />
                  {tarefasCardId === c.id ? "definida" : "tarefas"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => verAmostra(c.id)} disabled={previewing === c.id}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> {previewing === c.id ? "..." : "amostra"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Amostra de colunas */}
      {preview && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-2">
          <div className="text-sm font-semibold">Pergunta #{preview.cardId} — {preview.rows} linhas · {preview.cols.length} colunas</div>
          <div className="flex flex-wrap gap-1.5">
            {preview.cols.map((col) => (
              <span key={col} className="text-[11px] px-2 py-0.5 rounded-md bg-muted text-foreground border border-border">{col}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
