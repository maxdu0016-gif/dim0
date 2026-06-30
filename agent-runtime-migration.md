# Agent Runtime Migration Map — backend → frontend

How the Python agent runtime maps onto the local-first frontend agent: what's
**✅ done**, **⚠️ partial / not wired**, **❌ missing**, and which phase each gap
belongs to. Companion to `offline-first-roadmap.md` and `agent-engine-rewrite.md`.

> **Headline:** the local agent can *call* tools, but it lacks the backend's
> **post-turn layout** and **per-note content-sizing** — so multi-note answers
> pile invisibly at the origin. Good news: the building blocks (a Dagre
> `autoLayout`, a sucrase mini-app compiler) **already exist on the frontend**;
> the agent just doesn't call them. Most of the gap is *wiring*, not *building*.

---

## 0. Two live bugs (root-caused)

**Bug 1 — "mindmap runs, no errors, nothing appears."**
`write_note` hardcodes `x:0, y:0, w:240, h:120` ([engine/tools.ts]). The backend
instead (a) sizes each note to its content at creation and (b) runs a Sugiyama
arrange after the turn. We do neither → every node stacks exactly at the origin,
links become zero-length, and the whole mindmap collapses to one point. A single
note works because there's nothing to overlap. **Fix = §2.**

**Bug 2 — "answer gone after refresh / not finishing."** Not yet root-caused; we
persist only in the `finally` after the whole loop ends, so a long/again-empty
turn leaves nothing saved. Needs one diagnostic log (turn-done + persisted-count)
to distinguish: (a) refreshed mid-turn, (b) turn ended with no final text, (c)
`persist` no-oped on a reset `chatUid`. **Action: add the persist log, reproduce.**

---

## 1. Agent runtime lifecycle (element-by-element)

| Backend element | What it does | Frontend status | Where / phase |
|---|---|---|---|
| Turn loop, max-turns | `AgentRunner` loop; `ASSISTANT_MAX_TURNS=30` | ✅ matches (`DEFAULT_MAX_TURNS=30`) | `engine/agent-loop.ts` |
| Tool dispatch + feed results back | SDK Runner dispatches, results re-fed | ✅ | `agent-loop.ts` |
| System prompt (`plan.system.jinja`) | role + format-picker + canvas style | ✅ ported, local-adapted | `prompts/plan-system.md` |
| Skills (`learn_generate_*`) | progressive-disclosure guides | ✅ | `engine/skills.ts` |
| Note tools `write/edit/get/link` | board mutations | ✅ | `engine/tools.ts` |
| Session history (last 16, w/ traces) | `AssistantSession.get_items(16)` | ✅ | `local/chat-history.ts` |
| Message persistence + reasoning | Postgres + Qdrant | ✅ IndexedDB | `store/*` |
| **Per-note creation geometry** | stack-below-siblings pos + **content-fit w/h** (`service.py`, `text_measure.py`) | ❌ hardcoded `0,0,240,120` | **§2 · fix now** |
| **Post-turn arrange** | Sugiyama per component + mindmap split + flex-wrap (`notes/layout.py`) | ❌ not wired (Dagre exists, unused) | **§2 · fix now** |
| Mini-app validation on write | sucrase compile, retry on error (`compile.py`) | ⚠️ compiler exists, `write_note` doesn't call it | `mini-app-runtime/compile.ts` · fix now |
| Sheet resize seeding | seed 440×440 on convert-to-sheet | ❌ | §2 · minor |
| Token-level streaming | per-token + reasoning deltas via queue | ⚠️ **non-streaming per turn** (we render per event, not per token) | polish |
| Model settings | reasoning effort, temperature, penalties, cache | ❌ we send model id only | polish / Phase F |
| Auto-model routing | lite/pro classifier (`auto_model.py`) | ❌ single BYOK model | needs catalog → Phase F |
| Input formatter (`plan.user.jinja`) | wraps history+query in XML | ⚠️ replaced by native role history | n/a (by design) |
| Answer post-processing | URL/citation canonicalization | ❌ (no web/memory ⇒ mostly moot) | later |
| Board auto-label (`describe_board`) | names the board from 1st turn | ❌ (we label *chats*, not boards) | Phase C |

### Tools the agent has vs. backend-only

| Tool | Frontend | Note |
|---|---|---|
| `write_note` / `edit_note` / `get_note` / `link_notes` | ✅ | core build set |
| `learn_generate_diagram/mini_app/html_widget` | ✅ | skills |
| `list_boards` | ⚠️ exists, not in agent ctx | **Phase C** (needs registry) |
| `search_notes` (memory) | ⚠️ exists, not wired | **Phase D** (needs live index attach) |
| `web_search`, `navigate` | ❌ | not local (needs key/relay) — later |
| `code_interpreter` | ❌ | no in-browser sandbox — later/maybe |
| `image_generation`, `image_description` | ❌ | needs provider — later |
| `display_*_widget` (stock/weather/image) | ❌ | UI side-effects — later |

---

## 2. Node geometry & layout — the missing half (Bug 1)

The backend has **two** geometry systems; the frontend agent has **neither**
(though the canvas has the primitives).

### 2a. Per-note sizing at creation — ❌
Backend `estimate_node_size` (`text_measure.py`) content-fits **text shapes**
(rect/ellipse/diamond/…): a char-count height model (`~0.55·fontSize` glyph
advance, markdown-aware line wrap, code-block padding, `MAX=4000`) + width shrink
to natural width clamped `[120, default]`, with per-shape aspect floors. Excluded
types (sheet, code-sandbox, mini-app, widget) keep fixed defaults.
Frontend: only **mini-app** auto-grows (iframe `mini-app:resize`, grow-only, cap
1200 — `node-types/mini-app/view.tsx`). Generic notes never content-size.
→ **Fix:** port `estimate_node_size` (pure function, ~150 LOC) and apply in
`write_note`.

### 2b. Per-note position at creation — ❌
Backend `compute_note_position` (`service.py`): stack below siblings at shared
`min_x`, `GAP=80`; children offset `(+40, parent.h+80)`.
Frontend: `write_note` always `(0,0)`.
→ Largely **superseded by 2c** for agent turns (the arrange repositions), but a
sane default placement avoids the origin pile for single/streaming creates.

### 2c. Post-turn multi-note arrange — ❌ wired (primitive exists)
Backend `rearrange_created_notes` (`notes/layout.py`), run by
`_rearrange_turn_notes` when **≥2 notes** created:
- connected components (union-find on new links),
- **mindmap mode** for trees (split children L/R by subtree size, two Sugiyama
  passes stitched at root), else single LR Sugiyama (`SIBLING_PAD=30`,
  `RANK_PAD=150`, igraph),
- **flex-wrap** free components below existing board content
  (`TILE_GAP_X=80`, `TILE_GAP_Y=120`, `MAX_ROW_WIDTH=3500`),
- anchor alignment (new nodes move around untouched existing ones),
- border-to-border edge endpoint anchoring.

Frontend **already has** `autoLayout(nodes, edges, options)` (Dagre) in
`board/lib/graph/auto-layout.ts`, used by mindmap-drain / Drawify — but it
operates on flow types (`NoteNode`/`LinkEdge`), not canvas-harness store nodes,
and **the agent never called it**.
→ **DONE** (`harness/agent/arrange-created-nodes.ts`): after the turn we collect
the created node ids + the links among them, then lay them out and write
positions back in one batch (translated below existing content; single-node
turns untouched). Two modes, mirroring the backend:
- **Bidirectional mindmap** for trees with ≥2 root children: split children
  left/right by subtree size, Dagre-LR each half, mirror the left half around
  the root, stitch at the root.
- **Flat Dagre LR** fallback for non-tree graphs (DAGs/cycles/chains).
Still missing vs backend: per-component flex-wrap of multiple disjoint clusters,
and exact radial clipping for ellipse/diamond (canvas-harness clips to the rect).

### 2f. Note color + edge attachment (DONE)
- **Color:** agent notes now stamp a **random Tailwind-200** fill per note
  (`pickRandomColorOfShade(200)`, mirrors backend `random.choice(TAILWIND_200_ADAPTED)`)
  as `_storedColors`, so the theme hooks project it per mode.
- **Edges:** `link_notes` attaches at each node's **center** (`{w/2, h/2}` in the
  local frame), so canvas-harness's `clipSamples` auto-clips the center→center
  line to each border — the backend's `_edge_anchor_offset`, for free, and it
  re-clips live as `arrangeCreatedNodes` moves the nodes.

### 2e. Theme adaptation (light/dark) — how to create theme-correct nodes
**The rule:** a node's display colors (`style.{backgroundColor,strokeColor,textColor}`)
are *projected per theme mode* from a canonical, theme-independent triplet stored
at **`data._storedColors`**. Light mode = identity; dark mode runs through
`adaptNodeColors` (`harness/theme/color-adapter.ts`). Two harness hooks do the
projection and both **key off `_storedColors`**:
- `useStampNewNodes` — on every local `node.add`, re-projects display style for
  the current mode (also where pasted/agent nodes get themed).
- `useThemeColorProjection` — re-projects all nodes on a theme flip.

**The bugs we hit & fixed:**
- *Create-time:* `write_note` set neither style nor `_storedColors`, so nodes
  fell back to the lib's non-theme-aware (light) default. Fixed by stamping
  `_storedColors` (a random Tailwind-200; see §2f) so the create-time stamp hook
  projects them.
- *Reload-time:* a refreshed local board painted the *persisted* theme, not the
  current one — `applyContentToStore` hydrates as `origin: "remote"`, which both
  `useStampNewNodes` and `useThemeColorProjection` skip. Fixed by **projecting
  display colors from `_storedColors` inside `applyContentToStore`** for the
  current mode (the local analog of `noteToNode`). Persisted `style` is now
  irrelevant for theming — display is always derived on load.

**Invariant for any new node emitter:** set `_storedColors` (let the hooks/​hydrate
project) — never bake a concrete light color into `style`.

### 2g. Message order on reload (fixed)
Chat messages persist keyed by `[chatUid, id]`; `getAll` returns **key order**,
and ids don't sort to conversation order (the assistant id is minted before the
user id, and the counter sorts lexically — `…-10` < `…-9`). So a reload showed
the answer above the question. **Fix:** `saveMessages` stamps an `order` index
and `loadMessages` sorts by it — insertion order, not key order.

### 2h. End-to-end test
`agent/local/agent-pipeline.e2e.test.ts` drives the whole pipeline with a
scripted LLM (turn → tool calls build a mindmap → arrange → persist → **reload
into a fresh store**) and asserts: nodes survive + arrange bidirectionally,
colors re-project for the theme on load, and messages reload in order. This is
the regression guard for the round-trip bugs above (unit tests can't catch them
— each unit is individually correct; the bug is the round-trip).

### 2d. Mini-app validation on write — ⚠️
`mini-app-runtime/compile.ts` (sucrase) exists and is used by the renderer.
`write_note(note_type="mini-app")` should call it before persisting and, on
error, return the line/col so the agent self-corrects (backend parity). ~40 LOC.

---

## 3. Chat + canvas feature inventory → phase

### Backend-only AI affordances — DISABLED on local (temporary)
These call `/tools/*` and would fail on `/local`, so they're **gated off** via
`useIsLocalBoard()` until ported to the in-browser engine:
- **Answer-card transforms** — Notify / Mapify / Schemify (`response-actions.tsx`
  → `SaveAsNote` → `useConvertToMindMap`).
- **Canvas context-menu AI section** — summarize / mapify / schemify / quizify /
  drawify / explain / translate (`canvas-context-menu.tsx` →
  `useAiSparkActions`). Position + Export stay enabled (local-safe).

**Port plan (deferred, ~Phase D "transforms"):** the core mindmap/diagram
*building* is already covered by the main agent + `learn_generate_diagram` skill;
these are *post-hoc answer→artifact* transforms. Port the deterministic ones
(Mapify/Schemify/Summify) as local structured-output calls reusing the
(now bidirectional) `autoLayout` + `apply-mindmap` pipeline; Notify = a single
`write_note(sheet)`; Quizify → the mini-app skill; Drawify ≈ Mapify. Re-enable
each as it lands. `describe_board` (board auto-label) → Phase C.

### Chat UI — mostly ✅
Conversation, input bar, user/assistant renderers, reasoning-step + tool-call
rows, history dropdown, floating island + answer card, BYOK settings gear — all
wired for local. **Missing:** token-streaming render (per-turn only), and the
backend-only input settings (web/memory/code/image) — intentionally absent.

### Canvas — renderers ✅, agent-geometry ❌
All node-types render (mini-app, sheet, widget, code-sandbox, document, folder);
mini-app compile + auto-grow work. Missing for the agent: content-sizing, layout
wiring (§2), sheet seed.

### Capability → phase

| Capability | Status | Phase |
|---|---|---|
| Post-turn auto-layout (wire Dagre) | ❌ | **now** (finish B-agent) |
| Per-note content sizing | ❌ | **now** |
| Mini-app validate-on-write | ⚠️ | **now** |
| `list_boards` tool (registry in ctx) | ⚠️ | **C** |
| Board auto-label (`describe_board`) | ❌ | **C** |
| `search_notes` (attach live index) | ⚠️ | **D** |
| Sheet auto-height / resize | ❌ | **D** (polish) |
| Token-level streaming | ⚠️ | polish |
| Multi-client collab of agent edits | ❌ | **E** |
| Managed (non-BYOK) inference + model catalog + auto-routing | ❌ | **F** |
| Web search / code-exec / image-gen | ❌ | later (need key/relay/sandbox) |

---

## 4. Immediate actions (close Bug 1, diagnose Bug 2)

1. **Wire post-turn auto-layout** — adapter (store nodes/links → flow types) +
   call `autoLayout` on agent-created nodes, write back in one batch. *(Bug 1)*
2. **Port `estimate_node_size`** — content-fit w/h in `write_note`. *(Bug 1 + the
   auto-height you noticed)*
3. **Mini-app validate-on-write** — call the existing sucrase compiler.
4. **Add a persist/turn-done log** — `✓ turn done · persisted N msgs under <uid>`,
   then reproduce Bug 2 to pick the cause.

These four are the difference between "the agent calls tools" and "the agent
builds boards." None needs the relay — all doable now on BYOK.

---

## Mini-app → local-first (single frontend)

The mini-app is iframe-sandboxed React, compiled client-side (sucrase) and
rendered in the iframe. Migrated to local with **no second origin / build /
server**:

1. **Widget state → IndexedDB** (`mini-app/state-client.ts` → `mini_app_state`
   store, DB v4). Was `/mini-app-state/:noteId`.
2. **Validate-on-write** (`mini-app/validate.ts`): `write_note(mini-app)`
   sucrase-validates before persist, returning line/col so the agent
   self-corrects. Was a redundant backend `compile.py` subprocess.
3. **Single-frontend serving (opaque origin).** Best practice for untrusted
   code is `sandbox="allow-scripts"` *without* `allow-same-origin` → **opaque
   "null" origin**, isolated even when served same-origin. So the second origin
   (`mini-app.dim0.net`) is gone:
   - `vite.mini-app.config` + `vite-plugin-singlefile` build the runtime into one
     self-contained `public/mini-app/index.html` (no external module fetch — the
     requirement for opaque origin). `npm run build` builds it first.
   - `mount.tsx` dual-path: **default (single-frontend)** loads
     `/mini-app/index.html` with `sandbox="allow-scripts"`, `postMessage` target
     `"*"`, trusts inbound `origin === "null"` + `source === contentWindow`.
     **Cross-origin (opt-in via `VITE_MINI_APP_ORIGIN`)** keeps the old
     `allow-same-origin` + HMR path.
   - `main.tsx` / `rpc.ts` (runtime): when no `HOST_ORIGIN` is configured, trust
     the host by **`source === window.parent`** (origin-independent; a sandboxed
     iframe's only peer is its embedder) and reply with `"*"`.

**Dev:** single-frontend needs `npm run build:mini-app` once to populate
`public/mini-app/` (static asset, no runtime HMR). For runtime-harness HMR, set
`VITE_MINI_APP_ORIGIN` + run `dev:mini-app` (opt-in cross-origin).

**Needs live (browser-only) verification:** iframe renders under opaque origin;
`parent.document` throws from inside; host cookies/storage unreachable.

**Known polish (non-fatal):** the single-file still references
`./theme-bootstrap.js` (brief theme flash before the render message applies
theme) and `/config.js` (404). Both are non-fatal; inline theme-bootstrap to
remove the flash + console noise.
