import type { AppSettings } from '../store/interviewStore'

/** Mirrors main hasPaidAccess — signed-in + active/trial paid plan. */
export function hasPaidAccess(settings: Pick<
  AppSettings,
  'authToken' | 'membershipPlan' | 'membershipStatus' | 'singleSession'
>): boolean {
  if (!settings.authToken?.trim()) return false
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
