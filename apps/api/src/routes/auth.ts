import { Hono } from 'hono'
import { z } from 'zod'
import { signAccessToken } from '../lib/auth-token.js'
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
  publicUser,
  setUserPassword,
  updateUser,
  verifyPassword
} from '../lib/store.js'

const TEST_PLAN_ALLOWLIST = new Set(['muhamadfikrih29@gmail.com'])

const emailSchema = z.string().email()
const passwordSchema = z.string().min(8).max(128)

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  emailProof: z.string().min(20)
})

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
  purpose: z.enum(['checkout', 'reset', 'register'])
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

  const gate = canSendOtp(email)
  if (!gate.ok) return c.json({ error: gate.error }, 429)

  const code = generateOtpCode()
  storeOtp(email, purpose, code)
  const sent = await sendOtpEmail(email, purpose, code)
  if (!sent.ok) {
    return c.json({ error: sent.error }, 503)
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

  try {
    let user = createUser(body.data.email, body.data.password, { needsPasswordSetup: false })
    if (TEST_PLAN_ALLOWLIST.has(user.email)) {
      user = updateUser(user.id, { plan: 'byok_monthly', subStatus: 'active' }) || user
    }
    const token = await signAccessToken(user.id, user.email)
    return c.json({ token, user: publicUser(user) })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Register failed' }, 400)
  }
})

authRoutes.post('/login', async (c) => {
  const body = loginSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)
  let user = findUserByEmail(body.data.email)
  if (!user) return c.json({ error: 'Invalid email or password' }, 401)

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
