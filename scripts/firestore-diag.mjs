// Diagnóstico temporário da fila Firestore (coleção `messages`).
// Conta docs por status e mostra amostras dos `error` — para medir quanto das
// confirmações perdidas é app-side (docs descartados) vs Umbler (sem doc).
//
// Uso:  node scripts/firestore-diag.mjs
// Config pública (igual a src/lib/firebase.ts) — segurança vem das regras + anon auth.

import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  getFirestore, collection, query, where, limit,
  getDocs, getCountFromServer, writeBatch, doc,
} from "firebase/firestore";
import { createInterface } from "readline";

const env = process.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "AIzaSyBPUvqk0CembJ7LBWy0NYZ0fHqAI4kYhCA",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "fup-webhook-intermediary.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "fup-webhook-intermediary",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "fup-webhook-intermediary.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "366335984881",
  appId: env.VITE_FIREBASE_APP_ID ?? "1:366335984881:web:45de35e17e6b75aec79550",
};
const COLLECTION = "messages";

async function countWhere(db, field, value) {
  try {
    const snap = await getCountFromServer(query(collection(db, COLLECTION), where(field, "==", value)));
    return snap.data().count;
  } catch (e) {
    return `erro (${e.code ?? e.message})`;
  }
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  console.log("Autenticando (anônimo)…");
  await signInAnonymously(auth);
  const db = getFirestore(app);

  console.log(`\nColeção "${COLLECTION}" — contagem por status:`);
  let total = "?";
  try {
    total = (await getCountFromServer(collection(db, COLLECTION))).data().count;
  } catch (e) {
    total = `erro (${e.code ?? e.message})`;
  }
  console.log(`  total      : ${total}`);
  for (const st of ["pending", "processing", "error", "done", "handled"]) {
    console.log(`  ${st.padEnd(11)}: ${await countWhere(db, "status", st)}`);
  }

  // Amostra dos docs com status='error' — são respostas que o app descartou.
  console.log(`\nAmostra de docs status='error' (até 8):`);
  try {
    const errSnap = await getDocs(query(collection(db, COLLECTION), where("status", "==", "error"), limit(8)));
    if (errSnap.empty) {
      console.log("  (nenhum)");
    } else {
      errSnap.forEach((d) => {
        const data = d.data();
        const payload = data.payload ?? data;
        const keys = Object.keys(payload ?? {});
        const tipo = payload?.resposta_interesse != null || payload?.resposta_aceite != null
          ? "BID"
          : payload?.resposta_opcao != null
            ? "FUP"
            : "?";
        const corpo = payload?.resposta_opcao ?? payload?.resposta_interesse ?? payload?.resposta_aceite ?? "";
        console.log(`  • ${d.id}  [${tipo}]  corpo="${String(corpo).slice(0, 40)}"  campos=[${keys.slice(0, 8).join(",")}]`);
      });
    }
  } catch (e) {
    console.log(`  erro ao listar: ${e.code ?? e.message}`);
  }

  process.exit(0);
}

async function cleanErrors(db) {
  const count = await countWhere(db, "status", "error");
  if (count === 0 || typeof count !== "number") {
    console.log(`Nenhum doc com status='error' encontrado (${count}).`);
    return;
  }
  console.log(`\nEncontrados ${count} doc(s) com status='error'.`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ok = await new Promise((res) => rl.question("Apagar todos? (s/N) ", (a) => { rl.close(); res(a.trim().toLowerCase() === "s"); }));
  if (!ok) { console.log("Cancelado."); return; }

  let deleted = 0;
  let cursor = null;
  while (true) {
    const q = cursor
      ? query(collection(db, COLLECTION), where("status", "==", "error"), limit(500))
      : query(collection(db, COLLECTION), where("status", "==", "error"), limit(500));
    const snap = await getDocs(q);
    if (snap.empty) break;

    const batch = writeBatch(db);
    snap.forEach((d) => batch.delete(doc(db, COLLECTION, d.id)));
    await batch.commit();
    deleted += snap.size;
    console.log(`  apagados ${deleted}…`);
    if (snap.size < 500) break;
  }
  console.log(`\nPronto — ${deleted} doc(s) removidos.`);
}

const mode = process.argv[2];

if (mode === "--clean-errors") {
  (async () => {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    console.log("Autenticando (anônimo)…");
    await signInAnonymously(auth);
    const db = getFirestore(app);
    await cleanErrors(db);
    process.exit(0);
  })().catch((e) => { console.error("Falhou:", e); process.exit(1); });
} else {
  main().catch((e) => { console.error("Falhou:", e); process.exit(1); });
}
