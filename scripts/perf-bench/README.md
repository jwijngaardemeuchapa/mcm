# Bancada de medição de performance

Roda o **app de verdade** (React em produção, sem minificar) num navegador, com o Tauri
trocado por stubs e um banco SQLite sintético do tamanho de um mês de operação. Serve pra
medir travamentos com **tarefas longas** e **perfil de JS** em vez de adivinhar — foi assim
que se achou a causa do "clica e a tela congela 2-5 s com a ventoinha subindo".

Não faz parte do app e não entra no build do Tauri.

## Como usar

Precisa de Node ≥ 22.5 (usa `node:sqlite`). Os comandos rodam na raiz do repositório.

```bash
# 1) banco sintético (schema real, vindo das migrações do lib.rs; ~20 MB, ~15 mil tarefas)
node scripts/perf-bench/gen_db.cjs "$TEMP/mcm-perf.db" 90 170

# 2) servidor do banco (imita o IPC do plugin-sql) — porta 8765; /stats e /reset medem as consultas
node scripts/perf-bench/dbserver.cjs "$TEMP/mcm-perf.db"

# 3) build do app com os stubs + servidor estático (porta 8099)
npx vite build --config scripts/perf-bench/vite.perf.config.ts
npx vite preview --config scripts/perf-bench/vite.perf.config.ts
```

Abra `http://127.0.0.1:8099/dashboard` num navegador **Chromium** (o painel do Claude Code
desktop serve; o Chrome também). Na primeira vez, no console:

```js
localStorage.setItem("mcm_intro_open_count", "5");
localStorage.setItem("mcm_intro_last_shown", new Date().toISOString().slice(0, 10));
location.reload(); // e clicar em "Entrar no painel"
```

Nada sai da máquina: `shims/blocknet.js` bloqueia `fetch`/XHR/WebSocket pra qualquer host que
não seja localhost (Firestore, Central e Umbler ficam intocados).

## Medindo

Tarefas longas (> 50 ms, o que o usuário sente como travada):

```js
window.__lt = [];
new PerformanceObserver((l) => l.getEntries().forEach((e) => __lt.push({ t: Math.round(e.startTime), d: Math.round(e.duration) })))
  .observe({ type: "longtask", buffered: true });
// depois de um tempo:  __lt.map(x => x.d).sort((a, b) => b - a).slice(0, 10)
```

Perfil de JS (o build sai sem minificar, então os nomes das funções aparecem):

```js
const prof = new Profiler({ sampleInterval: 10, maxBufferSize: 400000 });
// ... deixa o app parado ou faz o clique ...
const { frames, stacks, samples } = await prof.stop();
// agrega "inclusivo" por função subindo pelos stacks[].parentId (ver JOURNAL de 2026-10-07)
```

O build também liga um perfil de **arranque** (`window.__profBoot`), parado com `await __profBoot.stop()`.

Consultas ao banco (quantas, quanto custam, quantas linhas voltam):

```bash
curl -s http://127.0.0.1:8765/reset
# ... usa o app ...
curl -s http://127.0.0.1:8765/stats   # JSON ordenável por n, ms, linhas, bytes
```

## Limites

- É um banco **sintético**: ajuste `gen_db.cjs` se o dado real tiver outra cara (os piores bugs
  daqui só apareciam com `data_contato` preenchido nas confirmações).
- O painel do navegador do Claude não anima `scroll-behavior: smooth`; teste rolagem com `behavior: "instant"`.
- Não substitui validar no app do Tauri (WebView2, IPC real e a leitura das notificações do Windows).
- Os stubs de `shims/core.ts` devolvem vazio pros comandos do Rust; Metabase/Ollama não funcionam aqui.
