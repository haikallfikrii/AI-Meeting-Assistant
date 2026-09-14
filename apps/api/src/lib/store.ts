import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Plan = 'free' | 'pro'
export type SubStatus = 'none' | 'active' | 'past_due' | 'canceled'

export interface User {
  id: string
  email: string
  passwordHash: string
  plan: Plan
  subStatus: SubStatus
  stripeCustomerId?: string
  stripeSubscriptionId?: string
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
  return prev.length === next.length && timingSafeEqual(prev, next)
}

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`
}

function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function findUserByEmail(email: string): User | null {
  const normalized = email.trim().toLowerCase()
  return read().users.find((u) => u.email === normalized) || null
}

export function findUserById(id: string): User | null {
  return read().users.find((u) => u.id === id) || null
}

export function findUserByStripeCustomer(customerId: string): User | null {
  return read().users.find((u) => u.stripeCustomerId === customerId) || null
}

export function createUser(email: string, password: string): User {
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
    usageMonth: monthKey(),
    tokensUsed: 0,
    createdAt: now,
    updatedAt: now
  }
  db.users.push(user)
  write(db)
  return user
}

export function updateUser(id: string, patch: Partial<User>): User | null {
  const db = read()
  const idx = db.users.findIndex((u) => u.id === id)
  if (idx < 0) return null
  db.users[idx] = { ...db.users[idx], ...patch, updatedAt: Date.now() }
  write(db)
  return db.users[idx]
}

export function bumpUsage(id: string, tokens: number): User | null {
  const user = findUserById(id)
  if (!user) return null
  const month = monthKey()
  const tokensUsed = user.usageMonth === month ? user.tokensUsed + tokens : tokens
  return updateUser(id, { usageMonth: month, tokensUsed })
}

export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    plan: user.plan,
    subStatus: user.subStatus,
    usageMonth: user.usageMonth,
    tokensUsed: user.tokensUsed,
    proActive: user.plan === 'pro' && user.subStatus === 'active'
  }
}

export function fingerprintKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}
