# Dim0 for iPad

The iPad target now hosts the complete Dim0 application in a persistent native
`WKWebView`. It is the same product as the browser and desktop clients: AI chat,
notes, files, mini-apps, local boards, synced boards, presentation mode, and all
canvas node types remain available instead of being rebuilt as a reduced native
client.

Apple Pencil input is rendered immediately by a transparent native `PKCanvasView`
over the active board. When PencilKit reports tool use has ended, the shell sends
only that completed stroke's sampled points and pressure to the web app. The web
adapter converts those screen coordinates through the current canvas camera,
creates one formal ink node in `CanvasStore`, and acknowledges the native stroke
only after the node is accepted. Persistence, undo, and WebSocket v2 collaboration
therefore use the same path as ordinary web-created ink; a full `PKDrawing` archive
is never the board data source. A normally empty native outbox retains completed,
unacknowledged strokes across app restarts. Finger pan/zoom remains on the web
canvas, and the native double-tap bridge switches between the shared pen and
eraser tools.

## Application URL

Release builds load the dedicated iPad frontend at
`https://dim0-ipad-pencil.pages.dev` by default. Change `Dim0AppURL` in
`ios/Info.plist` to point the shell at another hosted/self-hosted Dim0 frontend.
For an Xcode development run, the `DIM0_APP_URL` scheme environment variable
overrides the plist value, for example `http://192.168.1.20:5175`.

The shell keeps a persistent WebKit data store, so authentication, IndexedDB
local boards, preferences, and cached web assets survive app restarts. Native
file input and download/share handling keep document upload and export usable on
iPad.

## Generate and run the Xcode project

```sh
brew install xcodegen
cd ios-native
cd ios
xcodegen generate
open Dim0Native.xcodeproj
```

`ios/project.yml` is the source of truth. The generated `.xcodeproj` is ignored
and is recreated locally, by EAS, and by GitHub Actions before every build.

The bundle identifier is `com.dim0.canvas` so the existing Apple Developer
device registration and provisioning profile can be reused.
