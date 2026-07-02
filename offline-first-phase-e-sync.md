# Phase E: the sync spine

Status: planned (design settled in `offline-first-architecture.md`; this is the build plan).
Grounded in a 2026 code scout of the as-built collab path + local persistence.

## 0. Correction up front (read this first)

The settled decision is **NOT "Yjs everywhere."** `offline-first-architecture.md` Phase-0
verdict is **Option A — harden the op-log**:

> Single-system **LWW-register** (per field, per node/edge), **relay assigns monotonic
> seq** (causal order) so v1 is correct without HLC. Keep the op-log + relay + auth; add
> **local persistence + offline queue**. **No Yjs/sequence-CRDT in v1** — Yjs `Y.Text` is a
> deferred, targeted upgrade for same-note co-editing only. HLC deferred (lean on relay
> ordering for v1).

So Phase E is **not a rebuild** — it's wiring the two halves we already have into one
offline-first sync client, plus a share flow. (Earlier notes/memory said "Yjs" — that's the
deferred text upgrade, not v1. Corrected.)

## 1. Architecture (target)

Two planes, one trigger (`offline-first-architecture.md` §Two planes):
- **Collab plane** — relay authorizes an op, assigns `seq`, fans it out to the room; clients
  apply it to their local replica.
- **Persistence plane** — the same accepted op/snapshot is written durably (for catch-up).
- **Accept once → fan out AND persist**, so they never diverge.

**Client:** the local replica (IndexedDB oplog + snapshot, already built in
`board-persistence.ts`) is the working source of truth. Edits are optimistic (`origin:local`),
appended to the oplog, and the **outbox** = local batches not yet acked by the relay (tracked via
a `syncedSeq` server cursor). On (re)connect the outbox replays; remote ops (`origin:remote`) are
applied + persisted; dedup by `batch.id`. Conflict model = §1c.

**Relay:** target is a **Cloudflare Durable Object per board** (validate ACL → assign seq → fan
out → persist snapshot to R2, ACL/meta in D1). **v1 ships on the existing FastAPI WS relay**
(`collab.py` + `room.py` already do seq/rooms/catch-up/ACL) and migrates to Cloudflare later.
Note the hybrid split: **FastAPI stays the control plane** (accounts, JWT, collab tickets, AI
metering/proxy); **only the relay** becomes a TS Worker+DO on Cloudflare (not a FastAPI lift —
Workers/DOs are TS); **the agent is client-side**. A short-lived signed **ticket** (JWT →
`/ticket` → WS) bridges auth so the relay never touches the user DB.

**Board kind:** `local-only` (IndexedDB only, no owner/ACL) → `synced` (relay + ACL). The
"Share" action is the hybrid migration.

## 1b. Op & data model (the unit that syncs)

- **Op** = one field-level mutation: `node.add|update|remove`, `edge.*`, `group.upsert`.
  `node.update` carries a **partial patch** (only changed fields) — the basis for disjoint-field merge.
- **Batch** (`OpBatch = {id, clientId, ts, origin, ops[]}`) = the **atomic unit**: one `seq`, one
  undo step, one broadcast, one oplog row. `origin ∈ local | remote | history`. (Label-edit +
  position-move are two ops; one batch or two depending on whether they share a `store.batch()`
  gesture — doesn't affect merge, since LWW is per-field.)
- **Two seqs, don't conflate:** a **local** oplog seq (per board; orders IndexedDB entries for
  replay/compaction; the only order an offline op has) and the **server** `seq` (relay-assigned;
  the shared total order, per board — NOT per note/link). Conflicts resolve per-field but *use* the
  board `seq` as the comparison key.
- **Undo is separate** — an in-memory stack (`origin:history`), NOT seq-based. In collab, undo =
  apply the inverse as a **new forward op** (you can't rewind the shared log). Oplog *replay* uses
  `origin:remote` so a reload never populates the undo stack.

## 1c. Conflict resolution (server-sequenced per-field LWW)

Not a pure CRDT — **server-sequenced ops**: the relay imposes one order (`seq`); clients apply in
that order; **LWW per field** (highest-`seq` writer of a field wins). Semantically an LWW-Register
(which *is* a CRDT) with `seq` as the clock; swapping `seq`→HLC (E4) makes it coordination-free.
Server-authority is the mainstream choice (Figma/Linear), not a compromise.

Rules by case:
- **Disjoint fields** (A moves, B renames the same node) → both apply, commute. No conflict.
- **Same field, concurrent** → highest `seq` wins; loser recoverable via history.
- **Add/add same id** → upsert, last wins (ids are uuids → rare). Different ids → both.
- **Delete vs update** → **delete wins, with a tombstone** (else a late/replayed update can
  resurrect a "zombie"). Requires remembering deletes.
- **Edge vs node delete** → drop the dangling edge (referential-integrity pass; same logic as the
  subtree cascade).
- **Ordered lists** (z-index, `frameOrder`, child order) → LWW on the order value in v1 (occasional
  reorder flicker); fractional-index / sequence-CRDT later if it hurts.
- **Same-note text co-edit** → LWW on the content field (last writer clobbers); mitigated by
  per-note granularity + presence. The **only** case the deferred Yjs `Y.Text` upgrade targets.

**Known v1 limitation — "reconnect-order-wins":** offline edits get their `seq` from the relay at
*reconnect*, so they land after anything accepted meanwhile — a stale offline edit can clobber a
newer online one (still converges; the "wrong" value may win). Replay is idempotent via `batch.id`.
HLC (E4) turns this into "actually-latest-wins."

## 2. Feature mapping (what the user gets)

| Feature | Today | After Phase E |
|---|---|---|
| Edit offline, converge on reconnect | ❌ (dropped socket = refresh) | ✅ outbox replay + remote persist |
| Real-time collab on a board | ✅ backend boards only | ✅ same client, local-first |
| Local board → shared/collaborative | ❌ no path | ✅ "Share" (kind: local-only→synced) |
| Multi-device (same account converge) | ❌ | ✅ each device is a replica |
| Presence (cursors/selection) | ✅ backend | ✅ unchanged |
| Read-only for viewers | ✅ relay rejects | ✅ unchanged |

## 2b. Server persistence (FastAPI v1 → Cloudflare) — the "post office" shape

Today the server is a **factory**: it parses every op into a normalized DB (Postgres graph +
Qdrant vectors) and owns the canonical model; the op-log itself isn't durable (in-memory 500-op
ring buffer resets on restart); per-note history lives in `NoteRevisionStore` (Postgres, zstd).

Target = **post office**: the server stores three *separable* concerns and never needs to
understand note internals:
1. **op-log** — `(board_id, seq, batch)` rows (durable; the catch-up buffer + history substrate).
2. **snapshots** — periodic full-board blob per board (fast join + compaction).
3. **ACL / metadata** — already exists (`graph`, `graph_user`).

Persist v1 in this shape even on FastAPI (Postgres/filesystem behind the three concerns) so the
Cloudflare move is a **storage swap, not a redesign**:

| Concern | FastAPI v1 | Cloudflare |
|---|---|---|
| Op-log + seq + live room (hot state) | in-memory Room + **Postgres oplog table** | **Durable Object** per board (own strongly-consistent storage; also fixes sticky-routing) |
| Snapshots / blobs | Postgres blob or filesystem | **R2** (zero egress) |
| ACL / metadata / accounts | Postgres (`graph`, `graph_user`) | **D1** (serverless SQLite) |
| Search vectors | Qdrant | Vectorize, or drop for client-side Orama |

Same protocol + client on both; only *where the three stores live* changes. (This is also the
transition off the ~1,800 LOC factory translation layer — server stores opaque snapshots, not a
parsed graph.) Refs: DO storage, D1, R2 — see `developers.cloudflare.com/workers/platform/storage-options`.

## 2c. Snapshots + edit history (first-class, not a footnote)

A **snapshot** = full board state at `seq=N`. Three jobs: (1) fast join (load snapshot@N + replay
tail, not from genesis), (2) compaction (drop ops ≤ N), (3) restore point. **Edit history** = the
op-log (`seq`, `clientId`, `ts`, patch) + periodic snapshots → time-travel, audit, restore.

Two grains, keep both: **whole-board** snapshot+oplog (join/catch-up/compaction — already built
locally in `board-persistence.ts`; server needs the durable twin) and **per-entity revisions**
(today's `NoteRevisionStore` → user-facing "restore this note").

Relation to conflict resolution: LWW + monotonic `seq` makes edits **converge**; history does NOT
make convergence correct — it's the **safety net that makes an LWW clobber recoverable** (restore
the lost value; debug "why did this change"). Essential for trust, not for correctness. Nice
symmetry: local and server persistence are the **same shape** — snapshot + op-log + compaction.

## 2d. Chats — private, per-user, off the relay

Agent chats are **always private per user** (backend `Chat` has `user_uid`). So they are **not**
part of the collaborative board doc and do **not** go through the relay/op-log:
- **Format** — the client shapes verbatim: `LocalChat` (meta) + `LocalMessage[]` (append-only,
  immutable messages with `order`), stored opaque with a `schemaVersion`.
- **Transport** — plain **REST** `save transcript` / `load transcript`, keyed `(user, board, chat)`
  — mirrors the local `ChatRepo`. No fan-out, no CRDT, no LWW.
- **Backend v1** — `chat(chat_id, board_id, user_id, …)` + `chat_message(chat_id, ord, payload)`.
- Multi-device: a user's own devices sync chats via the same REST (last-write per transcript is
  fine given single-user, low-concurrency). Upgrade to a per-user chat op-log only if concurrent
  multi-device chat editing ever becomes real.

This keeps chats out of E1's relay work entirely — a small, independent persistence task.

## 3. As-built vs gap (from scout)

Exists: WS relay (seq, rooms, 500-op catch-up buffer, presence, ACL rejection), optimistic
client send + ack, snapshot/catch-up welcome, local oplog+snapshot persistence (local boards),
`inverseBatch()` for rollback, `origin` echo-prevention, `SyncAdapter` capability hooks.

Missing (Phase E closes): the sync client has **no local persistence/offline** (in-memory only,
records local ops but ignores remote); the **local-first client isn't wired to sync**; **no
board `kind`** / share migration; relay is **in-process FastAPI** (no Durable Objects/R2/D1);
**no HLC** (deferred); **no rollback on op-rejected** (client keeps optimistic).

## 4. Implementation plan (phased, with LOC + complexity)

### E1 — Unified offline-first sync client  (~700–900 LOC, complexity: HIGH)
The core. Make ONE client that has both local persistence AND sync; a board attaches the sync
adapter only when `synced`.
- **Outbox from the oplog** — track `syncedSeq`; outbox = `seq > syncedSeq`; send on connect,
  advance `syncedSeq` on `op-applied`. (~120)
- **Persist remote ops** — extend `board-persistence.ts` to record `origin:remote` batches
  (today it early-returns on remote), reconciled with local seq; dedup by `batch.id` (dedup
  set already exists). (~150)
- **Reconnect/replay** — on reconnect send `since_seq`, replay outbox, apply catch-up as
  `remote`; idempotent via `batch.id`. (~150)
- **Adapter unification** — `use-ws-collab.ts` (867 LOC) and the local persistence attach
  become one wiring: local-only = persistence only; synced = persistence + WS adapter. (~250–350)
- **Rollback on op-rejected** — apply `inverseBatch()` on rejection instead of keeping the
  optimistic mutation (optional for v1; behind a flag). (~100)
- **Delete semantics (§1c)** — tombstones (delete-wins, no zombie resurrection) + a referential
  pass dropping edges to deleted nodes; applied on both client-apply and server-apply (mirror in E3). (~80)
- **Chats (§2d), independent small task** — REST save/load transcript keyed `(user, board, chat)`;
  no relay. Can land in parallel with E1. (~120)
- **Risks:** offline/online reconciliation + dedup ordering is the subtle part; remote-op
  persistence must not double-count local echoes; tombstone durability across compaction.

### E2 — Hybrid migration: local-only → synced ("Share")  (~400–600 LOC, complexity: MED-HIGH)
- **Board kind gating** — `BoardMeta.kind` exists locally; gate adapter attach on it; backend
  `Graph` gains a `kind`/owner concept. (~100)
- **Share flow (client)** — mint a server board, push the local snapshot + oplog tail, flip
  `kind=synced`, attach the adapter. (~150)
- **Backend create-synced-from-local** — endpoint that ingests a local board's snapshot+ops,
  assigns `ownerId` + ACL, seeds the room. (~200)
- **Id reconciliation** — ensure local node/edge ids survive the migration (they're uuids →
  should be stable; verify no server remap). (~100)
- **Risks:** migration correctness (no lost ops between snapshot cut and first synced op);
  identity/ACL assignment.

### E3 — Relay + server persistence hardening  (v1 on FastAPI: ~350–500 LOC; Cloudflare: ~1200+ LOC, separate)
- **v1 (recommended):** reuse the FastAPI relay — adapt `collab.py` to accept the local-first
  client's outbox replay + initial snapshot push from E2. Ships on existing infra. (~250, MED)
- **Durable op-log + snapshots (post-office shape, §2b/2c):** add a Postgres `oplog`
  `(board_id, seq, batch)` table (replaces the volatile in-memory ring buffer) + periodic
  whole-board `snapshots` blob + a compaction/checkpoint job; keep per-note revisions
  (`NoteRevisionStore`). Written as three separable stores so Cloudflare = swap to DO/R2/D1. (~150–200, MED)
- **Cloudflare target (later phase E3′):** Durable Object per board (relay+seq+buffer) ~500;
  R2 snapshot persistence ~200; D1 ACL/meta ~200; wrangler/auth/infra + migration ~300+.
  Complexity: HIGH (greenfield infra, ops). Defer until scale/"post-office" demands it.

### E4 — HLC (deferred)  (~200–400 LOC, complexity: MED)
Hybrid Logical Clock on the op envelope for replay-safe LWW across clock-skewed devices.
Not needed for v1 (relay causal order suffices); add when multi-device offline merge shows
skew artifacts. The only missing field for offline-replay-safe LWW.

**Total v1 (E1+E2+E3-FastAPI incl. durable op-log/snapshots, delete-semantics, chats):
~1650–2200 LOC.** Cloudflare + HLC are separate later phases.

## 5. Tests to write (estimation only)

### Unit (~24–32 tests)
- Outbox derivation from oplog (`seq > syncedSeq`); `syncedSeq` advance on ack. (~4)
- Remote-op persistence + `batch.id` dedup; no double-count of local echo. (~4)
- LWW merge: disjoint-field patches commute; same-field last-seq-wins. (~4)
- Delete semantics: delete-vs-update → delete wins (no zombie); tombstone survives compaction. (~2)
- Edge referential integrity: node delete drops incident edges; concurrent add-edge/delete-node. (~2)
- `inverseBatch` rollback on `op-rejected` restores pre-op state. (~3)
- Board-kind gating (local-only attaches no adapter; synced attaches). (~2)
- Share migration: id stability, snapshot+oplog handoff shape. (~3)
- Chats: REST transcript round-trip; order preserved; per-user isolation. (~2)
- (E4 later) HLC compare/tiebreak. (~3)

### Integration (~9–13 tests, needs a harness)
- **Harness (~150 LOC):** an in-memory relay + two clients over `InMemoryEngine` + a fake
  `SyncAdapter` — the reusable core for all convergence tests.
- Offline edit on A → reconnect → converges to relay + B. (~2)
- Concurrent same-field edits A/B → both converge to last-seq. (~2)
- Reconnect-order-wins: A edits offline, B edits online meanwhile, A reconnects → both converge
  (documents the stale-wins caveat; the test HLC will later invert). (~1)
- Disconnect mid-batch → no partial apply; replays whole batch. (~1)
- Catch-up via `since_seq` (in-buffer vs snapshot fallback). (~2)
- Snapshot + compaction: checkpoint@N then join replays snapshot@N + tail == full replay. (~2)
- History/restore: op-log reconstructs a prior state; restore a per-note revision. (~1)
- Share local→synced: A shares, B joins, sees full board. (~2)
- Idempotent replay: re-sending outbox after a missed ack doesn't duplicate. (~1)

### E2E (Playwright, ~2–3, optional)
- Two browser contexts on one synced board; edit in one, see it in the other; go offline, edit,
  reconnect, converge.

## 6. Sequencing & recommendation
E1 (offline-first client) → E2 (share) → E3 on **FastAPI** (ship it) → then E3′ Cloudflare and
E4 HLC as their own later phases. Ship real offline + collab + share on existing infra first;
migrate the relay to Cloudflare when scale/cost/"post-office" goals demand it. Transforms
(Phase D leftover) land after E1/E2, once the op substrate is final.
