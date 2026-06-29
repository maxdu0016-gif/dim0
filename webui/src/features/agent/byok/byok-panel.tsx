import { useState } from "react"
import type { ByokProvider } from "@/features/agent/engine/byok-client"
import { useByokStore } from "./byok-store"


/** Key-entry form: provider + API key + model. Calls back when saved. */
export function ByokPanel({ onSaved }: { onSaved?: () => void }) {
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
    <div className="flex flex-col gap-2 text-sm">
      <div className="font-medium">Connect a model (BYOK)</div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Provider</span>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as ByokProvider)}
          className="rounded border border-border bg-background px-2 py-1"
        >
          <option value="openrouter">OpenRouter</option>
          <option value="openai">OpenAI</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">API key</span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={provider === "openai" ? "sk-…" : "sk-or-…"}
          className="rounded border border-border bg-background px-2 py-1"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Model</span>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={provider === "openai" ? "gpt-5.4" : "openai/gpt-5.4"}
          className="rounded border border-border bg-background px-2 py-1"
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
        className="rounded bg-foreground px-3 py-1.5 text-background disabled:opacity-50"
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
