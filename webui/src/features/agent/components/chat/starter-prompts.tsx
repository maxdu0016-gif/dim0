import {
  AiLearningIcon,
  AiProgrammingIcon,
  ChartBubble02Icon,
  Note02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'


export type StarterPromptDefinition = {
  id: string
  label: string
  prompt: string
  icon: IconSvgElement
}


export const STARTER_PROMPTS: StarterPromptDefinition[] = [
  {
    id: 'learn',
    label: 'Learn',
    icon: AiLearningIcon,
    prompt: `Hi! Could you help me understand a complex topic from scratch? If you need more information from me, ask me 1-2 key questions right away, like what topic I want to learn and what level I’m at now. If you think I should give you more context to help you do a better job, let me know. Use any tools you have access to, like web search or documents already available in the workspace, if they’ll help. If it makes sense, create something we can look at together, like a visual, a checklist, a comparison table, or something interactive. Thanks for your help!`,
  },
  {
    id: 'code',
    label: 'Code',
    icon: AiProgrammingIcon,
    prompt: `Hi! Could you help me write a simple implementation of an algorithm in Python? If you need more information from me, ask me 1-2 key questions right away, like what the algorithm should do, what inputs and outputs I want, and any constraints or edge cases I care about. If you think I should give you more context to help you do a better job, let me know. Use any tools you have access to if they’ll help. If it makes sense, include a clean Python implementation, a short explanation of how it works, and a few example inputs and outputs. Thanks for your help!`,
  },
  {
    id: 'visualize',
    label: 'Visualize',
    icon: ChartBubble02Icon,
    prompt: `Hi! Could you help me create a visual explainer for a topic, idea, or process? If you need more information from me, ask me 1-2 key questions right away, like what I want to explain, who it’s for, and what kind of visual would be most useful. If you think I should give you more context to help you do a better job, let me know. Use any tools you have access to if they’ll help. If it makes sense, create something we can look at together, like a diagram, a flow, a concept map, a checklist, or something interactive. Thanks for your help!`,
  },
  {
    id: 'write-note',
    label: 'Write note',
    icon: Note02Icon,
    prompt: `Hi! Could you help me research a topic and turn what you find into a detailed sticky note? If you need more information from me, ask me 1-2 key questions right away, like what topic I want covered and what depth or angle I care about most. If you think I should give you more context to help you do a better job, let me know. Use any tools you have access to, like web search or documents already available in the workspace, if they’ll help. If it makes sense, organize the result into a clear, useful note with the most important points, supporting details, and a structure that’s easy to skim. Thanks for your help!`,
  },
]


type StarterPromptPillsProps = {
  disabled?: boolean
  onSelect: (prompt: string) => void
}


/**
 * Render starter prompt pills for first-time chat users.
 */
export function StarterPromptPills({
  disabled = false,
  onSelect,
}: StarterPromptPillsProps) {
  return (
    <div className='flex w-full max-w-[800px] flex-wrap items-center justify-center gap-2'>
      {STARTER_PROMPTS.map((starterPrompt) => (
        <button
          key={starterPrompt.id}
          type='button'
          onClick={() => onSelect(starterPrompt.prompt)}
          disabled={disabled}
          className='inline-flex items-center gap-2 rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm text-card-foreground/75 transition-colors hover:bg-sidebar disabled:cursor-not-allowed disabled:opacity-60'
        >
          <HugeiconsIcon icon={starterPrompt.icon} className='size-4 shrink-0 text-card-foreground/65' strokeWidth={1.8} />
          <span>{starterPrompt.label}</span>
        </button>
      ))}
    </div>
  )
}
