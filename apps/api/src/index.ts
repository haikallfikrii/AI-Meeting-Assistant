import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { corsOrigins, env } from './lib/config.js'
import { authRoutes } from './routes/auth.js'
import { aiRoutes } from './routes/ai.js'
import { adminRoutes } from './routes/admin.js'
import { billingRoutes, handleLemonWebhook } from './routes/billing.js'
import { polarProductMap } from './lib/polar-products.js'
import { handlePolarWebhook, polarWebhookHeadersFromRequest } from './lib/polar-webhook.js'

const app = new Hono()

app.use(
  '*',
  cors({
    origin: corsOrigins(),
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Signature',
      'Stripe-Signature',
      'X-Admin-Secret',
      'webhook-id',
      'webhook-timestamp',
      'webhook-signature'
    ],
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']
  })
)

app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'kalfi-api',
    byok: 'desktop-local',
    hosted: Boolean(env('OPENROUTER_API_KEY')),
    lemon: Boolean(env('LEMONSQUEEZY_API_KEY') && env('LEMONSQUEEZY_STORE_ID')),
    polar: Boolean(env('POLAR_ACCESS_TOKEN')),
    polarWebhook: Boolean(env('POLAR_WEBHOOK_SECRET')),
    polarEnv: env('POLAR_ENVIRONMENT', 'production') || 'production',
    polarProducts: Object.keys(polarProductMap())
  })
)

app.route('/v1/auth', authRoutes)
app.route('/v1/billing', billingRoutes)
app.route('/v1/ai', aiRoutes)
app.route('/v1/admin', adminRoutes)

/** Legacy Lemon webhook */
app.post('/v1/billing/webhook', async (c) => {
  const raw = await c.req.text()
  const signature = c.req.header('x-signature') || c.req.header('X-Signature') || undefined
  const result = await handleLemonWebhook(raw, signature)
  if (!result.ok) return c.json({ error: result.error }, 400)
  return c.json({ received: true })
})

/** Polar webhook (preferred) + alias */
async function handlePolarHttp(c: { req: { text: () => Promise<string>; raw: Request } }) {
  const raw = await c.req.text()
  const result = await handlePolarWebhook(raw, polarWebhookHeadersFromRequest(c.req.raw.headers))
  if (!result.ok) {
    const status = result.error?.toLowerCase().includes('signature') ? 403 : 400
    return new Response(JSON.stringify({ error: result.error }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  return new Response(JSON.stringify({ received: true, type: result.type }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' }
  })
}

app.post('/v1/billing/webhook/polar', (c) => handlePolarHttp(c))
app.post('/v1/webhooks/polar', (c) => handlePolarHttp(c))

const port = Number(env('PORT', '8787'))

console.log(`Kalfi API listening on :${port}`)
serve({ fetch: app.fetch, port })
