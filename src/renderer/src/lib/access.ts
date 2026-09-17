import type { AppSettings } from '../store/interviewStore'

/** Test accounts while Lemon is in test mode / unverified. */
const TEST_EMAIL_ALLOWLIST = new Set(['muhamadfikrih29@gmail.com'])

export function isTestAllowlisted(email?: string | null): boolean {
  if (!email) return false
  return TEST_EMAIL_ALLOWLIST.has(String(email).trim().toLowerCase())
}

/** Mirrors main hasPaidAccess — signed-in + active/trial paid plan. */
export function hasPaidAccess(
  settings: Pick<
    AppSettings,
    'authToken' | 'membershipPlan' | 'membershipStatus' | 'singleSession' | 'accountEmail'
  >
): boolean {
  if (!settings.authToken?.trim()) return false
  if (isTestAllowlisted(settings.accountEmail)) return true

  const status = settings.membershipStatus
  if (status !== 'active' && status !== 'trial') return false

  const plan = settings.membershipPlan
  if (
    plan === 'byok_monthly' ||
    plan === 'byok_annual' ||
    plan === 'hosted_monthly' ||
    plan === 'hosted_annual' ||
    plan === 'team'
  ) {
    return true
  }
  if (plan === 'single_session' && settings.singleSession) {
    const s = settings.singleSession.status
    return s === 'unused' || s === 'active_in_session'
  }
  return false
}

/** Local plan override for allowlisted testers (UI + consistency). */
export function testEntitlementPatch(email: string): Partial<AppSettings> | null {
  if (!isTestAllowlisted(email)) return null
  return {
    accountEmail: email.trim().toLowerCase(),
    membershipPlan: 'byok_monthly',
    membershipStatus: 'active',
    billingInterval: 'month'
  }
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free / local only',
  byok_monthly: 'BYOK Monthly',
  byok_annual: 'BYOK Annual',
  hosted_monthly: 'Hosted Monthly',
  hosted_annual: 'Hosted Annual',
  team: 'Team',
  single_session: 'Single session pass'
}

export function planLabel(plan?: string | null): string {
  if (!plan) return 'Unknown'
  return PLAN_LABELS[plan] || plan.replace(/_/g, ' ')
}

export function statusLabel(status?: string | null): string {
  if (!status) return 'inactive'
  return status.replace(/_/g, ' ')
}
