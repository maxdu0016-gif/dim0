import { useMemo, useState, type ReactNode } from "react"
import { ExternalLinkIcon, NoteIcon as ThoughtIcon } from "@/components/icons"
import { Link, useSearch } from "@tanstack/react-router"
import type { ToolCallStep } from "../../types/stream"
import { ToolNameIcon } from "../../types/stream"
import { extractStepDescription, getWebSearchUrls } from "../../utils/stream/build"
import type { CodeInterpreterOutput, CreateNoteOutput, EditNoteOutput, WriteNoteOutput } from "../../types/tool-outputs"
import type { ToolStepWidgetAttachment } from "./tool-step-widgets"
import { MiniLinkCard } from "../link-preview"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { WeatherCard } from "@/features/widgets/components/weather-card"
import TradingCard from "@/features/widgets/components/trading-card"
import ImageSearchStrip from "@/features/widgets/components/image-card"
import { ImageGenView } from "./image-gen-view"
import { NoteWidgetPreview } from "./note-widget-preview"
import { useChat } from "../../hooks/chat-context"
import { BoardUrl } from "@/routes"


/**
 * Renders hidden thought details for a completed tool step.
 */
const ReasoningMessage = ({
  reasoning
}: { reasoning: string }) => {
  return (
    <div className='text-muted-foreground p-0 space-y-1 italic'>
      <div className='flex items-center gap-2 font-medium cursor-pointer text-xs'>
        <ThoughtIcon className='size-4' strokeWidth={2} />
        <span>Thought</span>
      </div>
      <span className='text-sm'>{reasoning}</span>
    </div>
  )
}


/**
 * Renders code interpreter stdout and stderr when available.
 */
const CodeInterpreterResult = ({
  output
}: { output: CodeInterpreterOutput }) => {
  const stdout = output.stdout.trim()
  const stderr = output.stderr.trim()

  if (!stdout && !stderr) {
    return null
  }

  const blockClass = "w-full rounded-lg border p-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words"

  return (
    <div className='w-full flex flex-col gap-2'>
      {stdout !== "" && (
        <div className='w-full flex flex-col gap-1'>
          <span className='text-xs font-medium text-muted-foreground'>stdout</span>
          <div className={cn(blockClass, "border-border bg-muted text-card-foreground")}>
            {stdout}
          </div>
        </div>
      )}
      {stderr !== "" && (
        <div className='w-full flex flex-col gap-1'>
          <span className='text-xs font-medium text-destructive'>stderr</span>
          <div className={cn(blockClass, "border-destructive/30 bg-destructive/5 text-destructive")}>
            {stderr}
          </div>
        </div>
      )}
    </div>
  )
}


/**
 * Renders a compact summary for note tool results.
 */
const NoteToolResult = ({
  output,
  chatId,
  rootId,
}: {
  output: CreateNoteOutput | EditNoteOutput | WriteNoteOutput
  chatId?: string
  rootId?: string
}) => {
  const typeLabel = output.noteType.replace(/-/g, " ")
  const boardId = output.graphUid
  const noteId = output.noteId

  return (
    <div className='w-full rounded-lg border border-border bg-muted p-3'>
      <div className='flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground'>
        <span>note</span>
        <Link
          to='/boards/$id'
          params={{ id: boardId }}
          search={{
            center_around: noteId,
            current_chat_id: chatId || undefined,
            root_id: rootId || undefined,
          }}
          className='inline-flex items-center gap-1 rounded-md p-1 transition-colors hover:bg-background/70 hover:text-foreground'
          title='Open on board'
          aria-label='Open on board'
        >
          <ExternalLinkIcon className='size-3.5' />
        </Link>
      </div>
      <div className='mt-1 text-sm text-card-foreground whitespace-pre-line'>
        <span className='font-medium'>{output.label || "Untitled note"}</span>
        {` • ${typeLabel}`}
      </div>
    </div>
  )
}


/**
 * Renders widget cards underneath the last step of each widget tool family.
 */
const ToolStepWidgetView = ({
  attachment,
}: {
  attachment?: ToolStepWidgetAttachment
}) => {
  if (!attachment) {
    return null
  }

  return (
    <div className='w-full min-w-0 overflow-hidden flex flex-col gap-3 pt-1'>
      {attachment.noteWidget && (
        <div className='w-full min-w-0 overflow-hidden p-1'>
          <NoteWidgetPreview
            boardId={attachment.noteWidget.boardId}
            noteId={attachment.noteWidget.noteId}
            pending={attachment.noteWidget.pending}
          />
        </div>
      )}
      {attachment.imageFilename && (
        <div className='w-full min-w-0 overflow-hidden p-1'>
          <ImageGenView filename={attachment.imageFilename} />
        </div>
      )}
      {attachment.imageUrls && attachment.imageUrls.length > 0 && (
        <div className='w-full min-w-0 overflow-hidden p-1'>
          <ImageSearchStrip images={attachment.imageUrls} />
        </div>
      )}
      {attachment.weatherCities && attachment.weatherCities.length > 0 && (
        <div className='w-full min-w-0 overflow-hidden p-1'>
          <WeatherCard cities={attachment.weatherCities} />
        </div>
      )}
      {attachment.tradingSymbols && attachment.tradingSymbols.length > 0 && (
        <div className='w-full min-w-0 overflow-hidden p-1'>
          <TradingCard symbols={attachment.tradingSymbols} initialRange='1d' />
        </div>
      )}
    </div>
  )
}


/**
 * Renders tool call arguments as plain key/value rows (sienna key, foreground value).
 * Falls back to a single row with an implicit key when the raw input is a plain string.
 */
const ToolArgsRows = ({
  args,
  stepName,
}: {
  args: unknown
  stepName: string
}) => {
  const rows = useMemo<{ key: string; value: string }[]>(() => {
    if (args === undefined || args === null) return []
    if (typeof args === "string") {
      const implicitKey =
        stepName === "web_search" || stepName === "memory_search"
          ? "query"
          : stepName === "navigate"
            ? "url"
            : stepName === "code_interpreter"
              ? "code"
              : "input"
      return args.trim() === "" ? [] : [{ key: implicitKey, value: args }]
    }
    if (typeof args === "object") {
      return Object.entries(args as Record<string, unknown>)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => ({
          key: k,
          value: typeof v === "string" ? v : JSON.stringify(v),
        }))
    }
    return []
  }, [args, stepName])

  if (rows.length === 0) return null

  return (
    <div className='w-full flex flex-col gap-1 font-mono text-xs'>
      {rows.map((row) => (
        <div key={row.key} className='flex flex-row items-start gap-3 overflow-hidden'>
          <span className='text-wiki-link shrink-0 min-w-20'>{row.key}</span>
          <span className='truncate min-w-0 text-card-foreground' title={row.value}>{row.value}</span>
        </div>
      ))}
    </div>
  )
}


/**
 * Renders one tool step row with optional details and widget attachments.
 */
export const ToolStepRow = ({
  step,
  isStreaming,
  attachment,
}: {
  step: ToolCallStep
  isStreaming?: boolean
  attachment?: ToolStepWidgetAttachment
}) => {
  const { chatId } = useChat()
  const { rootId } = useSearch({
    from: BoardUrl,
    select: (s: { root_id?: string }) => ({ rootId: s.root_id }),
    shouldThrow: false,
  }) ?? {}
  const [viewMore, setViewMore] = useState(false)

  const { reasoning, message, title, input } = extractStepDescription(step)
  const codeInterpreterOutput = (
    step.name === "code_interpreter" &&
    typeof step.output !== "string"
  )
    ? step.output as CodeInterpreterOutput
    : null
  const noteToolOutput = (
    (step.name === "write_note" || step.name === "create_note" || step.name === "edit_note") &&
    typeof step.output !== "string"
  )
    ? step.output as WriteNoteOutput | CreateNoteOutput | EditNoteOutput
    : null

  const sources = useMemo(() => {
    if (!viewMore || isStreaming) return []
    return getWebSearchUrls(step)
  }, [viewMore, isStreaming, step])

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    toast("Copied to clipboard")
  }

  const isLoading = isStreaming && step.state === "started"
  const spanMessageClass = "text-sm text-card-foreground whitespace-pre-line"
  const StepIcon = ToolNameIcon[step.name]
  const successDivClass = cn(
    "absolute rounded-full bg-primary z-20 flex items-center justify-center top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2",
    "w-4 h-4 bg-transparent text-muted-foreground"
  )
  const iconClass = "size-4"
  const rawArgs = step.arguments?.input
  const hasArgs = rawArgs !== undefined && rawArgs !== null && rawArgs !== ""
  const canExpand = !isStreaming && (
    reasoning !== "" ||
    hasArgs ||
    !!input ||
    !!codeInterpreterOutput ||
    !!noteToolOutput ||
    sources.length > 0
  )

  let inlineDetail: ReactNode = null

  if (canExpand && viewMore && reasoning !== "") {
    inlineDetail = <ReasoningMessage reasoning={reasoning} />
  }

  return (
    <div className='w-full flex flex-col'>
      <div className='w-full p-2'>
        <div className='rounded-lg border border-sidebar-border overflow-hidden flex flex-col'>
          <div className='bg-muted px-3 py-2 flex flex-row items-start gap-3'>
            <div className='relative flex-shrink-0 w-6 h-6'>
              {isLoading && (
                <div className='absolute animate-ping w-3 h-3 rounded-full bg-accent-foreground/75 z-20 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2' />
              )}
              {!isLoading && (
                <div className={successDivClass}>
                  <StepIcon className={iconClass} strokeWidth={2} />
                </div>
              )}
              {isLoading && (
                <div className='absolute w-2 h-2 rounded-full bg-accent-foreground z-20 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2' />
              )}
            </div>
            <div className='flex-1 min-w-0 flex flex-col gap-1'>
              <h4 className='text-sm font-medium text-foreground font-mono leading-6'>{title}</h4>
              {message !== "" && (
                <span className={spanMessageClass}>
                  {message}
                </span>
              )}
              {canExpand && !viewMore && (
                <button
                  className='text-xs text-muted-foreground font-sans hover:underline self-start'
                  onClick={() => setViewMore(true)}
                >
                  Show details
                </button>
              )}
            </div>
          </div>
          {canExpand && viewMore && (
            <div className='bg-sidebar px-3 py-3 flex flex-col gap-2 w-full min-w-0'>
              {inlineDetail}
              {step.name !== "code_interpreter" && (
                <ToolArgsRows args={rawArgs} stepName={step.name} />
              )}
              {input && step.name === "code_interpreter" && (
                <button
                  className='w-full text-left rounded-md border border-sidebar-border bg-background/60 p-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words hover:bg-background/80 transition-colors'
                  onClick={() => void handleCopy(input)}
                  title='Copy code'
                >
                  {input}
                </button>
              )}
              {codeInterpreterOutput && (
                <CodeInterpreterResult output={codeInterpreterOutput} />
              )}
              {noteToolOutput && (
                <NoteToolResult output={noteToolOutput} chatId={chatId} rootId={rootId} />
              )}
              {sources.length > 0 && (
                <div className='w-full flex flex-row flex-wrap items-start gap-1 mt-2'>
                  {sources.map((source, index) => <MiniLinkCard key={index} annotation={source} />)}
                </div>
              )}
              <button
                className='text-xs text-muted-foreground font-sans hover:underline self-start'
                onClick={() => setViewMore(false)}
              >
                Show less
              </button>
            </div>
          )}
        </div>
      </div>
      <ToolStepWidgetView attachment={attachment} />
    </div>
  )
}
