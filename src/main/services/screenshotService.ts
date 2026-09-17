import { BrowserWindow, desktopCapturer, systemPreferences } from 'electron'

export interface ScreenshotResult {
  success: boolean
  imageData?: string // base64 data URL
  error?: string
}

/**
 * Capture a screenshot of another app window (or the screen as fallback)
 * for vision analysis. Never captures our own overlay.
 */
export class ScreenshotService {
  constructor(_appWindow?: BrowserWindow) {
    // Window reference not stored — titles are read live from BrowserWindow.getAllWindows()
    // so custom brand names stay excluded after rename.
  }

  private ownWindowTitles(): string[] {
    const titles = new Set<string>()
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      const title = (win.getTitle() || '').trim()
      if (title) titles.add(title)
    }
    // Defaults even if title was customized via branding
    titles.add('Kalfi')
    return Array.from(titles)
  }

  /** Only exclude OUR windows — never filter by generic words like "interview". */
  private isOwnWindow(sourceName: string): boolean {
    const name = sourceName.trim()
    const lower = name.toLowerCase()

    if (lower.includes('devtools') || lower.includes('dev tools')) return true

    for (const title of this.ownWindowTitles()) {
      const t = title.toLowerCase()
      if (!t) continue
      if (lower === t) return true
      // Electron often shows "Title — live session" / "Title - live session"
      if (lower.startsWith(t + ' —') || lower.startsWith(t + ' -') || lower.startsWith(t + ' |')) {
        return true
      }
    }
    return false
  }

  private async ensureScreenPermission(): Promise<string | null> {
    if (process.platform !== 'darwin') return null
    try {
      const status = systemPreferences.getMediaAccessStatus('screen')
      if (status === 'granted') return null
      if (status === 'denied' || status === 'restricted') {
        return 'Screen Recording permission is off. Open System Settings → Privacy & Security → Screen Recording, enable Kalfi, then quit and reopen the app.'
      }
      // not-determined: macOS will prompt on the next capture attempt
      return null
    } catch {
      return null
    }
  }

  /**
   * Captures the best available window (prefer browser), excluding Kalfi.
   * Falls back to the full screen if no other windows are listed.
   */
  async captureActiveWindow(): Promise<ScreenshotResult> {
    try {
      const permissionError = await this.ensureScreenPermission()

      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 1920, height: 1080 },
        fetchWindowIcons: false
      })

      console.log(
        'Available windows:',
        sources.map((s) => s.name)
      )

      const filteredSources = sources.filter((source) => !this.isOwnWindow(source.name))

      if (filteredSources.length > 0) {
        const browserKeywords = [
          'chrome',
          'chromium',
          'edge',
          'firefox',
          'safari',
          'opera',
          'brave',
          'arc',
          'vivaldi'
        ]
        const browserSource = filteredSources.find((source) => {
          const nameLower = source.name.toLowerCase()
          return browserKeywords.some((keyword) => nameLower.includes(keyword))
        })

        const activeSource = browserSource || filteredSources[0]
        console.log('Capturing window:', activeSource.name)

        if (!activeSource.thumbnail || activeSource.thumbnail.isEmpty()) {
          return {
            success: false,
            error: 'Failed to capture window thumbnail'
          }
        }

        return {
          success: true,
          imageData: activeSource.thumbnail.toDataURL()
        }
      }

      // Fallback: capture the primary screen (common when permission lists no windows,
      // or only Kalfi is open / visible to the capturer).
      const screens = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 },
        fetchWindowIcons: false
      })

      const screen = screens[0]
      if (screen?.thumbnail && !screen.thumbnail.isEmpty()) {
        console.log('No other windows listed — falling back to screen capture:', screen.name)
        return {
          success: true,
          imageData: screen.thumbnail.toDataURL()
        }
      }

      if (permissionError) {
        return { success: false, error: permissionError }
      }

      return {
        success: false,
        error:
          'No other windows available to capture. Open the page you want analyzed (browser, IDE, etc.), grant Screen Recording to Kalfi if prompted, then try again.'
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      console.error('Screenshot capture error:', errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * Captures a specific window by name
   */
  async captureWindowByName(windowName: string): Promise<ScreenshotResult> {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 1920, height: 1080 },
        fetchWindowIcons: false
      })

      const matchingSource = sources.find((source) =>
        source.name.toLowerCase().includes(windowName.toLowerCase())
      )

      if (!matchingSource || !matchingSource.thumbnail || matchingSource.thumbnail.isEmpty()) {
        return {
          success: false,
          error: `Window "${windowName}" not found`
        }
      }

      return {
        success: true,
        imageData: matchingSource.thumbnail.toDataURL()
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      console.error('Screenshot capture error:', errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  }
}
