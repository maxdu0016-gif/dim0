/**
 * Code interpreter as a service (G3) — a managed `CodeClient` + the
 * `code_interpreter` agent tool + resolution.
 *
 * Managed-only: execution runs in our Daytona sandbox via `/ai/code` (a browser
 * can't run a sandbox, and we don't relay a user's Daytona key). Resolves to
 * managed (signed in) or off.
 */
import { z } from "zod"
import { apiFetch } from "@/api"
import { defineTool, type Tool } from "./types"
import type { CodeClient, CodeResult } from "./services/clients"
import { resolveService } from "./services/resolve"


type CodeResponse = {
  status: "success" | "error" | "timeout"
  stdout: string
  stderr: string
  duration_ms: number
}


/** POST code to `/ai/code`. Injectable for tests. */
export type CodePost = (body: { code: string; language: string }) => Promise<CodeResponse>


const defaultCodePost: CodePost = async (body) => {
  const res = await apiFetch<{ data: CodeResponse }>({ path: "/ai/code", method: "POST", body })
  return res.data
}


/** Managed code client — runs in our Daytona sandbox via the `/ai/code` proxy. */
export const managedCodeClient = (post: CodePost = defaultCodePost): CodeClient => ({
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
})


/** Resolve the code service to a client, or null when unavailable. */
export const resolveCodeClient = (opts: { signedIn: boolean }): CodeClient | null => {
  const resolution = resolveService("code", { signedIn: opts.signedIn, byok: {} })
  return resolution.mode === "managed" ? managedCodeClient() : null
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
