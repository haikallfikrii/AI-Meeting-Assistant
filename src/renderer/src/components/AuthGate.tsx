import {
  AlertCircle,
  CheckCircle,
  CreditCard,
  ExternalLink,
  Gift,
  Info,
  KeyRound,
  Loader2,
  Lock,
  Mail
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { AppSettings, useInterviewStore } from '../store/interviewStore'
import { hasPaidAccess, planLabel } from '../lib/access'
import { CloudUser, cloudUserPatch } from '../lib/cloudUser'

const PRICING_URL = 'https://kalfi.app/#pricing'

type Mode = 'trial' | 'login' | 'claim' | 'reset'
type MsgKind = 'error' | 'success' | 'info'

async function apiPost<T extends Record<string, unknown>>(
  path: string,
  body: unknown,
  token?: string
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await window.api.kalfiApi({ path, method: 'POST', body, token })
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

const TAB_LABELS: Record<Mode, string> = {
  trial: 'Free trial',
  login: 'Log in',
  claim: 'Claim after checkout',
  reset: 'Forgot password'
}

export function AuthGate(): React.JSX.Element | null {
  const { settings, setSettings } = useInterviewStore()
  const entitled = hasPaidAccess(settings)

  const [mode, setMode] = useState<Mode>(settings.accountEmail ? 'login' : 'trial')
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

  const signedInWithoutPlan = Boolean(settings.authToken)
  const canStartTrial =
    signedInWithoutPlan && !settings.trialUsed && settings.membershipPlan === 'free'
  const trialEnded =
    typeof settings.trialEndsAt === 'number' && settings.membershipStatus === 'expired'

  const showBanner = (text: string, kind: MsgKind): void => {
    setMsg(text)
    setMsgKind(kind)
    if (kind === 'error') {
      setShake(true)
    }
  }

  const applyCloudUser = async (payload: {
    token: string
    user: CloudUser
  }): Promise<AppSettings> => {
    const updated = (await window.api.updateSettings({
      ...settings,
      ...cloudUserPatch(payload.token, payload.user)
    })) as AppSettings
    setSettings(updated)
    return updated
  }

  const switchMode = (next: Mode): void => {
    setMode(next)
    setMsg(null)
    setDevHint(null)
    setOtpSent(false)
    setOtpCode('')
    setPassword('')
  }

  const validEmail = (): string | null => {
    const trimmed = email.trim()
    if (!trimmed || !trimmed.includes('@')) {
      showBanner('Enter a valid email address.', 'error')
      return null
    }
    return trimmed
  }

  const handleLoginOrClaim = async (): Promise<void> => {
    const trimmed = validEmail()
    if (!trimmed) return
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
        user?: CloudUser
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
          res.status === 401 || /invalid email or password/i.test(String(res.data.error || ''))
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

      const updated = await applyCloudUser({ token: res.data.token, user: res.data.user })
      if (!hasPaidAccess(updated)) {
        showBanner(
          updated.trialUsed || updated.membershipPlan !== 'free'
            ? `Signed in, but no active plan yet (${planLabel(updated.membershipPlan)}). Get a plan on kalfi.app, then log in again.`
            : 'Signed in. You can start your free trial below.',
          'info'
        )
      }
    } catch (err) {
      showBanner(err instanceof Error ? err.message : 'Something went wrong. Try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleSendCode = async (purpose: 'reset' | 'register'): Promise<void> => {
    const trimmed = validEmail()
    if (!trimmed) return
    setBusy(true)
    setMsg(null)
    setDevHint(null)
    try {
      const res = await apiPost<{
        error?: string
        code?: string
        message?: string
        ok?: boolean
        devCode?: string
      }>('/v1/auth/otp/request', { email: trimmed, purpose })
      if (!res.ok) {
        if (res.data.code === 'EMAIL_EXISTS') {
          switchMode('login')
          showBanner('This email already has a Kalfi account. Log in instead.', 'info')
          return
        }
        showBanner(
          res.data.error ||
            'Could not send the code. Email delivery may not be set up yet — try again shortly.',
          'error'
        )
        return
      }
      setOtpSent(true)
      if (res.data.devCode) {
        setDevHint(res.data.devCode)
        setOtpCode(res.data.devCode)
        showBanner('Test mode: use the code below (no email was sent).', 'success')
      } else {
        showBanner(
          res.data.message || 'A 6-digit code is on the way. Check your inbox (and spam).',
          'success'
        )
      }
    } catch (err) {
      showBanner(err instanceof Error ? err.message : 'Could not send code.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleCreateTrialAccount = async (): Promise<void> => {
    const trimmed = validEmail()
    if (!trimmed) return
    if (otpCode.trim().length < 4) {
      showBanner('Enter the 6-digit code from your email.', 'error')
      return
    }
    if (password.length < 8) {
      showBanner('Create a password with at least 8 characters.', 'error')
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const verified = await apiPost<{ error?: string; emailProof?: string }>(
        '/v1/auth/otp/verify',
        { email: trimmed, purpose: 'register', code: otpCode.trim() }
      )
      if (!verified.ok || !verified.data.emailProof) {
        showBanner(verified.data.error || 'That code did not work. Request a new one.', 'error')
        return
      }
      const res = await apiPost<{
        error?: string
        token?: string
        user?: CloudUser
        trialError?: string
      }>('/v1/auth/register', {
        email: trimmed,
        password,
        emailProof: verified.data.emailProof
      })
      if (!res.ok || !res.data.token || !res.data.user) {
        showBanner(res.data.error || 'Could not create your account. Try again.', 'error')
        return
      }
      const updated = await applyCloudUser({ token: res.data.token, user: res.data.user })
      if (!hasPaidAccess(updated)) {
        showBanner(
          `Account created. ${res.data.trialError || 'The free trial could not start.'}`,
          'info'
        )
      }
    } catch (err) {
      showBanner(err instanceof Error ? err.message : 'Could not create account.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleStartTrial = async (): Promise<void> => {
    if (!settings.authToken) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await apiPost<{ error?: string; user?: CloudUser }>(
        '/v1/auth/trial/start',
        {},
        settings.authToken
      )
      if (res.data.user) {
        await applyCloudUser({ token: settings.authToken, user: res.data.user })
      }
      if (!res.ok) {
        showBanner(res.data.error || 'Could not start the free trial.', 'error')
      }
    } catch (err) {
      showBanner(err instanceof Error ? err.message : 'Could not start the free trial.', 'error')
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
        user?: CloudUser
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
      if (!otpSent) void handleSendCode('reset')
      else void handleResetPassword()
      return
    }
    if (mode === 'trial') {
      if (!otpSent) void handleSendCode('register')
      else void handleCreateTrialAccount()
      return
    }
    void handleLoginOrClaim()
  }

  const needsOtpField = (mode === 'reset' || mode === 'trial') && otpSent
  const showPassword = (mode !== 'reset' && mode !== 'trial') || otpSent

  const title = {
    trial: 'Try Kalfi free for 3 days',
    reset: 'Reset password',
    claim: 'Claim your account',
    login: 'Sign in to use Kalfi'
  }[mode]

  const subtitle = {
    trial:
      'Hosted AI included, no API key and no card needed. About 60 minutes of live answers. One trial per person.',
    reset: 'We send a one-time code to prove you own the inbox, then you set a new password.',
    claim: 'After checkout, create a password with the same email you paid with.',
    login: 'Buy on kalfi.app → verify email → pay → open the app → log in (or claim once).'
  }[mode]

  const submitLabel =
    mode === 'trial'
      ? otpSent
        ? 'Start free trial'
        : 'Email me a code'
      : mode === 'reset'
        ? otpSent
          ? 'Set new password'
          : 'Email me a code'
        : mode === 'claim'
          ? 'Claim account'
          : 'Log in'

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
            {mode === 'reset' ? (
              <KeyRound className="w-5 h-5" />
            ) : mode === 'trial' ? (
              <Gift className="w-5 h-5" />
            ) : (
              <Lock className="w-5 h-5" />
            )}
          </div>
          <div>
            <h2 className="text-base font-semibold text-dark-100">{title}</h2>
            <p className="text-xs text-dark-400 mt-1 leading-relaxed">{subtitle}</p>
          </div>
        </div>

        {trialEnded ? (
          <AuthBanner kind="info">
            Your free trial has ended. Pick a plan on kalfi.app, then use Log in again (or restart
            the app) to unlock Kalfi.
          </AuthBanner>
        ) : null}

        {canStartTrial ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleStartTrial()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
            Start 3-day free trial as {settings.accountEmail}
          </button>
        ) : null}

        <div className="flex flex-wrap gap-2 text-[11px]">
          {(Object.keys(TAB_LABELS) as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`px-2.5 py-1 rounded border ${
                mode === m ? 'border-blue-500 text-blue-300' : 'border-dark-600 text-dark-400'
              }`}
              onClick={() => switchMode(m)}
            >
              {TAB_LABELS[m]}
            </button>
          ))}
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

          {needsOtpField ? (
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

          {showPassword ? (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                mode === 'reset'
                  ? 'New password (min 8)'
                  : mode === 'claim' || mode === 'trial'
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
                Your code
              </p>
              <p className="text-2xl font-mono font-semibold tracking-[0.35em] text-emerald-200">
                {devHint}
              </p>
            </div>
          ) : null}

          <div className="space-y-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {submitLabel}
            </button>
            {(mode === 'reset' || mode === 'trial') && otpSent ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSendCode(mode === 'trial' ? 'register' : 'reset')}
                className="w-full text-xs text-dark-400 hover:text-dark-200 py-1"
              >
                Resend code
              </button>
            ) : null}
          </div>
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
