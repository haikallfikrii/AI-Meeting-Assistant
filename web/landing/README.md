# Kalfi landing (Hostinger shared hosting)

Static HTML/CSS/JS only — fits Hostinger Git auto-deploy.

## Deploy (recommended for your Hostinger workflow)

Hostinger deploys the **whole repo root**. This landing lives in `web/landing/`, so use the sync script to publish a clean `hosting` branch:

```bash
# from repo root
./scripts/sync-hosting-branch.sh
git push -u origin hosting
```

Then in Hostinger:
1. Website → Git → Connect `AI-Meeting-Assistant`
2. Branch: **`hosting`** (not `main`)
3. Deploy → site root gets only landing files

### Alternative: separate repo
Copy contents of `web/landing/` into a new repo `kalfi-landing` and auto-deploy `main` there.

## Configure after API is live
Edit `index.html` script block:

```js
window.KALFI_CONFIG = {
  apiBaseUrl: "https://api.yourdomain.com",
  stripePriceId: "price_xxx"
};
```

Also set `CORS_ORIGINS` on the API to include your landing domain.
