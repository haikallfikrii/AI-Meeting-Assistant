import { createHmac, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import { env, publicSiteUrl } from '../lib/config.js'
import { type BillingPlan, planFromVariantId } from '../lib/entitlement.js'
import { checkoutUrlForPlan, lemonStoreId, lemonVariantMap } from '../lib/lemon-variants.js'
import { verifyEmailProof } from '../lib/otp.js'
import { recordEvent } from '../lib/events.js'
import { markLeadSubscribed, upsertLead } from '../lib/leads.js'
import { sendAppEmail } from '../lib/mail.js'
import {
  paymentFailedEmail,
  pastDueEmail,
  planActivatedEmail,
  subscriptionActiveEmail,
  subscriptionCanceledEmail,
  wisePaymentInstructionsEmail,
  wiseReportedPaidEmail
} from '../lib/email-templates.js'
import {
  createManualOrder,
  findManualOrder,
  MANUAL_PLAN_PRICES_USD,
  paymentInstructionsFor,
  updateManualOrder,
  wisePayConfig
} from '../lib/manual-orders.js'
import { applyVoucherToPrice } from '../lib/affiliates.js'
import { createPolarCheckout, getPolar, polarConfigured } from '../lib/polarService.js'
import { polarProductIdForPlan } from '../lib/polar-products.js'
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

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string | undefined {
  const forwarded = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')
  if (!forwarded) return undefined
  return forwarded.split(',')[0]?.trim() || undefined
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
  email: z.string().email(),
  emailProof: z.string().min(20),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  /** When true, Polar checkout is created with embed_origin for modal checkout. */
  embed: z.boolean().optional(),
  /** Affiliate / promo voucher (e.g. DINAR15). */
  voucherCode: z.string().min(2).max(32).optional(),
  /** Display currency hint only — Wise still settles USD. */
  displayCurrency: z.string().min(3).max(3).optional()
})

billingRoutes.post('/checkout', async (c) => {
  const body = checkoutSchema.safeParse(await c.req.json())
  if (!body.success) {
    return c.json(
      { error: 'Verify your email first, then continue to checkout.' },
      400
    )
  }

  let verifiedEmail: string
  try {
    ;({ email: verifiedEmail } = await verifyEmailProof(body.data.emailProof, 'checkout'))
  } catch {
    return c.json({ error: 'Email verification expired. Request a new code.' }, 400)
  }
  if (verifiedEmail !== body.data.email.trim().toLowerCase()) {
    return c.json({ error: 'Email does not match the verified address.' }, 400)
  }

  const plan = body.data.plan
  const appUrl = publicSiteUrl()
  const successUrl =
    body.data.successUrl ||
    `${appUrl}/?checkout=success&plan=${encodeURIComponent(plan)}&email=${encodeURIComponent(verifiedEmail)}`

  // Prefer Polar when token + product id are configured
  if (polarConfigured() && polarProductIdForPlan(plan)) {
    try {
      const embedOrigin =
        body.data.embed === true
          ? env('POLAR_EMBED_ORIGIN', appUrl).replace(/\/$/, '') || appUrl
          : undefined
      const session = await createPolarCheckout({
        plan,
        email: verifiedEmail,
        successUrl,
        embedOrigin,
        customerIpAddress: clientIp(c)
      })
      upsertLead(verifiedEmail, {
        status: 'checkout_opened',
        plan,
        sku: plan,
        source: 'pricing'
      })
      return c.json({
        url: session.url,
        id: session.id,
        plan,
        locked: true,
        via: 'polar',
        embed: Boolean(embedOrigin)
      })
    } catch (err) {
      console.warn('Polar checkout failed, falling back to Lemon if available', err)
    }
  }

  const variantId = lemonVariantMap()[plan]
  if (!variantId) return c.json({ error: `Missing checkout product for ${plan}` }, 400)

  if (lemonConfigured()) {
    const storeId = lemonStoreId()
    const apiKey = env('LEMONSQUEEZY_API_KEY')!
    const variantNum = Number(variantId)

    const payload = {
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: verifiedEmail,
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
      upsertLead(verifiedEmail, {
        status: 'checkout_opened',
        plan,
        sku: plan,
        source: 'pricing'
      })
      return c.json({
        url: data.data.attributes.url,
        id: data.data.id,
        plan,
        locked: true,
        via: 'lemon'
      })
    }
    console.warn('Lemon checkout API failed, falling back to buy link', data.errors)
  }

  upsertLead(verifiedEmail, {
    status: 'checkout_opened',
    plan,
    sku: plan,
    source: 'pricing'
  })
  return c.json({
    url: checkoutUrlForPlan(plan),
    plan,
    locked: true,
    via: 'static'
  })
})

/** Landing success redirect — funnel only (does not grant plan). */
billingRoutes.post('/checkout-return', async (c) => {
  const body = z
    .object({
      email: z.string().email(),
      plan: z.string().max(64).optional()
    })
    .safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)

  const email = body.data.email.trim().toLowerCase()
  const lead = upsertLead(email, {
    status: 'payment_returned',
    plan: body.data.plan,
    source: 'pricing_success'
  })
  recordEvent('checkout_return', {
    email,
    meta: { source: 'checkout_return', plan: body.data.plan, note: 'awaiting_webhook' }
  })
  return c.json({ ok: true, lead })
})

/**
 * Wise / manual checkout — no license key.
 * After payment + admin activate (or mark-paid queue), user Claims with email in the app.
 */
billingRoutes.post('/manual/checkout', async (c) => {
  const wise = wisePayConfig()
  if (!wise.enabled) {
    return c.json({ error: 'Manual Wise checkout is not enabled.' }, 503)
  }

  const body = checkoutSchema.safeParse(await c.req.json())
  if (!body.success) {
    return c.json({ error: 'Verify your email first, then continue to checkout.' }, 400)
  }

  let verifiedEmail: string
  try {
    ;({ email: verifiedEmail } = await verifyEmailProof(body.data.emailProof, 'checkout'))
  } catch {
    return c.json({ error: 'Email verification expired. Request a new code.' }, 400)
  }
  if (verifiedEmail !== body.data.email.trim().toLowerCase()) {
    return c.json({ error: 'Email does not match the verified address.' }, 400)
  }

  const plan = body.data.plan
  const listUsd = MANUAL_PLAN_PRICES_USD[plan]
  let amountUsd = listUsd
  let discountUsd = 0
  let voucherCode: string | undefined
  let affiliateId: string | undefined

  if (body.data.voucherCode?.trim()) {
    const applied = applyVoucherToPrice(listUsd, body.data.voucherCode)
    if (!applied.ok) return c.json({ error: applied.error }, 400)
    amountUsd = applied.finalUsd
    discountUsd = applied.discountUsd
    voucherCode = applied.code
    affiliateId = applied.affiliateId
  }

  const order = createManualOrder({
    email: verifiedEmail,
    plan,
    listUsd,
    amountUsd,
    discountUsd,
    voucherCode,
    affiliateId,
    displayCurrency: body.data.displayCurrency?.toUpperCase()
  })
  const instructions = paymentInstructionsFor(order)

  upsertLead(verifiedEmail, {
    status: 'checkout_opened',
    plan,
    sku: plan,
    source: 'wise'
  })
  recordEvent('manual_order_created', {
    email: verifiedEmail,
    meta: {
      orderId: order.id,
      ref: order.ref,
      plan,
      amountUsd: order.amountUsd,
      listUsd,
      discountUsd,
      voucherCode: voucherCode || null
    }
  })

  const appUrl = publicSiteUrl()
  const userPayMail = wisePaymentInstructionsEmail({
    email: verifiedEmail,
    plan,
    amountUsd: order.amountUsd,
    ref: order.ref,
    wiseEmail: wise.email,
    accountName: wise.accountName,
    payLink: wise.payLink || null
  })
  void sendAppEmail({
    to: verifiedEmail,
    subject: userPayMail.subject,
    text: userPayMail.text,
    html: userPayMail.html
  })
  void sendAppEmail({
    to: wise.notifyEmail,
    subject: `[Kalfi] New Wise order ${order.ref} — $${order.amountUsd} ${plan}${
      voucherCode ? ` (${voucherCode})` : ''
    }`,
    text:
      `New manual/Wise order\n\n` +
      `Ref: ${order.ref}\nEmail: ${verifiedEmail}\nPlan: ${plan}\n` +
      `Amount: $${order.amountUsd} USD` +
      (discountUsd
        ? ` (list $${listUsd}, −$${discountUsd} via ${voucherCode})`
        : '') +
      `\nActivate in admin → Wise payments (or Overview queue).\n` +
      `Admin: ${appUrl}/admin/\n`
  })

  return c.json({
    ok: true,
    via: 'wise',
    orderId: order.id,
    instructions
  })
})

billingRoutes.post('/manual/mark-paid', async (c) => {
  const body = z
    .object({
      orderId: z.string().min(4),
      email: z.string().email(),
      note: z.string().max(500).optional()
    })
    .safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)

  const order = findManualOrder(body.data.orderId)
  if (!order) return c.json({ error: 'Order not found' }, 404)
  if (order.email !== body.data.email.trim().toLowerCase()) {
    return c.json({ error: 'Email does not match this order' }, 403)
  }
  if (order.status === 'activated') {
    return c.json({ ok: true, status: 'activated', message: 'Already active — open the app and log in.' })
  }

  const updated = updateManualOrder(order.id, {
    status: 'reported_paid',
    reportedAt: Date.now(),
    note: body.data.note || order.note
  })
  upsertLead(order.email, {
    status: 'reported_paid',
    plan: order.plan,
    sku: order.plan,
    source: 'wise'
  })
  recordEvent('manual_order_reported', {
    email: order.email,
    meta: { orderId: order.id, ref: order.ref, plan: order.plan, amountUsd: order.amountUsd }
  })

  const wise = wisePayConfig()
  const userAck = wiseReportedPaidEmail({ plan: order.plan, ref: order.ref })
  void sendAppEmail({
    to: order.email,
    subject: userAck.subject,
    text: userAck.text,
    html: userAck.html
  })
  const appUrl = publicSiteUrl()
  void sendAppEmail({
    to: wise.notifyEmail,
    subject: `[Kalfi] ACTIVATE NOW — ${order.ref} $${order.amountUsd}`,
    text:
      `User marked Wise transfer as sent.\n\n` +
      `Ref: ${order.ref}\nEmail: ${order.email}\nPlan: ${order.plan}\nAmount: $${order.amountUsd}\n` +
      `Open admin → Overview or Wise payments → Activate\n` +
      `${appUrl}/admin/\n`
  })

  return c.json({
    ok: true,
    status: updated?.status || 'reported_paid',
    message:
      'Thanks — we got your notice. Once the transfer clears we activate your plan. Then open Kalfi → Claim/Log in with this email (no license key).'
  })
})

billingRoutes.get('/manual/status', async (c) => {
  const orderId = c.req.query('orderId') || ''
  const ref = c.req.query('ref') || ''
  const email = (c.req.query('email') || '').trim().toLowerCase()
  if ((!orderId && !ref) || !email) {
    return c.json({ error: 'email and orderId (or ref) required' }, 400)
  }
  const order = findManualOrder(orderId || ref)
  if (!order || order.email !== email) return c.json({ error: 'Order not found' }, 404)

  const labels: Record<string, string> = {
    awaiting_payment: 'Awaiting payment',
    reported_paid: 'Under review',
    activated: 'Active',
    canceled: 'Canceled'
  }
  const hints: Record<string, string> = {
    awaiting_payment: 'Send the Wise transfer with your reference, then tap I’ve paid.',
    reported_paid: 'We received your notice. Your plan is queued for activation — usually within a few hours.',
    activated: 'Plan is live. Open the app → Claim / Log in with this email → Sync plan.',
    canceled: 'This order was canceled. Start a new checkout if you still need a plan.'
  }

  return c.json({
    ok: true,
    status: order.status,
    statusLabel: labels[order.status] || order.status,
    statusHint: hints[order.status] || '',
    plan: order.plan,
    ref: order.ref,
    amountUsd: order.amountUsd,
    orderId: order.id,
    updatedAt: order.updatedAt
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
  const user = c.get('user')
  const appUrl = publicSiteUrl()

  if (polarConfigured() && (user.polarCustomerId || user.email)) {
    try {
      const polar = getPolar()
      const session = user.polarCustomerId
        ? await polar.customerSessions.create({
            customer_id: user.polarCustomerId,
            return_url: `${appUrl}/`
          })
        : await polar.customerSessions.create({
            external_customer_id: user.email,
            return_url: `${appUrl}/`
          })
      return c.json({
        url: session.customer_portal_url,
        via: 'polar'
      })
    } catch (err) {
      console.warn('Polar customer portal session failed', err)
    }
  }

  if (user.lemonCustomerId) {
    return c.json({
      message: 'Manage billing from your Lemon Squeezy receipt email, or contact hello@kalfi.app',
      lemonCustomerId: user.lemonCustomerId,
      via: 'lemon'
    })
  }

  return c.json({ error: 'No billing customer on this account yet' }, 400)
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
    recordEvent('lemon_order', {
      email: email || undefined,
      meta: { plan, orderId, customerId, variantId }
    })
    if (email) markLeadSubscribed(email, plan || undefined)
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
    recordEvent('lemon_subscription', {
      email: user.email,
      userId: user.id,
      meta: { event, plan: nextPlan, status, subscriptionId }
    })
    if (active) {
      markLeadSubscribed(user.email, nextPlan)
      if (event === 'subscription_created' || event === 'subscription_payment_success') {
        const mail = subscriptionActiveEmail({ plan: nextPlan })
        void sendAppEmail({
          to: user.email,
          subject: mail.subject,
          text: mail.text,
          html: mail.html
        })
      }
    }
    return { ok: true }
  }

  if (event === 'subscription_payment_failed') {
    const user =
      (subscriptionId && findUserByLemonSubscription(subscriptionId)) ||
      (customerId && findUserByLemonCustomer(customerId)) ||
      (email ? findUserByEmail(email) : null)
    if (user) {
      updateUser(user.id, { subStatus: 'past_due' })
      const mail = paymentFailedEmail({ plan: user.plan })
      void sendAppEmail({
        to: user.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html
      })
    }
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
      const mail = subscriptionCanceledEmail({
        plan: user.plan,
        immediate: !stillActive
      })
      void sendAppEmail({
        to: user.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html
      })
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
