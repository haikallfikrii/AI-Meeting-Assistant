import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { Menu, app, BrowserWindow, nativeImage, screen, session, shell } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import {
  cleanupIpcHandlers,
  initializeIpcHandlers,
  reapplyDockPreference,
  registerShotShortcut
} from './ipc/handlers'
import { applyDockVisibility } from './services/branding'
import { applyOverlayWindowBehavior } from './windowOverlay'

let mainWindow: BrowserWindow | null = null

/**
 * Payment / sales screen-recording demo:
 *   KALFI_DEMO_RECORD=1 npm run dev
 * Disables content-protection so the overlay is visible in QuickTime / Zoom recordings.
 */
function isDemoRecordMode(): boolean {
  const v = (process.env.KALFI_DEMO_RECORD || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

/** Electron menu roles use ~0.5 zoom-level steps */
const ZOOM_STEP = 0.5
const ZOOM_MIN = -3
const ZOOM_MAX = 5

function adjustZoom(delta: number): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const current = mainWindow.webContents.getZoomLevel()
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current + delta))
  mainWindow.webContents.setZoomLevel(next)
}

function resetZoom(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.setZoomLevel(0)
}

/**
 * Explicit zoom shortcuts. Needed because electron-toolkit's
 * watchWindowShortcuts({ zoom: false }) preventDefault's Cmd+- and
 * Chromium alone won't zoom out on macOS.
 */
function installZoomShortcuts(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const mod = process.platform === 'darwin' ? input.meta : input.control
    if (!mod || input.alt) return

    const key = input.key
    const code = input.code

    // Shot: Cmd/Ctrl + Shift + S (also registered globally)
    if (input.shift && (key === 's' || key === 'S' || code === 'KeyS')) {
      event.preventDefault()
      win.webContents.send('trigger-shot')
      return
    }

    // Zoom in: Cmd/Ctrl + = / + / NumpadAdd
    if (key === '=' || key === '+' || code === 'Equal' || code === 'NumpadAdd') {
      event.preventDefault()
      adjustZoom(ZOOM_STEP)
      return
    }

    // Zoom out: Cmd/Ctrl + - / _ / NumpadSubtract
    if (key === '-' || key === '_' || code === 'Minus' || code === 'NumpadSubtract') {
      event.preventDefault()
      adjustZoom(-ZOOM_STEP)
      return
    }

    // Reset: Cmd/Ctrl + 0
    if (key === '0' || code === 'Digit0' || code === 'Numpad0') {
      event.preventDefault()
      resetZoom()
    }
  })
}

function setupAppMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'toggleDevTools' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  const appIcon = nativeImage.createFromPath(icon)
  const demoRecord = isDemoRecordMode()
  if (demoRecord) {
    console.log('[kalfi] DEMO RECORD mode — overlay visible in screen recordings')
  }

  // Calculate dynamic initial height based on laptop screen work area (approx 75% height)
  const primaryDisplay = screen.getPrimaryDisplay()
  const { height: workAreaHeight } = primaryDisplay.workAreaSize
  const initialHeight = Math.max(550, Math.min(700, Math.floor(workAreaHeight * 0.95)))

  // Create the browser window with screen share protection (off in demo-record mode)
  mainWindow = new BrowserWindow({
    width: 620,
    height: initialHeight,
    minWidth: 380,
    minHeight: 500,
    show: false,
    title: demoRecord ? 'Kalfi (Demo Record)' : 'Kalfi',
    autoHideMenuBar: true,
    frame: false, // Frameless for custom title bar
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: !demoRecord,
    resizable: true,
    fullscreenable: false,
    minimizable: true,
    maximizable: false,
    // macOS: NSPanel-style window can float over other apps' fullscreen Spaces
    // Demo-record uses a normal window so capture tools can see it reliably
    ...(process.platform === 'darwin'
      ? demoRecord
        ? { acceptFirstMouse: true }
        : {
            type: 'panel' as const,
            hiddenInMissionControl: true,
            acceptFirstMouse: true
          }
      : {}),
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Hide from screen capture / Meet "entire screen" when possible
  // Demo-record: keep visible for payment-gateway / sales recordings
  mainWindow.setContentProtection(!demoRecord)

  // Float over fullscreen Meet/Chrome without splitting the Space
  applyOverlayWindowBehavior(mainWindow, true)

  installZoomShortcuts(mainWindow)

  mainWindow.on('ready-to-show', () => {
    if (process.platform === 'win32' && !appIcon.isEmpty()) {
      mainWindow?.setIcon(appIcon)
    }
    if (demoRecord) {
      mainWindow?.show()
      mainWindow?.focus()
    } else {
      // showInactive: don't steal focus from the fullscreen Meet window
      mainWindow?.showInactive()
    }
    // Showing a panel window can briefly reveal the Dock — re-apply preference
    if (!demoRecord) {
      reapplyDockPreference()
      ;[50, 200, 500, 1200].forEach((ms) => {
        setTimeout(() => reapplyDockPreference(), ms)
      })
    }
  })

  // Re-apply overlay flags if macOS resets them after Space / display changes
  mainWindow.on('show', () => {
    if (mainWindow) applyOverlayWindowBehavior(mainWindow, true)
    if (!demoRecord) reapplyDockPreference()
  })

  mainWindow.webContents.on('did-finish-load', () => {
    if (!demoRecord) reapplyDockPreference()
    registerShotShortcut()
  })

  mainWindow.on('focus', () => {
    if (!demoRecord) reapplyDockPreference()
  })

  mainWindow.on('blur', () => {
    // Keep floating above fullscreen even after focus returns to Meet
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isAlwaysOnTop()) {
      applyOverlayWindowBehavior(mainWindow, true)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Initialize IPC handlers
  initializeIpcHandlers(mainWindow)

  // Grant microphone / media permissions
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'audioCapture', 'display-capture']
    callback(allowedPermissions.includes(permission))
  })

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'audioCapture', 'display-capture']
    return allowedPermissions.includes(permission)
  })

  // HMR for renderer base on electron-vite cli.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.kalfi.app')

  // Hide from Dock before the first window — default stealth until settings load
  // Demo-record keeps the Dock icon so presenters can find the app easily
  if (process.platform === 'darwin') {
    applyDockVisibility(!isDemoRecordMode())
  }

  setupAppMenu()

  // F12 DevTools in dev. zoom:true is REQUIRED — default zoom:false
  // calls preventDefault on Cmd+- so zoom-out never reaches Chromium/menus.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window, { zoom: true })
  })

  createWindow()
  registerShotShortcut()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    reapplyDockPreference()
  })
})

// Quit when all windows are closed (including macOS — no dock icon to restore from)
app.on('window-all-closed', () => {
  cleanupIpcHandlers()
  app.quit()
})

// Cleanup on quit
app.on('before-quit', () => {
  cleanupIpcHandlers()
})
