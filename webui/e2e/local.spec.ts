import { test, expect } from "@playwright/test"


/** A mocked OpenAI-compatible response: turn 1 calls create_note, turn 2 finishes. */
const mockCompletion = (toolCall: boolean) => ({
  id: "x",
  object: "chat.completion",
  created: 0,
  model: "m",
  choices: [
    {
      index: 0,
      finish_reason: toolCall ? "tool_calls" : "stop",
      message: toolCall
        ? {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "c1", type: "function", function: { name: "create_note", arguments: JSON.stringify({ title: "From agent" }) } },
            ],
          }
        : { role: "assistant", content: "Done." },
    },
  ],
})


test.describe("local-only boards (no account, frontend-only)", () => {
  test("create a board with no account; it persists across reload", async ({ page }) => {
    await page.goto("/local")
    await expect(page.getByRole("heading", { name: "Local boards" })).toBeVisible()

    await page.getByRole("button", { name: "New board" }).click()
    await expect(page).toHaveURL(/\/local\/.+/)

    await page.goto("/local")
    await expect(page.getByText("Untitled board")).toBeVisible()

    await page.reload()
    await expect(page.getByText("Untitled board")).toBeVisible() // survived (IndexedDB)
  })


  test("a local session never calls the board/chat backend", async ({ page }) => {
    const backendHits: string[] = []
    page.on("request", (req) => {
      const { host, pathname } = new URL(req.url())
      const isLocal = host.startsWith("localhost") || host.startsWith("127.")
      if (!isLocal && /\/(chats|boards|messages|sync|graphs)\b/.test(pathname)) {
        backendHits.push(req.url())
      }
    })

    await page.goto("/local")
    await page.getByRole("button", { name: "New board" }).click()
    await expect(page).toHaveURL(/\/local\/.+/)
    await page.waitForTimeout(800)

    expect(backendHits).toEqual([])
  })


  test("agent builds a note via a mocked provider (BYOK)", async ({ page }) => {
    let turn = 0
    await page.route("**/chat/completions", async (route) => {
      turn += 1
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCompletion(turn === 1)) })
    })

    await page.goto("/local")
    await page.getByRole("button", { name: "New board" }).click()
    await expect(page).toHaveURL(/\/local\/.+/)

    // BYOK: enter a key
    await page.getByPlaceholder(/sk-/).fill("sk-test-123")
    await page.getByRole("button", { name: "Save" }).click()

    // ask the agent
    await page.getByPlaceholder(/Ask the agent/).fill("create a note")
    await page.getByRole("button", { name: "Send" }).click()

    // the tool ran, end to end, in a real browser
    await expect(page.getByText("✓ create_note")).toBeVisible()
  })
})
