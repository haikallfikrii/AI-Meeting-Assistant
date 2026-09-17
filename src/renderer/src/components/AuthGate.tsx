import { CreditCard, ExternalLink, KeyRound, Loader2, Lock, Mail } from 'lucide-react'
import { useState } from 'react'
import { AppSettings, useInterviewStore } from '../store/interviewStore'
import { hasPaidAccess, testEntitlementPatch } from '../lib/access'

const PRICING_URL = 'https://kalfi.app/#pricing'

type Mode = 'login' | 'claim' | 'reset'

type AuthUser = {
  email: string
  plan?: AppSettings['membershipPlan']
  subStatus?: string
  singleSession?: AppSettings['singleSession']
}

async function apiPost<T extends Record<string, unknown>>(
  path: string,
  body: unknown
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await window.api.kalfiApi({ path, method: 'POST', body })
  return {
    ok: res.ok,
    status: res.status,
    data: (res.data || {}) as T
  }
}

export function AuthGate(): React.JSX.Element | null {
  const { settings, setSettings } = useInterviewStore()
  const entitled = hasPaidAccess(settings)

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState(settings.accountEmail || '')
  const [password, setPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [devHint, setDevHint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  if (entitled) return null

  const applyCloudUser = async (payload: { token: string; user: AuthUser }): Promise<void> => {
    const statusMap: Record<string, AppSettings['membershipStatus']> = {
      active: 'active',
      trial: 'trial',
      inactive: 'inactive',
      none: 'inactive',
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

  const switchMode = (next: Mode): void => {
    setMode(next)
    setMsg(null)
    setDevHint(null)
    setOtpSent(false)
    setOtpCode('')
    setPassword('')
  }

  const handleLoginOrClaim = async (): Promise<void> => {
    const trimmed = email.trim()
    if (!trimmed || password.length < 8) {
      setMsg('Email and password (min 8 characters) are required.')
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const path = mode === 'claim' ? '/v1/auth/claim' : '/v1/auth/login'
      const res = await apiPost<{
        error?: string
        code?: string
        token?: string
        user?: AuthUser
      }>(path, { email: trimmed, password })

      if (!res.ok || !res.data.token || !res.data.user) {
        if (res.data.code === 'NEEDS_PASSWORD_SETUP') {
          setMsg('This email checked out on the website — switch to “Claim after checkout” and create a password.')
          setMode('claim')
          return
        }
        setMsg(
          res.data.error ||
            (res.status === 0
              ? 'Cannot reach Kalfi servers. Check your internet and try again.'
              : 'Login failed. Check email/password, or use Reset password.')
        )
        return
      }

      await applyCloudUser({ token: res.data.token, user: res.data.user })
      const patch = testEntitlementPatch(res.data.user.email)
      if (
        !hasPaidAccess({
          authToken: res.data.token,
          accountEmail: res.data.user.email,
          membershipPlan: patch?.membershipPlan || res.data.user.plan || 'free',
          membershipStatus: patch?.membershipStatus || 'inactive',
          singleSession: res.data.user.singleSession || null
        })
      ) {
        setMsg('Signed in, but no active plan yet. Get a plan on kalfi.app, then log in again.')
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const handleSendResetCode = async (): Promise<void> => {
    const trimmed = email.trim()
    if (!trimmed) {
      setMsg('Enter the email for your Kalfi account.')
      return
    }
    setBusy(true)
    setMsg(null)
    setDevHint(null)
    try {
      const res = await apiPost<{
        error?: string
        message?: string
        ok?: boolean
        devCode?: string
      }>('/v1/auth/otp/request', { email: trimmed, purpose: 'reset' })
      if (!res.ok) {
        setMsg(res.data.error || 'Could not send reset code.')
        return
      }
      setOtpSent(true)
      setMsg(res.data.message || 'If that email has an account, a code is on the way.')
      if (res.data.devCode) {
        setDevHint(`Test code: ${res.data.devCode}`)
        setOtpCode(res.data.devCode)
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not send code.')
    } finally {
      setBusy(false)
    }
  }

  const handleResetPassword = async (): Promise<void> => {
    const trimmed = email.trim()
    if (!trimmed || !otpCode.trim() || password.length < 8) {
      setMsg('Email, 6-digit code, and new password (min 8) are required.')
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const res = await apiPost<{
        error?: string
        token?: string
        user?: AuthUser
        message?: string
      }>('/v1/auth/password/reset', {
        email: trimmed,
        code: otpCode.trim(),
        password
      })
      if (!res.ok || !res.data.token || !res.data.user) {
        setMsg(res.data.error || 'Could not reset password. Request a new code.')
        return
      }
      await applyCloudUser({ token: res.data.token, user: res.data.user })
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not reset password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-dark-950/95 p-4">
      <div className="w-full max-w-md rounded-xl border border-dark-700 bg-dark-900 shadow-2xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-500/15 p-2 text-blue-400">
            {mode === 'reset' ? <KeyRound className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
          <div>
            <h2 className="text-base font-semibold text-dark-100">
              {mode === 'reset'
                ? 'Reset password'
                : mode === 'claim'
                  ? 'Claim your account'
                  : 'Sign in to use Kalfi'}
            </h2>
            <p className="text-xs text-dark-400 mt-1 leading-relaxed">
              {mode === 'reset'
                ? 'We email a one-time code so only you can set a new password.'
                : mode === 'claim'
                  ? 'After Lemon checkout, create a password with the same email you paid with.'
                  : 'An active plan is required. Login uses a secure server link (no browser CORS).'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px]">
          <button
            type="button"
            className={`px-2.5 py-1 rounded border ${
              mode === 'login' ? 'border-blue-500 text-blue-300' : 'border-dark-600 text-dark-400'
            }`}
            onClick={() => switchMode('login')}
          >
            Log in
          </button>
          <button
            type="button"
            className={`px-2.5 py-1 rounded border ${
              mode === 'claim' ? 'border-blue-500 text-blue-300' : 'border-dark-600 text-dark-400'
            }`}
            onClick={() => switchMode('claim')}
          >
            Claim after checkout
          </button>
          <button
            type="button"
            className={`px-2.5 py-1 rounded border ${
              mode === 'reset' ? 'border-blue-500 text-blue-300' : 'border-dark-600 text-dark-400'
            }`}
            onClick={() => switchMode('reset')}
          >
            Reset password
          </button>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
              className="w-full pl-9 pr-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-100 placeholder-dark-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {mode === 'reset' && otpSent ? (
            <input
              type="text"
              inputMode="numeric"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-100 placeholder-dark-500 focus:outline-none focus:border-blue-500 tracking-widest"
            />
          ) : null}

          {mode !== 'reset' || otpSent ? (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                mode === 'reset'
                  ? 'New password (min 8)'
                  : mode === 'claim'
                    ? 'Create password (min 8)'
                    : 'Password'
              }
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-100 placeholder-dark-500 focus:outline-none focus:border-blue-500"
            />
          ) : null}
        </div>

        {msg ? <p className="text-xs text-amber-300/90 leading-relaxed">{msg}</p> : null}
        {devHint ? <p className="text-xs text-emerald-400/90 font-mono">{devHint}</p> : null}

        {mode === 'reset' ? (
          <div className="space-y-2">
            {!otpSent ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSendResetCode()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Email me a code
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleResetPassword()}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Set new password
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSendResetCode()}
                  className="w-full text-xs text-dark-400 hover:text-dark-200 py-1"
                >
                  Resend code
                </button>
              </>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleLoginOrClaim()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {mode === 'claim' ? 'Claim account' : 'Log in'}
          </button>
        )}

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
