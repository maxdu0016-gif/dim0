import { describe, expect, it } from "vitest"
import { desktopLinkupSearch, desktopSearchPost } from "./desktop-search"


describe("desktopLinkupSearch", () => {
  it("posts to Linkup with the BYOK key and maps results to the /ai/search shape", async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: url as string, init })
      return new Response(
        JSON.stringify({
          results: [
            { url: "https://a.com", name: "A", content: "alpha" },
            { url: "https://b.com" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }) as typeof fetch

    const res = await desktopLinkupSearch("sk-linkup", fakeFetch)({ query: "hello" })

    expect(res.results).toEqual([
      { url: "https://a.com", title: "A", content: "alpha" },
      { url: "https://b.com", title: "", content: "" },
    ])
    expect(calls[0].url).toBe("https://api.linkup.so/v1/search")
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBe("Bearer sk-linkup")
    expect(JSON.parse(calls[0].init?.body as string)).toMatchObject({
      q: "hello",
      outputType: "searchResults",
    })
  })


  it("throws with the provider status on a non-2xx reply", async () => {
    const fakeFetch = (async () => new Response("nope", { status: 401 })) as typeof fetch
    await expect(desktopLinkupSearch("bad", fakeFetch)({ query: "x" })).rejects.toThrow(/401/)
  })
})


describe("desktopSearchPost", () => {
  it("returns a client for a ported engine (linkup) and null otherwise", () => {
    expect(desktopSearchPost("linkup", "k")).toBeTypeOf("function")
    expect(desktopSearchPost("tavily", "k")).toBeNull()
    expect(desktopSearchPost(undefined, "k")).toBeNull()
  })
})
