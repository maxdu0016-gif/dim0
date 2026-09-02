# ADR-IOS-001: Hybrid PencilKit iPad client

**Status:** Accepted
**Applies to:** `ios-native/**`, `webui/src/features/ios/**`, board ink integration

## Decision

The iPad client is a SwiftUI/UIKit shell that hosts the complete Dim0 web
application in a persistent `WKWebView`. A transparent, Pencil-only
`PKCanvasView` is positioned over the active board while the ink tool is
selected. The web workspace remains the source of truth for nodes, persistence,
history, collaboration, AI, files, and mini-apps.

The Pencil input loop is always local: PencilKit renders immediately and no
JavaScript or network acknowledgement blocks a touch event or frame. After the
gesture completes, the shell sends sampled points and pressure for each stroke
to the trusted main-frame bridge. The web adapter converts screen coordinates
through the current camera and commits an ordinary `ink` node to `CanvasStore`.

The bridge acknowledges a native stroke only after the store accepts its
deterministic node id. Retries are idempotent. The normal local persistence and
v2 collaboration paths then store and relay the node; PencilKit's `PKDrawing`
is only a transient rendering buffer, not a second document format.

## Why

Apple Pencil latency is sensitive to JavaScript work, DOM reconciliation, and
serialization on the touch path. PencilKit provides iPadOS prediction,
coalescing, pressure, tilt, and native rendering without duplicating that
machinery. Hosting the existing web product avoids rebuilding rich notes,
mini-apps, authentication, collaboration, and the agent in Swift while the
native overlay supplies app-specific Pencil behavior that the PWA cannot.

## Consequences

- The complete Dim0 UI and data model remain shared with browser and desktop.
- The native message handler accepts configuration only from the configured
  Dim0 app origin and the main frame.
- Completed native strokes become ordinary canvas-harness ink nodes; no native
  snapshot reconciliation or parallel sync protocol is required.
- Finger pan and pinch zoom stay on the web canvas. PencilKit owns only Pencil
  input, and `UIPencilInteraction` forwards double-tap tool switching.
- A network outage can still affect remotely hosted UI resources. A future
  milestone may bundle the web app or add a verified offline update package.
- Handwriting OCR and semantic indexing remain separate from ink transport.
- App Store review must be supported by the native Pencil, file, sharing, and
  recovery behavior rather than presenting the shell as a repackaged website.

## Verify

```sh
cd ios-native/ios
xcodegen generate
xcodebuild build-for-testing \
  -project Dim0Native.xcodeproj \
  -scheme Dim0Native \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath .derived-data \
  CODE_SIGNING_ALLOWED=NO
```
