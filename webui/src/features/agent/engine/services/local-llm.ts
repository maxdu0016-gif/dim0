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
import { agentResolveContext } from "./context"
import { resolveService } from "./resolve"


export type AgentLlmOptions = { signedIn: boolean; runId?: string }


/**
 * Build the agent's LLM client from a BYOK config + auth, via the resolver.
 * "Our keys first": signed in → managed even with a saved key; signed out → the
 * saved key (BYOK), or null when there's neither.
 */
export const resolveAgentLlm = (
  config: ByokConfig | null,
  opts: AgentLlmOptions,
): LlmClient | null => {
  const resolution = resolveService("llm", agentResolveContext({ signedIn: opts.signedIn, llm: config }))
  return llmClientFromResolution(resolution, (r) =>
    managedLlmClient(r.model ?? "auto", { runId: opts.runId }),
  )
}
