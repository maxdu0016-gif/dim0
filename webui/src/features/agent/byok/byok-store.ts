import { create } from "zustand"
import type { ByokConfig, ByokProvider } from "@/features/agent/engine/byok-client"


const STORAGE_KEY = "dim0.byok"


type Stored = { provider: ByokProvider; apiKey: string; model: string }


/** Read a remembered config from localStorage (opt-in). */
const load = (): Stored | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Stored) : null
  } catch {
    return null
  }
}


const defaultModel = (provider: ByokProvider): string =>
  provider === "openai" ? "gpt-4o-mini" : "openai/gpt-4o-mini"


type ByokState = {
  provider: ByokProvider
  apiKey: string
  model: string
  remember: boolean
  configured: boolean
  setConfig: (cfg: { provider: ByokProvider; apiKey: string; model: string; remember: boolean }) => void
  clear: () => void
  asConfig: () => ByokConfig | null
}


const initial = load()


/**
 * BYOK config (provider + key + model). In-memory by default; "remember on this
 * device" opt-in persists to localStorage. The key is sent ONLY to the provider,
 * never to our servers — and never persisted unless the user opts in.
 */
export const useByokStore = create<ByokState>((set, get) => ({
  provider: initial?.provider ?? "openrouter",
  apiKey: initial?.apiKey ?? "",
  model: initial?.model ?? "",
  remember: initial !== null,
  configured: Boolean(initial?.apiKey),

  setConfig: ({ provider, apiKey, model, remember }) => {
    set({ provider, apiKey, model, remember, configured: Boolean(apiKey) })
    try {
      if (remember && apiKey) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ provider, apiKey, model }))
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // storage unavailable — config stays in-memory only
    }
  },

  clear: () => {
    set({ apiKey: "", configured: false, remember: false })
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  },

  asConfig: () => {
    const { provider, apiKey, model } = get()
    if (!apiKey) return null
    return { provider, apiKey, model: model.trim() || defaultModel(provider) }
  },
}))
