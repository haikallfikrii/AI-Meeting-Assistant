import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type BillingPlan,
  type SingleSessionState,
  type SubStatus,
  billingIntervalOf,
  createUnusedSingleSession,
  evaluateSingleSession,
  featureTierOf,
  hasPaidLicense,
  normalizeLegacyPlan,
  startSingleSession,
  consumeSingleSession
} from './entitlement.js'

export type { BillingPlan, SubStatus, SingleSessionState }
export type Plan = BillingPlan

export interface User {
  id: string
  email: string
  passwordHash: string
  plan: BillingPlan
  subStatus: SubStatus
  /** @deprecated prefer lemonCustomerId */
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  lemonCustomerId?: string
  lemonSubscriptionId?: string
  lemonOrderId?: string
  lemonVariantId?: string
  /** Polar MoR identifiers */
  polarCustomerId?: string
  polarSubscriptionId?: string
  polarOrderId?: string
  polarProductId?: string
  /** Optional Polar License Key benefit (audit / support — not the sole entitlement gate) */
  polarLicenseKey?: string
  singleSession?: SingleSessionState
  /** True when account was auto-created from checkout — user must set a password */
  needsPasswordSetup?: boolean
  /** Admin note / internal label */
  adminNote?: string
  /** Soft-delete / suspend flag (also mirrored in subStatus when suspended) */
  suspended?: boolean
  usageMonth: string
  tokensUsed: number
  createdAt: number
  updatedAt: number
}

interface DbFile {
  users: User[]
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || join(__dirname, '../../data')
const dbPath = join(dataDir, 'db.json')

function ensure(): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  if (!existsSync(dbPath)) {
    writeFileSync(dbPath, JSON.stringify({ users: [] } satisfies DbFile, null, 2))
  }
}

function read(): DbFile {
  ensure()
  return JSON.parse(readFileSync(dbPath, 'utf8')) as DbFile
}

function write(db: DbFile): void {
  ensure()
  writeFileSync(dbPath, JSON.stringify(db, null, 2))
}

function hydrateUser(raw: User): User {
  const plan = normalizeLegacyPlan(raw.plan as string)
  let singleSession = raw.singleSession
  if (singleSession) {
    singleSession = evaluateSingleSession(singleSession)
  }
  return { ...raw, plan, singleSession }
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const next = scryptSync(password, salt, 64)
  const prev = Buffer.from(hash, 'hex')
  return prev.length === next.length && timingSafeEqual(next, prev)
}

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`
}

function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function findUserByEmail(email: string): User | null {
  const normalized = email.trim().toLowerCase()
  const raw = read().users.find((u) => u.email === normalized)
  return raw ? hydrateUser(raw) : null
}

export function findUserById(id: string): User | null {
  const raw = read().users.find((u) => u.id === id)
  return raw ? hydrateUser(raw) : null
}

export function findUserByStripeCustomer(customerId: string): User | null {
  const raw = read().users.find((u) => u.stripeCustomerId === customerId)
  return raw ? hydrateUser(raw) : null
}

export function findUserByLemonCustomer(customerId: string): User | null {
  const raw = read().users.find((u) => u.lemonCustomerId === customerId)
  return raw ? hydrateUser(raw) : null
}

export function findUserByLemonSubscription(subscriptionId: string): User | null {
  const raw = read().users.find((u) => u.lemonSubscriptionId === subscriptionId)
  return raw ? hydrateUser(raw) : null
}

export function findUserByPolarCustomer(customerId: string): User | null {
  const raw = read().users.find((u) => u.polarCustomerId === customerId)
  return raw ? hydrateUser(raw) : null
}

export function findUserByPolarSubscription(subscriptionId: string): User | null {
  const raw = read().users.find((u) => u.polarSubscriptionId === subscriptionId)
  return raw ? hydrateUser(raw) : null
}

export function createUser(
  email: string,
  password: string,
  options?: { needsPasswordSetup?: boolean }
): User {
  const db = read()
  const normalized = email.trim().toLowerCase()
  if (db.users.some((u) => u.email === normalized)) {
    throw new Error('Email already registered')
  }
  const now = Date.now()
  const user: User = {
    id: createId('usr'),
    email: normalized,
    passwordHash: hashPassword(password),
    plan: 'free',
    subStatus: 'none',
    needsPasswordSetup: Boolean(options?.needsPasswordSetup),
    usageMonth: monthKey(),
    tokensUsed: 0,
    createdAt: now,
    updatedAt: now
  }
  db.users.push(user)
  write(db)
  return user
}

export function setUserPassword(id: string, password: string): User | null {
  return updateUser(id, {
    passwordHash: hashPassword(password),
    needsPasswordSetup: false
  })
}

export function updateUser(id: string, patch: Partial<User>): User | null {
  const db = read()
  const idx = db.users.findIndex((u) => u.id === id)
  if (idx < 0) return null
  db.users[idx] = { ...db.users[idx], ...patch, updatedAt: Date.now() }
  write(db)
  return hydrateUser(db.users[idx])
}

export function bumpUsage(id: string, tokens: number): User | null {
  const user = findUserById(id)
  if (!user) return null
  const month = monthKey()
  const tokensUsed = user.usageMonth === month ? user.tokensUsed + tokens : tokens
  return updateUser(id, { usageMonth: month, tokensUsed })
}

export function grantSingleSessionPass(
  userId: string,
  orderRef?:
    | string
    | {
        lemonOrderId?: string
        polarOrderId?: string
        purchasedAt?: number
      }
): User | null {
  const lemonOrderId = typeof orderRef === 'string' ? orderRef : orderRef?.lemonOrderId
  const polarOrderId = typeof orderRef === 'object' ? orderRef?.polarOrderId : undefined
  const purchasedAt =
    typeof orderRef === 'object' && orderRef?.purchasedAt ? orderRef.purchasedAt : Date.now()

  return updateUser(userId, {
    plan: 'single_session',
    subStatus: 'active',
    lemonOrderId: lemonOrderId || undefined,
    polarOrderId: polarOrderId || undefined,
    singleSession: createUnusedSingleSession(purchasedAt, {
      lemonOrderId,
      polarOrderId
    })
  })
}

export function beginSingleSession(userId: string): {
  ok: boolean
  reason?: string
  user: User | null
} {
  const user = findUserById(userId)
  if (!user?.singleSession) {
    return { ok: false, reason: 'No Single Session Pass on this account', user }
  }
  const result = startSingleSession(user.singleSession)
  const next = updateUser(userId, {
    singleSession: result.state,
    subStatus: result.state.status === 'expired' ? 'expired' : user.subStatus
  })
  return { ok: result.ok, reason: result.ok ? undefined : result.reason, user: next }
}

export function endSingleSession(userId: string): User | null {
  const user = findUserById(userId)
  if (!user?.singleSession) return user
  const next = consumeSingleSession(user.singleSession)
  return updateUser(userId, {
    singleSession: next,
    subStatus: next.status === 'consumed' || next.status === 'expired' ? 'expired' : user.subStatus,
    plan: next.status === 'consumed' || next.status === 'expired' ? 'free' : user.plan
  })
}

export function publicUser(user: User) {
  const singleSession = user.singleSession
    ? evaluateSingleSession(user.singleSession)
    : undefined
  const plan = normalizeLegacyPlan(user.plan)
  const featureTier = featureTierOf(plan)
  const paid = hasPaidLicense(plan, user.subStatus, singleSession)
  return {
    id: user.id,
    email: user.email,
    plan,
    featureTier,
    billingInterval: billingIntervalOf(plan),
    subStatus: user.subStatus,
    usageMonth: user.usageMonth,
    tokensUsed: user.tokensUsed,
    singleSession: singleSession
      ? {
          status: singleSession.status,
          purchasedAt: singleSession.purchasedAt,
          expiresAt: singleSession.expiresAt,
          sessionStartedAt: singleSession.sessionStartedAt
        }
      : null,
    needsPasswordSetup: Boolean(user.needsPasswordSetup),
    suspended: Boolean(user.suspended) || user.subStatus === 'suspended',
    adminNote: user.adminNote || '',
    lemonCustomerId: user.lemonCustomerId || null,
    lemonSubscriptionId: user.lemonSubscriptionId || null,
    lemonOrderId: user.lemonOrderId || null,
    polarCustomerId: user.polarCustomerId || null,
    polarSubscriptionId: user.polarSubscriptionId || null,
    polarOrderId: user.polarOrderId || null,
    hasPolarLicenseKey: Boolean(user.polarLicenseKey),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    /** @deprecated use featureTier + subStatus */
    proActive: paid && (featureTier === 'hosted' || featureTier === 'team'),
    paidActive: paid
  }
}

export function listUsers(opts?: {
  q?: string
  plan?: string
  status?: string
  limit?: number
  offset?: number
}): { users: User[]; total: number } {
  let users = read().users.map(hydrateUser)
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    users = users.filter(
      (u) =>
        u.email.includes(q) ||
        u.id.includes(q) ||
        (u.lemonCustomerId || '').includes(q) ||
        (u.lemonOrderId || '').includes(q) ||
        (u.polarCustomerId || '').includes(q) ||
        (u.polarOrderId || '').includes(q)
    )
  }
  if (opts?.plan && opts.plan !== 'all') {
    users = users.filter((u) => normalizeLegacyPlan(u.plan) === opts.plan)
  }
  if (opts?.status && opts.status !== 'all') {
    if (opts.status === 'suspended') {
      users = users.filter((u) => u.suspended || u.subStatus === 'suspended')
    } else {
      users = users.filter((u) => u.subStatus === opts.status)
    }
  }
  users.sort((a, b) => b.updatedAt - a.updatedAt)
  const total = users.length
  const offset = Math.max(0, opts?.offset || 0)
  const limit = Math.min(200, Math.max(1, opts?.limit || 50))
  return { users: users.slice(offset, offset + limit), total }
}

export function deleteUser(id: string): boolean {
  const db = read()
  const before = db.users.length
  db.users = db.users.filter((u) => u.id !== id)
  if (db.users.length === before) return false
  write(db)
  return true
}

export function adminOverview() {
  const users = read().users.map(hydrateUser)
  const now = Date.now()
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000
  const byPlan: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  let paidActive = 0
  let suspended = 0
  let lemonLinked = 0
  let polarLinked = 0
  let needsPassword = 0
  let newThisWeek = 0

  for (const u of users) {
    const plan = normalizeLegacyPlan(u.plan)
    byPlan[plan] = (byPlan[plan] || 0) + 1
    byStatus[u.subStatus] = (byStatus[u.subStatus] || 0) + 1
    if (hasPaidLicense(plan, u.subStatus, u.singleSession)) paidActive += 1
    if (u.suspended || u.subStatus === 'suspended') suspended += 1
    if (u.lemonCustomerId || u.lemonSubscriptionId || u.lemonOrderId) lemonLinked += 1
    if (u.polarCustomerId || u.polarSubscriptionId || u.polarOrderId) polarLinked += 1
    if (u.needsPasswordSetup) needsPassword += 1
    if (u.createdAt >= weekAgo) newThisWeek += 1
  }

  return {
    totalUsers: users.length,
    paidActive,
    suspended,
    lemonLinked,
    polarLinked,
    needsPassword,
    newThisWeek,
    byPlan,
    byStatus
  }
}

export function fingerprintKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}
