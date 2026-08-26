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
- Networking, collaboration, and AI are intentionally absent from the input
  path in this milestone.

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
