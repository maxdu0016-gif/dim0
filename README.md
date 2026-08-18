# Dim0 iPad Pencil

An iPad-optimized version of [Dim0](https://github.com/vcmf/dim0), focused on improving Apple Pencil handwriting in Safari and Progressive Web Apps.

## Features

- Pressure-sensitive Apple Pencil strokes
- High-frequency Pointer Events sampling
- Support for coalesced and raw pointer events
- Interpolation between sparse input samples
- Smooth quadratic Bezier stroke rendering
- Adjustable pen color and width
- Whole-stroke eraser
- Undo and redo
- Basic palm-rejection behavior
- Finger panning and two-finger zooming
- Local persistence and backend synchronization

## Current Limitations

- Safari and PWAs do not expose the Apple Pencil double-tap gesture or Apple Pencil Pro squeeze gesture to web applications.
- Switching to the eraser with Apple Pencil double-tap requires a native iPad application using `UIPencilInteraction`.
- The current eraser removes complete strokes instead of partially erasing them.
- Tilt-based brushes, highlighters, lasso selection, and handwriting recognition are not yet implemented.

## Running Locally

Node.js and npm are required.

```powershell
cd webui
npm install
npm run dev -- --host 0.0.0.0 --port 4322
```

Open the application on the development computer:

```text
http://localhost:4322
```

## Testing on iPad

1. Connect the iPad and development computer to the same local network.
2. Find the computer's local IPv4 address in Windows PowerShell:

   ```powershell
   Get-NetIPConfiguration |
     Where-Object IPv4Address |
     Select-Object InterfaceAlias, IPv4Address
   ```

3. Open the following address in Safari on the iPad:

   ```text
   http://YOUR_COMPUTER_IP:4322
   ```

4. If Windows Firewall displays a prompt, allow access on private networks.
5. Optionally select **Share -> Add to Home Screen** in Safari to test it as a PWA.

## iPad Test Checklist

- Write quickly and check whether visible gaps appear between samples.
- Rest your palm on the screen and verify that fields are not accidentally selected.
- Confirm that Apple Pencil pressure changes the stroke width.
- Pan with one finger and zoom with two fingers.
- Test the pen, eraser, undo, and redo tools.
- Refresh the page and verify that saved strokes are restored.

## Source Structure

| Purpose | File or directory |
| --- | --- |
| Apple Pencil input and palm rejection | `webui/src/features/board/harness/ink/ink-input-layer.tsx` |
| Stroke interpolation and smoothing | `webui/src/features/board/harness/ink/ink-geometry.ts` |
| Handwriting state and actions | `webui/src/features/board/harness/ink/` |
| Custom canvas node types | `webui/src/features/board/harness/node-types/` |
| Canvas persistence | `webui/src/features/board/harness/persist/` |
| Canvas synchronization | `webui/src/features/board/harness/sync/` |
| Canvas state management | `webui/src/features/board/harness/store/` |

## Validation

Run the following commands from the `webui` directory:

```powershell
npm run check-all
npm run test:run -- src/features/board/harness/ink/ink-geometry.test.ts src/features/board/harness/canvas/custom-node-types.test.ts
npm run build
```

## Apple Pencil Double-Tap

Apple Pencil double-tap cannot currently be detected reliably by a standard website or installed PWA. Native support requires an iPadOS application using UIKit and `UIPencilInteraction`.

A native wrapper could forward the gesture to the web canvas and switch between the pen and eraser tools.

## Upstream Project

This project is based on [vcmf/dim0](https://github.com/vcmf/dim0).

Please refer to the upstream repository and individual dependencies for their respective license terms.
