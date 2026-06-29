import { useState } from "react"
import { ByokPanel } from "@/features/agent/byok/byok-panel"
import { useByokStore } from "@/features/agent/byok/byok-store"
import type { AgentEvent } from "@/features/agent/engine/types"
import { useLocalAgent } from "./use-local-agent"


/** One-line summary of an agent event for the minimal v1 transcript. */
function renderEvent(ev: AgentEvent, i: number) {
  if (ev.type === "tool_start") return <div key={i} className="text-muted-foreground">🔧 {ev.toolName}…</div>
  if (ev.type === "tool_result") return <div key={i} className="text-muted-foreground">✓ {ev.toolName}</div>
  if (ev.type === "assistant_text") return <div key={i} className="text-foreground">{ev.text}</div>
  return null
}


/**
 * Floating local-board agent (v1, minimal). Prompts for a BYOK key when unset,
 * then runs the frontend engine against the live board and shows a transcript.
 */
export function LocalAgentPanel() {
  const configured = useByokStore((s) => s.configured)
  const [showKey, setShowKey] = useState(false)
  const { events, running, error, send } = useLocalAgent()
  const [input, setInput] = useState("")

  const submit = (): void => {
    const prompt = input.trim()
    if (!prompt || running) return
    void send(prompt)
    setInput("")
  }

  return (
    <div className="absolute bottom-4 right-4 z-50 flex w-80 flex-col gap-2 rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
      {!configured || showKey ? (
        <ByokPanel onSaved={() => setShowKey(false)} />
      ) : (
        <>
          {events.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded bg-muted/40 p-2 text-xs">
              {events.map(renderEvent)}
            </div>
          )}
          {error && <div className="text-xs text-destructive">{error}</div>}
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit()
              }}
              placeholder={running ? "Working…" : "Ask the agent to build…"}
              disabled={running}
              className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={submit}
              disabled={running}
              className="rounded bg-foreground px-3 py-1 text-sm text-background disabled:opacity-50"
            >
              Send
            </button>
            <button
              type="button"
              onClick={() => setShowKey(true)}
              title="API key"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ⚙
            </button>
          </div>
        </>
      )}
    </div>
  )
}
