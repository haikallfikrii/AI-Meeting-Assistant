/** Billing SKU (what Lemon sold) */
export type BillingPlan =
  | 'free'
  | 'byok_monthly'
  | 'byok_annual'
  | 'hosted_monthly'
  | 'hosted_annual'
  | 'team'
  | 'single_session'

/** Feature gate (what the app unlocks) */
export type FeatureTier = 'free' | 'byok' | 'hosted' | 'team' | 'single_session'

export type BillingInterval = 'none' | 'month' | 'year' | 'one_time'

export type SubStatus = 'none' | 'active' | 'past_due' | 'canceled' | 'expired' | 'suspended'

/**
 * Single Session Pass state machine:
 *   unused → active_in_session → consumed
 *   unused → expired            (30 days unused)
 *   active_in_session → consumed (session ended OR 2h elapsed)
 */
export type SingleSessionStatus = 'unused' | 'active_in_session' | 'consumed' | 'expired'

export const SINGLE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const SINGLE_SESSION_DURATION_MS = 2 * 60 * 60 * 1000

export function featureTierOf(plan: BillingPlan): FeatureTier {
  switch (plan) {
    case 'byok_monthly':
    case 'byok_annual':
      return 'byok'
    case 'hosted_monthly':
    case 'hosted_annual':
      return 'hosted'
    case 'team':
      return 'team'
    case 'single_session':
      return 'single_session'
    default:
      return 'free'
  }
}

export function billingIntervalOf(plan: BillingPlan): BillingInterval {
  switch (plan) {
    case 'byok_monthly':
    case 'hosted_monthly':
    case 'team':
      return 'month'
    case 'byok_annual':
    case 'hosted_annual':
      return 'year'
    case 'single_session':
      return 'one_time'
    default:
      return 'none'
  }
}

/** Hosted AI proxy (our key) — Hosted / Team / active Single Session */
export function canUseHostedAi(
  plan: BillingPlan,
  subStatus: SubStatus,
  singleSession?: { status: SingleSessionStatus } | null
): boolean {
  const tier = featureTierOf(plan)
  if (tier === 'hosted' || tier === 'team') {
    return subStatus === 'active'
  }
  if (tier === 'single_session') {
    return (
      subStatus === 'active' &&
      (singleSession?.status === 'unused' || singleSession?.status === 'active_in_session')
    )
  }
  return false
}

/** Paid app license (BYOK paid, Hosted, Team, or live Single Session) */
export function hasPaidLicense(
  plan: BillingPlan,
  subStatus: SubStatus,
  singleSession?: { status: SingleSessionStatus } | null
): boolean {
  if (plan === 'free' || subStatus !== 'active') return false
  if (plan === 'single_session') {
    return (
      singleSession?.status === 'unused' || singleSession?.status === 'active_in_session'
    )
  }
  return true
}

export interface SingleSessionState {
  status: SingleSessionStatus
  purchasedAt: number
  expiresAt: number
  sessionStartedAt?: number
  lemonOrderId?: string
}

export function createUnusedSingleSession(
  purchasedAt = Date.now(),
  lemonOrderId?: string
): SingleSessionState {
  return {
    status: 'unused',
    purchasedAt,
    expiresAt: purchasedAt + SINGLE_SESSION_TTL_MS,
    lemonOrderId
  }
}

/** Tick clock / evaluate transitions without side effects beyond returned state */
export function evaluateSingleSession(
  state: SingleSessionState,
  now = Date.now()
): SingleSessionState {
  if (state.status === 'consumed' || state.status === 'expired') return state

  if (state.status === 'unused' && now >= state.expiresAt) {
    return { ...state, status: 'expired' }
  }

  if (state.status === 'active_in_session') {
    const started = state.sessionStartedAt || state.purchasedAt
    if (now >= started + SINGLE_SESSION_DURATION_MS) {
      return { ...state, status: 'consumed' }
    }
  }

  return state
}

export function startSingleSession(
  state: SingleSessionState,
  now = Date.now()
): { ok: true; state: SingleSessionState } | { ok: false; reason: string; state: SingleSessionState } {
  const current = evaluateSingleSession(state, now)
  if (current.status === 'expired') {
    return { ok: false, reason: 'Single Session Pass expired (30 days unused)', state: current }
  }
  if (current.status === 'consumed') {
    return { ok: false, reason: 'Single Session Pass already used', state: current }
  }
  if (current.status === 'active_in_session') {
    return { ok: true, state: current }
  }
  return {
    ok: true,
    state: {
      ...current,
      status: 'active_in_session',
      sessionStartedAt: now
    }
  }
}

export function consumeSingleSession(
  state: SingleSessionState,
  now = Date.now()
): SingleSessionState {
  const current = evaluateSingleSession(state, now)
  if (current.status === 'expired') return current
  return { ...current, status: 'consumed' }
}

/** Map Lemon variant_id → BillingPlan using env */
export function planFromVariantId(
  variantId: number | string | undefined | null,
  variants: Partial<Record<BillingPlan, string>>
): BillingPlan | null {
  if (variantId == null || variantId === '') return null
  const id = String(variantId)
  const entries = Object.entries(variants) as Array<[BillingPlan, string]>
  for (const [plan, envId] of entries) {
    if (envId && String(envId) === id) return plan
  }
  return null
}

export function normalizeLegacyPlan(plan: string | undefined): BillingPlan {
  if (plan === 'pro') return 'hosted_monthly'
  if (
    plan === 'free' ||
    plan === 'byok_monthly' ||
    plan === 'byok_annual' ||
    plan === 'hosted_monthly' ||
    plan === 'hosted_annual' ||
    plan === 'team' ||
    plan === 'single_session'
  ) {
    return plan
  }
  if (plan === 'byok') return 'byok_monthly'
  if (plan === 'hosted') return 'hosted_monthly'
  return 'free'
}
