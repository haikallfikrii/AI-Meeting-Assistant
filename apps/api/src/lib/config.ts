export function env(name: string, fallback = ''): string {
  return process.env[name] || fallback
}

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env ${name}`)
  return value
}

export function corsOrigins(): string[] {
  const defaults = [
    'https://kalfi.app',
    'https://www.kalfi.app',
    'https://ai.chatlm.tech',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ]
  const fromEnv = env('CORS_ORIGINS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return Array.from(new Set([...defaults, ...fromEnv]))
}

export function proTokenCap(): number {
  const n = Number(env('PRO_MONTHLY_TOKEN_SOFT_CAP', '2000000'))
  return Number.isFinite(n) ? n : 2_000_000
}
