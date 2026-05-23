import { StubFrame } from "./stub-frame"


export type SheetStubPanelProps = {
  nodeId: string
  onClose: () => void
}


/** Phase 5.1 stub for the sheet editor surface. Phase 5.2 ports TipTap. */
export function SheetStubPanel({ nodeId, onClose }: SheetStubPanelProps) {
  return <StubFrame nodeId={nodeId} onClose={onClose} titleFallback="Untitled" />
}
