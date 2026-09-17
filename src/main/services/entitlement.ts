/**
 * Desktop entitlement helpers — mirrors apps/api/src/lib/entitlement.ts
 * Feature gating uses FeatureTier; BillingPlan stores the Lemon SKU.
 */

import { isTestAllowlisted } from './testAllowlist'

export type BillingPlan =
  | 'free'
  | 'byok_monthly'
  | 'byok_annual'
  | 'hosted_monthly'
  | 'hosted_annual'
  | 'team'
  | 'single_session'

export type FeatureTier = 'free' | 'byok' | 'hosted' | 'team' | 'single_session'

export type BillingInterval = 'none' | 'month' | 'year' | 'one_time'

export type MembershipStatus =
  | 'inactive'
  | 'active'
  | 'trial'
  | 'past_due'
  | 'canceled'
  | 'expired'

export type SingleSessionStatus = 'unused' | 'active_in_session' | 'consumed' | 'expired'

export const SINGLE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const SINGLE_SESSION_DURATION_MS = 2 * 60 * 60 * 1000

export interface SingleSessionState {
  status: SingleSessionStatus
  purchasedAt: number
  expiresAt: number
  sessionStartedAt?: number
}

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

export function normalizeBillingPlan(value: unknown): BillingPlan {
  if (value === 'pro' || value === 'hosted') return 'hosted_monthly'
  if (value === 'byok') return 'byok_monthly'
  if (
    value === 'free' ||
    value === 'byok_monthly' ||
    value === 'byok_annual' ||
    value === 'hosted_monthly' ||
    value === 'hosted_annual' ||
    value === 'team' ||
    value === 'single_session'
  ) {
    return value
  }
  return 'free'
}

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
    state: { ...current, status: 'active_in_session', sessionStartedAt: now }
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

export function createUnusedSingleSession(purchasedAt = Date.now()): SingleSessionState {
  return {
    status: 'unused',
    purchasedAt,
    expiresAt: purchasedAt + SINGLE_SESSION_TTL_MS
  }
}

/** Plan/status gate (token checked separately via hasPaidAccess). */
export function canUseAppFeatures(
  plan: BillingPlan,
  status: MembershipStatus,
  singleSession?: SingleSessionState | null
): boolean {
  if (status !== 'active' && status !== 'trial') return false
  const tier = featureTierOf(plan)
  if (tier === 'byok' || tier === 'hosted' || tier === 'team') return true
  if (tier === 'single_session' && singleSession) {
    const s = evaluateSingleSession(singleSession)
    return s.status === 'unused' || s.status === 'active_in_session'
  }
  return false
}

/**
 * App requires signed-in account + active/trial paid plan (or usable Single Session Pass).
 * Free / inactive / no token → blocked.
 * Optional email allowlist for Lemon test-mode accounts.
 */
export function hasPaidAccess(
  plan: BillingPlan,
  status: MembershipStatus,
  authToken?: string | null,
  singleSession?: SingleSessionState | null,
  email?: string | null
): boolean {
  if (!authToken || !String(authToken).trim()) return false
  if (isTestAllowlisted(email)) return true
  return canUseAppFeatures(plan, status, singleSession)
}

export function planLabel(plan: BillingPlan): string {
  switch (plan) {
    case 'byok_monthly':
      return 'BYOK — $14/mo'
    case 'byok_annual':
      return 'BYOK — $120/yr'
    case 'hosted_monthly':
      return 'Hosted — $19/mo'
    case 'hosted_annual':
      return 'Hosted — $180/yr'
    case 'team':
      return 'Team — $49/mo'
    case 'single_session':
      return 'Single Session — $9'
    default:
      return 'Free / local only'
  }
}
