# Agent Engine Rewrite — Frontend Orchestration + BYOK

> Companion to [offline-first-architecture.md](offline-first-architecture.md) and
> [offline-first-phase-a-plan.md](offline-first-phase-a-plan.md) (this is the
> design behind Phase A's **A4**). Grounded in a full read of the frontend agent
> feature and the backend agent system.

---

## Goal

Move agent **orchestration** into the frontend; make **all tools ours** and
**local** (they mutate the local CRDT store); start with **BYOK** (user enters an
OpenAI *or* OpenRouter key). Delete the backend machinery this makes redundant.

## The key finding: the UI is reusable, the orchestration isn't there

You pushed back that the frontend agent is "actually quite simple." **Confirmed.**
Of its ~6,874 LOC:

| Bucket | LOC | Fate |
|---|---|---|
| Pure UI — conversation, messages, tool-step rows, input, settings, widgets, actions | ~4,000 | **KEEP** |
| Streaming consumer + accumulator (`utils/stream/build.ts`, types) | ~700 | **KEEP** |
| Types / store / hooks | ~800 | **KEEP** |
| **API/orchestration layer** (`api/send-message.ts` + CRUD + `digest.ts` NDJSON reader) | ~1,300 | **SWAP** |

The UI is **presentation-heavy but orchestration-light**: it's a streaming
consumer of an `AgentStreamMessage` NDJSON stream from `POST /chats/{id}/messages`.
It does **not** care whether those chunks come from HTTP or an in-process
generator. So:

> **Keep the entire UI. Swap only the source of the stream** — replace the
> fetch-to-backend (`send-message.ts` + `digest.ts`) with an in-process agent
> loop that yields the *same* `AgentStreamMessage` chunks into the existing
> `build.ts` accumulator.

The real work isn't "rewrite 6.9k LOC" — it's **add a frontend engine** and
**delete backend code**.

## What the streaming contract is (and stays)

- Wire/chunk shape: `AgentStreamMessage { type, toolId, toolName, content:{type,text,annotations}, is_stop }` (`types/stream.ts`).
- `build.ts` accumulates chunks → `AgentResponse { steps: ReasoningStep[] }`; the UI renders `ReasoningStep` / `ToolCallStep`.
- **Engine emits these chunks directly** (no NDJSON, no `digest.ts`). `build.ts`, `types/*`, and all rendering are unchanged.

## The frontend agent engine (new — `features/agent/engine/`)

```
agent/engine/
  agent-loop.ts        build messages → call LLM → parse tool calls → run tools → loop → emit chunks
  llm/byok-client.ts   OpenAI-compatible streaming client (OpenAI | OpenRouter), tool-calling
  tools/               OUR tools, executed LOCALLY against the canvas store
    create-note.ts     store.addNode(...)        (persisted by A1, indexed by A5)
    update-note.ts     store.updateNode(...)
    link-notes.ts      store.addEdge(...)
    search-notes.ts    LocalSearchIndex.query()  (A5)
    list-boards.ts     BoardRegistry.listBoards() (A2)
```

- Each tool run is wrapped in `store.batch()` → **one undoable batch** per agent
  action (INV-8), and flows through the same persistence + sync pipeline as user
  edits (so the agent inherits the user's ACL — see architecture doc).
- The loop emits `AgentStreamMessage` chunks (tool start/output/tokens) so the UI
  lights up exactly as today.

## BYOK: should we switch to the Claude SDK? **No.**

The backend model service (`config/catalog.py`) is already **OpenAI-compatible**
for OpenAI/OpenRouter (`openai_compatible_client()` → `AsyncOpenAI`). BYOK is an
OpenAI or OpenRouter key. So:

> Use **one OpenAI-compatible client** in the frontend (the `openai` SDK pointed
> at `api.openai.com` or `openrouter.ai/api/v1`). It covers **both** BYOK
> providers — and **OpenRouter reaches Claude/Gemini/etc.**, so users get Claude
> models without us adopting the Anthropic SDK.

The Anthropic SDK would only earn its place on a *direct-Anthropic our-key* path
(Phase B proxy), not for BYOK. Keep the client surface single and OpenAI-shaped.

### BYOK key-entry UI

A settings panel (extends the existing `input-settings/`):
- Enter **OpenAI key** or **OpenRouter key** + pick a model.
- Stored **in-memory by default**; opt-in "remember on this device" → the A0
  `settings` IndexedDB store.
- **Never sent to our servers** (the one-home rule — see architecture doc). The
  client calls the provider directly. Disclose this in the panel.
- Replaces the current "services fetched from backend" flow in `chat-store.ts`
  with a local BYOK config + a small static model list.

### Normalization: OpenRouter (BYOK) vs LiteLLM (our-key)

Models diverge on hidden params (temperature/penalties/reasoning, `max_tokens` vs
`max_completion_tokens`, tool-calling support). LiteLLM and OpenRouter do the
**same** normalization — translate the OpenAI envelope + tool format, drop
unsupported params. **Neither can make a model support a param it lacks**; the
residual divergence is a *model* property, not a gateway gap. So they're at parity
on the OpenAI-compatible surface.

We bound the surface ourselves: (1) a **curated** short list of verified,
tool-capable models; (2) a **minimal** request (messages/model/stream/tools/
tool_choice), avoiding divergent params; (3) a tiny per-model **capability map**
ported from backend `base.py` (the valuable 20%). And we don't lose LiteLLM — it
**stays on the backend** (catalog/base.py) for the our-key proxy (Phase B);
OpenRouter is used only on the BYOK-direct browser path (where LiteLLM, being
Python, can't run). Each curated model gets a real smoke test in A7.

## Tools: local-first, with web search as the one online exception

Per the no-RAG + local-only-tools decisions:

| Tool | Where it runs | v1? |
|---|---|---|
| `create_note` / `update_note` / `link_notes` | **local** (canvas store) | ✅ |
| `search_notes` | **local** (Orama, A5) — replaces backend `memory_search`/Qdrant | ✅ |
| `list_boards` | **local** (registry, A2) | ✅ |
| `web_search` (Linkup) | **server** — needs a key + no CORS; one thin `/tools/web_search` endpoint | fast-follow |
| code interpreter / image gen / widgets | server/provider | ❌ later |

`web_search` is the lone legitimate server tool (it's online anyway, like the LLM
call). For BYOK v1, ship the local tools first; add the `web_search` endpoint as a
fast-follow (it reuses the existing Linkup client).

## Backend: delete a lot (this is the win)

Because tools are local and orchestration is in the frontend, the backend
**shrinks dramatically**:

| Backend module | LOC | Action |
|---|---|---|
| `agents/assistant/manager.py` | 471 | **REMOVE** — orchestration → frontend |
| `agents/assistant/plan.py` | 140 | **REMOVE** — tool composition → frontend |
| `agents/assistant/auto_model.py` | 209 | **REMOVE** — BYOK user picks the model |
| `agents/tool_handler.py` | 488 | **REMOVE** — SDK tool-wrapping → frontend |
| `agents/deep_research.py` | 244 | **REMOVE** — feature dropped |
| `agents/mindmap/` | ~476 | **REMOVE** — layout → frontend |
| `agents/notes/layout.py` | 634 | **REMOVE** — igraph Sugiyama → frontend (deps already present: `@dagrejs/dagre`, `d3-hierarchy`, `d3-force`) |
| `agents/notes/tools.py` + `service.py` | ~630 | **REMOVE** — note ops are now local store mutations |
| `agents/memory/search.py` | ~150 | **REMOVE** — no-RAG; local Orama instead |
| `agents/websearch/tools.py` (Linkup/Tavily/…) | 397 | **KEEP** — back the `/tools/web_search` endpoint |
| `agents/websearch/handler.py` + `openai.py` | ~250 | **SIMPLIFY/REMOVE** — drop provider-native search wrapper |
| `config/catalog.py` + `models.yml` + `base.py` | ~590 | **KEEP** — for the our-key proxy path (Phase B); not on the BYOK path |
| `api/router/chats.py` send_message orchestration | part of 302 | **REMOVE** orchestration; chat history → local IndexedDB (persisted) |

Net: roughly **~3,500+ LOC of backend agent code retired** (manager/plan/
auto_model/tool_handler/deep_research/mindmap/layout/notes-tools/memory), on top
of the embeddings/Qdrant path already dropped. The model catalog + Linkup client
survive as the only meaningful backend agent pieces.

## Principle: the agent runtime is ALWAYS frontend (one path, not a mode)

There is **no permanent "backend agent" mode**. The backend's only future
inference role is the **key-proxy** (attach key, forward, stream). So the chat —
**including the floating-island** — runs the *frontend* engine, for every board.
The existing `send-message → manager.py` path is **transitional legacy being
retired**, not a mode to keep.

> One agent runtime (frontend). The only variable is the LLM **transport**:
> BYOK-direct (now) or our-key-proxy (Phase B). The floating-island is *migrated*
> to the frontend engine (transport-switchable), reused for local now + online
> later — not parameterized to preserve a backend that's going away.

Transition only: online boards keep the legacy backend agent until Phase B builds
the proxy + retires `manager.py`; then they switch to the same frontend engine.

## Chat history is PERSISTED (mirror the backend), not ephemeral

Confirmed in `store/chat.py`: the backend persists **chat metadata → Postgres**
and **messages → Qdrant** (`ContentStore`, tagged `chat_uid`, retrieved by a plain
metadata *filter* — a keyed store, not vector search). So persistence is "just
store the message objects."

The frontend mirrors this in **IndexedDB** — a `chats` store (metadata) + a
`chat_messages` store (keyed by `[chatUid, msgId]`) — so **local chat history
survives reloads**. It's *simpler* than the backend: no embeddings (we dropped
RAG), so the frontend only stores + reads by chat. The `chats.py` CRUD retires
with the rest of the backend agent.

## A4 build order (within Phase A)

1. **LLM mock + scripted-LLM test harness** (the A0-deferred piece): a mock
   client returning a fixed tool-call script → assert exact board state.
2. **Tools** (`create/update/link/search/list`) — pure functions over the store;
   unit-tested individually + INV-8 (undo restores prior state).
3. **agent-loop** — drive tools from scripted tool-calls; emit `AgentStreamMessage`.
4. **byok-client** — real OpenAI-compatible streaming (OpenAI/OpenRouter); behind
   the same interface the mock implements (so tests never hit a network).
5. **UI rewire** — swap `send-message.ts`/`digest.ts` for the engine generator;
   BYOK key-entry panel. (Verified live in A7/run, not unit-tested.)

## Tests (deterministic, no real LLM)

- Scripted-LLM e2e: "create 3 notes about X and link them" → exact `BoardContent`.
- Per-tool unit tests (effect on store + bad-args).
- **INV-8**: agent action → `store.undo()` → prior state exactly (reuses
  `inverse-op`, already proven in A1).
- Tool effects are **persisted** (reopen reflects them) and **indexed** (findable).
- BYOK key never appears in a request to our origin (spy); in-memory by default.

## Open questions

- **web_search auth**: our Linkup key (server, metered) vs. a BYOK Linkup key.
  Lean our-key server endpoint, gated like the inference proxy.
- **Layout port**: dagre vs. d3-hierarchy for the Sugiyama-style note arrangement
  that `notes/layout.py` did. (`@dagrejs/dagre` already a dep.)
- **Chat history**: local-only v1, or keep backend CRUD during transition?
