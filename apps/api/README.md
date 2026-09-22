# Kalfi API — VPS (Docker, next to n8n)

## What this is
Auth + **Polar.sh** billing (Merchant of Record) + hosted AI proxy for Hosted/Team users.
**BYOK stays in the desktop app** and never needs this API for model calls.

Lemon Squeezy webhooks remain as a temporary fallback while Polar is configured.

## Quick start (local)
```bash
cd apps/api
cp .env.example .env
# Set POLAR_ACCESS_TOKEN, POLAR_ENVIRONMENT=sandbox, POLAR_PRODUCT_*, POLAR_WEBHOOK_SECRET
npm install
npm run dev
curl http://127.0.0.1:8787/health
```

## Deploy on Hostinger VPS (Docker + n8n already running)

1. SSH to VPS.
2. Clone or copy `apps/api` somewhere like `/opt/kalfi/apps/api`.
3. Create `.env` from `.env.example` (Polar OAT + product IDs + OpenRouter key).
4. Build & run **without touching n8n**:

```bash
cd /opt/kalfi/apps/api
docker compose -f docker-compose.kalfi.yml up -d --build
docker ps | grep kalfi
curl http://127.0.0.1:8787/health
```

5. Point DNS `api.yourdomain.com` → VPS IP.
6. Reverse proxy (Nginx) to `:8787` as usual.

7. **Polar** → Settings → Webhooks → Create endpoint:
   - URL: `https://api.yourdomain.com/v1/billing/webhook/polar`
   - Events: `subscription.created`, `subscription.active`, `subscription.updated`,
     `subscription.canceled`, `subscription.revoked`, `subscription.past_due`,
     `order.created`, `order.paid`, `benefit_grant.created`
   - Copy signing secret → `POLAR_WEBHOOK_SECRET`

8. Landing `web/landing/index.html` → `KALFI_CONFIG.apiBaseUrl` + leave `polarCheckoutMode: 'redirect'`.

## Sandbox test checklist
1. Use sandbox OAT + sandbox products + `POLAR_ENVIRONMENT=sandbox`.
2. Checkout each of the 6 SKUs from kalfi.app (OTP gate → Polar).
3. Confirm `/health` shows `polar: true` and product keys.
4. Confirm webhook deliveries in Polar dashboard event log (202).
5. Login in desktop → Settings → Sync plan → plan matches purchase.
6. Single Session: `order.paid` → unused → Start listening → consumed.
7. Cancel subscription in Polar portal → desktop Sync plan → free / canceled.

## Endpoints
| Method | Path | Auth |
|---|---|---|
| GET | `/health` | no |
| POST | `/v1/auth/register` | no |
| POST | `/v1/auth/login` | no |
| GET | `/v1/auth/me` | Bearer |
| POST | `/v1/billing/checkout` | emailProof (landing OTP) |
| POST | `/v1/billing/portal` | Bearer (Polar customer portal) |
| GET | `/v1/billing/status` | Bearer |
| POST | `/v1/billing/webhook` | Lemon signature (legacy) |
| POST | `/v1/billing/webhook/polar` | Polar Standard Webhooks |
| POST | `/v1/webhooks/polar` | alias |
| POST | `/v1/ai/chat` | Bearer + Hosted |
| POST | `/v1/ai/transcribe` | Bearer + Hosted |

## Memory note
`mem_limit: 512m` keeps n8n safer on small VPS plans. Raise only if needed.
