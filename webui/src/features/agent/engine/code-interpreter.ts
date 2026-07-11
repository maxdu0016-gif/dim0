/**
 * Code interpreter as a service — a managed `CodeClient` + the `code_interpreter`
 * agent tool + resolution.
 *
 * Execution runs in a Daytona sandbox via `/ai/code` (a browser can't run a
 * sandbox). "Our keys first, yours as fallback": a signed-in user runs on our
 * Daytona account; if that's over quota (429) and the user has a BYOK Daytona
 * key, the run is retried with `X-Provider-Key` (relayed, not stored).
 * Signed-out has no authed proxy → off.
 */
import { z } from "zod"
import { apiFetch } from "@/api"
import { defineTool, type Tool } from "./types"
import type { CodeClient, CodeResult } from "./services/clients"
import { resolveService } from "./services/resolve"
import { isOverQuotaError, runIdHeaders } from "./services/run"


type CodeResponse = {
  status: "success" | "error" | "timeout"
  stdout: string
  stderr: string
  duration_ms: number
}


/** POST code to `/ai/code`. Injectable for tests. */
export type CodePost = (body: { code: string; language: string }) => Promise<CodeResponse>


const makeDefaultCodePost = (runId?: string, byokKey?: string): CodePost => async (body) => {
  const call = (extra?: Record<string, string>) =>
    apiFetch<{ data: CodeResponse }>({
      path: "/ai/code",
      method: "POST",
      body,
      headers: { ...runIdHeaders(runId), ...extra },
    })
  try {
    return (await call()).data
  } catch (e) {
    if (byokKey && isOverQuotaError(e)) return (await call({ "X-Provider-Key": byokKey })).data
    throw e
  }
}


/** Managed code client — our Daytona via `/ai/code`, BYOK key as fallback. */
export const managedCodeClient = (
  opts: { runId?: string; byokKey?: string; post?: CodePost } = {},
): CodeClient => {
  const post = opts.post ?? makeDefaultCodePost(opts.runId, opts.byokKey)
  return {
    async run(code: string, language: string): Promise<CodeResult> {
      const r = await post({ code, language })
      const ok = r.status === "success"
      return {
        ok,
        stdout: r.stdout,
        stderr: r.stderr,
        error: ok ? undefined : r.stderr || r.status,
      }
    },
  }
}


/** Resolve the code service to a client, or null when unavailable. */
export const resolveCodeClient = (opts: {
  signedIn: boolean
  runId?: string
  byokKey?: string | null
}): CodeClient | null => {
  const resolution = resolveService("code", { signedIn: opts.signedIn, byok: {} })
  if (resolution.mode !== "managed") return null
  return managedCodeClient({ runId: opts.runId, byokKey: opts.byokKey ?? undefined })
}


/** The `code_interpreter` agent tool, backed by a resolved code client. */
export const makeCodeInterpreterTool = (client: CodeClient): Tool =>
  defineTool({
    name: "code_interpreter",
    description:
      "Run Python or JavaScript in an isolated sandbox and return stdout/stderr. Use for calculations, data wrangling, or verifying logic.",
    parameters: z.object({
      code: z.string().describe("Source code to execute"),
      language: z.enum(["python", "javascript"]).default("python"),
    }),
    run: async ({ code, language }) => client.run(code, language),
  })
