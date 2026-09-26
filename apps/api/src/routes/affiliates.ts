import { Hono } from 'hono'
import { z } from 'zod'
import {
  applyVoucherToPrice,
  findAffiliateByEmail,
  normalizeCode,
  partnerDashboard,
  updatePartnerPayout,
  type PayoutMethod
} from '../lib/affiliates.js'
import { currencyPayload, refreshRates, type DisplayCurrency } from '../lib/currency.js'
import { MANUAL_PLAN_PRICES_USD } from '../lib/manual-orders.js'
import {
  canSendOtp,
  generateOtpCode,
  sendOtpEmail,
  signEmailProof,
  storeOtp,
  verifyEmailProof,
  verifyOtp
} from '../lib/otp.js'

export const affiliatePublicRoutes = new Hono()

affiliatePublicRoutes.get('/currencies', async (c) => {
  const refresh = c.req.query('refresh') === '1'
  if (refresh) await refreshRates()
  return c.json({ ok: true, ...currencyPayload() })
})

affiliatePublicRoutes.get('/quote', async (c) => {
  const plan = c.req.query('plan') || ''
  const code = c.req.query('code') || ''
  const currency = (c.req.query('currency') || 'USD').toUpperCase() as DisplayCurrency
  const base = MANUAL_PLAN_PRICES_USD[plan as keyof typeof MANUAL_PLAN_PRICES_USD]
  if (!base) return c.json({ error: 'Unknown plan' }, 400)

  let discountUsd = 0
  let finalUsd = base
  let voucher: ReturnType<typeof applyVoucherToPrice> | null = null
  if (code.trim()) {
    voucher = applyVoucherToPrice(base, code)
    if (!voucher.ok) return c.json({ error: voucher.error }, 400)
    discountUsd = voucher.discountUsd
    finalUsd = voucher.finalUsd
  }

  const fx = currencyPayload()
  const rate =
    currency === 'USD'
      ? 1
      : fx.currencies.find((x) => x.code === currency)?.perUsd || null
  if (!rate) return c.json({ error: 'Unsupported currency' }, 400)

  const displayLocal =
    currency === 'USD'
      ? Math.round(finalUsd * 100) / 100
      : Math.round(finalUsd * rate)

  return c.json({
    ok: true,
    plan,
    currency,
    ratePerUsd: rate,
    amountUsd: finalUsd,
    listUsd: base,
    discountUsd,
    displayLocal,
    voucher:
      voucher && voucher.ok
        ? {
            code: voucher.code,
            message: voucher.message,
            affiliateName: voucher.affiliateName,
            percentOff: voucher.percentOff
          }
        : null,
    settle: 'USD via Wise',
    note: fx.note
  })
})

affiliatePublicRoutes.post('/validate', async (c) => {
  const body = z
    .object({
      code: z.string().min(2).max(32),
      plan: z.string().min(2).max(64)
    })
    .safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)
  const base = MANUAL_PLAN_PRICES_USD[body.data.plan as keyof typeof MANUAL_PLAN_PRICES_USD]
  if (!base) return c.json({ error: 'Unknown plan' }, 400)
  const result = applyVoucherToPrice(base, body.data.code)
  if (!result.ok) return c.json({ ok: false, error: result.error }, 400)
  return c.json({
    ok: true,
    code: result.code,
    listUsd: base,
    discountUsd: result.discountUsd,
    amountUsd: result.finalUsd,
    message: result.message,
    affiliateName: result.affiliateName,
    percentOff: result.percentOff,
    link: `https://kalfi.app/?ref=${encodeURIComponent(normalizeCode(result.code))}#pricing`
  })
})

/** Partner portal — OTP login with affiliate email */
affiliatePublicRoutes.post('/partner/otp/request', async (c) => {
  const body = z
    .object({ email: z.string().email() })
    .safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Enter a valid email.' }, 400)

  const email = body.data.email.trim().toLowerCase()
  const aff = findAffiliateByEmail(email)
  // Same response whether or not affiliate exists — avoid email enumeration
  if (!aff || aff.status === 'archived') {
    return c.json({
      ok: true,
      message: 'If this email is a Kalfi partner, a code was sent.'
    })
  }

  const allowed = canSendOtp(email)
  if (!allowed.ok) return c.json({ error: allowed.error }, 429)

  const code = generateOtpCode()
  storeOtp(email, 'partner', code)
  const sent = await sendOtpEmail(email, 'partner', code)
  if (!sent.ok) return c.json({ error: sent.error || 'Could not send email.' }, 502)

  return c.json({
    ok: true,
    message: 'Code sent. Check your inbox.',
    ...(process.env.NODE_ENV !== 'production' && sent.devCode ? { devCode: sent.devCode } : {})
  })
})

affiliatePublicRoutes.post('/partner/otp/verify', async (c) => {
  const body = z
    .object({
      email: z.string().email(),
      code: z.string().min(4).max(8)
    })
    .safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)

  const email = body.data.email.trim().toLowerCase()
  const aff = findAffiliateByEmail(email)
  if (!aff || aff.status === 'archived') {
    return c.json({ error: 'No partner account for this email.' }, 404)
  }

  const checked = verifyOtp(email, 'partner', body.data.code)
  if (!checked.ok) return c.json({ error: checked.error }, 400)

  const token = await signEmailProof(email, 'partner')
  const dash = partnerDashboard(aff.id)
  return c.json({
    ok: true,
    token,
    expiresInDays: 7,
    ...dash
  })
})

affiliatePublicRoutes.get('/partner/me', async (c) => {
  const auth = c.req.header('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return c.json({ error: 'Sign in required' }, 401)

  let email: string
  try {
    ;({ email } = await verifyEmailProof(token, 'partner'))
  } catch {
    return c.json({ error: 'Session expired. Sign in again.' }, 401)
  }

  const aff = findAffiliateByEmail(email)
  if (!aff || aff.status === 'archived') {
    return c.json({ error: 'Partner account not found.' }, 404)
  }
  if (aff.status === 'paused') {
    return c.json({
      ok: true,
      paused: true,
      message: 'Your partner code is paused. Contact hello@kalfi.app.',
      affiliate: {
        name: aff.name,
        code: aff.code,
        email: aff.email,
        status: aff.status
      }
    })
  }

  const dash = partnerDashboard(aff.id)
  return c.json({ ok: true, paused: false, ...dash })
})

affiliatePublicRoutes.post('/partner/payout', async (c) => {
  const auth = c.req.header('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return c.json({ error: 'Sign in required' }, 401)

  let email: string
  try {
    ;({ email } = await verifyEmailProof(token, 'partner'))
  } catch {
    return c.json({ error: 'Session expired. Sign in again.' }, 401)
  }

  const aff = findAffiliateByEmail(email)
  if (!aff || aff.status === 'archived') {
    return c.json({ error: 'Partner account not found.' }, 404)
  }

  const body = z
    .object({
      payoutMethod: z.enum(['wise', 'bank', 'dana', 'ovo', 'qris', 'duitnow']),
      payoutAccount: z.string().min(3).max(120),
      payoutAccountName: z.string().max(120).optional(),
      payoutBankName: z.string().max(120).optional(),
      payoutNote: z.string().max(500).optional()
    })
    .safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Fill method and account details.' }, 400)

  if (body.data.payoutMethod === 'bank' && !(body.data.payoutBankName || '').trim()) {
    return c.json({ error: 'Bank name is required for bank transfer.' }, 400)
  }

  const updated = updatePartnerPayout(aff.id, {
    payoutMethod: body.data.payoutMethod as PayoutMethod,
    payoutAccount: body.data.payoutAccount,
    payoutAccountName: body.data.payoutAccountName,
    payoutBankName: body.data.payoutBankName,
    payoutNote: body.data.payoutNote
  })
  if (!updated) return c.json({ error: 'Could not save payout details.' }, 400)

  const dash = partnerDashboard(updated.id)
  return c.json({ ok: true, message: 'Payout details saved.', ...dash })
})
