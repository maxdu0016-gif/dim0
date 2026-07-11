/**
 * Web search as a service — a managed `SearchClient` + the `web_search` agent
 * tool + resolution.
 *
 * The provider APIs aren't browser-reachable (CORS), so search always goes
 * through `/ai/search`. "Our keys first, yours as fallback": a signed-in user
 * hits our proxy with our keys; if that's over quota (429) and the user has a
 * BYOK search key, the same call is retried with `X-Provider-Key` (relayed,
 * not stored). Signed-out has no authed proxy → off.
 */
import { z } from "zod"
import { apiFetch } from "@/api"
import { defineTool, type AgentEvent, type Tool } from "./types"
import type { SearchClient, SearchResult } from "./services/clients"
import { resolveService } from "./services/resolve"
import { isOverQuotaError, runIdHeaders } from "./services/run"


type SearchResponse = { answer: string; results: SearchResult[] }


/** POST a query to `/ai/search`. Injectable for tests. */
export type SearchPost = (body: { query: string; engine?: string }) => Promise<SearchResponse>


const makeDefaultSearchPost = (runId?: string, byokKey?: string): SearchPost => async (body) => {
  const call = (extra?: Record<string, string>) =>
    apiFetch<{ data: SearchResponse }>({
      path: "/ai/search",
      method: "POST",
      body,
      headers: { ...runIdHeaders(runId), ...extra },
    })
  try {
    return (await call()).data
  } catch (e) {
    // Over our quota → fall back to the user's own key (relayed, not stored).
    if (byokKey && isOverQuotaError(e)) return (await call({ "X-Provider-Key": byokKey })).data
    throw e
  }
}


/** Managed web-search client — our keys via `/ai/search`, BYOK key as fallback. */
export const managedSearchClient = (
  opts: { runId?: string; engine?: string; byokKey?: string; post?: SearchPost } = {},
): SearchClient => {
  const post = opts.post ?? makeDefaultSearchPost(opts.runId, opts.byokKey)
  return {
    async search(query: string): Promise<SearchResult[]> {
      const { results } = await post({ query, ...(opts.engine ? { engine: opts.engine } : {}) })
      return results
    },
  }
}


/** Resolve the search service to a client, or null when unavailable. */
export const resolveSearchClient = (opts: {
  signedIn: boolean
  runId?: string
  byok?: { engine: string; apiKey: string } | null
}): SearchClient | null => {
  const resolution = resolveService("search", { signedIn: opts.signedIn, byok: {} })
  if (resolution.mode !== "managed") return null
  return managedSearchClient({ runId: opts.runId, engine: opts.byok?.engine, byokKey: opts.byok?.apiKey })
}


/** Collect the source URLs the `web_search` tool surfaced across a run (deduped,
 *  in order) — fed to citation correction so the answer's links are the real ones. */
export const collectWebSearchSources = (events: AgentEvent[]): string[] => {
  const urls: string[] = []
  const seen = new Set<string>()
  for (const ev of events) {
    if (ev.type !== "tool_result" || ev.toolName !== "web_search") continue
    const results = (ev.result as { results?: { url?: unknown }[] } | undefined)?.results
    for (const r of results ?? []) {
      const url = typeof r.url === "string" ? r.url : null
      if (url && !seen.has(url)) {
        seen.add(url)
        urls.push(url)
      }
    }
  }
  return urls
}


/** The `web_search` agent tool, backed by a resolved search client. */
export const makeWebSearchTool = (client: SearchClient): Tool =>
  defineTool({
    name: "web_search",
    description:
      "Search the web for current or external information. Returns sources (url + title + snippet) to ground and cite the answer.",
    parameters: z.object({ query: z.string().describe("The search query") }),
    run: async ({ query }) => {
      const results = await client.search(query)
      return {
        results: results.map((r) => ({ url: r.url, title: r.title, content: r.content })),
      }
    },
  })
