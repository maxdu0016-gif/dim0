/**
 * Desktop-only: reflect the window's macOS fullscreen state as a
 * `tauri-fullscreen` class on `<html>`.
 *
 * The overlay title bar reserves the top-left corner for the traffic lights
 * (sidebar top padding + collapsed-header left padding). In native fullscreen
 * the traffic lights are hidden, so that reserved space is just dead margin —
 * the layout drops it when this class is present.
 */

/**
 * Track fullscreen state and keep the `tauri-fullscreen` class in sync. Safe to
 * call only on the Tauri build (dynamically imports the window API so it never
 * lands in the web bundle). Runs for the app's lifetime; no teardown needed.
 */
export async function initFullscreenClass(): Promise<void> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window")
  const win = getCurrentWindow()

  let checking = false
  const apply = async (): Promise<void> => {
    if (checking) return // collapse the burst of resize events into one IPC check
    checking = true
    try {
      const fullscreen = await win.isFullscreen()
      document.documentElement.classList.toggle("tauri-fullscreen", fullscreen)
    } catch {
      // window gone / IPC unavailable — leave the class as-is
    } finally {
      checking = false
    }
  }

  await apply()
  // Entering/leaving macOS fullscreen resizes the window, so resize is the signal.
  await win.onResized(() => {
    void apply()
  })
}
