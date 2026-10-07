// Servidor SQLite local pro banco sintético: imita o IPC do plugin-sql do Tauri.
// uso: node dbserver.cjs <banco.db> [porta=8765]
const http = require("http");
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.argv[2]);
db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
const PORT = Number(process.argv[3] ?? 8765);
let stats = new Map();
const chave = (sql) => sql.replace(/\s+/g, " ").trim().slice(0, 110);
function registra(sql, ms, linhas, bytes) {
  const k = chave(sql);
  const s = stats.get(k) ?? { n: 0, ms: 0, linhas: 0, bytes: 0 };
  s.n++; s.ms += ms; s.linhas += linhas; s.bytes += bytes;
  stats.set(k, s);
}
const norm = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);
http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (req.url === "/stats") {
    const rows = [...stats.entries()].map(([sql, s]) => ({ sql, ...s, ms: +s.ms.toFixed(1) })).sort((a, b) => b.ms - a.ms);
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(rows));
  }
  if (req.url === "/reset") { stats = new Map(); res.writeHead(200); return res.end("ok"); }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { op, sql, params } = JSON.parse(body || "{}");
    const t0 = performance.now();
    try {
      const q = sql.replace(/\$(\d+)\b/g, "?$1");
      const args = (params ?? []).map(norm);
      let out;
      if (op === "select") {
        const rows = db.prepare(q).all(...args);
        out = JSON.stringify({ rows });
        registra(sql, performance.now() - t0, rows.length, out.length);
      } else {
        const r = db.prepare(q).run(...args);
        out = JSON.stringify({ rowsAffected: Number(r.changes), lastInsertId: Number(r.lastInsertRowid) });
        registra(sql, performance.now() - t0, 0, out.length);
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(out);
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message || e) + " :: " + sql.slice(0, 80) }));
    }
  });
}).listen(PORT, "127.0.0.1", () => console.log("db server em", PORT));
