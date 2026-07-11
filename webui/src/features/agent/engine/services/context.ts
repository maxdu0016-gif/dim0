/**
 * Build the agent's service-resolution context from auth + BYOK keys.
 *
 * Policy — "our keys first": when signed in, prefer managed (our keys) for every
 * service; a saved key is then the over-limit fallback. Signed-out, a saved key
 * is the source (models call direct; search/code relay through our proxy). This
 * is the single place that encodes the precedence, so the submit loop and the
 * Services panel resolve identically.
 */
import type { ByokConfig } from "../byok-client"
import type { ByokCredential, PerKindByok, ResolveContext } from "./kinds"


export const agentResolveContext = (opts: {
  signedIn: boolean
  llm?: ByokConfig | null
  search?: { engine: string; apiKey: string } | null
  code?: string | null
}): ResolveContext => {
  const byok: PerKindByok = {}
  if (opts.llm) {
    byok.llm = { provider: opts.llm.provider, apiKey: opts.llm.apiKey, model: opts.llm.model }
  }
  if (opts.search?.apiKey) {
    byok.search = { provider: opts.search.engine, apiKey: opts.search.apiKey } satisfies ByokCredential
  }
  if (opts.code) {
    byok.code = { provider: "daytona", apiKey: opts.code }
  }
  return { signedIn: opts.signedIn, preferManaged: opts.signedIn, byok }
}
