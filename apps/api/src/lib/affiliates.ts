/**
 * Affiliate + voucher codes.
 * One code can be both a referral attribution and a customer discount.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type AffiliateStatus = 'active' | 'paused' | 'archived'
export type VoucherType = 'percent' | 'fixed_usd'
export type CommissionStatus = 'pending' | 'owed' | 'paid' | 'void'
export type PayoutMethod = 'wise' | 'bank' | 'dana' | 'ovo' | 'qris' | 'duitnow'

export const PAYOUT_METHODS: { id: PayoutMethod; label: string; hint: string }[] = [
  { id: 'wise', label: 'Wise', hint: 'Wise email or tag' },
  { id: 'bank', label: 'Bank transfer', hint: 'Account number' },
  { id: 'dana', label: 'DANA', hint: 'Phone number linked to DANA' },
  { id: 'ovo', label: 'OVO', hint: 'Phone number linked to OVO' },
  { id: 'qris', label: 'QRIS', hint: 'Merchant name / phone / QR note' },
  { id: 'duitnow', label: 'QR DuitNow', hint: 'DuitNow ID / phone / QR note' }
]

export interface Affiliate {
  id: string
  name: string
  email: string
  country: string
  code: string
  /** Default customer discount % when using their code (overridable per voucher). */
  discountPercent: number
  /** Commission % of paid USD after discount. */
  commissionPercent: number
  status: AffiliateStatus
  /** How they want commission paid. */
  payoutMethod?: PayoutMethod
  /** Account / phone / Wise tag / QR identifier. */
  payoutAccount?: string
  /** Account holder name. */
  payoutAccountName?: string
  /** Bank name when payoutMethod === bank. */
  payoutBankName?: string
  payoutNote?: string
  createdAt: number
  updatedAt: number
}

export interface Voucher {
  id: string
  code: string
  type: VoucherType
  /** percent 1–100 or fixed USD amount */
  value: number
  affiliateId?: string
  active: boolean
  maxRedemptions?: number
  redemptions: number
  expiresAt?: number
  note?: string
  createdAt: number
  updatedAt: number
}

export interface AffiliateConversion {
  id: string
  affiliateId: string
  voucherCode: string
  orderId: string
  orderRef: string
  customerEmail: string
  plan: string
  grossUsd: number
  discountUsd: number
  paidUsd: number
  commissionUsd: number
  commissionStatus: CommissionStatus
  createdAt: number
  paidAt?: number
}

interface Db {
  affiliates: Affiliate[]
  vouchers: Voucher[]
  conversions: AffiliateConversion[]
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || join(__dirname, '../../data')
const dbPath = join(dataDir, 'affiliates.json')

function ensure(): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  if (!existsSync(dbPath)) {
    const seed = seedDefaults()
    writeFileSync(dbPath, JSON.stringify(seed, null, 2))
  }
}

function seedDefaults(): Db {
  const now = Date.now()
  const affiliates: Affiliate[] = [
    {
      id: 'aff_dinar',
      name: 'Dinar Lathifah',
      email: 'dinar.lala@gmail.com',
      country: 'ID',
      code: 'DINAR15',
      discountPercent: 15,
      commissionPercent: 20,
      status: 'active',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'aff_junar',
      name: 'Junar Asunyi',
      email: 'asunyi.junar@gmail.com',
      country: 'ID',
      code: 'JUNAR15',
      discountPercent: 15,
      commissionPercent: 20,
      status: 'active',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'aff_hani',
      name: 'Sharifah Hani Yasmin',
      email: 'sharifahhaniyasmin@gmail.com',
      country: 'MY',
      code: 'HANI15',
      discountPercent: 15,
      commissionPercent: 20,
      status: 'active',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'aff_cindi',
      name: 'Cindi Wirawan',
      email: 'cindi@cindiw.com',
      country: 'SG',
      code: 'CINDI15',
      discountPercent: 15,
      commissionPercent: 20,
      status: 'active',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'aff_kalfi',
      name: 'Kalfi Launch',
      email: 'hello@kalfi.app',
      country: 'GLOBAL',
      code: 'KALFI10',
      discountPercent: 10,
      commissionPercent: 0,
      status: 'active',
      payoutNote: 'House promo — no commission',
      createdAt: now,
      updatedAt: now
    }
  ]

  const vouchers: Voucher[] = affiliates.map((a) => ({
    id: `v_${a.code.toLowerCase()}`,
    code: a.code,
    type: 'percent' as const,
    value: a.discountPercent,
    affiliateId: a.id,
    active: true,
    redemptions: 0,
    createdAt: now,
    updatedAt: now
  }))

  return { affiliates, vouchers, conversions: [] }
}

function read(): Db {
  ensure()
  try {
    const db = JSON.parse(readFileSync(dbPath, 'utf8')) as Db
    db.affiliates = db.affiliates || []
    db.vouchers = db.vouchers || []
    db.conversions = db.conversions || []
    return db
  } catch {
    return seedDefaults()
  }
}

function write(db: Db): void {
  ensure()
  writeFileSync(dbPath, JSON.stringify(db, null, 2))
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '')
}

export function listAffiliates(): Affiliate[] {
  return read().affiliates
}

export function listVouchers(): Voucher[] {
  return read().vouchers
}

export function listConversions(limit = 100): AffiliateConversion[] {
  return read().conversions.slice(0, Math.min(200, limit))
}

export function findAffiliateByCode(code: string): Affiliate | null {
  const c = normalizeCode(code)
  return read().affiliates.find((a) => a.code === c) || null
}

export function findAffiliateByEmail(email: string): Affiliate | null {
  const e = email.trim().toLowerCase()
  return read().affiliates.find((a) => a.email === e) || null
}

export function listConversionsForAffiliate(
  affiliateId: string,
  limit = 100
): AffiliateConversion[] {
  return read()
    .conversions.filter((c) => c.affiliateId === affiliateId)
    .slice(0, Math.min(200, limit))
}

/** Mask PII for partner-facing views: di***@gmail.com */
export function maskEmail(email: string): string {
  const raw = email.trim().toLowerCase()
  const at = raw.indexOf('@')
  if (at < 1) return '***'
  const local = raw.slice(0, at)
  const domain = raw.slice(at + 1)
  const keep = Math.min(2, local.length)
  return `${local.slice(0, keep)}***@${domain}`
}

export function partnerDashboard(affiliateId: string) {
  const db = read()
  const aff = db.affiliates.find((a) => a.id === affiliateId)
  if (!aff) return null
  const conversions = db.conversions.filter((c) => c.affiliateId === affiliateId)
  const sales = conversions.length
  const paidUsd = conversions.reduce((s, c) => s + c.paidUsd, 0)
  const commissionOwed = conversions
    .filter((c) => c.commissionStatus === 'owed')
    .reduce((s, c) => s + c.commissionUsd, 0)
  const commissionPaid = conversions
    .filter((c) => c.commissionStatus === 'paid')
    .reduce((s, c) => s + c.commissionUsd, 0)
  return {
    affiliate: {
      id: aff.id,
      name: aff.name,
      email: aff.email,
      country: aff.country,
      code: aff.code,
      discountPercent: aff.discountPercent,
      commissionPercent: aff.commissionPercent,
      status: aff.status,
      link: `https://kalfi.app/?ref=${encodeURIComponent(aff.code)}#pricing`,
      payoutMethod: aff.payoutMethod || null,
      payoutAccount: aff.payoutAccount || null,
      payoutAccountName: aff.payoutAccountName || null,
      payoutBankName: aff.payoutBankName || null,
      payoutNote: aff.payoutNote || null
    },
    payoutMethods: PAYOUT_METHODS,
    stats: {
      sales,
      paidUsd: Math.round(paidUsd * 100) / 100,
      commissionOwedUsd: Math.round(commissionOwed * 100) / 100,
      commissionPaidUsd: Math.round(commissionPaid * 100) / 100,
      commissionTotalUsd: Math.round((commissionOwed + commissionPaid) * 100) / 100
    },
    conversions: conversions.slice(0, 100).map((c) => ({
      id: c.id,
      voucherCode: c.voucherCode,
      customer: maskEmail(c.customerEmail),
      plan: c.plan,
      paidUsd: c.paidUsd,
      discountUsd: c.discountUsd,
      commissionUsd: c.commissionUsd,
      commissionStatus: c.commissionStatus,
      createdAt: c.createdAt,
      paidAt: c.paidAt || null
    }))
  }
}

export function updatePartnerPayout(
  affiliateId: string,
  input: {
    payoutMethod: PayoutMethod
    payoutAccount: string
    payoutAccountName?: string
    payoutBankName?: string
    payoutNote?: string
  }
): Affiliate | null {
  const db = read()
  const idx = db.affiliates.findIndex((a) => a.id === affiliateId)
  if (idx < 0) return null
  const method = input.payoutMethod
  if (!PAYOUT_METHODS.some((m) => m.id === method)) return null
  const account = input.payoutAccount.trim()
  if (!account) return null

  db.affiliates[idx] = {
    ...db.affiliates[idx],
    payoutMethod: method,
    payoutAccount: account,
    payoutAccountName: (input.payoutAccountName || '').trim() || undefined,
    payoutBankName:
      method === 'bank' ? (input.payoutBankName || '').trim() || undefined : undefined,
    payoutNote: (input.payoutNote || '').trim() || undefined,
    updatedAt: Date.now()
  }
  write(db)
  return db.affiliates[idx]
}

export function findVoucher(code: string): Voucher | null {
  const c = normalizeCode(code)
  return read().vouchers.find((v) => v.code === c) || null
}

export function upsertAffiliate(
  input: Partial<Affiliate> & { name: string; email: string; code: string }
): Affiliate {
  const db = read()
  const code = normalizeCode(input.code)
  const now = Date.now()
  let aff = db.affiliates.find((a) => a.id === input.id || a.code === code)
  if (aff) {
    aff = {
      ...aff,
      ...input,
      code,
      email: input.email.trim().toLowerCase(),
      discountPercent: Number(input.discountPercent ?? aff.discountPercent),
      commissionPercent: Number(input.commissionPercent ?? aff.commissionPercent),
      updatedAt: now
    }
    const idx = db.affiliates.findIndex((a) => a.id === aff!.id)
    db.affiliates[idx] = aff
  } else {
    aff = {
      id: `aff_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`,
      name: input.name,
      email: input.email.trim().toLowerCase(),
      country: (input.country || 'GLOBAL').toUpperCase(),
      code,
      discountPercent: Number(input.discountPercent ?? 15),
      commissionPercent: Number(input.commissionPercent ?? 20),
      status: input.status || 'active',
      payoutNote: input.payoutNote,
      createdAt: now,
      updatedAt: now
    }
    db.affiliates.unshift(aff)
  }

  // Ensure matching voucher exists / stays in sync
  let voucher = db.vouchers.find((v) => v.code === code)
  if (!voucher) {
    voucher = {
      id: `v_${code.toLowerCase()}`,
      code,
      type: 'percent',
      value: aff.discountPercent,
      affiliateId: aff.id,
      active: aff.status === 'active',
      redemptions: 0,
      createdAt: now,
      updatedAt: now
    }
    db.vouchers.unshift(voucher)
  } else {
    voucher.affiliateId = aff.id
    voucher.value = aff.discountPercent
    voucher.active = aff.status === 'active'
    voucher.updatedAt = now
  }

  write(db)
  return aff
}

export function upsertVoucher(
  input: Partial<Voucher> & { code: string; type: VoucherType; value: number }
): Voucher {
  const db = read()
  const code = normalizeCode(input.code)
  const now = Date.now()
  let v = db.vouchers.find((x) => x.id === input.id || x.code === code)
  if (v) {
    v = {
      ...v,
      ...input,
      code,
      value: Number(input.value),
      updatedAt: now
    }
    const idx = db.vouchers.findIndex((x) => x.id === v!.id)
    db.vouchers[idx] = v
  } else {
    v = {
      id: `v_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`,
      code,
      type: input.type,
      value: Number(input.value),
      affiliateId: input.affiliateId,
      active: input.active !== false,
      maxRedemptions: input.maxRedemptions,
      redemptions: 0,
      expiresAt: input.expiresAt,
      note: input.note,
      createdAt: now,
      updatedAt: now
    }
    db.vouchers.unshift(v)
  }
  write(db)
  return v
}

export function applyVoucherToPrice(
  amountUsd: number,
  code: string
): {
  ok: true
  code: string
  discountUsd: number
  finalUsd: number
  percentOff?: number
  affiliateId?: string
  affiliateName?: string
  message: string
} | { ok: false; error: string } {
  const voucher = findVoucher(code)
  if (!voucher || !voucher.active) return { ok: false, error: 'Invalid or inactive code.' }
  if (voucher.expiresAt && voucher.expiresAt < Date.now()) {
    return { ok: false, error: 'This code has expired.' }
  }
  if (
    voucher.maxRedemptions != null &&
    voucher.redemptions >= voucher.maxRedemptions
  ) {
    return { ok: false, error: 'This code has reached its redemption limit.' }
  }

  const db = read()
  const affiliate = voucher.affiliateId
    ? db.affiliates.find((a) => a.id === voucher.affiliateId)
    : findAffiliateByCode(voucher.code)

  if (affiliate && affiliate.status !== 'active') {
    return { ok: false, error: 'This partner code is paused.' }
  }

  let discountUsd = 0
  let percentOff: number | undefined
  if (voucher.type === 'percent') {
    percentOff = Math.min(90, Math.max(0, voucher.value))
    discountUsd = Math.round(amountUsd * (percentOff / 100) * 100) / 100
  } else {
    discountUsd = Math.min(amountUsd, Math.max(0, voucher.value))
  }
  const finalUsd = Math.max(1, Math.round((amountUsd - discountUsd) * 100) / 100)
  discountUsd = Math.round((amountUsd - finalUsd) * 100) / 100

  return {
    ok: true,
    code: voucher.code,
    discountUsd,
    finalUsd,
    percentOff,
    affiliateId: affiliate?.id || voucher.affiliateId,
    affiliateName: affiliate?.name,
    message: percentOff
      ? `${percentOff}% off with ${voucher.code}`
      : `$${discountUsd} off with ${voucher.code}`
  }
}

export function recordConversion(input: {
  orderId: string
  orderRef: string
  customerEmail: string
  plan: string
  grossUsd: number
  discountUsd: number
  paidUsd: number
  voucherCode: string
  affiliateId?: string
}): AffiliateConversion | null {
  const db = read()
  const code = normalizeCode(input.voucherCode)
  const voucher = db.vouchers.find((v) => v.code === code)
  if (voucher) {
    voucher.redemptions += 1
    voucher.updatedAt = Date.now()
  }
  const affiliate =
    (input.affiliateId && db.affiliates.find((a) => a.id === input.affiliateId)) ||
    db.affiliates.find((a) => a.code === code) ||
    null

  const commissionPercent = affiliate?.commissionPercent || 0
  const commissionUsd =
    Math.round(input.paidUsd * (commissionPercent / 100) * 100) / 100

  const conversion: AffiliateConversion = {
    id: `conv_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`,
    affiliateId: affiliate?.id || 'none',
    voucherCode: code,
    orderId: input.orderId,
    orderRef: input.orderRef,
    customerEmail: input.customerEmail,
    plan: input.plan,
    grossUsd: input.grossUsd,
    discountUsd: input.discountUsd,
    paidUsd: input.paidUsd,
    commissionUsd,
    commissionStatus: commissionUsd > 0 ? 'owed' : 'void',
    createdAt: Date.now()
  }
  db.conversions.unshift(conversion)
  db.conversions = db.conversions.slice(0, 5000)
  write(db)
  return conversion
}

export function markCommissionPaid(conversionId: string): AffiliateConversion | null {
  const db = read()
  const idx = db.conversions.findIndex((c) => c.id === conversionId)
  if (idx < 0) return null
  db.conversions[idx] = {
    ...db.conversions[idx],
    commissionStatus: 'paid',
    paidAt: Date.now()
  }
  write(db)
  return db.conversions[idx]
}

export function affiliateStats() {
  const db = read()
  const owed = db.conversions
    .filter((c) => c.commissionStatus === 'owed')
    .reduce((s, c) => s + c.commissionUsd, 0)
  const paid = db.conversions
    .filter((c) => c.commissionStatus === 'paid')
    .reduce((s, c) => s + c.commissionUsd, 0)
  return {
    affiliates: db.affiliates.length,
    activeAffiliates: db.affiliates.filter((a) => a.status === 'active').length,
    vouchers: db.vouchers.length,
    conversions: db.conversions.length,
    commissionOwedUsd: Math.round(owed * 100) / 100,
    commissionPaidUsd: Math.round(paid * 100) / 100
  }
}
