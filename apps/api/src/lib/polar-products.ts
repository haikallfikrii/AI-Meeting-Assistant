/**
 * Polar product IDs for Kalfi plans.
 * Defaults are production catalogue IDs; override via env for sandbox or rebuilds.
 */
import type { BillingPlan } from './entitlement.js'
import { env } from './config.js'

export type PaidBillingPlan = Exclude<BillingPlan, 'free'>

/** Production Polar catalogue (kalfi.app org) — Sep 2026 */
export const POLAR_PRODUCT_DEFAULTS: Record<PaidBillingPlan, string> = {
  byok_monthly: 'b3362eda-3a8e-4983-9a67-946da235877b',
  byok_annual: 'f3d03286-b7b5-49aa-a6dc-6e78e11b265d',
  hosted_monthly: '1ed73894-702d-4772-bbe1-f41ac920b360',
  hosted_annual: '3f4f6bfd-45c4-4131-aaf8-f7b609d457d0',
  team: '1ffa4fd9-ace4-4528-9b78-8000fde38678',
  single_session: 'd9007072-d979-4053-bbf2-1d37efddb6e9'
}

const PRODUCT_ENV: Record<PaidBillingPlan, string> = {
  byok_monthly: 'POLAR_PRODUCT_BYOK_MONTHLY',
  byok_annual: 'POLAR_PRODUCT_BYOK_ANNUAL',
  hosted_monthly: 'POLAR_PRODUCT_HOSTED_MONTHLY',
  hosted_annual: 'POLAR_PRODUCT_HOSTED_ANNUAL',
  team: 'POLAR_PRODUCT_TEAM',
  single_session: 'POLAR_PRODUCT_SINGLE_SESSION'
}

export function polarProductMap(): Record<PaidBillingPlan, string> {
  const out = { ...POLAR_PRODUCT_DEFAULTS }
  for (const [plan, key] of Object.entries(PRODUCT_ENV) as Array<[PaidBillingPlan, string]>) {
    const id = env(key).trim()
    if (id) out[plan] = id
  }
  return out
}

export function polarProductIdForPlan(plan: PaidBillingPlan): string | null {
  return polarProductMap()[plan] || null
}

export function planFromPolarProductId(
  productId: string | undefined | null,
  map: Record<PaidBillingPlan, string> = polarProductMap()
): PaidBillingPlan | null {
  if (!productId) return null
  for (const [plan, id] of Object.entries(map) as Array<[PaidBillingPlan, string]>) {
    if (id === productId) return plan
  }
  return null
}

export function polarProductsConfigured(): boolean {
  return Object.values(polarProductMap()).every((id) => Boolean(id?.trim()))
}
