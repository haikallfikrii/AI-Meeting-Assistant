# Kalfi brand mark

Minimal geometric **K** with a short middle **answer bar** — the live reply line. That bar is the signature so the shape still reads as Kalfi without the wordmark.

## Colors

| Token | Hex | Use |
| --- | --- | --- |
| Accent | `#5B8CFF` | Mark on dark / primary |
| Ink | `#080A0F` | App icon field, dark UI |
| On light | `#080A0F` or `currentColor` | Mark on light backgrounds |

## Files

| File | Use |
| --- | --- |
| `kalfi-mark.svg` | Master mark (`currentColor`) — nav, UI, mono print |
| `kalfi-mark-color.svg` | Same mark locked to `#5B8CFF` |
| `kalfi-icon.svg` | Squircle app / favicon tile |
| `kalfi-wordmark.svg` | Mark + “Kalfi” for headers / decks |
| `kalfi-app-icon.png` | Raster app icon (1024-ready source) |
| `kalfi-app-icon.ico` | Windows installer / shortcut icon |
| `favicon-16.png` / `favicon-32.png` | Browser favicons |
| `apple-touch-icon.png` | iOS / Apple touch |
| `og-icon.png` | Open Graph / Twitter share image |

Ship targets: `resources/icon.png`, `build/icon.png`, `build/icon.icns`, `build/icon.ico`.

Custom customer branding (display name + logo) and hide-from-Dock stay independent — empty logo falls back to this mark.
