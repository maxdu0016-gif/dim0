# Local Agent — Chat-UI Reuse Map

> Plan for driving the EXISTING rich chat UI with the local frontend engine
> (`features/agent/engine`), reusing components instead of the minimal panel.
> Companion to [agent-engine-rewrite.md](agent-engine-rewrite.md). Grounded in a
> full trace of `webui/src/features/agent/`.

## Headline

**Almost the entire rich chat render layer is pure** — `conversation`,
`assistant-message`, `reasoning-steps`, `reasoning-step-row`, `tool-step-row`,
`user-message`, `sources-view`, `note-widget-preview`, widgets, actions — all
take `ReasoningStep[]` / `ChatMessage` and have **zero backend coupling once that
data is in hand**. So the work is: **(1) an `AgentEvent → ReasoningStep[]`
adapter, (2) a local message store, (3) a local submit hook, (4) parameterize the
entry points.** Renderers are reused untouched.

## The data-flow seam (where local substitutes for backend)

```
BACKEND:  InputBar → useSubmitPrompt → sendMessage(stream) → buildResponse
          (chunks → ReasoningStep[]) → React Query cache → Conversation(useListMessages)

LOCAL:    InputBar → useLocalSubmitPrompt → useLocalAgent.send → runAgent (AgentEvent)
          → agentEventToStep (events → ReasoningStep[]) → local-messages-store
          → Conversation(useLocalMessages)
```

The substitution point is the **accumulator + the message source**: swap
`buildResponse`/React-Query for an `AgentEvent` accumulator writing to a local
store. The UI below `ReasoningStep[]` is identical.

## New files (the only real work)

| File | Role |
|---|---|
| `utils/stream/agent-event-to-step.ts` | accumulate `AgentEvent` → `ReasoningStep[]` (mirrors `build.ts`: tool_start→ToolCallStep "started", tool_result→fill output "completed", assistant_text→reasoning step, done→finalize). Reuses `build.ts`'s `makeToolOutput`/`toReasoningStep` where possible. |
| `store/local-messages-store.ts` | Zustand store of the session's `ChatMessage[]` (ephemeral; later → IndexedDB `chat` store) |
| `hooks/use-local-messages.ts` | read messages from the local store (parallel to `useListMessages`) |
| `hooks/use-local-submit-prompt.ts` | local submit: BYOK check → run engine → accumulate → write store (parallel to `use-submit-prompt`) |

Plus: extend `engine/tools.ts` results to the `ToolOutput` shapes below, and a
small `tool-outputs.ts` addition for `search_notes`/`list_boards`.

## Classification (condensed)

| Bucket | Files |
|---|---|
| **REUSE as-is** (pure renderers + types) | `types/{stream,tool-outputs,chat}.ts`; `components/chat/{conversation*,assistant-message,reasoning-steps,reasoning-step-row,tool-step-row,user-message,sources-view,note-widget-preview,tool-step-widgets,send-button,welcome-message,starter-prompts}`; `actions/{save-as-note,copy-answer}`; `utils/{annotations,url,md,stream/text}`; all of `engine/*`, `byok/*` |
| **ADAPTER** (swap data source) | `conversation.tsx` (messages source), `input.tsx` (submit hook), `chat-view.tsx`, `utils/stream/build.ts` (→ the new event accumulator) |
| **REPLACE** | `hooks/use-submit-prompt.ts`, `api/send-message.ts`, `api/list-messages.ts` → local equivalents |
| **RECONFIGURE** | `store/chat-store.ts` (drop services/llmModel/webSearch; keep `isStreaming` + context selection; tools = local subset) |
| **DROP for local** | `input-settings/{settings,tools-menu,model-card,web-search,memory-search,code-interpreter,image-gen}`, `api/{list-chats,create-chat,describe-chat,update-chat,delete-chat,list-available-services}`, `utils/stream/{digest,transform}` (no HTTP stream) |
| **PARAMETERIZE** (entry points) | `components/board-view.tsx`, `flow/floating-assistant.tsx`, `flow/floating-island.tsx` → add `agentSource: "backend" \| "local"`, swap the submit hook; `flow/copilot-sheet.tsx` reuses as-is |

## Tool → ToolOutput mapping (so our tools render through `tool-step-row`)

`tool-step-row` switches on `step.name` and needs these exact shapes:

```ts
create_note → { type:"create_note", noteId, graphUid, label, noteType, parentId? }
update_note → { type:"edit_note",   noteId, graphUid, label, noteType, parentId? }
link_notes  → { type:"link_notes",  linkId, sourceId, targetId, graphUid, label }
search_notes → NEW: { type:"search_notes", results: {id,title}[] }   // add to tool-outputs.ts
list_boards  → NEW: { type:"list_boards",  boards:  {id,title}[] }    // add to tool-outputs.ts
```

Required for the note card to render: `noteId, graphUid, label, noteType`; the
`ToolCallStep.state` must reach `"completed"`. So `engine/tools.ts` should return
these structured outputs (today they return `{ id }`), and the adapter sets
`state`. `eventMessages` can stay empty (local tools are instant).

## Entry-point parameterization (the `agentSource` switch)

Mirror the board's `local` prop:
```ts
const submit = agentSource === "local" ? useLocalSubmitPrompt() : useSubmitPrompt()
```
on `FloatingIsland`; thread `agentSource` from `board-view` → `FloatingAssistant`
→ `FloatingIsland`. The local board (`local-board-screen`) then mounts the SAME
`FloatingAssistant`/`CopilotSheet` with `agentSource="local"`, replacing the
minimal `LocalAgentPanel`.

## What this deletes/simplifies vs backend

- No `applyNoteOutput`/`applyLinkOutput` bridge — local tools write the store
  directly (the agent's effects ARE the store mutations).
- No chat CRUD, service discovery, model/search/tool menus.
- `sources-view`, `image-gen-view` simply render nothing (no web/image tools).

## Sequencing

1. `agent-event-to-step.ts` (+ tool-output additions, + structured tool results) — unit-test the adapter.
2. `local-messages-store.ts` + `use-local-messages.ts` + `use-local-submit-prompt.ts`.
3. Parameterize `FloatingAssistant`/`FloatingIsland`/`board-view` with `agentSource`.
4. Mount `agentSource="local"` in `local-board-screen`; retire `LocalAgentPanel`.
5. Reconfigure `chat-store` for local; verify with the e2e flow (transcript now rich).
