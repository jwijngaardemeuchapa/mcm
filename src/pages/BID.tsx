import { useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Upload, Download, FileSpreadsheet, X } from "lucide-react";
import { toast } from "sonner";

type Row = { Nome: string; B: string };

export default function BID() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [processing, setProcessing] = useState(false);

  function handleFile(file: File) {
    if (!file.name.toLowerCase().match(/\.(xlsx|xls)$/)) {
      toast.error("Envie um arquivo .xlsx ou .xls");
      return;
    }
    setProcessing(true);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // header:1 returns array of arrays — index by column position
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
          header: 1,
          defval: "",
          blankrows: false,
        });
        if (matrix.length === 0) {
          toast.error("Planilha vazia");
          setProcessing(false);
          return;
        }
        // Drop header row, then map: col M (index 12) -> Nome (A), col F (index 5) -> B
        const dataRows = matrix.slice(1);
        const cleaned: Row[] = dataRows
          .map((r) => ({
            Nome: String(r[12] ?? "").trim(),
            B: String(r[5] ?? "").trim(),
          }))
          .filter((r) => r.Nome || r.B);
        setRows(cleaned);
        toast.success(`${cleaned.length} linhas processadas`);
      } catch (err) {
        toast.error("Erro ao ler planilha: " + (err as Error).message);
      } finally {
        setProcessing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function downloadCleaned() {
    if (!rows.length) return;
    const aoa: (string | number)[][] = [
      ["Nome", ""],
      ...rows.map((r) => [r.Nome, r.B]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 32 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BID");
    const base = (fileName ?? "bid").replace(/\.[^.]+$/, "");
    XLSX.writeFile(wb, `${base}_limpa.xlsx`);
    toast.success("Download iniciado");
  }

  function reset() {
    setFileName(null);
    setRows([]);
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1200px] mx-auto">
      <div>
        <h2 className="font-display font-bold text-2xl">BID</h2>
        <p className="text-sm text-muted-foreground">
          Suba uma planilha .xlsx — coluna <b>M</b> vira <b>Nome</b> (col. A), coluna <b>F</b> vai para a coluna <b>B</b>. O restante é descartado.
        </p>
      </div>

      {!rows.length && (
        <label className="block border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary hover:bg-primary-soft transition-colors bg-card">
          <input
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <Upload className="h-10 w-10 mx-auto text-primary mb-2" />
          <div className="font-semibold">{processing ? "Processando..." : "Clique ou arraste um .xlsx"}</div>
          <div className="text-xs text-muted-foreground mt-1">
            A primeira linha é tratada como cabeçalho e descartada
          </div>
        </label>
      )}

      {rows.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 flex items-center justify-between border-b border-border gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold truncate">{fileName}</div>
                <div className="text-xs text-muted-foreground">{rows.length} linhas prontas para download</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} aria-label="Limpar">
                <X className="h-4 w-4" /> Limpar
              </Button>
              <Button onClick={downloadCleaned}>
                <Download className="h-4 w-4" /> Baixar planilha
              </Button>
            </div>
          </div>
          <div className="overflow-auto max-h-[500px]">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Nome (A)</th>
                  <th className="text-left px-3 py-2 font-semibold">B</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-1.5">{r.Nome}</td>
                    <td className="px-3 py-1.5">{r.B}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 100 && (
              <div className="text-xs text-muted-foreground text-center py-2 border-t border-border">
                Exibindo 100 de {rows.length} linhas — o download contém todas
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
