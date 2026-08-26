# ADR-IOS-001: Native PencilKit iPad client

**Status:** Accepted  
**Applies to:** `ios-native/**`

## Decision

The iPad client is a separate SwiftUI/UIKit application whose handwriting
surface is owned by PencilKit. It may share Dim0's board operation protocol,
sync service, file formats, and AI HTTP APIs, but it does not embed the React
canvas, React Native, Expo runtime, or a `WKWebView` as its primary workspace.

The Pencil input loop is always local: PencilKit renders first, local storage
commits second, and future synchronization consumes completed local operations
asynchronously. No network acknowledgement may block a touch event or frame.

## Why

Apple Pencil latency is sensitive to JavaScript work, DOM reconciliation,
WebSocket scheduling, and serialization on the touch path. PencilKit provides
iPadOS prediction, coalescing, pressure, tilt, and native rendering without
duplicating that machinery. Keeping the native client separate also prevents
iPad-specific interaction changes from destabilizing the mature web product.

## Consequences

- The web and iPad clients need an explicit versioned operation contract.
- Web-only UI components are not reused on iPad; product behavior is reused at
  protocol and service boundaries.
- PencilKit drawing bytes are local persistence, not the final cross-platform
  synchronization format.
- Sync and AI must be added behind interfaces after local writing is verified.

## Verify

```sh
cd ios-native
xcodegen generate
xcodebuild -project Dim0Native.xcodeproj -scheme Dim0Native \
  -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
```
