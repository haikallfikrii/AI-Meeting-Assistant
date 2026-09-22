/**
 * Polar webhook ingestion — signature verified via official SDK (Standard Webhooks).
 *
 * Configure endpoint (sandbox then production):
 *   URL:  https://<api>/v1/billing/webhook/polar
 *   Events (minimum):
 *     subscription.created, subscription.active, subscription.updated,
 *     subscription.canceled, subscription.revoked, subscription.past_due,
 *     order.created, order.paid,
 *     benefit_grant.created (optional — store license key)
 */
import { webhooks } from '@polar-sh/sdk/2026-10'
import { env } from './config.js'
import { type BillingPlan } from './entitlement.js'
import { recordEvent } from './events.js'
import { markLeadSubscribed } from './leads.js'
import { sendAppEmail } from './mail.js'
import {
  pastDueEmail,
  subscriptionActiveEmail,
  subscriptionCanceledEmail
} from './email-templates.js'
import { planFromPolarProductId, type PaidBillingPlan } from './polar-products.js'
import {
  createUser,
  findUserByEmail,
  findUserByPolarCustomer,
  findUserByPolarSubscription,
  grantSingleSessionPass,
  updateUser,
  type User
} from './store.js'

type PolarEvent = {
  type: string
  data: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function str(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function nestedEmail(data: Record<string, unknown>): string {
  const direct = str(data.customer_email || data.email).toLowerCase()
  if (direct) return direct
  const customer = asRecord(data.customer)
  return str(customer?.email).toLowerCase()
}

function nestedCustomerId(data: Record<string, unknown>): string {
  const direct = str(data.customer_id)
  if (direct) return direct
  const customer = asRecord(data.customer)
  return str(customer?.id)
}

function nestedProductId(data: Record<string, unknown>): string {
  const direct = str(data.product_id)
  if (direct) return direct
  const product = asRecord(data.product)
  if (product?.id) return str(product.id)
  const items = data.items
  if (Array.isArray(items) && items[0]) {
    const first = asRecord(items[0])
    const p = asRecord(first?.product)
    return str(first?.product_id || p?.id)
  }
  const products = data.products
  if (Array.isArray(products) && products[0]) {
    const first = asRecord(products[0])
    return str(first?.id || products[0])
  }
  return ''
}

function nestedMetadataPlan(data: Record<string, unknown>): string {
  const meta = asRecord(data.metadata)
  return str(meta?.plan)
}

function resolvePlan(data: Record<string, unknown>): PaidBillingPlan | null {
  const fromMeta = nestedMetadataPlan(data)
  if (
    fromMeta === 'byok_monthly' ||
    fromMeta === 'byok_annual' ||
    fromMeta === 'hosted_monthly' ||
    fromMeta === 'hosted_annual' ||
    fromMeta === 'team' ||
    fromMeta === 'single_session'
  ) {
    return fromMeta
  }
  return planFromPolarProductId(nestedProductId(data))
}

function ensureUserFromCheckout(email: string): User {
  let user = findUserByEmail(email)
  if (!user) {
    const tempPass = `tmp_${Math.random().toString(36).slice(2)}A1!`
    user = createUser(email, tempPass, { needsPasswordSetup: true })
  }
  return user
}

function findUser(opts: {
  email?: string
  customerId?: string
  subscriptionId?: string
}): User | null {
  const { email, customerId, subscriptionId } = opts
  return (
    (subscriptionId && findUserByPolarSubscription(subscriptionId)) ||
    (customerId && findUserByPolarCustomer(customerId)) ||
    (email ? findUserByEmail(email) : null)
  )
}

function mapSubStatus(status: string): User['subStatus'] {
  const s = status.toLowerCase()
  if (s === 'active' || s === 'trialing') return 'active'
  if (s === 'past_due' || s === 'unpaid') return 'past_due'
  if (s === 'canceled' || s === 'cancelled') return 'canceled'
  if (s === 'expired' || s === 'revoked' || s === 'incomplete_expired') return 'expired'
  return 'none'
}

function applySubscriptionGrant(
  user: User,
  plan: BillingPlan | null,
  data: Record<string, unknown>
): void {
  const subscriptionId = str(data.id)
  const customerId = nestedCustomerId(data)
  const status = mapSubStatus(str(data.status) || 'active')
  const nextPlan =
    plan && plan !== 'single_session' ? plan : plan || (user.plan === 'free' ? 'byok_monthly' : user.plan)

  // Active / trial unlock; past_due keeps plan but flags status; canceled/revoked demote
  if (status === 'canceled' || status === 'expired') {
    updateUser(user.id, {
      plan: 'free',
      subStatus: status,
      polarCustomerId: customerId || user.polarCustomerId,
      polarSubscriptionId: subscriptionId || user.polarSubscriptionId,
      polarProductId: nestedProductId(data) || user.polarProductId,
      singleSession: undefined
    })
    return
  }

  updateUser(user.id, {
    plan: nextPlan,
    subStatus: status === 'none' ? 'active' : status,
    polarCustomerId: customerId || user.polarCustomerId,
    polarSubscriptionId: subscriptionId || user.polarSubscriptionId,
    polarProductId: nestedProductId(data) || user.polarProductId,
    singleSession: nextPlan !== 'single_session' ? undefined : user.singleSession
  })
}

function applySingleSessionOrder(user: User, data: Record<string, unknown>): void {
  const orderId = str(data.id)
  const customerId = nestedCustomerId(data)
  const created = Date.parse(str(data.created_at))
  grantSingleSessionPass(user.id, {
    polarOrderId: orderId || undefined,
    purchasedAt: Number.isFinite(created) ? created : Date.now()
  })
  if (customerId) {
    updateUser(user.id, {
      polarCustomerId: customerId,
      polarOrderId: orderId || undefined,
      polarProductId: nestedProductId(data) || undefined
    })
  }
}

function applyLicenseKey(user: User, data: Record<string, unknown>): void {
  const props = asRecord(data.properties)
  const benefit = asRecord(data.benefit)
  const key =
    str(props?.key || props?.license_key || data.license_key) ||
    str(asRecord(benefit)?.key)
  if (!key) return
  updateUser(user.id, { polarLicenseKey: key })
}

export async function handlePolarWebhook(
  rawBody: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; error?: string; type?: string }> {
  const secret = env('POLAR_WEBHOOK_SECRET').trim()
  if (!secret) {
    return { ok: false, error: 'POLAR_WEBHOOK_SECRET not configured' }
  }

  let event: PolarEvent
  try {
    const parsed = (await webhooks.validateEvent(rawBody, headers, secret)) as unknown as PolarEvent
    if (!parsed?.type || !parsed?.data) {
      return { ok: false, error: 'Invalid Polar webhook payload' }
    }
    event = parsed
  } catch (err) {
    if (err instanceof webhooks.PolarWebhookVerificationError) {
      return { ok: false, error: 'Invalid Polar webhook signature' }
    }
    console.error('[polar webhook] validate failed', err)
    return { ok: false, error: 'Webhook validation failed' }
  }

  const data = asRecord(event.data) || {}
  const email = nestedEmail(data)
  const customerId = nestedCustomerId(data)
  const plan = resolvePlan(data)
  const type = event.type

  try {
    if (
      type === 'subscription.created' ||
      type === 'subscription.active' ||
      type === 'subscription.updated' ||
      type === 'subscription.past_due' ||
      type === 'subscription.canceled' ||
      type === 'subscription.uncanceled' ||
      type === 'subscription.revoked' ||
      type === 'subscription.resumed'
    ) {
      const subscriptionId = str(data.id)
      let user = findUser({ email, customerId, subscriptionId })
      if (!user && email) user = ensureUserFromCheckout(email)
      if (user) {
        const prevStatus = user.subStatus
        applySubscriptionGrant(user, plan, data)
        const nextStatus = mapSubStatus(str(data.status) || 'active')
        if (nextStatus === 'active') {
          markLeadSubscribed(user.email, plan || undefined)
          if (prevStatus !== 'active') {
            const mail = subscriptionActiveEmail({ plan: plan || user.plan })
            void sendAppEmail({
              to: user.email,
              subject: mail.subject,
              text: mail.text,
              html: mail.html
            })
          }
        } else if (nextStatus === 'past_due') {
          const mail = pastDueEmail({ plan: plan || user.plan })
          void sendAppEmail({
            to: user.email,
            subject: mail.subject,
            text: mail.text,
            html: mail.html
          })
        } else if (
          (nextStatus === 'canceled' || nextStatus === 'expired') &&
          (type === 'subscription.canceled' || type === 'subscription.revoked')
        ) {
          const mail = subscriptionCanceledEmail({
            plan: plan || user.plan,
            immediate: nextStatus === 'expired' || type === 'subscription.revoked'
          })
          void sendAppEmail({
            to: user.email,
            subject: mail.subject,
            text: mail.text,
            html: mail.html
          })
        }
        recordEvent('polar_subscription', {
          email: user.email,
          userId: user.id,
          meta: { type, plan, status: data.status, subscriptionId, customerId }
        })
      } else {
        recordEvent('polar_subscription', {
          email: email || undefined,
          meta: { type, plan, status: data.status, subscriptionId, customerId }
        })
      }
      return { ok: true, type }
    }

    if (type === 'order.created' || type === 'order.paid') {
      const billingReason = str(data.billing_reason)
      const isOneTime = plan === 'single_session' || billingReason === 'purchase'

      let user = findUser({ email, customerId })
      if (!user && email) user = ensureUserFromCheckout(email)

      // Fulfill Single Session on paid (preferred) or created+purchase
      if (user && isOneTime && (type === 'order.paid' || billingReason === 'purchase')) {
        applySingleSessionOrder(user, data)
        markLeadSubscribed(user.email, 'single_session')
      }

      recordEvent('polar_order', {
        email: email || user?.email,
        userId: user?.id,
        meta: {
          type,
          plan,
          orderId: str(data.id),
          customerId,
          billingReason,
          status: data.status
        }
      })
      return { ok: true, type }
    }

    if (type === 'benefit_grant.created' || type === 'benefit_grant.updated') {
      let user = findUser({ email, customerId })
      if (!user && email) user = ensureUserFromCheckout(email)
      if (user) applyLicenseKey(user, data)
      recordEvent('polar_benefit', {
        email: email || user?.email,
        userId: user?.id,
        meta: { type, benefitId: str(data.benefit_id || asRecord(data.benefit)?.id) }
      })
      return { ok: true, type }
    }

    // Ignore other events quietly (checkout.*, customer.*, etc.)
    return { ok: true, type }
  } catch (err) {
    console.error('[polar webhook] handler error', type, err)
    return { ok: false, error: err instanceof Error ? err.message : 'Handler failed' }
  }
}

/** Normalize Incoming headers for Standard Webhooks verification. */
export function polarWebhookHeadersFromRequest(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value
  })
  return out
}
