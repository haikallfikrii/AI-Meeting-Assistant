# Kalfi API — VPS (Docker, next to n8n)

## What this is
Auth + Stripe subscription + hosted AI proxy for **Pro** users.
**BYOK stays in the desktop app** and never needs this API.

## Quick start (local)
```bash
cd apps/api
cp .env.example .env
npm install
npm run dev
curl http://127.0.0.1:8787/health
```

## Deploy on Hostinger VPS (Docker + n8n already running)

1. SSH to VPS.
2. Clone or copy `apps/api` somewhere like `/opt/kalfi-api`.
3. Create `.env` from `.env.example` (Stripe MY + OpenRouter key).
4. Build & run **without touching n8n**:

```bash
cd /opt/kalfi-api
docker compose -f docker-compose.kalfi.yml up -d --build
docker ps | grep kalfi
curl http://127.0.0.1:8787/health
```

5. Point DNS `api.yourdomain.com` → VPS IP.
6. Reverse proxy (Nginx example):

```nginx
server {
  server_name api.yourdomain.com;
  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

7. Stripe Dashboard → Webhooks → `https://api.yourdomain.com/v1/billing/webhook`
   Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.

8. Landing `web/landing/index.html` → set:
```js
window.KALFI_CONFIG = {
  apiBaseUrl: "https://api.yourdomain.com",
  stripePriceId: "price_xxx"
}
```

## Memory note
`mem_limit: 512m` keeps n8n safer on small VPS plans. Raise only if needed.

## Endpoints
| Method | Path | Auth |
|---|---|---|
| GET | `/health` | no |
| POST | `/v1/auth/register` | no |
| POST | `/v1/auth/login` | no |
| GET | `/v1/auth/me` | Bearer |
| POST | `/v1/billing/checkout` | no (landing) |
| POST | `/v1/billing/portal` | Bearer |
| GET | `/v1/billing/status` | Bearer |
| POST | `/v1/billing/webhook` | Stripe signature |
| POST | `/v1/ai/chat` | Bearer + Pro |
| POST | `/v1/ai/transcribe` | Bearer + Pro |
