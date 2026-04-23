import { useEffect, useMemo, useState } from "react"
import { useAppStore } from "@/store"
import { CheckIcon, ChevronDownIcon } from "@/components/icons"
import { ThinkingDots } from "@/components/animations/thinking-indicator"
import { Popover, PopoverAnchor, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useChat } from "@/features/agent/hooks/chat-context"
import { useListMessages } from "@/features/agent/api/list-messages"
import { isReasoningTextStep, isToolCallStep, ToolNameIcon } from "@/features/agent/types/stream"
import type { ToolCallStep } from "@/features/agent/types/stream"
import { getToolTitle } from "@/features/agent/utils/stream/build"
import { StepsPopoverContent } from "./steps-popover-content"


/**
 * Adaptive progress strip under the island input. While streaming it shows
 * the active tool, a live reasoning preview, or a "Thinking" fallback. Once
 * the turn ends with at least one tool call, it collapses into a persistent
 * summary ("✓ N steps · names…") with a trailing Steps button that opens the
 * full tool trace in a popover. Scoped to the current chatId so cache bleed
 * from other chats is discarded on switch.
 */
export const ProgressLine = () => {
  const { chatId } = useChat()
  const userId = useAppStore((s) => s.userId)
  const { data: messages } = useListMessages({
    chatId: chatId ?? "",
    userId,
  })

  const latestAssistantMessage = useMemo(() => {
    if (!messages?.length || !chatId) return null
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i]
      if (m.chatUid !== chatId) continue
      if (m.role === "assistant") return m
    }
    return null
  }, [messages, chatId])

  const isThisChatStreaming = latestAssistantMessage?.streaming === true

  const currentReasoning = useMemo(
    () => latestAssistantMessage?.properties?.reasoning?.reasoning ?? [],
    [latestAssistantMessage]
  )

  const activeTool = useMemo<ToolCallStep | null>(() => {
    if (!isThisChatStreaming) return null
    for (let i = currentReasoning.length - 1; i >= 0; i -= 1) {
      const step = currentReasoning[i]
      if (isToolCallStep(step) && step.state === "started") return step
    }
    return null
  }, [isThisChatStreaming, currentReasoning])

  const latestReasoningLine = useMemo<string>(() => {
    for (let i = currentReasoning.length - 1; i >= 0; i -= 1) {
      const step = currentReasoning[i]
      if (!isReasoningTextStep(step)) continue
      const message = step.message?.trim()
      if (!message) continue
      const lines = message.split("\n").map((line) => line.trim()).filter((line) => line !== "")
      const last = lines[lines.length - 1] ?? ""
      return last.replace(/[*_`#~>]+/g, "").trim()
    }
    return ""
  }, [currentReasoning])

  const toolSteps = useMemo<ToolCallStep[]>(
    () => currentReasoning.filter(isToolCallStep) as ToolCallStep[],
    [currentReasoning]
  )

  const summaryText = useMemo(
    () => toolSteps.map((s) => getToolTitle(s.name)).join(", "),
    [toolSteps]
  )

  const [popoverOpen, setPopoverOpen] = useState(false)

  useEffect(() => {
    setPopoverOpen(false)
  }, [chatId])

  useEffect(() => {
    if (isThisChatStreaming) setPopoverOpen(false)
  }, [isThisChatStreaming])

  if (isThisChatStreaming && activeTool) {
    const Icon = ToolNameIcon[activeTool.name]
    return (
      <div className='flex items-center gap-2 px-4 py-2 border-b border-sidebar-border/60 bg-muted/60'>
        <Icon className='size-3.5 text-wiki-link shrink-0' strokeWidth={2} />
        <span className='truncate font-mono text-xs text-muted-foreground'>
          {getToolTitle(activeTool.name)}
        </span>
      </div>
    )
  }

  if (isThisChatStreaming && latestReasoningLine) {
    return (
      <div className='flex items-center gap-2 px-4 py-2 border-b border-sidebar-border/60 bg-muted/60 overflow-hidden'>
        <span className='shrink-0 font-mono text-xs text-muted-foreground select-none'>…</span>
        <span
          className='flex-1 min-w-0 truncate font-mono text-xs text-muted-foreground'
          title={latestReasoningLine}
        >
          {latestReasoningLine}
        </span>
      </div>
    )
  }

  if (isThisChatStreaming) {
    return (
      <div className='flex items-center gap-2 px-4 py-2 border-b border-sidebar-border/60 bg-muted/60'>
        <span className='inline-flex items-center gap-1 font-mono text-xs font-medium text-muted-foreground'>
          Thinking
          <ThinkingDots />
        </span>
      </div>
    )
  }

  if (toolSteps.length > 0) {
    return (
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverAnchor asChild>
          <div className='flex items-center gap-2 px-4 py-2 border-b border-sidebar-border/60 bg-muted/60'>
            <CheckIcon className='size-3.5 text-secondary-foreground shrink-0' strokeWidth={2} />
            <span className='flex-1 min-w-0 truncate font-mono text-xs text-muted-foreground'>
              <span className='text-foreground font-medium'>{toolSteps.length} steps</span>
              {summaryText ? ` · ${summaryText}` : null}
            </span>
            <PopoverTrigger asChild>
              <button
                type='button'
                className={cn(
                  "shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded",
                  "text-xs font-mono transition-colors",
                  "hover:bg-secondary-foreground/10",
                  popoverOpen ? "text-foreground" : "text-muted-foreground"
                )}
                aria-expanded={popoverOpen}
                aria-label={popoverOpen ? "Hide steps" : "Show steps"}
              >
                Steps
                <ChevronDownIcon
                  className={cn("size-3 transition-transform", popoverOpen && "rotate-180")}
                  strokeWidth={2}
                />
              </button>
            </PopoverTrigger>
          </div>
        </PopoverAnchor>
        <StepsPopoverContent toolSteps={toolSteps} />
      </Popover>
    )
  }

  return null
}
