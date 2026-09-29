import { createMiddleware } from 'hono/factory'
import { verifyAccessToken } from '../lib/auth-token.js'
import { canUseHostedAi } from '../lib/entitlement.js'
import {
  beginSingleSession,
  findUserById,
  isOnTrial,
  isTrialActive,
  publicUser,
  type User
} from '../lib/store.js'

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

/** Hosted AI routes — Hosted / Team / active Single Session Pass */
export const requirePro = createMiddleware<{ Variables: AppVars }>(async (c, next) => {
  const user = c.get('user')
  if (!canUseHostedAi(user.plan, user.subStatus, user.singleSession)) {
    if (isOnTrial(user) && !isTrialActive(user)) {
      return c.json(
        {
          error: 'Your free trial has ended. Pick a plan on kalfi.app to keep using Kalfi.',
          code: 'TRIAL_EXPIRED',
          user: publicUser(user)
        },
        402
      )
    }
    return c.json(
      {
        error: 'Hosted plan or active Single Session Pass required',
        code: 'HOSTED_REQUIRED',
        user: publicUser(user)
      },
      402
    )
  }
  if (user.plan === 'single_session' && user.singleSession?.status === 'unused') {
    const started = beginSingleSession(user.id)
    if (started.user) c.set('user', started.user)
  }
  await next()
})
