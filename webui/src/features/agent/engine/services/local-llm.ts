/**
 * LLM acquisition for the local agent, routed through the service resolver.
 *
 * G1: managed transport isn't wired yet, so this yields the BYOK client (or
 * null) — identical to the prior direct `ByokLlmClient.fromConfig`, but now
 * through the resolver seam. G2 replaces the hard-coded `managed off` with real
 * auth + entitlement + a managed-client maker, and everything downstream is
 * unchanged.
 */
import type { ByokConfig } from "../byok-client"
import type { LlmClient } from "../types"
import { llmClientFromResolution } from "./clients"
import { resolveService } from "./resolve"


/** Build the local agent's LLM client from a BYOK config, via the resolver. */
export const resolveLocalLlm = (config: ByokConfig | null): LlmClient | null => {
  const resolution = resolveService("llm", {
    signedIn: false, // G1: managed not yet available — BYOK-or-off, as before
    managedAllowed: () => false,
    byok: config
      ? { llm: { provider: config.provider, apiKey: config.apiKey, model: config.model } }
      : {},
  })
  return llmClientFromResolution(resolution)
}
