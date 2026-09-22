/**
 * Manual / Wise payment orders.
 * No license keys — activate by email → user Claims/logs in on desktop.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BillingPlan } from './entitlement.js'
import { env } from './config.js'

export type ManualOrderStatus = 'awaiting_payment' | 'reported_paid' | 'activated' | 'canceled'

export interface ManualOrder {
  id: string
  ref: string
  email: string
  plan: Exclude<BillingPlan, 'free'>
  amountUsd: number
  currency: 'USD'
  status: ManualOrderStatus
  createdAt: number
  updatedAt: number
  reportedAt?: number
  activatedAt?: number
  activatedBy?: string
  note?: string
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

export function wisePayConfig() {
  return {
    enabled: ['1', 'true', 'yes'].includes(env('WISE_ENABLED', '1').trim().toLowerCase()),
    payLink: env('WISE_PAY_LINK').trim(),
    email: env('WISE_EMAIL', 'hello@kalfi.app').trim() || 'hello@kalfi.app',
    accountName: env('WISE_ACCOUNT_NAME', 'Kalfi').trim() || 'Kalfi',
    notifyEmail: env('WISE_NOTIFY_EMAIL', env('EMAIL_FROM', 'hello@kalfi.app'))
      .replace(/^.*<([^>]+)>.*$/, '$1')
      .trim() || 'hello@kalfi.app'
  }
}

export function createManualOrder(input: {
  email: string
  plan: Exclude<BillingPlan, 'free'>
}): ManualOrder {
  const db = read()
  const now = Date.now()
  const order: ManualOrder = {
    id: `mord_${now.toString(36)}_${randomBytes(3).toString('hex')}`,
    ref: makeRef(),
    email: input.email.trim().toLowerCase(),
    plan: input.plan,
    amountUsd: MANUAL_PLAN_PRICES_USD[input.plan],
    currency: 'USD',
    status: 'awaiting_payment',
    createdAt: now,
    updatedAt: now
  }
  db.orders.unshift(order)
  // keep last 2000
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
  const wise = wisePayConfig()
  return {
    ref: order.ref,
    amountUsd: order.amountUsd,
    currency: order.currency,
    plan: order.plan,
    email: order.email,
    wiseEmail: wise.email,
    accountName: wise.accountName,
    payLink: wise.payLink || null,
    steps: [
      `Send exactly $${order.amountUsd} USD via Wise.`,
      wise.payLink
        ? `Open the Wise payment link (or send to ${wise.email}).`
        : `Send to Wise email / tag: ${wise.email} (${wise.accountName}).`,
      `Put this payment reference in the Wise note/memo: ${order.ref}`,
      `Use the same email you verified (${order.email}).`,
      `After sending, tap “I’ve paid” — we activate within a few hours (often faster).`,
      `Then open the Kalfi app → Settings → Claim/Log in with that email (no license key).`
    ]
  }
}
