import { StubFrame } from "./stub-frame"


export type CodeSandboxStubPanelProps = {
  nodeId: string
  onClose: () => void
}


/**
 * Phase 5.1 stub for the code-sandbox editor surface. Phase 5.2 ports
 * the monaco editor + run controls.
 */
export function CodeSandboxStubPanel({ nodeId, onClose }: CodeSandboxStubPanelProps) {
  return <StubFrame nodeId={nodeId} onClose={onClose} titleFallback="Code sandbox" />
}
