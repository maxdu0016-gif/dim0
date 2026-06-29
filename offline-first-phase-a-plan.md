# Phase A — Local-Only Boards: Implementation Plan

> Offline-first solo experience + frontend agent + local search, **with no
> account, no relay, no server persistence.** Built on the model in
> [offline-first-data-model.md](offline-first-data-model.md) and the architecture
> in [offline-first-architecture.md](offline-first-architecture.md).
>
> **Tests are a first-class deliverable, not an afterthought.** The persistence
> layer is where silent data loss hides; we test it like a database.

---

## Goal & exit criteria

**The demo that proves Phase A:** open the app with **no account**, go **offline**,
**create** a board, **edit** it, **search** it, have the **agent** build/organize
it (BYOK) — and it all **survives reload**, with the network tab empty (except
BYOK→provider).

**Exit criteria (all must pass):**
- [ ] All invariant tests (INV-1…INV-9 below) green, including the fuzz harness.
- [ ] The e2e demo above runs in Playwright with `context.setOffline(true)`.
- [ ] Zero requests to our origin for any local-only board operation (asserted).
- [ ] `navigator.storage.persisted() === true` after grant.

## Scope guards — explicitly OUT of Phase A

No relay · no CRDT/HLC · no accounts · no offline *queue* (no upstream exists) ·
no server persistence · no Postgres migration · no Yjs · no sharing/ACL · no
our-key proxy (BYOK-direct only). **If it needs a server, it's Phase B.**

---

## Testing strategy (the core of this plan)

### The pyramid

| Level | Tool | What it covers |
|---|---|---|
| **Unit** | Vitest | pure transforms, codecs, tool functions, index ops |
| **Integration** | Vitest + `fake-indexeddb` + fake timers | persistence engine, store↔persistence, agent loop w/ mocked LLM |
| **Property / fuzz** | Vitest + `fast-check` | the invariants — random op sequences + random reload/compact |
| **E2E** | Playwright (offline mode, route mocking) | the full demo, real IndexedDB, real service worker |

Stack note: repo already runs **Vitest** (`*.test.ts` present). Add
`fake-indexeddb`, `fast-check`, and Playwright. **No test hits a real LLM or
network** — mock at the transport boundary.

### Determinism (non-negotiable for trustworthy tests)

- Inject `clientId` + `idGenerator` into `createCanvasStore` (seeded per test).
- Mock `Date.now()` (canvas-harness stamps `batch.ts` with it) via fake timers.
- No `Math.random` in test paths; seed any randomness. Vary fuzz by seed, logged.

### The invariants (these ARE the test names)

The whole layer is judged against nine invariants. Each is a named test; the
critical ones are also fuzzed.

| ID | Invariant | Statement |
|---|---|---|
| **INV-1 Durability** | A committed batch survives reload | after `append(b)`, a fresh `open()` reflects `b` |
| **INV-2 Reconstruction** | `open(persist(state)) deepEquals state` | round-trip is lossless |
| **INV-3 Snapshot-equiv** | compact == replay-from-zero | `compact()` then `open()` == applying all ops fresh |
| **INV-4 Idempotent replay** | applying the oplog twice == once | dedupe by batch id; no double-apply |
| **INV-5 Crash-safety** | a truncated/partial write never corrupts | interrupted append → `open()` yields last *consistent* state |
| **INV-6 Board isolation** | ops on A never touch B | per-board partitioning holds under interleaving |
| **INV-7 No-network** | local-only ops issue zero requests to our origin | `fetch`/XHR spy asserts none |
| **INV-8 Undo integrity** | `inverse(batch)` restores prior state | holds for **user AND agent** ops |
| **INV-9 Index consistency** | search results == store query | after any op sequence, index ⇔ store agree |

### The single highest-value test: the model-based fuzz harness

One property test dominates the suite's value:

```
fc.assert(fc.property(arbOpSequence(), arbScheduleOfReloadsAndCompactions(),
  (ops, schedule) => {
    const store = freshStore(seededClientId)
    const persist = new BoardPersistence(fakeIDB, boardId)
    wirePersistence(store, persist)
    const reference = []                      // shadow model
    for (const step of interleave(ops, schedule)) {
      if (step.kind === 'op')      { apply(store, step.op); reference.push(step.op) }
      if (step.kind === 'reload')  { rehydrateFrom(persist) }      // INV-1,2,3
      if (step.kind === 'compact') { persist.compact() }           // INV-3
    }
    expect(snapshot(store)).toEqual(buildExpected(reference))      // INV-2
    expect(searchIndex.query('*')).toMatchStore(store)            // INV-9
  }))
```

A random sequence of mutations, reloads, and compactions that always reconverges
to the reference state catches the entire class of persistence bugs that unit
tests miss. **Write this early; it guards every subsequent change.**

---

## Work units

Each unit lists: **scope** (new/touched), **approach**, **tests**, **DoD**.

### A0 — Data-model types + test harness

**Scope (new):** `webui/src/features/board/model/` — `Node`, `Edge`, `NodeData`,
`BoardContent`, `BoardMeta`, `BoardView`, `SyncMeta`, `DataProperty` (the model
doc, as TS). Plus `webui/src/test/` helpers: `freshStore()`, `seededClientId`,
LLM mock, `fake-indexeddb` setup, `fast-check` arbitraries (`arbNode`, `arbEdge`,
`arbOpSequence`).

**Approach:** types only + harness. No behavior. Establish determinism helpers
first so every later unit is testable.

**Tests:** type-level (`tsd`/compile) + the arbitraries self-test (generate→validate).

**DoD:** model compiles; harness can spin a deterministic store + fake IDB in a test.

### A1 — Persistence engine (the heart) ⭐

**Scope (new):** `board/persist/local/` — `board-persistence.ts`
(snapshot+oplog), `idb.ts` (thin `idb` wrapper / object stores from the model
doc), `compaction.ts`, `codec.ts` (serialize OpBatch/Scene).

**Approach:**
- Object stores: `snapshots` (key boardId), `oplog` (key `[boardId, seq]`).
- `subscribe('change')` → `append(batch)` (debounced flush, atomic write).
- `open()` → load snapshot + replay oplog tail → `createCanvasStore({ initial })`.
- `compact()` every N ops / T s → write snapshot, truncate oplog (transactional).
- Idempotency: dedupe by `batch.id`; track `lastSeq`.
- Crash-safety: write oplog entry **before** ack; compaction is snapshot-then-
  truncate in **one** IDB transaction so a crash leaves either old-snapshot+full-
  oplog or new-snapshot+empty — never a gap.

**Tests (heaviest unit):**
- INV-1,2,3,4 as direct integration tests.
- INV-5: inject a transaction-abort mid-compaction → assert recovery.
- The **fuzz harness** (above) targeting INV-2,3.
- Debounce/timer behavior with fake timers (flush-on-teardown, no lost last edit).
- Large-board perf smoke (10k nodes: open < 500ms, append O(1)).

**DoD:** all persistence invariants + fuzz green; crash-abort test green.

### A2 — Local-only board lifecycle + registry

**Scope (new):** `board/local/board-registry.ts` (CRUD over `boards` store),
`board-view.ts` (camera/selection persistence). **Touched:** board open/create
routes, `listBoards` source.

**Approach:** `createBoard` (kind:'local-only', minted id), `listBoards`,
`openBoard` (wire persistence + hydrate), `deleteBoard` (cascade snapshots/oplog),
`BoardView` saved separately (per-device, not content). Works logged-out.

**Tests:**
- INV-6 (isolation) under interleaved multi-board ops (fuzz two boards).
- Create→list→reload→list (registry durability).
- Delete removes snapshots+oplog+index (no orphans) — assert stores empty.
- View state round-trips and is **not** in the content/oplog (separation test).
- Logged-out create/open works (no auth dependency).

**DoD:** full board lifecycle offline + logged-out; isolation fuzz green.

### A5 — Local search (Orama derived index)

**Scope (new):** `board/search/local-index.ts` (build/insert/update/remove/query),
persist index to `search` store; rebuild-from-store on cold start.

**Approach:** subscribe to `change` → incremental `insert/update/remove`; index is
**derived** (drop+rebuild if ever inconsistent). Persist + reload to skip rebuild.

**Tests:**
- INV-9 (index ⇔ store) fuzzed against random op sequences.
- Add/update/remove → query reflects change without reload.
- Ranking sanity (exact title > body partial).
- Cold-start rebuild from store == persisted index.
- Search works offline (INV-7 spy).

**DoD:** INV-9 fuzz green; offline query works.

### A4 — Frontend agent (orchestration + local tools + BYOK)

**Scope (new):** `features/agent/engine/` — `agent-loop.ts`, `tools/` (each tool
a pure-ish fn over the store: `createNote`, `updateNode`, `linkNodes`,
`searchNotes`, `listBoards`), `llm/byok-transport.ts` (direct streaming to
provider). **Touched:** existing agent UI/store call the new engine instead of
the backend.

**Approach:**
- Tools mutate the **local store** → ops → persisted (A1) + indexed (A5) for free.
- Agent edits wrapped in `store.batch()` → one undoable batch per action (INV-8).
- LLM via **BYOK-direct** streaming (provider SDK with browser flag / OpenRouter);
  key in-memory by default, opt-in IndexedDB (`settings`); **never** to our origin.
- Loop: build messages → stream LLM → parse tool calls → execute → append result →
  repeat until final.

**Tests (deterministic, mocked LLM):**
- **Scripted-LLM harness:** a mock returns a fixed tool-call sequence → assert
  exact resulting board state. (No real API ever.)
- Each tool: unit test of its store effect + edge cases (missing id, bad args).
- INV-8: agent action → `undo()` → prior state exactly restored.
- Agent-bounded: a tool can't exceed local store capabilities (no privileged ops).
- Tool effects are persisted (open after agent run reflects them) + indexed.
- BYOK key never appears in a request to our origin (spy); in-memory by default.
- Network-failure mid-loop: applied tool effects stay; loop fails gracefully.

**DoD:** scripted-LLM e2e of "create 3 linked notes" deterministic + green; INV-8
holds for agent ops; key-safety asserted.

### A6 — PWA / offline app shell

**Scope (new):** service worker (Vite PWA plugin) caching the app shell;
`navigator.storage.persist()` request flow.

**Approach:** precache shell; app boots with no network; request persistent
storage on first board create.

**Tests:**
- Playwright: cold load with `setOffline(true)` after first visit → app boots.
- `persisted()` true after grant (mocked permission).

**DoD:** app loads + functions fully offline after first visit.

### A7 — E2E + hardening

**Scope:** Playwright suite + the no-network assertion harness.

**Tests:**
- The **full Phase A demo** as one e2e (offline, no account, create/edit/search/
  agent w/ mocked provider, reload-persists).
- Global no-network guard: fail the test if any request hits our origin during a
  local-only session.
- Reload-storm + offline-toggle e2e (durability under churn).

**DoD:** demo e2e green offline; exit criteria all met.

---

## Sequencing & dependencies

```
A0 (model + harness)
  └─> A1 (persistence) ⭐  ──┬─> A2 (board lifecycle)
                             ├─> A5 (search)         ── can parallel A2
                             └─> A4 (agent)          ── needs A1 (+ A5 for searchNotes tool)
A6 (PWA) ── any time after A2; required for A7 "true offline"
A7 (e2e) ── last
```

Build order: **A0 → A1 (+ its fuzz harness) → A2 → A5 → A4 → A6 → A7.** A1 is the
spine; everything downstream relies on its invariants holding, so it gets the
deepest tests first.

## Risks & checkpoints

- **The inversion is *clean* here** — local-only boards have no server, so "local
  is the only truth" needs no reconciliation. This is *why* Phase A de-risks the
  inversion: prove persistence on the smallest surface before any sync exists.
- **Checkpoint after A1:** if the fuzz harness is green, the riskiest part of the
  whole project is behind you. Don't proceed to A4 until A1's invariants hold.
- **canvas-harness seam:** A1 leans on `subscribe('change')` + `initial` + `getAll*`
  (audit-confirmed). If `RichText`→`string` needs a render-seam adapter, isolate it
  in `codec.ts`, not scattered.
- **Scope creep guard:** the instant you reach for "but online sync…", stop —
  that's Phase B. Phase A ships standalone.

## Definition of Done (Phase A)

All nine invariants green (incl. fuzz) · scripted-agent e2e green · full demo e2e
green **offline** · zero same-origin requests in a local-only session · persistent
storage granted. Then — and only then — Phase B.
