import { createContext, useContext, type ReactNode, type RefObject } from "react"


/**
 * Share the canvas-harness wrap div ref with chrome that needs to
 * compute screen ↔ world (e.g. the image-search dialog placing a new
 * image at the current viewport center). Mounted once by HarnessCanvas
 * so descendants don't have to prop-drill.
 */
type WrapRef = RefObject<HTMLElement | null>


const Ctx = createContext<WrapRef | null>(null)


export const HarnessWrapRefProvider = ({
  value,
  children,
}: {
  value: WrapRef
  children: ReactNode
}) => <Ctx.Provider value={value}>{children}</Ctx.Provider>


/**
 * Read the canvas wrap ref. Returns `null` when called outside the
 * HarnessCanvas tree — callers should guard against that.
 */
export const useHarnessWrapRef = (): WrapRef | null => useContext(Ctx)
