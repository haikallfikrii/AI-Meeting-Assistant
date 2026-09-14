import { createMiddleware } from 'hono/factory'
import { verifyAccessToken } from '../lib/auth-token.js'
import { findUserById, publicUser, type User } from '../lib/store.js'

export type AppVars = {
  user: User
}

export const requireAuth = createMiddleware<{ Variables: AppVars }>(async (c, next) => {
  const header = c.req.header('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const { userId } = await verifyAccessToken(token)
    const user = findUserById(userId)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    c.set('user', user)
    await next()
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
})

export const requirePro = createMiddleware<{ Variables: AppVars }>(async (c, next) => {
  const user = c.get('user')
  if (!(user.plan === 'pro' && user.subStatus === 'active')) {
    return c.json(
      {
        error: 'Pro subscription required',
        code: 'PRO_REQUIRED',
        user: publicUser(user)
      },
      402
    )
  }
  await next()
})
