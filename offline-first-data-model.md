# Offline-First Data Model — Revamp Proposal

> Companion to [offline-first-architecture.md](offline-first-architecture.md).
> Proposes the unified data structure the local-first + single-system-LWW design
> needs. Pre-implementation.

---

## Why this comes first

Every lift sits on the data model. Today the *same* entity exists in **three
shapes** with a heavy translation layer between them — and that translation is
where most of the accidental complexity (and bugs) live. Going local-first is the
moment to collapse it.

## What we have today (3 representations + a translation tax)

**1. Backend canonical (Pydantic, Postgres-backed)** —
`Resource → Note / Link`, with a rich discriminated-union **Property** system:

- `Resource`: `type, id, version, properties, label: RichText, content: RichText,
  created_at, updated_at, deleted_at`.
- `Note`: + `graph_uid, parent_id, style`, and `NoteProperties` where **geometry
  is stored as properties** — `node_position: PositionProperty`,
  `node_size: SizeProperty`, `node_z_index: NumberProperty`, plus `pinned`,
  `list_order`, `image_url`, `icon_data`, `slide_*`, `programming_language`, … +
  arbitrary extra `DataProperty`.
- `Link`: + `source, target` (strings), `style: LinkStyle`, `LinkProperties`
  (`edge_control_point`, `start_point`, `end_point` as PositionProperties + an
  `is_local_offset` flag).
- `Graph`: `nodes: Note[]`, `edges: Link[]`, `visibility`, `readonly`, `thumbnail`.

**2. canvas-harness runtime (TS, what actually renders)** —
flat geometry, no property indirection:

- `Node`: `id, type, x, y, w, h, angle, z, groups, locked?, hidden?, content?,
  style?, data?`.
- `Edge`: `id, source: EdgeEnd, target: EdgeEnd, pathStyle, control?, z, …` where
  `EdgeEnd = {nodeId, localOffset} | {worldPoint}` (clean discriminated union).
- `Scene`: `nodes/edges/groups` as records + `camera, selection, frameOrder`.

**3. webui REST types** — a camelCase mirror of the backend (note.ts/link.ts).

### The core tension

The same node's **geometry is a `PositionProperty` on the backend but flat
`x/y/w/h` in canvas-harness.** That single impedance mismatch is what forces the
~1,800-LOC translation layer (`apply_ops.py` 696 + `note_to_wire.py` 386 +
`convert/` 739) — and its many documented bugs (dropped fields, position
defaulting, label/parent lifts, color theme adaptation, endpoint flattening).

## Design goals for the revamp

1. **One canonical shape.** Collapse the 3 representations toward a single model;
   delete the translation layer.
2. **Client-aligned.** Since local-first makes the **local CRDT the source of
   truth** (server stores opaque snapshots), the canonical shape should *be* the
   runtime (canvas-harness-flat) shape. The Pydantic Note model stops being the
   sync-path truth.
3. **LWW-friendly granularity.** Every field independently mergeable — scalar
   fields are LWW-registers; concurrent edits to `x` vs `body` never conflict.
4. **Separation of concerns.** Identity · geometry · content · style · type-data ·
   metadata · flags · sync — distinct groups, not one grab-bag.
5. **Keep the power, drop the mismatch.** The Property system is genuinely useful
   (agent reasoning, sources, dates, custom fields) — keep it for **metadata**,
   but **promote geometry to flat fields**.

---

## Proposed model (canonical = TS, client-aligned)

### Sync envelope (every entity)

```ts
type Id = string          // embeds clientId → collision-free across peers

type SyncMeta = {
  v: number               // schema version
  createdAt: number       // epoch ms
  updatedAt: number       // wall-clock, for DISPLAY only (never for merge)
  deletedAt?: number      // tombstone — soft delete for CRDT convergence
  // hlc?: string         // DEFERRED — logical clock for replay-safe LWW (Lift 2)
}

// label/content are plain strings (markdown) — DECIDED. A field is "searchable"
// iff it's non-null/undefined; no RichText wrapper, no per-field flag.
```

> Tombstones matter: a soft-delete (`deletedAt`) rather than a hard removal so a
> concurrent update can't resurrect a deleted entity. v1 LWW resolves by op order
> (relay); `hlc` is the deferred upgrade.

### Node

> **Implementation note (A0):** we don't own canvas-harness's `Node` type, and the
> persistence seam speaks it. So in code these dim0 non-geometry fields ride in the
> node's `data` slot (`DimNodeData`) while geometry/content/style/groups stay native
> — making persistence *identity* (no convert). The flat shape below is the
> *logical* model; the physical layout is in
> `webui/src/features/board/model/index.ts`.

```ts
type Node = {
  id: Id
  type: NodeType                       // 'rect' | 'text' | 'image' | 'icon' | 'frame' | custom

  // geometry — flat scalar LWW registers  (was Position/Size/Number Properties)
  x: number; y: number; w: number; h: number; angle: number; z: number

  // graph relations
  parentId?: Id | null                 // containment / subspace (recursive boards)
  groups?: GroupId[]

  // content — plain markdown strings, v1 LWW; Yjs Y.Text deferred.
  // searchable iff non-null.
  label?: string                       // title
  content?: string                     // body

  // app-known metadata — TYPED flat fields (was the loose NoteProperties bag)
  pinned?: boolean
  listOrder?: number
  url?: string

  // presentation
  style?: Style                        // LWW per whole style-object (decided)

  // type-specific payload — TYPED, discriminated by `type`
  data?: NodeData

  // OPTIONAL dynamic metadata — typed VALUES (DataProperty), runtime-defined KEYS.
  // ONLY for user-defined columns (DB-of-notes, later) + agent outputs
  // (reasoning/sources). Omit entirely in v1 if user-defined columns aren't shipping.
  props?: Record<string, DataProperty>

  // flags
  locked?: boolean; hidden?: boolean

  meta: SyncMeta
}

// type-specific payload — fully typed, discriminated by node `type`.
// Plain shapes (rect / text / ellipse / …) carry no `data`.
type NodeData =
  | { kind: 'image'; src: string; naturalW: number; naturalH: number; alt?: string }
  | { kind: 'icon';  src: string; alt?: string }
  | { kind: 'code';  language: string }
  | { kind: 'frame'; slideName?: string; slideNumber?: number }
```

### Edge

```ts
type Edge = {
  id: Id
  type: 'edge'

  source: EdgeEnd                      // {nodeId, localOffset} | {worldPoint}
  target: EdgeEnd                      // adopt canvas-harness's union as canonical
  pathStyle: 'straight' | 'bezier' | 'polyline'
  control?: Vec2[]                     // cubic controls (midpoint derived, not stored twice)

  z: number
  parentId?: Id | null
  groups?: GroupId[]

  label?: string                       // edge label (markdown), searchable iff non-null
  style?: EdgeStyle
  props?: Record<string, DataProperty>
  locked?: boolean; hidden?: boolean

  meta: SyncMeta
}
```

> Edge endpoints adopt the **`EdgeEnd` discriminated union** as canonical —
> killing the `source/target` strings + `start_point/end_point` properties +
> `is_local_offset` flattening that the translation layer does today.

### Board — split into three planes

The current `Graph`/`Scene` conflates shared content, server metadata, and local
view state. Separate them by who-owns and what-syncs:

```ts
// (A) Shared CRDT content — synced, persisted as snapshots
type BoardContent = {
  schemaVersion: number
  nodes: Record<Id, Node>
  edges: Record<Id, Edge>
  groups: Record<GroupId, Group>
  frameOrder?: Id[]                    // shared presentation order
}

// (B) Board metadata — D1 (server) + a local board index. NOT in the CRDT doc.
type BoardMeta = {
  id: Id
  title: string
  kind: 'local-only' | 'synced'        // the new board type (Phase A vs B)
  ownerId?: UserId                     // null while local-only
  acl?: Record<UserId, 'owner' | 'editor' | 'viewer'>
  visibility: 'private' | 'shared' | 'public'
  thumbnail?: string
  createdAt: number; updatedAt: number; deletedAt?: number
}

// (C) Local view state — per device, ephemeral, NEVER synced as content
type BoardView = {
  camera: { x: number; y: number; z: number }
  selection: Id[]
  // interaction state (drag/marquee/edit) is transient, not persisted
}
```

> Three planes, three lifecycles: **content** lives in IndexedDB + syncs as
> snapshots/ops; **metadata** lives in D1 (the relay reads it to authorize);
> **view** is local-only (camera/selection follow the device, not the board).

### Property system — kept, but scoped to metadata

The discriminated union stays (it's the extensibility win — agent outputs, dates,
keywords, sources, custom DB-of-notes fields). Two changes:

```ts
type DataProperty =
  | { id: Id; type: 'number';  number: number | null }
  | { id: Id; type: 'date';    date: string | null }
  | { id: Id; type: 'boolean'; boolean: boolean | null }
  | { id: Id; type: 'text';    text: string | null; searchable?: boolean }
  | { id: Id; type: 'keyword'; value: string | number | null }
  | { id: Id; type: 'url';     url: string | null }
  | { id: Id; type: 'file';    file: { url: string; name: string; … } | null }
  | { id: Id; type: 'image';   image: { url: string; caption?: string } | null }
  | { id: Id; type: 'location'; … }
  | { id: Id; type: 'reasoning'; steps: ReasoningStep[] }   // agent outputs
  | { id: Id; type: 'source';    sources: SearchResult[] }
  | { id: Id; type: 'multi_text' | 'multi_keyword' | 'multi_source'; … }
```

- **Geometry promoted out** — `position/size/zIndex` are flat node fields now, not
  properties. (This is the change that deletes the translation layer.)
- **App-known fields are TYPED, not props** — `pinned`, `listOrder`, `url` →
  flat fields; `image/icon/code/slide` payloads → typed `data`. They never touch
  the `props` bag.
- **Not "free-form".** Only the *keys* of `props` are runtime-defined; every
  *value* is a fully-typed `DataProperty` (carrying its own `id` → independently
  LWW-mergeable). The dynamic `props` bag exists ONLY for (a) user-defined columns
  (DB-of-notes, a later feature) and (b) agent outputs. **v1 can omit it.**

---

## Key changes from today

| Area | Today | Proposed |
|---|---|---|
| Geometry | `PositionProperty` / `SizeProperty` / `NumberProperty` | **flat `x/y/w/h/angle/z`** |
| Canonical truth | Pydantic `Note` in Postgres | **TS client model; server stores opaque snapshots** |
| Edge endpoints | `source/target` strings + position props + `is_local_offset` | **`EdgeEnd` union** (attached \| free) |
| Board | one `Graph` blob (content+meta mixed) | **content / meta / view** split |
| Properties | geometry + metadata mixed in one bag | **metadata only** (geometry promoted) |
| Delete | `deleted_at` row | **tombstone in SyncMeta** (CRDT-safe) |
| Merge metadata | none (server arrival order) | `SyncMeta` (+ `hlc` deferred) |

## What dissolves

Because canonical == runtime and the server stores opaque snapshots:

- `apply_ops.py` (696) — wire→DB translation: **mostly gone** (server stops
  persisting to GraphStore on the sync path).
- `note_to_wire.py` (386) — **gone**.
- `convert/` (739) — **shrinks to near-zero** (no Note↔Node remap; the store
  model *is* the persisted model).

~1,800 LOC of translation + its bug class retired. That's the revamp's payoff.

## Storage layout (IndexedDB) & data residency

### Granularity: per-board op-log + snapshot, NOT per-node rows

A node/edge is **not** its own IndexedDB entry. canvas-harness hydrates a whole
`Scene` (`createCanvasStore({ initial })`) and emits one `OpBatch` per change — so
the natural unit is the **board**, persisted as **a snapshot + an op-log**:

- **write:** each `change` → append the `OpBatch` to `oplog` (tiny, fast);
  periodically **compact** the op tail into a fresh `snapshot` (every N ops / T s).
- **read:** load `snapshot` + replay the `oplog` tail → hydrate the store.

This one structure serves four jobs at once — **persistence, history, the offline
queue, and the sync unit** (mirrors how the relay stores snapshot + ops). Per-node
rows would discard the op-log and force scene reconstruction by query.

### Object stores

```
IndexedDB "dim0" (per origin):
  boards     key=boardId         → BoardMeta (local-only boards + cache of synced)
  snapshots  key=boardId         → BoardContent (latest materialized scene)
  oplog      key=[boardId, seq]  → OpBatch        (+ per-board `syncedSeq` watermark)
  search     key=boardId         → serialized Orama index
  chat       key=[boardId, msgId]→ agent transcript (optional v1)
  settings   key=string          → prefs, persist grant, BYOK key (opt-in)
```

The **outbox** (ops not yet acked by the relay) is *derived* — `oplog` entries
with `seq > syncedSeq`. No separate store.

Large binaries (pasted images, files) don't belong in the snapshot blob (bloat) →
**OPFS** locally / **R2** when synced, referenced by id from `node.data`.

### Data residency: local-first is a SPLIT, not "move all of Postgres"

The key reframe to your question: **not everything becomes IndexedDB.** Only the
user's *working content* goes local-first. Identity / billing / feed / ACL stay
server-authoritative.

| Data (today: all Postgres) | Proposed home |
|---|---|
| nodes / edges / groups (board content) | **IndexedDB (local-first)** + R2 snapshots (synced) |
| board metadata (title, owner, ACL, visibility) | **D1 (server-auth)** + cached in `boards` |
| chat / agent transcripts | **IndexedDB (local-first, per board)** — optional v1 |
| user / billing / auth tokens | **server-only** (Postgres/D1) — never local-first |
| newsfeed / subscriptions | **server-only**; cached read-only for offline view |
| files / documents (uploads) | **R2 blobs**, referenced by id from nodes |
| board snapshots (encrypted) | **R2** |
| search / embeddings (today Qdrant + OpenAI) | **local Orama index** (per no-RAG) — server embed path retired |

Three residency classes:

- **Local-first** (truth on device, synced): board content, chat.
- **Server-authoritative** (truth on server, maybe cached read-only): accounts,
  billing, ACL / board-meta, newsfeed.
- **Blob** (opaque): files, encrypted snapshots → R2 / OPFS.

## Migration map (old → new), field by field

### Resource base (shared by Note & Link)

| Old (Pydantic) | New | Transform |
|---|---|---|
| `type` | `type` | `"note"` → canvas-harness node type (see below); `"link"` → `"edge"` |
| `id` | `id` | direct |
| `version` | `meta.v` | direct (rename) |
| `label: RichText` | `label: string` | `label?.markdown ?? undefined` (drop `searchable` wrapper) |
| `content: RichText` | `content` (Node) / `label` (Edge) | `.markdown` |
| `created_at: str` (ISO) | `meta.createdAt` | ISO → epoch ms |
| `updated_at: str` | `meta.updatedAt` | ISO → epoch ms |
| `deleted_at: str` | `meta.deletedAt` (tombstone) | ISO → epoch ms |
| `properties` | flat fields / `data` / `props` | split — see below |

### Note → Node

| Old | New | Transform |
|---|---|---|
| `style.type` (Dim0 enum) | `type` (NodeType) | inverse of `_CANVAS_TO_DIM0_TYPE` (existing map) |
| `graph_uid` | *(board partition)* | becomes the `boardId` the content store is keyed by — not a node field |
| `parent_id` | `parentId` | direct |
| `style.angle` (deg) | `angle` (rad) | `deg * DEG_TO_RAD` (inverse of today's `RAD_TO_DEG`) |
| `style` (rest) | `style` | field map (camelCase); `type`/`angle` extracted out |
| `properties.node_position` | `x`, `y` | `position.{x,y}` |
| `properties.node_size` | `w`, `h` | `size.{width,height}` |
| `properties.node_z_index` | `z` | `number` |
| `properties.pinned` | `pinned` | `boolean` |
| `properties.list_order` | `listOrder` | `number` |
| `properties.url` | `url` | `url` |
| `properties.image_url` | `data` (image) | `image.url` → `data.src` ⚠️ |
| `properties.icon_data` | `data` (icon) | 3 variants (icon/emoji/phosphor) → typed icon ⚠️ |
| `properties.slide_name/number` | `data` (frame) | → `data.slideName/slideNumber` |
| `properties.programming_language` | `data` (code) | → `data.language` |
| `properties.emoji` (deprecated) | — | **drop** |
| `properties.*` (extra: reasoning, sources, custom) | `props` | keep as `DataProperty` (only if `props` ships) |

### Link → Edge

| Old | New | Transform |
|---|---|---|
| `source: str` + `properties.start_point` | `source: EdgeEnd` | node id + `is_local_offset` → `{nodeId, localOffset}`; `source==""` → `{worldPoint}` |
| `target: str` + `properties.end_point` | `target: EdgeEnd` | same with `end_point` |
| `properties.edge_control_point` | `control: Vec2[]` | midpoint → cubic controls (`midpointToCubicControls`, existing math) |
| `style.path_style` | `pathStyle` | extract to top-level |
| `style` (rest) | `style: EdgeStyle` | field map |
| `content`/`label` | `label: string` | `.markdown` |
| `graph_uid` | *(board partition)* | `boardId` |
| `parent_id` | `parentId` | direct |

### Graph → Board (3 planes)

| Old (`Graph`) | New | Plane |
|---|---|---|
| `uid` | `BoardMeta.id` / `boardId` | meta |
| `label` | `BoardMeta.title` | meta |
| `nodes: Note[]` | `BoardContent.nodes` (Record) | content |
| `edges: Link[]` | `BoardContent.edges` (Record) | content |
| `format_version` | `BoardContent.schemaVersion` | content |
| `visibility` | `BoardMeta.visibility` | meta |
| `readonly` | `BoardMeta.acl` (derive) | meta |
| `thumbnail` | `BoardMeta.thumbnail` | meta |
| `created_at/updated_at/deleted_at` | `BoardMeta.{...}` | meta |
| *(none)* | `BoardMeta.kind = 'synced'` | meta (migrated boards are synced) |
| *(none)* | `BoardMeta.ownerId / acl` | meta (from board-ownership table) |
| *(none)* | `BoardView.camera/selection` | local — **not migrated** (per-device) |

### ⚠️ Non-trivial transforms to design

- **`image_url` → `data.src`** — today a URL; canvas-harness wants a self-contained
  data URI. Decide: keep URL (extend the type) or fetch-and-inline at migration.
- **`icon_data` → typed icon** — 3 variants (icon URL / emoji / phosphor name+color)
  need a typed `data`/style representation.
- **`style.type` → `node.type`** and **degrees → radians** — small but easy to get
  wrong; reuse the existing converters.

### Reuse: the convert layer *is* the migration

The position→flat, endpoint→`EdgeEnd`, and midpoint→control logic **already exists**
in `apply_ops.py` + `convert/`. The migration is essentially that translation run
**once** over Postgres rows — then the live translation layer is **deleted**. Port,
migrate, delete.

### Approach & ordering

1. **One-time migration** old `Note`/`Link`/`Graph` → new shape (the tables above).
2. **Read-time adapter** during transition so REST/search keep working until ported
   off Postgres-as-truth.
3. **Sequence vs lifts:** the new TS model is needed by **Phase A** (local store
   persists *this* shape). Migrating *server* data is a **Phase B** concern (when
   boards go online). So: define the model now → build Phase A on it → migrate
   Postgres when wiring the relay.

## Decided

- **`label`/`content`** — keep the names; **plain `string`** (markdown), searchable
  iff non-null. No RichText wrapper. Aligns with canvas-harness's string `content`.
- **Style granularity** — **LWW per whole style-object** (revisit per-sub-field only
  if concurrent style clobber becomes a real problem).
- **Storage grain** — **per-board snapshot + op-log**, not per-node rows (below).
- **Properties / typing** — model app-known fields as **typed** (flat fields or
  typed per-type `data`). The dynamic `props` bag (typed values, runtime keys) is
  reserved for user-defined columns + agent outputs and is **optional in v1**.
- **Groups/frames** — keep as today: `frameOrder` is shared content; `groups`
  membership is per-node.

## Open questions

- **Per-type `data` schema** — extend the typed union as node types land
  (image/icon/code/frame covered; custom types register via `defineNode`).
- **`props` schema (only if DB-of-notes ships)** — free keys vs a per-board
  registered column schema (typed either way).
