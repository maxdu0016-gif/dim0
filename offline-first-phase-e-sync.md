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
appended to the oplog, and the **outbox** = oplog entries with `seq > syncedSeq`. On (re)connect
the outbox replays; remote ops (`origin:remote`) are applied + persisted; dedup by `batch.id`.

**Conflict model:** LWW-register per field. The relay's monotonic `seq` gives causal order, so
concurrent disjoint-field edits commute and same-field edits are last-seq-wins — deterministic
enough for v1 without HLC.

**Relay:** target is a **Cloudflare Durable Object per board** (validate ACL → assign seq → fan
out → persist snapshot to R2, ACL/meta in D1). **v1 can ship on the existing FastAPI WS relay**
(`collab.py` + `room.py` already do seq/rooms/catch-up/ACL) and migrate to Cloudflare later.

**Board kind:** `local-only` (IndexedDB only, no owner/ACL) → `synced` (relay + ACL). The
"Share" action is the hybrid migration.

## 2. Feature mapping (what the user gets)

| Feature | Today | After Phase E |
|---|---|---|
| Edit offline, converge on reconnect | ❌ (dropped socket = refresh) | ✅ outbox replay + remote persist |
| Real-time collab on a board | ✅ backend boards only | ✅ same client, local-first |
| Local board → shared/collaborative | ❌ no path | ✅ "Share" (kind: local-only→synced) |
| Multi-device (same account converge) | ❌ | ✅ each device is a replica |
| Presence (cursors/selection) | ✅ backend | ✅ unchanged |
| Read-only for viewers | ✅ relay rejects | ✅ unchanged |

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
- **Risks:** offline/online reconciliation + dedup ordering is the subtle part; remote-op
  persistence must not double-count local echoes.

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

### E3 — Relay hardening  (v1 on FastAPI: ~200–300 LOC; Cloudflare: ~1200+ LOC, separate)
- **v1 (recommended):** reuse the FastAPI relay — adapt `collab.py` to accept the local-first
  client's outbox replay + initial snapshot push from E2. Ships on existing infra. (~250, MED)
- **Cloudflare target (later phase E3′):** Durable Object per board (relay+seq+buffer) ~500;
  R2 snapshot persistence ~200; D1 ACL/meta ~200; wrangler/auth/infra + migration ~300+.
  Complexity: HIGH (greenfield infra, ops). Defer until scale/"post-office" demands it.

### E4 — HLC (deferred)  (~200–400 LOC, complexity: MED)
Hybrid Logical Clock on the op envelope for replay-safe LWW across clock-skewed devices.
Not needed for v1 (relay causal order suffices); add when multi-device offline merge shows
skew artifacts. The only missing field for offline-replay-safe LWW.

**Total v1 (E1+E2+E3-FastAPI): ~1300–1800 LOC.** Cloudflare + HLC are separate later phases.

## 5. Tests to write (estimation only)

### Unit (~18–26 tests)
- Outbox derivation from oplog (`seq > syncedSeq`); `syncedSeq` advance on ack. (~4)
- Remote-op persistence + `batch.id` dedup; no double-count of local echo. (~4)
- LWW merge: disjoint-field patches commute; same-field last-seq-wins. (~4)
- `inverseBatch` rollback on `op-rejected` restores pre-op state. (~3)
- Board-kind gating (local-only attaches no adapter; synced attaches). (~2)
- Share migration: id stability, snapshot+oplog handoff shape. (~3)
- (E4 later) HLC compare/tiebreak. (~3)

### Integration (~8–12 tests, needs a harness)
- **Harness (~150 LOC):** an in-memory relay + two clients over `InMemoryEngine` + a fake
  `SyncAdapter` — the reusable core for all convergence tests.
- Offline edit on A → reconnect → converges to relay + B. (~2)
- Concurrent same-field edits A/B → both converge to last-seq. (~2)
- Disconnect mid-batch → no partial apply; replays whole batch. (~1)
- Catch-up via `since_seq` (in-buffer vs snapshot fallback). (~2)
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
