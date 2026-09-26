import { Hono } from 'hono'
import { z } from 'zod'
import { applyVoucherToPrice, normalizeCode } from '../lib/affiliates.js'
import { currencyPayload, refreshRates, type DisplayCurrency } from '../lib/currency.js'
import { MANUAL_PLAN_PRICES_USD } from '../lib/manual-orders.js'

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
