export type OllamaStatus = "checking" | "running" | "no_model" | "offline"

export const OLLAMA_MODEL = "phi3:mini"
export const OLLAMA_BASE = "http://127.0.0.1:11434"
export const OLLAMA_TIMEOUT_MS = 120_000
