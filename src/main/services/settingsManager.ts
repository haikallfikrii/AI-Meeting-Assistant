import { config } from 'dotenv'
import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { DEFAULT_CHAT_MODELS, LlmProvider } from './providerConfig'
import { readBrandLogoDataUrl } from './branding'
import {
  type BillingPlan,
  type BillingInterval,
  type MembershipStatus,
  type SingleSessionState,
  billingIntervalOf,
  evaluateSingleSession,
  featureTierOf,
  normalizeBillingPlan,
  planLabel
} from './entitlement'

config()

export type { LlmProvider, BillingPlan, BillingInterval, MembershipStatus, SingleSessionState }
export { featureTierOf, billingIntervalOf, planLabel }

/** Global app settings only — per-company/client context lives in SessionManager. */
export interface AppSettings {
  llmProvider: LlmProvider
  openaiApiKey: string
  openaiModel: string
  apiBaseUrl: string
  alwaysOnTop: boolean
  windowOpacity: number
  pauseThreshold: number
  autoStart: boolean
  /** Empty = default "Kalfi". Shown in header, window title, process title. */
  brandName: string
  /** Absolute path under userData/branding — empty = default mic icon. */
  brandLogoPath: string
  /** Computed for the renderer; never written to disk. */
  brandLogoDataUrl?: string
  /** macOS: hide app from Dock / Cmd+Tab. Default true for stealth. */
  hideFromDock: boolean
  /** Local profile scaffold — auth/billing wired later. */
  accountName: string
  accountEmail: string
  /** Lemon SKU (6 paid + free). Feature gating uses featureTierOf(membershipPlan). */
  membershipPlan: BillingPlan
  membershipStatus: MembershipStatus
  /** Derived for display — not authoritative */
  billingInterval?: BillingInterval
  singleSession?: SingleSessionState | null
}

type PersistedSettings = Omit<AppSettings, 'openaiApiKey' | 'brandLogoDataUrl'> & {
  openaiApiKey?: string
  openaiApiKeyEncrypted?: string
  // legacy fields (migrated into sessions)
  sessionMode?: string
  targetRole?: string
  companyName?: string
  jobDescription?: string
  resumeDescription?: string
  answerBank?: string
}

const getEnvApiKey = (): string => {
  return (
    process.env.OPENAI_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.LLM_API_KEY ||
    ''
  )
}

const normalizeProvider = (value: unknown): LlmProvider => {
  if (value === 'openrouter' || value === 'custom' || value === 'openai') {
    return value
  }
  return 'openai'
}

const normalizeMembershipStatus = (value: unknown): MembershipStatus => {
  if (
    value === 'active' ||
    value === 'trial' ||
    value === 'inactive' ||
    value === 'past_due' ||
    value === 'canceled' ||
    value === 'expired'
  ) {
    return value
  }
  return 'inactive'
}

const normalizeSingleSession = (value: unknown): SingleSessionState | null => {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<SingleSessionState>
  if (
    raw.status !== 'unused' &&
    raw.status !== 'active_in_session' &&
    raw.status !== 'consumed' &&
    raw.status !== 'expired'
  ) {
    return null
  }
  if (typeof raw.purchasedAt !== 'number' || typeof raw.expiresAt !== 'number') return null
  return evaluateSingleSession({
    status: raw.status,
    purchasedAt: raw.purchasedAt,
    expiresAt: raw.expiresAt,
    sessionStartedAt:
      typeof raw.sessionStartedAt === 'number' ? raw.sessionStartedAt : undefined
  })
}

const DEFAULT_SETTINGS: AppSettings = {
  llmProvider: normalizeProvider(process.env.LLM_PROVIDER),
  openaiApiKey: getEnvApiKey(),
  openaiModel: process.env.OPENAI_MODEL || DEFAULT_CHAT_MODELS.openai,
  apiBaseUrl: process.env.API_BASE_URL || '',
  alwaysOnTop: true,
  windowOpacity: 1.0,
  pauseThreshold: 1500,
  autoStart: false,
  brandName: '',
  brandLogoPath: '',
  hideFromDock: true,
  accountName: '',
  accountEmail: '',
  membershipPlan: 'free',
  membershipStatus: 'inactive',
  billingInterval: 'none',
  singleSession: null
}

export class SettingsManager {
  private settingsPath: string
  private settings: AppSettings
  private legacyContext: {
    sessionMode?: string
    targetRole?: string
    companyName?: string
    jobDescription?: string
    resumeDescription?: string
    answerBank?: string
  } | null = null

  constructor() {
    const userDataPath = app.getPath('userData')
    this.settingsPath = path.join(userDataPath, 'settings.json')
    this.settings = this.loadSettings()
  }

  getLegacyContextForMigration(): typeof this.legacyContext {
    return this.legacyContext
  }

  clearLegacyContext(): void {
    this.legacyContext = null
  }

  private loadSettings(): AppSettings {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf-8')
        const savedSettings = JSON.parse(data) as PersistedSettings

        let apiKey = ''

        if (savedSettings.openaiApiKeyEncrypted) {
          if (safeStorage.isEncryptionAvailable()) {
            try {
              apiKey = safeStorage.decryptString(
                Buffer.from(savedSettings.openaiApiKeyEncrypted, 'base64')
              )
            } catch {
              console.error('Failed to decrypt API key — clearing stored secret')
              apiKey = ''
            }
          } else {
            console.warn(
              'Encrypted API key found but safeStorage is unavailable — key will not be loaded'
            )
          }
        } else if (savedSettings.openaiApiKey) {
          apiKey = savedSettings.openaiApiKey
          console.warn(
            'API key was stored in plaintext; it will be re-encrypted on the next settings save'
          )
        }

        // Capture legacy session fields for one-time migration
        if (
          savedSettings.sessionMode ||
          savedSettings.targetRole ||
          savedSettings.companyName ||
          savedSettings.jobDescription ||
          savedSettings.resumeDescription ||
          savedSettings.answerBank
        ) {
          this.legacyContext = {
            sessionMode: savedSettings.sessionMode,
            targetRole: savedSettings.targetRole,
            companyName: savedSettings.companyName,
            jobDescription: savedSettings.jobDescription,
            resumeDescription: savedSettings.resumeDescription,
            answerBank: savedSettings.answerBank
          }
        }

        const merged: AppSettings = {
          ...DEFAULT_SETTINGS,
          llmProvider: normalizeProvider(savedSettings.llmProvider),
          openaiApiKey: apiKey || DEFAULT_SETTINGS.openaiApiKey,
          openaiModel: savedSettings.openaiModel || DEFAULT_SETTINGS.openaiModel,
          apiBaseUrl:
            typeof savedSettings.apiBaseUrl === 'string'
              ? savedSettings.apiBaseUrl
              : DEFAULT_SETTINGS.apiBaseUrl,
          alwaysOnTop:
            typeof savedSettings.alwaysOnTop === 'boolean'
              ? savedSettings.alwaysOnTop
              : DEFAULT_SETTINGS.alwaysOnTop,
          windowOpacity:
            typeof savedSettings.windowOpacity === 'number'
              ? savedSettings.windowOpacity
              : DEFAULT_SETTINGS.windowOpacity,
          pauseThreshold:
            typeof savedSettings.pauseThreshold === 'number'
              ? savedSettings.pauseThreshold
              : DEFAULT_SETTINGS.pauseThreshold,
          autoStart:
            typeof savedSettings.autoStart === 'boolean'
              ? savedSettings.autoStart
              : DEFAULT_SETTINGS.autoStart,
          brandName:
            typeof savedSettings.brandName === 'string'
              ? savedSettings.brandName
              : DEFAULT_SETTINGS.brandName,
          brandLogoPath:
            typeof savedSettings.brandLogoPath === 'string'
              ? savedSettings.brandLogoPath
              : DEFAULT_SETTINGS.brandLogoPath,
          hideFromDock:
            typeof savedSettings.hideFromDock === 'boolean'
              ? savedSettings.hideFromDock
              : DEFAULT_SETTINGS.hideFromDock,
          accountName:
            typeof savedSettings.accountName === 'string'
              ? savedSettings.accountName
              : DEFAULT_SETTINGS.accountName,
          accountEmail:
            typeof savedSettings.accountEmail === 'string'
              ? savedSettings.accountEmail
              : DEFAULT_SETTINGS.accountEmail,
          membershipPlan: normalizeBillingPlan(savedSettings.membershipPlan),
          membershipStatus: normalizeMembershipStatus(savedSettings.membershipStatus),
          singleSession: normalizeSingleSession(savedSettings.singleSession)
        }

        merged.billingInterval = billingIntervalOf(merged.membershipPlan)
        if (merged.singleSession) {
          merged.singleSession = evaluateSingleSession(merged.singleSession)
          if (
            merged.membershipPlan === 'single_session' &&
            (merged.singleSession.status === 'consumed' ||
              merged.singleSession.status === 'expired')
          ) {
            merged.membershipPlan = 'free'
            merged.membershipStatus = 'expired'
            merged.billingInterval = 'none'
          }
        }

        if (
          savedSettings.openaiApiKey &&
          !savedSettings.openaiApiKeyEncrypted &&
          merged.openaiApiKey &&
          safeStorage.isEncryptionAvailable()
        ) {
          this.settings = merged
          this.saveSettings()
          return this.settings
        }

        return merged
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
    return { ...DEFAULT_SETTINGS }
  }

  private saveSettings(): void {
    try {
      const { openaiApiKey, brandLogoDataUrl: _logo, ...rest } = this.settings
      const settingsToSave: PersistedSettings = { ...rest }
      delete settingsToSave.openaiApiKey

      if (openaiApiKey) {
        if (safeStorage.isEncryptionAvailable()) {
          settingsToSave.openaiApiKeyEncrypted = safeStorage
            .encryptString(openaiApiKey)
            .toString('base64')
        } else {
          console.error(
            'safeStorage encryption unavailable; API key will NOT be written to settings.json'
          )
        }
      }

      fs.writeFileSync(this.settingsPath, JSON.stringify(settingsToSave, null, 2))
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }

  getSettings(): AppSettings {
    let singleSession = this.settings.singleSession
      ? evaluateSingleSession(this.settings.singleSession)
      : null

    if (
      this.settings.membershipPlan === 'single_session' &&
      singleSession &&
      (singleSession.status === 'consumed' || singleSession.status === 'expired')
    ) {
      this.settings = {
        ...this.settings,
        membershipPlan: 'free',
        membershipStatus: 'expired',
        billingInterval: 'none',
        singleSession
      }
      this.saveSettings()
    }

    return {
      ...this.settings,
      billingInterval: billingIntervalOf(this.settings.membershipPlan),
      singleSession,
      brandLogoDataUrl: readBrandLogoDataUrl(this.settings.brandLogoPath)
    }
  }

  getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.settings[key]
  }

  updateSettings(updates: Partial<AppSettings>): void {
    const { brandLogoDataUrl: _drop, ...safeUpdates } = updates
    const nextPlan = safeUpdates.membershipPlan
      ? normalizeBillingPlan(safeUpdates.membershipPlan)
      : this.settings.membershipPlan
    this.settings = {
      ...this.settings,
      ...safeUpdates,
      membershipPlan: nextPlan,
      billingInterval: billingIntervalOf(nextPlan),
      llmProvider: normalizeProvider(safeUpdates.llmProvider ?? this.settings.llmProvider),
      brandLogoDataUrl: undefined
    }
    this.saveSettings()
  }

  setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.settings[key] = value
    if (key === 'llmProvider') {
      this.settings.llmProvider = normalizeProvider(value)
    }
    this.saveSettings()
  }

  resetToDefaults(): void {
    this.settings = { ...DEFAULT_SETTINGS }
    this.saveSettings()
  }

  hasApiKeys(): boolean {
    return Boolean(this.settings.openaiApiKey)
  }

  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }
}
