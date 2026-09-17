/** Test accounts while Lemon is in test mode / unverified. */
const TEST_EMAIL_ALLOWLIST = new Set(['muhamadfikrih29@gmail.com'])

export function isTestAllowlisted(email?: string | null): boolean {
  if (!email) return false
  return TEST_EMAIL_ALLOWLIST.has(String(email).trim().toLowerCase())
}
