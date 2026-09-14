import {
  AlertCircle,
  CheckCircle,
  CreditCard,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Mic,
  Save,
  User,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AppSettings, useInterviewStore } from '../store/interviewStore'

interface ModelOption {
  id: string
  name: string
}

type LlmProvider = AppSettings['llmProvider']

const OPENAI_DEFAULT_MODELS: ModelOption[] = [
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Default)' },
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
  { id: 'o1-mini', name: 'o1-mini' },
  { id: 'o3-mini', name: 'o3-mini' }
]

const OPENROUTER_DEFAULT_MODELS: ModelOption[] = [
  { id: 'openai/gpt-4o-mini', name: 'OpenAI GPT-4o Mini (Default)' },
  { id: 'openai/gpt-4o', name: 'OpenAI GPT-4o' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' }
]

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  custom: 'Custom (OpenAI-compatible)'
}

const PROVIDER_KEY_HELP: Record<LlmProvider, { href: string; hint: string }> = {
  openai: {
    href: 'https://platform.openai.com/api-keys',
    hint: 'Used for speech-to-text (Whisper) and answer generation'
  },
  openrouter: {
    href: 'https://openrouter.ai/keys',
    hint: 'One key for LLM answers and OpenRouter Whisper STT (openai/whisper-1)'
  },
  custom: {
    href: '',
    hint: 'Any OpenAI-compatible API key. STT uses the same base URL if the provider supports /audio/transcriptions'
  }
}

function defaultModelsFor(provider: LlmProvider): ModelOption[] {
  return provider === 'openrouter' ? OPENROUTER_DEFAULT_MODELS : OPENAI_DEFAULT_MODELS
}

function defaultModelId(provider: LlmProvider): string {
  return defaultModelsFor(provider)[0].id
}

export function SettingsModal(): React.ReactNode | null {
  const { settings, showSettings, setShowSettings, setSettings } = useInterviewStore()
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings)
  const [showApiKey, setShowApiKey] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [logoError, setLogoError] = useState<string | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const [prevSettings, setPrevSettings] = useState(settings)
  if (settings !== prevSettings) {
    setPrevSettings(settings)
    setLocalSettings(settings)
  }

  const provider = localSettings.llmProvider || 'openai'

  // Fetch models when API key / provider / base URL changes (with debounce)
  useEffect(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current)
    }

    const apiKey = localSettings.openaiApiKey?.trim()
    const currentProvider = localSettings.llmProvider || 'openai'
    const baseUrl = localSettings.apiBaseUrl?.trim()

    fetchTimeoutRef.current = setTimeout(async () => {
      if (!apiKey || apiKey.length === 0) {
        setModels([])
        setModelsError(null)
        setModelsLoading(false)
        return
      }

      if (currentProvider === 'custom' && !baseUrl) {
        setModels([])
        setModelsError('Enter a custom base URL to load models')
        setModelsLoading(false)
        return
      }

      setModelsLoading(true)
      setModelsError(null)

      try {
        const result = await window.api.fetchOpenAIModels(apiKey, {
          provider: currentProvider,
          baseUrl: baseUrl || undefined
        })
        if (result.success) {
          setModels(result.models)
          setModelsError(null)

          setLocalSettings((prev) => {
            if (result.models.length > 0 && !result.models.find((m) => m.id === prev.openaiModel)) {
              return { ...prev, openaiModel: result.models[0].id }
            }
            return prev
          })
        } else {
          setModelsError(result.error || 'Failed to fetch models')
          setModels([])
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch models'
        setModelsError(errorMessage)
        setModels([])
      } finally {
        setModelsLoading(false)
      }
    }, 800)

    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current)
      }
    }
  }, [localSettings.openaiApiKey, localSettings.llmProvider, localSettings.apiBaseUrl])

  if (!showSettings) return null

  const fallbackModels = defaultModelsFor(provider)
  const displayModels =
    models.length > 0
      ? models
      : fallbackModels.some((m) => m.id === localSettings.openaiModel) || !localSettings.openaiModel
        ? fallbackModels
        : [{ id: localSettings.openaiModel, name: localSettings.openaiModel }, ...fallbackModels]

  const keyHelp = PROVIDER_KEY_HELP[provider]

  const handleProviderChange = (nextProvider: LlmProvider): void => {
    setLocalSettings((prev) => {
      const nextDefaults = defaultModelsFor(nextProvider)
      const modelStillValid = nextDefaults.some((m) => m.id === prev.openaiModel)
      return {
        ...prev,
        llmProvider: nextProvider,
        openaiModel: modelStillValid ? prev.openaiModel : defaultModelId(nextProvider),
        // Clear custom URL when switching away from custom unless user already set one for override
        apiBaseUrl: nextProvider === 'custom' ? prev.apiBaseUrl : prev.apiBaseUrl
      }
    })
    setModels([])
    setModelsError(null)
  }

  const handleSave = async (): Promise<void> => {
    try {
      setSaveStatus('saving')
      const updatedLocalSettings = {
        ...localSettings,
        llmProvider: localSettings.llmProvider || 'openai',
        apiBaseUrl: localSettings.apiBaseUrl?.trim() || '',
        openaiModel: localSettings.openaiModel || defaultModelId(localSettings.llmProvider || 'openai'),
        brandName: localSettings.brandName?.trim() || '',
        brandLogoPath: localSettings.brandLogoPath || '',
        hideFromDock: localSettings.hideFromDock !== false,
        accountName: localSettings.accountName?.trim() || '',
        accountEmail: localSettings.accountEmail?.trim() || '',
        membershipPlan: localSettings.membershipPlan || 'free',
        membershipStatus: localSettings.membershipStatus || 'inactive'
      }
      const updatedSettings = await window.api.updateSettings(updatedLocalSettings)
      setSettings(updatedSettings as AppSettings)
      setSaveStatus('saved')
      setTimeout(() => {
        setSaveStatus('idle')
        setShowSettings(false)
      }, 1000)
    } catch (err) {
      console.error('Failed to save settings:', err)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }

  const handlePickLogo = async (): Promise<void> => {
    try {
      setLogoError(null)
      const result = await window.api.pickBrandLogo()
      if (!result?.ok) {
        setLogoError(result?.error || 'Failed to import logo')
        return
      }
      if (!result.settings) return
      setLocalSettings(result.settings as AppSettings)
      setSettings(result.settings as AppSettings)
    } catch (err) {
      console.error('Failed to pick logo:', err)
      setLogoError(err instanceof Error ? err.message : 'Failed to import logo')
    }
  }

  const handleClearLogo = async (): Promise<void> => {
    try {
      setLogoError(null)
      const next = await window.api.clearBrandLogo()
      setLocalSettings(next as AppSettings)
      setSettings(next as AppSettings)
    } catch (err) {
      console.error('Failed to clear logo:', err)
      setLogoError('Failed to remove logo')
    }
  }

  const handleOpacityChange = async (value: number): Promise<void> => {
    setLocalSettings({ ...localSettings, windowOpacity: value })
    await window.api.setWindowOpacity(value)
  }

  const handleClose = (): void => {
    setLocalSettings(settings)
    setShowSettings(false)
  }

  const previewName = localSettings.brandName?.trim() || 'Kalfi'
  const previewLogo = localSettings.brandLogoDataUrl?.trim() || ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-dark-900 rounded-xl border border-dark-700 shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <div className="flex items-center gap-2.5">
            {previewLogo ? (
              <img
                src={previewLogo}
                alt=""
                className="h-8 w-8 rounded-lg object-cover border border-dark-600"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Mic className="h-5 w-5 text-primary-foreground" />
              </div>
            )}
            <h2 className="text-lg font-semibold text-dark-100">Settings</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded hover:bg-dark-700 transition-colors text-dark-400 hover:text-dark-200"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-6 space-y-5 max-h-[36rem] overflow-y-auto custom-scrollbar">
          <p className="text-xs text-dark-500">
            API & window preferences only. Company/client context lives in each{' '}
            <span className="text-dark-300">Session</span> (New Session from the header).
          </p>

          {/* Account & membership (scaffold for billing) */}
          <div className="space-y-3 rounded-lg border border-dark-700 bg-dark-800/50 p-3">
            <div className="flex items-start gap-2">
              <User size={16} className="mt-0.5 text-dark-400 shrink-0" />
              <div>
                <label className="block text-sm font-medium text-dark-200">Account</label>
                <p className="text-xs text-dark-500 mt-1">
                  Profile for future sign-in, receipts, and plan upgrades. Saved on this Mac for now —
                  cloud sync ships with Pro billing.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-dark-300">Display name</label>
                <input
                  type="text"
                  value={localSettings.accountName || ''}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, accountName: e.target.value })
                  }
                  placeholder="Your name"
                  maxLength={80}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-100 placeholder-dark-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-dark-300">Email</label>
                <input
                  type="email"
                  value={localSettings.accountEmail || ''}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, accountEmail: e.target.value })
                  }
                  placeholder="you@company.com"
                  maxLength={120}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-100 placeholder-dark-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-dark-600 bg-dark-900/80 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-dark-200">
                  <CreditCard size={14} className="text-dark-400" />
                  Membership
                </div>
                <span className="rounded-full border border-dark-600 px-2 py-0.5 text-[10px] uppercase tracking-wider text-dark-400">
                  {(localSettings.membershipStatus || 'inactive').replace('-', ' ')}
                </span>
              </div>
              <select
                value={localSettings.membershipPlan || 'free'}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    membershipPlan: e.target.value as AppSettings['membershipPlan']
                  })
                }
                className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-100 focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="free">Free / local only</option>
                <option value="byok">BYOK — $14/mo (your key)</option>
                <option value="hosted">Hosted — $19/mo</option>
                <option value="team">Team — $49/mo</option>
              </select>
              <p className="text-[11px] text-dark-500 leading-relaxed">
                Checkout and license sync are next. Choosing a plan here only marks your preferred
                tier until Stripe is connected.
              </p>
              <button
                type="button"
                disabled
                className="w-full px-3 py-2 text-sm rounded-lg border border-dark-600 text-dark-500 cursor-not-allowed"
                title="Coming soon"
              >
                Manage billing — coming soon
              </button>
            </div>
          </div>

          {/* Branding */}
          <div className="space-y-3 rounded-lg border border-dark-700 bg-dark-800/50 p-3">
            <div>
              <label className="block text-sm font-medium text-dark-200">Stealth branding</label>
              <p className="text-xs text-dark-500 mt-1">
                Changes the in-app name, window title, and logo. macOS Dock label still uses the
                packaged app name (Kalfi / Electron in dev) — that cannot be renamed at runtime. With
                Dock shown, your logo can replace the Dock icon.
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-md border border-dark-600 bg-dark-900 px-3 py-2">
              {previewLogo ? (
                <img
                  src={previewLogo}
                  alt=""
                  className="h-8 w-8 rounded-lg object-cover border border-dark-600"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                  <Mic className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-dark-500">Preview</p>
                <p className="text-sm font-semibold text-dark-100 truncate">{previewName}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-dark-300">App display name</label>
              <input
                type="text"
                value={localSettings.brandName || ''}
                onChange={(e) => setLocalSettings({ ...localSettings, brandName: e.target.value })}
                placeholder="e.g. Notes Helper, Calendar, Work Pad"
                maxLength={40}
                className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-100 placeholder-dark-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handlePickLogo}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-dark-600 bg-dark-800 text-dark-200 hover:border-blue-500 hover:text-dark-100 transition-colors"
              >
                <ImagePlus size={14} />
                {previewLogo ? 'Change logo' : 'Upload logo'}
              </button>
              {previewLogo ? (
                <button
                  type="button"
                  onClick={handleClearLogo}
                  className="px-3 py-2 text-sm rounded-lg border border-dark-600 text-dark-400 hover:text-dark-200 transition-colors"
                >
                  Remove logo
                </button>
              ) : null}
            </div>
            {logoError ? (
              <p className="text-xs text-red-400 flex items-start gap-1.5">
                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                <span>{logoError}</span>
              </p>
            ) : (
              <p className="text-[11px] text-dark-500">PNG, JPG, WEBP, or GIF — preferably square.</p>
            )}

            <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={localSettings.hideFromDock !== false}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, hideFromDock: e.target.checked })
                }
                className="mt-0.5 accent-blue-500"
              />
              <span>
                <span className="block text-sm text-dark-200">Hide from Dock</span>
                <span className="block text-xs text-dark-500 mt-0.5">
                  Recommended for stealth. Uncheck to show in Dock / Cmd+Tab (logo applies to Dock
                  icon when visible). Save to apply.
                </span>
              </span>
            </label>
          </div>

          {/* Provider */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-dark-200">AI Provider</label>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as LlmProvider)}
              className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-100 focus:outline-none focus:border-blue-500 transition-colors"
            >
              {(Object.keys(PROVIDER_LABELS) as LlmProvider[]).map((id) => (
                <option key={id} value={id}>
                  {PROVIDER_LABELS[id]}
                </option>
              ))}
            </select>
            <p className="text-xs text-dark-500">
              {provider === 'openrouter'
                ? 'OpenRouter routes chat + Whisper STT with one key'
                : provider === 'custom'
                  ? 'Point at LiteLLM, Together, Groq, Azure OpenAI-compatible gateways, etc.'
                  : 'Direct OpenAI API for Whisper STT and GPT answers'}
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-dark-200">
              {PROVIDER_LABELS[provider]} API Key
              {keyHelp.href ? (
                <a
                  href={keyHelp.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-xs text-blue-400 hover:underline"
                >
                  Get key →
                </a>
              ) : null}
            </label>
            <p className="text-xs text-dark-500">{keyHelp.hint}</p>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={localSettings.openaiApiKey}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, openaiApiKey: e.target.value })
                }
                placeholder={`Enter your ${PROVIDER_LABELS[provider]} API key`}
                className="w-full px-3 py-2 pr-10 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-100 placeholder-dark-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-dark-400 hover:text-dark-200"
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Base URL */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-dark-200">
              API Base URL
              {provider !== 'custom' ? (
                <span className="ml-2 text-xs font-normal text-dark-500">(optional override)</span>
              ) : (
                <span className="ml-2 text-xs font-normal text-red-400">(required)</span>
              )}
            </label>
            <input
              type="text"
              value={localSettings.apiBaseUrl || ''}
              onChange={(e) => setLocalSettings({ ...localSettings, apiBaseUrl: e.target.value })}
              placeholder={
                provider === 'openrouter'
                  ? 'https://openrouter.ai/api/v1'
                  : provider === 'custom'
                    ? 'https://your-gateway.example/v1'
                    : 'https://api.openai.com/v1'
              }
              className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-100 placeholder-dark-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <p className="text-xs text-dark-500">
              Leave empty to use the provider default
              {provider === 'openrouter'
                ? ' (https://openrouter.ai/api/v1)'
                : provider === 'openai'
                  ? ' (https://api.openai.com/v1)'
                  : ''}
              .
            </p>
          </div>

          {/* Model */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-dark-200">
              Answer Generation Model
            </label>
            {modelsLoading ? (
              <div className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg animate-pulse">
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-blue-400" />
                  <span className="text-sm text-dark-400">Loading models...</span>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <select
                  value={localSettings.openaiModel || defaultModelId(provider)}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, openaiModel: e.target.value })
                  }
                  className={`w-full px-3 py-2 bg-dark-800 border ${
                    modelsError
                      ? 'border-red-500/50 focus:border-red-500'
                      : 'border-dark-600 focus:border-blue-500'
                  } rounded-lg text-sm text-dark-100 focus:outline-none transition-colors`}
                >
                  {displayModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
                {modelsError ? (
                  <div className="flex items-center gap-1.5 text-xs text-red-400">
                    <AlertCircle size={12} />
                    <span>{modelsError}</span>
                  </div>
                ) : !localSettings.openaiApiKey?.trim() ? (
                  <p className="text-xs text-dark-500">
                    Default models shown. Enter an API key to load models from your provider.
                  </p>
                ) : null}
              </div>
            )}
          </div>

          {/* Pause Threshold */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-dark-200">
              Silence Detection
              <span className="ml-2 text-xs text-dark-400">{localSettings.pauseThreshold}ms</span>
            </label>
            <input
              type="range"
              min="500"
              max="3000"
              step="100"
              value={localSettings.pauseThreshold}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, pauseThreshold: Number(e.target.value) })
              }
              className="w-full accent-blue-500"
            />
            <p className="text-xs text-dark-500">
              How long to wait detecting the question for transcription (Recommended : 1500ms)
            </p>
          </div>

          {/* Window Opacity */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-dark-200">
              Window Opacity
              <span className="ml-2 text-xs text-dark-400">
                {Math.round(localSettings.windowOpacity * 100)}%
              </span>
            </label>
            <input
              type="range"
              min="0.3"
              max="1"
              step="0.05"
              value={localSettings.windowOpacity}
              onChange={(e) => handleOpacityChange(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-dark-700">
          <div className="flex items-center gap-3 min-h-[36px]">
            {saveStatus === 'error' && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertCircle size={16} />
                <span>Failed to save</span>
              </div>
            )}
            {saveStatus === 'saved' && (
              <div className="flex items-center gap-2 text-sm text-green-400">
                <CheckCircle size={16} />
                <span>Saved!</span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-dark-300 hover:text-dark-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <Save size={16} />
              <span>{saveStatus === 'saving' ? 'Saving...' : 'Save'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
