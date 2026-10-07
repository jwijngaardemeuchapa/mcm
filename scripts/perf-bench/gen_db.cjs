// Gera um banco SQLite sintético com o schema REAL (migrações do lib.rs) e volume realista.
// uso: node scripts/perf-bench/gen_db.cjs <saida.db> [dias=90] [tarefasPorDia=170]
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const [saida, diasArg, porDiaArg] = process.argv.slice(2);
if (!saida) {
  console.error("uso: node scripts/perf-bench/gen_db.cjs <saida.db> [dias=90] [tarefasPorDia=170]");
  process.exit(1);
}
const DIAS = Number(diasArg ?? 90);
const POR_DIA = Number(porDiaArg ?? 170);

const libRs = path.resolve(__dirname, "../../src-tauri/src/lib.rs");
const src = fs.readFileSync(libRs, "utf8");
const migs = [];
const re = /version:\s*(\d+),\s*description:\s*"[^"]*",\s*sql:\s*"([\s\S]*?)",\s*kind:\s*MigrationKind::Up/g;
let m;
while ((m = re.exec(src))) migs.push({ v: Number(m[1]), sql: m[2] });
migs.sort((a, b) => a.v - b.v);

if (fs.existsSync(saida)) fs.rmSync(saida);
const db = new DatabaseSync(saida);
for (const mig of migs) {
  try {
    db.exec(mig.sql);
  } catch (e) {
    console.error("migração", mig.v, "falhou:", e.message);
  }
}
console.log("migrações aplicadas:", migs.length);

// Colunas que o app cria sozinho em tempo de execução (ALTER TABLE ... try/catch no código)
for (const sql of [
  "ALTER TABLE fup_log ADD COLUMN umbler_chat_id TEXT",
  "ALTER TABLE fup_log ADD COLUMN aguarda_resposta_chat INTEGER DEFAULT 0",
]) {
  try { db.exec(sql); } catch { /* já existe */ }
}

let s = 12345;
const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
const pick = (xs) => xs[Math.floor(r() * xs.length)];

const sobrenomes = ["Silva", "Souza", "Lima", "Pereira", "Costa", "Oliveira", "Santos", "Almeida", "Ferreira", "Rocha", "Ribeiro", "Carvalho", "Gomes", "Martins", "Araújo"];
const nomes = ["João", "Maria", "José", "Ana", "Carlos", "Paulo", "Lucas", "Marcos", "Pedro", "Rafael", "Fernanda", "Juliana", "Bruno", "Diego", "Thiago", "Gabriel"];
const ramos = ["Logística", "Distribuidora", "Atacadista", "Transportes", "Alimentos", "Bebidas", "Frigorífico", "Armazéns", "Comercial", "Indústria", "Varejo"];
const sufixos = ["", " Ltda", " S.A.", " ME", " EIRELI", " LTDA."];
const empresas = [];
for (let i = 0; i < 160; i++) empresas.push(`${pick(ramos)} ${pick(sobrenomes)} ${i}${pick(sufixos)}`);

const agoraMs = Date.now();
const dia = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();
// instante real escrito com offset -03:00, como o app grava data_tarefa
const tz = (ms) => new Date(ms - 3 * 3600_000).toISOString().replace("Z", "-03:00");

db.exec("BEGIN");
const insCart = db.prepare("INSERT INTO carteira (id, nome_fantasia, cnpj, grupo) VALUES (?,?,?,?)");
empresas.slice(0, 150).forEach((e, i) => insCart.run(`c${i}`, e, null, `Grupo ${i % 6}`));
const insCli = db.prepare("INSERT INTO cliente_book (id, nome, status_cliente, particularidades, exigencias, pedidos, observacoes, contato_nome, segmento, telefone, umbler_group_chat_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
for (let i = 0; i < 300; i++) {
  const base = i < 160 ? empresas[i] : `${pick(ramos)} ${pick(sobrenomes)} X${i}`;
  insCli.run(`k${i}`, base, "ativo", "particularidade ".repeat(5), "exige colete e bota", null, null, pick(nomes), pick(ramos), `1199${String(1000000 + i).slice(-7)}`, r() < 0.4 ? `grp${i}` : null);
}

const insT = db.prepare("INSERT INTO tarefas (id_tarefa, data_tarefa, cidade_uf, empresa, status_tarefa, quantidade_chapas, ativo, is_overnight, importado_em, validacao_status) VALUES (?,?,?,?,?,?,?,?,?,?)");
const insC = db.prepare("INSERT INTO chapas (id, id_tarefa, nome_chapa, telefone_chapa, cpf, status_contato, canal_contato) VALUES (?,?,?,?,?,?,?)");
const insF = db.prepare("INSERT INTO fup_log (id, id_tarefa, canal, data_disparo, observacao, chapa_id) VALUES (?,?,?,?,?,?)");
let hasChatLinks = false;
try { db.prepare("SELECT 1 FROM chat_links LIMIT 1").get(); hasChatLinks = true; } catch { /* main não tem */ }
const insL = hasChatLinks ? db.prepare("INSERT INTO chat_links (id_tarefa, telefone_chapa, nome_chapa, umbler_chat_id, canal, atualizado_em) VALUES (?,?,?,?,?,?)") : null;

const hojeSP = new Date(agoraMs - 3 * 3600_000).toISOString().slice(0, 10);
const inicioHoje = Date.parse(`${hojeSP}T00:00:00-03:00`);
let id = 400000;
for (let d = -DIAS; d <= 1; d++) {
  const base = inicioHoje + d * dia;
  for (let k = 0; k < POR_DIA; k++) {
    const hora = d === 0 ? 4 + r() * 19 : r() * 24;
    const ms = base + hora * 3600_000;
    const passado = ms < agoraMs;
    const antigo = d < 0;
    const status = antigo ? pick(["Finalizado", "Finalizado", "Finalizado", "Concluído", "Cancelado"]) : passado ? pick(["Em Andamento", "Finalizado", "Aguardando Início"]) : "Aguardando Início";
    const val = antigo ? pick(["subido_meu_chapa", "validacao_recebida", "subido_meu_chapa"]) : pick(["aguardando", "aguardando", "pendente", "validacao_recebida"]);
    const qtd = 2 + Math.floor(r() * 9);
    id++;
    insT.run(id, tz(ms), pick(["São Paulo/SP", "Campinas/SP", "Curitiba/PR", "Manaus/AM"]), pick(empresas), status, qtd, 1, r() < 0.15 ? 1 : 0, iso(agoraMs - Math.abs(d) * dia), val);
    for (let c = 0; c < qtd; c++) {
      const cid = `${id}-${c}`;
      const tel = `119${String(90000000 + ((id * 13 + c * 7) % 9999999)).slice(-8)}`;
      insC.run(cid, id, `${pick(nomes)} ${pick(sobrenomes)} ${pick(sobrenomes)}`, tel, null,
        antigo ? "confirmado" : pick(["pendente", "pendente", "confirmado", "confirmado"]), pick([null, "umbler_talk", "whatsapp_web"]));
      if (hasChatLinks && r() < 0.5) insL.run(id, tel, `chapa ${c}`, `chat${id}_${c}`, "umbler_talk", iso(agoraMs));
    }
    const nf = Math.floor(r() * 4);
    for (let f = 0; f < nf; f++) insF.run(`f${id}_${f}`, id, pick(["umbler_talk", "umbler_talk_prefup", "whatsapp_web"]), iso(ms - (f + 1) * 3600_000), null, null);
  }
}
db.exec("COMMIT");

// O app grava data_contato ao confirmar. Tarefas antigas: no horário da tarefa; de ontem em
// diante: em algum momento das últimas 40 h (inclui confirmações "esquecidas", > 6 h).
db.exec(`UPDATE chapas SET data_contato = (SELECT substr(t.data_tarefa,1,19) || 'Z' FROM tarefas t WHERE t.id_tarefa = chapas.id_tarefa) WHERE status_contato = 'confirmado'`);
db.exec(`UPDATE chapas SET data_contato = strftime('%Y-%m-%dT%H:%M:%SZ','now','-' || (abs(random()) % 2400) || ' minutes')
         WHERE status_contato = 'confirmado' AND id_tarefa IN (SELECT id_tarefa FROM tarefas WHERE substr(data_tarefa,1,10) >= date('now','-1 day'))`);

for (const t of ["tarefas", "chapas", "fup_log", "cliente_book", "carteira"].concat(hasChatLinks ? ["chat_links"] : [])) {
  console.log(t, db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c);
}
console.log("hoje:", hojeSP);
