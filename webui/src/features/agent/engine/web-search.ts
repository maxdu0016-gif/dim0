/**
 * Web search as a service (G3) — a managed `SearchClient` + the `web_search`
 * agent tool + resolution.
 *
 * Managed-only in practice: search providers block browser CORS and our rule
 * forbids relaying a user's key, so BYOK web search isn't viable from the
 * browser. The `search` service therefore resolves to managed (signed in) or
 * off; the server (`/ai/search`) runs it with our keys. The BYOK seam stays in
 * the resolver for any provider that ever allows direct browser calls.
 */
import { z } from "zod"
import { apiFetch } from "@/api"
import { defineTool, type AgentEvent, type Tool } from "./types"
import type { SearchClient, SearchResult } from "./services/clients"
import { resolveService } from "./services/resolve"


type SearchResponse = { answer: string; results: SearchResult[] }


/** POST a query to `/ai/search`. Injectable for tests. */
export type SearchPost = (body: { query: string; engine?: string }) => Promise<SearchResponse>


const defaultSearchPost: SearchPost = async (body) => {
  const res = await apiFetch<{ data: SearchResponse }>({ path: "/ai/search", method: "POST", body })
  return res.data
}


/** Managed web-search client — our keys, via the `/ai/search` proxy. */
export const managedSearchClient = (post: SearchPost = defaultSearchPost, engine?: string): SearchClient => ({
  async search(query: string): Promise<SearchResult[]> {
    const { results } = await post({ query, ...(engine ? { engine } : {}) })
    return results
  },
})


/** Resolve the search service to a client, or null when unavailable. */
export const resolveSearchClient = (opts: { signedIn: boolean }): SearchClient | null => {
  const resolution = resolveService("search", { signedIn: opts.signedIn, byok: {} })
  return resolution.mode === "managed" ? managedSearchClient() : null
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
