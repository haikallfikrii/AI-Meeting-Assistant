import { config } from 'dotenv'
import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { DEFAULT_CHAT_MODELS, LlmProvider } from './providerConfig'

config()

export type { LlmProvider }

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
}

type PersistedSettings = Omit<AppSettings, 'openaiApiKey'> & {
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

const DEFAULT_SETTINGS: AppSettings = {
  llmProvider: normalizeProvider(process.env.LLM_PROVIDER),
  openaiApiKey: getEnvApiKey(),
  openaiModel: process.env.OPENAI_MODEL || DEFAULT_CHAT_MODELS.openai,
  apiBaseUrl: process.env.API_BASE_URL || '',
  alwaysOnTop: true,
  windowOpacity: 1.0,
  pauseThreshold: 1500,
  autoStart: false
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
              : DEFAULT_SETTINGS.autoStart
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
      const { openaiApiKey, ...rest } = this.settings
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
    return { ...this.settings }
  }

  getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.settings[key]
  }

  updateSettings(updates: Partial<AppSettings>): void {
    this.settings = {
      ...this.settings,
      ...updates,
      llmProvider: normalizeProvider(updates.llmProvider ?? this.settings.llmProvider)
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
