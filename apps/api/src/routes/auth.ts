import { Hono } from 'hono'
import { z } from 'zod'
import { signAccessToken } from '../lib/auth-token.js'
import {
  createUser,
  findUserByEmail,
  publicUser,
  setUserPassword,
  verifyPassword
} from '../lib/store.js'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128)
})

const claimSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128)
})

export const authRoutes = new Hono()

authRoutes.post('/register', async (c) => {
  const body = registerSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)
  try {
    const user = createUser(body.data.email, body.data.password, { needsPasswordSetup: false })
    const token = await signAccessToken(user.id, user.email)
    return c.json({ token, user: publicUser(user) })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Register failed' }, 400)
  }
})

authRoutes.post('/login', async (c) => {
  const body = registerSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)
  const user = findUserByEmail(body.data.email)
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
  const token = await signAccessToken(user.id, user.email)
  return c.json({ token, user: publicUser(user) })
})

/**
 * First-time password after Lemon checkout auto-provisioned the account.
 * Does not require knowing the temporary password.
 */
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
