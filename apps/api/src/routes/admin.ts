import { Hono } from 'hono'
import { z } from 'zod'
import { env } from '../lib/config.js'
import { type BillingPlan, normalizeLegacyPlan } from '../lib/entitlement.js'
import {
  createUser,
  findUserByEmail,
  publicUser,
  setUserPassword,
  updateUser
} from '../lib/store.js'

const grantSchema = z.object({
  email: z.string().email(),
  plan: z
    .enum([
      'byok_monthly',
      'byok_annual',
      'hosted_monthly',
      'hosted_annual',
      'team',
      'single_session'
    ])
    .default('byok_monthly'),
  password: z.string().min(8).max(128).optional()
})

export const adminRoutes = new Hono()

/**
 * Manual grant for test accounts (Lemon still in test mode).
 * Header: X-Admin-Secret: $ADMIN_SECRET
 */
adminRoutes.post('/grant', async (c) => {
  const secret = env('ADMIN_SECRET')
  const provided = c.req.header('x-admin-secret') || ''
  if (!secret || provided !== secret) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const body = grantSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)

  const email = body.data.email.trim().toLowerCase()
  const plan = normalizeLegacyPlan(body.data.plan) as BillingPlan
  let user = findUserByEmail(email)

  if (!user) {
    const password = body.data.password || `Tmp_${Date.now().toString(36)}!`
    user = createUser(email, password, { needsPasswordSetup: !body.data.password })
  }

  const patch: Parameters<typeof updateUser>[1] = {
    plan,
    subStatus: 'active',
    needsPasswordSetup: body.data.password ? false : user.needsPasswordSetup
  }
  if (body.data.password) {
    setUserPassword(user.id, body.data.password)
  }

  const updated = updateUser(user.id, patch)
  if (!updated) return c.json({ error: 'Update failed' }, 500)
  return c.json({ ok: true, user: publicUser(updated) })
})
