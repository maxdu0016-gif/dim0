# Offline-first: the local storage interface

Status: design → to implement (Phase D.0, before the Phase D carry-overs)
Decision inputs: desktop app is **real & near-term** (SQLite target); **canonical entity shapes defined now**.

## Why this exists

The local persistence grew file-by-file with no seam, so it has **three incompatible
IndexedDB access patterns** and real bugs:

- `board-registry` / `board-persistence`: one persistent connection, `init()` lifecycle,
  multi-store atomic transactions.
- `chat-persist`: a **fresh `openDim0Db()` open/close per call** — three opens for one
  `saveMessages()`.
- `mini-app/state-client`: fresh open/close per call.

Bugs this produced:

- `deleteBoard()` cascades to `snapshots` / `oplog` / `views` but **not** `chats` /
  `chat_messages` → orphaned chats, `by-board` index returns dead boards' chats.
- **No `deleteChat` / `deleteMessage`** locally → history grows unbounded.
- `chat_messages` ordering rides on a hand-maintained `order` field, unvalidated.
- Entity drift: `ChatRecord.id` vs `ChatMessage.chatUid` for the same concept.

The backend has **no** store abstraction (concrete `GraphStore` / `ChatStore` /
`ContentStore`, composed by hand) — correctly, because it has exactly one implementation
(Qdrant + Postgres). The frontend is the opposite case: it will have **two** implementers
(IndexedDB now, SQLite-on-desktop later), so it needs the seam the backend doesn't.

## The design: two layers

### Layer 1 — `StorageEngine` (the port)

The **only** thing a desktop app reimplements. Generic, transaction-capable, honest for
both IndexedDB and SQLite (both do keys, ranges, indexes, transactions natively):

```ts
type Collection =
  | "snapshots" | "oplog" | "boards" | "views"
  | "chats" | "chat_messages" | "mini_app_state"

interface StorageEngine {
  get<T>(c: Collection, key: Key): Promise<T | undefined>
  list<T>(c: Collection, q?: { index?: string; range?: KeyRange; order?: "asc" | "desc" }): Promise<T[]>
  put<T>(c: Collection, value: T, key?: Key): Promise<void>
  delete(c: Collection, key: Key | KeyRange): Promise<void>
  tx<R>(collections: Collection[], fn: (t: Txn) => Promise<R>): Promise<R>
  close(): void
}
```

- `IndexedDbEngine` — wraps today's `idb.ts` (schema, DB_VERSION, upgrades live here only).
- `SqliteEngine` — future desktop adapter (Tauri/Electron). One table per collection,
  compound keys as composite PKs, indexes as SQL indexes, `tx` as a real transaction.

Raw-filesystem is **not** a target: no ranges/indexes/atomicity. Desktop = SQLite.

### Layer 2 — Repositories (written once, over the engine, never per-platform)

All domain logic and the bug fixes live here:

- **`BoardRepo`** — `create` / `get` / `list` / `rename` / `delete` (**cascades to chats +
  messages**) / `saveView` / `loadView`; snapshot + oplog read/append/compact.
- **`ChatRepo`** — `createChat` / `getChat` / `listByBoard` / **`deleteChat`** /
  `addMessages` / `getMessages` / **`deleteMessage`**; one canonical chat shape.
- **`MiniAppRepo`** — `getState` / `putState` / `deleteState` (by note).

**One composition root** (`createLocalStores(engine)`) owns a single engine instance and
hands repos to the app — kills the fresh-connection-per-op pattern outright.

Search (Orama) stays a **derived, in-memory read-model** — not in the engine; rebuilt from
`BoardRepo` content. Persisting it is a separate optional optimization.

## Canonical entity shapes (defined now)

One definition per concept in the model layer, backend field names where sync needs them.
Consolidates the scattered defs (`idb.ts` `ChatRecord`, `chat.ts` `ChatMessage`,
`model/index.ts` `DimNode`).

- **Board content** stays canvas-native (`BoardContent { nodes: DimNode[], edges: DimEdge[],
  groups, frameOrder }`). The Note/Link ↔ Node/Edge seam is the existing `convert/` layer —
  storage does not adopt the backend `Note` shape.
- **`LocalChat`** `{ id, boardId, label?, createdAt, updatedAt, deletedAt? }`
  (backend `Chat`: `uid` → `id`, `graph_uid` → `boardId`).
- **`LocalMessage`** `{ id, chatUid, role, content: { markdown }, properties: { reasoning?,
  context? }, createdAt, order }` (backend `Message` field names kept: `chatUid` ↔ `chat_uid`).
  Removes the `ChatRecord.id` / `ChatMessage.chatUid` drift.
- **`MiniAppState`** `{ noteId, state }` (opaque; validated at the mini-app boundary).

## Migration path (incremental, low-risk — mostly relocation)

1. **Engine + adapter.** Add `StorageEngine` port + `IndexedDbEngine` wrapping `idb.ts`.
   No behavior change. (~200 LOC)
2. **`BoardRepo`.** Move `board-registry` + `board-persistence` onto the engine; keep method
   names so callers are untouched. Add the delete cascade. (~250 LOC, moved)
3. **`ChatRepo` + `MiniAppRepo`.** Move `chat-persist` + `state-client` onto the engine;
   add `deleteChat` / `deleteMessage`; adopt canonical shapes. (~200 LOC, moved)
4. **Composition root.** `createLocalStores(engine)`; wire callers/stores to it. (~50 LOC)
5. **Carry-overs land on the repos** (Phase D proper): per-layer `parentId` load, search
   rebuild, thumbnails, transforms port.

Net size ≈ today's; the work is dedup + one seam, not new surface.

## What this unlocks

- Desktop app = swap `IndexedDbEngine` → `SqliteEngine`; repos, cascades, carry-overs come free.
- Cascade + `deleteChat` bugs fixed in one place.
- One connection lifecycle, one schema/migration site.
- Canonical shapes ready for the Phase E sync spine.
