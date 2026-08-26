# ADR-IOS-001: Native PencilKit iPad client

**Status:** Accepted  
**Applies to:** `ios-native/**`, `webui/src/features/board/harness/native-sync/**`

## Decision

The iPad client is a separate SwiftUI/UIKit application whose handwriting
surface is owned by PencilKit. It may share Dim0's board operation protocol,
sync service, file formats, and AI HTTP APIs, but it does not embed the React
canvas, React Native, Expo runtime, or a `WKWebView` as its primary workspace.

The Pencil input loop is always local: PencilKit renders first, local storage
commits second, and synchronization consumes completed local strokes only when
the user or paired desktop requests a snapshot. No network acknowledgement may
block a touch event or frame.

The first synchronization boundary is a foreground-only LAN WebSocket hosted
by the iPad. A six-digit code pairs the browser without requiring Google login.
The iPad sends a versioned full snapshot; the browser reconciles it into normal
Dim0 `ink` nodes using deterministic UUIDs. Existing local persistence, relay
sync, and AI context therefore consume the imported ink through their ordinary
board-store path rather than a second canvas implementation.

## Why

Apple Pencil latency is sensitive to JavaScript work, DOM reconciliation,
WebSocket scheduling, and serialization on the touch path. PencilKit provides
iPadOS prediction, coalescing, pressure, tilt, and native rendering without
duplicating that machinery. Keeping the native client separate also prevents
iPad-specific interaction changes from destabilizing the mature web product.

## Consequences

- The web and iPad clients use an explicit, runtime-validated snapshot contract.
- Web-only UI components are not reused on iPad; product behavior is reused at
  protocol and service boundaries.
- PencilKit drawing bytes are local persistence, not the final cross-platform
  synchronization format.
- The iPad app must stay foregrounded while a desktop is connected in this LAN
  milestone; cloud/offline outbox transport can replace the connection later.
- AI stays on the existing web board path. Handwriting OCR/semantic indexing is
  a separate milestone from transporting and persisting native ink geometry.

## Verify

```sh
cd ios-native
cd ios
xcodegen generate
xcodebuild -project Dim0Native.xcodeproj -scheme Dim0Native \
  -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
```
