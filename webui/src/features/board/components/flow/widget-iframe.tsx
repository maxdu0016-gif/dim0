import { memo, useEffect, useId, useMemo, useRef, useState } from "react"
import { useTheme } from "@/components/theme-provider"
import { buildWidgetDocument } from "./widget-document"


type WidgetIframeProps = {
  html: string
  className?: string
  title?: string
  autoHeight?: boolean
  maxHeight?: number
  minHeight?: number
}

/**
 * Render widget HTML in a sandboxed iframe using srcDoc.
 */
export const WidgetIframe = memo(function WidgetIframe({
  html,
  className,
  title = "Widget preview",
  autoHeight = false,
  maxHeight = 800,
  minHeight = 260,
}: WidgetIframeProps) {
  const { resolvedTheme } = useTheme()
  const frameId = useId()
  const [height, setHeight] = useState(minHeight)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    if (!autoHeight || typeof window === "undefined") {
      return
    }

    const handleMessage = (event: MessageEvent) => {
      const data = event.data
      if (
        !data ||
        typeof data !== "object" ||
        data.source !== "topix-widget-height" ||
        data.frameId !== frameId
      ) {
        return
      }

      const nextHeight = Number(data.height)
      if (!Number.isFinite(nextHeight) || nextHeight <= 0) {
        return
      }

      setHeight(Math.max(minHeight, Math.min(maxHeight, Math.ceil(nextHeight))))
    }

    window.addEventListener("message", handleMessage)

    return () => {
      window.removeEventListener("message", handleMessage)
    }
  }, [autoHeight, frameId, maxHeight, minHeight])

  useEffect(() => {
    setHeight(minHeight)
  }, [html, minHeight, resolvedTheme])

  const srcDoc = useMemo(
    () => buildWidgetDocument(
      html,
      title,
      autoHeight ? { autoHeightFrameId: frameId } : undefined
    ),
    [autoHeight, frameId, html, title]
  )

  // Serve the HTML through a Blob URL rather than srcDoc. Chromium's
  // srcDoc navigation can silently fail to render content when the
  // iframe lives inside a CSS-`transform`-ed ancestor (canvas-harness
  // applies a camera transform on the overlay div). Blob URLs are
  // regular navigable URLs, so the iframe loads them reliably in any
  // layout context. Cleanup revokes the previous URL on srcDoc change.
  const srcUrl = useMemo(
    () => URL.createObjectURL(new Blob([srcDoc], { type: "text/html;charset=utf-8" })),
    [srcDoc],
  )
  useEffect(() => () => URL.revokeObjectURL(srcUrl), [srcUrl])

  return (
    <iframe
      key={resolvedTheme}
      ref={iframeRef}
      title={title}
      src={srcUrl}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className={className}
      style={autoHeight ? { height: `${height}px` } : undefined}
    />
  )
})
