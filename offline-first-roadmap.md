# Offline-First Roadmap — All Phases

Master tracking doc for the offline-first + local-agent refactor. Companion to
`offline-first-architecture.md` (decisions), `offline-first-data-model.md`
(storage), `offline-first-phase-a-plan.md` (Phase A detail), and
`agent-engine-rewrite.md` (agent design).

> **Status legend:** ✅ done · 🟡 in progress · ⬜ not started

---

## Guiding principles (decided)

1. **One path, not two modes.** The frontend is always the complete app — it
   owns the data (IndexedDB), runs the agent loop (TypeScript), and persists
   locally. The backend is never a brain. There is no permanent "local mode vs
   online mode"; there is the local app, with optional transports attached.

2. **The backend is a post office, not a factory.** When it returns it does
   exactly two dumb things, each a config swap behind a narrow interface:
   - **Inference relay** — forward LLM calls and attach *our* key (vs BYOK).
   - **Sync relay** — move *opaque* ops between clients and store them. It never
     interprets, computes on, or owns board data. (Could be E2E-encrypted and
     the relay wouldn't know.)

3. **No mid-refactor deploy.** We ship only when the whole thing (offline-first
   + local runtime) is ready. So there are no live users to protect during the
   refactor → we don't preserve the backend path; we delete it. The branch may
   be incomplete for a while, then we ship once.

4. **BYOK unblocks development.** The full local app is built and verified with
   the user's own key. The managed inference relay is a **pre-launch** item, not
   a blocker for building.

5. **Switch at the data edge, never per-component.** Local/backend selection
   lives in one place (the `local` flag on `ChatProvider`, read by data hooks),
   so UI components stay transport-agnostic and reused as-is.

6. **The codebase should shrink.** End state ≈ 8k LOC frontend, replacing
   ~14.5k LOC of backend + legacy. Net −6.5k while gaining offline-first.

---

## Status snapshot

| Phase | Title | Status |
|---|---|---|
| A | Local boards + persistence + local agent engine | ✅ done |
| B | One agent path · chat parity · history · settings | 🟡 nearly done |
| B-agent | Agent capability parity: system prompt + skills + rich note tools | 🟡 core done |
| C | Board management (local dashboard / CRUD / folders) | ⬜ |
| D | Board aux features local (search · thumbnails · widgets) | ⬜ |
| E | Sync transport (collab relay) — **the spine** | ⬜ |
| F | Managed inference relay + auth/identity | ⬜ (pre-launch) |
| G | Backend teardown + data migration | ⬜ (pre-launch) |
| H | Cutover hardening + polish (settings redesign) | ⬜ |

Measured surface (for grounding): local stack built ≈ 2,588 LOC · backend API
hooks ≈ 3,425 · chat components reused ≈ 3,632 · backend Python deletion
candidates ≈ 11,500.

---

## Phase A — Local boards + persistence + local agent engine ✅

**Goal.** A `/local` board fully functional with zero backend: open, edit,
persist, and an in-browser agent that manipulates the board.

**Built.**
- IndexedDB persistence: snapshot + op-log (WAL+checkpoint pattern), codec,
  board registry, `openBoard`, debounced compaction. 9 invariants, fuzz-tested.
- TS data model (`DimNode`/`DimEdge`/`BoardContent`/…); dim fields ride in
  canvas-harness `node.data`.
- Local agent engine: `LlmClient` (BYOK, OpenAI-compatible), `runAgent` loop,
  tools (create/update/link), `AgentEvent` → `ReasoningStep[]` adapter.
- Chat persistence: `chats` + `chat_messages` stores; transcript survives reload.
- `/local` + `/local/$boardId` routes; bare root-layout (no shell/connection).

**Verification.** Fuzz invariants green; unit + integration; full suite.

---

## Phase B — One agent path · chat parity · history · settings 🟡

**Goal.** Retire the bolt-on local agent UI; run the *real* chat components on
the in-browser engine, switched at the data edge. Full parity with the online
floating-island + sheet, including chat history.

**Built.**
- `local` flag on `ChatProvider`; local-aware data hooks: `useChatMessages`,
  `useChatStreaming`, `useChatSubmit`, `useActiveChatId`.
- Repointed real components (floating-island, answer-card, progress-line,
  `Conversation`, `use-current-assistant-message`) onto those hooks. Backend
  path byte-identical when `local=false`.
- Full sheet reuses `<Chat>` (history dropdown + transcript + docked input);
  island hides while the sheet is open (parity).
- **Chat history:** `chatUid` decoupled from `boardId` (many chats per board);
  IndexedDB v3 (`by-board` index + `label`); `listLocalChats`; multi-chat local
  store (`openBoard`/`selectChat`/`newChat`); first turn mints + labels a chat.
- Settings: `ByokSettingsButton` (gear → provider/model/key) replaces the
  backend tools menu for local; deep-research gated off.
- Default model `gpt-5.4`; `DEFAULT_MAX_TURNS = 30`.
- Deleted the `LocalConversation` twin + `LocalAgentPanel`.

**Agent scope.** The **build toolset** (`create_note` / `update_note` /
`link_notes`) — fully functional. The *query* tools (`search_notes`,
`list_boards`) are deferred to where their infrastructure lands: `list_boards`
→ Phase C (needs the board registry), `search_notes` → Phase D (needs the live
search index). Both already exist in `engine/tools.ts`; they just need their ctx
wired + `ToolName` rendering, done alongside that infra.

**Verification.** Type-check + 365 tests; network tab shows zero backend calls
on `/local`; live render check.

---

## Phase B-agent — Agent capability parity (prompts + skills + rich tools) 🟡

**Goal.** Bring the backend's agent design to the frontend so the local agent is
the *real* assistant (mindmaps, diagrams, mini-apps), not a plain-note maker.

**Built.**
- **Prompt system:** ported `plan.system` → `agent/prompts/plan-system.md`
  (local-adapted — backend-only tools trimmed: web/memory/code/image/widgets),
  loaded via `?raw` + a tiny `renderPrompt` (`{{var}}`). The local agent now
  runs *with* a system prompt (it had none — the biggest quality gap).
- **Skills (progressive disclosure):** ported the 3 skill prompts (diagram /
  mini-app / html-widget) as `?raw` modules; `learn_generate_*` tools return the
  guidance on demand — exact mirror of backend `learn.py`.
- **Rich note tools:** `write_note` (typed: rectangle/sheet/mini-app/widget,
  create or rewrite), `get_note`, `edit_note` (targeted unique-snippet replace).
  Wired into the agent toolset; adapter renders them through the existing cards.

**Remaining / deferred.**
- Mini-app client-side validation (sucrase) before write — currently the node
  renders and the agent self-corrects on a render error (backend parity).
- `ellipse`/`diamond` node shapes fall back to rectangle for now.
- Prompts are canonical here; backend copies deleted in Phase G.

**Verification.** Type-check + tests (note tools, skill loaders, prompt render +
local-trim); live BYOK check that the agent builds mindmaps/mini-apps.


## Phase C — Board management (local dashboard / CRUD / folders) ⬜

**Goal.** Full board lifecycle on the local registry, reusing the real
dashboard UI.

**Work.**
- Local registry CRUD: create / rename / delete / move boards.
- Folder model in IndexedDB; nesting.
- Repoint the dashboard UI at local hooks (list/create/move), gated by transport.
- Board-list ordering, recents, empty states.
- Wire the **`list_boards`** agent tool (registry into the agent ctx) + its
  `ToolName` rendering.

**Key files.** `board/local/use-local-boards`, `local-dashboard`, board registry,
dashboard components (repoint).

**LOC.** ~700 new · ~150 deleted. **Risk.** Low-med.

**Verification.** CRUD round-trips in IndexedDB; reload persistence; dashboard
renders local boards.

---

## Phase D — Board aux features local ⬜

**Goal.** Kill the remaining per-board backend calls so a board is fully local.

**Work.**
- Local full-text search (Orama, built in A) wired into the **live board**
  (index attached + kept in sync on edits) and the board search UI.
- Wire the **`search_notes`** agent tool (live index into the agent ctx) + its
  `ToolName` rendering.
- Client-side **thumbnails** (render → store in IndexedDB).
- Note widgets / images served locally.

**LOC.** ~550 new · ~150 deleted. **Risk.** Low-med.

**Verification.** Search returns local results; thumbnails generate offline;
widgets render with no network.

---

## Phase E — Sync transport (collab relay) — **the spine** ⬜

**Goal.** Real-time collaboration as an *optional adapter* behind local-first
data. Local stays the source of truth; the network moves opaque ops.

**Work.**
- Frontend `SyncAdapter` ⇄ relay client (subscribe/publish ops).
- Cloudflare Durable Object / PartyKit **relay server** (authorizing, not P2P).
- Op fan-out + **HLC** ordering + **origin-echo filtering** (no self-echo).
- **Read-only / permission enforcement** at the relay (owner shares; readers
  can't override).
- Reconnect / backfill / catch-up after offline.
- **Fuzzed multi-client convergence tests** (same discipline as A's invariants).

**LOC.** ~1,700 new · ~200 deleted. **Risk.** **High** — the only genuinely
hard part (convergence, echo, permissions). Budget the most test investment here.

**Verification.** Two+ clients converge under concurrent edits; offline→online
catch-up; read-only enforced server-side; fuzz convergence green.

---

## Phase F — Managed inference relay + auth/identity ⬜ (pre-launch)

**Goal.** Non-BYOK inference + identity. The single piece that flips local from
"BYOK only" to "universal," after which BYOK vs managed is one `LlmClient` config.

**Work.**
- Cloudflare **inference worker**: verify session token, attach our key, stream
  the response (OpenAI-compatible passthrough). ~50–150 LOC.
- Session token issue / verify; rate-limit / bill hooks.
- Managed-plane login / identity.
- `LlmClient` managed config (`baseUrl: relay`, `Authorization: token`).
- **Model catalog** endpoint → unlocks the settings-panel redesign (Phase H).

**LOC.** ~700 new. **Risk.** Med.

**Verification.** Frontend agent runs for a non-BYOK user via the relay; key
never reaches the browser; rate-limit enforced.

---

## Phase G — Backend teardown + data migration ⬜ (pre-launch)

**Goal.** Reduce the backend to relay + storage; migrate existing data.

**Work.**
- Delete the old assistant agent + collab logic (~11,500 LOC Python).
- Rewrite storage to a **dumb keyed store** (boards/ops/blobs; no manipulation).
- Migrate Postgres/Qdrant boards + chats → the synced local-first format.

**LOC.** ~800 new · **~11,000 deleted**. **Risk.** Med-high (migration).

**Verification.** Migrated boards open locally and sync; storage has no
business logic; staging migration dry-run.

---

## Phase H — Cutover hardening + polish ⬜

**Goal.** Collapse to one path; ship-ready.

**Work.**
- Delete legacy `/board` routes/components + dead backend hooks (~3,000 LOC).
- **Settings panel redesign** (the polish item): one panel — *Keys · Model
  (catalog dropdown) · Tools (toggles)* — replacing `ByokPanel` + online
  `ToolsMenu`, gated by transport. (Depends on F's model catalog.)
- e2e suite (Playwright) on CI; prod build with adequate Node heap.
- Service-worker / offline verification; perf pass.

**LOC.** ~550 new · ~3,000 deleted. **Risk.** Med.

**Verification.** e2e green on CI; offline cold-start works; one code path.

---

## Totals & sequencing

- **New (B→H):** ~5,450 LOC on top of A's 2,588 → end-state ≈ **8,000 LOC**.
- **Deleted:** ~14,500 LOC (≈11,500 backend + ~3,000 legacy frontend).
- **Net: ~−6,500 LOC** — smaller system, with offline-first + local agent.

**Order of operations.**
- **B → C → D → E** are all buildable/verifiable on **BYOK** today — no relay
  needed. E is the spine; everything else is mechanical migration.
- **F + G** are the **pre-launch tail** — they only matter at deploy time. Since
  we don't ship mid-refactor, they come last, after B–E prove the local-first
  app end-to-end.
- **H** collapses everything to one path and folds in polish (settings redesign,
  e2e, offline hardening). Ship once, here.

**Branch hygiene.** Long-lived refactor branch while `main` moves — rebase
periodically so the eventual merge isn't a big bang.
