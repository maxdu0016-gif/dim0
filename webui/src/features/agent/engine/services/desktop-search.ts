/**
 * Desktop-direct BYOK web search — calls the provider straight from the Tauri
 * webview (CORS-free via plugin-http), returning the same shape `/ai/search`
 * does, so the search client is unchanged. This is what lets web search work
 * fully offline-of-our-servers on desktop with the user's own key.
 *
 * Only providers ported here work desktop-direct; an unported engine falls back
 * to the (online) `/ai/search` path. Extend `DESKTOP_SEARCH` as more are ported.
 */
import { providerPostJson, type FetchFn } from "./desktop-http"
import type { SearchResult } from "./clients"


type SearchResponse = { answer: string; results: SearchResult[] }
type SearchPost = (body: { query: string; engine?: string }) => Promise<SearchResponse>

type LinkupResult = { url: string; name?: string; content?: string; favicon?: string }


/** Direct Linkup search (BYOK), mapped to the `/ai/search` reply shape. */
export const desktopLinkupSearch =
  (apiKey: string, fetchImpl?: FetchFn): SearchPost =>
  async (body) => {
    const res = await providerPostJson<{ results?: LinkupResult[] }>(
      "https://api.linkup.so/v1/search",
      { q: body.query, outputType: "searchResults", depth: "standard" },
      { Authorization: `Bearer ${apiKey}` },
      fetchImpl,
    )
    return {
      answer: "",
      results: (res.results ?? []).map((r) => ({
        url: r.url,
        title: r.name ?? "",
        content: r.content ?? "",
      })),
    }
  }


/** Ported desktop-direct BYOK search providers, keyed by engine id. */
const DESKTOP_SEARCH: Record<string, (apiKey: string) => SearchPost> = {
  linkup: (apiKey) => desktopLinkupSearch(apiKey),
}


/**
 * A desktop-direct `SearchPost` for the engine, or `null` if that engine isn't
 * ported yet (caller then keeps the online `/ai/search` path).
 */
export const desktopSearchPost = (engine: string | undefined, apiKey: string): SearchPost | null => {
  const make = engine ? DESKTOP_SEARCH[engine] : undefined
  return make ? make(apiKey) : null
}
