import { create } from "zustand"
import type { ByokConfig, ByokProvider } from "@/features/agent/engine/byok-client"


const STORAGE_KEY = "dim0.byok"


/** Web-search providers a user can bring a key for (relayed through our proxy). */
export type SearchEngine = "perplexity" | "tavily" | "linkup" | "exa"


type Stored = {
  provider: ByokProvider
  apiKey: string
  model: string
  searchEngine?: SearchEngine
  searchKey?: string
  codeKey?: string
}


/** Read a remembered config from localStorage (opt-in). */
const load = (): Stored | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Stored) : null
  } catch {
    return null
  }
}


/** Fallback model id per provider when the user leaves the field blank. */
const defaultModel = (provider: ByokProvider): string =>
  provider === "openai" ? "gpt-5.4" : "openai/gpt-5.4"


type ByokState = {
  // Models (LLM) — called direct from the browser.
  provider: ByokProvider
  apiKey: string
  model: string
  configured: boolean
  // Web search — relayed through our proxy with the user's key.
  searchEngine: SearchEngine
  searchKey: string
  // Code interpreter (Daytona) — relayed through our proxy.
  codeKey: string
  remember: boolean
  setConfig: (cfg: { provider: ByokProvider; apiKey: string; model: string; remember: boolean }) => void
  setSearch: (cfg: { engine: SearchEngine; apiKey: string }) => void
  setCode: (cfg: { apiKey: string }) => void
  clear: () => void
  asConfig: () => ByokConfig | null
  /** The search BYOK credential (engine + key), or null when no key is set. */
  searchByok: () => { engine: SearchEngine; apiKey: string } | null
  /** The code (Daytona) BYOK key, or null when unset. */
  codeByok: () => string | null
}


const initial = load()


/**
 * BYOK config across services: models (provider + key + model), web search
 * (engine + key), and code (Daytona key). In-memory by default; "remember on
 * this device" persists all of it to localStorage. Keys are sent only to the
 * provider — directly for models, or relayed per-request by our proxy (never
 * stored) for search/code — and never persisted unless the user opts in.
 */
export const useByokStore = create<ByokState>((set, get) => ({
  provider: initial?.provider ?? "openrouter",
  apiKey: initial?.apiKey ?? "",
  model: initial?.model ?? "",
  configured: Boolean(initial?.apiKey),
  searchEngine: initial?.searchEngine ?? "perplexity",
  searchKey: initial?.searchKey ?? "",
  codeKey: initial?.codeKey ?? "",
  remember: initial !== null,

  setConfig: ({ provider, apiKey, model, remember }) => {
    set({ provider, apiKey, model, remember, configured: Boolean(apiKey) })
    persist(get)
  },

  setSearch: ({ engine, apiKey }) => {
    set({ searchEngine: engine, searchKey: apiKey })
    persist(get)
  },

  setCode: ({ apiKey }) => {
    set({ codeKey: apiKey })
    persist(get)
  },

  clear: () => {
    set({ apiKey: "", configured: false, searchKey: "", codeKey: "", remember: false })
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

  searchByok: () => {
    const { searchEngine, searchKey } = get()
    return searchKey.trim() ? { engine: searchEngine, apiKey: searchKey.trim() } : null
  },

  codeByok: () => {
    const { codeKey } = get()
    return codeKey.trim() || null
  },
}))


/** Write the current config to localStorage when "remember" is on; else clear it. */
function persist(get: () => ByokState): void {
  const { provider, apiKey, model, searchEngine, searchKey, codeKey, remember } = get()
  try {
    if (remember && (apiKey || searchKey || codeKey)) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ provider, apiKey, model, searchEngine, searchKey, codeKey }),
      )
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // storage unavailable — config stays in-memory only
  }
}
