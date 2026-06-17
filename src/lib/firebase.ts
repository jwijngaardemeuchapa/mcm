import { initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, signInAnonymously, type Auth } from "firebase/auth";

/* ──────────────────────────────────────────────────────────────────────────
 * Configuração PÚBLICA do Firebase Web SDK (projeto fup-webhook-intermediary).
 * Diferente da chave de service account (admin), estes valores são públicos por
 * design e podem ser embutidos no bundle/instalador — a segurança vem das
 * regras do Firestore + Firebase Anonymous Auth.
 *
 * Os valores vêm de VITE_FIREBASE_* (.env) quando presentes, com fallback para
 * as constantes abaixo. PREENCHER com a config do app Web no console:
 *   Firebase Console → Configurações do projeto → Seus apps → App Web → SDK.
 * ────────────────────────────────────────────────────────────────────────── */

const env = import.meta.env as Record<string, string | undefined>;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "AIzaSyBPUvqk0CembJ7LBWy0NYZ0fHqAI4kYhCA",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "fup-webhook-intermediary.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "fup-webhook-intermediary",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "fup-webhook-intermediary.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "366335984881",
  appId: env.VITE_FIREBASE_APP_ID ?? "1:366335984881:web:45de35e17e6b75aec79550",
};

/** Coleção da fila de mensagens recebidas (gravada pela função na Vercel). */
export const FIRESTORE_MESSAGES_COLLECTION = "messages";

/** True quando há config mínima para conectar (apiKey + appId). */
export function firebaseConfigPresent(): boolean {
  return !!firebaseConfig.apiKey && !!firebaseConfig.appId;
}

let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!_app) _app = initializeApp(firebaseConfig);
  return _app;
}

export function getFirestoreDb(): Firestore {
  if (!_db) _db = getFirestore(getFirebaseApp());
  return _db;
}

/** Garante autenticação anônima (necessária para satisfazer as regras do
 *  Firestore que exigem request.auth != null). Idempotente. */
export async function ensureAnonAuth(): Promise<void> {
  if (!_auth) _auth = getAuth(getFirebaseApp());
  if (_auth.currentUser) return;
  await signInAnonymously(_auth);
}
