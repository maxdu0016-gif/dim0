# Offline-first: Phase D carry-overs (thumbnails / search UI / transforms)

Status: planned. Order: **thumbnails → search UI → transforms**. Grounded in code scouts
(2026). Corrections vs first-pass assumptions: the local canvas store is **layer-scoped**
after per-layer projection (so whole-board search reads `BoardPersistence.load()`, not
`getAllNodes()`); thumbnail delivery needs a **local sink**, not the backend API.

## 1. Board thumbnails for local  (~60 LOC, low risk)

Capture is fully reusable — `use-thumbnail-capture.ts` renders via `renderMinimapContent`
(same path as the live minimap) → PNG blob on idle. Only the sink is backend-specific
(POST `/boards/{id}/thumbnail`). Reuse capture, swap the sink, store in `BoardMeta.thumbnail`
(field exists), render on the card.

- `BoardRegistry.setThumbnail(id, dataUrl, now?)` — get→put with thumbnail+updatedAt.
- `saveLocalThumbnail(boardId, blob)` — blob→dataURL (FileReader) → `stores.boards.setThumbnail`.
- Parameterize the hook's sink; in `harness-canvas.tsx` drop the `!local` gate, pass
  `local ? saveLocalThumbnail : saveThumbnail`.
- `LocalBoardCard` (`local-dashboard.tsx`): render `<img src={thumbnail}>` (mirror `board-card.tsx`).
- Nuance: local store holds only the current layer → gate capture to `rootId == null` (root view).
- Tests: `setThumbnail` (both engines), blob→dataURL.

## 2. Search UI — palette + cross-layer jump  (~200 LOC, low-med risk)

All seams exist: `CommandDialog` (cmdk), `useBoardKeyboard` (Cmd+K), `chromeDialog` state,
and `useCenterFromUrl` already handles `?center=<id>`; `root_id` drives the layer. Jump =
`navigate({ root_id, center })`.

- Whole-board source: on dialog open, build an ephemeral index from `BoardPersistence.load()`
  (results carry `{id, label, parentId}`).
- `NotesSearchDialog`: cmdk dialog; rows show title + folder breadcrumb (`buildLayerPath`).
- Add `"notes-search"` to `ChromeDialog`; hotkey in `use-board-keyboard.ts`; mount alongside others.
- On select: `navigate({ search: { root_id: note.parentId ?? undefined, center: note.id } })`.
  local-board-screen re-scopes; `useCenterFromUrl` centers (+ ensure it selects).
- Tests: whole-board result builder (pure); `buildLayerPath` (already tested).

## 3. Transforms port — notify / mapify / schemify / drawify  (~250 + ~180 drawify, med risk)

**DEFERRED until after the sync spine (Phase E).** These are leaf features (structured
LLM call → notes/links → existing apply path); nothing depends on them and the buttons are
already hidden on local (`!isLocal`), so there's no regression. Deferring avoids rework:
the sync spine may change persistence / the op model, and transforms write notes/links on
top of that — so they should be built once, on the final substrate. Plan below stands as-is
for when we pick it up.


Apply half already works locally: `SaveAsNote → convert → {notes,links} → setMindMap →
useHarnessApplyMindMap` (drain path already local-wired). Porting = replace the backend API
call with a **local structured LLM call** returning the same `{notes,links}`, reuse staging.

Backend transforms are single-shot structured generations (`output_type=`), not tool loops.

- **Engine capability (keystone):** `LlmClient.structured<T>(system, input, zodSchema)` —
  BYOK `response_format: json_schema` (from `z.toJSONSchema`), parse+validate. Fallback:
  prompt-and-parse for providers without structured outputs.
- Port 4 output schemas to Zod (MapifyTheme recursive; DrawnGraph positioned/styled).
- Port 4 prompts (`*.system.jinja` → static system prompts; answer = user message).
- Port 4 converters (output → NoteNode/LinkEdge), mirroring `convert_*_output_to_notes_links`.
- `runTransform(type, answer, llm)` → `{nodes, edges}` → `setMindMap`.
- Re-enable UI local-aware: `SaveAsNote`/`response-actions.tsx` (drop `!isLocal`), then the
  canvas context-menu AI actions.
- Ship notify/mapify/schemify first; drawify follow-up (heaviest, uses Claude Opus).
- Tests: each converter (pure, fixtures); `runTransform` with a scripted structured-LLM.

Reference files: use-thumbnail-capture.ts, board-card.tsx, board-registry.ts, local-dashboard.tsx;
command.tsx, use-board-keyboard.ts, use-center-from-url.ts, board-app-store.ts (ChromeDialog);
save-as-note.tsx, response-actions.tsx, convert-to-mindmap.ts, mindmap-store.ts,
use-harness-apply-mindmap.ts; backend agents/mindmap/*, agents/drawify/*, prompts/*.jinja.
