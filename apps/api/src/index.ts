import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { corsOrigins, env } from './lib/config.js'
import { authRoutes } from './routes/auth.js'
import { aiRoutes } from './routes/ai.js'
import { adminRoutes } from './routes/admin.js'
import { billingRoutes, handleLemonWebhook } from './routes/billing.js'

const app = new Hono()

app.use(
  '*',
  cors({
    origin: corsOrigins(),
    allowHeaders: ['Content-Type', 'Authorization', 'X-Signature', 'Stripe-Signature', 'X-Admin-Secret'],
    allowMethods: ['GET', 'POST', 'OPTIONS']
  })
)

app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'kalfi-api',
    byok: 'desktop-local',
    hosted: Boolean(env('OPENROUTER_API_KEY')),
    lemon: Boolean(env('LEMONSQUEEZY_API_KEY') && env('LEMONSQUEEZY_STORE_ID'))
  })
)

app.route('/v1/auth', authRoutes)
app.route('/v1/billing', billingRoutes)
app.route('/v1/ai', aiRoutes)
app.route('/v1/admin', adminRoutes)

app.post('/v1/billing/webhook', async (c) => {
  const raw = await c.req.text()
  const signature = c.req.header('x-signature') || c.req.header('X-Signature') || undefined
  const result = await handleLemonWebhook(raw, signature)
  if (!result.ok) return c.json({ error: result.error }, 400)
  return c.json({ received: true })
})

const port = Number(env('PORT', '8787'))

console.log(`Kalfi API listening on :${port}`)
serve({ fetch: app.fetch, port })
