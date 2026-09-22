import { createHash, randomInt } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SignJWT, jwtVerify } from 'jose'
import nodemailer from 'nodemailer'
import { env } from './config.js'

export type OtpPurpose = 'checkout' | 'reset' | 'register'

interface OtpRecord {
  email: string
  purpose: OtpPurpose
  codeHash: string
  expiresAt: number
  attempts: number
  createdAt: number
}

interface OtpFile {
  records: OtpRecord[]
  /** email → timestamps of recent sends */
  sends: Record<string, number[]>
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || join(__dirname, '../../data')
const otpPath = join(dataDir, 'otp.json')

const OTP_TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5
const MAX_SENDS_PER_WINDOW = 5
const SEND_WINDOW_MS = 15 * 60 * 1000

function ensure(): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  if (!existsSync(otpPath)) {
    writeFileSync(otpPath, JSON.stringify({ records: [], sends: {} } satisfies OtpFile, null, 2))
  }
}

function read(): OtpFile {
  ensure()
  try {
    return JSON.parse(readFileSync(otpPath, 'utf8')) as OtpFile
  } catch {
    return { records: [], sends: {} }
  }
}

function write(db: OtpFile): void {
  ensure()
  writeFileSync(otpPath, JSON.stringify(db, null, 2))
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

function secret(): Uint8Array {
  const raw = process.env.JWT_SECRET || 'dev-only-change-me'
  return new TextEncoder().encode(raw)
}

function prune(db: OtpFile, now = Date.now()): OtpFile {
  const sends: Record<string, number[]> = {}
  for (const [email, times] of Object.entries(db.sends || {})) {
    const kept = times.filter((t) => now - t < SEND_WINDOW_MS)
    if (kept.length) sends[email] = kept
  }
  return {
    records: (db.records || []).filter((r) => r.expiresAt > now),
    sends
  }
}

export function generateOtpCode(): string {
  return String(randomInt(100000, 999999))
}

export function canSendOtp(email: string): { ok: true } | { ok: false; error: string } {
  const normalized = email.trim().toLowerCase()
  const db = prune(read())
  const recent = db.sends[normalized] || []
  if (recent.length >= MAX_SENDS_PER_WINDOW) {
    return {
      ok: false,
      error: 'Too many codes sent. Wait about 15 minutes, then try again.'
    }
  }
  return { ok: true }
}

export function storeOtp(email: string, purpose: OtpPurpose, code: string): void {
  const normalized = email.trim().toLowerCase()
  const now = Date.now()
  const db = prune(read(), now)
  db.records = db.records.filter((r) => !(r.email === normalized && r.purpose === purpose))
  db.records.push({
    email: normalized,
    purpose,
    codeHash: hashCode(code),
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    createdAt: now
  })
  const sends = db.sends[normalized] || []
  sends.push(now)
  db.sends[normalized] = sends
  write(db)
}

export function verifyOtp(
  email: string,
  purpose: OtpPurpose,
  code: string
): { ok: true } | { ok: false; error: string } {
  const normalized = email.trim().toLowerCase()
  const now = Date.now()
  const db = prune(read(), now)
  const idx = db.records.findIndex((r) => r.email === normalized && r.purpose === purpose)
  if (idx < 0) return { ok: false, error: 'Code expired or not found. Request a new one.' }
  const rec = db.records[idx]
  if (rec.expiresAt < now) {
    db.records.splice(idx, 1)
    write(db)
    return { ok: false, error: 'Code expired. Request a new one.' }
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: 'Too many attempts. Request a new code.' }
  }
  const match = rec.codeHash === hashCode(code.trim())
  if (!match) {
    rec.attempts += 1
    write(db)
    return { ok: false, error: 'Invalid code. Check and try again.' }
  }
  db.records.splice(idx, 1)
  write(db)
  return { ok: true }
}

export async function signEmailProof(email: string, purpose: OtpPurpose): Promise<string> {
  // Checkout proof stays valid so users don't re-OTP for a while (landing also caches it).
  const ttl = purpose === 'checkout' ? '48h' : '30m'
  return new SignJWT({
    kind: 'email_proof',
    email: email.trim().toLowerCase(),
    purpose
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secret())
}

export async function verifyEmailProof(
  token: string,
  purpose: OtpPurpose
): Promise<{ email: string }> {
  const { payload } = await jwtVerify(token, secret())
  if (
    payload.kind !== 'email_proof' ||
    payload.purpose !== purpose ||
    typeof payload.email !== 'string'
  ) {
    throw new Error('Invalid email proof')
  }
  return { email: payload.email }
}

function smtpConfigured(): boolean {
  return Boolean(env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS'))
}

async function sendViaSmtp(opts: {
  from: string
  to: string
  subject: string
  html: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const port = Number(env('SMTP_PORT', '465'))
  const secure =
    env('SMTP_SECURE', port === 465 ? '1' : '0') === '1' ||
    env('SMTP_SECURE') === 'true'
  try {
    const transporter = nodemailer.createTransport({
      host: env('SMTP_HOST'),
      port,
      secure,
      auth: {
        user: env('SMTP_USER'),
        pass: env('SMTP_PASS')
      }
    })
    await transporter.sendMail({
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    })
    return { ok: true }
  } catch (err) {
    console.error('[otp] SMTP send failed', err)
    return { ok: false, error: 'Could not send email via mail server. Try again shortly.' }
  }
}

async function sendViaResend(opts: {
  apiKey: string
  from: string
  to: string
  subject: string
  html: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: opts.from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html
      })
    })
    if (!res.ok) {
      const text = await res.text()
      console.error('[otp] Resend failed', res.status, text)
      return { ok: false, error: 'Could not send email. Check the address and try again.' }
    }
    return { ok: true }
  } catch (err) {
    console.error('[otp] Resend send failed', err)
    return { ok: false, error: 'Could not send email. Try again in a moment.' }
  }
}

export async function sendOtpEmail(
  to: string,
  purpose: OtpPurpose,
  code: string
): Promise<{ ok: true; devCode?: string } | { ok: false; error: string }> {
  const toAddr = to.trim().toLowerCase()
  const { otpEmail } = await import('./email-templates.js')
  const tpl = otpEmail(purpose, code, { email: toAddr })

  const from = env('EMAIL_FROM', 'Kalfi <hello@kalfi.app>')
  const resendKey = env('RESEND_API_KEY')

  // Prefer Hostinger / custom SMTP (hello@kalfi.app), then Resend, else inline test code.
  if (smtpConfigured()) {
    const sent = await sendViaSmtp({ from, to: toAddr, subject: tpl.subject, html: tpl.html })
    if (sent.ok) return { ok: true }
    return sent
  }

  if (resendKey) {
    return sendViaResend({ apiKey: resendKey, from, to: toAddr, subject: tpl.subject, html: tpl.html })
  }

  console.warn(`[otp] No SMTP/Resend configured — inline code for ${toAddr} (${purpose}): ${code}`)
  return { ok: true, devCode: code }
}
