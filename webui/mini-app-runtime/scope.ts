// Curated identifiers the agent's mini-app source may reference.
//
// This file is the *single source of truth*:
//   - The runtime (main.tsx) passes the values to compileMiniApp() so the
//     agent's code can use them as bare identifiers.
//   - The agent's skill prompt is built from `renderScopeManifest()` so
//     what the agent thinks is available matches what's actually wired.
//
// Adding a new component or hook is a single-line change here. No schema
// updates, no parity tests, no prompt edits — just an entry.
//
// React is in scope on purpose: the compile pipeline uses sucrase with the
// classic JSX runtime (jsxRuntime: "classic"), which emits
// `React.createElement(...)` calls. Without `React` bound in scope, every
// `<div/>` would throw.

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

import { host } from "./rpc"


interface ScopeEntry {
  /** The actual JS value injected into the agent's code at runtime. */
  value: unknown
  /** One-line signature for the agent prompt (shown in renderScopeManifest). */
  signature: string
  /** Optional one-line behavior note for the agent prompt. */
  doc?: string
}


export const MINI_APP_SCOPE: Record<string, ScopeEntry> = {
  // React itself — required by the classic JSX runtime.
  React: {
    value: React,
    signature: "React (createElement, Fragment — used implicitly by JSX)",
  },

  // Hooks — the agent uses these directly without an import.
  useState: {
    value: React.useState,
    signature: "useState<T>(initial: T): [T, (next: T) => void]",
    doc: "Local widget state. Persists for the lifetime of this iframe mount.",
  },
  useMemo: {
    value: React.useMemo,
    signature: "useMemo<T>(fn: () => T, deps: unknown[]): T",
  },
  useEffect: {
    value: React.useEffect,
    signature: "useEffect(fn: () => void | (() => void), deps?: unknown[]): void",
  },
  useCallback: {
    value: React.useCallback,
    signature: "useCallback<F>(fn: F, deps: unknown[]): F",
  },
  useRef: {
    value: React.useRef,
    signature: "useRef<T>(initial: T): { current: T }",
  },

  // Component library (subset). More entries land in later phases as the
  // examples in the skill prompt grow.
  Card:        { value: Card,        signature: "<Card className?>{children}</Card>" },
  CardHeader:  { value: CardHeader,  signature: "<CardHeader>{children}</CardHeader>" },
  CardTitle:   { value: CardTitle,   signature: "<CardTitle>{children}</CardTitle>" },
  CardContent: { value: CardContent, signature: "<CardContent>{children}</CardContent>" },
  CardFooter:  { value: CardFooter,  signature: "<CardFooter>{children}</CardFooter>" },
  Button: {
    value: Button,
    signature: "<Button variant? size? onClick?>{children}</Button>",
    doc: "variant: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'.",
  },

  // Tailwind class-merge helper. Agents often want to compose conditional
  // classes — without `cn` they end up with messy template literals.
  cn: {
    value: cn,
    signature: "cn(...classes: (string | undefined | false)[]): string",
    doc: "Merge tailwind classes, with later classes winning conflicts.",
  },

  // Bridge into the host app. Methods round-trip through postMessage;
  // see rpc.ts for the protocol. Agent reads `host.initialState` for
  // persisted state on mount and writes via `host.saveState(...)`.
  host: {
    value: host,
    signature:
      "host.initialState: unknown; host.saveState(state); host.toast(message, level?); " +
      "host.callTool(name, args); host.openNote(noteId)",
    doc:
      "RPC bridge to the host. saveState + toast work in v1; callTool + openNote " +
      "exist but reject until the agent path is wired in Phase 3.",
  },
}


/** Names of all scope entries, in declaration order. */
export const MINI_APP_SCOPE_NAMES: string[] = Object.keys(MINI_APP_SCOPE)


/** Values aligned with MINI_APP_SCOPE_NAMES — pass to compileMiniApp. */
export const MINI_APP_SCOPE_VALUES: unknown[] = MINI_APP_SCOPE_NAMES.map(
  (name) => MINI_APP_SCOPE[name].value,
)


/**
 * Render the scope as a markdown bullet list for the agent prompt.
 *
 * The intent is that the backend reads a generated manifest (or this
 * function's output baked at build time) and embeds it directly in the
 * mini-app skill prompt, so the agent's allowlist always matches the
 * runtime's allowlist.
 */
export function renderScopeManifest(): string {
  return MINI_APP_SCOPE_NAMES.map((name) => {
    const { signature, doc } = MINI_APP_SCOPE[name]
    return doc
      ? `- \`${name}\`: ${signature}\n  ${doc}`
      : `- \`${name}\`: ${signature}`
  }).join("\n")
}
