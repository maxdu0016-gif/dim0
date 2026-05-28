# Dim0 Collaboration — Architecture & Implementation Plan

> Status: design doc — Phase 0 (BroadcastChannel, same-browser) is merged on `feat/board-collab-spike`. Phase 1+ described here is unbuilt.

## 1. Goals & non-goals

**Goals**

- **One mutation path for all editing.** The collab transport (WS + server-applier) is the *only* way to mutate a board — for solo users and for collaborative sessions alike. A solo editor is just a "room of size 1." There is no on/off toggle and no parallel REST save loop.
- Multi-user concurrent editing of a Dim0 board across machines / networks.
- Live remote cursors, selection, and edit-locks per node.
- Inline text co-editing without overwrites (real CRDT semantics).
- Agent edits and human edits flow through the same channel.
- Persistence remains authoritative on the server (DB is source of truth).
- Path to horizontal scale without rewriting the client.

**Non-goals (v1)**

- Offline edits with conflict-free merge on reconnect. (We'll handle short disconnects, not multi-hour offline.)
- Permissions finer than current board-level ACL (read/write/owner).
- Operational transform / full CRDT for the scene graph — only for inline text.
- Cross-board collaboration sessions.
- A "use REST only" fallback for editing — the collab transport is the only edit path. The WS being down is treated as a connection-state problem ([§7](#7-connection-state)), not a feature flag to flip.

---

## 2. Mental model

Two distinct data classes live on a board, and they get **different consistency strategies**:

| Class | Examples | Strategy | Why |
| --- | --- | --- | --- |
| **Scene graph** | node positions, links, colors, sizes, z-order, sticky note title, slide layout | **Op log + LWW** | Conflicts are rare and "wrong winner" is acceptable (someone moved a note 4px); shape is small, mutations are atomic. |
| **Inline text (v1)** | note body, paragraph node content | **Op log + LWW**, optional later: **`patch(oldStr → newStr)` diff op** | Co-typing inside one note is probably a rare case in practice; ship LWW first, measure, then decide. |
| **Inline text (post-feedback)** | same | **CRDT (Yjs)** *— deferred* | Only worth the integration cost if telemetry shows real concurrent-typing pain. See §13. |

Canvas-harness already gives us the op log half: `SyncAdapter` + `attachSync` + batch causal ordering. v1 adds a real server transport replacing BroadcastChannel. A Yjs binding may follow later, gated on user feedback.

### 2.1 Why not full CRDT (Yjs / Automerge) for the whole graph?

Our pick — server-authoritative op log with per-property LWW — is **the dominant pattern for collaborative whiteboards in production**, not a compromise:

- **Figma / FigJam**: server-arbitrated LWW per property. Their engineering blog *"How Figma's multiplayer technology works"* explicitly rejected CRDTs because *"CRDTs are designed for systems where there is no central authority — we have a central authority."*
- **Excalidraw rooms, Miro**: same school.
- **Tldraw**: started on Yjs, moved off it (`tldraw-sync`) for performance and control.

CRDTs (Yjs, Automerge, Loro) dominate in two different categories: pure-text editors started post-2020 (Notion, Linear, Apple Notes, Affine), and offline-first / peer-to-peer apps. We are neither. We have a server we trust, we're online-mostly, and our document is mostly structured fields (positions, colors, sizes) where LWW conflicts are perceptually acceptable. The carve-out for inline text (§6) is exactly the surface where this pattern doesn't generalize, and we have a graduated escape hatch for it.

If we ever pivot to a server-as-encrypted-shelf model with offline agents, see §12 for the analysis of what that pivot costs.

---

## 3. High-level architecture

```
 ┌─────────────────────────────────────────────┐         ┌──────────────────┐
 │                  Browser                     │         │     Browser      │
 │ ┌─────────────────────────────────────────┐  │         │      (peer)      │
 │ │     canvas-harness CanvasStore          │  │         └─────────┬────────┘
 │ │   ─ op log (scene graph, LWW)           │  │                   │
 │ │   ─ presence slice                      │  │                   │
 │ │   ─ y-doc per text node (CRDT)          │  │                   │
 │ └────────┬────────────────────────────────┘  │                   │
 │          │ attachSync(store, wsAdapter)      │                   │
 │ ┌────────▼────────────────────────────────┐  │                   │
 │ │     WS SyncAdapter (custom)             │  │                   │
 │ │   ─ sendBatch / onBatch                 │  │                   │
 │ │   ─ sendPresence / onPresence           │  │                   │
 │ │   ─ y-doc updates over same socket      │  │                   │
 │ └────────┬────────────────────────────────┘  │                   │
 └──────────│──────────────────────────────────┘                   │
            │              WebSocket                                │
            ▼                                                       ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │                        FastAPI WS worker (any one)                         │
 │  ┌─────────────────┐   ┌────────────────────┐   ┌──────────────────────┐  │
 │  │  Room registry  │──▶│  Sequencer (seq++) │──▶│  Op applier          │  │
 │  │  room → {socks} │   │  (Redis INCR)      │   │  Op → GraphStore     │  │
 │  └────────┬────────┘   └────────────────────┘   └──────────┬───────────┘  │
 │           │                                                │              │
 │           │       Redis pub/sub (fan-out across workers)   │              │
 │           ▼                                                ▼              │
 │  ┌────────────────────┐                          ┌──────────────────────┐ │
 │  │ peer-op broadcast  │                          │     Postgres         │ │
 │  └────────────────────┘                          │  (GraphStore tables) │ │
 │                                                  └──────────────────────┘ │
 └───────────────────────────────────────────────────────────────────────────┘
                                                      ▲
                                                      │
                                              ┌───────┴────────┐
                                              │  Agent worker  │
                                              │  (publishes    │
                                              │   ops to room) │
                                              └────────────────┘
```

Key design choices:

1. **One authoritative server.** Workers are stateless w.r.t. rooms; Redis pub/sub fans messages across workers. For v1 we can pin a room to one worker (no fan-out) and add Redis routing later without client changes.
2. **Server is the sequencer.** Clients send ops with a local lamport-ish clock; server stamps the global `seq` and rebroadcasts. This gives total ordering inside a room without a CRDT for the scene graph.
3. **Server applies ops to the DB.** Same code path for human ops, agent ops, and snapshot rebuilds. Persistence is *not* "save the whole graph every N seconds" — that pattern dies the moment two people edit at once. See §6.
4. **Text starts as plain LWW ops** like any other field. If concurrent-typing turns out to be a real pain point, we add a `patch-text` op carrying `(oldStr, newStr)` as a cheap mid-step (§11), and only escalate to Yjs if even that is insufficient.
5. **Agent ops re-enter through the room.** Agent worker connects as a "system" client; its edits are sequenced and broadcast like any other peer's. No special path means no special bugs.

---

## 4. Wire protocol

JSON over WebSocket, one message per frame. Yjs updates use base64-encoded binary inside JSON for v1 (we can switch to binary frames later if it matters — Yjs updates for typing are tiny).

### Client → server

```
{ kind: "hello",       board_id, root_id, client_id, user, since_seq? }
{ kind: "op",          client_id, client_seq, batch: [Op, ...] }
{ kind: "presence",    client_id, patch: { cursor?, selection?, editing?, color?, name? } }
{ kind: "crdt-update", node_id, update_b64, client_id }   // reserved, unused in v1 — see §12
{ kind: "ping" }
```

`since_seq` on hello: if present, server replays ops > since_seq instead of sending a full snapshot. Lets reconnecting clients catch up cheaply.

### Server → client

```
{ kind: "welcome",    seq, snapshot: GraphSnapshot, peers: [Presence, ...] }
{ kind: "op-applied", client_seq, seq }              // ack of own op
{ kind: "peer-op",    seq, client_id, batch: [Op, ...] }
{ kind: "peer-presence", client_id, presence }
{ kind: "peer-leave",    client_id }
{ kind: "crdt-update",   node_id, update_b64, origin_client_id }  // reserved, unused in v1
{ kind: "kick",          reason }                    // version mismatch, perm revoked
{ kind: "pong" }
```

### Notes on the protocol

- `seq` is monotonically increasing per room. Clients store the highest seq seen and send it as `since_seq` on reconnect.
- `client_seq` is the client's local sequence for matching acks to pending ops (lets us un-grey "saving…" indicators).
- The op shape inside `batch` is exactly canvas-harness's `Op` type — we don't translate at the wire boundary, only at the persistence boundary.
- `kick` exists so the server can sever a misbehaving client without leaving them in a half-state. We don't have it in Phase 0.

---

## 5. Server design

### 5.1 Room registry (in-process)

Per worker:

```py
rooms: dict[str, Room] = {}

class Room:
    board_id: str
    root_id: str
    seq: int                         # last applied seq
    sockets: dict[client_id, WebSocket]
    presence: dict[client_id, Presence]
    apply_lock: asyncio.Lock         # serialize sequencing + broadcast per room
```

`apply_lock` serializes **sequencing and broadcast** ordering, not the DB write itself. The existing `GraphStore` already holds per-note `asyncio.Lock`s ([backend/topix/store/graph.py](backend/topix/store/graph.py)), so data integrity at the storage layer is already handled. The room lock exists so that two near-simultaneous client ops can't be assigned the same `seq` or broadcast out of order.

### 5.2 Sequencer

Single-worker mode: `room.seq += 1` is enough.

Multi-worker mode (Phase 3+): use Redis `INCR room:{id}:seq`. The room is pinned to one worker via a Redis lock so apply still happens in one place; other workers just fan out via pub/sub.

### 5.3 Op applier

`apply_batch(room, batch)` translates canvas-harness ops to existing `GraphStore` methods. The DB-facing API we drive is already in place at [backend/topix/store/graph.py](backend/topix/store/graph.py); the applier is essentially the inverse of [webui/src/features/board/harness/convert/](webui/src/features/board/harness/convert/) (DB → harness).

Mapping:

| canvas-harness op | GraphStore call |
| --- | --- |
| `add-node` | `add_notes([note])` |
| `move-node` / `resize-node` / `set-style` / `set-text` | `patch_note(node_id, data, user_uid)` |
| `delete-node` | `delete_node(node_id, user_uid)` |
| `add-link` | `add_links([link])` |
| `delete-link` | `delete_link(link_id)` |

The applier holds `room.apply_lock` for sequencing + broadcast ordering; the underlying `GraphStore` calls use per-note locks they already own. After applying, the room broadcasts `peer-op` with the assigned seq.

**Embed-skip fast path.** `patch_note` compares `merged.to_embeddable()` to the existing note's. If equal — i.e. the patch only touched position/size/z/style/color and didn't change any searchable text — it routes to `ContentStore.update_payload_only`, which bypasses the OpenAI embedder. This is critical: the room's `apply_lock` is held *across* this call, so a synchronous embed call would block every other op in the room for ~100ms per spatial mutation. With embed-skip, spatial ops apply in ~5ms (Qdrant payload write only). See [decision 2026-05-28 — embed-skip](#14-decision-log).

### 5.4 WebSocket authentication (ticket-based)

Browsers cannot attach `Authorization:` headers to a WS upgrade. The existing API uses JWT via `OAuth2PasswordBearer` ([backend/topix/api/utils/security.py:27](backend/topix/api/utils/security.py#L27)) which does not transfer cleanly. We use a short-lived one-shot ticket:

1. Client (with a valid access token) calls `POST /collab/tickets { board_id }`.
   - Handler runs the existing `verify_board_member` dependency → ACL check.
   - Returns `{ ticket: "<opaque>", expires_in: 30 }`.
   - Ticket is a random 32-byte token cached in Redis: `collab:ticket:{token} → {user_id, board_id}`, TTL 30s, **single-use** (deleted on first consume).
2. Client opens `wss://api.dim0.net/collab/{board_id}?ticket=<opaque>`.
3. WS handler reads the ticket query param, calls `consume_ticket(token)` (Redis `GETDEL`), validates `ticket.board_id == path.board_id`, and rejects with close code `4401` if invalid.

This keeps WS auth aligned with the existing JWT system without inventing a parallel credential. Tickets are short-lived enough that link-sharing them is harmless.

**Session lifetime + token refresh.** Access tokens last 15 minutes ([security.py](backend/topix/api/utils/security.py)) — much shorter than typical WS sessions. The server doesn't care about token expiry once the socket is open (the ticket was the auth event). The *client* must refresh its JWT periodically anyway for parallel REST calls — that work continues independent of the socket. If the client's user is revoked (logout, plan downgrade) the server sends `kick { reason: "auth-revoked" }`; the client closes and lets the existing logout flow handle it.

### 5.5 Redis fan-out (Phase 3, not v1)

When we need more than one worker:

- Each worker subscribes to `room-events:{board_id}`.
- The pinned worker publishes `peer-op` / `peer-presence` payloads to that channel.
- Non-pinned workers receive and forward to their local sockets.
- Client ops sent to a non-pinned worker get forwarded over Redis to the pinned worker for sequencing.

For v1 we **skip Redis entirely** — single worker, one room per pid — and ship.

### 5.6 Persistence

The server already has a writable `GraphStore` (facade over Postgres metadata + Qdrant content). We do not call `hydrateBoardStore` from the server. Instead, the op applier is the *only* writer. Save loops on the client become no-ops once collab is on (client trusts the server-broadcast `peer-op` ack as durability proof).

Concretely:

- Remove (or gate behind `!collabEnabled`) the client-side `use-debounced-save` write path.
- After `apply_batch` succeeds, the `GraphStore.*` mutations have already persisted (Qdrant upsert + background Postgres snapshot). Nothing extra to do server-side.
- Late joiners get a snapshot via `graph_store.get_graph(board_id)` (the same call boards.py already uses), bundled with the current `seq` under the room's `apply_lock` so the pair is atomic.

---

## 6. Inline text — v1 strategy

**v1: same op log + LWW as everything else.** A text edit is a `set-text(node_id, value)` op carrying the full new string. Server stamps a seq, broadcasts, applies to the DB. If two peers type into the same note in the same ~30ms window, last-write-wins per op; the loser's keystroke is gone.

Why this is acceptable as a first step:

- Disjoint editing is the common case. People grab different nodes; concurrent typing in one note is rare in whiteboard UX.
- The op log keeps every version, so a "lost" edit is recoverable from history if it ever matters in practice.
- Presence-driven soft locks (Phase 4) give a visible "Alice is editing this note" hint, which prevents the conflict socially before it happens technically.
- No new server-side data model; no third-party library; nothing to migrate later.

**Escape hatch if LWW hurts: `patch-text` op.** Before reaching for Yjs we can add a cheap diff op:

```
{ kind: "patch-text", node_id, old: string, new: string }
```

Server applies it only if `current_text === old`. If `old` doesn't match (someone else's edit landed first), the server rejects with `op-rejected` and the client re-bases its edit against the new text. This is essentially `compare-and-swap` for text — gives correct merging of non-overlapping edits within the same note without any CRDT machinery. Add this only when telemetry shows it's needed.

**Yjs is the last-resort lever** if even `patch-text` proves insufficient (which would mean people are routinely typing into the *exact same paragraph* simultaneously — unusual outside Google-Docs-style use). Defer until that signal exists.

---

## 7. Connection state

Broader than collab (covers REST, the agent stream, and the collab WS) but collab makes it urgent: editing into a dead socket silently loses work. A single `useConnectionState()` hook fuses all signals and gates the UI.

### 7.1 The ping endpoint

`GET /api/v1/ping → 204`. No DB call, no auth, no request logging. Cheap enough to poll aggressively without skewing real metrics or producing log noise.

### 7.2 Signals

`useConnectionState()` returns `"online" | "offline"`, derived from:

- `navigator.onLine` + `online` / `offline` events — catches the obvious cases (wifi off, airplane mode).
- Collab WS `readyState` — `onclose` arrives within seconds of a real network break, faster than any HTTP retry.
- HTTP ping result — fallback for server-down-but-client-online.

Any one of them red → app goes `offline`.

### 7.3 Detection flow (two-strike rule)

1. An HTTP request times out, fails with a network error, or the WS closes unexpectedly.
2. Fire one ping. If it succeeds, that was a one-off blip — surface a discreet warning toast, keep editing live.
3. If the ping fails, wait 1s and fire a second ping.
4. Two consecutive ping failures → enter `offline`, freeze the app.

The two-strike rule exists because single failures on flaky networks are common; freezing on every one of them produces a flickering modal that's worse than the underlying issue.

### 7.4 Frozen state

- Full-screen non-dismissible modal: "Can't reach the Dim0 server. Check your connection." Non-dismissible is intentional — letting users dismiss it just to edit into a void is worse than blocking them.
- Canvas dimmed with `pointer-events: none`; local state preserved (not unmounted).
- **All mutating actions reject immediately** while frozen — drag, text edit, agent send, op emit. No local queue, no retry. The user's keystroke bounces; they wait for reconnect.
- Read-only inspection of the currently-rendered board remains possible underneath the overlay.

### 7.5 Recovery loop

While frozen, ping with exponential backoff: 1s → 2s → 4s → 8s → 15s cap. Auto-unfreeze on first 204. On unfreeze:

- Collab WS reconnects, sends `hello` with `since_seq` (Phase 1c) to catch up.
- A brief "Reconnected" toast.
- Next user action picks up cleanly. No pending edits to replay because we rejected them.

### 7.6 Explicitly out of scope

**Offline mode.** Edits while disconnected are rejected, not queued. Replaying stale ops against a moved-on room produces ugly merge artifacts (especially under collab), and a 30-second offline buffer has low UX payoff. A real offline mode is a separate design effort.

---

## 8. Client-side changes

### 8.1 `use-ws-collab.ts` (the only sync adapter)

Mounted unconditionally for every editable board — no on/off toggle. Internals:

- Opens `wss://.../boards/{boardId}/collab?ticket=…` after fetching a one-shot ticket.
- Implements canvas-harness `SyncAdapter`: `sendBatch` → `{ kind: "op", client_seq, batch }`; `onBatch` dispatched from `peer-op`.
- Tracks `seq` (`lastServerSeq` updated on every `welcome` / `peer-op` / `op-applied`) for the Phase 1c reconnect catch-up.
- **Outbound coalesce window (75ms).** `sendBatch` enqueues rather than sending immediately; the timer flushes the union of pending batches into one wire `op`. Caps typing-burst load and stays well below perceptual "live" latency. `destroy()` flushes synchronously so a teardown right after an edit doesn't drop work. See [decision 2026-05-28 — coalesce window](#14-decision-log).

### 8.2 Y-binding wiring (Phase 4b only)

Each text-editable node view lazily creates / fetches a y-doc and binds TipTap. Non-editing peers read the shadow text from the snapshot. Deferred behind the v1 ship gate.

### 8.3 No save loop

`useBoardDebouncedSave` is dormant by design — the server is the only writer. The hook is kept (with an `enabled: false` toggle) for back-compat during transition but will be deleted once Phase 2 lands and the agent's REST mutation path is gone.

### 8.4 Auth

WS upgrade exchanges a short-lived one-shot ticket minted via `POST /boards/{id}/collab/ticket`. Ticket validation hits the existing `verify_board_member` ACL. JWT lifetime is decoupled from socket lifetime — the ticket *was* the auth event; revocation (logout, plan downgrade) surfaces via `kick`.

---

## 9. Phased implementation plan

> Estimates are calendar-days for one engineer at full focus. LOC is net additions in `webui/` + `backend/`.

### Phase 0 ✅ — same-browser spike (DONE)

`feat/board-collab-spike`. BroadcastChannel adapter, presence, remote cursors. ~250 LOC. Opt-in via `localStorage["dim0:collab"] = "broadcast"`.

### Phase 1a ✅ — WS endpoint + room + relay (DONE, commit `ad28cc1`)

- FastAPI WS endpoint `WS /boards/{graph_id}/collab` + `POST /boards/{graph_id}/collab/ticket` for one-shot auth.
- In-process `Room` registry + sockets + presence relay.
- Frontend `use-ws-collab` adapter implementing the canvas-harness `SyncAdapter`.

**~600 LOC backend, ~300 LOC client. Shipped in ~1 day.**

### §7 ✅ — Connection-state subsystem (DONE, commit `174b55f`)

- `GET /utils/ping` liveness endpoint.
- Pure state machine fusing `navigator.onLine` + WS state + ping result, with two-strike escalation and backoff recovery.
- Non-dismissible offline overlay; wired into `apiFetch` and the WS close handler.

**~650 LOC across backend + frontend.**

### Phase 1b ✅ — server op applier + persistence (DONE, commit `48c4d6d`)

- Inverse-convert layer at [backend/topix/collab/apply_ops.py](backend/topix/collab/apply_ops.py).
- `apply_batch` under `room.apply_lock`; `welcome { seq, snapshot }` sent under the same lock so a racing `peer-op` cannot precede it.
- Client save loop dormant when `useWsCollab` is mounted.
- Late-joiner snapshot reads from live `GraphStore` via [snapshot.py](backend/topix/collab/snapshot.py).
- Embed-skip fast path in `patch_note` for spatial mutations (§5.3).
- Outbound 75ms coalesce window in the WS adapter (§8.1).

**~600 LOC backend, ~50 LOC client. Shipped in ~1 day.**

Exit met: refresh keeps changes; two peers edit, one leaves, comes back, sees the merged result.

### Phase 2 — agent integration *(critical-path, next)*

> Promoted from polish to **critical-path**: with "collab always on" (§1), an
> agent that mutates `GraphStore` directly produces edits no connected browser
> ever sees. Cannot ship collab without this.

- Agent worker emits ops to the room as a "system" client when it would have called `graph_store.patch_note / add_notes / delete_node` directly.
- Existing board-tool calls in [backend/topix/agents/notes/tools.py](backend/topix/agents/notes/tools.py) re-route through a "system room client" facade that produces canvas-harness ops.
- Room sequences agent ops like any peer; peers receive them as `peer-op` with an `is_system` flag in the batch for UI distinction.

**~300 LOC backend, ~50 LOC client (visual "agent is editing" badge), ~3-4 days.**

### Phase 1c — reconnect + since_seq

- Server retains last N ops per room (in-memory ring buffer).
- Client tracks highest seq, sends `since_seq` on hello.
- Server replays missed ops or sends full snapshot if outside ring.

**~150 LOC backend, ~100 LOC client, ~1-2 days.** Order can swap with Phase 2; both are smaller than they look.

### Phase 3 — edit locks + UX polish

- Use `presence.editing` to grey-out + tooltip nodes another peer is editing.
- "N people on this board" chip in toolbar.
- Connection state indicator (live / reconnecting / offline).
- Color-from-user (deterministic) replaces the Phase 0 hash.

**~300 LOC client, ~50 LOC backend, ~3-5 days.**

### v1 ship gate — collect feedback

Before building any more, run Phases 0–3 on real users for 2–4 weeks. Watch for:

- "I lost my edit" reports correlated with concurrent-typing in the same note.
- Telemetry on `set-text` ops landing within ~500ms of each other on the same `node_id`.
- Qualitative feedback on whether the soft edit-lock (Phase 3) is enough.

Decide between three forks based on what we see:

### Phase 4a — `patch-text` CAS op *(add only if needed)*

- New op kind: `patch-text(node_id, old, new)`.
- Server applies iff `current === old`; else returns `op-rejected` + current text.
- Client rebases the edit on rejection (TipTap transaction over the new base).

**~200 LOC backend, ~250 LOC client, ~2-3 days.**

### Phase 4b — Yjs for text *(add only if `patch-text` is insufficient)*

- TipTap `Collaboration` extension wired to per-node y-doc.
- WS `y-update` relay on server (no apply, just rebroadcast).
- Server stores latest `y_state` blob; sends on hello.
- Migration: existing note text → seed y-doc on first edit.

**~700 LOC client, ~200 LOC backend, ~5-7 days.** Largest single risk in the whole project; only fire this if real data demands it.

### Phase 5 — scale prep *(only if needed)*

- Redis pub/sub fan-out.
- Room → worker pinning via Redis lock.
- Op ring buffer in Redis instead of in-process.

**~400 LOC backend, ~0 client, ~3-5 days.** Skip until a single worker proves insufficient.

### Totals

| | LOC | Estimate | Actual |
| --- | --- | --- | --- |
| 1a (✅) | 600 + 300 | 2-3 days | shipped 1 day |
| §7 connection (✅) | 650 | 1-2 days | shipped 1 day |
| 1b (✅) | 1338 (incl. embed-skip + coalesce) | 3-5 days | shipped 1 day |
| **2 (agent) — next** | 350 | 3-4 days | — |
| 1c (reconnect) | 250 | 1-2 days | — |
| 3 (polish) | 350 | 3-5 days | — |
| 4a (`patch-text`, conditional) | 450 | 2-3 days | — |
| 4b (Yjs, conditional) | 900 | 5-7 days | — |
| 5 (scale, conditional) | 400 | 3-5 days | — |

---

## 10. Risks

Ordered by "most likely to bite, hardest to recover from."

### Risk 1 — Op applier drift

**The problem.** The applier translates canvas-harness ops to GraphStore mutations. If the translation has a bug (off-by-one, ignores a field, mishandles `null` vs `undefined`), the server state silently diverges from what clients see. After a reload, content "snaps back" to a wrong value.

**Mitigation.**
- Round-trip property tests: random op stream → apply server-side → snapshot → assert equals naive client-side apply.
- Server emits a `state_hash` in `op-applied`; clients compare and complain to the console if it disagrees with their local hash.
- Versioned op schema; server rejects unknown op kinds with `kick`.

### Risk 2 — Late-joiner snapshot consistency

**The problem.** A peer joins mid-flight. We send `snapshot` + `seq`. If the snapshot was built at `seq=100` but op 101 arrived during the send, the joiner sees op 101 applied twice (once via snapshot, once via peer-op) or never (skipped on both sides).

**Mitigation.**
- Build snapshot *and* read seq inside the same critical section as the apply lock.
- Or: buffer outgoing peer-ops to the joiner until welcome is acked, then drain.
- Test: join while a peer is hammering 100 ops/sec; verify resulting state matches.

### Risk 3 — Lost text edits under LWW

**The problem.** Two peers type into the same note in the same window; one peer's keystrokes are silently overwritten. We've explicitly accepted this trade for v1, but it could surface as user-visible bug reports.

**Mitigation.**
- Soft edit-lock in Phase 3: presence-driven "Alice is editing" badge greys the note for others. Solves the social case before it becomes a technical case.
- Server keeps the full op log; "lost" text is recoverable from history if it ever matters.
- Instrument: log when two `set-text` ops for the same `node_id` land within 500ms. If the rate is non-trivial, that's the signal to ship Phase 4a (`patch-text` CAS).
- Phase 4a is a 2-3 day escape hatch; Phase 4b (Yjs) only if 4a is still insufficient.

### Risk 4 — Agent edits + collab interaction *(actively blocking)*

**The problem.** Today the agent calls `graph_store.add_notes / patch_note` *directly, synchronously inside the agent turn* ([backend/topix/agents/notes/tools.py](backend/topix/agents/notes/tools.py) → [backend/topix/store/graph.py](backend/topix/store/graph.py)). With Phase 1b shipped, per-note locks prevent data corruption — but the room is never told, so **no `peer-op` is broadcast**. Connected humans never see the agent's edit until they refresh.

With "collab always on" (§1), this isn't a "risk" anymore — it's a **bug that exists right now in commit `48c4d6d`** for any account that uses agents during a live collab session.

**Mitigation.**
- **Phase 2 is the fix.** Until it ships, agents are a known-broken interaction inside collab sessions. Hide agent-driven boards from collab beta access until then.
- After Phase 2: the existing direct `graph_store.*` call sites in [agents/notes/tools.py](backend/topix/agents/notes/tools.py) re-route through a "system room client" that emits ops just like a human browser. Same wire shape; the only differentiator is an `is_system` flag the UI uses to label the cursor / batch.
- Tests: agent emits 20 ops, two peers connected, both see them in correct order with the agent identified as the originator.

### Risk 5 — Sequencer correctness under multi-worker

**The problem.** Two workers each handle a peer in the same room. Both try to sequence ops independently. Total ordering breaks.

**Mitigation.**
- v1 pins one room to one worker process. Reject WS upgrades from other workers with a 307 to the right node (or just accept and forward via Redis).
- Defer Redis pub/sub to Phase 5; don't pretend we're at scale.

### Risk 6 — WebSocket auth & ticket lifecycle

**The problem.** Browsers can't send `Authorization:` headers on WS upgrades. Naive solutions (token in query string in URL logs, long-lived ticket, no single-use guarantee) all create real attack surfaces. JWT also expires (15 min) much sooner than WS sessions last.

**Mitigation.**
- One-shot ticket pattern in §5.4: 30s TTL, `GETDEL` from Redis on consume, scoped to `(user_id, board_id)`.
- Server stops caring about token expiry once the socket is open — ticket *was* the auth event. Auth-revoked events (logout, plan downgrade) push a `kick`.
- Tests: replay attack (ticket reused), wrong-board ticket, expired ticket, revoked user mid-session.

### Risk 7 (secondary) — DoS / abuse

Malicious client sends 10k ops/sec. Server should rate-limit per `client_id` and `kick` over the threshold.

### Risk 8 — OpenAI embed cost inside the apply hot path

**The problem.** `GraphStore.patch_note` updates the Qdrant vector for every patch, which used to mean an OpenAI embed call (~100ms) inside `room.apply_lock`. Every drag-move would block the room for ~100ms; every typed character would burn one paid OpenAI request.

**Mitigation (shipped).**
- [GraphStore.patch_note](backend/topix/store/graph.py) now compares `merged.to_embeddable()` to the existing note. Equal → `ContentStore.update_payload_only` (no embed). Different → full re-embed.
- WS adapter [outbound coalesce window](webui/src/features/board/harness/canvas/use-ws-collab.ts) merges burst batches into a single wire `op` over 75ms — fewer apply calls, fewer embed calls in the worst case.
- Spatial ops (drag/resize/z/color) now apply in ~5ms under the lock.

**Remaining risk.** Text edits still re-embed each apply. Phase 4a (`patch-text` CAS) or 4b (Yjs) would let us debounce embeds per text-bearing node on the server.

---

## 11. What we cut from v1

- **An "edit without collab" mode.** No graceful "REST only" fallback. WS down = app frozen by the connection-state subsystem (§7).
- **Permissions per-element.** Whole-board ACL only.
- **Cursor following / "go to peer".** Phase 4+ nice-to-have.
- **Comments / threads.** Separate feature, not collab transport.
- **Offline-first.** Disconnect tolerated for minutes, not days.
- **Cross-board collab.** One room = one board.
- **Voice / video.** Out of scope, ever.

---

## 12. Future direction: offline-first

A plausible long-term pivot is *"server is a dumb encrypted shelf; everything (including agents) runs offline-first."* This section records the analysis so the question doesn't get re-litigated every six months.

### 12.1 What that future would look like

- Server stores opaque encrypted blobs only. Cannot read board contents.
- Clients merge concurrent edits without server arbitration.
- Agents run locally against the local store.
- Multi-hour / multi-day offline edits resolve cleanly on reconnect.

### 12.2 What survives the pivot (the client investment carries)

- canvas-harness store API and the entire client architecture.
- The wire protocol shape — server becomes a relay/blob store instead of an arbiter, but framing is unchanged.
- Presence layer (cursors, selection, edit-lock).
- Connection state subsystem (§7).
- The agent-through-room pattern (§9 Phase 2). Agents become local clients hitting the local store directly — the abstraction was correct either way.

### 12.3 What gets thrown away (bounded, ~1500 LOC)

All server-side:

- Op applier and inverse-convert layer (§5.3).
- Structured `GraphStore` tables → opaque encrypted blob storage.
- Server-side snapshot builder (§5.5).
- Per-room `apply_lock` and the sequencer — the server can't sequence ciphertext meaningfully.

### 12.4 What we'd actually have to build (~5000-8000 LOC, the real cost)

In order of difficulty, *not* size:

- **Local agent runtime** — the genuinely hard part. Offline LLMs are okay in 2026; offline agentic workflows with tools, RAG, and search are not. Most offline-first products with AI quietly stay online for the AI portion.
- E2E encryption layer: per-board keys, key management, share-by-link semantics, key rotation.
- Full CRDT (Yjs / Automerge / Loro) for the entire graph, not just text.
- IndexedDB / local persistence on every client.

The conflict-resolution change (LWW → CRDT) is the *cheapest* line item by far. The expensive parts are encryption and local agents, and they're new surfaces regardless of what we picked today.

### 12.5 The cheap hedge we're taking now

- Wire protocol reserves a `crdt-update` message kind (unused in v1, declared in §4 so it's a contract from day 1).
- The §6 `patch-text(old, new)` op is a small step in the same direction — it teaches us the rebase-on-rejection pattern client-side without committing to a full CRDT runtime.
- The client adapter (`use-ws-collab.ts`) wraps a swappable "conflict backend" interface even if v1 only implements LWW.

These cost a few hours of forethought, not a rewrite. They keep the door open without paying for it.

### 12.6 Why we're not optimizing for offline now

1. The hardest offline blockers (E2EE key management, local agent runtime) are orthogonal to LWW-vs-CRDT — they're new surfaces regardless.
2. The discard surface is bounded (~1500 LOC) and isolated to one layer.
3. Offline whiteboards are not yet a validated user demand. Figma has been online-only since 2016 and remains the category leader. Building for a hypothetical pivot is a classic over-engineered-v1 trap.

**Mental model.** We picked Figma's model. If we ever pivot to Apple-Notes-style, we rewrite the server side. The client investment carries.

---

## 13. Open questions

1. Do we keep the BroadcastChannel adapter as a "loopback" mode for dev/test, or remove it once WS is up?
2. Do agent ops carry a `system: true` flag in presence so the UI can render them distinctively (different cursor, "Agent is editing")?
3. Should we expose a "read-only viewer" join mode that subscribes without sending ops? (Cheap to add at Phase 1a — server just rejects `op` from `role: viewer` clients.)
4. What's the trigger for Phase 4a (`patch-text`) vs Phase 4b (Yjs)? Draft threshold: 4a if we see >2% of sessions hit concurrent-`set-text`-on-same-node within 500ms; 4b only if 4a's rejection rate climbs above ~10% (meaning rebases are happening constantly).
5. When do we drop the REST `GET /boards/{id}` from the load path in favor of using `welcome.snapshot` directly? The data is already there; we'd save one HTTP round-trip on board open. Probably right after Phase 1c (so we can rely on reconnect to recover the snapshot if a hiccup happens during open).
6. When do we sunset the legacy REST mutation endpoints (`POST/PATCH/DELETE /boards/{id}/notes`, …) entirely? They become unused once Phase 2 ships and the agent emits ops through the room. Removing them tightens the security surface but is a versioned API break.

---

## 14. Decision log

- **2026-05-28** — Pick hybrid (op log + LWW for scene, **LWW also for text in v1**) over full CRDT-everywhere. Rationale: canvas-harness already gives us the op log half; concurrent typing inside one note is probably rare in whiteboard UX; presence-driven soft locks should cover the social case.
- **2026-05-28** — Defer Yjs to a post-feedback phase (4b). Rationale: it's the highest-risk piece of the project and we don't yet have data showing the pain point is real. If LWW hurts, a `patch-text(old, new)` CAS op (4a) is a 2-3 day intermediate fix before reaching for Yjs.
- **2026-05-28** — Pick server-applied persistence (Model A) over client-broadcast-then-save (Model B). Rationale: single writer = single source of truth = no save-loop fights between peers.
- **2026-05-28** — Defer Redis pub/sub to Phase 5. Rationale: one worker is enough until we measure otherwise; premature distribution is the most common collab-rewrite trigger.
- **2026-05-28** — Agent edits re-enter through the room, not via direct GraphStore mutation. Rationale: one path = one set of bugs.
- **2026-05-28** — Connection state: dedicated `/api/v1/ping` endpoint + two-strike detection + read-only freeze overlay + **reject (no queue)** for mutations while frozen. Rationale: silent edits into a dead socket is the worst failure mode; rejecting is honest and avoids stale-replay merge artifacts.
- **2026-05-28** — Offline mode is explicitly out of scope. Rationale: separate design effort; user has a different plan for offline that warrants its own doc when the time comes.
- **2026-05-28** — Our LWW-with-server pattern aligns with Figma / FigJam / Excalidraw / Miro. CRDTs dominate elsewhere (Notion / Linear / Apple Notes) but not in the whiteboard category. Rationale: documented in §2.1 to prevent re-litigation.
- **2026-05-28** — Hedge for a possible future offline-first pivot: reserve `crdt-update` message kind in the wire protocol (§4) and keep the client's conflict backend swappable. Rationale: a few hours of forethought now avoids a contract change later. The actual offline pivot remains out of scope; see §12 for the cost analysis.
- **2026-05-28** — WS auth uses a one-shot Redis-backed ticket (§5.4) rather than carrying the JWT in `Sec-WebSocket-Protocol`. Rationale: cleaner alignment with the existing `OAuth2PasswordBearer` flow, short ticket TTL bounds replay risk, and Redis is already in the infrastructure.
- **2026-05-28** — Op applier targets the existing `GraphStore` API (`add_notes` / `patch_note` / `delete_node` / `add_links` / `remove_link`). Rationale: per-note locking and Qdrant+Postgres dual-write are already implemented there; the room only needs to own sequencing and broadcast ordering.
- **2026-05-28** — **Collab is the only edit path.** No on/off toggle, no parallel REST save loop, no per-user opt-in. A solo editor is just a "room of size 1." Rationale: the dual-path architecture (REST save loop alongside WS) had two failure modes — split-brain races on save + agent-vs-human silent desync — and they couldn't both be fixed without unifying. Unifying also removes a feature flag (`useCollabMode()`) and lets every Phase 1b correctness invariant apply universally. **Side effect: Phase 2 (agent integration) becomes critical-path for shipping rather than polish.**
- **2026-05-28** — **Embed-skip fast path in `patch_note`.** Compare `merged.to_embeddable()` to the existing note; equal → `ContentStore.update_payload_only` (no OpenAI). Different → full re-embed. Rationale: every drag-move was hitting OpenAI for no semantic reason and blocking `room.apply_lock` for ~100ms each. Now ~5ms.
- **2026-05-28** — **75ms outbound coalesce window in the WS adapter.** Buffer local `sendBatch` calls and merge their ops into one wire `op` message. Rationale: typing-burst commits would each hit the server's apply lock individually; coalescing collapses N keystrokes into 1 message + 1 embed. 75ms is below perceptual "live" threshold for peers (Google Docs uses ~200ms, Figma ~50ms).

---

## 15. Appendix — file layout (target)

```
backend/topix/
  api/router/
    collab.py            # WS endpoint + POST /collab/tickets
    utils.py             # add ping endpoint here, or new utils.py route
  collab/
    __init__.py
    room.py              # Room class, registry, apply_lock
    sequencer.py         # seq INCR (in-process v1, Redis Phase 5)
    apply_ops.py         # Op → graph_store.add_notes / patch_note / delete_node / ...
    snapshot.py          # graph_store.get_graph() + seq, atomic under apply_lock
    relay.py             # peer-op / presence fan-out
    tickets.py           # mint + consume one-shot Redis tickets
    persistence.py       # (Phase 4b only) y_state blob CRUD

webui/src/features/
  connection/
    use-connection-state.ts   # fuses navigator.onLine + WS state + ping
    offline-overlay.tsx       # frozen-app modal
    ping-client.ts            # ping + two-strike detector + backoff loop

webui/src/features/board/harness/
  canvas/
    use-ws-collab.ts     # replaces use-broadcast-collab.ts (kept for dev loopback)
    use-collab-flag.ts   # extended: "off" | "broadcast" | "ws"
    use-local-presence.ts (unchanged)
    use-y-binding.ts     # Phase 4b only — per-node y-doc lifecycle
  chrome/
    remote-cursors.tsx   (unchanged)
    edit-lock-overlay.tsx  # Phase 3
    collab-status.tsx      # Phase 3 — connection chip
```
