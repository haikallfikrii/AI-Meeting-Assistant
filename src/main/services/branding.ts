import { app, dialog, nativeImage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { BrowserWindow } from 'electron'
import { applyOverlayWindowBehavior } from '../windowOverlay'

export const DEFAULT_BRAND_NAME = 'Kalfi'

const LOGO_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

export function brandingDir(): string {
  const dir = path.join(app.getPath('userData'), 'branding')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function resolveBrandName(brandName?: string | null): string {
  const trimmed = (brandName || '').trim()
  return trimmed || DEFAULT_BRAND_NAME
}

function mimeForExt(ext: string): string {
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return 'image/png'
}

/** Load an image robustly — some PNGs fail createFromPath but work from buffer. */
export function loadNativeImage(filePath: string): Electron.NativeImage {
  if (!filePath || !fs.existsSync(filePath)) {
    return nativeImage.createEmpty()
  }

  try {
    const buf = fs.readFileSync(filePath)
    const fromBuf = nativeImage.createFromBuffer(buf)
    if (!fromBuf.isEmpty()) return fromBuf
  } catch (error) {
    console.error('createFromBuffer failed:', error)
  }

  try {
    const fromPath = nativeImage.createFromPath(filePath)
    if (!fromPath.isEmpty()) return fromPath
  } catch (error) {
    console.error('createFromPath failed:', error)
  }

  return nativeImage.createEmpty()
}

export function readBrandLogoDataUrl(logoPath?: string | null): string {
  if (!logoPath || !fs.existsSync(logoPath)) return ''
  try {
    const ext = path.extname(logoPath).toLowerCase()
    const img = loadNativeImage(logoPath)
    if (!img.isEmpty()) {
      return `data:image/png;base64,${img.toPNG().toString('base64')}`
    }
    // Fallback: raw file bytes (preview may still work in <img>)
    const buf = fs.readFileSync(logoPath)
    return `data:${mimeForExt(ext)};base64,${buf.toString('base64')}`
  } catch (error) {
    console.error('Failed to read brand logo:', error)
    return ''
  }
}

function pruneOldLogos(keepBasename: string): void {
  for (const file of fs.readdirSync(brandingDir())) {
    if (file.startsWith('logo-') && file !== keepBasename) {
      try {
        fs.unlinkSync(path.join(brandingDir(), file))
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Copy a user-picked image into userData/branding.
 * Temporarily drops always-on-top so the macOS file dialog is not trapped behind the overlay.
 */
export async function pickAndStoreBrandLogo(
  parent?: BrowserWindow | null
): Promise<{ path: string; dataUrl: string } | null> {
  const wasOnTop = Boolean(parent && !parent.isDestroyed() && parent.isAlwaysOnTop())
  if (parent && !parent.isDestroyed() && wasOnTop) {
    parent.setAlwaysOnTop(false)
  }

  try {
    const options = {
      title: 'Choose app logo',
      properties: ['openFile' as const],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null

    const source = result.filePaths[0]
    const ext = path.extname(source).toLowerCase()
    if (!LOGO_EXTS.has(ext)) {
      throw new Error('Unsupported image type. Use PNG, JPG, WEBP, or GIF.')
    }

    let image = loadNativeImage(source)
    if (image.isEmpty()) {
      // Last resort: copy bytes and try again from the copy
      const raw = fs.readFileSync(source)
      const tmp = path.join(brandingDir(), `import-${Date.now()}${ext}`)
      fs.writeFileSync(tmp, raw)
      image = loadNativeImage(tmp)
      try {
        fs.unlinkSync(tmp)
      } catch {
        /* ignore */
      }
    }
    if (image.isEmpty()) {
      throw new Error(
        'Could not read that image. Try exporting a standard PNG (RGB, 8-bit) under 5MB.'
      )
    }

    const size = image.getSize()
    const max = 512
    const resized =
      size.width > max || size.height > max
        ? image.resize({
            width:
              size.width >= size.height
                ? max
                : Math.max(1, Math.round((size.width / size.height) * max)),
            height:
              size.height > size.width
                ? max
                : Math.max(1, Math.round((size.height / size.width) * max)),
            quality: 'best'
          })
        : image

    const dest = path.join(brandingDir(), `logo-${Date.now()}.png`)
    const png = resized.toPNG()
    if (!png || png.length === 0) {
      throw new Error('Failed to encode logo as PNG')
    }
    fs.writeFileSync(dest, png)
    pruneOldLogos(path.basename(dest))

    const dataUrl = readBrandLogoDataUrl(dest)
    if (!dataUrl) throw new Error('Logo saved but could not be previewed')
    return { path: dest, dataUrl }
  } finally {
    if (parent && !parent.isDestroyed() && wasOnTop) {
      applyOverlayWindowBehavior(parent, true)
    }
  }
}

export function clearStoredBrandLogo(logoPath?: string | null): void {
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      fs.unlinkSync(logoPath)
    } catch {
      /* ignore */
    }
  }
  try {
    for (const file of fs.readdirSync(brandingDir())) {
      if (file.startsWith('logo-')) {
        fs.unlinkSync(path.join(brandingDir(), file))
      }
    }
  } catch {
    /* ignore */
  }
}

export function applyDockVisibility(hideFromDock: boolean): void {
  if (process.platform !== 'darwin' || !app.dock) return
  try {
    if (hideFromDock) app.dock.hide()
    else app.dock.show()
  } catch (error) {
    console.error('Failed to toggle Dock visibility:', error)
  }
}

/** Bundled Kalfi mark — used when the customer has not set a custom logo. */
function resolveDefaultAppIconPath(): string {
  const candidates = [
    path.join(process.resourcesPath, 'icon.png'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'icon.png'),
    path.join(app.getAppPath(), 'resources', 'icon.png'),
    path.join(__dirname, '../../resources/icon.png')
  ]
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  return ''
}

function resolveActiveLogoImage(brandLogoPath?: string | null): Electron.NativeImage {
  if (brandLogoPath && fs.existsSync(brandLogoPath)) {
    const custom = loadNativeImage(brandLogoPath)
    if (!custom.isEmpty()) return custom
  }
  const fallback = resolveDefaultAppIconPath()
  return fallback ? loadNativeImage(fallback) : nativeImage.createEmpty()
}

export function applyDockIcon(brandLogoPath?: string | null): void {
  if (process.platform !== 'darwin' || !app.dock) return
  try {
    const img = resolveActiveLogoImage(brandLogoPath)
    if (!img.isEmpty()) app.dock.setIcon(img)
  } catch (error) {
    console.error('Failed to set Dock icon:', error)
  }
}

/**
 * Apply display name + window title + optional Dock icon.
 * Custom name/logo remain customer-controlled; empty logo falls back to the Kalfi mark.
 * Note: macOS Dock *label* comes from the .app bundle name and cannot be renamed at runtime.
 */
export function applyRuntimeBranding(
  mainWindow: BrowserWindow | null | undefined,
  brandName?: string | null,
  brandLogoPath?: string | null,
  hideFromDock?: boolean
): string {
  const name = resolveBrandName(brandName)
  try {
    app.setName(name)
  } catch {
    /* ignore */
  }
  try {
    process.title = name
  } catch {
    /* ignore */
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(name)
    const img = resolveActiveLogoImage(brandLogoPath)
    if (!img.isEmpty()) {
      try {
        mainWindow.setIcon(img)
      } catch {
        /* ignore — setIcon is best-effort on macOS */
      }
    }
  }

  if (typeof hideFromDock === 'boolean') {
    applyDockVisibility(hideFromDock)
  }

  // Dock icon only matters when the Dock icon is visible
  if (hideFromDock === false) {
    applyDockIcon(brandLogoPath)
  }

  return name
}
