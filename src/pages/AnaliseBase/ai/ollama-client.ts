import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { OLLAMA_MODEL } from "./types"

export async function isOllamaRunning(): Promise<boolean> {
  try {
    await invoke("check_ollama")
    return true
  } catch {
    return false
  }
}

export async function isModelAvailable(model = OLLAMA_MODEL): Promise<boolean> {
  try {
    const data = await invoke<{ models?: { name: string }[] }>("check_ollama")
    const prefix = model.split(":")[0]
    return (data.models ?? []).some((m) => m.name.startsWith(prefix))
  } catch {
    return false
  }
}

export async function generate(
  prompt: string,
  system: string,
  onChunk?: (token: string) => void,
  model = OLLAMA_MODEL,
): Promise<string> {
  let unlisten: (() => void) | undefined
  if (onChunk) {
    unlisten = await listen<string>("ollama-token", (e) => onChunk(e.payload))
  }
  try {
    return await invoke<string>("ollama_generate", { prompt, system, model })
  } finally {
    unlisten?.()
  }
}

export async function pullModel(
  model = OLLAMA_MODEL,
  onProgress?: (status: string, pct: number) => void,
): Promise<void> {
  let unlisten: (() => void) | undefined
  if (onProgress) {
    unlisten = await listen<{ status: string; pct: number }>("ollama-pull-progress", (e) => {
      onProgress(e.payload.status, e.payload.pct)
    })
  }
  try {
    await invoke("ollama_pull", { model })
  } finally {
    unlisten?.()
  }
}
