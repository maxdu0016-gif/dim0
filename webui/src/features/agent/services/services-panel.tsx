import { useState, type ComponentType, type ReactNode } from "react"
import { CodeInterpreterIcon, GlobeIcon, LinkIcon, SparklesIcon, ToolsMenuIcon } from "@/components/icons"
import { cn } from "@/lib/utils"
import { useIsSignedIn } from "@/lib/auth"
import { useByokStore, type SearchEngine } from "@/features/agent/byok/byok-store"
import { ByokKeyForm } from "@/features/agent/byok/byok-key-form"
import { agentResolveContext } from "@/features/agent/engine/services/context"
import { resolveAllServices } from "@/features/agent/engine/services/resolve"
import type { ServiceKind } from "@/features/agent/engine/services/kinds"


const SEARCH_ENGINES: { id: SearchEngine; label: string; placeholder: string }[] = [
  { id: "perplexity", label: "Perplexity", placeholder: "pplx-…" },
  { id: "tavily", label: "Tavily", placeholder: "tvly-…" },
  { id: "linkup", label: "Linkup", placeholder: "lk-…" },
  { id: "exa", label: "Exa", placeholder: "exa-…" },
]


const fieldClass =
  "flex-1 min-w-0 rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-sm outline-none " +
  "transition focus:border-secondary-foreground/50 focus:ring-4 focus:ring-secondary-foreground/15"


/**
 * Unified services settings covering every capability's key-source: Models
 * (direct BYOK / our keys), Web search, and Code interpreter (both relayed
 * through our proxy). "Our keys first": signed-in resolves to managed for all;
 * a connected key is the fallback used when over the plan's limit. Models can
 * BYOK signed-out (direct); the relayed services need an account.
 */
export function ServicesPanel({ onSaved }: { onSaved?: () => void }) {
  const signedIn = useIsSignedIn()
  const configured = useByokStore((s) => s.configured)
  const asConfig = useByokStore((s) => s.asConfig)
  const searchByok = useByokStore((s) => s.searchByok)
  const codeByok = useByokStore((s) => s.codeByok)
  const resolutions = resolveAllServices(
    agentResolveContext({
      signedIn,
      llm: configured ? asConfig() : null,
      search: searchByok(),
      code: codeByok(),
    }),
  )

  return (
    <div className="flex max-h-[70vh] flex-col overflow-y-auto text-sm scrollbar-thin">
      <div className="mb-1 flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-muted-foreground">
          <ToolsMenuIcon className="size-3.5 text-secondary-foreground" />
          <span>Services &amp; keys</span>
        </div>
        <span className="text-[11px] font-mono text-muted-foreground">
          {signedIn ? "our keys first" : "on-device · your key"}
        </span>
      </div>
      <p className="mb-1 px-0.5 text-xs leading-snug text-muted-foreground">
        We use our keys by default. Connect your own to keep working offline, on a local board, or
        past your plan&apos;s daily limit.
      </p>

      <Section icon={SparklesIcon} label="Models" status={<Pill kind="llm" mode={resolutions.llm.mode} />}>
        <ByokKeyForm onSaved={onSaved} />
      </Section>

      <Section icon={GlobeIcon} label="Web search" status={<Pill kind="search" mode={resolutions.search.mode} />}>
        <SearchByokCard />
      </Section>

      <Section icon={CodeInterpreterIcon} label="Code interpreter" status={<Pill kind="code" mode={resolutions.code.mode} />}>
        <CodeByokCard />
      </Section>

      <Section icon={LinkIcon} label="Fetch" status={<Pill kind="fetch" mode={resolutions.fetch.mode} />} />

      <div className="mt-3 flex gap-2 border-t border-border pt-3">
        <LockIcon />
        <span className="text-[11px] leading-snug text-muted-foreground">
          Keys stay in this browser. For search &amp; code they&apos;re forwarded per-request through
          our proxy to the provider and never saved on our servers; models call the provider directly.
        </span>
      </div>
    </div>
  )
}


/** One capability block: an uppercase name + source pill, then optional body. */
function Section({
  icon: Icon,
  label,
  status,
  children,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  status: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="mt-3 border-t border-border/60 pt-3 first-of-type:mt-2 first-of-type:border-t-0">
      <div className="mb-2 flex items-center justify-between px-0.5">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </span>
        {status}
      </div>
      {children}
    </section>
  )
}


type Tone = "managed" | "byok"


/** Source status for one row. */
function Pill({ kind, mode }: { kind: ServiceKind; mode: "managed" | "byok" | "off" }) {
  if (mode === "managed") return <Chip tone="managed" label={kind === "llm" ? "Our keys · auto" : "Our keys"} />
  if (mode === "byok") return <Chip tone="byok" label="Your key" />
  // off — fetch has no key slot; the rest expose one right below.
  if (kind === "fetch") return <span className="text-xs text-muted-foreground">Needs an account</span>
  return <span className="text-xs text-muted-foreground">Set a key below</span>
}


function Chip({ tone, label }: { tone: Tone; label: string }) {
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


/** "Ours first" means the relayed services are used when signed in; a connected
 *  key is the over-limit fallback. This card lets a signed-in user attach one. */
function SearchByokCard() {
  const engine = useByokStore((s) => s.searchEngine)
  const savedKey = useByokStore((s) => s.searchKey)
  const setSearch = useByokStore((s) => s.setSearch)
  const [key, setKey] = useState(savedKey)
  const active = SEARCH_ENGINES.find((e) => e.id === engine) ?? SEARCH_ENGINES[0]

  return (
    <div className="rounded-xl border border-border bg-background/40 p-3">
      <div className="mb-2 flex gap-1 rounded-lg border border-border bg-background/40 p-0.5">
        {SEARCH_ENGINES.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setSearch({ engine: e.id, apiKey: savedKey })}
            className={cn(
              "flex-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors",
              e.id === engine
                ? "bg-secondary text-secondary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {e.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          value={key}
          onChange={(ev) => setKey(ev.target.value)}
          placeholder={active.placeholder}
          className={fieldClass}
        />
        <SaveButton disabled={key === savedKey} onClick={() => setSearch({ engine, apiKey: key.trim() })} />
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        Relayed through us — used when signed out or over your plan&apos;s limit.
      </p>
    </div>
  )
}


/** BYOK Daytona key for code execution (relayed, over-limit fallback). */
function CodeByokCard() {
  const savedKey = useByokStore((s) => s.codeKey)
  const setCode = useByokStore((s) => s.setCode)
  const [key, setKey] = useState(savedKey)

  return (
    <div className="rounded-xl border border-border bg-background/40 p-3">
      <div className="mb-2 text-xs font-medium">Daytona</div>
      <div className="flex gap-2">
        <input
          type="password"
          value={key}
          onChange={(ev) => setKey(ev.target.value)}
          placeholder="dtn-…"
          className={fieldClass}
        />
        <SaveButton disabled={key === savedKey} onClick={() => setCode({ apiKey: key.trim() })} />
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        Run sandboxes on your account · relayed, not stored.
      </p>
    </div>
  )
}


function SaveButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition hover:bg-accent disabled:opacity-40"
    >
      Save
    </button>
  )
}


function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden>
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
