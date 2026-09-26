/**
 * Manual payment orders (Wise + local rails).
 * No license keys — activate by email → user Claims/logs in on desktop.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BillingPlan } from './entitlement.js'
import { env } from './config.js'
import { getRatesPerUsd, type DisplayCurrency } from './currency.js'

export type ManualOrderStatus = 'awaiting_payment' | 'reported_paid' | 'activated' | 'canceled'
export type CheckoutPayMethod = 'wise' | 'bank' | 'dana' | 'ovo' | 'qris' | 'duitnow'

export interface ManualOrder {
  id: string
  ref: string
  email: string
  plan: Exclude<BillingPlan, 'free'>
  /** List price before voucher. */
  listUsd: number
  amountUsd: number
  discountUsd?: number
  voucherCode?: string
  affiliateId?: string
  currency: 'USD'
  /** Display / settlement hint for local rails. */
  displayCurrency?: string
  payMethod?: CheckoutPayMethod
  /** Local amount to send (IDR/MYR/etc.) when not paying USD. */
  amountLocal?: number
  localCurrency?: string
  status: ManualOrderStatus
  createdAt: number
  updatedAt: number
  reportedAt?: number
  activatedAt?: number
  activatedBy?: string
  note?: string
}

export interface PayMethodPublic {
  id: CheckoutPayMethod
  label: string
  currency: DisplayCurrency | 'USD'
  hint: string
  enabled: boolean
}

interface OrdersFile {
  orders: ManualOrder[]
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || join(__dirname, '../../data')
const ordersPath = join(dataDir, 'manual-orders.json')

export const MANUAL_PLAN_PRICES_USD: Record<Exclude<BillingPlan, 'free'>, number> = {
  byok_monthly: 14,
  byok_annual: 120,
  hosted_monthly: 19,
  hosted_annual: 180,
  team: 49,
  single_session: 9
}

const METHOD_META: Record<
  CheckoutPayMethod,
  { label: string; defaultCurrency: DisplayCurrency; hint: string }
> = {
  wise: { label: 'Wise', defaultCurrency: 'USD', hint: 'Pay in USD internationally' },
  bank: { label: 'Bank transfer', defaultCurrency: 'IDR', hint: 'Transfer to our bank account' },
  dana: { label: 'DANA', defaultCurrency: 'IDR', hint: 'Pay via DANA e-wallet' },
  ovo: { label: 'OVO', defaultCurrency: 'IDR', hint: 'Pay via OVO e-wallet' },
  qris: { label: 'QRIS', defaultCurrency: 'IDR', hint: 'Scan QRIS to pay' },
  duitnow: { label: 'QR DuitNow', defaultCurrency: 'MYR', hint: 'Pay via DuitNow (MY)' }
}

function ensure(): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  if (!existsSync(ordersPath)) {
    writeFileSync(ordersPath, JSON.stringify({ orders: [] } satisfies OrdersFile, null, 2))
  }
}

function read(): OrdersFile {
  ensure()
  try {
    return JSON.parse(readFileSync(ordersPath, 'utf8')) as OrdersFile
  } catch {
    return { orders: [] }
  }
}

function write(db: OrdersFile): void {
  ensure()
  writeFileSync(ordersPath, JSON.stringify(db, null, 2))
}

function makeRef(): string {
  return `KALFI-${randomBytes(3).toString('hex').toUpperCase()}`
}

function flagOn(key: string, fallback = '0'): boolean {
  return ['1', 'true', 'yes'].includes(env(key, fallback).trim().toLowerCase())
}

export function wisePayConfig() {
  return {
    enabled: flagOn('WISE_ENABLED', '1'),
    payLink: env('WISE_PAY_LINK').trim(),
    email: env('WISE_EMAIL', 'hello@kalfi.app').trim() || 'hello@kalfi.app',
    accountName: env('WISE_ACCOUNT_NAME', 'Kalfi').trim() || 'Kalfi',
    notifyEmail: env('WISE_NOTIFY_EMAIL', env('EMAIL_FROM', 'hello@kalfi.app'))
      .replace(/^.*<([^>]+)>.*$/, '$1')
      .trim() || 'hello@kalfi.app'
  }
}

/** Merchant receiving details for each checkout rail. */
export function merchantPayConfig() {
  const wise = wisePayConfig()
  return {
    notifyEmail: wise.notifyEmail,
    wise: {
      enabled: wise.enabled,
      email: wise.email,
      accountName: wise.accountName,
      payLink: wise.payLink || null
    },
    bank: {
      enabled: flagOn('PAY_BANK_ENABLED') && Boolean(env('PAY_BANK_ACCOUNT').trim()),
      bankName: env('PAY_BANK_NAME').trim(),
      account: env('PAY_BANK_ACCOUNT').trim(),
      accountName: env('PAY_BANK_ACCOUNT_NAME', 'Kalfi').trim() || 'Kalfi'
    },
    dana: {
      enabled: flagOn('PAY_DANA_ENABLED') && Boolean(env('PAY_DANA_PHONE').trim()),
      phone: env('PAY_DANA_PHONE').trim(),
      accountName: env('PAY_DANA_NAME', 'Kalfi').trim() || 'Kalfi'
    },
    ovo: {
      enabled: flagOn('PAY_OVO_ENABLED') && Boolean(env('PAY_OVO_PHONE').trim()),
      phone: env('PAY_OVO_PHONE').trim(),
      accountName: env('PAY_OVO_NAME', 'Kalfi').trim() || 'Kalfi'
    },
    qris: {
      enabled:
        flagOn('PAY_QRIS_ENABLED') &&
        Boolean(env('PAY_QRIS_NOTE').trim() || env('PAY_QRIS_IMAGE_URL').trim()),
      note: env('PAY_QRIS_NOTE').trim(),
      imageUrl: env('PAY_QRIS_IMAGE_URL').trim() || null,
      accountName: env('PAY_QRIS_NAME', 'Kalfi').trim() || 'Kalfi'
    },
    duitnow: {
      enabled:
        flagOn('PAY_DUITNOW_ENABLED') &&
        Boolean(
          env('PAY_DUITNOW_ID').trim() ||
            env('PAY_DUITNOW_IMAGE_URL').trim() ||
            env('PAY_DUITNOW_IMAGE_URL_2').trim()
        ),
      id: env('PAY_DUITNOW_ID').trim() || 'Malaysia National QR (DuitNow)',
      accountName: env('PAY_DUITNOW_NAME', 'Kalfi').trim() || 'Kalfi',
      imageUrl: env('PAY_DUITNOW_IMAGE_URL').trim() || null,
      imageUrl2: env('PAY_DUITNOW_IMAGE_URL_2').trim() || null
    }
  }
}

export function listCheckoutPayMethods(): PayMethodPublic[] {
  const m = merchantPayConfig()
  const enabled: Record<CheckoutPayMethod, boolean> = {
    wise: m.wise.enabled,
    bank: m.bank.enabled,
    dana: m.dana.enabled,
    ovo: m.ovo.enabled,
    qris: m.qris.enabled,
    duitnow: m.duitnow.enabled
  }
  return (Object.keys(METHOD_META) as CheckoutPayMethod[])
    .filter((id) => enabled[id])
    .map((id) => ({
      id,
      label: METHOD_META[id].label,
      currency: METHOD_META[id].defaultCurrency,
      hint: METHOD_META[id].hint,
      enabled: true
    }))
}

export function isCheckoutPayMethod(v: string): v is CheckoutPayMethod {
  return v in METHOD_META
}

export function localAmountFor(amountUsd: number, currency: DisplayCurrency | 'USD'): number {
  if (currency === 'USD') return Math.round(amountUsd * 100) / 100
  const rate = getRatesPerUsd()[currency as DisplayCurrency] || 1
  const local = amountUsd * rate
  if (currency === 'IDR') return Math.round(local / 100) * 100 // nearest Rp100
  if (currency === 'VND' || currency === 'JPY') return Math.round(local)
  return Math.round(local * 100) / 100
}

export function formatLocalAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'IDR' || currency === 'VND' || currency === 'JPY' ? 0 : 2
    }).format(amount)
  } catch {
    return `${currency} ${amount}`
  }
}

export function createManualOrder(input: {
  email: string
  plan: Exclude<BillingPlan, 'free'>
  amountUsd?: number
  listUsd?: number
  discountUsd?: number
  voucherCode?: string
  affiliateId?: string
  displayCurrency?: string
  payMethod?: CheckoutPayMethod
}): ManualOrder {
  const db = read()
  const now = Date.now()
  const listUsd = input.listUsd ?? MANUAL_PLAN_PRICES_USD[input.plan]
  const amountUsd =
    input.amountUsd != null && Number.isFinite(input.amountUsd)
      ? Math.max(1, Math.round(input.amountUsd * 100) / 100)
      : listUsd
  const payMethod = input.payMethod || 'wise'
  const localCurrency = METHOD_META[payMethod].defaultCurrency
  const amountLocal = localAmountFor(amountUsd, localCurrency)
  const order: ManualOrder = {
    id: `mord_${now.toString(36)}_${randomBytes(3).toString('hex')}`,
    ref: makeRef(),
    email: input.email.trim().toLowerCase(),
    plan: input.plan,
    listUsd,
    amountUsd,
    discountUsd: input.discountUsd || 0,
    voucherCode: input.voucherCode,
    affiliateId: input.affiliateId,
    currency: 'USD',
    displayCurrency: input.displayCurrency || localCurrency,
    payMethod,
    amountLocal,
    localCurrency,
    status: 'awaiting_payment',
    createdAt: now,
    updatedAt: now
  }
  db.orders.unshift(order)
  db.orders = db.orders.slice(0, 2000)
  write(db)
  return order
}

export function findManualOrder(idOrRef: string): ManualOrder | null {
  const q = idOrRef.trim()
  const db = read()
  return db.orders.find((o) => o.id === q || o.ref === q.toUpperCase() || o.ref === q) || null
}

export function updateManualOrder(
  id: string,
  patch: Partial<ManualOrder>
): ManualOrder | null {
  const db = read()
  const idx = db.orders.findIndex((o) => o.id === id)
  if (idx < 0) return null
  db.orders[idx] = { ...db.orders[idx], ...patch, updatedAt: Date.now() }
  write(db)
  return db.orders[idx]
}

export function listManualOrders(opts?: {
  status?: string
  limit?: number
}): ManualOrder[] {
  let orders = read().orders
  if (opts?.status && opts.status !== 'all') {
    orders = orders.filter((o) => o.status === opts.status)
  }
  const limit = Math.min(200, Math.max(1, opts?.limit || 50))
  return orders.slice(0, limit)
}

export function paymentInstructionsFor(order: ManualOrder) {
  const m = merchantPayConfig()
  const method = order.payMethod || 'wise'
  const meta = METHOD_META[method]
  const localCurrency = order.localCurrency || meta.defaultCurrency
  const amountLocal =
    order.amountLocal != null
      ? order.amountLocal
      : localAmountFor(order.amountUsd, localCurrency as DisplayCurrency)
  const amountLabel =
    localCurrency === 'USD'
      ? `$${order.amountUsd} USD`
      : `${formatLocalAmount(amountLocal, localCurrency)} (≈ $${order.amountUsd} USD)`

  const discountLine =
    order.discountUsd && order.discountUsd > 0 && order.voucherCode
      ? `Voucher ${order.voucherCode}: −$${order.discountUsd} (was $${order.listUsd || order.amountUsd + order.discountUsd}).`
      : null

  let destination = ''
  let destinationLines: string[] = []
  let payLink: string | null = null
  let qrImageUrl: string | null = null
  let qrImageUrls: string[] = []

  if (method === 'wise') {
    destination = m.wise.email
    payLink = m.wise.payLink
    destinationLines = [
      `Send exactly $${order.amountUsd} USD via Wise.`,
      m.wise.payLink
        ? `Open the Wise payment link (or send to ${m.wise.email} / ${m.wise.accountName}).`
        : `Send to Wise: ${m.wise.email} or tag ${m.wise.accountName}.`
    ]
  } else if (method === 'bank') {
    destination = m.bank.account
    destinationLines = [
      `Transfer exactly ${formatLocalAmount(amountLocal, localCurrency)} via bank.`,
      `Bank: ${m.bank.bankName}`,
      `Account: ${m.bank.account} · ${m.bank.accountName}`
    ]
  } else if (method === 'dana') {
    destination = m.dana.phone
    destinationLines = [
      `Send exactly ${formatLocalAmount(amountLocal, localCurrency)} via DANA.`,
      `DANA number: ${m.dana.phone} (${m.dana.accountName})`
    ]
  } else if (method === 'ovo') {
    destination = m.ovo.phone
    destinationLines = [
      `Send exactly ${formatLocalAmount(amountLocal, localCurrency)} via OVO.`,
      `OVO number: ${m.ovo.phone} (${m.ovo.accountName})`
    ]
  } else if (method === 'qris') {
    destination = m.qris.note || m.qris.accountName
    qrImageUrl = m.qris.imageUrl
    if (m.qris.imageUrl) qrImageUrls = [m.qris.imageUrl]
    destinationLines = [
      `Pay exactly ${formatLocalAmount(amountLocal, localCurrency)} via QRIS.`,
      m.qris.note || `Pay to ${m.qris.accountName}`,
      ...(m.qris.imageUrl ? ['Scan the QRIS image on the payment screen.'] : [])
    ]
  } else {
    destination = m.duitnow.id
    qrImageUrl = m.duitnow.imageUrl
    qrImageUrls = [m.duitnow.imageUrl, m.duitnow.imageUrl2].filter(Boolean) as string[]
    destinationLines = [
      `Pay exactly ${formatLocalAmount(amountLocal, localCurrency)} via QR DuitNow (Malaysia National QR).`,
      `Recipient: ${m.duitnow.accountName}`,
      m.duitnow.id ? `Note: ${m.duitnow.id}` : 'Scan Bank Islam or Touch ’n Go QR below.',
      ...(qrImageUrls.length ? ['Scan either QR with any Malaysian banking / eWallet app.'] : [])
    ]
  }

  const steps = [
    ...destinationLines,
    ...(discountLine ? [discountLine] : []),
    `Put this payment reference in the note/memo: ${order.ref}`,
    `Use the same email you verified (${order.email}).`,
    `After sending, tap “I’ve paid” — we activate within a few hours (often faster).`,
    `Then open the Kalfi app → Settings → Claim/Log in with that email (no license key).`
  ]

  return {
    ref: order.ref,
    amountUsd: order.amountUsd,
    amountLocal,
    amountLabel,
    listUsd: order.listUsd || order.amountUsd,
    discountUsd: order.discountUsd || 0,
    voucherCode: order.voucherCode || null,
    currency: order.currency,
    localCurrency,
    displayCurrency: order.displayCurrency || localCurrency,
    payMethod: method,
    payMethodLabel: meta.label,
    destination,
    plan: order.plan,
    email: order.email,
    wiseEmail: m.wise.email,
    accountName:
      method === 'wise'
        ? m.wise.accountName
        : method === 'bank'
          ? m.bank.accountName
          : method === 'dana'
            ? m.dana.accountName
            : method === 'ovo'
              ? m.ovo.accountName
              : method === 'qris'
                ? m.qris.accountName
                : m.duitnow.accountName,
    bankName: method === 'bank' ? m.bank.bankName : null,
    payLink,
    qrImageUrl,
    qrImageUrls,
    steps
  }
}
