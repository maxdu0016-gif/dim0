/**
 * Build the agent's service-resolution context from auth + a BYOK config.
 *
 * Policy — "our keys first": when signed in, prefer managed (our keys) for every
 * service, even when a BYOK key is saved. A saved key is therefore only used
 * signed-out (local), where managed isn't available; the server enforces the
 * plan's tiers/quota. This is the single place that encodes the precedence, so
 * the submit loop and the Services panel resolve identically.
 */
import type { ByokConfig } from "../byok-client"
import type { ByokCredential, ResolveContext } from "./kinds"


export const agentResolveContext = (opts: {
  signedIn: boolean
  byok?: ByokConfig | null
}): ResolveContext => {
  const cred: ByokCredential | undefined = opts.byok
    ? { provider: opts.byok.provider, apiKey: opts.byok.apiKey, model: opts.byok.model }
    : undefined
  return {
    signedIn: opts.signedIn,
    preferManaged: opts.signedIn,
    byok: cred ? { llm: cred } : {},
  }
}
