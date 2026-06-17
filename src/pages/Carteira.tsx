import { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { getDb, uuid, errMsg } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, Trash2, Search, Plus, Eye, EyeOff, Info } from "lucide-react";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/datetime";

type Row = { id: string; nome_fantasia: string; cnpj: string | null; grupo: string | null; created_at: string };

const GRUPOS = ["G1", "G2", "G3", "G4", "G5"];

export default function Carteira() {
  const [rows, setRows] = useState<Row[]>([]);
  const [preview, setPreview] = useState<Array<{ nome_fantasia: string; cnpj: string | null }>>([]);
  const [removeTarget, setRemoveTarget] = useState<Row | null>(null);
  const [dupCount, setDupCount] = useState(0);
  const [filter, setFilter] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [showOnlyHidden, setShowOnlyHidden] = useState(false);
  const [hiddenCompanies, setHiddenCompanies] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addNome, setAddNome] = useState("");
  const [addCnpj, setAddCnpj] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const db = await getDb();
      const data = await db.select<Row[]>("SELECT id, nome_fantasia, cnpj, grupo, created_at FROM carteira ORDER BY nome_fantasia");
      setRows(data);
    } catch (e) {
      toast.error("Erro ao carregar carteira");
    }
  }

  async function updateGrupo(id: string, grupo: string | null) {
    try {
      const db = await getDb();
      await db.execute("UPDATE carteira SET grupo = ? WHERE id = ?", [grupo, id]);
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, grupo } : r));
    } catch (e) {
      toast.error("Erro ao atualizar grupo: " + errMsg(e));
    }
  }
  async function loadHidden() {
    try {
      const db = await getDb();
      const rows = await db.select<{ nome_fantasia: string }[]>(
        "SELECT nome_fantasia FROM empresa_config WHERE oculta_dashboard = 1",
      );
      setHiddenCompanies(rows.map((r) => r.nome_fantasia));
    } catch { /* noop */ }
  }

  useEffect(() => { load(); loadHidden(); }, []);

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const r = Papa.parse<Record<string, string>>(reader.result as string, {
        header: true,
        skipEmptyLines: true,
      });
      const data = r.data;
      const colKeys = Object.keys(data[0] ?? {});
      const nameKey = colKeys.find((k) => /nome\s*fantasia|empresa|raz.o\s*social|company|nome/i.test(k));
      const cnpjKey = colKeys.find((k) => /cnpj/i.test(k));
      if (!nameKey) { toast.error("Coluna de nome não encontrada"); return; }

      const seen = new Set<string>();
      const uniq: Array<{ nome_fantasia: string; cnpj: string | null }> = [];
      let dup = 0;
      for (const row of data) {
        const name = (row[nameKey] ?? "").trim().replace(/\s+/g, " ");
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) { dup++; continue; }
        seen.add(key);
        uniq.push({ nome_fantasia: name, cnpj: cnpjKey ? (row[cnpjKey] ?? null) || null : null });
      }
      setPreview(uniq);
      setDupCount(dup);
      toast.success(`✓ ${uniq.length} empresas · ${dup} duplicatas removidas`);
    };
    reader.onerror = () => toast.error("Erro ao ler o arquivo");
    reader.readAsText(file);
  }

  async function replaceAll() {
    if (!preview.length) return;
    try {
      const db = await getDb();
      const now = new Date().toISOString();

      // Upsert first — data is never lost if anything fails later
      for (const p of preview) {
        await db.execute(
          `INSERT INTO carteira (id, nome_fantasia, cnpj, created_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(nome_fantasia) DO UPDATE SET cnpj = excluded.cnpj`,
          [uuid(), p.nome_fantasia, p.cnpj ?? null, now],
        );
      }
      // Remove records not in the new set
      const names = preview.map((p) => p.nome_fantasia);
      const ph = names.map(() => "?").join(",");
      await db.execute(`DELETE FROM carteira WHERE nome_fantasia NOT IN (${ph})`, names);

      setPreview([]); setDupCount(0);
      toast.success("Carteira substituída");
      load();
    } catch (e) {
      toast.error("Erro ao salvar: " + errMsg(e));
      load();
    }
  }

  async function append() {
    if (!preview.length) return;
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      for (const p of preview) {
        await db.execute(
          "INSERT OR IGNORE INTO carteira (id, nome_fantasia, cnpj, created_at) VALUES (?, ?, ?, ?)",
          [uuid(), p.nome_fantasia, p.cnpj ?? null, now],
        );
      }
      setPreview([]); setDupCount(0);
      toast.success("Empresas adicionadas");
      load();
    } catch (e) {
      toast.error("Erro ao salvar: " + errMsg(e));
    }
  }

  async function addManual() {
    const nome = addNome.trim().replace(/\s+/g, " ");
    if (!nome) return;
    setAddSaving(true);
    try {
      const db = await getDb();
      await db.execute(
        "INSERT OR IGNORE INTO carteira (id, nome_fantasia, cnpj, created_at) VALUES (?, ?, ?, ?)",
        [uuid(), nome, addCnpj.trim() || null, new Date().toISOString()],
      );
      toast.success(`"${nome}" adicionada à carteira`);
      setAddOpen(false);
      setAddNome("");
      setAddCnpj("");
      load();
    } catch (e) {
      toast.error("Erro ao adicionar: " + errMsg(e));
    } finally {
      setAddSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM carteira WHERE id = ?", [id]);
      toast.success("Empresa removida da carteira");
      load();
    } catch (e) {
      toast.error("Erro ao remover");
    }
  }

  async function toggleHidden(nome: string) {
    const isHidden = hiddenCompanies.includes(nome);
    try {
      const db = await getDb();
      if (isHidden) {
        await db.execute(
          "UPDATE empresa_config SET oculta_dashboard = 0 WHERE nome_fantasia = ?",
          [nome],
        );
        setHiddenCompanies((prev) => prev.filter((n) => n !== nome));
      } else {
        await db.execute(
          "INSERT INTO empresa_config (nome_fantasia, oculta_dashboard) VALUES (?, 1) ON CONFLICT(nome_fantasia) DO UPDATE SET oculta_dashboard = 1",
          [nome],
        );
        setHiddenCompanies((prev) => [...prev, nome]);
      }
    } catch (e) {
      toast.error("Erro ao atualizar: " + errMsg(e));
    }
  }

  const filtered = rows.filter((r) => {
    if (showOnlyHidden && !hiddenCompanies.includes(r.nome_fantasia)) return false;
    return r.nome_fantasia.toLowerCase().includes(filter.toLowerCase());
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1200px] mx-auto">
      <div>
        <h2 className="font-display font-bold text-2xl text-foreground">Minha Carteira de Empresas</h2>
        <p className="text-sm text-muted-foreground">
          Faça upload de um CSV com suas empresas-clientes
          {hiddenCompanies.length > 0 && (
            <span className="ml-2 text-warning font-medium">
              · {hiddenCompanies.length} oculta{hiddenCompanies.length !== 1 ? "s" : ""} do dashboard
            </span>
          )}
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); e.dataTransfer.files[0] && onFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors bg-card ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary hover:bg-primary-soft"}`}
      >
        <Upload className="h-10 w-10 mx-auto text-primary mb-2" />
        <div className="font-semibold">Clique ou arraste um CSV</div>
        <div className="text-xs text-muted-foreground mt-1">Coluna esperada: "Nome fantasia" (ou Empresa/Razão Social)</div>
      </div>
      <input ref={fileRef} type="file" accept=".csv" className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />

      {preview.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <b>{preview.length}</b> empresas únicas · {dupCount} duplicatas removidas
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={append}>Adicionar à carteira</Button>
              <Button onClick={replaceAll}>Substituir carteira</Button>
            </div>
          </div>
          <div className="max-h-48 overflow-auto text-xs border border-border rounded">
            {preview.slice(0, 20).map((p, i) => (
              <div key={i} className="px-3 py-1.5 border-b border-border last:border-0 capitalize">{p.nome_fantasia.toLowerCase()}</div>
            ))}
            {preview.length > 20 && <div className="px-3 py-1.5 text-muted-foreground italic">+{preview.length - 20} mais...</div>}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 flex items-center justify-between gap-3 border-b border-border flex-wrap">
          <div className="font-semibold flex items-center gap-2">
            Carteira atual <span className="text-muted-foreground">({rows.length})</span>
            {hiddenCompanies.length > 0 && (
              <span className="text-xs text-warning font-medium">
                · {hiddenCompanies.length} oculta{hiddenCompanies.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hiddenCompanies.length > 0 && (
              <Button
                size="sm"
                variant={showOnlyHidden ? "default" : "outline"}
                className={`gap-1.5 text-xs h-9 ${showOnlyHidden ? "bg-warning/15 text-warning hover:bg-warning/25 border border-warning/40" : ""}`}
                onClick={() => setShowOnlyHidden((v) => !v)}
              >
                <EyeOff className="h-3.5 w-3.5" />
                {showOnlyHidden ? "Mostrar todas" : `Ver ${hiddenCompanies.length} oculta${hiddenCompanies.length !== 1 ? "s" : ""}`}
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5 h-9 text-xs" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Adicionar
            </Button>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input className="pl-8 h-9 w-64" placeholder="Buscar..." value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="p-8 flex items-center justify-center gap-4 flex-wrap">
            <span className="text-sm text-foreground">Carteira vazia.</span>
            <Button size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Adicionar empresas →
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Nome Fantasia</th>
                <th className="text-left px-4 py-2 font-semibold w-28">Grupo</th>
                <th className="text-left px-4 py-2 font-semibold">Adicionado</th>
                <th className="text-center px-4 py-2 font-semibold w-24">Dashboard</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isHidden = hiddenCompanies.includes(r.nome_fantasia);
                return (
                  <tr key={r.id} className={`border-t border-border hover:bg-muted/30 transition-opacity ${isHidden ? "opacity-50" : ""}`}>
                    <td className="px-4 py-2 font-medium capitalize">{r.nome_fantasia.toLowerCase()}</td>
                    <td className="px-4 py-1.5">
                      <Select
                        value={r.grupo ?? "__none__"}
                        onValueChange={(v) => updateGrupo(r.id, v === "__none__" ? null : v)}
                      >
                        <SelectTrigger className="h-7 text-xs w-24">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">—</SelectItem>
                          {GRUPOS.map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">{fmtDateTime(r.created_at)}</td>
                    <td className="px-4 py-2 text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => toggleHidden(r.nome_fantasia)}
                            className={`h-7 w-7 inline-flex items-center justify-center rounded transition-colors ${
                              isHidden
                                ? "text-warning hover:text-warning/80 hover:bg-warning/10"
                                : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted"
                            }`}
                            aria-label={isHidden ? "Oculta do dashboard" : "Visível no dashboard"}
                          >
                            {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {isHidden ? "Oculta do dashboard — clique para mostrar" : "Visível no dashboard — clique para ocultar"}
                        </TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="px-4 py-2">
                      <Button size="icon" variant="ghost" onClick={() => setRemoveTarget(r)} aria-label={`Remover ${r.nome_fantasia}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && rows.length > 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground italic">Nenhum resultado para "{filter}".</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Dialog: adicionar empresa manualmente ── */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) { setAddOpen(false); setAddNome(""); setAddCnpj(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Adicionar empresa manualmente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 flex items-start gap-2">
              <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Use <strong className="text-foreground">exatamente o mesmo nome</strong> que aparece no dashboard do{" "}
                <strong className="text-foreground">Meu Chapa</strong> (coluna Empresa). Os dashboards de FUP e BID
                filtram as tarefas por esse nome — qualquer diferença faz a empresa não aparecer.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nome Fantasia <span className="text-destructive">*</span></label>
              <Input
                value={addNome}
                onChange={(e) => setAddNome(e.target.value)}
                placeholder="Igual ao exibido no Meu Chapa"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" && addNome.trim() && !addSaving) addManual(); }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">CNPJ <span className="text-muted-foreground/60">(opcional)</span></label>
              <Input
                value={addCnpj}
                onChange={(e) => setAddCnpj(e.target.value)}
                placeholder="00.000.000/0001-00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setAddNome(""); setAddCnpj(""); }}>
              Cancelar
            </Button>
            <Button onClick={addManual} disabled={!addNome.trim() || addSaving} className="gap-1.5">
              {addSaving ? <Upload className="h-3.5 w-3.5 animate-pulse" /> : <Plus className="h-3.5 w-3.5" />}
              {addSaving ? "Salvando…" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover empresa da carteira?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{removeTarget?.nome_fantasia}</strong> será removida permanentemente da carteira.
            As tarefas existentes não são afetadas.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => { if (removeTarget) remove(removeTarget.id); setRemoveTarget(null); }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
