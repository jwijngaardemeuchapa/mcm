/**
 * jira.cjs — CLI de integração Jira para os projetos MCM e MV2
 *
 * Uso:
 *   node scripts/jira.cjs list                          → lista tickets ativos (projeto MCM)
 *   node scripts/jira.cjs list --project MV2            → lista tickets do projeto MV2
 *   node scripts/jira.cjs create tarefa "Título"        → cria Tarefa (MCM)
 *   node scripts/jira.cjs create tarefa "Título" --project MV2 → cria Tarefa no MV2
 *   node scripts/jira.cjs create bug "Título"           → cria Bug
 *   node scripts/jira.cjs create historia "Título"      → cria História
 *   node scripts/jira.cjs create epic "Título"          → cria Epic
 *   node scripts/jira.cjs start MCM-1                   → move para "Fazendo"
 *   node scripts/jira.cjs review MCM-1                  → move para "Em análise"
 *   node scripts/jira.cjs done MCM-1 "comentário"       → move para "Feito" + comentário
 *   node scripts/jira.cjs comment MCM-1 "texto"         → adiciona comentário
 *   node scripts/jira.cjs get MCM-1                     → detalhes de um ticket
 *   node scripts/jira.cjs backlog                       → tickets "A fazer" (MCM)
 *   node scripts/jira.cjs backlog --project MV2         → tickets "A fazer" (MV2)
 *   node scripts/jira.cjs session-start                 → resumo de ambos os projetos
 */

var https = require("https");
var path = require("path");
var fs = require("fs");

// ── Carregar .env ───────────────────────────────────────────────────────────
var envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  var envLines = fs.readFileSync(envPath, "utf8").split("\n");
  envLines.forEach(function(line) {
    var match = line.match(/^([A-Z_]+)="?([^"]*?)"?\s*$/);
    if (match) process.env[match[1]] = match[2];
  });
}

var BASE_URL = process.env.JIRA_BASE_URL || "https://wijngaardedesign.atlassian.net";
var EMAIL    = process.env.JIRA_EMAIL    || "wijngaardedesign@gmail.com";
var TOKEN    = process.env.JIRA_TOKEN    || "";
var AUTH     = Buffer.from(EMAIL + ":" + TOKEN).toString("base64");

// ── Projetos suportados ──────────────────────────────────────────────────────
var PROJECTS = {
  MCM: {
    key: "MCM", id: "10001", name: "MeuChapa Manager",
    issueTypes: { epic:"10007", tarefa:"10009", historia:"10010", funcao:"10011", bug:"10012", inovacao:"10013" },
  },
  MV2: {
    key: "MV2", id: "10034", name: "MCM-V2",
    issueTypes: { epic:"10047", tarefa:"10049", historia:"10050", funcao:"10051", bug:"10052" },
  },
};

// Detecta --project <KEY> nos args e remove do array
var rawArgs = process.argv.slice(2);
var projectFlag = "MCM";
var projectFlagIdx = rawArgs.indexOf("--project");
if (projectFlagIdx !== -1 && rawArgs[projectFlagIdx + 1]) {
  projectFlag = rawArgs[projectFlagIdx + 1].toUpperCase();
  rawArgs.splice(projectFlagIdx, 2);
}
process.argv = [process.argv[0], process.argv[1]].concat(rawArgs);

var ACTIVE_PROJECT = PROJECTS[projectFlag] || PROJECTS.MCM;
var PROJECT    = ACTIVE_PROJECT.key;
var PROJECT_ID = ACTIVE_PROJECT.id;

// ── IDs de status por projeto ────────────────────────────────────────────────
var STATUS_MAP = {
  MCM: { afazer:"10005", fazendo:"10006", analise:"10007", feito:"10008", lapso:"10009" },
  MV2: { afazer:"10042", fazendo:"10043", analise:"10044", feito:"10045", lapso:"10045" },
};
var STATUS = STATUS_MAP[PROJECT] || STATUS_MAP.MCM;

// ISSUE_TYPES é resolvido dinamicamente por ACTIVE_PROJECT.issueTypes
var ISSUE_TYPES = ACTIVE_PROJECT.issueTypes;

var STATUS_LABELS = {
  "10005": "📋 A fazer",
  "10006": "🔧 Fazendo",
  "10007": "🔍 Em análise",
  "10008": "✅ Feito",
  "10009": "🏁 Lapso",
};

var TYPE_LABELS = {
  "10007": "🏔 Epic",
  "10008": "↳ Subtarefa",
  "10009": "📌 Tarefa",
  "10010": "📖 História",
  "10011": "⚙️  Função",
  "10012": "🐛 Bug",
  "10013": "💡 Innovation",
};

// ── Helpers HTTP ─────────────────────────────────────────────────────────────
function request(method, apiPath, body) {
  return new Promise(function(resolve, reject) {
    var url = new URL(BASE_URL + apiPath);
    var options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method,
      headers: {
        "Authorization": "Basic " + AUTH,
        "Accept": "application/json",
        "Content-Type": "application/json",
      }
    };
    var req = https.request(options, function(res) {
      var data = "";
      res.on("data", function(chunk) { data += chunk; });
      res.on("end", function() {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function api(method, path, body) { return request(method, "/rest/api/3" + path, body); }

// ── Transição de status ──────────────────────────────────────────────────────
async function getTransitions(issueKey) {
  var r = await api("GET", "/issue/" + issueKey + "/transitions");
  return r.body.transitions || [];
}

async function transitionTo(issueKey, targetStatusId) {
  var transitions = await getTransitions(issueKey);
  var t = transitions.find(function(t) { return t.to && t.to.id === targetStatusId; });
  if (!t) {
    console.error("  ❌ Transição para status " + targetStatusId + " não disponível em " + issueKey);
    console.error("  Transições disponíveis:", transitions.map(function(x){ return x.name + " → " + (x.to ? x.to.name : "?"); }).join(", "));
    return false;
  }
  var r = await api("POST", "/issue/" + issueKey + "/transitions", { transition: { id: t.id } });
  return r.status === 204;
}

// ── Criar comentário ─────────────────────────────────────────────────────────
async function addComment(issueKey, text) {
  var body = {
    body: {
      type: "doc", version: 1,
      content: [{ type: "paragraph", content: [{ type: "text", text: text }] }]
    }
  };
  var r = await api("POST", "/issue/" + issueKey + "/comment", body);
  return r.status === 201;
}

// ── Formatar ticket para exibição ─────────────────────────────────────────────
function formatIssue(issue) {
  var fields = issue.fields;
  var typeId  = fields.issuetype ? fields.issuetype.id : "?";
  var statId  = fields.status ? fields.status.id : "?";
  var prio    = fields.priority ? fields.priority.name : "Sem prioridade";
  var typeLbl = TYPE_LABELS[typeId]   || fields.issuetype.name;
  var statLbl = STATUS_LABELS[statId] || fields.status.name;
  return (
    "\n  " + issue.key + "  " + typeLbl + "  " + statLbl + "  [" + prio + "]" +
    "\n  " + fields.summary +
    "\n  🔗 " + BASE_URL + "/browse/" + issue.key
  );
}

// ── Comandos ─────────────────────────────────────────────────────────────────
var COMMANDS = {

  // Listar todos os tickets ativos (não-concluídos)
  list: async function() {
    var jql = 'project=' + PROJECT + ' AND status NOT IN ("Feito","Lapso") ORDER BY priority ASC, created ASC';
    var r = await api("GET", "/search/jql?jql=" + encodeURIComponent(jql) + "&maxResults=30&fields=summary,status,priority,issuetype");
    var issues = r.body.issues || [];
    if (!issues.length) {
      console.log("\n  ✨ Backlog vazio — nenhum ticket ativo em " + PROJECT);
      return;
    }
    console.log("\n═══════════════════════════════════════════════════");
    console.log("  MCM — Backlog ativo (" + issues.length + " tickets)");
    console.log("═══════════════════════════════════════════════════");
    issues.forEach(function(i) { console.log(formatIssue(i)); });
    console.log("");
  },

  // Backlog apenas dos "A fazer" (para início de sessão)
  backlog: async function() {
    var jql = 'project=' + PROJECT + ' AND status="A fazer" ORDER BY priority ASC, created ASC';
    var r = await api("GET", "/search/jql?jql=" + encodeURIComponent(jql) + "&maxResults=20&fields=summary,status,priority,issuetype,description");
    var issues = r.body.issues || [];
    if (!issues.length) {
      console.log("\n  ✨ Backlog limpo — não há tarefas pendentes em " + PROJECT);
      return;
    }
    console.log("\n╔══════════════════════════════════════════════════╗");
    console.log("║  📋 MCM — BACKLOG PENDENTE (" + issues.length + " itens)          ║");
    console.log("╚══════════════════════════════════════════════════╝");
    issues.forEach(function(i, idx) {
      console.log("\n  " + (idx + 1) + ". " + i.key + " — " + i.fields.summary);
      var typeId = i.fields.issuetype ? i.fields.issuetype.id : "?";
      var prio   = i.fields.priority ? i.fields.priority.name : "—";
      console.log("     " + (TYPE_LABELS[typeId] || "Item") + "  |  Prioridade: " + prio);
      console.log("     🔗 " + BASE_URL + "/browse/" + i.key);
    });
    console.log("");
  },

  // Resumo de início de sessão: em andamento + pendentes (ambos projetos)
  "session-start": async function() {
    var allKeys = Object.keys(PROJECTS);
    var results = await Promise.all(allKeys.map(function(pKey) {
      var p = PROJECTS[pKey];
      var jqlFaz  = 'project=' + p.key + ' AND status="Fazendo" ORDER BY updated DESC';
      var jqlPend = 'project=' + p.key + ' AND status="A fazer" ORDER BY priority ASC, created ASC';
      return Promise.all([
        api("GET", "/search/jql?jql=" + encodeURIComponent(jqlFaz)  + "&maxResults=5&fields=summary,status,priority,issuetype"),
        api("GET", "/search/jql?jql=" + encodeURIComponent(jqlPend) + "&maxResults=8&fields=summary,priority,issuetype"),
      ]).then(function(r) { return { project: p, fazendo: r[0].body.issues||[], pendente: r[1].body.issues||[] }; });
    }));

    console.log("\n╔══════════════════════════════════════════════════╗");
    console.log("║  🚀 MCM — INÍCIO DE SESSÃO                       ║");
    console.log("╚══════════════════════════════════════════════════╝");

    results.forEach(function(r) {
      var hasFaz  = r.fazendo.length  > 0;
      var hasPend = r.pendente.length > 0;
      if (!hasFaz && !hasPend) return;

      console.log("\n  ── " + r.project.name + " (" + r.project.key + ") ──");

      if (hasFaz) {
        console.log("\n  🔧 EM ANDAMENTO:");
        r.fazendo.forEach(function(i) {
          console.log("    • " + i.key + " — " + i.fields.summary);
          console.log("      🔗 " + BASE_URL + "/browse/" + i.key);
        });
      }
      if (hasPend) {
        console.log("\n  📋 PRÓXIMAS TAREFAS:");
        r.pendente.forEach(function(i, idx) {
          var prio = i.fields.priority ? i.fields.priority.name : "—";
          console.log("    " + (idx + 1) + ". [" + prio + "] " + i.key + " — " + i.fields.summary);
        });
      }
    });

    var totalFaz  = results.reduce(function(s,r){ return s + r.fazendo.length; }, 0);
    var totalPend = results.reduce(function(s,r){ return s + r.pendente.length; }, 0);
    if (!totalFaz && !totalPend) {
      console.log("\n  ✨ Nenhuma tarefa pendente em nenhum projeto. Diga o que quer fazer hoje!");
    }
    console.log("");
  },

  // Criar ticket
  create: async function(args) {
    var typeAlias = (args[0] || "tarefa").toLowerCase();
    var summary   = args[1];
    var desc      = args[2] || "";

    if (!summary) { console.error("  ❌ Uso: node scripts/jira.cjs create <tipo> \"Título\" [\"Descrição\"]"); return; }

    var typeId = ISSUE_TYPES[typeAlias] || ISSUE_TYPES.tarefa;
    var body = {
      fields: {
        project:   { id: PROJECT_ID },
        issuetype: { id: typeId },
        summary:   summary,
      }
    };
    if (desc) {
      body.fields.description = {
        type: "doc", version: 1,
        content: [{ type: "paragraph", content: [{ type: "text", text: desc }] }]
      };
    }

    var r = await api("POST", "/issue", body);
    if (r.status === 201) {
      var key = r.body.key;
      console.log("\n  ✅ Ticket criado: " + key);
      console.log("  🔗 " + BASE_URL + "/browse/" + key + "\n");
    } else {
      console.error("  ❌ Erro ao criar ticket:", JSON.stringify(r.body, null, 2));
    }
  },

  // Mover para "Fazendo"
  start: async function(args) {
    var key = args[0];
    if (!key) { console.error("  ❌ Uso: node scripts/jira.cjs start MCM-1"); return; }
    var ok = await transitionTo(key, STATUS.fazendo);
    if (ok) console.log("\n  🔧 " + key + " → Fazendo\n");
  },

  // Mover para "Em análise"
  review: async function(args) {
    var key = args[0];
    if (!key) { console.error("  ❌ Uso: node scripts/jira.cjs review MCM-1"); return; }
    var ok = await transitionTo(key, STATUS.analise);
    if (ok) console.log("\n  🔍 " + key + " → Em análise\n");
  },

  // Marcar como feito + comentário opcional
  done: async function(args) {
    var key     = args[0];
    var comment = args[1] || "";
    if (!key) { console.error("  ❌ Uso: node scripts/jira.cjs done MCM-1 \"o que foi feito\""); return; }

    var ok = await transitionTo(key, STATUS.feito);
    if (ok) {
      console.log("\n  ✅ " + key + " → Feito");
      if (comment) {
        var cOk = await addComment(key, "✅ Concluído por Claude Code\n\n" + comment);
        if (cOk) console.log("  💬 Comentário registrado");
      }
      console.log("  🔗 " + BASE_URL + "/browse/" + key + "\n");
    }
  },

  // Adicionar comentário
  comment: async function(args) {
    var key  = args[0];
    var text = args[1];
    if (!key || !text) { console.error("  ❌ Uso: node scripts/jira.cjs comment MCM-1 \"texto\""); return; }
    var ok = await addComment(key, text);
    if (ok) console.log("\n  💬 Comentário adicionado em " + key + "\n");
    else    console.error("\n  ❌ Erro ao comentar em " + key + "\n");
  },

  // Detalhes de um ticket
  get: async function(args) {
    var key = args[0];
    if (!key) { console.error("  ❌ Uso: node scripts/jira.cjs get MCM-1"); return; }
    var r = await api("GET", "/issue/" + key + "?fields=summary,status,priority,issuetype,description,comment");
    if (r.status !== 200) { console.error("  ❌ Ticket não encontrado:", key); return; }
    var i = r.body;
    console.log(formatIssue(i));
    var desc = i.fields.description;
    if (desc && desc.content) {
      var text = desc.content.map(function(block) {
        return (block.content || []).map(function(n) { return n.text || ""; }).join("");
      }).join("\n");
      if (text.trim()) console.log("\n  📝 Descrição:\n  " + text.trim());
    }
    var comments = (i.fields.comment || {}).comments || [];
    if (comments.length) {
      console.log("\n  💬 Últimos comentários:");
      comments.slice(-3).forEach(function(c) {
        var body = (c.body.content || []).map(function(b){
          return (b.content || []).map(function(n){ return n.text || ""; }).join("");
        }).join("\n");
        console.log("    — " + (c.author ? c.author.displayName : "?") + ": " + body.trim().slice(0,120));
      });
    }
    console.log("");
  },
};

// ── Entrada principal ─────────────────────────────────────────────────────────
var args = process.argv.slice(2);
var cmd  = args[0];
var rest = args.slice(1);

if (!cmd || !COMMANDS[cmd]) {
  console.log("\n  Uso: node scripts/jira.cjs <comando> [args]");
  console.log("  Comandos: list | backlog | session-start | create | start | review | done | comment | get\n");
  process.exit(0);
}

COMMANDS[cmd](rest).catch(function(err) {
  console.error("  ❌ Erro:", err.message);
  process.exit(1);
});
