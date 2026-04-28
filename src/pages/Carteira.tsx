import { useEffect, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/datetime";

type Row = { id: string; nome_fantasia: string; cnpj: string | null; created_at: string };

export default function Carteira() {
  const [rows, setRows] = useState<Row[]>([]);
  const [preview, setPreview] = useState<Array<{ nome_fantasia: string; cnpj: string | null }>>([]);
  const [dupCount, setDupCount] = useState(0);
  const [filter, setFilter] = useState("");

  async function load() {
    const { data } = await supabase.from("carteira").select("*").order("nome_fantasia");
    setRows(data ?? []);
  }
  useEffect(() => { load(); }, []);

  function onFile(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => {
        const data = r.data as Record<string, string>[];
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
        toast.success(`${uniq.length} empresas únicas, ${dup} duplicatas removidas`);
      },
    });
  }

  async function replaceAll() {
    await supabase.from("carteira").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (preview.length) await supabase.from("carteira").insert(preview);
    setPreview([]); setDupCount(0);
    toast.success("Carteira substituída");
    load();
  }
  async function append() {
    if (!preview.length) return;
    await supabase.from("carteira").upsert(preview, { onConflict: "nome_fantasia", ignoreDuplicates: true });
    setPreview([]); setDupCount(0);
    toast.success("Empresas adicionadas");
    load();
  }
  async function remove(id: string) {
    await supabase.from("carteira").delete().eq("id", id);
    load();
  }

  const filtered = rows.filter((r) => r.nome_fantasia.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1200px] mx-auto">
      <div>
        <h2 className="font-display font-bold text-2xl text-foreground">Minha Carteira de Empresas</h2>
        <p className="text-sm text-muted-foreground">Faça upload de um CSV com suas empresas-clientes</p>
      </div>

      <label className="block border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary hover:bg-primary-soft transition-colors bg-card">
        <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <Upload className="h-10 w-10 mx-auto text-primary mb-2" />
        <div className="font-semibold">Clique ou arraste um CSV</div>
        <div className="text-xs text-muted-foreground mt-1">Coluna esperada: "Nome fantasia" (ou Empresa/Razão Social)</div>
      </label>

      {preview.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <b>{preview.length}</b> empresas únicas encontradas · {dupCount} duplicatas removidas
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={append}>Adicionar à carteira</Button>
              <Button onClick={replaceAll}>Substituir carteira</Button>
            </div>
          </div>
          <div className="max-h-48 overflow-auto text-xs border border-border rounded">
            {preview.slice(0, 20).map((p, i) => (
              <div key={i} className="px-3 py-1.5 border-b border-border last:border-0">{p.nome_fantasia}</div>
            ))}
            {preview.length > 20 && <div className="px-3 py-1.5 text-muted-foreground italic">+{preview.length - 20} mais...</div>}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 flex items-center justify-between border-b border-border">
          <div className="font-semibold">Carteira atual <span className="text-muted-foreground">({rows.length})</span></div>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input className="pl-8 h-9 w-64" placeholder="Buscar..." value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Nome Fantasia</th>
              <th className="text-left px-4 py-2 font-semibold">CNPJ</th>
              <th className="text-left px-4 py-2 font-semibold">Adicionado</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2 font-medium">{r.nome_fantasia}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.cnpj ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">{fmtDateTime(r.created_at)}</td>
                <td className="px-4 py-2">
                  <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground italic">Nenhuma empresa</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
