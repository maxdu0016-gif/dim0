/**
 * LLM acquisition for the client agent, routed through the service resolver.
 *
 * G2: managed transport is live. A signed-in user with no BYOK key resolves to
 * the managed LLM (our keys, server-resolved model + tiers); a BYOK key wins by
 * default; signed-out with no key is off. The agent loop downstream is unchanged
 * — it just receives an `LlmClient`.
 */
import type { ByokConfig } from "../byok-client"
import type { LlmClient } from "../types"
import { managedLlmClient } from "../managed-client"
import { llmClientFromResolution } from "./clients"
import { resolveService } from "./resolve"


export type AgentLlmOptions = { signedIn: boolean }


/** Build the agent's LLM client from a BYOK config + auth, via the resolver. */
export const resolveAgentLlm = (
  config: ByokConfig | null,
  opts: AgentLlmOptions,
): LlmClient | null => {
  const resolution = resolveService("llm", {
    signedIn: opts.signedIn,
    // LLM managed is allowed whenever signed in; the server enforces plan tiers.
    byok: config
      ? { llm: { provider: config.provider, apiKey: config.apiKey, model: config.model } }
      : {},
  })
  return llmClientFromResolution(resolution, (r) => managedLlmClient(r.model ?? "auto"))
}
