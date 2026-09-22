import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createId } from './store.js'

export type LeadStatus =
  | 'email_submitted'
  | 'otp_sent'
  | 'otp_verified'
  | 'checkout_opened'
  | 'payment_returned'
  | 'subscribed'

export interface Lead {
  id: string
  email: string
  status: LeadStatus
  plan?: string
  sku?: string
  source?: string
  firstSeenAt: number
  updatedAt: number
  otpSentAt?: number
  verifiedAt?: number
  checkoutAt?: number
  paymentReturnedAt?: number
  subscribedAt?: number
}

interface LeadsFile {
  leads: Lead[]
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || join(__dirname, '../../data')
const leadsPath = join(dataDir, 'leads.json')

function ensure(): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  if (!existsSync(leadsPath)) {
    writeFileSync(leadsPath, JSON.stringify({ leads: [] } satisfies LeadsFile, null, 2))
  }
}

function read(): LeadsFile {
  ensure()
  try {
    return JSON.parse(readFileSync(leadsPath, 'utf8')) as LeadsFile
  } catch {
    return { leads: [] }
  }
}

function write(db: LeadsFile): void {
  ensure()
  writeFileSync(leadsPath, JSON.stringify(db, null, 2))
}

const STATUS_RANK: Record<LeadStatus, number> = {
  email_submitted: 1,
  otp_sent: 2,
  otp_verified: 3,
  checkout_opened: 4,
  payment_returned: 5,
  subscribed: 6
}

export function upsertLead(
  email: string,
  patch: {
    status: LeadStatus
    plan?: string
    sku?: string
    source?: string
  }
): Lead {
  const normalized = email.trim().toLowerCase()
  const db = read()
  const now = Date.now()
  let lead = db.leads.find((l) => l.email === normalized)
  if (!lead) {
    lead = {
      id: createId('lead'),
      email: normalized,
      status: patch.status,
      plan: patch.plan,
      sku: patch.sku,
      source: patch.source || 'pricing',
      firstSeenAt: now,
      updatedAt: now
    }
    db.leads.unshift(lead)
  } else {
    const nextRank = STATUS_RANK[patch.status]
    const curRank = STATUS_RANK[lead.status]
    if (nextRank >= curRank) lead.status = patch.status
    if (patch.plan) lead.plan = patch.plan
    if (patch.sku) lead.sku = patch.sku
    if (patch.source) lead.source = patch.source
    lead.updatedAt = now
  }

  if (patch.status === 'otp_sent') lead.otpSentAt = now
  if (patch.status === 'otp_verified') lead.verifiedAt = now
  if (patch.status === 'checkout_opened') lead.checkoutAt = now
  if (patch.status === 'payment_returned') lead.paymentReturnedAt = now
  if (patch.status === 'subscribed') lead.subscribedAt = now

  write(db)
  return lead
}

export function markLeadSubscribed(email: string, plan?: string): Lead | null {
  if (!email) return null
  return upsertLead(email, { status: 'subscribed', plan, source: 'polar' })
}

export function listLeads(opts?: {
  q?: string
  status?: string
  limit?: number
}): { leads: Lead[]; total: number; summary: Record<string, number> } {
  let leads = read().leads || []
  const q = opts?.q?.trim().toLowerCase()
  if (q) leads = leads.filter((l) => l.email.includes(q))
  if (opts?.status && opts.status !== 'all') {
    leads = leads.filter((l) => l.status === opts.status)
  }
  leads = [...leads].sort((a, b) => b.updatedAt - a.updatedAt)
  const summary: Record<string, number> = {}
  for (const l of read().leads || []) {
    summary[l.status] = (summary[l.status] || 0) + 1
  }
  const limit = Math.min(200, Math.max(1, opts?.limit || 50))
  return { leads: leads.slice(0, limit), total: leads.length, summary }
}
