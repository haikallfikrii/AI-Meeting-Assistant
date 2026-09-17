import type { BillingPlan } from './entitlement.js'
import { env } from './config.js'

/** Public Lemon variant IDs for the Kalfi store (not secrets). */
export const LEMON_STORE_ID_DEFAULT = '475862'

export const LEMON_VARIANT_DEFAULTS: Record<
  Exclude<BillingPlan, 'free'>,
  { id: string; checkoutSlug: string }
> = {
  byok_monthly: {
    id: '2137642',
    checkoutSlug: '1af8cd44-ee46-4981-9d22-e080041c0054'
  },
  hosted_monthly: {
    id: '2137653',
    checkoutSlug: 'f8fc4f6f-092c-442d-9ca2-0789e643b286'
  },
  team: {
    id: '2137656',
    checkoutSlug: 'a33830c0-3f60-448a-98ef-2daf0911f119'
  },
  byok_annual: {
    id: '2137823',
    checkoutSlug: 'e2efb24a-4198-40f3-be40-e85ddb45bb16'
  },
  hosted_annual: {
    id: '2137832',
    checkoutSlug: '9c4c5bd2-b60e-4338-9ff8-800b86727b6f'
  },
  single_session: {
    id: '2137842',
    checkoutSlug: 'a139d3bf-e8ab-4d39-8395-fe3ec09f350e'
  }
}

export function lemonStoreId(): string {
  return env('LEMONSQUEEZY_STORE_ID', LEMON_STORE_ID_DEFAULT) || LEMON_STORE_ID_DEFAULT
}

export function lemonVariantMap(): Partial<Record<BillingPlan, string>> {
  return {
    byok_monthly:
      env('LEMONSQUEEZY_VARIANT_BYOK_MONTHLY') ||
      env('LEMONSQUEEZY_VARIANT_BYOK') ||
      LEMON_VARIANT_DEFAULTS.byok_monthly.id,
    byok_annual:
      env('LEMONSQUEEZY_VARIANT_BYOK_ANNUAL') || LEMON_VARIANT_DEFAULTS.byok_annual.id,
    hosted_monthly:
      env('LEMONSQUEEZY_VARIANT_HOSTED_MONTHLY') ||
      env('LEMONSQUEEZY_VARIANT_HOSTED') ||
      LEMON_VARIANT_DEFAULTS.hosted_monthly.id,
    hosted_annual:
      env('LEMONSQUEEZY_VARIANT_HOSTED_ANNUAL') || LEMON_VARIANT_DEFAULTS.hosted_annual.id,
    team: env('LEMONSQUEEZY_VARIANT_TEAM') || LEMON_VARIANT_DEFAULTS.team.id,
    single_session:
      env('LEMONSQUEEZY_VARIANT_SINGLE_SESSION') || LEMON_VARIANT_DEFAULTS.single_session.id
  }
}

export function checkoutUrlForPlan(plan: Exclude<BillingPlan, 'free'>): string {
  const slug = LEMON_VARIANT_DEFAULTS[plan].checkoutSlug
  return `https://kalfi.lemonsqueezy.com/checkout/buy/${slug}`
}
