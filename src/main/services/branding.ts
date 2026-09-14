import { app, dialog, nativeImage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { BrowserWindow } from 'electron'

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

export function readBrandLogoDataUrl(logoPath?: string | null): string {
  if (!logoPath || !fs.existsSync(logoPath)) return ''
  try {
    const ext = path.extname(logoPath).toLowerCase()
    const mime =
      ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/png'
    const buf = fs.readFileSync(logoPath)
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch (error) {
    console.error('Failed to read brand logo:', error)
    return ''
  }
}

/** Copy a user-picked image into userData/branding and return the stored path. */
export async function pickAndStoreBrandLogo(
  parent?: BrowserWindow | null
): Promise<{ path: string; dataUrl: string } | null> {
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
    throw new Error('Unsupported image type')
  }

  // Normalize via nativeImage so huge photos don't bloat settings UI
  const image = nativeImage.createFromPath(source)
  if (image.isEmpty()) throw new Error('Could not read that image')

  const size = image.getSize()
  const max = 256
  const resized =
    size.width > max || size.height > max
      ? image.resize({
          width: size.width >= size.height ? max : Math.max(1, Math.round((size.width / size.height) * max)),
          height: size.height > size.width ? max : Math.max(1, Math.round((size.height / size.width) * max)),
          quality: 'best'
        })
      : image

  const dest = path.join(brandingDir(), `logo-${Date.now()}.png`)
  fs.writeFileSync(dest, resized.toPNG())

  // Remove older logos so userData stays small
  for (const file of fs.readdirSync(brandingDir())) {
    if (file.startsWith('logo-') && file !== path.basename(dest)) {
      try {
        fs.unlinkSync(path.join(brandingDir(), file))
      } catch {
        /* ignore */
      }
    }
  }

  return { path: dest, dataUrl: readBrandLogoDataUrl(dest) }
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

/** Apply display name + window title so the overlay does not say "Kalfi". */
export function applyRuntimeBranding(
  mainWindow: BrowserWindow | null | undefined,
  brandName?: string | null,
  brandLogoPath?: string | null
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
    if (brandLogoPath && fs.existsSync(brandLogoPath) && process.platform === 'win32') {
      const img = nativeImage.createFromPath(brandLogoPath)
      if (!img.isEmpty()) mainWindow.setIcon(img)
    }
  }

  return name
}
