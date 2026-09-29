import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type BillingPlan,
  type SingleSessionState,
  type SubStatus,
  billingIntervalOf,
  canUseHostedAi,
  createUnusedSingleSession,
  evaluateSingleSession,
  featureTierOf,
  hasPaidLicense,
  normalizeLegacyPlan,
  startSingleSession,
  consumeSingleSession
} from './entitlement.js'
import { proTokenCap, trialDays, trialTokenCap } from './config.js'

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
  /** Hosted AI chat/STT calls this usageMonth */
  aiRequestCount?: number
  /** Last hosted AI request timestamp */
  lastAiAt?: number
  /**
   * Optional per-user monthly token cap. When unset, PRO_MONTHLY_TOKEN_SOFT_CAP applies.
   * Set to 0 to block hosted AI for this user without suspending the account.
   */
  tokenCapOverride?: number | null
  /**
   * Set while the account is on the free Hosted trial. Cleared on any paid activation.
   * After this time the user is read back as free/expired (see hydrateUser).
   */
  trialEndsAt?: number
  /** Permanent markers so a person gets one trial (per email and per device). */
  trialStartedAt?: number
  trialDeviceId?: string
  trialIp?: string
  trialTokensUsed?: number
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
  if (typeof raw.trialEndsAt === 'number' && Date.now() >= raw.trialEndsAt) {
    const subStatus = raw.subStatus === 'suspended' ? 'suspended' : 'expired'
    return { ...raw, plan: 'free', subStatus, singleSession }
  }
  return { ...raw, plan, singleSession }
}

export function isOnTrial(user: User): boolean {
  return typeof user.trialEndsAt === 'number'
}

export function isTrialActive(user: User): boolean {
  return typeof user.trialEndsAt === 'number' && Date.now() < user.trialEndsAt
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

export function currentMonthKey(): string {
  return monthKey()
}

/** Tokens counted against the user's cap: whole-trial total on trial, else this month. */
export function currentMonthTokens(user: User): number {
  if (isOnTrial(user)) return user.trialTokensUsed || 0
  return user.usageMonth === monthKey() ? user.tokensUsed || 0 : 0
}

export function currentMonthRequests(user: User): number {
  return user.usageMonth === monthKey() ? user.aiRequestCount || 0 : 0
}

/** Effective monthly soft cap for a user (override or global env). */
export function effectiveTokenCap(user: User): number {
  if (typeof user.tokenCapOverride === 'number' && Number.isFinite(user.tokenCapOverride)) {
    return Math.max(0, Math.floor(user.tokenCapOverride))
  }
  if (isOnTrial(user)) return trialTokenCap()
  return proTokenCap()
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
  const sameMonth = user.usageMonth === month
  const tokensUsed = sameMonth ? user.tokensUsed + tokens : tokens
  const patch: Partial<User> = { usageMonth: month, tokensUsed }
  if (isOnTrial(user)) patch.trialTokensUsed = (user.trialTokensUsed || 0) + tokens
  if (tokens > 0) {
    patch.aiRequestCount = sameMonth ? (user.aiRequestCount || 0) + 1 : 1
    patch.lastAiAt = Date.now()
  } else if (!sameMonth) {
    patch.aiRequestCount = 0
  }
  return updateUser(id, patch)
}

export function resetUsage(id: string): User | null {
  return updateUser(id, {
    usageMonth: monthKey(),
    tokensUsed: 0,
    aiRequestCount: 0
  })
}

export type TrialDenied = 'used' | 'paid' | 'device' | 'ip' | 'disabled' | 'email'

const TRIALS_PER_IP_PER_DAY = 3

export function trialEligibility(
  user: User,
  opts: { deviceId?: string; ip?: string }
): { ok: true } | { ok: false; reason: TrialDenied } {
  if (trialDays() <= 0 || trialTokenCap() <= 0) return { ok: false, reason: 'disabled' }
  if (user.trialStartedAt) return { ok: false, reason: 'used' }
  if (
    user.plan !== 'free' ||
    user.polarCustomerId ||
    user.polarOrderId ||
    user.lemonCustomerId ||
    user.lemonOrderId ||
    user.needsPasswordSetup
  ) {
    return { ok: false, reason: 'paid' }
  }
  const others = read().users.filter((u) => u.id !== user.id && u.trialStartedAt)
  if (opts.deviceId && others.some((u) => u.trialDeviceId === opts.deviceId)) {
    return { ok: false, reason: 'device' }
  }
  if (opts.ip) {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000
    const recent = others.filter((u) => u.trialIp === opts.ip && (u.trialStartedAt || 0) >= dayAgo)
    if (recent.length >= TRIALS_PER_IP_PER_DAY) return { ok: false, reason: 'ip' }
  }
  return { ok: true }
}

export function grantTrial(userId: string, opts: { deviceId?: string; ip?: string }): User | null {
  const now = Date.now()
  return updateUser(userId, {
    plan: 'hosted_monthly',
    subStatus: 'active',
    trialStartedAt: now,
    trialEndsAt: now + trialDays() * 24 * 60 * 60 * 1000,
    trialDeviceId: opts.deviceId || undefined,
    trialIp: opts.ip || undefined,
    trialTokensUsed: 0
  })
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
    trialEndsAt: undefined,
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
  const tokensUsed = currentMonthTokens(user)
  const tokenCap = effectiveTokenCap(user)
  const aiRequestCount = currentMonthRequests(user)
  return {
    id: user.id,
    email: user.email,
    plan,
    featureTier,
    billingInterval: billingIntervalOf(plan),
    subStatus: user.subStatus,
    usageMonth: monthKey(),
    tokensUsed,
    aiRequestCount,
    lastAiAt: user.lastAiAt || null,
    tokenCap,
    tokenCapOverride:
      typeof user.tokenCapOverride === 'number' ? user.tokenCapOverride : null,
    tokensRemaining: Math.max(0, tokenCap - tokensUsed),
    usagePercent: tokenCap > 0 ? Math.min(100, Math.round((tokensUsed / tokenCap) * 100)) : 100,
    hostedAiEligible: canUseHostedAi(plan, user.subStatus, singleSession),
    singleSession: singleSession
      ? {
          status: singleSession.status,
          purchasedAt: singleSession.purchasedAt,
          expiresAt: singleSession.expiresAt,
          sessionStartedAt: singleSession.sessionStartedAt
        }
      : null,
    trial: isOnTrial(user)
      ? {
          active: isTrialActive(user),
          startedAt: user.trialStartedAt || null,
          endsAt: user.trialEndsAt!,
          tokenCap,
          tokensUsed
        }
      : null,
    trialUsed: Boolean(user.trialStartedAt),
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
  sort?: string
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
  const sort = opts?.sort || 'updated'
  if (sort === 'tokens') {
    users.sort((a, b) => currentMonthTokens(b) - currentMonthTokens(a))
  } else if (sort === 'lastAi') {
    users.sort((a, b) => (b.lastAiAt || 0) - (a.lastAiAt || 0))
  } else {
    users.sort((a, b) => b.updatedAt - a.updatedAt)
  }
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
    byStatus,
    usage: usageOverview(users)
  }
}

export function usageOverview(usersInput?: User[]) {
  const users = usersInput || read().users.map(hydrateUser)
  const month = monthKey()
  const globalCap = proTokenCap()
  let totalTokensThisMonth = 0
  let totalRequestsThisMonth = 0
  let hostedEligible = 0
  let usersWithUsage = 0
  let usersNearCap = 0
  let usersAtCap = 0
  let activeLast24h = 0
  let activeLast7d = 0
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000

  const ranked = users.map((u) => {
    const tokensUsed = currentMonthTokens(u)
    const aiRequestCount = currentMonthRequests(u)
    const tokenCap = effectiveTokenCap(u)
    const eligible = canUseHostedAi(u.plan, u.subStatus, u.singleSession)
    if (eligible) hostedEligible += 1
    totalTokensThisMonth += tokensUsed
    totalRequestsThisMonth += aiRequestCount
    if (tokensUsed > 0) usersWithUsage += 1
    const pct = tokenCap > 0 ? tokensUsed / tokenCap : tokensUsed > 0 ? 1 : 0
    if (pct >= 1) usersAtCap += 1
    else if (pct >= 0.8) usersNearCap += 1
    if (u.lastAiAt && u.lastAiAt >= dayAgo) activeLast24h += 1
    if (u.lastAiAt && u.lastAiAt >= weekAgo) activeLast7d += 1
    return {
      id: u.id,
      email: u.email,
      plan: normalizeLegacyPlan(u.plan),
      subStatus: u.subStatus,
      tokensUsed,
      aiRequestCount,
      tokenCap,
      usagePercent: tokenCap > 0 ? Math.min(100, Math.round((tokensUsed / tokenCap) * 100)) : 100,
      lastAiAt: u.lastAiAt || null,
      hostedAiEligible: eligible,
      suspended: Boolean(u.suspended) || u.subStatus === 'suspended'
    }
  })

  ranked.sort((a, b) => b.tokensUsed - a.tokensUsed)

  return {
    month,
    globalCap,
    totalTokensThisMonth,
    totalRequestsThisMonth,
    hostedEligible,
    usersWithUsage,
    usersNearCap,
    usersAtCap,
    activeLast24h,
    activeLast7d,
    topUsers: ranked.filter((u) => u.tokensUsed > 0 || u.hostedAiEligible).slice(0, 50)
  }
}

export function fingerprintKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}
