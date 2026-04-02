import { memo } from "react"
import { useTheme } from "@/components/theme-provider"
import { buildWidgetDocument } from "./widget-document"


type WidgetIframeProps = {
  html: string
  className?: string
  title?: string
}

/**
 * Render widget HTML in a sandboxed iframe using srcDoc.
 */
export const WidgetIframe = memo(function WidgetIframe({
  html,
  className,
  title = "Widget preview",
}: WidgetIframeProps) {
  const { resolvedTheme } = useTheme()

  return (
    <iframe
      key={resolvedTheme}
      title={title}
      srcDoc={buildWidgetDocument(html, title)}
      sandbox="allow-scripts"
      loading="lazy"
      referrerPolicy="no-referrer"
      className={className}
    />
  )
})
