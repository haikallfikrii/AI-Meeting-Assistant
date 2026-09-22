/**
 * Simple modern HTML email shells for Kalfi transactional mail.
 * Inline CSS only — works in Gmail / Apple Mail / Outlook web.
 */

const APP_URL = () => process.env.APP_URL || 'https://kalfi.app'
const BRAND = '#0f172a'
const ACCENT = '#2563eb'
const MUTED = '#64748b'
const BORDER = '#e2e8f0'
const BG = '#f8fafc'

export function planLabel(plan?: string | null): string {
  if (!plan) return 'your plan'
  return plan.replace(/_/g, ' ')
}

export function renderEmail(opts: {
  title: string
  preview?: string
  bodyHtml: string
  cta?: { label: string; url: string }
  footerNote?: string
}): { subject: string; text: string; html: string } {
  const app = APP_URL()
  const cta = opts.cta
    ? `<p style="margin:28px 0 8px;text-align:center">
        <a href="${opts.cta.url}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${opts.cta.label}</a>
      </p>`
    : ''
  const preview = opts.preview || opts.title
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>${escapeHtml(opts.title)}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${BRAND}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preview)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BG};padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#fff;border:1px solid ${BORDER};border-radius:16px;overflow:hidden">
        <tr><td style="padding:28px 28px 8px">
          <p style="margin:0 0 4px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${ACCENT}">Kalfi</p>
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;font-weight:700;color:${BRAND}">${escapeHtml(opts.title)}</h1>
          <div style="font-size:15px;line-height:1.55;color:#334155">${opts.bodyHtml}</div>
          ${cta}
        </td></tr>
        <tr><td style="padding:8px 28px 28px">
          <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid ${BORDER};font-size:12px;line-height:1.5;color:${MUTED}">
            ${opts.footerNote || `Questions? Reply to this email or write <a href="mailto:hello@kalfi.app" style="color:${ACCENT}">hello@kalfi.app</a>.`}
            <br/> <a href="${app}" style="color:${MUTED}">kalfi.app</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = [
    opts.title,
    '',
    stripHtml(opts.bodyHtml),
    opts.cta ? `\n${opts.cta.label}: ${opts.cta.url}` : '',
    '',
    '— Kalfi · hello@kalfi.app'
  ]
    .filter(Boolean)
    .join('\n')

  return { subject: opts.title, text, html }
}

export function otpEmail(purpose: 'checkout' | 'reset' | 'register', code: string) {
  const action =
    purpose === 'reset'
      ? 'reset your password'
      : purpose === 'checkout'
        ? 'continue to checkout'
        : 'create your account'
  const title =
    purpose === 'reset'
      ? 'Reset your Kalfi password'
      : purpose === 'checkout'
        ? 'Your Kalfi checkout code'
        : 'Verify your email for Kalfi'

  // One-tap select: user-select:all — most clients select the whole code on click/tap.
  const bodyHtml = `
    <p style="margin:0 0 18px">Use this code to ${action}. It expires in <strong>10 minutes</strong>.</p>
    <div style="margin:0 0 10px;text-align:center">
      <a href="${APP_URL()}/#otp=${encodeURIComponent(code)}" style="display:inline-block;background:${BG};border:1px dashed ${BORDER};border-radius:12px;padding:16px 22px;font-size:34px;font-weight:700;letter-spacing:0.28em;color:${BRAND};text-decoration:none;font-variant-numeric:tabular-nums;-webkit-user-select:all;user-select:all">${code}</a>
    </div>
    <p style="margin:0;text-align:center;font-size:13px;color:${MUTED}">Tap or click the code to select it, then copy.</p>
  `
  return renderEmail({
    title,
    preview: `Your code is ${code}`,
    bodyHtml,
    footerNote: 'If you didn’t ask for this, you can ignore this email.'
  })
}

export function wisePaymentInstructionsEmail(input: {
  email: string
  plan: string
  amountUsd: number
  ref: string
  wiseEmail: string
  accountName?: string
  payLink?: string | null
}) {
  const pay = input.payLink
    ? `<p style="margin:16px 0"><a href="${input.payLink}" style="color:${ACCENT};font-weight:600">Open Wise payment link →</a></p>`
    : ''
  const bodyHtml = `
    <p style="margin:0 0 12px">You’re almost set. Send <strong>$${input.amountUsd} USD</strong> for <strong>${escapeHtml(planLabel(input.plan))}</strong>.</p>
    <ol style="margin:0 0 12px;padding-left:18px;color:#334155">
      <li style="margin-bottom:6px">Pay via Wise to <strong>${escapeHtml(input.wiseEmail)}</strong>${input.accountName ? ` (${escapeHtml(input.accountName)})` : ''}.</li>
      <li style="margin-bottom:6px">Put this reference in the Wise memo: <strong style="-webkit-user-select:all;user-select:all">${escapeHtml(input.ref)}</strong></li>
      <li style="margin-bottom:6px">Back on the site, tap <em>I’ve paid</em>.</li>
      <li>After we confirm, open the Kalfi app → Claim / Log in with <strong>${escapeHtml(input.email)}</strong>. No license key.</li>
    </ol>
    ${pay}
  `
  return renderEmail({
    title: `Pay $${input.amountUsd} via Wise`,
    preview: `Reference ${input.ref}`,
    bodyHtml,
    cta: { label: 'Open Kalfi', url: `${APP_URL()}/#pricing` }
  })
}

export function wiseReportedPaidEmail(input: { plan: string; ref: string }) {
  return renderEmail({
    title: 'We got your payment notice',
    bodyHtml: `
      <p style="margin:0 0 12px">Thanks — your Wise transfer for <strong>${escapeHtml(planLabel(input.plan))}</strong> is marked as sent (ref <strong>${escapeHtml(input.ref)}</strong>).</p>
      <p style="margin:0">We’ll activate shortly. You’ll get another email when your plan is live. Then open Kalfi → Claim / Log in with the same email.</p>
    `
  })
}

export function planActivatedEmail(input: { email: string; plan: string; ref?: string }) {
  const app = APP_URL()
  return renderEmail({
    title: 'Your Kalfi plan is active',
    preview: `${planLabel(input.plan)} is ready`,
    bodyHtml: `
      <p style="margin:0 0 12px">Payment confirmed — <strong>${escapeHtml(planLabel(input.plan))}</strong> is active for <strong>${escapeHtml(input.email)}</strong>.</p>
      <ol style="margin:0;padding-left:18px">
        <li style="margin-bottom:6px">Download Kalfi if you haven’t.</li>
        <li style="margin-bottom:6px">Open <strong>Settings → Account</strong>.</li>
        <li style="margin-bottom:6px">Claim / Log in with this email (set a password the first time).</li>
        <li>Tap <strong>Sync plan</strong>. No license key needed.</li>
      </ol>
      ${input.ref ? `<p style="margin:16px 0 0;font-size:13px;color:${MUTED}">Ref: ${escapeHtml(input.ref)}</p>` : ''}
    `,
    cta: { label: 'Download Kalfi', url: `${app}/#download` }
  })
}

export function subscriptionActiveEmail(input: { plan: string }) {
  return renderEmail({
    title: 'Welcome — your subscription is active',
    bodyHtml: `
      <p style="margin:0 0 12px">You’re on <strong>${escapeHtml(planLabel(input.plan))}</strong>. Open the Kalfi app, sign in with this email, and tap Sync plan.</p>
    `,
    cta: { label: 'Open Kalfi', url: `${APP_URL()}/#download` }
  })
}

export function paymentFailedEmail(input: { plan?: string }) {
  return renderEmail({
    title: 'Payment failed — action needed',
    bodyHtml: `
      <p style="margin:0 0 12px">We couldn’t process your latest payment${input.plan ? ` for <strong>${escapeHtml(planLabel(input.plan))}</strong>` : ''}.</p>
      <p style="margin:0">Update your payment method to keep access. If you already fixed it, you can ignore this note.</p>
    `,
    cta: { label: 'Manage billing', url: `${APP_URL()}/#pricing` }
  })
}

export function subscriptionCanceledEmail(input: { plan?: string; immediate?: boolean }) {
  return renderEmail({
    title: input.immediate ? 'Your Kalfi subscription ended' : 'Your cancellation is confirmed',
    bodyHtml: `
      <p style="margin:0 0 12px">${
        input.immediate
          ? `Access to ${escapeHtml(planLabel(input.plan))} has ended.`
          : `We’ve canceled ${escapeHtml(planLabel(input.plan))}. You’ll keep access until the end of the current period unless it already ended.`
      }</p>
      <p style="margin:0">You can resubscribe anytime from the pricing page. Free BYOK still works with your own API key.</p>
    `,
    cta: { label: 'View plans', url: `${APP_URL()}/#pricing` }
  })
}

export function pastDueEmail(input: { plan?: string }) {
  return renderEmail({
    title: 'Subscription past due',
    bodyHtml: `
      <p style="margin:0">Your ${escapeHtml(planLabel(input.plan))} subscription is past due. Please update billing soon so we don’t have to pause access.</p>
    `,
    cta: { label: 'Fix billing', url: `${APP_URL()}/#pricing` }
  })
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h\d|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
