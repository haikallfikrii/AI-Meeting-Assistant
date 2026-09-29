import { Hono } from 'hono'
import { z } from 'zod'
import { signAccessToken, verifyAccessToken } from '../lib/auth-token.js'
import {
  canSendOtp,
  generateOtpCode,
  sendOtpEmail,
  signEmailProof,
  storeOtp,
  verifyEmailProof,
  verifyOtp,
  type OtpPurpose
} from '../lib/otp.js'
import {
  createUser,
  findUserByEmail,
  findUserById,
  grantTrial,
  publicUser,
  setUserPassword,
  trialEligibility,
  updateUser,
  verifyPassword,
  type TrialDenied,
  type User
} from '../lib/store.js'
import { recordEvent } from '../lib/events.js'
import { upsertLead } from '../lib/leads.js'

const TEST_PLAN_ALLOWLIST = new Set(['muhamadfikrih29@gmail.com'])

const emailSchema = z.string().email()
const passwordSchema = z.string().min(8).max(128)

const deviceIdSchema = z.string().min(8).max(128).optional()

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  emailProof: z.string().min(20),
  deviceId: deviceIdSchema,
  startTrial: z.boolean().optional()
})

const trialStartSchema = z.object({ deviceId: deviceIdSchema })

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'sharklasers.com',
  '10minutemail.com',
  'temp-mail.org',
  'tempmail.com',
  'tempmail.net',
  'tempmailo.com',
  'yopmail.com',
  'getnada.com',
  'trashmail.com',
  'dispostable.com',
  'maildrop.cc',
  'mailnesia.com',
  'throwawaymail.com',
  'fakeinbox.com',
  'emailondeck.com',
  'mohmal.com',
  'minuteinbox.com',
  'moakt.com',
  'tmail.ws',
  'tmpmail.org',
  'burnermail.io'
])

function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() || ''
  return DISPOSABLE_DOMAINS.has(domain)
}

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string | undefined {
  const forwarded = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')
  if (!forwarded) return undefined
  return forwarded.split(',')[0]?.trim() || undefined
}

const TRIAL_DENIED_MESSAGE: Record<TrialDenied, string> = {
  used: 'This account already used its free trial.',
  paid: 'This account already has a plan, so the free trial does not apply.',
  device: 'This device already used a free trial. Pick a plan on kalfi.app to continue.',
  ip: 'Too many free trials from this network today. Try again tomorrow or pick a plan on kalfi.app.',
  disabled: 'Free trials are paused right now. Pick a plan on kalfi.app.',
  email: 'Use a permanent email address to start the free trial.'
}

function tryGrantTrial(
  user: User,
  opts: { deviceId?: string; ip?: string }
): { user: User; trialError?: string; trialCode?: TrialDenied } {
  if (isDisposableEmail(user.email)) {
    return { user, trialError: TRIAL_DENIED_MESSAGE.email, trialCode: 'email' }
  }
  const gate = trialEligibility(user, opts)
  if (!gate.ok) return { user, trialError: TRIAL_DENIED_MESSAGE[gate.reason], trialCode: gate.reason }
  const granted = grantTrial(user.id, opts)
  if (granted) recordEvent('trial_started', { email: granted.email, userId: granted.id })
  return { user: granted || user }
}

const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema
})

const claimSchema = z.object({
  email: emailSchema,
  password: passwordSchema
})

const otpRequestSchema = z.object({
  email: emailSchema,
  purpose: z.enum(['checkout', 'reset', 'register']),
  plan: z.string().max(64).optional(),
  sku: z.string().max(64).optional()
})

const otpVerifySchema = z.object({
  email: emailSchema,
  purpose: z.enum(['checkout', 'reset', 'register']),
  code: z.string().min(4).max(12)
})

const resetSchema = z.object({
  email: emailSchema,
  code: z.string().min(4).max(12),
  password: passwordSchema
})

export const authRoutes = new Hono()

authRoutes.post('/otp/request', async (c) => {
  const body = otpRequestSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Enter a valid email address.' }, 400)

  const email = body.data.email.trim().toLowerCase()
  const purpose = body.data.purpose as OtpPurpose

  if (purpose === 'reset' && !findUserByEmail(email)) {
    // Do not reveal whether the account exists
    return c.json({
      ok: true,
      message: 'If that email has an account, a code is on the way.'
    })
  }

  if (purpose === 'register') {
    if (findUserByEmail(email)) {
      return c.json(
        { error: 'This email already has an account. Sign in instead.', code: 'EMAIL_EXISTS' },
        409
      )
    }
    if (isDisposableEmail(email)) {
      return c.json({ error: TRIAL_DENIED_MESSAGE.email, code: 'DISPOSABLE_EMAIL' }, 400)
    }
  }

  const gate = canSendOtp(email)
  if (!gate.ok) return c.json({ error: gate.error }, 429)

  const code = generateOtpCode()
  storeOtp(email, purpose, code)
  const sent = await sendOtpEmail(email, purpose, code)
  if (!sent.ok) {
    return c.json({ error: sent.error }, 503)
  }

  if (purpose === 'checkout') {
    upsertLead(email, {
      status: 'otp_sent',
      plan: body.data.plan,
      sku: body.data.sku,
      source: 'pricing'
    })
    recordEvent('otp_checkout', {
      email,
      meta: { plan: body.data.plan, sku: body.data.sku }
    })
  } else if (purpose === 'reset') {
    recordEvent('otp_reset', { email })
  }

  return c.json({
    ok: true,
    message: sent.devCode
      ? 'Email sending is in test mode — use the code shown in the app (expires in 10 minutes).'
      : 'Check your inbox for a 6-digit code (expires in 10 minutes).',
    ...(sent.devCode ? { devCode: sent.devCode } : {})
  })
})

authRoutes.post('/otp/verify', async (c) => {
  const body = otpVerifySchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)

  const email = body.data.email.trim().toLowerCase()
  const purpose = body.data.purpose as OtpPurpose
  const checked = verifyOtp(email, purpose, body.data.code)
  if (!checked.ok) return c.json({ error: checked.error }, 400)

  if (purpose === 'checkout') {
    upsertLead(email, { status: 'otp_verified', source: 'pricing' })
  }

  const emailProof = await signEmailProof(email, purpose)
  return c.json({ ok: true, emailProof, email })
})

authRoutes.post('/password/reset', async (c) => {
  const body = resetSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)

  const email = body.data.email.trim().toLowerCase()
  const checked = verifyOtp(email, 'reset', body.data.code)
  if (!checked.ok) return c.json({ error: checked.error }, 400)

  const user = findUserByEmail(email)
  if (!user) {
    return c.json({ error: 'No account for that email.' }, 404)
  }

  const updated = setUserPassword(user.id, body.data.password)
  if (!updated) return c.json({ error: 'Could not update password' }, 500)

  if (TEST_PLAN_ALLOWLIST.has(updated.email) && updated.subStatus !== 'active') {
    updateUser(updated.id, { plan: 'byok_monthly', subStatus: 'active' })
  }

  const fresh = findUserByEmail(email) || updated
  const token = await signAccessToken(fresh.id, fresh.email)
  return c.json({
    ok: true,
    token,
    user: publicUser(fresh),
    message: 'Password updated. You are signed in.'
  })
})

authRoutes.post('/register', async (c) => {
  const body = registerSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)

  let proofEmail: string
  try {
    ;({ email: proofEmail } = await verifyEmailProof(body.data.emailProof, 'register'))
  } catch {
    return c.json({ error: 'Verify your email with the code first.' }, 400)
  }
  if (proofEmail !== body.data.email.trim().toLowerCase()) {
    return c.json({ error: 'Email does not match the verified address.' }, 400)
  }

  let user: User
  try {
    user = createUser(body.data.email, body.data.password, { needsPasswordSetup: false })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Register failed' }, 400)
  }
  recordEvent('register', { email: user.email, userId: user.id })

  let trialError: string | undefined
  let trialCode: TrialDenied | undefined
  if (TEST_PLAN_ALLOWLIST.has(user.email)) {
    user = updateUser(user.id, { plan: 'byok_monthly', subStatus: 'active' }) || user
  } else if (body.data.startTrial !== false) {
    ;({ user, trialError, trialCode } = tryGrantTrial(user, {
      deviceId: body.data.deviceId,
      ip: clientIp(c)
    }))
  }
  const token = await signAccessToken(user.id, user.email)
  return c.json({ token, user: publicUser(user), trialError, trialCode })
})

authRoutes.post('/trial/start', async (c) => {
  const header = c.req.header('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  let userId: string
  try {
    ;({ userId } = await verifyAccessToken(token))
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const user = findUserById(userId)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (user.suspended || user.subStatus === 'suspended') {
    return c.json({ error: 'This account is suspended. Contact support.', code: 'SUSPENDED' }, 403)
  }

  const body = trialStartSchema.safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)

  const result = tryGrantTrial(user, { deviceId: body.data.deviceId, ip: clientIp(c) })
  if (result.trialError) {
    return c.json(
      { error: result.trialError, code: result.trialCode, user: publicUser(result.user) },
      403
    )
  }
  return c.json({ ok: true, user: publicUser(result.user) })
})

authRoutes.post('/login', async (c) => {
  const body = loginSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)
  let user = findUserByEmail(body.data.email)
  if (!user) return c.json({ error: 'Invalid email or password' }, 401)

  if (user.suspended || user.subStatus === 'suspended') {
    return c.json({ error: 'This account is suspended. Contact support.', code: 'SUSPENDED' }, 403)
  }

  if (user.needsPasswordSetup) {
    return c.json(
      {
        error: 'Set a password first — this email was used at checkout',
        code: 'NEEDS_PASSWORD_SETUP',
        email: user.email
      },
      403
    )
  }

  if (!verifyPassword(body.data.password, user.passwordHash)) {
    return c.json({ error: 'Invalid email or password' }, 401)
  }

  if (TEST_PLAN_ALLOWLIST.has(user.email) && (user.plan === 'free' || user.subStatus !== 'active')) {
    user = updateUser(user.id, { plan: 'byok_monthly', subStatus: 'active' }) || user
  }

  const token = await signAccessToken(user.id, user.email)
  return c.json({ token, user: publicUser(user) })
})

authRoutes.post('/claim', async (c) => {
  const body = claimSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)

  const user = findUserByEmail(body.data.email)
  if (!user) {
    return c.json(
      { error: 'No account for this email yet. Complete checkout first, then try again.' },
      404
    )
  }
  if (!user.needsPasswordSetup) {
    return c.json(
      { error: 'Password already set. Use login instead.', code: 'ALREADY_CLAIMED' },
      400
    )
  }

  const updated = setUserPassword(user.id, body.data.password)
  if (!updated) return c.json({ error: 'Could not set password' }, 500)
  const token = await signAccessToken(updated.id, updated.email)
  return c.json({ token, user: publicUser(updated) })
})

authRoutes.get('/me', async (c) => {
  const header = c.req.header('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const { verifyAccessToken } = await import('../lib/auth-token.js')
    const { userId } = await verifyAccessToken(token)
    const { findUserById } = await import('../lib/store.js')
    const user = findUserById(userId)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    return c.json({ user: publicUser(user) })
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
})
