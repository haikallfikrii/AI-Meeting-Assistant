/**
 * Display FX rates (USD base). Wise checkout still settles in USD.
 * Rates are indicative — refresh via Frankfurter when network allows.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type DisplayCurrency =
  | 'USD'
  | 'IDR'
  | 'EUR'
  | 'SGD'
  | 'MYR'
  | 'PHP'
  | 'INR'
  | 'BRL'
  | 'VND'
  | 'GBP'
  | 'AUD'
  | 'JPY'

/** Units of currency per 1 USD (approx, Sep 2026 baseline). */
export const DEFAULT_RATES_PER_USD: Record<DisplayCurrency, number> = {
  USD: 1,
  IDR: 15850,
  EUR: 0.92,
  SGD: 1.34,
  MYR: 4.45,
  PHP: 57.5,
  INR: 86.5,
  BRL: 5.55,
  VND: 25400,
  GBP: 0.78,
  AUD: 1.52,
  JPY: 149
}

export const CURRENCY_META: Record<
  DisplayCurrency,
  { symbol: string; decimals: number; label: string }
> = {
  USD: { symbol: '$', decimals: 0, label: 'US Dollar' },
  IDR: { symbol: 'Rp', decimals: 0, label: 'Indonesian Rupiah' },
  EUR: { symbol: '€', decimals: 0, label: 'Euro' },
  SGD: { symbol: 'S$', decimals: 0, label: 'Singapore Dollar' },
  MYR: { symbol: 'RM', decimals: 0, label: 'Malaysian Ringgit' },
  PHP: { symbol: '₱', decimals: 0, label: 'Philippine Peso' },
  INR: { symbol: '₹', decimals: 0, label: 'Indian Rupee' },
  BRL: { symbol: 'R$', decimals: 0, label: 'Brazilian Real' },
  VND: { symbol: '₫', decimals: 0, label: 'Vietnamese Dong' },
  GBP: { symbol: '£', decimals: 0, label: 'British Pound' },
  AUD: { symbol: 'A$', decimals: 0, label: 'Australian Dollar' },
  JPY: { symbol: '¥', decimals: 0, label: 'Japanese Yen' }
}

interface RatesFile {
  updatedAt: number
  perUsd: Record<string, number>
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || join(__dirname, '../../data')
const ratesPath = join(dataDir, 'fx-rates.json')

function ensure(): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
}

function readCached(): RatesFile | null {
  ensure()
  try {
    return JSON.parse(readFileSync(ratesPath, 'utf8')) as RatesFile
  } catch {
    return null
  }
}

function writeCached(file: RatesFile): void {
  ensure()
  writeFileSync(ratesPath, JSON.stringify(file, null, 2))
}

export function getRatesPerUsd(): Record<DisplayCurrency, number> {
  const cached = readCached()
  const base = { ...DEFAULT_RATES_PER_USD }
  if (cached?.perUsd) {
    for (const k of Object.keys(base) as DisplayCurrency[]) {
      const v = Number(cached.perUsd[k])
      if (Number.isFinite(v) && v > 0) base[k] = v
    }
  }
  return base
}

export function convertFromUsd(amountUsd: number, currency: DisplayCurrency): number {
  const rate = getRatesPerUsd()[currency] || 1
  return amountUsd * rate
}

export function formatMoney(amountUsd: number, currency: DisplayCurrency): string {
  const meta = CURRENCY_META[currency]
  const local = convertFromUsd(amountUsd, currency)
  const rounded =
    currency === 'USD' || currency === 'EUR' || currency === 'GBP' || currency === 'AUD'
      ? Math.round(local * 100) / 100
      : Math.round(local)
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      maximumFractionDigits: meta.decimals === 0 && currency !== 'USD' ? 0 : 2,
      minimumFractionDigits: currency === 'USD' ? 0 : meta.decimals
    }).format(rounded)
  } catch {
    return `${meta.symbol}${rounded.toLocaleString('en')}`
  }
}

/** Best-effort refresh from Frankfurter (ECB) — fills major pairs; keeps IDR etc. from defaults/cache. */
export async function refreshRates(): Promise<{ ok: boolean; updatedAt: number }> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD')
    if (!res.ok) return { ok: false, updatedAt: readCached()?.updatedAt || 0 }
    const data = (await res.json()) as { rates?: Record<string, number> }
    const rates = data.rates || {}
    const next = { ...DEFAULT_RATES_PER_USD, ...(readCached()?.perUsd || {}) } as Record<
      string,
      number
    >
    for (const [k, v] of Object.entries(rates)) {
      if (k in DEFAULT_RATES_PER_USD && Number.isFinite(v) && v > 0) next[k] = v
    }
    const updatedAt = Date.now()
    writeCached({ updatedAt, perUsd: next })
    return { ok: true, updatedAt }
  } catch {
    return { ok: false, updatedAt: readCached()?.updatedAt || 0 }
  }
}

export function currencyPayload() {
  const rates = getRatesPerUsd()
  const cached = readCached()
  return {
    base: 'USD' as const,
    note: 'Checkout settles in USD via Wise. Other currencies are display estimates.',
    updatedAt: cached?.updatedAt || null,
    currencies: (Object.keys(CURRENCY_META) as DisplayCurrency[]).map((code) => ({
      code,
      ...CURRENCY_META[code],
      perUsd: rates[code]
    }))
  }
}
