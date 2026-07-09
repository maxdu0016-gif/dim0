/**
 * Managed LLM client (G2) — the agent's LLM turn routed through OUR server.
 *
 * Instead of calling a provider directly (BYOK), a managed turn POSTs to
 * `/ai/llm`, which forwards to the provider with our keys and resolves the model
 * (multi-provider, `"auto"` routing, per-plan tier gating). Because the wire is
 * OpenAI-shaped, this is just a different `ChatCompleter` behind the SAME
 * `ByokLlmClient` — the message/tool mapping is reused verbatim, only the
 * transport differs. Metering (per run) + streaming land in later slices.
 */
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions"
import { apiFetch } from "@/api"
import { ByokLlmClient, type ChatCompleter } from "./byok-client"
import type { LlmClient } from "./types"


/** Post one turn to `/ai/llm`; returns the OpenAI-shaped choices. Injectable for tests. */
export type LlmTurnPost = (body: {
  model: string
  messages: unknown
  tools?: unknown
}) => Promise<{ choices: ChatCompletion["choices"] }>


const defaultPost: LlmTurnPost = async (body) => {
  const res = await apiFetch<{ data: { choices: ChatCompletion["choices"] } }>({
    path: "/ai/llm",
    method: "POST",
    body,
  })
  return res.data
}


/** A `ChatCompleter` that forwards to `/ai/llm` (our keys) instead of a provider. */
export const createManagedCompleter = (post: LlmTurnPost = defaultPost): ChatCompleter => ({
  async create(params: ChatCompletionCreateParamsNonStreaming): Promise<ChatCompletion> {
    const result = await post({
      model: params.model,
      messages: params.messages,
      ...(params.tools ? { tools: params.tools } : {}),
    })
    return { choices: result.choices } as ChatCompletion
  },
})


/**
 * Build a managed LLM client. `model` is a canonical catalog id or `"auto"`; the
 * SERVER resolves it to a concrete provider model within the plan's tiers.
 */
export const managedLlmClient = (model: string, post?: LlmTurnPost): LlmClient =>
  new ByokLlmClient(createManagedCompleter(post), model)
