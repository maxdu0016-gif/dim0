import { StubFrame } from "./stub-frame"


export type WidgetStubPanelProps = {
  nodeId: string
  onClose: () => void
}


/** Phase 5.1 stub for the widget editor surface. Phase 5.2 ports the HTML editor. */
export function WidgetStubPanel({ nodeId, onClose }: WidgetStubPanelProps) {
  return <StubFrame nodeId={nodeId} onClose={onClose} titleFallback="Widget" />
}
