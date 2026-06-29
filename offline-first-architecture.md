# Offline-First Architecture — Concept

Status: **idea / pre-implementation**. This doc fixes the mental model and the
boundaries. No code yet.

## The problem we're actually solving

We want dim0 to be offline-first: the canvas and notes should feel instant and
keep working with no network, then sync when the connection returns. The app
also has AI agents that "manipulate files."

The starting confusion was: *if the agent is frontend TypeScript, can it even
modify local files?* That framing is wrong, and dismantling it is the whole
basis of this design.

### Reframe 1 — there are no "files"

The agent doesn't touch OS files. It mutates **Notes/Links in the Dim0 data
model**, through the same mutations the UI uses (`update-note`, `apply_ops`).
Those are records in a data store, not files on disk. So "the browser can't
write files" is a non-problem — we're not writing files, online or offline.

### Reframe 2 — two layers with opposite constraints

The phrase "offline-first AI agent" feels contradictory only because it blurs
two layers that have *opposite* network needs:

1. **Data layer — offline-friendly.** Reading/writing notes locally, queuing
   ops, syncing on reconnect. This is the local-first / CRDT problem. We're
   already ops-based (`use-ws-collab.ts` ⇄ `apply_ops.py`), so we're partway
   there.
2. **AI inference layer — inherently online.** The agent's reasoning is a remote
   LLM call. No network = no model. Local models in the browser (WebLLM/WASM)
   are too weak/heavy to count as a real answer.

The unlock: **the agent's reasoning is online, but the ops it produces flow
through the exact same sync pipeline as human edits.** The agent is just another
op-emitter on the stream — not a special file-writing case.

## Goals / non-goals

**Goals**
- Canvas + notes fully usable offline (read, edit, create).
- Local edits sync cleanly to the server on reconnect.
- One storage abstraction that spans web and (later) Tauri desktop.
- Agent actions, when online, land as ordinary ops in the same pipeline.

**Non-goals (for now)**
- Offline AI inference. The agent requires connectivity; that's accepted.
- Real-time multiplayer *while* offline. We sync on reconnect, not live.
- Native, user-visible files on disk (a later Tauri-only enhancement).

## Core principle

> **Local-first data, online AI.** Make the data layer the source of truth on
> the device and sync to the server. Treat the agent as an online-only feature
> whose output is indistinguishable from any other collaborator's edits.

Local-first ≠ local-only. Storage is per-device/per-browser/per-origin, so the
server still exists — it stitches a user's devices together **and** owns the one
job it cannot delegate: **write authorization** (see [Access control](#access-control--permissions)).
Sync *feels* peer-to-peer (CRDT, offline, instant local), but writes are
*validated* by a trusted relay. "Server only for auth / dumb storage" is **not**
viable once boards are shared — read-only would be unenforceable.

## Design principle: collab and persistence are independent planes

The core advantage. The relay does two unrelated jobs that merely share a host:

- **Collab plane (live, low-latency):** authorize an op, fan it out to the room;
  clients merge it into their **local** CRDT. The real-time experience.
- **Persistence plane (durable, async):** write accepted ops/snapshots to R2.
  Exists only to **catch up anyone not currently holding live state** — new
  client bootstrap, returning-client delta, or recovery.

```
COLLAB PLANE  (live, low-latency)        PERSISTENCE PLANE  (durable, async)
client ⇄ Durable Object ⇄ client         Durable Object ──► R2 (snapshots + ops)
  • authorize + fan-out                    • durable backstop
  • merge into LOCAL CRDT                   • bootstrap source for absent clients
  • feels instant                          • may lag / batch, off the hot path
               └────────────────┬────────────────┘
                  ONE trigger: relay ACCEPTS an authorized op
                  → fan out  AND  persist  (so they never diverge)
```

Independent in *purpose*, identical in *trigger*. Accept once → fan out **and**
persist. Persistence may lag/batch off the hot path; collab stays fast. Remote
persistence = the durable source of truth for **anyone without live local
state**, not "new clients" only.

### Op flow & origin (echo prevention)

Every op carries an **origin** — did it come from *us* (local action) or from the
network? The rule that keeps the topology loop-free:

- **Local-origin op** (our edit/agent) → persist to local IndexedDB **and** send
  upstream to the relay.
- **Remote-origin op** (received from the relay) → apply + persist to local
  IndexedDB, but **do NOT send back upstream** — the relay already fanned it out;
  echoing would loop.

In Yjs: the update observer checks the transaction `origin`; only
`origin === local` updates are sent to the provider.

Two safety layers:
1. **Origin filter** — prevents echo loops and wasted bandwidth.
2. **CRDT idempotency** — a duplicate that slips through re-applies as a no-op
   (unique change IDs). Correctness backstop under the bandwidth fix.

### Two senses of "persist"

- **Local persistence (client):** *every* op — local or remote origin — lands in
  IndexedDB (`y-indexeddb`). Makes the board survive reload/offline.
- **Durable persistence (relay → R2):** driven by the relay's accept event, not
  by each client. The server-side backstop + bootstrap source.

> "Every op → both planes" holds **at the relay**. At the **client**, the origin
> filter decides: all ops persist locally; only local-origin ops go upstream.

### Why this independence is the advantage

- **Offline-first falls out free:** no connection → collab is "a room of one,"
  persistence deferred; nothing breaks.
- **The axes compose:** collab-heavy/light-persist (ephemeral board) or
  persist/no-collab (solo multi-device) — same machinery.
- **Speed:** live collab never waits on a durable write.
- **Fault isolation:** an R2 hiccup doesn't stop collab; a quiet room still
  persists.

## The storage layer

### The interface wraps the domain, not files

The trap: OPFS gives `read/writeFile`, IndexedDB gives `get/put` on object
stores, Tauri fs gives `read/writeTextFile`. These share no primitive. If we
define the interface as `getFile(path)`, we contort IndexedDB into faking files.

So the boundary sits one level up, around **our concepts** (sketch, not final):

```
interface LocalStore {
  getNote(id): Note | null
  putNote(note): void
  listNotes(boardId): Note[]
  appendOps(ops): void      // the offline op queue
  pendingOps(): Op[]        // to replay on reconnect
  clearOps(upTo): void
}
```

The agent, the UI, and the sync code all talk to `LocalStore` and never know
which surface they're on. This only works if the interface speaks Notes and Ops,
not files and paths.

### Backends per surface

| Surface | Backend | Why |
|---|---|---|
| **Web (primary)** | IndexedDB for records; OPFS for large blobs | Notes + ops are many small structured records = a DB workload. Every local-first lib (Yjs `y-indexeddb`, Automerge, Dexie, RxDB) targets IndexedDB. OPFS only for big binary attachments. |
| **Tauri desktop (later)** | Native SQLite / `fs` plugin via TS | Rust backend has full filesystem access; callable from TS with no Rust written day-to-day. Can also expose real user-visible files later. |

Notes on the choices:

- **Web default is IndexedDB, not OPFS.** OPFS shines for blobs and
  SQLite-in-WASM; it's the wrong tool for lots of small queryable records.
  Reach for OPFS only if we later want client-side SQL (SQLite-WASM on OPFS) or
  to store heavy media.
- **Tauri uses the OS's native WebView, not bundled Chromium.** So OPFS support
  there is inconsistent (Linux WebKitGTK especially). That's another reason not
  to make OPFS the cross-surface layer — and on Tauri we'd use native storage
  anyway, which is strictly better.

### Capacity & durability

IndexedDB holds **gigabytes** (browser grants a % of free disk), not the
5–10MB `localStorage` cap. For text notes + an ops log we're nowhere near the
ceiling. Two things matter more than size:

- **Eviction.** Default browser storage is "best-effort" and can be wiped under
  disk pressure. For a source-of-truth store that's data loss. Mitigation:
  request `navigator.storage.persist()` so the data is treated as durable. This
  is a hard requirement for offline-first, not an optimization.
- **Performance, not capacity.** IndexedDB degrades on multi-GB blobs / huge
  scans well before the quota. Push large attachments to OPFS; keep structured
  records in IndexedDB.

## Search (a derived index)

We lose `grep` by leaving the filesystem — but `grep` couldn't *rank* anyway,
and IndexedDB has no native full-text search. The replacement is a **client-side
full-text index**, which is an upgrade (ranked, typo-tolerant, instant), not a
tax. It is a **derived read-model**, never a source of truth: rebuildable from
the CRDT at any time.

```
CRDT (Yjs doc)  ──source of truth──►  on each op: insert/update/remove
   │                                         │
   │                                         ▼
   │                                  Search index (in-memory)
   │                                         │  persisted to IndexedDB
   └─ cold start: rebuild from CRDT          ▼  (skip rebuild on reload)
                                      query → note IDs → open on canvas
```

### Library choice

| Lib | Size (gzip) | Ranking | Typo | Vector/semantic | Notes |
|---|---|---|---|---|---|
| **Orama** (recommended) | ~2–tens KB | **BM25** | **built-in** | **yes (hybrid)** | TS-native, great DX, persistence plugin |
| FlexSearch | ~5–6KB+ | custom scoring | via encoders | no | fastest/smallest; quirky API |
| MiniSearch | small | BM25 | yes | no | simple "good enough" middle ground |
| Fuse.js | — | — | fuzzy only | no | **not** real FTS (O(n) scan); small lists only |

**Decision: Orama.** TypeScript-native (fits our stack), BM25 + typo tolerance
with no tuning, and — the deciding factor — a clean upgrade path to **vector /
hybrid (semantic) search** without swapping libraries. Semantic search is a
likely future headline feature for a knowledge app; FlexSearch would force a
migration when that day comes. At our corpus size (hundreds → low tens of
thousands of notes) all of these are far faster than needed, so DX + future-proof
win over raw speed.

### Wiring rules

1. **Source of truth = the CRDT.** The index is derived; if it's ever wrong,
   drop and rebuild from the Yjs doc.
2. **Incremental, not full-rebuild.** Update the index (`insert/update/remove`)
   on each op — don't re-index the world on every keystroke.
3. **Persist the index to IndexedDB** (Orama persistence plugin) so a reload
   doesn't rebuild from zero; cold-start rebuild from the CRDT is still fast at
   our scale.
4. **Results map back to note IDs** → open the node on the canvas.

This is a few hundred lines sitting beside the CRDT, not a subsystem.

## The agent in this model

Decision: re-implement the agent as **frontend-only orchestration over local-only
tools** (replaces today's Python `agent_bridge.py`).

### Shape: a frontend, local-only op-emitter

- The agent loop + tool calls run in the **frontend (TS)**. It reads/writes the
  **local CRDT replica**; its mutations are ops that flow through the same sync +
  authorizing relay as user edits.
- Pattern per action: **local read → (LLM call for reasoning) → local write.**
  Only the *reasoning* leaves the device; tool execution is always local.
- Two properties this buys for free:
  - **Inherits the user's ACL.** Agent ops pass the same relay check, so the
    agent can never exceed what the user can do. No separate agent-permission
    model.
  - **It's "just another op-emitter"** — consistent with the independent-planes
    model; the agent isn't a special path.

### Tools are local-only (no server-side data tools, no corpus-wide RAG)

Capability = the tool set you expose. Data reach = what's in the local replica
(plus lazy-pull). There is no "remote files" the agent acts on — remote is only
durable persistence of the same data.

| Tool kind | Example | Data it touches |
|---|---|---|
| **Metadata** | `listBoards` | client-side board index (cheap; offline from cache). Listing ≠ retrieval — not RAG. |
| **Content (local)** | `searchNotes`, `createNote`, `linkNodes` | the loaded local replica |
| **Content (cross-board)** | `editBoard(X)` | **lazy-pull X local → then act locally** |

So "how much is local" is not "force-sync everything" — it's *give a `listBoards`
metadata tool + let content tools lazy-pull on demand.* The agent reaches the
whole workspace by pulling boards as it touches them, never by acting remotely.
(Any future semantic search stays **local** — a vector index over the local
replica via Orama — so the no-RAG principle holds.)

### Server surface = proxy + relay only

No server-side tool endpoints, no web-fetch/CORS, no server RAG. The agent
touches the server in exactly two places, neither agent-specific:

1. **The inference proxy** — and only on the our-key path.
2. **The sync relay** — the same pipeline every edit uses.

### Keys: two paths, one-home rule

> **Each key has exactly one home and never crosses the client/server boundary.**

| | Our key (default, monetized) | BYOK |
|---|---|---|
| Transport | frontend → **our proxy** → provider | frontend → **provider directly** |
| Key location | Worker secret (server only) | **client only — never stored or relayed by us** |
| Metered / gated | yes (quota = monetization) | no (their key, their cost) |
| Our key-leak liability | ours | **none — we never see it** |
| Feature completeness | full | **full** (all tools are local, so BYOK isn't degraded) |

BYOK key storage is client-side only: default **in-memory (session)**, optional
**"remember on this device"** (IndexedDB) as explicit opt-in. No browser storage
is XSS-proof, so a strong **CSP** is the real mitigation; never log the key, never
put it in a URL/analytics. Disclose: *"BYOK keys are stored locally and sent
directly to the provider — never to dim0's servers."* That sentence is the
liability boundary. Provider CORS: OpenRouter is the most browser-friendly;
OpenAI/Anthropic require their explicit browser-access flags — verify per model.

### Untrusted client → enforce only at chokepoints

The frontend agent loop is **attacker-controllable** (devtools). All enforcement
lives server-side, never in the client agent:

- **Quota / rate-limit / auth → the proxy** (also the abuse defense for our key).
- **Tool effects → the relay ACL** (already bounds the agent to the user's perms).

Never put a limit only in the client agent and assume it holds.

### Runtime config

Fetch **prompts / model config from the server at runtime** so agent behavior is
tunable without shipping a frontend release.

## Inference path & key custody

> This section describes the **our-key** path. The **BYOK** path inverts it — the
> key lives *only* on the device and goes *directly* to the provider, never
> touching our servers. See [the two-path key model](#keys-two-paths-one-home-rule)
> in "The agent in this model."

On the our-key path the provider key never touches the device. All inference
goes through an **edge proxy** we control that attaches the key and forwards:

```
device → CF Worker (validate session, enforce quota, attach key)
       → CF AI Gateway (cache, rate-limit, analytics, fallback)
       → OpenAI / OpenRouter → stream back
```

This is a fully **online** path. It doesn't touch the offline-first data story:
when offline there's simply no agent, and the canvas keeps working on the local
store. The proxy is exercised only when connected.

Why this proxy exists — in priority order:

1. **Key custody.** The key lives at the edge, never in the client bundle.
2. **Session auth (mandatory).** The Worker validates the dim0 session token
   *before* attaching the provider key. Without this it's an open relay —
   anyone with the URL burns our credits. This is the load-bearing requirement,
   not an optimization.
3. **Quota enforcement = monetization control point.** Free tier is gated by AI
   requests/day. Every inference request already passes through this proxy, so
   it is the natural and single place to count, throttle, and enforce
   free-vs-Plus limits. This alone justifies the proxy, independent of keys.
4. **Provider abstraction.** Swap or fail over between OpenAI / OpenRouter /
   Anthropic without touching the client.
5. **Streaming.** SSE token streams pass through Workers, so streaming UX is
   preserved.
6. **Cost & abuse tracking.** Central per-user log for billing and catching
   runaway usage.

Notes:

- **Don't adopt edge for latency.** The long hop is edge→provider (US-centric),
  and inference time dwarfs network latency anyway. Edge wins on the points
  above, not speed.
- **Prefer Cloudflare AI Gateway over hand-rolling** the generic proxy concerns
  (caching, rate-limit, retries, analytics). The Worker holds only the logic
  specific to us — session auth, key attach, quota.

## The real hard problem: sync & conflict resolution

Not file access — **merge.** When a human edits offline and the agent or another
collaborator edits, reconnection must merge cleanly. The pressure-test question:

> Are our ops commutative / idempotent enough to **replay** after an arbitrary
> offline gap?

- If yes → we're close to true local-first; the op queue just replays.
- If ops assume server-ordered application → that's the real engineering work,
  and it exists with or without the agent.

This is the one area where the answer is specific to *our* code, not general
architecture. It needs a dedicated look at the Note/Link op model and
`apply_ops` before we commit to a sync design (CRDT lib vs. our own op log).

### Conflict resolution: single-system LWW for v1

**Decision: one conflict model — LWW-register (with HLC) for *every* field,
including the note body.** Do not run a second system (sequence CRDT for text) in
v1. This is also closest to today's backend (which already LWWs `content` as a
whole-string), so it's *less* work, not more.

**Granularity is the primary win.** Ops at node/edge level → concurrent edits to
*different* elements **commute**; they never conflict. Order-dependence only
bites *same-element* writes. A single client editing during its own initial sync
is bulletproof: same client → one monotonic clock → newer op wins regardless of
arrival order.

Two rules keep it correct:

- **HLC, not wall-clock `Date.now()`.** Logical clocks make LWW deterministic and
  replay-safe across devices (skewed clocks would otherwise let one device always
  win). Within one client the monotonic counter is free.
- This is the *good* LWW — an **LWW-register CRDT**, not naive arrival-order LWW.
  (LWW-Register **is** a CRDT — see [offline-first-concepts.md](offline-first-concepts.md).)

**Text under LWW — the one trade.** Concurrent edits to the *same* note body let
the later write discard the earlier (defined semantics, not a bug). Two levers
make it livable:

- **Granularity**: LWW per *note* (minimum) or per *block/paragraph* (better) — so
  only same-note / same-paragraph edits collide; different notes never do.
- **Presence**: an "X is editing" hint (presence plumbing already exists) lets
  users avoid collisions; optionally don't apply a remote LWW write to a note the
  local user is actively typing in.

What you give up: real-time character-level co-editing of the *same* note body.
For a graph-first app that's a fine v1 trade.

**Deferred upgrade:** if same-note co-editing becomes a real need, bolt a sequence
CRDT (Yjs `Y.Text`) onto *just the text layer* later — the graph stays LWW
regardless. A targeted addition, not a rebuild.

**Implementation sub-decision — RESOLVED (Phase 0 audit): Option A.** Harden the
existing op-log; lean on relay ordering for v1; defer HLC. (B = Yjs `Y.Map` was
rejected — more code, parallel CRDT, discards the working LWW path.) See the
canvas-harness audit under "Current state (as-built) → target gap".

## Access control & permissions

The trap: a CRDT is **designed to accept every change** — that's what makes it
converge. It has no notion of "this author isn't allowed." So in *pure* P2P with
no referee, **"read-only" is a UI suggestion, not a security boundary**: a guest
opens devtools, emits write-ops, peers happily merge them, and one unvalidated
client poisons the whole mesh.

Two separate problems:

| Problem | Stoppable? |
|---|---|
| Guest mutates their **own local replica** | **No, never** — their device, their copy |
| Guest's changes get **accepted into the shared truth** | **Yes — this is the only place enforcement can live** |

Read-only must mean *"your writes don't affect the shared truth,"* not *"you
can't type."* And the only place to enforce that is a **trusted relay on the
write path** — pure cryptographic-capability P2P (signed ops + every peer
validates) is research-grade, can't do clean revocation, and is too much for us
to build.

### Decision: CRDT for merge, an authorizing relay for permissions

Keep the CRDT (all the offline/history wins) but route sync **through** a thin
relay that validates each change against the board ACL before fan-out/persist.

```
┌─ CLIENTS (web / Tauri) — each holds a full local CRDT replica ───────────────┐
│                                                                              │
│   Owner (rw)          Collaborator (rw)        Guest (READ-ONLY)             │
│   ┌──────────┐        ┌──────────┐             ┌──────────┐                  │
│   │ Yjs doc  │        │ Yjs doc  │             │ Yjs doc  │                  │
│   ├──────────┤        ├──────────┤             ├──────────┤                  │
│   │IndexedDB │        │IndexedDB │             │IndexedDB │  ← offline        │
│   │+ op queue│        │+ op queue│             │+ op queue│    persistence    │
│   └────┬─────┘        └────┬─────┘             └────┬─────┘                  │
│        │ signed change     │ signed change          │ signed WRITE          │
│        │ + session JWT     │ + session JWT          │ (forged in devtools)  │
└────────┼───────────────────┼─────────────────────────┼──────────────────────┘
         ▼                   ▼                         ▼
   ╔══════════════════════════════════════════════════════════════════╗
   ║   AUTHORIZING RELAY — Cloudflare Worker / PartyKit                 ║
   ║   (one Durable Object "room" per board)                           ║
   ║                                                                   ║
   ║   per incoming change:                                            ║
   ║     1. verify session JWT            → who are you?               ║
   ║     2. look up board ACL (D1)        → what may you do here?      ║
   ║     3. author has WRITE on board?                                 ║
   ║          ├─ NO  → ✗ REJECT (drop, never relayed/persisted)        ║
   ║          └─ YES → ✓ accept                                        ║
   ║     4. fan-out to authorized peers + persist                      ║
   ╚════════════╤════════════════════════════════════╤═════════════════╝
                │ accepted changes                     │ encrypted blobs
                │ (fan-out to authorized peers only)   ▼
                │                               ┌─────────────────┐
                │                               │ R2 — encrypted  │
                │                               │ blob store      │
                │                               └─────────────────┘
                │                               ┌─────────────────┐
                └─ accounts / board ACLs ──────►│ D1 — accounts,  │
                                                │ board ACLs      │
                                                └─────────────────┘

   Guest's forged WRITE → rejected at step 3 → never reaches peers or R2.
   Read-only holds. (AI inference is a separate path; see Inference path.)
```

### How the two concerns are split

- **Confidentiality (can you read?)** → **encryption.** Don't share a board's
  key → guest can't read it. Note: encryption does *not* prevent writes — a
  read-only user *has* the key (to read) and could still emit ops; that's the
  relay's job to reject.
- **Authorization (can you write?)** → **the relay.** Validates author vs. ACL;
  drops unauthorized writes before they touch the shared truth.
- **Revocation** → flip the ACL in D1. (Pure P2P can't retract already-downloaded
  data; an authorizing relay makes future exclusion trivial — re-key for
  confidentiality if needed.)

### What "read-only" can actually guarantee

| Guarantee | Pure P2P (naive) | P2P + signed caps | CRDT + authorizing relay |
|---|---|---|---|
| Can't affect shared truth | ❌ | ⚠️ (iff all peers validate) | ✅ |
| Can't read non-shared boards | ⚠️ (needs encryption) | ✅ | ✅ |
| Revocation actually works | ❌ | ❌ hard | ✅ |
| Buildable by a small team | ✅ | ❌ | ✅ |

> **The relay is thin but not dumb.** It owns write authorization — the one thing
> that cannot live on the client. This is the same Cloudflare Worker surface as
> the AI proxy; a PartyKit/Durable-Object room per board is the natural shape.

## Topology & hosting

### Local-first ≠ peer-to-peer (terminology that matters)

Three different things that get conflated:

| Term | What it means | Us |
|---|---|---|
| **Local-first** | *Data model* — every client holds a full replica, works offline, syncs later | ✅ yes (CRDT) |
| **Peer-to-peer** | *Topology* — clients connect **directly** (WebRTC), no server in the data path | ❌ no |
| **Relayed / client-server** | *Topology* — clients connect to a central hub that forwards | ✅ this is us |

> We are **local-first but not peer-to-peer.** All clients talk to a relay, never
> to each other. This is a feature: it's the chokepoint that enforces the ACL and
> persists data. True P2P (WebRTC) would add NAT-traversal/STUN/TURN pain **and**
> destroy access control (no chokepoint). CRDT/Yjs runs perfectly over a relay —
> that's how `y-websocket` works.

### The relay primitive — Durable Objects, not a bare Worker

A plain Worker is stateless request/response — it can't hold WebSocket
connections or fan out a board's edits. The relay must be stateful:

- **Durable Object = one "room" per board.** Holds live WS connections,
  broadcasts ops, validates against the ACL, persists recent state.
- **PartyKit** is the ergonomic wrapper over Durable Objects — the natural tool.
- **WebSocket Hibernation** drops idle compute while keeping connections alive,
  so connected-but-idle boards cost ~nothing.

⚠️ Durable Objects require the **Workers Paid plan ($5/mo floor)**. Not literally
$0, but that $5 covers the entire real-time backend.

### Storage split — all Cloudflare

Data is **client-side encrypted**, so the server stores opaque blobs it never
needs to read.

```
┌─ per-board hot state + relay ─┐   Durable Object (PartyKit)
│  live WS fan-out, ACL check,  │   recent op log / latest snapshot in DO storage
│  recent ops                   │   (Workers Paid ~$5/mo floor)
└──────────────┬────────────────┘
               │ offload cold / large
               ▼
┌─ encrypted blobs ─────────────┐   R2
│  CRDT snapshots, attachments  │   10 GB free, then $0.015/GB
│  (opaque, client-encrypted)   │   ZERO egress fees ← the big win vs S3
└───────────────────────────────┘
┌─ accounts + board ACLs ───────┐   D1 (SQLite)
│  identities, who-can-write    │   generous free tier; relay authorizes on this
│  (metadata, not blob content) │   without decrypting blobs
└───────────────────────────────┘
```

- **R2 for blobs** — standout choice: **no egress fees ever** (the cost that
  bites on S3 when serving data back to users). Effectively free for a long time.
- **D1 for accounts/ACLs** — metadata the relay reads to authorize.
- **Durable Object storage** — hot per-board state; offload older/bigger to R2.

**Cost reality:** ~**$5/month total** at startup scale (the Workers Paid floor),
R2/D1/KV free tiers covering the rest. One vendor, one auth model, zero egress,
and the AI proxy lives on the same Workers surface.

### Considered and rejected

- **Pure P2P / WebRTC** — NAT-traversal pain + no ACL chokepoint.
- **Off-Cloudflare stores** (Supabase / Turso / Neon / B2) — split the stack,
  pull off the edge; Supabase also pauses inactive free projects. Only revisit
  if R2/D1 pricing is ever outgrown (unlikely at our scale).

## Current state (as-built) → target gap

Grounded in a read of the real code: [`apply_ops.py`](backend/topix/collab/apply_ops.py),
[`room.py`](backend/topix/collab/room.py), [`snapshot.py`](backend/topix/collab/snapshot.py),
[`use-ws-collab.ts`](webui/src/features/board/harness/canvas/use-ws-collab.ts).

### Verdict

Today's collab is a **server-authoritative, sequenced op-relay with Postgres as
the source of truth.** It is **not** local-first, **not** a CRDT, and has **no
offline capability**. In the doc's terms: **ops assume server-ordered
application** — the harder branch. But the online system is solid and closer to
target than a rewrite.

### Replay-safety: no, but narrowly

- The room stamps a monotonic `seq` **on arrival** and resolves conflicts by
  **deep-merge LWW** (`patch_notes`) in that order → replaying in a different
  order can differ → **not replay-safe**.
- **But** ops are **per-field patches**, so disjoint fields/nodes already
  commute. Order-dependence only bites on **same-field concurrent writes**.
- You're ~80% of an **LWW-register**. The gaps: **(1) no logical clocks** (relies
  on server arrival order, not HLC/Lamport), **(2) text is whole-string LWW** —
  `content` ships as `{markdown}` ([apply_ops.py:309](backend/topix/collab/apply_ops.py#L309)),
  so concurrent edits to one note body clobber.

### Already aligned with this doc (don't rebuild)

- **Topology matches** — client ⇄ WS relay ⇄ peers, server-authoritative, not P2P.
- **Authorizing relay already exists** — tickets carry a `role`
  (`owner/member/viewer`); **viewer ops are rejected** with `op-rejected`
  ([room.py:36-51](backend/topix/collab/room.py#L36-L51)). The access-control
  section is partially built.
- **A server-ordered op-log already exists** — `seq` + 500-batch ring buffer +
  `since_seq` catch-up + snapshot-welcome fallback.
- **Per-node/edge granularity** ✓, plus mature plumbing: outbound coalescing,
  repeat-update dedupe, presence throttle, reconnect backoff, room caps.

### Missing — the real lift (offline-first is greenfield)

> The hard part of going offline-first is **not** conflict resolution. It's that
> there is **no local-first layer at all** today.

- **No local persistence.** No IndexedDB/durable client store; the canvas store
  is in-memory — *"a dropped socket means the user needs to refresh"*
  ([use-ws-collab.ts:44-58](webui/src/features/board/harness/canvas/use-ws-collab.ts#L44-L58)).
- **DB is the source of truth, not a local replica** — the inversion this doc
  assumes is not done.
- **No offline op queue; no durable op log** — `seq` resets on restart, buffer is
  ~5 min ([room.py:71-77](backend/topix/collab/room.py#L71-L77)).
- **No real rollback** — on `op-rejected` the client keeps the optimistic
  mutation and lets "refresh win"
  ([use-ws-collab.ts:763-771](webui/src/features/board/harness/canvas/use-ws-collab.ts#L763-L771));
  no pending/confirmed two-tier state (needed for offline + revocation).
- **In-process rooms** — `RoomRegistry` is single-process; won't scale without
  sticky routing. Exactly what Durable-Objects-per-board fixes.

### Decision: hybrid op-log, single-system LWW (the fork, resolved by the code)

Full-Yjs-everywhere would discard a lot of working, subtle code (color/theme
normalization, edge-midpoint geometry, coalescing/dedupe, tickets/roles,
catch-up). And v1 runs **one** conflict model. So:

> **Keep the op-log + relay + auth. Make it a single-system LWW-register by adding
> HLC + local persistence + offline queue.** No sequence CRDT in v1 (note body is
> an LWW value, per-note/block grain). Yjs-for-text is a deferred, targeted
> upgrade — not a rebuild.

### canvas-harness audit (Phase 0 — done)

Audited the clone (`@canvas-harness/core` v0.1.25; app runs v0.1.24 — same).
Headline: **the library was designed for this — most gaps land at the consumer
seam, not deep library surgery.**

Findings:

| Question | Answer |
|---|---|
| Persistence (IndexedDB)? | **No, but clean seam** — hydrate via `createCanvasStore({ initial })`, snapshot via `getAll*()`, `subscribe('change')` emits one serializable `OpBatch`/mutation. |
| Offline buffer/replay? | **No, but seam supports it** — `SyncAdapter` is the boundary; batches are JSON-serializable; durable outbox + replay is consumer work. |
| Logical clocks / CRDT? | **No clocks** — `batch.ts = Date.now()` (wall-clock, stamped in `store.ts`). Built-in model = causal-ordering-from-transport + wall-clock LWW + conflict *detection* (`conflict.ts`). |

Bonus (shrinks the work):

- **`SyncAdapter` has a CRDT escape hatch** (`capabilities.crdt`) *and* a native
  LWW path (`capabilities.causalOrdering`) — both first-class. Our relay already
  provides causal ordering (monotonic `seq`).
- **Rollback exists** — `inverse-op.ts` inverts every op; the two-tier
  pending/confirmed model = `inverseBatch()` a rejected op, not new machinery.
- **Echo prevention built in** — `attachSync` filters `origin !== 'remote'`; ids
  embed `clientId` (collision-free across peers).
- Op envelope already carries `{ id, clientId, ts, origin, ops }` + `prev` slices.
  The **only** missing field for replay-safe offline LWW is a logical clock.

Consequence: **no architectural blocker, no library fork for v1.** The one
library touch — swapping wall-clock `ts` for HLC — is small, localized (3 spots),
deferrable, and ours to make (we own the package; clone is the full monorepo).

### Three sequenced lifts

1. **Local-first foundation** (**Medium, ~0.6–1.2k**, was High/~1–2k): durable
   client store + offline op queue + source-of-truth inversion — all at the clean
   consumer seam (`subscribe` + `initial` hydrate + `getAll` snapshot + durable
   outbox + dedup on replay). **No library fork.**
2. **Deterministic conflict resolution** (**Low for v1**, was Medium): lean on
   **relay ordering** (existing model) → ~no change to ship. HLC deferred; when
   needed, ~100–300 LOC localized library change + package build. Single-system
   LWW, note body included. No Yjs/sequence-CRDT, no editor surgery.
3. **Durable, scalable relay**: move room/seq/buffer from in-process to Durable
   Objects + R2 snapshot persistence.

## Phasing

1. **Web, IndexedDB-backed `LocalStore`** behind the domain interface. Notes
   read/write locally; `persist()` requested.
2. **Offline op queue** — buffer ops while disconnected, replay on reconnect
   through `apply_ops`. (Depends on the replay-safety question above.)
3. **Conflict strategy** — confirm or harden op commutativity; adopt a CRDT
   layer only if the op model can't replay safely.
4. **Tauri backend** for `LocalStore` (native SQLite/fs), same interface.
5. **Optional:** OPFS/SQLite-WASM for blobs or client-side SQL; user-visible
   files on desktop.

Don't pay the multi-backend or CRDT-library complexity tax until the phase
demands it.

## Open questions

- Conflict UX: silent merge vs. surfacing agent/human collisions to the user.
- Do we want user-visible local files on desktop as a feature, or is hidden
  durable storage enough?
- **Access control granularity:** board-level ACL only, or per-note / per-field?
  (Relay validation cost scales with granularity.)
- **Offline writes by a since-revoked user:** guest edits offline, owner revokes,
  guest reconnects — relay must reject the queued writes on replay, not just new
  ones.
- **Do we need signed changes at all** if the relay is trusted? (Signatures add
  integrity/non-repudiation but cost complexity; likely defer.)

## Settled decisions (was open)

- ~~Pure P2P / server only for auth~~ → **No.** Sync feels P2P, but an
  authorizing relay validates writes. Read-only is otherwise unenforceable.
- Conflict-resolution model → **single-system LWW-register (HLC)** for v1;
  snapshots (op-log + periodic checkpoint) for history. **No Yjs/sequence-CRDT in
  v1**; Yjs-for-text deferred for same-note co-editing only. See
  [offline-first-concepts.md](offline-first-concepts.md).
- Search → **derived full-text index, Orama** (BM25 + typo tolerance now, vector
  /hybrid semantic search later). Index is rebuildable from the CRDT, never a
  source of truth.
- Topology → **local-first but relayed, not P2P.** Relay = **Durable Objects /
  PartyKit** (one room per board), not a bare Worker.
- Hosting → **all Cloudflare**: R2 (encrypted blobs, zero egress), D1
  (accounts/ACLs), Durable Objects (hot per-board state). ~$5/mo floor.
- **Collab and persistence are independent planes**, both fired by the relay's
  single "accept authorized op" event. Client uses **origin filtering** — local
  ops go upstream, remote ops apply locally only (echo prevention); CRDT
  idempotency is the backstop.
- **Conflict resolution → single-system LWW (v1).** Node/edge-level granularity
  (different elements commute) + **LWW-register for *every* field including the
  note body** (per-note/block grain + presence to mitigate same-note edits).
  Logical clocks (HLC), never wall-clock dates. Sequence-CRDT-for-text deferred.
- **Replay-safety (answered by the code):** current ops are **not** replay-safe —
  server-arrival-ordered deep-merge LWW, no logical clocks. But ~80% of an
  LWW-register already (per-field patches commute on disjoint fields).
- **CRDT-everywhere vs. op-log fork → hybrid, single-system LWW.** Keep the
  existing op-log + relay + auth; make it an LWW-register + local persistence +
  offline queue. **No Yjs in v1.** Sub-decision **resolved (Phase 0 audit):
  Option A** — harden the op-log, lean on relay ordering, defer HLC; no library
  fork. canvas-harness already provides serializable batches, hydration,
  invertible ops (rollback), origin filtering, and a pluggable adapter. See
  "Current state (as-built) → target gap".
- **Agent → frontend-only, local-only tools.** Re-implemented in TS as a local
  op-emitter (inherits the user's ACL via the relay). No server-side data tools,
  no corpus-wide RAG; `listBoards` metadata + lazy-pull content tools. Keys =
  two paths, one-home rule (our-key via proxy, metered; **BYOK direct, never
  stored/relayed by us**, fully-featured). Enforce only at proxy + relay.
