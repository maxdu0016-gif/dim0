import type { ComponentType } from "react"
import { CodeInterpreterIcon, GlobeIcon, LinkIcon, SparklesIcon, ToolsMenuIcon } from "@/components/icons"
import { cn } from "@/lib/utils"
import { useIsSignedIn } from "@/lib/auth"
import { useByokStore } from "@/features/agent/byok/byok-store"
import { ByokKeyForm } from "@/features/agent/byok/byok-key-form"
import { agentResolveContext } from "@/features/agent/engine/services/context"
import { resolveAllServices } from "@/features/agent/engine/services/resolve"
import type { ServiceKind } from "@/features/agent/engine/services/kinds"


type Row = { kind: ServiceKind; label: string; Icon: ComponentType<{ className?: string }> }


// One row per capability. Only "llm" is BYOK-able from the browser; the rest are
// managed-only (provider CORS + no key relay), so signed-out they read as gated.
const ROWS: Row[] = [
  { kind: "llm", label: "Models", Icon: SparklesIcon },
  { kind: "search", label: "Web search", Icon: GlobeIcon },
  { kind: "code", label: "Code interpreter", Icon: CodeInterpreterIcon },
  { kind: "fetch", label: "Fetch", Icon: LinkIcon },
]


type Tone = "managed" | "byok"


/** A status chip: a colored dot + label encoding the resolved key-source. */
function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tone === "managed" ? "bg-secondary text-secondary-foreground" : "border border-border text-foreground",
      )}
    >
      <span className={cn("size-1.5 rounded-full", tone === "managed" ? "bg-emerald-500" : "bg-amber-500")} />
      {label}
    </span>
  )
}


/**
 * Unified services settings: one row per capability (Models / Web search / Code /
 * Fetch), each showing which key-source is active — "Our keys" (managed), "Your
 * key" (BYOK), or gated ("Needs an account") for the managed-only services when
 * signed out. Resolution comes from the SAME context the submit loop uses, so
 * the panel never drifts from what actually runs. The BYOK key form appears only
 * where a key can be used (signed-out models).
 */
export function ServicesPanel({ onSaved }: { onSaved?: () => void }) {
  const signedIn = useIsSignedIn()
  // Select `configured` so the panel re-resolves after a save/clear.
  const configured = useByokStore((s) => s.configured)
  const asConfig = useByokStore((s) => s.asConfig)
  const resolutions = resolveAllServices(
    agentResolveContext({ signedIn, byok: configured ? asConfig() : null }),
  )

  return (
    <div className="flex flex-col text-sm">
      <div className="mb-2 flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-muted-foreground">
          <ToolsMenuIcon className="size-3.5 text-secondary-foreground" />
          <span>Services</span>
        </div>
        <span className="text-[11px] font-mono text-muted-foreground">
          {signedIn ? "our keys first" : "on-device · your key"}
        </span>
      </div>

      <div className="flex flex-col divide-y divide-border/60">
        {ROWS.map(({ kind, label, Icon }) => (
          <div key={kind} className="flex items-center justify-between gap-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-foreground">{label}</span>
            </div>
            <RowStatus kind={kind} mode={resolutions[kind].mode} />
          </div>
        ))}
      </div>

      {!signedIn && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="mb-2 text-xs font-mono text-muted-foreground">Your key · models</div>
          <ByokKeyForm onSaved={onSaved} />
        </div>
      )}
    </div>
  )
}


/** The right-hand status for one row, given its resolved mode. */
function RowStatus({ kind, mode }: { kind: ServiceKind; mode: "managed" | "byok" | "off" }) {
  if (mode === "managed") return <StatusPill tone="managed" label={kind === "llm" ? "Our keys · auto" : "Our keys"} />
  if (mode === "byok") return <StatusPill tone="byok" label="Your key" />
  // off — models falls to the key form below; the managed-only services are gated.
  if (kind === "llm") return <span className="text-xs text-muted-foreground">Set a key below</span>
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className="text-xs text-muted-foreground">Needs an account</span>
      <a
        href="/signin"
        className="rounded-md px-1.5 py-0.5 text-xs font-medium text-secondary-foreground underline-offset-2 hover:underline"
      >
        Sign in
      </a>
    </div>
  )
}
