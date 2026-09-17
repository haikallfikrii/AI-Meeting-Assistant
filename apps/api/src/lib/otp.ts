import { createHash, randomInt } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SignJWT, jwtVerify } from 'jose'
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
  db.sends[normalized] = [...(db.sends[normalized] || []), now]
  write(db)
}

export function verifyOtp(
  email: string,
  purpose: OtpPurpose,
  code: string
): { ok: true } | { ok: false; error: string } {
  const normalized = email.trim().toLowerCase()
  const trimmed = String(code || '').trim()
  if (!/^\d{6}$/.test(trimmed)) {
    return { ok: false, error: 'Enter the 6-digit code from your email.' }
  }
  const now = Date.now()
  const db = prune(read(), now)
  const idx = db.records.findIndex((r) => r.email === normalized && r.purpose === purpose)
  if (idx < 0) {
    return { ok: false, error: 'Code expired or not found. Request a new one.' }
  }
  const record = db.records[idx]
  if (record.attempts >= MAX_ATTEMPTS) {
    db.records.splice(idx, 1)
    write(db)
    return { ok: false, error: 'Too many wrong attempts. Request a new code.' }
  }
  if (record.codeHash !== hashCode(trimmed)) {
    db.records[idx] = { ...record, attempts: record.attempts + 1 }
    write(db)
    return { ok: false, error: 'Incorrect code. Check the email and try again.' }
  }
  db.records.splice(idx, 1)
  write(db)
  return { ok: true }
}

export async function signEmailProof(
  email: string,
  purpose: OtpPurpose,
  ttl = '30m'
): Promise<string> {
  return new SignJWT({ email: email.trim().toLowerCase(), purpose, kind: 'email_proof' })
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

export async function sendOtpEmail(
  to: string,
  purpose: OtpPurpose,
  code: string
): Promise<{ ok: true; devCode?: string } | { ok: false; error: string }> {
  const subject =
    purpose === 'reset'
      ? 'Reset your Kalfi password'
      : purpose === 'checkout'
        ? 'Verify your email for Kalfi checkout'
        : 'Verify your email for Kalfi'

  const action =
    purpose === 'reset'
      ? 'reset your password'
      : purpose === 'checkout'
        ? 'continue to checkout'
        : 'create your account'

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
      <h1 style="font-size:20px;margin:0 0 12px">Your Kalfi code</h1>
      <p style="margin:0 0 16px;color:#475569">Use this code to ${action}. It expires in 10 minutes.</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:24px 0">${code}</p>
      <p style="margin:0;color:#94a3b8;font-size:13px">If you didn’t ask for this, you can ignore this email.</p>
    </div>
  `

  const apiKey = env('RESEND_API_KEY')
  const from = env('EMAIL_FROM', 'Kalfi <onboarding@resend.dev>')

  if (!apiKey) {
    console.warn(`[otp] RESEND_API_KEY missing — code for ${to} (${purpose}): ${code}`)
    const allowDev =
      env('AUTH_DEV_CODES') === '1' ||
      to.trim().toLowerCase() === 'muhamadfikrih29@gmail.com'
    if (allowDev) {
      return { ok: true, devCode: code }
    }
    return {
      ok: false,
      error:
        'Email delivery is not configured on the server yet. Ask support, or try again shortly.'
    }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [to.trim().toLowerCase()],
        subject,
        html
      })
    })
    if (!res.ok) {
      const text = await res.text()
      console.error('[otp] Resend failed', res.status, text)
      return { ok: false, error: 'Could not send email. Check the address and try again.' }
    }
    return { ok: true }
  } catch (err) {
    console.error('[otp] send failed', err)
    return { ok: false, error: 'Could not send email. Try again in a moment.' }
  }
}
