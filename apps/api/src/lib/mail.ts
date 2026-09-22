/**
 * Lightweight transactional email (SMTP / Resend / inline log).
 */
import nodemailer from 'nodemailer'
import { env } from './config.js'

export async function sendAppEmail(input: {
  to: string
  subject: string
  text: string
  html?: string
}): Promise<{ ok: boolean; via: string; error?: string }> {
  const to = input.to.trim().toLowerCase()
  const from = env('EMAIL_FROM', 'Kalfi <hello@kalfi.app>')

  const smtpHost = env('SMTP_HOST')
  const smtpUser = env('SMTP_USER')
  const smtpPass = env('SMTP_PASS')
  if (smtpHost && smtpUser && smtpPass) {
    try {
      const port = Number(env('SMTP_PORT', '465'))
      const secure = ['1', 'true', 'yes'].includes(env('SMTP_SECURE', '1').toLowerCase())
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure,
        auth: { user: smtpUser, pass: smtpPass }
      })
      await transporter.sendMail({
        from,
        to,
        subject: input.subject,
        text: input.text,
        html: input.html || `<pre style="font-family:sans-serif;white-space:pre-wrap">${input.text}</pre>`
      })
      return { ok: true, via: 'smtp' }
    } catch (err) {
      console.error('[mail] smtp failed', err)
    }
  }

  const resendKey = env('RESEND_API_KEY')
  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: input.subject,
          text: input.text,
          html: input.html
        })
      })
      if (res.ok) return { ok: true, via: 'resend' }
      console.error('[mail] resend failed', await res.text())
    } catch (err) {
      console.error('[mail] resend error', err)
    }
  }

  console.log('[mail:dev]', { to, subject: input.subject, text: input.text })
  return { ok: true, via: 'log' }
}
