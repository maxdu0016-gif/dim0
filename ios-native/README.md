# Dim0 Native for iPad

This directory is the clean-room native iPad client. The application target is
SwiftUI + UIKit + PencilKit only: it does not embed the web app, React Native,
Expo runtime, or a `WKWebView` canvas.

## Current milestone

- PencilKit owns the complete Apple Pencil input and rendering path.
- Finger gestures pan and zoom; finger touches do not create ink.
- Pen, highlighter, vector eraser, color selection, undo, and redo.
- Apple Pencil double-tap toggles the eraser.
- Drawing data is stored atomically on the iPad after the user pauses.
- Foreground LAN pairing exposes completed strokes to the desktop as a
  versioned, idempotent full snapshot.
- Networking and AI remain absent from the Pencil input path: no touch or frame
  waits for serialization, a socket, or a server response.

## Pair with the desktop canvas

1. Keep the iPad app open and put the iPad and computer on the same Wi-Fi.
2. Open the sync panel in the iPad toolbar and note its address and pairing code.
3. Open **iPad** in the desktop canvas's top-right toolbar and enter both values.
4. Press **立即同步** on either device after writing. The desktop reconciles the
   complete iPad drawing into ordinary persisted Dim0 ink nodes.

## Generate and run the Xcode project

```sh
brew install xcodegen
cd ios-native
cd ios
xcodegen generate
open Dim0Native.xcodeproj
```

The bundle identifier is `com.dim0.canvas` so the existing Apple Developer
device registration and provisioning profile can be reused.
