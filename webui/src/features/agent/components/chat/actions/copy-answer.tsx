import { CheckIcon, CopyActionIcon } from "@/components/icons"
import { useState } from "react"
import { toast } from "sonner"


/**
 * Button component to copy the assistant's answer to the clipboard.
 */
export const CopyAnswer = ({ answer }: { answer: string }) => {
  const [copied, setCopied] = useState(false)
  const actionLabel = "Copy current answer to the clipboard"

  const handleCopy = () => {
    navigator.clipboard.writeText(answer).then(() => {
      setCopied(true)
      toast('Answer copied to clipboard!')
      setTimeout(() => setCopied(false), 2000) // Reset after 2 seconds
    })
  }

  const Icon = copied ? CheckIcon : CopyActionIcon

  return (
    <button
      className="transition-all text-xs text-muted-foreground hover:text-foreground flex flex-row items-center gap-2 p-1 rounded-md"
      onClick={handleCopy}
      aria-label={actionLabel}
      title={actionLabel}
    >
      <Icon className='size-4 shrink-0' strokeWidth={2} />
      <span>Copy</span>
    </button>
  )
}
