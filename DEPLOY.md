# Kalfi deploy map

## Pieces
| Piece | Where | Repo path |
|---|---|---|
| Desktop app | User Mac | `src/` (this repo `main`) |
| Landing | Hostinger **shared** | `web/landing/` → branch `hosting` |
| API | Hostinger **VPS** Docker | `apps/api/` |
| n8n | Same VPS | untouched |

## 1) Landing → Hostinger shared (Git auto-deploy)

```bash
chmod +x scripts/sync-hosting-branch.sh
./scripts/sync-hosting-branch.sh
git push -u origin hosting --force
git checkout main
```

Hostinger panel:
- Repository: `haikallfikrii/AI-Meeting-Assistant`
- Branch: **`hosting`**
- Auto-deploy on push

Why not `main`? `main` contains Electron + node_modules metadata; Hostinger would dump the whole monorepo into `public_html`.

## 2) API → VPS Docker (beside n8n)

```bash
# on VPS
git clone https://github.com/haikallfikrii/AI-Meeting-Assistant.git
cd AI-Meeting-Assistant/apps/api
cp .env.example .env
# edit secrets
docker compose -f docker-compose.kalfi.yml up -d --build
```

DNS + HTTPS reverse proxy: `api.yourdomain.com` → `127.0.0.1:8787`

Stripe webhook: `https://api.yourdomain.com/v1/billing/webhook`

## 3) Wire landing → API
In deployed landing `index.html`:
```js
apiBaseUrl: "https://api.yourdomain.com",
stripePriceId: "price_..."
```

## 4) Product paths
- **Free BYOK:** desktop Settings → user key (no API needed)
- **Pro:** landing Subscribe → Stripe → webhook → `plan=pro` → desktop login later uses `/v1/ai/*`

## Competitor note
See canvas: [Kalfi competitor research](../../.cursor/projects/Users-khalfikri-Desktop-apasih/canvases/kalfi-competitor-research.canvas.tsx) (open beside chat in Cursor).
