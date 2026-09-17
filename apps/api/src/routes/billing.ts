import { createHmac, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import { env } from '../lib/config.js'
import {
  type BillingPlan,
  planFromVariantId
} from '../lib/entitlement.js'
import { requireAuth, type AppVars } from '../middleware/auth.js'
import {
  createUser,
  findUserByEmail,
  findUserByLemonCustomer,
  findUserByLemonSubscription,
  grantSingleSessionPass,
  beginSingleSession,
  endSingleSession,
  publicUser,
  updateUser
} from '../lib/store.js'

export const billingRoutes = new Hono<{ Variables: AppVars }>()

function variantMap(): Partial<Record<BillingPlan, string>> {
  return {
    byok_monthly: env('LEMONSQUEEZY_VARIANT_BYOK_MONTHLY') || env('LEMONSQUEEZY_VARIANT_BYOK'),
    byok_annual: env('LEMONSQUEEZY_VARIANT_BYOK_ANNUAL'),
    hosted_monthly: env('LEMONSQUEEZY_VARIANT_HOSTED_MONTHLY') || env('LEMONSQUEEZY_VARIANT_HOSTED'),
    hosted_annual: env('LEMONSQUEEZY_VARIANT_HOSTED_ANNUAL'),
    team: env('LEMONSQUEEZY_VARIANT_TEAM'),
    single_session: env('LEMONSQUEEZY_VARIANT_SINGLE_SESSION')
  }
}

function lemonConfigured(): boolean {
  return Boolean(env('LEMONSQUEEZY_API_KEY') && env('LEMONSQUEEZY_STORE_ID'))
}

const checkoutSchema = z.object({
  plan: z.enum([
    'byok_monthly',
    'byok_annual',
    'hosted_monthly',
    'hosted_annual',
    'team',
    'single_session'
  ]),
  email: z.string().email().optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional()
})

billingRoutes.post('/checkout', async (c) => {
  if (!lemonConfigured()) return c.json({ error: 'Lemon Squeezy not configured' }, 503)

  const body = checkoutSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)

  const variantId = variantMap()[body.data.plan]
  if (!variantId) return c.json({ error: `Missing variant id for ${body.data.plan}` }, 400)

  const storeId = env('LEMONSQUEEZY_STORE_ID')!
  const apiKey = env('LEMONSQUEEZY_API_KEY')!
  const appUrl = env('APP_URL', 'https://kalfi.app')

  const payload = {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_data: {
          email: body.data.email,
          custom: {
            plan: body.data.plan
          }
        },
        product_options: {
          redirect_url: body.data.successUrl || `${appUrl}/?checkout=success`,
          receipt_button_text: 'Return to Kalfi',
          receipt_link_url: body.data.successUrl || `${appUrl}/?checkout=success`
        },
        checkout_options: {
          embed: false,
          media: false,
          logo: true
        }
      },
      relationships: {
        store: { data: { type: 'stores', id: String(storeId) } },
        variant: { data: { type: 'variants', id: String(variantId) } }
      }
    }
  }

  const res = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  })

  const data = (await res.json()) as {
    data?: { id?: string; attributes?: { url?: string } }
    errors?: Array<{ detail?: string }>
  }

  if (!res.ok || !data.data?.attributes?.url) {
    return c.json(
      { error: data.errors?.[0]?.detail || 'Could not create Lemon checkout' },
      502
    )
  }

  return c.json({ url: data.data.attributes.url, id: data.data.id })
})

billingRoutes.get('/status', requireAuth, async (c) => {
  return c.json({ user: publicUser(c.get('user')) })
})

billingRoutes.post('/single-session/start', requireAuth, async (c) => {
  const result = beginSingleSession(c.get('user').id)
  if (!result.ok) {
    return c.json({ error: result.reason || 'Cannot start session', user: publicUser(result.user!) }, 402)
  }
  return c.json({ user: publicUser(result.user!) })
})

billingRoutes.post('/single-session/end', requireAuth, async (c) => {
  const user = endSingleSession(c.get('user').id)
  if (!user) return c.json({ error: 'User not found' }, 404)
  return c.json({ user: publicUser(user) })
})

billingRoutes.post('/portal', requireAuth, async (c) => {
  const customerId = c.get('user').lemonCustomerId
  if (!customerId) return c.json({ error: 'No Lemon customer on this account' }, 400)
  // Lemon customer portal is typically linked from receipt emails; expose customer id for support.
  return c.json({
    message: 'Manage billing from your Lemon Squeezy receipt email, or contact hello@kalfi.app',
    lemonCustomerId: customerId
  })
})

function verifyLemonSignature(rawBody: string, signature: string | undefined): boolean {
  const secret = env('LEMONSQUEEZY_WEBHOOK_SECRET')
  if (!secret || !signature) return false
  const digest = createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    const a = Buffer.from(digest)
    const b = Buffer.from(signature)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function ensureUser(email: string) {
  let user = findUserByEmail(email)
  if (!user) {
    const tempPass = `tmp_${Math.random().toString(36).slice(2)}A1!`
    user = createUser(email, tempPass)
  }
  return user
}

function resolvePlan(
  variantId: number | string | undefined,
  customPlan?: string
): BillingPlan | null {
  const fromVariant = planFromVariantId(variantId, variantMap())
  if (fromVariant) return fromVariant
  if (
    customPlan === 'byok_monthly' ||
    customPlan === 'byok_annual' ||
    customPlan === 'hosted_monthly' ||
    customPlan === 'hosted_annual' ||
    customPlan === 'team' ||
    customPlan === 'single_session'
  ) {
    return customPlan
  }
  return null
}

/**
 * Lemon Squeezy webhook events we handle:
 * - order_created              → Single Session Pass (one-time)
 * - subscription_created       → BYOK / Hosted / Team activate
 * - subscription_updated       → plan/status sync (incl. past_due)
 * - subscription_cancelled     → downgrade when ends
 * - subscription_expired       → free
 * - subscription_payment_success → ensure active
 * - subscription_payment_failed → past_due
 */
export async function handleLemonWebhook(
  rawBody: string,
  signature: string | undefined
): Promise<{ ok: boolean; error?: string }> {
  if (!verifyLemonSignature(rawBody, signature)) {
    return { ok: false, error: 'Invalid Lemon webhook signature' }
  }

  let payload: {
    meta?: {
      event_name?: string
      custom_data?: { plan?: string; user_id?: string }
    }
    data?: {
      id?: string
      type?: string
      attributes?: Record<string, unknown>
    }
  }

  try {
    payload = JSON.parse(rawBody)
  } catch {
    return { ok: false, error: 'Invalid JSON' }
  }

  const event = payload.meta?.event_name || ''
  const attrs = payload.data?.attributes || {}
  const customPlan = payload.meta?.custom_data?.plan
  const email = String(attrs.user_email || attrs.customer_email || '')
    .trim()
    .toLowerCase()
  const customerId = String(attrs.customer_id || '')
  const subscriptionId = payload.data?.type === 'subscriptions' ? String(payload.data.id || '') : ''
  const orderId = payload.data?.type === 'orders' ? String(payload.data.id || '') : ''
  const variantId =
    (attrs.variant_id as number | string | undefined) ||
    ((attrs.first_order_item as { variant_id?: number } | undefined)?.variant_id)

  if (event === 'order_created') {
    const plan = resolvePlan(variantId, customPlan)
    if (plan === 'single_session' && email) {
      const user = ensureUser(email)
      grantSingleSessionPass(user.id, orderId || undefined)
      if (customerId) updateUser(user.id, { lemonCustomerId: customerId, lemonVariantId: String(variantId || '') })
    }
    return { ok: true }
  }

  if (
    event === 'subscription_created' ||
    event === 'subscription_updated' ||
    event === 'subscription_payment_success'
  ) {
    const plan = resolvePlan(variantId, customPlan)
    if (!email && !customerId && !subscriptionId) return { ok: true }

    let user =
      (subscriptionId && findUserByLemonSubscription(subscriptionId)) ||
      (customerId && findUserByLemonCustomer(customerId)) ||
      (email ? findUserByEmail(email) : null)

    if (!user && email) user = ensureUser(email)
    if (!user) return { ok: true }

    const status = String(attrs.status || 'active')
    const active = status === 'active' || status === 'on_trial' || event === 'subscription_payment_success'
    const pastDue = status === 'past_due' || status === 'unpaid'

    updateUser(user.id, {
      plan: plan || user.plan,
      subStatus: active ? 'active' : pastDue ? 'past_due' : 'canceled',
      lemonCustomerId: customerId || user.lemonCustomerId,
      lemonSubscriptionId: subscriptionId || user.lemonSubscriptionId,
      lemonVariantId: variantId != null ? String(variantId) : user.lemonVariantId,
      singleSession: plan && plan !== 'single_session' ? undefined : user.singleSession
    })
    return { ok: true }
  }

  if (event === 'subscription_payment_failed') {
    const user =
      (subscriptionId && findUserByLemonSubscription(subscriptionId)) ||
      (customerId && findUserByLemonCustomer(customerId)) ||
      (email ? findUserByEmail(email) : null)
    if (user) updateUser(user.id, { subStatus: 'past_due' })
    return { ok: true }
  }

  if (event === 'subscription_cancelled' || event === 'subscription_expired') {
    const user =
      (subscriptionId && findUserByLemonSubscription(subscriptionId)) ||
      (customerId && findUserByLemonCustomer(customerId)) ||
      (email ? findUserByEmail(email) : null)
    if (user) {
      const endsAt = attrs.ends_at ? Date.parse(String(attrs.ends_at)) : NaN
      const stillActive = event === 'subscription_cancelled' && Number.isFinite(endsAt) && endsAt > Date.now()
      if (!stillActive) {
        updateUser(user.id, {
          plan: 'free',
          subStatus: event === 'subscription_expired' ? 'expired' : 'canceled',
          lemonSubscriptionId: subscriptionId || user.lemonSubscriptionId
        })
      } else {
        updateUser(user.id, { subStatus: 'canceled' })
      }
    }
    return { ok: true }
  }

  return { ok: true }
}

/** @deprecated Stripe path kept only so old imports compile during cutover */
export async function handleStripeWebhook(
  _rawBody: string,
  _signature: string | undefined
): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: 'Stripe webhooks retired — use Lemon Squeezy' }
}
