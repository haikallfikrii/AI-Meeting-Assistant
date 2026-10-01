import {
  BrowserWindow,
  app,
  clipboard,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  shell,
  systemPreferences
} from 'electron'
import { createHash } from 'node:crypto'
import os from 'node:os'
import { AnswerEntry } from '../../preload/index'
import { HistoryManager } from '../services/historyManager'
import { OpenAIService, otherPartyLabel } from '../services/openaiService'
import {
  DEFAULT_CHAT_MODELS,
  DEFAULT_STT_MODELS,
  DEFAULT_VISION_MODELS,
  LlmProvider,
  createOpenAIClient
} from '../services/providerConfig'
import { QuestionDetector } from '../services/questionDetector'
import { ScreenshotService } from '../services/screenshotService'
import { SessionManager } from '../services/sessionManager'
import { SessionMode } from '../services/promptBuilder'
import { AppSettings, SettingsManager } from '../services/settingsManager'
import {
  hasPaidAccess,
  consumeSingleSession,
  featureTierOf,
  startSingleSession
} from '../services/entitlement'
import { WorkSession, whisperLanguageCode } from '../services/sessionTypes'
import { VisionService } from '../services/visionService'
import { TranscriptEvent, WhisperService } from '../services/whisperService'
import { applyOverlayWindowBehavior } from '../windowOverlay'
import {
  applyDockVisibility,
  applyRuntimeBranding,
  clearStoredBrandLogo,
  pickAndStoreBrandLogo,
  shouldHideFromDock
} from '../services/branding'

/** Global + in-app Shot hotkey (⌘⇧S / Ctrl+Shift+S) */
export const SHOT_ACCELERATOR = 'CommandOrControl+Shift+S'

/**
 * Renderer audio lanes: `them` = system/meeting audio (the other party),
 * `me` = the user's microphone kept separate, `mixed` = a single mic stream
 * where speakers cannot be told apart (Mic-only source or system fallback).
 */
type AudioChannel = 'them' | 'me' | 'mixed'
type Speaker = 'them' | 'me' | 'unknown'

interface LiveLine {
  speaker: Speaker
  text: string
  at: number
  micAsk?: boolean
}

const LIVE_LOG_MAX = 40
const CONTEXT_WINDOW_MS = 3 * 60_000
const CONTEXT_MAX_LINES = 12
/** Mic lines wait this long so a speaker echo of the other party can be matched and dropped. */
const ME_ECHO_HOLD_MS = 1500
const ECHO_WINDOW_MS = 20_000

let sttServices: Partial<Record<AudioChannel, WhisperService>> = {}
let createStt: ((channel: AudioChannel) => WhisperService) | null = null
let liveLog: LiveLine[] = []
let micAskArmedAt = 0
let openaiService: OpenAIService | null = null
let questionDetector: QuestionDetector | null = null
let settingsManager: SettingsManager | null = null
let sessionManager: SessionManager | null = null
let historyManager: HistoryManager | null = null
let screenshotService: ScreenshotService | null = null
let visionService: VisionService | null = null
let mainWindow: BrowserWindow | null = null
let isCapturing = false
/** When true, the next final transcript is force-answered (manual mic / safety net). */
let forceNextTranscriptAsQuestion = false
/** Current capture mix — used to decide interviewer vs self speech. */
let captureAudioSource: 'microphone' | 'system' | 'both' = 'both'

/** Stable per-machine id (not persisted, survives reinstall) used to limit free trials. */
function deviceId(): string {
  const cpus = os.cpus()
  const parts = [
    os.platform(),
    os.arch(),
    os.hostname(),
    os.userInfo().username,
    os.homedir(),
    cpus[0]?.model || '',
    String(cpus.length),
    String(os.totalmem())
  ]
  return `d1_${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32)}`
}

function assertEntitled(): void {
  const s = settingsManager?.getSettings()
  if (
    !s ||
    !hasPaidAccess(
      s.membershipPlan,
      s.membershipStatus,
      s.authToken,
      s.singleSession,
      s.accountEmail
    )
  ) {
    throw new Error(
      'Sign in with an active Kalfi plan to use the app. Open Account or visit kalfi.app to subscribe.'
    )
  }
}

function emitTriggerShot(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('trigger-shot')
}

export function registerShotShortcut(): void {
  try {
    globalShortcut.unregister(SHOT_ACCELERATOR)
  } catch {
    /* ignore */
  }
  try {
    const ok = globalShortcut.register(SHOT_ACCELERATOR, () => {
      emitTriggerShot()
    })
    if (!ok) {
      console.warn('Shot shortcut already in use:', SHOT_ACCELERATOR)
    }
  } catch (error) {
    console.error('Failed to register Shot shortcut:', error)
  }
}

export function unregisterShotShortcut(): void {
  try {
    globalShortcut.unregister(SHOT_ACCELERATOR)
  } catch {
    /* ignore */
  }
}

function sttList(): WhisperService[] {
  return Object.values(sttServices).filter((s): s is WhisperService => Boolean(s))
}

function getStt(channel: AudioChannel): WhisperService | null {
  const existing = sttServices[channel]
  if (existing) return existing
  if (!createStt) return null
  const service = createStt(channel)
  sttServices[channel] = service
  service.start()
  return service
}

function stopAllStt(): void {
  for (const service of sttList()) {
    service.stop()
    service.removeAllListeners()
  }
  sttServices = {}
}

function pushLiveLine(line: LiveLine): void {
  liveLog.push(line)
  if (liveLog.length > LIVE_LOG_MAX) liveLog = liveLog.slice(-LIVE_LOG_MAX)
}

function emitLiveLine(line: LiveLine): void {
  mainWindow?.webContents.send('transcript', {
    text: line.text,
    isFinal: true,
    confidence: 1,
    speaker: line.speaker,
    micAsk: Boolean(line.micAsk)
  })
}

/** Speaker-labelled recent transcript for the answer prompt, oldest first. */
function transcriptContext(): string {
  const other = otherPartyLabel(sessionManager?.getActiveSession()?.mode || 'interview')
  const cutoff = Date.now() - CONTEXT_WINDOW_MS
  return liveLog
    .filter((l) => l.at >= cutoff)
    .slice(-CONTEXT_MAX_LINES)
    .map((l) => {
      const who =
        l.speaker === 'them'
          ? other
          : l.speaker === 'me'
            ? l.micAsk
              ? 'Me (restating the question)'
              : 'Me'
            : 'Unlabelled speaker'
      return `${who}: ${l.text}`
    })
    .join('\n')
}

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)
  )
}

/** True when a mic line is just the other party's voice leaking from the speakers. */
function isEchoOfOtherParty(text: string, at: number): boolean {
  const mine = words(text)
  if (mine.size < 3) return false
  return liveLog.some((l) => {
    if (l.speaker !== 'them' || Math.abs(l.at - at) > ECHO_WINDOW_MS) return false
    const theirs = words(l.text)
    if (theirs.size < 3) return false
    let shared = 0
    mine.forEach((w) => {
      if (theirs.has(w)) shared++
    })
    return shared / Math.min(mine.size, theirs.size) >= 0.7
  })
}

function setMicAskArmed(enabled: boolean): void {
  forceNextTranscriptAsQuestion = enabled
  if (enabled) {
    micAskArmedAt = Date.now()
    sttServices.me?.resetBuffer()
    sttServices.mixed?.resetBuffer()
  }
  mainWindow?.webContents.send('force-next-question-changed', enabled)
}

async function answerDetectedText(rawText: string, speaker: Speaker): Promise<void> {
  if (!openaiService || !questionDetector) return
  const text = rawText.trim()
  if (!text) return

  let toAnswer = text
  if (speaker === 'them') {
    questionDetector.setLastInterviewerQuestion(text)
  } else {
    const isConfirm = questionDetector.isConfirmation(text)
    const pending = questionDetector.getLastInterviewerQuestion()
    if (isConfirm && pending) {
      console.log('[Answer] Confirmation detected — answering prior interviewer question')
      toAnswer = pending
    } else if (questionDetector.isLikelySelfSpeech(text) && captureAudioSource !== 'system') {
      console.log('[Answer] Skipping auto-answer for likely self speech:', text.slice(0, 80))
      return
    } else if (captureAudioSource === 'microphone') {
      // Mic-only: only answer when Mic Ask armed or on manual Ask
      console.log('[Answer] Mic-only capture — skip auto question detect')
      return
    } else if (!isConfirm) {
      questionDetector.setLastInterviewerQuestion(text)
    }
  }

  mainWindow?.webContents.send('question-detected', {
    text: toAnswer,
    confidence: 1,
    questionType: 'direct'
  })
  await openaiService.generateAnswer(toAnswer, { transcript: transcriptContext() })
}

async function answerMicAsk(restated: string, transcript: string): Promise<void> {
  if (!openaiService) return
  mainWindow?.webContents.send('question-detected', {
    text: restated,
    confidence: 1,
    questionType: 'direct'
  })
  await openaiService.generateAnswer(restated, { transcript, restated: true })
}

function handleChannelTranscript(channel: AudioChannel, event: TranscriptEvent): void {
  const text = event.text.trim()
  if (!text || !event.isFinal) return
  console.log(`[Transcript:${channel}]`, text)

  const micAskLine =
    forceNextTranscriptAsQuestion && channel !== 'them' && event.startedAt >= micAskArmedAt - 500
  if (micAskLine) {
    setMicAskArmed(false)
    const transcript = transcriptContext()
    const line: LiveLine = {
      speaker: channel === 'me' ? 'me' : 'unknown',
      text,
      at: event.startedAt,
      micAsk: true
    }
    pushLiveLine(line)
    emitLiveLine(line)
    answerMicAsk(text, transcript).catch((error) => {
      mainWindow?.webContents.send('answer-error', (error as Error).message)
    })
    return
  }

  if (channel === 'me') {
    setTimeout(() => {
      if (isEchoOfOtherParty(text, event.startedAt)) {
        console.log('[Transcript:me] Dropped speaker echo:', text.slice(0, 80))
        return
      }
      const line: LiveLine = { speaker: 'me', text, at: event.startedAt }
      pushLiveLine(line)
      emitLiveLine(line)
    }, ME_ECHO_HOLD_MS)
    return
  }

  const speaker: Speaker = channel === 'them' ? 'them' : 'unknown'
  const line: LiveLine = { speaker, text, at: event.startedAt }
  pushLiveLine(line)
  emitLiveLine(line)

  questionDetector?.addTranscript(text, true)
  const early = questionDetector?.checkEarlyDetection(text)
  if (early) {
    console.log('Early question detection triggered:', early.text)
    answerDetectedText(early.text, speaker).catch((error) => {
      mainWindow?.webContents.send('answer-error', (error as Error).message)
    })
  }
}

function persistExchange(meta: {
  sessionId: string | null
  question: string
  answer: string
}): void {
  if (!meta.sessionId || !meta.question || !meta.answer) return
  const updated = sessionManager?.appendExchange(meta.sessionId, meta.question, meta.answer)
  if (updated) {
    mainWindow?.webContents.send('session-updated', updated)
  }
}

function wireOpenAIServiceEvents(service: OpenAIService): void {
  service.removeAllListeners('stream')
  service.removeAllListeners('complete')
  service.removeAllListeners('exchange')

  service.on('stream', (chunk) => {
    mainWindow?.webContents.send('answer-stream', chunk)
  })

  service.on('complete', (answer) => {
    mainWindow?.webContents.send('answer-complete', answer)
  })

  service.on('exchange', (meta) => {
    persistExchange(meta)
  })
}

function kalfiApiBase(): string {
  return (
    process.env.KALFI_API_URL ||
    process.env.API_PUBLIC_URL ||
    'https://api.srv835792.hstgr.cloud'
  ).replace(/\/$/, '')
}

interface AiConnection {
  hosted: boolean
  apiKey: string
  provider: LlmProvider
  baseUrl?: string
  chatModel: string
  sttModel: string
  visionModel: string
}

/** Hosted / Team / Single Session use Kalfi's proxy (no user key); BYOK uses Settings key. */
function isHostedPlan(settings: AppSettings | undefined | null): boolean {
  if (!settings?.authToken?.trim()) return false
  const tier = featureTierOf(settings.membershipPlan)
  return tier === 'hosted' || tier === 'team' || tier === 'single_session'
}

function resolveAiConnection(): AiConnection {
  const settings = settingsManager?.getSettings()
  if (settings && isHostedPlan(settings)) {
    return {
      hosted: true,
      apiKey: settings.authToken.trim(),
      provider: 'openrouter',
      baseUrl: `${kalfiApiBase()}/v1/ai/openai`,
      chatModel: DEFAULT_CHAT_MODELS.openrouter,
      sttModel: DEFAULT_STT_MODELS.openrouter,
      visionModel: DEFAULT_VISION_MODELS.openrouter
    }
  }

  if (!settings?.openaiApiKey) {
    throw new Error('API key not configured. Please add it in Settings.')
  }
  const provider = settings.llmProvider || 'openai'
  return {
    hosted: false,
    apiKey: settings.openaiApiKey,
    provider,
    baseUrl: settings.apiBaseUrl,
    chatModel: settings.openaiModel || DEFAULT_CHAT_MODELS[provider],
    sttModel: DEFAULT_STT_MODELS[provider],
    visionModel: DEFAULT_VISION_MODELS[provider]
  }
}

function ensureOpenAIService(): OpenAIService {
  const conn = resolveAiConnection()
  const activeSession = sessionManager?.getActiveSession() || null

  if (!openaiService) {
    openaiService = new OpenAIService({
      apiKey: conn.apiKey,
      provider: conn.provider,
      baseUrl: conn.baseUrl,
      model: conn.chatModel,
      session: activeSession
    })
    wireOpenAIServiceEvents(openaiService)
  } else if (activeSession) {
    openaiService.loadSession(activeSession)
  }

  return openaiService
}

export function initializeIpcHandlers(window: BrowserWindow): void {
  mainWindow = window
  settingsManager = new SettingsManager()
  sessionManager = new SessionManager()
  historyManager = new HistoryManager()
  questionDetector = new QuestionDetector()

  const legacy = settingsManager.getLegacyContextForMigration()
  if (legacy) {
    sessionManager.migrateFromLegacySettings(legacy)
    settingsManager.clearLegacyContext()
    // Rewrite settings without legacy fields
    settingsManager.updateSettings({})
  }

  const bootSettings = settingsManager.getSettings()
  const demoRecord = ['1', 'true', 'yes'].includes(
    (process.env.KALFI_DEMO_RECORD || '').trim().toLowerCase()
  )
  applyRuntimeBranding(
    mainWindow,
    bootSettings.brandName,
    bootSettings.brandLogoPath,
    demoRecord ? false : shouldHideFromDock(bootSettings.hideFromDock)
  )
  // Persist default hide-from-dock so first-run settings already match reality
  if (!demoRecord && typeof bootSettings.hideFromDock !== 'boolean') {
    settingsManager.updateSettings({ hideFromDock: true })
  }

  registerShotShortcut()

  ipcMain.handle('get-shot-shortcut', () => {
    return process.platform === 'darwin' ? '⌘⇧S' : 'Ctrl+Shift+S'
  })

  /**
   * Proxy Kalfi cloud API from main process — avoids Chromium CORS
   * ("Failed to fetch") from the Electron renderer.
   */
  ipcMain.handle(
    'kalfi-api',
    async (
      _event,
      opts: {
        path: string
        method?: string
        body?: unknown
        token?: string
      }
    ) => {
      const base = kalfiApiBase()
      const path = opts.path.startsWith('/') ? opts.path : `/${opts.path}`
      const method = (opts.method || 'GET').toUpperCase()
      if (
        (path === '/v1/auth/register' || path === '/v1/auth/trial/start') &&
        (opts.body === undefined || (typeof opts.body === 'object' && opts.body !== null))
      ) {
        opts = { ...opts, body: { ...(opts.body as object), deviceId: deviceId() } }
      }
      try {
        const res = await fetch(`${base}${path}`, {
          method,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {})
          },
          body:
            opts.body !== undefined && method !== 'GET' && method !== 'HEAD'
              ? JSON.stringify(opts.body)
              : undefined
        })
        const text = await res.text()
        let data: unknown = null
        try {
          data = text ? JSON.parse(text) : null
        } catch {
          data = { error: text || `HTTP ${res.status}` }
        }
        return { ok: res.ok, status: res.status, data }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not reach Kalfi servers'
        return {
          ok: false,
          status: 0,
          data: {
            error: `${message}. Check your internet connection and try again.`
          }
        }
      }
    }
  )

  // Settings handlers
  ipcMain.handle('get-settings', () => {
    return settingsManager?.getSettings()
  })

  ipcMain.handle('update-settings', (_event, updates: Partial<AppSettings>) => {
    settingsManager?.updateSettings(updates)

    if (typeof updates.pauseThreshold === 'number') {
      for (const service of sttList()) service.setSilenceMs(updates.pauseThreshold)
    }

    // Apply window settings immediately
    if (updates.alwaysOnTop !== undefined && mainWindow) {
      applyOverlayWindowBehavior(mainWindow, updates.alwaysOnTop)
    }
    if (updates.windowOpacity !== undefined && mainWindow) {
      mainWindow.setOpacity(updates.windowOpacity)
    }

    const next = settingsManager?.getSettings()
    if (next) {
      applyRuntimeBranding(mainWindow, next.brandName, next.brandLogoPath, next.hideFromDock)
    }

    return next
  })

  ipcMain.handle('pick-brand-logo', async () => {
    try {
      const stored = await pickAndStoreBrandLogo(mainWindow)
      if (!stored) return { ok: true as const, settings: settingsManager?.getSettings() }
      settingsManager?.updateSettings({ brandLogoPath: stored.path })
      const next = settingsManager?.getSettings()
      if (next) {
        applyRuntimeBranding(mainWindow, next.brandName, next.brandLogoPath, next.hideFromDock)
      }
      return { ok: true as const, settings: next }
    } catch (error) {
      console.error('pick-brand-logo failed:', error)
      const message = error instanceof Error ? error.message : 'Failed to import logo'
      return {
        ok: false as const,
        error: message,
        settings: settingsManager?.getSettings()
      }
    }
  })

  ipcMain.handle('clear-brand-logo', () => {
    const current = settingsManager?.getSettings()
    clearStoredBrandLogo(current?.brandLogoPath)
    settingsManager?.updateSettings({ brandLogoPath: '' })
    const next = settingsManager?.getSettings()
    if (next) {
      applyRuntimeBranding(mainWindow, next.brandName, next.brandLogoPath, next.hideFromDock)
    }
    return next
  })

  ipcMain.handle('has-api-keys', () => {
    return isHostedPlan(settingsManager?.getSettings()) || settingsManager?.hasApiKeys()
  })

  // ---- Sessions (ChatGPT-style workspaces) ----
  ipcMain.handle('list-sessions', () => {
    return sessionManager?.listSessions() || []
  })

  ipcMain.handle('get-active-session', () => {
    return sessionManager?.getActiveSession() || null
  })

  ipcMain.handle(
    'create-session',
    (
      _event,
      input: {
        mode: SessionMode
        title?: string
        context?: Partial<WorkSession['context']>
      }
    ) => {
      const session = sessionManager?.createSession(input)
      if (openaiService && session) {
        openaiService.loadSession(session)
      }
      return session
    }
  )

  ipcMain.handle(
    'update-session',
    (
      _event,
      id: string,
      updates: {
        title?: string
        mode?: SessionMode
        context?: Partial<WorkSession['context']>
      }
    ) => {
      const session = sessionManager?.updateSession(id, updates)
      if (session && sessionManager?.getActiveSession()?.id === id) {
        if (openaiService) openaiService.loadSession(session)
        for (const service of sttList()) {
          service.setLanguage(whisperLanguageCode(session.context.meetingLanguage))
        }
      }
      return session
    }
  )

  ipcMain.handle('set-active-session', (_event, id: string) => {
    const session = sessionManager?.setActiveSession(id)
    if (session) {
      if (openaiService) openaiService.loadSession(session)
      for (const service of sttList()) {
        service.setLanguage(whisperLanguageCode(session.context.meetingLanguage))
      }
    }
    return session
  })

  ipcMain.handle('delete-session', (_event, id: string) => {
    const result = sessionManager?.deleteSession(id)
    if (openaiService && result?.active) {
      openaiService.loadSession(result.active)
    }
    return result
  })

  ipcMain.handle('clear-session-conversation', (_event, id: string) => {
    const session = sessionManager?.clearSessionConversation(id)
    if (openaiService && session && openaiService.getActiveSessionId() === id) {
      openaiService.loadSession(session)
    }
    return session
  })

  ipcMain.handle('continue-thread', (_event, fromSessionId: string) => {
    const session = sessionManager?.continueThread(fromSessionId)
    if (openaiService && session) {
      openaiService.loadSession(session)
    }
    return session
  })

  ipcMain.handle('ask-question', async (_event, question: string) => {
    const text = question?.trim()
    if (!text) {
      return { success: false, error: 'Empty question' }
    }
    try {
      const service = ensureOpenAIService()
      // Manual Ask: if user is confirming, answer the stored interviewer question
      let toAnswer = text
      if (questionDetector?.isConfirmation(text)) {
        const pending = questionDetector.getLastInterviewerQuestion()
        if (pending) toAnswer = pending
      } else if (!questionDetector?.isLikelySelfSpeech(text)) {
        questionDetector?.setLastInterviewerQuestion(text)
      }
      mainWindow?.webContents.send('question-detected', {
        text: toAnswer,
        confidence: 1,
        questionType: 'direct'
      })
      await service.generateAnswer(toAnswer, { transcript: transcriptContext() })
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to answer'
      mainWindow?.webContents.send('answer-error', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('set-force-next-question', (_event, enabled: boolean) => {
    setMicAskArmed(Boolean(enabled))
    return forceNextTranscriptAsQuestion
  })

  ipcMain.handle('get-force-next-question', () => forceNextTranscriptAsQuestion)

  ipcMain.handle('summarize-session', async (_event, sessionId?: string) => {
    try {
      const targetId = sessionId || sessionManager?.getActiveSession()?.id
      if (!targetId) {
        return { success: false, error: 'No active session' }
      }
      const session = sessionManager?.getSession(targetId)
      if (!session) {
        return { success: false, error: 'Session not found' }
      }

      const service = ensureOpenAIService()
      service.loadSession(session)
      const summary = await service.summarizeSession()
      const updated = sessionManager?.setSummary(targetId, summary)
      if (updated) {
        mainWindow?.webContents.send('session-updated', updated)
      }
      return { success: true, summary, session: updated }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to summarize'
      return { success: false, error: errorMessage }
    }
  })

  // Fetch chat models from the configured OpenAI-compatible provider
  ipcMain.handle(
    'fetch-openai-models',
    async (_event, apiKey: string, options?: { provider?: LlmProvider; baseUrl?: string }) => {
      try {
        if (!apiKey || apiKey.trim().length === 0) {
          throw new Error('API key is required')
        }

        const provider = options?.provider || 'openai'
        const client = createOpenAIClient({
          apiKey,
          provider,
          baseUrl: options?.baseUrl
        })

        const response = await client.models.list()

        const chatModels = response.data.map((model) => ({
          id: model.id,
          name: model.id
        }))

        return { success: true, models: chatModels }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch models'
        console.error('Error fetching models:', errorMessage)
        return { success: false, error: errorMessage, models: [] }
      }
    }
  )

  // Audio capture handlers
  ipcMain.handle('start-capture', async (_event, source?: 'microphone' | 'system' | 'both') => {
    assertEntitled()
    const settings = settingsManager?.getSettings()
    captureAudioSource =
      source === 'microphone' || source === 'system' || source === 'both' ? source : 'both'

    const conn = resolveAiConnection()
    console.log('AI connection:', {
      mode: conn.hosted ? 'hosted' : 'byok',
      provider: conn.provider,
      baseUrl: conn.baseUrl || '(provider default)'
    })

    if (settings?.membershipPlan === 'single_session') {
      const pass = settings.singleSession
      if (!pass) {
        throw new Error('Single Session Pass missing. Purchase a pass or upgrade.')
      }
      const started = startSingleSession(pass)
      settingsManager?.updateSettings({
        singleSession: started.state,
        membershipStatus: started.ok ? 'active' : 'expired',
        membershipPlan:
          started.state.status === 'expired' || started.state.status === 'consumed'
            ? 'free'
            : 'single_session'
      })
      if (!started.ok) {
        throw new Error(started.reason)
      }
    }

    try {
      // IMPORTANT: Clean up any existing services/listeners first to prevent duplicates
      stopAllStt()
      if (openaiService) {
        openaiService.removeAllListeners()
        openaiService = null
      }
      questionDetector?.removeAllListeners()
      questionDetector?.clearBuffer()
      liveLog = []
      forceNextTranscriptAsQuestion = false

      const activeSession = sessionManager?.getActiveSession() || null
      /** Speaker of the lane whose utterance the question detector is evaluating. */
      let detectorSpeaker: Speaker = 'unknown'

      createStt = (channel) => {
        const live = settingsManager?.getSettings()
        const service = new WhisperService({
          apiKey: conn.apiKey,
          provider: conn.provider,
          baseUrl: conn.baseUrl,
          model: conn.sttModel,
          language: whisperLanguageCode(
            sessionManager?.getActiveSession()?.context.meetingLanguage
          ),
          silenceMs: live?.pauseThreshold,
          minWords: channel === 'me' ? 2 : 3
        })

        service.on('transcript', (event: TranscriptEvent) => {
          handleChannelTranscript(channel, event)
        })

        if (channel !== 'me') {
          service.on('utteranceEnd', () => {
            detectorSpeaker = channel === 'them' ? 'them' : 'unknown'
            questionDetector?.onUtteranceEnd()
            mainWindow?.webContents.send('utterance-end')
          })
        }

        service.on('error', (error) => {
          const errorMessage = error instanceof Error ? error.message : 'Unknown capture error'
          console.error(`Whisper error (${channel}):`, errorMessage)
          mainWindow?.webContents.send('capture-error', errorMessage)
        })

        return service
      }

      // Initialize OpenAI-compatible service for answer generation (bound to active session)
      openaiService = new OpenAIService({
        apiKey: conn.apiKey,
        provider: conn.provider,
        baseUrl: conn.baseUrl,
        model: conn.chatModel,
        session: activeSession
      })

      wireOpenAIServiceEvents(openaiService)

      questionDetector?.on('questionDetected', async (detection) => {
        console.log('Question detected:', detection.text)
        try {
          await answerDetectedText(detection.text, detectorSpeaker)
        } catch (error) {
          mainWindow?.webContents.send('answer-error', (error as Error).message)
        }
      })

      isCapturing = true
      console.log('Audio capture started successfully')

      return { success: true }
    } catch (error) {
      console.error('start-capture error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to start capture'
      throw new Error(errorMessage)
    }
  })

  ipcMain.handle('stop-capture', async () => {
    isCapturing = false
    setMicAskArmed(false)
    stopAllStt()
    createStt = null

    // Keep openaiService alive so manual Ask / Summarize still work after Stop
    // (listeners remain wired)

    questionDetector?.removeAllListeners()
    questionDetector?.clearBuffer()
    console.log('Audio capture stopped')

    const settings = settingsManager?.getSettings()
    if (
      settings?.membershipPlan === 'single_session' &&
      settings.singleSession?.status === 'active_in_session'
    ) {
      const consumed = consumeSingleSession(settings.singleSession)
      settingsManager?.updateSettings({
        singleSession: consumed,
        membershipPlan: 'free',
        membershipStatus: 'expired',
        billingInterval: 'none'
      })
    }

    return { success: true }
  })

  ipcMain.handle('get-capture-status', () => {
    return isCapturing
  })

  // Audio data from renderer
  ipcMain.on('audio-data', (_event, audioData: ArrayBuffer, channel?: AudioChannel) => {
    if (!isCapturing) return
    const lane: AudioChannel =
      channel === 'them' || channel === 'me' || channel === 'mixed' ? channel : 'mixed'
    getStt(lane)?.addAudioData(audioData)
  })

  // Get audio sources for system audio capture (needs macOS Screen Recording)
  ipcMain.handle('get-audio-sources', async () => {
    const screenStatus =
      process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted'
    console.log('[kalfi] screen recording status:', screenStatus, 'exe:', app.getPath('exe'))

    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 0, height: 0 },
        fetchWindowIcons: false
      })

      return sources.map((source) => ({
        id: source.id,
        name: source.name,
        thumbnail: ''
      }))
    } catch (err) {
      console.error('[kalfi] get-audio-sources failed:', err, 'status=', screenStatus)
      // Return empty instead of throwing — caller can fall back to mic without a fatal UI error
      return []
    }
  })

  ipcMain.handle('get-demo-record-mode', () => {
    const v = (process.env.KALFI_DEMO_RECORD || '').trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'yes'
  })

  ipcMain.handle('get-screen-recording-status', () => {
    if (process.platform !== 'darwin') return { status: 'granted' as const }
    return { status: systemPreferences.getMediaAccessStatus('screen') }
  })

  ipcMain.handle('open-screen-recording-settings', () => {
    if (process.platform === 'darwin') {
      void shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
      )
    }
    return { ok: true }
  })

  // Window control handlers
  ipcMain.handle('set-always-on-top', (_event, value: boolean) => {
    if (mainWindow) {
      applyOverlayWindowBehavior(mainWindow, value)
    }
    settingsManager?.setSetting('alwaysOnTop', value)
    return value
  })

  ipcMain.handle('set-window-opacity', (_event, value: number) => {
    mainWindow?.setOpacity(value)
    settingsManager?.setSetting('windowOpacity', value)
    return value
  })

  ipcMain.handle('minimize-window', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('close-window', () => {
    // Fully quit so no dock-less zombie process remains
    app.quit()
  })

  // Clear conversation history
  ipcMain.handle('clear-history', () => {
    openaiService?.clearHistory()
    return { success: true }
  })

  // History handlers
  ipcMain.handle('get-history', () => {
    return historyManager?.getHistory() || []
  })

  ipcMain.handle('save-history-entry', (_event, entry: AnswerEntry) => {
    historyManager?.addEntry(entry)
    return { success: true }
  })

  ipcMain.handle('save-history-entries', (_event, entries: AnswerEntry[]) => {
    historyManager?.addEntries(entries)
    return { success: true }
  })

  ipcMain.handle('clear-saved-history', () => {
    historyManager?.clearHistory()
    return { success: true }
  })

  ipcMain.handle('delete-history-entry', (_event, id: string) => {
    historyManager?.deleteEntry(id)
    return { success: true }
  })

  // Clipboard handlers
  ipcMain.handle('write-to-clipboard', (_event, text: string) => {
    try {
      clipboard.writeText(text)
      return { success: true }
    } catch (error) {
      console.error('Failed to write to clipboard:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // Screenshot handlers
  ipcMain.handle('capture-screenshot', async () => {
    try {
      assertEntitled()
      if (!screenshotService) {
        screenshotService = new ScreenshotService(mainWindow || undefined)
      }

      const result = await screenshotService.captureActiveWindow()

      if (result.success && result.imageData) {
        mainWindow?.webContents.send('screenshot-captured', { imageData: result.imageData })
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to capture screenshot'
      console.error('Screenshot capture error:', errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // Session API handler
  ipcMain.handle(
    'call-session-api',
    async (
      _event,
      payload: { sessionDuration: number; timestamp: number; [key: string]: unknown }
    ) => {
      try {
        // Placeholder API endpoint - can be configured via settings or environment variable
        const API_ENDPOINT = process.env.SESSION_API_URL || 'https://api.example.com/session'

        const response = await fetch(API_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        })

        if (!response.ok) {
          throw new Error(`API call failed with status: ${response.status}`)
        }

        const result = await response.json()
        console.log('Session API called successfully:', result)
        return { success: true, data: result }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to call session API'
        console.error('Session API error:', errorMessage)
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  ipcMain.handle('analyze-screenshot', async (_event, imageData: string) => {
    try {
      assertEntitled()
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Not entitled'
      }
    }

    let conn: AiConnection
    try {
      conn = resolveAiConnection()
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'API key not configured'
      }
    }

    try {
      // Always rebuild vision client from current settings (provider/key may change)
      visionService = new VisionService({
        apiKey: conn.apiKey,
        provider: conn.provider,
        baseUrl: conn.baseUrl,
        model: conn.visionModel
      })

      if (!openaiService) {
        openaiService = new OpenAIService({
          apiKey: conn.apiKey,
          provider: conn.provider,
          baseUrl: conn.baseUrl,
          model: conn.chatModel,
          session: sessionManager?.getActiveSession() || null
        })

        wireOpenAIServiceEvents(openaiService)
      }

      // Analyze screenshot for interview question
      console.log('Analyzing screenshot for interview question...')
      const analysis = await visionService.analyzeScreenshot(imageData)

      console.log('Analysis result:', {
        isQuestion: analysis.isQuestion,
        hasQuestionText: !!analysis.questionText,
        questionTextLength: analysis.questionText?.length || 0,
        questionType: analysis.questionType,
        confidence: analysis.confidence
      })

      // Check if question is detected - be more lenient
      if (analysis.isQuestion) {
        // If we have question text, use it. Otherwise, we'll extract from image directly
        const questionText = analysis.questionText?.trim() || 'Interview question from screenshot'

        console.log('Question detected:', questionText.substring(0, 100))
        console.log('Question type:', analysis.questionType)

        // Send question detected event
        mainWindow?.webContents.send('question-detected-from-image', {
          text: questionText,
          questionType: analysis.questionType,
          confidence: analysis.confidence
        })

        // Generate solution - pass questionText only if we have it, otherwise let the model extract from image
        try {
          await openaiService.generateSolutionFromImage(
            imageData,
            analysis.questionText && analysis.questionText.trim().length > 10
              ? questionText
              : undefined,
            analysis.questionType
          )
        } catch (error) {
          console.error('Solution generation error:', error)
          mainWindow?.webContents.send('answer-error', (error as Error).message)
          return {
            success: false,
            error: (error as Error).message
          }
        }

        return {
          success: true,
          isQuestion: true,
          questionText: questionText,
          questionType: analysis.questionType
        }
      } else {
        // No question detected - but if confidence is moderate, still try to generate solution
        if (analysis.confidence && analysis.confidence >= 0.3) {
          console.log('Low confidence but attempting solution generation anyway...')
          const questionText = analysis.questionText?.trim() || 'Technical problem from screenshot'

          mainWindow?.webContents.send('question-detected-from-image', {
            text: questionText,
            questionType: analysis.questionType || 'other',
            confidence: analysis.confidence
          })

          try {
            await openaiService.generateSolutionFromImage(
              imageData,
              analysis.questionText && analysis.questionText.trim().length > 10
                ? questionText
                : undefined,
              analysis.questionType || 'other'
            )

            return {
              success: true,
              isQuestion: true,
              questionText: questionText,
              questionType: analysis.questionType || 'other'
            }
          } catch (error) {
            console.error('Solution generation error:', error)
            // Fall through to no question message
          }
        }

        // No question detected - log why
        console.log('No question detected. Analysis:', {
          isQuestion: analysis.isQuestion,
          confidence: analysis.confidence,
          hasQuestionText: !!analysis.questionText
        })

        mainWindow?.webContents.send('screenshot-no-question', {
          message:
            'No interview question detected in the screenshot. Please make sure the question is clearly visible and try again.'
        })
        return {
          success: true,
          isQuestion: false,
          message: 'No interview question detected in the screenshot'
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to analyze screenshot'
      console.error('Screenshot analysis error:', errorMessage)
      mainWindow?.webContents.send('answer-error', errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })
}

export function reapplyDockPreference(): void {
  const demoRecord = ['1', 'true', 'yes'].includes(
    (process.env.KALFI_DEMO_RECORD || '').trim().toLowerCase()
  )
  if (demoRecord) {
    applyDockVisibility(false)
    return
  }
  const hide = shouldHideFromDock(settingsManager?.getSettings()?.hideFromDock)
  applyDockVisibility(hide)
}

export function cleanupIpcHandlers(): void {
  unregisterShotShortcut()
  stopAllStt()
  createStt = null
  if (openaiService) {
    openaiService.removeAllListeners()
    openaiService = null
  }
  questionDetector = null
  settingsManager = null
  sessionManager = null
  historyManager = null
  screenshotService = null
  visionService = null
  mainWindow = null
  isCapturing = false
}
