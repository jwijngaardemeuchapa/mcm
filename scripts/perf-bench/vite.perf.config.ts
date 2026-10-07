// Bancada de medição de performance — NÃO faz parte do app. Veja o README desta pasta.
// Compila o app de verdade (React em produção, sem minificar) trocando o Tauri por stubs
// e bloqueando qualquer rede que não seja localhost.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

const raiz = path.resolve(__dirname, "../..");
const shims = path.resolve(__dirname, "shims");

export default defineConfig({
  root: raiz,
  plugins: [
    react(),
    {
      name: "bloqueio-de-rede",
      transformIndexHtml() {
        return [{ tag: "script", children: fs.readFileSync(path.join(shims, "blocknet.js"), "utf8"), injectTo: "head-prepend" }];
      },
    },
  ],
  resolve: {
    alias: [
      { find: "@tauri-apps/plugin-sql", replacement: path.join(shims, "sql.ts") },
      { find: "@tauri-apps/api/core", replacement: path.join(shims, "core.ts") },
      { find: "@tauri-apps/api/event", replacement: path.join(shims, "event.ts") },
      { find: "@tauri-apps/plugin-updater", replacement: path.join(shims, "updater.ts") },
      { find: "@tauri-apps/plugin-process", replacement: path.join(shims, "process.ts") },
      { find: "@tauri-apps/plugin-opener", replacement: path.join(shims, "opener.ts") },
      { find: "@", replacement: path.join(raiz, "src") },
    ],
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    outDir: path.join(__dirname, ".dist"),
    emptyOutDir: true,
    sourcemap: false,
    minify: false, // nomes legíveis nos perfis
    chunkSizeWarningLimit: 6000,
  },
  // js-profiling: libera o JS Self-Profiling API do Chromium (new Profiler({...}))
  preview: { port: 8099, host: "127.0.0.1", headers: { "Document-Policy": "js-profiling" } },
});
