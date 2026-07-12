import { useState, type ComponentType } from "react"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  CodeInterpreterIcon,
  GlobeIcon,
  LinkIcon,
  ToolsMenuIcon,
  SparklesIcon,
} from "@/components/icons"
import { cn } from "@/lib/utils"
import { useIsSignedIn } from "@/lib/auth"
import { useByokStore, type SearchEngine } from "@/features/agent/byok/byok-store"
import { ByokKeyForm } from "@/features/agent/byok/byok-key-form"
import { ModelChoiceMenu } from "@/features/agent/components/chat/input-settings/model-card"
import { useListAvailableServices } from "@/features/agent/api/list-available-services"
import { agentResolveContext } from "@/features/agent/engine/services/context"
import { resolveAllServices } from "@/features/agent/engine/services/resolve"
import type { ServiceKind } from "@/features/agent/engine/services/kinds"


type SectionId = "general" | "models" | "search" | "code"

const NAV: { id: SectionId; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "general", label: "General", icon: ToolsMenuIcon },
  { id: "models", label: "Model providers", icon: SparklesIcon },
  { id: "search", label: "Web search", icon: GlobeIcon },
  { id: "code", label: "Code interpreter", icon: CodeInterpreterIcon },
]

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
 * Unified agent settings — a dialog with a left nav (General / Model providers /
 * Web search / Code) and a right pane. General is the everyday surface: pick the
 * active model (catalog dropdown + Auto) and see each tool's resolved source.
 * The provider sections hold BYOK keys. Replaces the flat popover + the legacy
 * tools menu.
 */
export function SettingsDialog({ trigger }: { trigger: React.ReactNode }) {
  const [section, setSection] = useState<SectionId>("general")
  // Populate the managed model catalog (no-op when signed out).
  useListAvailableServices()

  return (
    <Dialog>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="w-[min(760px,calc(100vw-2rem))] max-w-none overflow-hidden rounded-2xl p-0">
        <DialogTitle className="sr-only">Agent settings</DialogTitle>
        <div className="flex h-[min(560px,80vh)]">
          <nav className="w-44 shrink-0 border-r border-border bg-sidebar/60 p-2">
            <div className="px-2 pb-2 pt-1 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Settings
            </div>
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                  section === id
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </nav>
          <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
            {section === "general" && <GeneralPane />}
            {section === "models" && <ProvidersPane />}
            {section === "search" && <SearchPane />}
            {section === "code" && <CodePane />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}


function PaneTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}


/** General: the active model + a per-tool availability summary. */
function GeneralPane() {
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

  const tools: { kind: ServiceKind; label: string; icon: ComponentType<{ className?: string }> }[] = [
    { kind: "search", label: "Web search", icon: GlobeIcon },
    { kind: "code", label: "Code interpreter", icon: CodeInterpreterIcon },
    { kind: "fetch", label: "Fetch", icon: LinkIcon },
  ]

  return (
    <div>
      <PaneTitle title="General" hint="We use our keys by default. Add your own under each service." />

      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Model
      </label>
      <div className="rounded-lg border border-border">
        <ModelChoiceMenu display="row" />
      </div>
      <p className="mb-5 mt-1.5 text-[11px] text-muted-foreground">
        Auto picks a model per task. Signed-in models come from our catalog; a BYOK key adds your own.
      </p>

      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tools</div>
      <div className="divide-y divide-border/60 rounded-lg border border-border">
        {tools.map(({ kind, label, icon: Icon }) => (
          <div key={kind} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              {label}
            </span>
            <SourcePill mode={resolutions[kind].mode} kind={kind} />
          </div>
        ))}
      </div>
    </div>
  )
}


function SourcePill({ mode, kind }: { mode: "managed" | "byok" | "off"; kind: ServiceKind }) {
  if (mode === "managed")
    return <Chip tone="managed" label="Our keys" />
  if (mode === "byok") return <Chip tone="byok" label="Your key" />
  return (
    <span className="text-xs text-muted-foreground">
      {kind === "fetch" ? "Needs an account" : "Set a key"}
    </span>
  )
}


function Chip({ tone, label }: { tone: "managed" | "byok"; label: string }) {
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


function ProvidersPane() {
  return (
    <div>
      <PaneTitle title="Model providers" hint="Bring your own key — sent directly to the provider, never to our servers." />
      <ByokKeyForm />
    </div>
  )
}


function SearchPane() {
  const engine = useByokStore((s) => s.searchEngine)
  const savedKey = useByokStore((s) => s.searchKey)
  const setSearch = useByokStore((s) => s.setSearch)
  const [key, setKey] = useState(savedKey)
  const active = SEARCH_ENGINES.find((e) => e.id === engine) ?? SEARCH_ENGINES[0]

  return (
    <div>
      <PaneTitle title="Web search" hint="Our keys by default. Add a provider key to use your own (relayed, never stored)." />
      <div className="mb-3 flex gap-1 rounded-lg border border-border bg-background/40 p-0.5">
        {SEARCH_ENGINES.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setSearch({ engine: e.id, apiKey: savedKey })}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
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
    </div>
  )
}


function CodePane() {
  const savedKey = useByokStore((s) => s.codeKey)
  const setCode = useByokStore((s) => s.setCode)
  const [key, setKey] = useState(savedKey)

  return (
    <div>
      <PaneTitle title="Code interpreter" hint="Runs in a Daytona sandbox. Add your Daytona key to run on your own account (relayed, never stored)." />
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
