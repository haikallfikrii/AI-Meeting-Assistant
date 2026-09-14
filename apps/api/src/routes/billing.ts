import { Hono } from 'hono'
import Stripe from 'stripe'
import { z } from 'zod'
import { env } from '../lib/config.js'
import { requireAuth, type AppVars } from '../middleware/auth.js'
import {
  findUserByStripeCustomer,
  publicUser,
  updateUser
} from '../lib/store.js'

function stripeClient(): Stripe | null {
  const key = env('STRIPE_SECRET_KEY')
  if (!key) return null
  return new Stripe(key)
}

export const billingRoutes = new Hono<{ Variables: AppVars }>()

const checkoutSchema = z.object({
  priceId: z.string().optional(),
  email: z.string().email().optional(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url()
})

/** Public checkout — landing can start without desktop login (email collected by Stripe). */
billingRoutes.post('/checkout', async (c) => {
  const stripe = stripeClient()
  if (!stripe) return c.json({ error: 'Stripe not configured' }, 503)

  const body = checkoutSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)

  const price = body.data.priceId || env('STRIPE_PRICE_ID')
  if (!price) return c.json({ error: 'Missing price id' }, 400)

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    success_url: body.data.successUrl,
    cancel_url: body.data.cancelUrl,
    customer_email: body.data.email,
    allow_promotion_codes: true,
    metadata: {
      product: 'kalfi-pro'
    }
  })

  return c.json({ url: session.url, id: session.id })
})

billingRoutes.post('/portal', requireAuth, async (c) => {
  const stripe = stripeClient()
  if (!stripe) return c.json({ error: 'Stripe not configured' }, 503)
  const user = c.get('user')
  if (!user.stripeCustomerId) {
    return c.json({ error: 'No Stripe customer on this account' }, 400)
  }
  const portal = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: env('APP_URL', 'https://kalfi.app')
  })
  return c.json({ url: portal.url })
})

billingRoutes.get('/status', requireAuth, async (c) => {
  return c.json({ user: publicUser(c.get('user')) })
})

/** Stripe webhook — mount with raw body in index */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string | undefined
): Promise<{ ok: boolean; error?: string }> {
  const stripe = stripeClient()
  const whsec = env('STRIPE_WEBHOOK_SECRET')
  if (!stripe || !whsec) return { ok: false, error: 'Stripe webhook not configured' }
  if (!signature) return { ok: false, error: 'Missing signature' }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, whsec)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid signature' }
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const customerId = String(session.customer || '')
    const subscriptionId = String(session.subscription || '')
    const email = (session.customer_details?.email || session.customer_email || '')
      .trim()
      .toLowerCase()

    if (customerId && email) {
      const { findUserByEmail, createUser } = await import('../lib/store.js')
      let user = findUserByEmail(email)
      if (!user) {
        // Auto-provision account; user sets password later via reset/login magic (MVP: random)
        const tempPass = `tmp_${Math.random().toString(36).slice(2)}A1!`
        user = createUser(email, tempPass)
      }
      updateUser(user.id, {
        plan: 'pro',
        subStatus: 'active',
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId || user.stripeSubscriptionId
      })
    }
  }

  if (
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const sub = event.data.object as Stripe.Subscription
    const user = findUserByStripeCustomer(String(sub.customer))
    if (user) {
      const active = sub.status === 'active' || sub.status === 'trialing'
      updateUser(user.id, {
        plan: active ? 'pro' : 'free',
        subStatus: active ? 'active' : sub.status === 'past_due' ? 'past_due' : 'canceled',
        stripeSubscriptionId: sub.id
      })
    }
  }

  return { ok: true }
}
