import { createHmac, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import { env } from '../lib/config.js'
import { type BillingPlan, planFromVariantId } from '../lib/entitlement.js'
import { checkoutUrlForPlan, lemonStoreId, lemonVariantMap } from '../lib/lemon-variants.js'
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

function lemonConfigured(): boolean {
  return Boolean(env('LEMONSQUEEZY_API_KEY') && lemonStoreId())
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
  const body = checkoutSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)

  const plan = body.data.plan
  const variantId = lemonVariantMap()[plan]
  if (!variantId) return c.json({ error: `Missing variant id for ${plan}` }, 400)

  const appUrl = env('APP_URL', 'https://kalfi.app')
  const successUrl =
    body.data.successUrl ||
    `${appUrl}/?checkout=success&plan=${encodeURIComponent(plan)}${
      body.data.email ? `&email=${encodeURIComponent(body.data.email)}` : ''
    }`

  if (lemonConfigured()) {
    const storeId = lemonStoreId()
    const apiKey = env('LEMONSQUEEZY_API_KEY')!
    const variantNum = Number(variantId)

    const payload = {
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: body.data.email,
            custom: { plan }
          },
          product_options: {
            redirect_url: successUrl,
            receipt_button_text: 'Open Kalfi',
            receipt_link_url: successUrl,
            enabled_variants: [variantNum]
          },
          checkout_options: {
            embed: false,
            media: false,
            logo: true,
            desc: true
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

    if (res.ok && data.data?.attributes?.url) {
      return c.json({ url: data.data.attributes.url, id: data.data.id, plan, locked: true })
    }
    console.warn('Lemon checkout API failed, falling back to buy link', data.errors)
  }

  return c.json({
    url: checkoutUrlForPlan(plan),
    plan,
    locked: true,
    via: 'static'
  })
})

billingRoutes.get('/status', requireAuth, async (c) => {
  return c.json({ user: publicUser(c.get('user')) })
})

billingRoutes.post('/single-session/start', requireAuth, async (c) => {
  const result = beginSingleSession(c.get('user').id)
  if (!result.ok) {
    return c.json(
      { error: result.reason || 'Cannot start session', user: publicUser(result.user!) },
      402
    )
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

function ensureUserFromCheckout(email: string) {
  let user = findUserByEmail(email)
  if (!user) {
    const tempPass = `tmp_${Math.random().toString(36).slice(2)}A1!`
    user = createUser(email, tempPass, { needsPasswordSetup: true })
  }
  return user
}

function resolvePlan(
  variantId: number | string | undefined,
  customPlan?: string
): BillingPlan | null {
  const fromVariant = planFromVariantId(variantId, lemonVariantMap())
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
  const subscriptionId =
    payload.data?.type === 'subscriptions' ? String(payload.data.id || '') : ''
  const orderId = payload.data?.type === 'orders' ? String(payload.data.id || '') : ''
  const variantId =
    (attrs.variant_id as number | string | undefined) ||
    ((attrs.first_order_item as { variant_id?: number } | undefined)?.variant_id)

  if (event === 'order_created') {
    const plan = resolvePlan(variantId, customPlan)
    if (plan === 'single_session' && email) {
      const user = ensureUserFromCheckout(email)
      grantSingleSessionPass(user.id, orderId || undefined)
      if (customerId) {
        updateUser(user.id, {
          lemonCustomerId: customerId,
          lemonVariantId: String(variantId || '')
        })
      }
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

    if (!user && email) user = ensureUserFromCheckout(email)
    if (!user) return { ok: true }

    const status = String(attrs.status || 'active')
    const active =
      status === 'active' || status === 'on_trial' || event === 'subscription_payment_success'
    const pastDue = status === 'past_due' || status === 'unpaid'
    const nextPlan = plan && plan !== 'single_session' ? plan : plan || user.plan

    updateUser(user.id, {
      plan: nextPlan,
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
      const stillActive =
        event === 'subscription_cancelled' && Number.isFinite(endsAt) && endsAt > Date.now()
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

export async function handleStripeWebhook(
  _rawBody: string,
  _signature: string | undefined
): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: 'Stripe webhooks retired — use Lemon Squeezy' }
}
