/**
 * Polar.sh client for Kalfi billing (Merchant of Record).
 * Uses the official typed SDK pinned to API version 2026-10
 * (matches Polar webhook endpoint API version).
 *
 * Env:
 *   POLAR_ACCESS_TOKEN   — Organization Access Token (OAT), never ship to the desktop/renderer
 *   POLAR_ENVIRONMENT    — "sandbox" | "production" (default: production)
 *   POLAR_PRODUCT_*      — product UUIDs from Polar dashboard (see polar-products.ts)
 */
import { createPolar } from '@polar-sh/sdk/2026-10'
import { env } from './config.js'
import { type PaidBillingPlan, polarProductIdForPlan } from './polar-products.js'

export type PolarEnvironment = 'sandbox' | 'production'

export type PolarClient = ReturnType<typeof createPolar>

let client: PolarClient | null = null

export function polarEnvironment(): PolarEnvironment {
  const raw = env('POLAR_ENVIRONMENT', 'production').trim().toLowerCase()
  return raw === 'sandbox' ? 'sandbox' : 'production'
}

export function polarConfigured(): boolean {
  return Boolean(env('POLAR_ACCESS_TOKEN').trim())
}

/**
 * Lazy singleton Polar client. Throws if POLAR_ACCESS_TOKEN is missing.
 * Prefer polarConfigured() before calling when the route should degrade gracefully.
 */
export function getPolar(): PolarClient {
  if (client) return client

  const accessToken = env('POLAR_ACCESS_TOKEN').trim()
  if (!accessToken) {
    throw new Error('Missing env POLAR_ACCESS_TOKEN')
  }

  client = createPolar({
    accessToken,
    environment: polarEnvironment()
  })

  return client
}

/** Clear cached client (tests / env reload). */
export function resetPolarClient(): void {
  client = null
}

export type CreatePolarCheckoutInput = {
  plan: PaidBillingPlan
  email: string
  successUrl: string
  /** Origin for embedded checkout (e.g. https://kalfi.app). Omit for full-page redirect. */
  embedOrigin?: string
  /** Forwarded client IP — Polar uses this for tax/geo when session is created server-side. */
  customerIpAddress?: string
  externalCustomerId?: string
}

/**
 * Create a Polar Checkout Session for a Kalfi plan.
 * Prefer this over static Checkout Links so we can lock the OTP-verified email + metadata.
 */
export async function createPolarCheckout(input: CreatePolarCheckoutInput): Promise<{
  id: string
  url: string
}> {
  const productId = polarProductIdForPlan(input.plan)
  if (!productId) {
    throw new Error(`Missing Polar product id for plan ${input.plan}`)
  }

  const polar = getPolar()
  const checkout = await polar.checkouts.create({
    products: [productId],
    customer_email: input.email,
    external_customer_id: input.externalCustomerId || input.email,
    success_url: input.successUrl,
    embed_origin: input.embedOrigin || null,
    customer_ip_address: input.customerIpAddress || null,
    metadata: {
      plan: input.plan,
      source: 'kalfi_landing'
    },
    customer_metadata: {
      plan: input.plan
    }
  })

  if (!checkout.url) {
    throw new Error('Polar checkout created without a URL')
  }

  return { id: checkout.id, url: checkout.url }
}

/**
 * Optional: validate a Polar License Key benefit.
 * Entitlement source of truth remains webhook → DB (single_session state machine).
 * Use this for support tooling / rare re-checks, not every desktop startup.
 */
export async function validatePolarLicenseKey(input: {
  key: string
  organizationId?: string
}): Promise<{ valid: boolean; status?: string; error?: string }> {
  const organizationId = (input.organizationId || env('POLAR_ORGANIZATION_ID')).trim()
  if (!organizationId) {
    return { valid: false, error: 'Missing POLAR_ORGANIZATION_ID' }
  }
  try {
    const result = await getPolar().licenseKeys.validate({
      key: input.key.trim(),
      organization_id: organizationId
    })
    const status = String((result as { status?: string }).status || 'valid')
    return { valid: status !== 'revoked' && status !== 'expired', status }
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'License validation failed'
    }
  }
}
