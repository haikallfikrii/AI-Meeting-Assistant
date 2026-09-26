import { Hono } from 'hono'
import { z } from 'zod'
import { env } from '../lib/config.js'
import { type BillingPlan, normalizeLegacyPlan } from '../lib/entitlement.js'
import { listEvents, recordEvent, salesAnalytics } from '../lib/events.js'
import { listLeads, markLeadSubscribed } from '../lib/leads.js'
import {
  adminOverview,
  createUser,
  deleteUser,
  findUserByEmail,
  findUserById,
  grantSingleSessionPass,
  listUsers,
  publicUser,
  setUserPassword,
  updateUser
} from '../lib/store.js'
import { sendAppEmail } from '../lib/mail.js'
import { planActivatedEmail } from '../lib/email-templates.js'
import {
  findManualOrder,
  listManualOrders,
  updateManualOrder
} from '../lib/manual-orders.js'
import {
  affiliateStats,
  listAffiliates,
  listConversions,
  listVouchers,
  markCommissionPaid,
  recordConversion,
  upsertAffiliate,
  upsertVoucher
} from '../lib/affiliates.js'
import { currencyPayload, refreshRates } from '../lib/currency.js'

const PLAN_ENUM = z.enum([
  'free',
  'byok_monthly',
  'byok_annual',
  'hosted_monthly',
  'hosted_annual',
  'team',
  'single_session'
])

const STATUS_ENUM = z.enum([
  'none',
  'active',
  'past_due',
  'canceled',
  'expired',
  'suspended'
])

function requireAdmin(c: { req: { header: (n: string) => string | undefined } }): boolean {
  const secret = env('ADMIN_SECRET')
  const provided = c.req.header('x-admin-secret') || ''
  return Boolean(secret && provided && provided === secret)
}

export const adminRoutes = new Hono()

adminRoutes.get('/ping', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)
  return c.json({ ok: true, service: 'kalfi-admin' })
})

adminRoutes.get('/overview', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)
  return c.json({ ok: true, overview: adminOverview(), sales: salesAnalytics() })
})

adminRoutes.get('/users', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)
  const q = c.req.query('q') || ''
  const plan = c.req.query('plan') || 'all'
  const status = c.req.query('status') || 'all'
  const limit = Number(c.req.query('limit') || '50')
  const offset = Number(c.req.query('offset') || '0')
  const { users, total } = listUsers({ q, plan, status, limit, offset })
  return c.json({
    ok: true,
    total,
    users: users.map(publicUser)
  })
})

adminRoutes.get('/users/:id', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)
  const user = findUserById(c.req.param('id'))
  if (!user) return c.json({ error: 'User not found' }, 404)
  return c.json({ ok: true, user: publicUser(user) })
})

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128).optional(),
  plan: PLAN_ENUM.default('byok_monthly'),
  subStatus: STATUS_ENUM.default('active'),
  adminNote: z.string().max(500).optional()
})

adminRoutes.post('/users', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)
  const body = createSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)

  const email = body.data.email.trim().toLowerCase()
  if (findUserByEmail(email)) {
    return c.json({ error: 'Email already registered' }, 400)
  }

  const password = body.data.password || `Tmp_${Date.now().toString(36)}!`
  let user = createUser(email, password, {
    needsPasswordSetup: !body.data.password
  })
  user =
    updateUser(user.id, {
      plan: normalizeLegacyPlan(body.data.plan) as BillingPlan,
      subStatus: body.data.subStatus,
      suspended: body.data.subStatus === 'suspended',
      adminNote: body.data.adminNote || ''
    }) || user

  recordEvent('admin_create_user', {
    email: user.email,
    userId: user.id,
    meta: { plan: user.plan, subStatus: user.subStatus }
  })

  return c.json({
    ok: true,
    user: publicUser(user),
    tempPassword: body.data.password ? undefined : password
  })
})

const patchSchema = z.object({
  plan: PLAN_ENUM.optional(),
  subStatus: STATUS_ENUM.optional(),
  suspended: z.boolean().optional(),
  adminNote: z.string().max(500).optional(),
  password: z.string().min(8).max(128).optional(),
  needsPasswordSetup: z.boolean().optional()
})

adminRoutes.patch('/users/:id', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)
  const user = findUserById(c.req.param('id'))
  if (!user) return c.json({ error: 'User not found' }, 404)

  const body = patchSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)

  if (body.data.password) {
    setUserPassword(user.id, body.data.password)
  }

  const patch: Parameters<typeof updateUser>[1] = {}
  if (body.data.plan) patch.plan = normalizeLegacyPlan(body.data.plan) as BillingPlan
  if (body.data.subStatus) patch.subStatus = body.data.subStatus
  if (typeof body.data.adminNote === 'string') patch.adminNote = body.data.adminNote
  if (typeof body.data.needsPasswordSetup === 'boolean') {
    patch.needsPasswordSetup = body.data.needsPasswordSetup
  }
  if (typeof body.data.suspended === 'boolean') {
    patch.suspended = body.data.suspended
    if (body.data.suspended) {
      patch.subStatus = 'suspended'
      recordEvent('admin_suspend', { email: user.email, userId: user.id })
    } else if (user.subStatus === 'suspended' || user.suspended) {
      patch.subStatus = body.data.subStatus || 'active'
      recordEvent('admin_unsuspend', { email: user.email, userId: user.id })
    }
  } else if (body.data.subStatus === 'suspended') {
    patch.suspended = true
    recordEvent('admin_suspend', { email: user.email, userId: user.id })
  }

  const updated = updateUser(user.id, patch)
  if (!updated) return c.json({ error: 'Update failed' }, 500)

  recordEvent('admin_update_user', {
    email: updated.email,
    userId: updated.id,
    meta: body.data
  })

  return c.json({ ok: true, user: publicUser(updated) })
})

adminRoutes.post('/users/:id/suspend', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)
  const user = findUserById(c.req.param('id'))
  if (!user) return c.json({ error: 'User not found' }, 404)
  const updated = updateUser(user.id, { suspended: true, subStatus: 'suspended' })
  recordEvent('admin_suspend', { email: user.email, userId: user.id })
  return c.json({ ok: true, user: publicUser(updated!) })
})

adminRoutes.post('/users/:id/unsuspend', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)
  const user = findUserById(c.req.param('id'))
  if (!user) return c.json({ error: 'User not found' }, 404)
  const updated = updateUser(user.id, {
    suspended: false,
    subStatus: user.plan === 'free' ? 'none' : 'active'
  })
  recordEvent('admin_unsuspend', { email: user.email, userId: user.id })
  return c.json({ ok: true, user: publicUser(updated!) })
})

adminRoutes.delete('/users/:id', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)
  const user = findUserById(c.req.param('id'))
  if (!user) return c.json({ error: 'User not found' }, 404)
  deleteUser(user.id)
  recordEvent('admin_delete_user', { email: user.email, userId: user.id })
  return c.json({ ok: true })
})

adminRoutes.get('/events', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)
  const type = c.req.query('type') || 'all'
  const limit = Number(c.req.query('limit') || '50')
  return c.json({ ok: true, events: listEvents({ type, limit }) })
})

adminRoutes.get('/analytics', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)
  const leads = listLeads({ limit: 100 })
  return c.json({
    ok: true,
    overview: adminOverview(),
    sales: salesAnalytics(),
    events: listEvents({ limit: 30 }),
    leads: {
      summary: leads.summary,
      total: leads.total,
      recent: leads.leads
    }
  })
})

adminRoutes.get('/leads', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)
  const q = c.req.query('q') || ''
  const status = c.req.query('status') || 'all'
  const limit = Number(c.req.query('limit') || '100')
  return c.json({ ok: true, ...listLeads({ q, status, limit }) })
})

/**
 * Manual grant for test accounts (Lemon still in test mode).
 * Header: X-Admin-Secret: $ADMIN_SECRET
 */
const grantSchema = z.object({
  email: z.string().email(),
  plan: PLAN_ENUM.exclude(['free']).default('byok_monthly'),
  password: z.string().min(8).max(128).optional()
})

adminRoutes.post('/grant', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)

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
    suspended: false,
    needsPasswordSetup: body.data.password ? false : user.needsPasswordSetup
  }
  if (body.data.password) {
    setUserPassword(user.id, body.data.password)
  }

  const updated = updateUser(user.id, patch)
  if (!updated) return c.json({ error: 'Update failed' }, 500)
  recordEvent('admin_grant', {
    email: updated.email,
    userId: updated.id,
    meta: { plan }
  })
  return c.json({ ok: true, user: publicUser(updated) })
})

adminRoutes.get('/manual-orders', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)
  const status = c.req.query('status') || 'all'
  const limit = Number(c.req.query('limit') || '50')
  return c.json({ ok: true, orders: listManualOrders({ status, limit }) })
})

adminRoutes.post('/manual-orders/:id/activate', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)
  const order = findManualOrder(c.req.param('id'))
  if (!order) return c.json({ error: 'Order not found' }, 404)
  if (order.status === 'activated') {
    const existing = findUserByEmail(order.email)
    return c.json({ ok: true, already: true, user: existing ? publicUser(existing) : null })
  }

  let user = findUserByEmail(order.email)
  if (!user) {
    user = createUser(order.email, `Tmp_${Date.now().toString(36)}!`, {
      needsPasswordSetup: true
    })
  }

  if (order.plan === 'single_session') {
    grantSingleSessionPass(user.id, {
      purchasedAt: Date.now(),
      polarOrderId: order.ref
    })
  } else {
    updateUser(user.id, {
      plan: order.plan,
      subStatus: 'active',
      suspended: false,
      singleSession: undefined
    })
  }

  updateManualOrder(order.id, {
    status: 'activated',
    activatedAt: Date.now(),
    activatedBy: 'admin'
  })

  if (order.voucherCode) {
    recordConversion({
      orderId: order.id,
      orderRef: order.ref,
      customerEmail: order.email,
      plan: order.plan,
      grossUsd: order.listUsd || order.amountUsd + (order.discountUsd || 0),
      discountUsd: order.discountUsd || 0,
      paidUsd: order.amountUsd,
      voucherCode: order.voucherCode,
      affiliateId: order.affiliateId
    })
  }

  const refreshed = findUserByEmail(order.email)
  markLeadSubscribed(order.email, order.plan)
  recordEvent('manual_order_activated', {
    email: order.email,
    userId: refreshed?.id,
    meta: { orderId: order.id, ref: order.ref, plan: order.plan }
  })

  const activeMail = planActivatedEmail({
    email: order.email,
    plan: order.plan,
    ref: order.ref
  })
  void sendAppEmail({
    to: order.email,
    subject: activeMail.subject,
    text: activeMail.text,
    html: activeMail.html
  })

  return c.json({
    ok: true,
    user: refreshed ? publicUser(refreshed) : null,
    order: findManualOrder(order.id)
  })
})

adminRoutes.get('/affiliates', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)
  return c.json({
    ok: true,
    stats: affiliateStats(),
    affiliates: listAffiliates(),
    vouchers: listVouchers(),
    conversions: listConversions(80)
  })
})

adminRoutes.post('/affiliates', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)
  const body = z
    .object({
      id: z.string().optional(),
      name: z.string().min(2).max(120),
      email: z.string().email(),
      country: z.string().min(2).max(16).optional(),
      code: z.string().min(3).max(24),
      discountPercent: z.number().min(0).max(90).optional(),
      commissionPercent: z.number().min(0).max(50).optional(),
      status: z.enum(['active', 'paused', 'archived']).optional(),
      payoutNote: z.string().max(500).optional()
    })
    .safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid affiliate payload' }, 400)
  const aff = upsertAffiliate(body.data)
  return c.json({ ok: true, affiliate: aff })
})

adminRoutes.post('/vouchers', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)
  const body = z
    .object({
      id: z.string().optional(),
      code: z.string().min(3).max(24),
      type: z.enum(['percent', 'fixed_usd']),
      value: z.number().positive(),
      affiliateId: z.string().optional(),
      active: z.boolean().optional(),
      maxRedemptions: z.number().int().positive().optional(),
      expiresAt: z.number().optional(),
      note: z.string().max(500).optional()
    })
    .safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid voucher payload' }, 400)
  const voucher = upsertVoucher(body.data)
  return c.json({ ok: true, voucher })
})

adminRoutes.post('/affiliates/conversions/:id/paid', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)
  const conv = markCommissionPaid(c.req.param('id'))
  if (!conv) return c.json({ error: 'Conversion not found' }, 404)
  return c.json({ ok: true, conversion: conv })
})

adminRoutes.get('/fx', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Forbidden' }, 403)
  if (c.req.query('refresh') === '1') await refreshRates()
  return c.json({ ok: true, ...currencyPayload() })
})
