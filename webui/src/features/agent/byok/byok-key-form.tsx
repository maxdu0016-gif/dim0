import { useState } from "react"
import { cn } from "@/lib/utils"
import type { ByokProvider } from "@/features/agent/engine/byok-client"
import { useByokStore } from "./byok-store"


const PROVIDERS: { id: ByokProvider; label: string }[] = [
  { id: "openrouter", label: "OpenRouter" },
  { id: "openai", label: "OpenAI" },
]


const fieldClass =
  "rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-sm outline-none " +
  "transition focus:border-secondary-foreground/50 focus:ring-4 focus:ring-secondary-foreground/15"


/**
 * BYOK key entry — provider (segmented), API key, model, remember. Styled to the
 * island vocabulary (sidebar surface, rounded controls, soft focus ring). Calls
 * back when saved. The key is sent only to the provider, never to our servers.
 */
export function ByokKeyForm({ onSaved }: { onSaved?: () => void }) {
  const store = useByokStore()
  const [provider, setProvider] = useState<ByokProvider>(store.provider)
  const [apiKey, setApiKey] = useState(store.apiKey)
  const [model, setModel] = useState(store.model)
  const [remember, setRemember] = useState(store.remember)

  const save = (): void => {
    if (!apiKey.trim()) return
    store.setConfig({ provider, apiKey: apiKey.trim(), model: model.trim(), remember })
    onSaved?.()
  }

  return (
    <div className="flex flex-col gap-2.5 text-sm">
      <div className="inline-flex rounded-lg border border-border bg-background/40 p-0.5">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setProvider(p.id)}
            className={cn(
              "flex-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              provider === p.id
                ? "bg-secondary text-secondary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">API key</span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={provider === "openai" ? "sk-…" : "sk-or-…"}
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Model</span>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={provider === "openai" ? "gpt-5.4" : "openai/gpt-5.4"}
          className={fieldClass}
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember on this device
      </label>

      <button
        type="button"
        onClick={save}
        disabled={!apiKey.trim()}
        className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-40"
      >
        Save
      </button>

      <p className="text-[11px] leading-snug text-muted-foreground">
        Your key is sent directly to the provider, never to dim0&apos;s servers. It stays in memory
        unless you choose to remember it.
      </p>
    </div>
  )
}
