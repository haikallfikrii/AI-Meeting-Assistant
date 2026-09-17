import {
  AlertCircle,
  CheckCircle,
  CreditCard,
  ExternalLink,
  Info,
  KeyRound,
  Loader2,
  Lock,
  Mail
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { AppSettings, useInterviewStore } from '../store/interviewStore'
import { hasPaidAccess, planLabel, testEntitlementPatch } from '../lib/access'

const PRICING_URL = 'https://kalfi.app/#pricing'

type Mode = 'login' | 'claim' | 'reset'
type MsgKind = 'error' | 'success' | 'info'

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

function AuthBanner({
  kind,
  children
}: {
  kind: MsgKind
  children: React.ReactNode
}): React.JSX.Element {
  const styles =
    kind === 'error'
      ? 'border-red-500/50 bg-red-500/15 text-red-200'
      : kind === 'success'
        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
        : 'border-blue-500/40 bg-blue-500/10 text-blue-100'
  const Icon = kind === 'error' ? AlertCircle : kind === 'success' ? CheckCircle : Info
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm leading-snug ${styles}`}
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
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
  const [msgKind, setMsgKind] = useState<MsgKind>('info')
  const [shake, setShake] = useState(false)

  useEffect(() => {
    if (!shake) return
    const t = window.setTimeout(() => setShake(false), 450)
    return () => window.clearTimeout(t)
  }, [shake])

  if (entitled) return null

  const showBanner = (text: string, kind: MsgKind): void => {
    setMsg(text)
    setMsgKind(kind)
    if (kind === 'error') {
      setShake(true)
    }
  }

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
    if (!trimmed || !trimmed.includes('@')) {
      showBanner('Enter a valid email address.', 'error')
      return
    }
    if (password.length < 8) {
      showBanner('Password must be at least 8 characters.', 'error')
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
          showBanner(
            'This email checked out on the website — switch to “Claim after checkout” and create a password.',
            'info'
          )
          setMode('claim')
          return
        }
        if (res.data.code === 'ALREADY_CLAIMED') {
          showBanner('Password already set for this email. Use Log in instead.', 'info')
          setMode('login')
          return
        }
        const wrongPass =
          res.status === 401 ||
          /invalid email or password/i.test(String(res.data.error || ''))
        showBanner(
          wrongPass
            ? 'Wrong email or password. Try again, or use Reset password.'
            : res.data.error ||
                (res.status === 0
                  ? 'Cannot reach Kalfi servers. Check your internet and try again.'
                  : 'Login failed. Check email/password, or use Reset password.'),
          'error'
        )
        return
      }

      await applyCloudUser({ token: res.data.token, user: res.data.user })
      const patch = testEntitlementPatch(res.data.user.email)
      const plan = patch?.membershipPlan || res.data.user.plan || 'free'
      if (
        !hasPaidAccess({
          authToken: res.data.token,
          accountEmail: res.data.user.email,
          membershipPlan: plan,
          membershipStatus: patch?.membershipStatus || 'inactive',
          singleSession: res.data.user.singleSession || null
        })
      ) {
        showBanner(
          `Signed in, but no active plan yet (${planLabel(plan)}). Get a plan on kalfi.app, then log in again.`,
          'info'
        )
      }
    } catch (err) {
      showBanner(err instanceof Error ? err.message : 'Something went wrong. Try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleSendResetCode = async (): Promise<void> => {
    const trimmed = email.trim()
    if (!trimmed || !trimmed.includes('@')) {
      showBanner('Enter the email for your Kalfi account.', 'error')
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
        showBanner(
          res.data.error ||
            'Could not send reset code. Email delivery may not be set up yet — try again shortly.',
          'error'
        )
        return
      }
      setOtpSent(true)
      if (res.data.devCode) {
        setDevHint(res.data.devCode)
        setOtpCode(res.data.devCode)
        showBanner(
          'Test mode: use the code below (no email was sent). Then enter a new password.',
          'success'
        )
      } else {
        showBanner(
          res.data.message ||
            'If that email has an account, a 6-digit code is on the way. Check your inbox.',
          'success'
        )
      }
    } catch (err) {
      showBanner(err instanceof Error ? err.message : 'Could not send code.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleResetPassword = async (): Promise<void> => {
    const trimmed = email.trim()
    if (!trimmed || !otpCode.trim() || password.length < 8) {
      showBanner('Email, 6-digit code, and new password (min 8) are required.', 'error')
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
        showBanner(res.data.error || 'Could not reset password. Request a new code.', 'error')
        return
      }
      await applyCloudUser({ token: res.data.token, user: res.data.user })
      showBanner('Password updated. You are signed in.', 'success')
    } catch (err) {
      showBanner(err instanceof Error ? err.message : 'Could not reset password.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const onSubmit = (): void => {
    if (mode === 'reset') {
      if (!otpSent) void handleSendResetCode()
      else void handleResetPassword()
      return
    }
    void handleLoginOrClaim()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-dark-950/95 p-4">
      <div
        className={`w-full max-w-md rounded-xl border border-dark-700 bg-dark-900 shadow-2xl p-5 space-y-4 ${
          shake ? 'animate-[authShake_0.4s_ease]' : ''
        }`}
      >
        <style>{`
          @keyframes authShake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-6px); }
            40% { transform: translateX(6px); }
            60% { transform: translateX(-4px); }
            80% { transform: translateX(4px); }
          }
        `}</style>
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
                ? 'We send a one-time code to prove you own the inbox, then you set a new password.'
                : mode === 'claim'
                  ? 'After Lemon checkout, create a password with the same email you paid with.'
                  : 'Buy on kalfi.app → verify email → pay → open the app → log in (or claim once).'}
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
            Forgot password
          </button>
        </div>

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
        >
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
              autoComplete="one-time-code"
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
              className={`w-full px-3 py-2 bg-dark-800 border rounded-lg text-sm text-dark-100 placeholder-dark-500 focus:outline-none focus:border-blue-500 ${
                msgKind === 'error' && msg ? 'border-red-500/70' : 'border-dark-600'
              }`}
            />
          ) : null}

          {msg ? <AuthBanner kind={msgKind}>{msg}</AuthBanner> : null}

          {devHint ? (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-emerald-400/80 mb-1">
                Your reset code
              </p>
              <p className="text-2xl font-mono font-semibold tracking-[0.35em] text-emerald-200">
                {devHint}
              </p>
            </div>
          ) : null}

          {mode === 'reset' ? (
            <div className="space-y-2 pt-1">
              {!otpSent ? (
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Email me a code
                </button>
              ) : (
                <>
                  <button
                    type="submit"
                    disabled={busy}
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
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50 mt-1"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {mode === 'claim' ? 'Claim account' : 'Log in'}
            </button>
          )}
        </form>

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
