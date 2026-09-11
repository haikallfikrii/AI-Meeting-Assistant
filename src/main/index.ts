import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, nativeImage, screen, session, shell } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import { cleanupIpcHandlers, initializeIpcHandlers } from './ipc/handlers'
import { applyOverlayWindowBehavior } from './windowOverlay'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const appIcon = nativeImage.createFromPath(icon)

  // Calculate dynamic initial height based on laptop screen work area (approx 75% height)
  const primaryDisplay = screen.getPrimaryDisplay()
  const { height: workAreaHeight } = primaryDisplay.workAreaSize
  const initialHeight = Math.max(550, Math.min(700, Math.floor(workAreaHeight * 0.95)))

  // Create the browser window with screen share protection
  mainWindow = new BrowserWindow({
    width: 620,
    height: initialHeight,
    minWidth: 380,
    minHeight: 500,
    show: false,
    title: 'Kalfi',
    autoHideMenuBar: true,
    frame: false, // Frameless for custom title bar
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    fullscreenable: false,
    minimizable: true,
    maximizable: false,
    // macOS: NSPanel-style window can float over other apps' fullscreen Spaces
    ...(process.platform === 'darwin'
      ? {
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
  mainWindow.setContentProtection(true)

  // Float over fullscreen Meet/Chrome without splitting the Space
  applyOverlayWindowBehavior(mainWindow, true)

  mainWindow.on('ready-to-show', () => {
    if (process.platform === 'win32' && !appIcon.isEmpty()) {
      mainWindow?.setIcon(appIcon)
    }
    // showInactive: don't steal focus from the fullscreen Meet window
    mainWindow?.showInactive()
  })

  // Re-apply overlay flags if macOS resets them after Space / display changes
  mainWindow.on('show', () => {
    if (mainWindow) applyOverlayWindowBehavior(mainWindow, true)
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

  // Grant microphone permissions
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'audioCapture']
    if (allowedPermissions.includes(permission)) {
      callback(true)
    } else {
      callback(false)
    }
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

  // Hide from macOS Dock / Cmd+Tab — Force Quit via Activity Monitor still works
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide()
  }

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
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
