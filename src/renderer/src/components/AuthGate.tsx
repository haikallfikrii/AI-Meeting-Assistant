import { CreditCard, ExternalLink, Loader2, Lock } from 'lucide-react'
import { useState } from 'react'
import { AppSettings, useInterviewStore } from '../store/interviewStore'
import { hasPaidAccess, testEntitlementPatch } from '../lib/access'

const KALFI_API = 'https://api.srv835792.hstgr.cloud'
const PRICING_URL = 'https://kalfi.app/#pricing'

export function AuthGate(): React.JSX.Element | null {
  const { settings, setSettings } = useInterviewStore()
  const entitled = hasPaidAccess(settings)

  const [mode, setMode] = useState<'login' | 'claim'>('login')
  const [email, setEmail] = useState(settings.accountEmail || '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  if (entitled) return null

  const applyCloudUser = async (payload: {
    token: string
    user: {
      email: string
      plan?: AppSettings['membershipPlan']
      subStatus?: string
      singleSession?: AppSettings['singleSession']
    }
  }): Promise<void> => {
    const statusMap: Record<string, AppSettings['membershipStatus']> = {
      active: 'active',
      trial: 'trial',
      inactive: 'inactive',
      past_due: 'past_due',
      canceled: 'canceled',
      expired: 'expired'
    }
    const next: Partial<AppSettings> = {
      accountEmail: payload.user.email,
      authToken: payload.token,
      membershipPlan: payload.user.plan || 'free',
      membershipStatus: statusMap[payload.user.subStatus || ''] || 'inactive',
      singleSession: payload.user.singleSession || null
    }
    const testPatch = testEntitlementPatch(payload.user.email)
    const updated = await window.api.updateSettings({ ...settings, ...next, ...testPatch })
    setSettings(updated as AppSettings)
  }

  const handleAuth = async (): Promise<void> => {
    const trimmed = email.trim()
    if (!trimmed || password.length < 8) {
      setMsg('Email and password (min 8 chars) required.')
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const path = mode === 'claim' ? '/v1/auth/claim' : '/v1/auth/login'
      const res = await fetch(`${KALFI_API}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, password })
      })
      const data = (await res.json()) as {
        error?: string
        token?: string
        user?: {
          email: string
          plan?: AppSettings['membershipPlan']
          subStatus?: string
          singleSession?: AppSettings['singleSession']
        }
      }
      if (!res.ok || !data.token || !data.user) {
        setMsg(data.error || 'Auth failed. Check email/password or claim after checkout.')
        return
      }
      await applyCloudUser({ token: data.token, user: data.user })
      const statusMap: Record<string, AppSettings['membershipStatus']> = {
        active: 'active',
        trial: 'trial',
        inactive: 'inactive',
        past_due: 'past_due',
        canceled: 'canceled',
        expired: 'expired'
      }
      const patch = testEntitlementPatch(data.user.email)
      if (
        !hasPaidAccess({
          authToken: data.token,
          accountEmail: data.user.email,
          membershipPlan: patch?.membershipPlan || data.user.plan || 'free',
          membershipStatus:
            patch?.membershipStatus || statusMap[data.user.subStatus || ''] || 'inactive',
          singleSession: data.user.singleSession || null
        })
      ) {
        setMsg('Signed in, but no active plan yet. Subscribe on kalfi.app, then log in again.')
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-dark-950/95 p-4">
      <div className="w-full max-w-md rounded-xl border border-dark-700 bg-dark-900 shadow-2xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-500/15 p-2 text-blue-400">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-dark-100">Sign in to use Kalfi</h2>
            <p className="text-xs text-dark-400 mt-1 leading-relaxed">
              An account with an active plan is required before Start, Shot, or listening. Free local
              use without a subscription is disabled.
            </p>
          </div>
        </div>

        <div className="flex gap-2 text-[11px]">
          <button
            type="button"
            className={`px-2.5 py-1 rounded border ${
              mode === 'login' ? 'border-blue-500 text-blue-300' : 'border-dark-600 text-dark-400'
            }`}
            onClick={() => setMode('login')}
          >
            Log in
          </button>
          <button
            type="button"
            className={`px-2.5 py-1 rounded border ${
              mode === 'claim' ? 'border-blue-500 text-blue-300' : 'border-dark-600 text-dark-400'
            }`}
            onClick={() => setMode('claim')}
          >
            Claim after checkout
          </button>
        </div>

        <div className="space-y-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-100 placeholder-dark-500 focus:outline-none focus:border-blue-500"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'claim' ? 'Create password (min 8)' : 'Password'}
            className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-100 placeholder-dark-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {msg ? <p className="text-xs text-amber-300/90 leading-relaxed">{msg}</p> : null}

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleAuth()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {mode === 'claim' ? 'Claim account' : 'Log in'}
        </button>

        <a
          href={PRICING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-xs text-dark-300 hover:text-blue-300"
        >
          <CreditCard className="w-3.5 h-3.5" />
          Get a plan on kalfi.app
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}
