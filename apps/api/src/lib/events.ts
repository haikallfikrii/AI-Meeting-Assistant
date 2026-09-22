import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createId } from './store.js'

export type AdminEventType =
  | 'admin_grant'
  | 'admin_create_user'
  | 'admin_update_user'
  | 'admin_suspend'
  | 'admin_unsuspend'
  | 'admin_delete_user'
  | 'lemon_order'
  | 'lemon_subscription'
  | 'polar_order'
  | 'polar_subscription'
  | 'polar_benefit'
  | 'manual_order_created'
  | 'manual_order_reported'
  | 'manual_order_activated'
  | 'otp_checkout'
  | 'otp_reset'
  | 'checkout_return'

export interface AdminEvent {
  id: string
  type: AdminEventType
  at: number
  email?: string
  userId?: string
  meta?: Record<string, unknown>
}

interface EventsFile {
  events: AdminEvent[]
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || join(__dirname, '../../data')
const eventsPath = join(dataDir, 'events.json')
const MAX_EVENTS = 2000

function ensure(): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  if (!existsSync(eventsPath)) {
    writeFileSync(eventsPath, JSON.stringify({ events: [] } satisfies EventsFile, null, 2))
  }
}

function read(): EventsFile {
  ensure()
  try {
    return JSON.parse(readFileSync(eventsPath, 'utf8')) as EventsFile
  } catch {
    return { events: [] }
  }
}

function write(db: EventsFile): void {
  ensure()
  writeFileSync(eventsPath, JSON.stringify(db, null, 2))
}

export function recordEvent(
  type: AdminEventType,
  opts?: { email?: string; userId?: string; meta?: Record<string, unknown> }
): AdminEvent {
  const db = read()
  const event: AdminEvent = {
    id: createId('evt'),
    type,
    at: Date.now(),
    email: opts?.email,
    userId: opts?.userId,
    meta: opts?.meta
  }
  db.events.unshift(event)
  if (db.events.length > MAX_EVENTS) db.events.length = MAX_EVENTS
  write(db)
  return event
}

export function listEvents(opts?: {
  limit?: number
  type?: string
}): AdminEvent[] {
  let events = read().events || []
  if (opts?.type && opts.type !== 'all') {
    events = events.filter((e) => e.type === opts.type)
  }
  const limit = Math.min(200, Math.max(1, opts?.limit || 50))
  return events.slice(0, limit)
}

export function salesAnalytics() {
  const events = read().events || []
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const last30 = events.filter((e) => now - e.at < 30 * dayMs)
  const lemonOrders = last30.filter((e) => e.type === 'lemon_order' || e.type === 'lemon_subscription')
  const byDay: Record<string, number> = {}
  for (const e of lemonOrders) {
    const d = new Date(e.at).toISOString().slice(0, 10)
    byDay[d] = (byDay[d] || 0) + 1
  }
  const checkoutOtps = last30.filter((e) => e.type === 'otp_checkout').length
  return {
    lemonEvents30d: lemonOrders.length,
    checkoutOtps30d: checkoutOtps,
    byDay,
    recentLemon: lemonOrders.slice(0, 20)
  }
}
