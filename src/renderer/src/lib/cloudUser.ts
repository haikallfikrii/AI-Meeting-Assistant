import type { AppSettings } from '../store/interviewStore'
import { testEntitlementPatch } from './access'

export type CloudUser = {
  email: string
  plan?: AppSettings['membershipPlan']
  subStatus?: string
  singleSession?: AppSettings['singleSession']
  trial?: { active: boolean; endsAt: number; tokenCap?: number; tokensUsed?: number } | null
  trialUsed?: boolean
  needsPasswordSetup?: boolean
}

const STATUS_MAP: Record<string, AppSettings['membershipStatus']> = {
  active: 'active',
  trial: 'trial',
  inactive: 'inactive',
  none: 'inactive',
  past_due: 'past_due',
  canceled: 'canceled',
  expired: 'expired'
}

export function cloudUserPatch(token: string, user: CloudUser): Partial<AppSettings> {
  return {
    accountEmail: user.email,
    authToken: token,
    membershipPlan: user.plan || 'free',
    membershipStatus: STATUS_MAP[user.subStatus || ''] || 'inactive',
    singleSession: user.singleSession || null,
    trialEndsAt: user.trial ? user.trial.endsAt : null,
    trialUsed: Boolean(user.trialUsed),
    ...testEntitlementPatch(user.email)
  }
}

/** Pull the latest plan from the server so expiry/upgrades apply without "Sync plan". */
export async function refreshCloudUser(settings: AppSettings): Promise<AppSettings | null> {
  if (!settings.authToken) return null
  try {
    const res = await window.api.kalfiApi({
      path: '/v1/billing/status',
      method: 'GET',
      token: settings.authToken
    })
    const data = (res.data || {}) as { user?: CloudUser }
    if (!res.ok || !data.user) return null
    const updated = await window.api.updateSettings({
      ...settings,
      ...cloudUserPatch(settings.authToken, data.user)
    })
    return updated as AppSettings
  } catch {
    return null
  }
}

export function trialDaysLeft(trialEndsAt: number | null | undefined): number | null {
  if (typeof trialEndsAt !== 'number') return null
  const ms = trialEndsAt - Date.now()
  if (ms <= 0) return 0
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}
