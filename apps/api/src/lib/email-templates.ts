/**
 * Kalfi transactional email templates.
 * Brand: dark ink + accent #5B8CFF, logo hosted on kalfi.app (PNG for email clients).
 * Public customer links always point at https://kalfi.app — never legacy chatlm domains.
 */

const SITE = 'https://kalfi.app'
const LOGO = `${SITE}/assets/brand/kalfi-app-icon.png`
const SUPPORT = 'hello@kalfi.app'

const INK = '#080a0f'
const INK_CARD = '#0d1016'
const LINE = '#1e2430'
const FG = '#f2f4f8'
const FG_DIM = '#a8b1c2'
const ACCENT = '#5b8cff'
const SIGNAL = '#4ade80'
const PAGE_BG = '#05060a'

export function planLabel(plan?: string | null): string {
  if (!plan) return 'your plan'
  return plan.replace(/_/g, ' ')
}

function sitePath(hashOrPath: string): string {
  if (hashOrPath.startsWith('http')) return hashOrPath.replace(/https?:\/\/(www\.)?ai\.chatlm\.tech/gi, SITE)
  if (hashOrPath.startsWith('#')) return `${SITE}/${hashOrPath}`
  if (hashOrPath.startsWith('/')) return `${SITE}${hashOrPath}`
  return `${SITE}/${hashOrPath}`
}

export function renderEmail(opts: {
  title: string
  preview?: string
  bodyHtml: string
  cta?: { label: string; url: string }
  footerNote?: string
}): { subject: string; text: string; html: string } {
  const ctaUrl = opts.cta ? sitePath(opts.cta.url) : ''
  const cta = opts.cta
    ? `<tr><td style="padding:8px 32px 4px" align="center">
        <a href="${ctaUrl}" style="display:inline-block;background:${ACCENT};color:${INK};text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:10px;letter-spacing:-0.01em">${escapeHtml(opts.cta.label)}</a>
      </td></tr>`
    : ''
  const preview = opts.preview || opts.title
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="dark"/>
  <meta name="supported-color-schemes" content="dark"/>
  <title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};font-family:Inter,system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:${FG}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preview)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${PAGE_BG};padding:40px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:540px;background:${INK_CARD};border:1px solid ${LINE};border-radius:18px;overflow:hidden">
        <tr>
          <td style="padding:22px 32px 18px;border-bottom:1px solid ${LINE};background:${INK}">
            <a href="${SITE}" style="text-decoration:none;display:inline-block">
              <img src="${LOGO}" width="36" height="36" alt="Kalfi" style="display:inline-block;vertical-align:middle;border:0;border-radius:9px"/>
              <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:18px;font-weight:650;letter-spacing:-0.03em;color:${FG}">Kalfi</span>
            </a>
          </td>
        </tr>
        <tr>
          <td style="height:3px;background:linear-gradient(90deg,${ACCENT},#7aa2ff 55%,${SIGNAL});font-size:0;line-height:0">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:28px 32px 8px">
            <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.02em;color:${FG}">${escapeHtml(opts.title)}</h1>
            <div style="font-size:15px;line-height:1.6;color:${FG_DIM}">${opts.bodyHtml}</div>
          </td>
        </tr>
        ${cta}
        <tr>
          <td style="padding:24px 32px 28px">
            <p style="margin:0;padding-top:18px;border-top:1px solid ${LINE};font-size:12px;line-height:1.55;color:#6c7688">
              ${opts.footerNote || `Questions? Reply or email <a href="mailto:${SUPPORT}" style="color:${ACCENT};text-decoration:none">${SUPPORT}</a>.`}
              <br/>
              <a href="${SITE}" style="color:#6c7688;text-decoration:none">kalfi.app</a>
              · <a href="${SITE}/#download" style="color:#6c7688;text-decoration:none">Download</a>
              · <a href="mailto:${SUPPORT}" style="color:#6c7688;text-decoration:none">Contact</a>
            </p>
          </td>
        </tr>
      </table>
      <p style="margin:18px 0 0;font-size:11px;color:#4b5568">© Kalfi · Built for meetings & interviews</p>
    </td></tr>
  </table>
</body>
</html>`

  const text = [
    'Kalfi',
    opts.title,
    '',
    stripHtml(opts.bodyHtml),
    opts.cta ? `\n${opts.cta.label}: ${ctaUrl}` : '',
    '',
    `— Kalfi · ${SITE} · ${SUPPORT}`
  ]
    .filter(Boolean)
    .join('\n')

  return { subject: opts.title, text, html }
}

export function otpEmail(
  purpose: 'checkout' | 'reset' | 'register',
  code: string,
  opts?: { email?: string }
) {
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

  const email = (opts?.email || '').trim().toLowerCase()
  const verifyUrl =
    purpose === 'checkout' && email
      ? `${SITE}/#otp=${encodeURIComponent(code)}&email=${encodeURIComponent(email)}`
      : ''

  const bodyHtml = `
    <p style="margin:0 0 18px;color:${FG_DIM}">Use this code to ${action}. It expires in <strong style="color:${FG}">10 minutes</strong>.</p>
    <div style="margin:0 0 12px;text-align:center">
      <div style="display:inline-block;background:${INK};border:1px solid ${LINE};border-radius:14px;padding:18px 24px;font-size:36px;font-weight:700;letter-spacing:0.32em;color:${FG};font-variant-numeric:tabular-nums;-webkit-user-select:all;user-select:all">${code}</div>
    </div>
    <p style="margin:0 0 ${verifyUrl ? '16' : '0'}px;text-align:center;font-size:13px;color:#6c7688">Select the code above, then copy${verifyUrl ? ' — or tap Verify below to confirm on the site' : ''}.</p>
    ${
      verifyUrl
        ? `<p style="margin:0;text-align:center;font-size:12px;color:#6c7688">The button opens kalfi.app and confirms this code automatically.</p>`
        : ''
    }
  `
  return renderEmail({
    title,
    preview: `Your code is ${code}`,
    bodyHtml,
    cta: verifyUrl ? { label: 'Verify & continue', url: verifyUrl } : undefined,
    footerNote: `If you didn’t ask for this, you can ignore this email. Support: <a href="mailto:${SUPPORT}" style="color:${ACCENT};text-decoration:none">${SUPPORT}</a>.`
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
    ? `<p style="margin:16px 0 0"><a href="${input.payLink}" style="color:${ACCENT};font-weight:600;text-decoration:none">Open Wise payment link →</a></p>`
    : ''
  const bodyHtml = `
    <p style="margin:0 0 14px">You’re almost set. Send <strong style="color:${FG}">$${input.amountUsd} USD</strong> for <strong style="color:${FG}">${escapeHtml(planLabel(input.plan))}</strong>.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 14px;background:${INK};border:1px solid ${LINE};border-radius:12px">
      <tr><td style="padding:14px 16px">
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6c7688">Payment reference</p>
        <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:0.06em;color:${ACCENT};-webkit-user-select:all;user-select:all">${escapeHtml(input.ref)}</p>
      </td></tr>
    </table>
    <ol style="margin:0;padding-left:18px;color:${FG_DIM}">
      <li style="margin-bottom:8px">Pay via Wise to <strong style="color:${FG}">${escapeHtml(input.wiseEmail)}</strong>${input.accountName ? ` (${escapeHtml(input.accountName)})` : ''}.</li>
      <li style="margin-bottom:8px">Paste the reference above in the Wise memo.</li>
      <li style="margin-bottom:8px">Back on the site, tap <em>I’ve paid</em>.</li>
      <li>After we confirm, open the app → Claim / Log in with <strong style="color:${FG}">${escapeHtml(input.email)}</strong>. No license key.</li>
    </ol>
    ${pay}
  `
  return renderEmail({
    title: `Pay $${input.amountUsd} via Wise`,
    preview: `Reference ${input.ref}`,
    bodyHtml,
    cta: { label: 'Open kalfi.app', url: `${SITE}/#pricing` }
  })
}

export function wiseReportedPaidEmail(input: { plan: string; ref: string }) {
  return renderEmail({
    title: 'We got your payment notice',
    bodyHtml: `
      <p style="margin:0 0 12px">Thanks — your Wise transfer for <strong style="color:${FG}">${escapeHtml(planLabel(input.plan))}</strong> is marked as sent.</p>
      <p style="margin:0">Reference <strong style="color:${ACCENT}">${escapeHtml(input.ref)}</strong>. We’ll activate shortly and email you when your plan is live. Then open Kalfi → Claim / Log in with the same email.</p>
    `
  })
}

export function planActivatedEmail(input: { email: string; plan: string; ref?: string }) {
  return renderEmail({
    title: 'Your Kalfi plan is active',
    preview: `${planLabel(input.plan)} is ready`,
    bodyHtml: `
      <p style="margin:0 0 12px">Payment confirmed — <strong style="color:${FG}">${escapeHtml(planLabel(input.plan))}</strong> is active for <strong style="color:${FG}">${escapeHtml(input.email)}</strong>.</p>
      <ol style="margin:0;padding-left:18px;color:${FG_DIM}">
        <li style="margin-bottom:8px">Download Kalfi for your Mac or Windows.</li>
        <li style="margin-bottom:8px">Open <strong style="color:${FG}">Settings → Account</strong>.</li>
        <li style="margin-bottom:8px">Claim / Log in with this email (set a password the first time).</li>
        <li>Tap <strong style="color:${FG}">Sync plan</strong>. No license key needed.</li>
      </ol>
      ${input.ref ? `<p style="margin:16px 0 0;font-size:13px;color:#6c7688">Ref: ${escapeHtml(input.ref)}</p>` : ''}
    `,
    cta: { label: 'Download Kalfi', url: `${SITE}/#download` }
  })
}

export function subscriptionActiveEmail(input: { plan: string }) {
  return renderEmail({
    title: 'Welcome — your subscription is active',
    bodyHtml: `
      <p style="margin:0 0 12px">You’re on <strong style="color:${FG}">${escapeHtml(planLabel(input.plan))}</strong>. Open the Kalfi app, sign in with this email, and tap Sync plan.</p>
    `,
    cta: { label: 'Download Kalfi', url: `${SITE}/#download` }
  })
}

export function paymentFailedEmail(input: { plan?: string }) {
  return renderEmail({
    title: 'Payment failed — action needed',
    bodyHtml: `
      <p style="margin:0 0 12px">We couldn’t process your latest payment${input.plan ? ` for <strong style="color:${FG}">${escapeHtml(planLabel(input.plan))}</strong>` : ''}.</p>
      <p style="margin:0">Update your payment method to keep access. If you already fixed it, you can ignore this note.</p>
    `,
    cta: { label: 'View pricing', url: `${SITE}/#pricing` }
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
      <p style="margin:0">You can resubscribe anytime. Free BYOK still works with your own API key.</p>
    `,
    cta: { label: 'View plans', url: `${SITE}/#pricing` }
  })
}

export function pastDueEmail(input: { plan?: string }) {
  return renderEmail({
    title: 'Subscription past due',
    bodyHtml: `
      <p style="margin:0">Your ${escapeHtml(planLabel(input.plan))} subscription is past due. Please update billing soon so we don’t have to pause access.</p>
    `,
    cta: { label: 'View pricing', url: `${SITE}/#pricing` }
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
