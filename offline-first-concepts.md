# Offline-First: Conflict Resolution & Modification History — Study Notes

> Companion to [offline-first-architecture.md](offline-first-architecture.md).
> Learning doc — concepts first, then what's industry-ready, then the dim0 call.

---

## The one idea to internalize first

These are **two different problems on two different axes.** Conflating them is
what made "git solves it" feel true (git aces one, fails the other).

**Running example** — one note `ideas.md`, open on **laptop** and **phone**,
both offline:
- Laptop: change the title, add a paragraph.
- Phone: fix a typo in an existing sentence, delete a *different* paragraph.
- Both reconnect.

| Axis | Question | Tense |
|---|---|---|
| **Conflict resolution** | How do these concurrent edits become one correct note both devices agree on, *with no human untangling it*? | the **present** |
| **Modification history** | Can I see what the note looked like before, who changed what, and roll back? | the **past** |

A system can ace one and fail the other:
- **git** → great history, bad live merge.
- **Yjs (default)** → great merge, throws history away.

Solve them separately, then make them cooperate.

---

## Concept 1 — Conflict resolution

**Deep requirement = convergence** (strong eventual consistency): after all
edits propagate, *every replica reaches identical state*, regardless of arrival
order. Softer goal = **intention preservation**: the merge reflects what each
person *meant*.

**Why offline makes it hard:** online + central server = just serialize edits
("server decides order"). Offline removes the referee — devices change things
with zero coordination and must *still* converge.

### The ladder (weakest → strongest for collab + offline)

**1. Last-Write-Wins (LWW)**
Timestamp each write; newest wins. Dead simple. Cost: loser's edit is **silently
destroyed**. Fine at the **field level** (cursor color, last tool); catastrophic
for document bodies. Used surgically, never globally.

**2. Locking (pessimistic)**
One editor at a time; others wait. Kills conflicts by killing concurrency — so
also kills offline + real-time collab. (Old doc's whole-notespace `409` lock is
this, coarse-grained.) OK for low-collision single-user; wrong for multiplayer.

**3. Operational Transformation (OT)**
Edits = ops (`insert("x", pos=5)`). Concurrent op arrives → **transform** it
against ops it didn't know about ("3 chars inserted before pos 5 → your op
shifts to pos 8"). **Powers Google Docs.** Superb text UX. Cost: **very hard to
implement correctly**, and almost always needs a **central server** to decide
canonical order → awkward for pure offline/P2P.

**4. CRDTs (Conflict-free Replicated Data Types)** — the modern answer
**Design the data so order never matters.** Every element gets a unique
sortable ID; delete = tombstone; concurrent inserts resolve by deterministic
rule. Math *guarantees* convergence with **no central coordinator and no
conflict markers** — devices offline for a week just merge, silently and
identically. In our example: laptop's new paragraph + phone's deletion of a
*different* paragraph both apply; typo fix lands in the preserved sentence.
Nobody sees `<<<<<<<`. Cost: **metadata overhead** (IDs, tombstones), but modern
libs (Yjs) optimize it to near-negligible. **Won the local-first world.**

**5. Three-way merge (git)**
Merge via common ancestor; auto-merge non-overlapping, **conflict markers** on
overlaps, **stop and wait for a human**. Perfect for programmers, fatal for a
note app, bad for JSON canvas data. Right tool, wrong domain.

> **Takeaway:** for offline + collab, the real choices are **OT** (central, hard,
> text-focused) or **CRDT** (decentralized, offline-native, now default).
> Locking and global LWW are non-starters; git-merge belongs to the *history*
> axis, not this one.

### Trap: "LWW-Register" *is* a CRDT (two kinds of LWW)

The ladder above lists LWW and CRDT separately, which makes them *look* like
opposites. They're not — **CRDT is a family of merge strategies, and
LWW-Register is one member of it.** You pick the right CRDT *type* per data shape:

| Data shape | Right CRDT | Merge rule |
|---|---|---|
| Scalar — `x/y`, color, size | **LWW-Register** | highest logical timestamp wins |
| Text / ordered list | **Sequence CRDT** (Yjs YATA) | interleave, never drop |
| Sets / counters / maps | OR-Set, counters, `Y.Map` | type-specific convergent rule |

LWW-Register is the *correct* CRDT for a position — there's no meaningful way to
merge two x-coordinates, so last-move-wins is right. The confusion is that the
**same three letters name two different things**:

- **Naive server-arrival LWW** — *not* a CRDT. "Last write to reach the server
  wins," ordered by arrival/wall-clock. Order-dependent, not replay-safe, lossy
  under clock skew. *(This is what dim0's backend does today.)*
- **LWW-Register CRDT** — *is* a CRDT. "Highest **logical timestamp** (HLC /
  Lamport) wins," deterministically, regardless of arrival order. Convergent and
  replay-safe.

The upgrade from the first to the second is just **attaching a logical clock**.
And **Yjs already embodies the split**: `Y.Map` values behave as LWW-registers
(with a built-in logical clock); `Y.Text` is a sequence CRDT. So "use Yjs"
*includes* LWW for scalar fields — correctly. CRDT ≠ "never LWW"; CRDT = "the
family that LWW-Register belongs to."

---

## Concept 2 — Modification history

"Navigate the past": view old versions, see who changed what, undo/redo,
restore.

**1. Snapshots**
Periodically/on-demand save a full copy. Simple, trivial restore. Naively
space-heavy → snapshot at intervals or as **named versions**. (Google Docs
"Version history", Notion page history.)

**2. Event log / event sourcing**
Don't store current state as truth — store the **ordered ops**; current state =
`fold(all ops)`. History = replay to any point; undo = pop last op. **This is
what `apply_ops` already is.** Fine-grained, natural home for undo. Cost: log
grows unbounded.

**3. CRDT-intrinsic history**
- **Automerge**: stores changes as a content-addressed **DAG = git commits for
  your JSON**. History, diff, restore — free.
- **Yjs**: keeps an update log but **garbage-collects** deleted content by
  default → full history needs GC disabled or explicit **snapshots**.

**4. Git commit DAG**
Snapshots + parent pointers + content-addressed dedup. Richest history model —
*why you love git* — just decoupled here from git's merge.

> **Production standard: event log + periodic snapshots.** Snapshot every N ops
> (or T minutes) + keep the tail of ops since. Bounds replay cost, keeps
> fine-grained history. Same as a DB's write-ahead log + checkpoints.

---

## The insight that unites your two requirements

> An **operation-based** representation serves **both axes at once**. The same
> ops are the unit of **merge** (axis 1) *and* the unit of **history** (axis 2).

You're already here. `apply_ops` is *simultaneously*:
- conflict-resolution substrate — **if** ops are commutative / CRDT-shaped, and
- history substrate — replay, undo, snapshots.

So this isn't two systems to build; it's two views of one op log. The gating
question stays: **are our ops replay-safe?** If yes, the existing log can serve
as the merge substrate; if not, adopt a CRDT lib to guarantee it.

---

## What's actually industry-ready

Two layers — don't confuse them.

### Layer 1 — merge engines (CRDT libraries) — the stable bedrock

| | **Yjs** | **Automerge** |
|---|---|---|
| Maturity / speed | Most mature, very fast, huge ecosystem | Solid; v2 (Rust core) fast; smaller ecosystem |
| Editor bindings | **First-class TipTap/ProseMirror, CodeMirror, Monaco** | Fewer, more DIY |
| Offline persistence | `y-indexeddb` out of the box | `automerge-repo` + storage adapters |
| **History** | Snapshots (disable GC) — *good* | **Native git-like change DAG — excellent** |
| Best when | Rich-text collab editor, performance | History is a first-class, sellable feature |

For a TipTap app, **Yjs is the industry default.**

### Layer 2 — sync platforms (wrap merge + persistence + transport + auth)

- **PartyKit** — realtime on Cloudflare; pairs with Yjs (`y-partykit`). Fits a CF shop.
- **Liveblocks** — polished commercial collab infra: presence, comments, storage, version-history APIs.
- **ElectricSQL** — Postgres-backed local-first sync (SQLite on client). Good if you want SQL + sync.
- **Replicache / Zero (Rocicorp)** — mutation-based local-first sync engines; strong offline + optimistic UX.
- **Jazz / Triplit / PowerSync / InstantDB** — newer all-in-one local-first frameworks.

⚠️ **Layer 2 moves fast and some have pivoted** (Rocicorp → Zero; ElectricSQL
did a major rewrite). Verify current status before betting. **Layer 1
(Yjs/Automerge) is the stable bedrock; the platforms churn.**

### What the big apps run

- **Google Docs** → OT
- **Figma** → custom server-authoritative: LWW per property + bespoke tree CRDT
- **Linear** → custom mutation-log **sync engine**
- **Apple Notes / iCloud** → CRDT

Pattern: editors lean OT/CRDT; structured-app teams often build a **custom
op-sync** — the shape dim0 already has.

---

## Recommendation for dim0

> **UPDATE — decision evolved after reading the code.** The final v1 call is
> **single-system LWW-register (with HLC) for *every* field, including text — no
> Yjs/sequence-CRDT in v1.** Rationale: the graph wants LWW anyway, today's
> backend already LWWs text, and one system is far less work. Yjs-for-text is a
> *deferred* upgrade for same-note co-editing only. The Yjs-everywhere
> recommendation below is the original reasoning that led here — kept for the
> learning thread; see [offline-first-architecture.md](offline-first-architecture.md)
> for the binding decision.

Given: existing `apply_ops`, TipTap editor, Cloudflare infra, and that you want
**snapshots, not heavyweight version control**.

- **Conflict resolution:** **Yjs** as the convergent layer for TipTap docs *and*
  the canvas graph (`Y.Map` of nodes). Automatic merge; offline via
  `y-indexeddb`. Sits behind / replaces the `apply_ops` transport.
- **History:** **Yjs snapshots** (named + periodic) = your modification history.
  Enough since you only want snapshots. Revisit **Automerge** only if history
  becomes a *headline feature*.
- **Transport/sync:** **PartyKit-on-Cloudflare** or self-hosted `y-websocket`,
  fronted by the same encrypted-R2 + AI-proxy Workers.

> You don't adopt git. You keep git's *good half* (snapshots) via Yjs snapshots,
> and get the half git can't do (silent collab merge) from the CRDT.

---

## Study syllabus (in order)

1. **"Local-first software"** — Ink & Switch (foundational essay; coined the term).
2. **Martin Kleppmann, "CRDTs: The Hard Parts"** — clearest model of *why* CRDTs converge.
3. **"How Figma's multiplayer technology works"** — a real, pragmatic, non-pure approach.
4. **Linear's sync engine talk** — op-sync for a structured app (closest to `apply_ops`).
5. **Yjs docs + Automerge "from the ground up"** — hands-on with both engines.

---

## Deep dive: "everyone has their own history, no?" — no, not after sync

A common, correct-*for-git* intuition: if I edit offline, my history diverges
from yours, so "restore to a version" is ambiguous. This is **true for git and
false for CRDTs**, and the difference is the whole point.

- **git:** divergence is **permanent until a human merges** (merge commit,
  possible conflicts). History genuinely forks.
- **CRDT:** divergence is **temporary and auto-resolves into ONE shared
  history.** After sync, every replica holds the *identical* change-set and
  *identical* state. No "your history" vs "mine".

Why: **each change carries a globally-unique ID + pointers to its causal
parents.** So all changes everywhere form *one* DAG, not N timelines. Sync =
exchange the changes you're each missing until both hold the complete set.

### Walkthrough — note starts as `"Hello"`

```
              c0: "Hello"   ← shared starting point
             /            \
   (laptop, offline)    (phone, offline)
   cL: add " World"     cP: "Hello"→"Hi"
```

**Before sync** (the intuition's moment — genuinely diverged):
- Laptop has `{c0, cL}` → `"Hello World"`
- Phone has `{c0, cP}` → `"Hi"`

**After sync** — exchange missing changes, both hold `{c0, cL, cP}`. `cL` and
`cP` are *concurrent* (both children of `c0`); the CRDT's deterministic fold
combines them → both show `"Hi World"`, byte-identical.

```
        c0
       /  \
     cL    cP        ← both replicas now hold BOTH branches
       \  /
   "Hi World"        ← same deterministic result everywhere
```

History is now **shared** — one DAG on every device. Nobody owns a private
timeline anymore.

### What a "version" is, and what "restore" does

- A **version** = a **frontier** = a small set of change-IDs ("the state
  including exactly these changes"). After sync those IDs are shared knowledge,
  so a frontier means the same thing everywhere. "Laptop's 3pm version" =
  frontier `{c0, cL}` = `"Hello World"`, reconstructable on *any* device.
- **Restore does NOT delete history or rewind a private timeline** (you can't
  un-happen a change others already hold). Restore = **emit a NEW forward change
  `cR`** that moves content back to the target version. It syncs like any edit;
  everyone converges; history honestly records "we branched, merged, then
  reverted."

```
   c0 → {cL, cP} → "Hi World" → cR(revert) → "Hello World"
```

### git vs CRDT history, side by side

| | git | CRDT (Yjs/Automerge) |
|---|---|---|
| Offline divergence | Permanent until merged | Temporary — auto-converges on sync |
| "My history" vs "yours" | Real — separate branches | Illusion — one shared DAG after sync |
| Reconciling | Merge commit, maybe conflicts, **human** | Automatic deterministic fold, **no human** |
| A "version" | A commit hash | A frontier (shared coordinate) |
| Restore | Move a branch pointer / new commit | A new forward change returning to old state |

---

## Why CRDTs sync history, not just current state (the "magic" dissolved)

The magical feeling comes from assuming **state** and **history** are two
separate payloads to sync. In a CRDT they are **one payload viewed two ways.**

| | Normal app (brain's assumption) | CRDT |
|---|---|---|
| What's *real* / stored | Current state | **The set of changes** |
| History is… | a side log you maintain | the *same* set of changes |
| Current state is… | the source of truth | a **computed view** `fold(changes)` |
| Syncing history | a separate, harder feature | **nothing extra** — already synced |

> The change-set is the only real thing, and it's what the network moves.
> Current state and any past version are both **computed views of that one
> synced set**. History needs no separate sync.

### Schema

```
        THE CHANGE SET  ── the only thing that is "real" and synced ──
        (immutable; each change has a unique ID + causal parents)

                       c0: "Hello"
                      /          \
                   cL: +" World"   cP: "Hello"→"Hi"
                      \          /
                       cR: revert…           ← append-only DAG

        ─ everything below is COMPUTED, never stored-as-truth, never synced ─

           fold({c0})          → "Hello"          ← a version
           fold({c0,cL})       → "Hello World"    ← a version ("snapshot")
           fold({c0,cL,cP})    → "Hi World"       ← current state
           fold({c0,cL,cP,cR}) → "Hello World"    ← after revert

        A version / snapshot = a FRONTIER = a small set of change-IDs.
        It is a *coordinate*, not a copy of content.
```

Current state is just "fold over *all* changes"; a past version is "fold over a
*subset*." Same data, different frontier.

### How sync actually moves changes (the delta protocol)

Sync ships only the **delta of changes**, never the whole doc/history:

1. Each replica keeps a compact summary of what it has — Yjs: a **state vector**
   ("highest clock per client"); Automerge: its **heads** + a Bloom filter.
2. On connect, exchange these tiny summaries.
3. Each computes what the *other* lacks and sends **only those changes**.
4. Both hold the **union** → identical change-set → identical current state
   *and* every past version.

Because the unit shipped is *changes*, and history *is* the changes, **syncing
state and syncing history are the same network operation.**

### So "history snapshots" sync for free

- **Named version / frontier** = small set of change-IDs → tiny metadata,
  reconstructs identically everywhere (the changes it points at already synced).
- **Materialized snapshot** (cached full copy for speed, like a DB checkpoint) =
  a *local optimization*; needn't be synced at all — any device recomputes it
  from the synced changes.

### Honest caveats (so it's not too magical)

- **Storage is the real price.** "Keep all history" = keep all changes forever.
  **Automerge** keeps the full DAG by default (rich history, more disk). **Yjs**
  garbage-collects deleted content by default (lean, but no full time-travel
  through deleted text) → for real version history use `gc: false` and/or
  periodic **snapshots**. A deliberate knob, not free.
- **Production pattern** (same as §history): keep *recent* fine-grained changes
  + *periodic compacted snapshots*, prune the long tail. Sync stays cheap,
  storage stays bounded.

---

## Open thread to pick up next

Go one level deeper than the `"Hello"` walkthrough: **how a sequence CRDT picks
the deterministic order** for truly concurrent inserts at the *same position*
(unique IDs, tombstones for deletes, tie-break rule) — the last bit of "how does
it *always* converge" that this doc states but doesn't prove.
