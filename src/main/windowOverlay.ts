import { BrowserWindow } from 'electron'

/** Highest useful always-on-top level for floating over fullscreen apps. */
export const OVERLAY_WINDOW_LEVEL = 'screen-saver' as const

/**
 * Make the window float above fullscreen Spaces (Chrome Meet, Zoom, etc.)
 * without macOS splitting the display into two Spaces.
 */
export function applyOverlayWindowBehavior(
  win: BrowserWindow,
  alwaysOnTop = true
): void {
  win.setFullScreenable(false)

  if (alwaysOnTop) {
    win.setAlwaysOnTop(true, OVERLAY_WINDOW_LEVEL, 1)
  } else {
    win.setAlwaysOnTop(false)
  }

  // critical on macOS: stay visible on the active fullscreen Space
  win.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    // keep our existing dock-hidden agent behavior; don't flip process type again
    skipTransformProcessType: true
  })
}
