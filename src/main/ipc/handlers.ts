import { BrowserWindow, app, clipboard, desktopCapturer, ipcMain } from 'electron'
import { AnswerEntry } from '../../preload/index'
import { HistoryManager } from '../services/historyManager'
import { OpenAIService } from '../services/openaiService'
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
import { WorkSession } from '../services/sessionTypes'
import { VisionService } from '../services/visionService'
import { WhisperService } from '../services/whisperService'
import { applyOverlayWindowBehavior } from '../windowOverlay'

let whisperService: WhisperService | null = null
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

function persistExchange(meta: { sessionId: string | null; question: string; answer: string }): void {
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

function ensureOpenAIService(): OpenAIService {
  const settings = settingsManager?.getSettings()
  if (!settings?.openaiApiKey) {
    throw new Error('API key not configured. Please add it in Settings.')
  }

  const provider = settings.llmProvider || 'openai'
  const activeSession = sessionManager?.getActiveSession() || null

  if (!openaiService) {
    openaiService = new OpenAIService({
      apiKey: settings.openaiApiKey,
      provider,
      baseUrl: settings.apiBaseUrl,
      model: settings.openaiModel || DEFAULT_CHAT_MODELS[provider],
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

  // Settings handlers
  ipcMain.handle('get-settings', () => {
    return settingsManager?.getSettings()
  })

  ipcMain.handle('update-settings', (_event, updates: Partial<AppSettings>) => {
    settingsManager?.updateSettings(updates)

    // Apply window settings immediately
    if (updates.alwaysOnTop !== undefined && mainWindow) {
      applyOverlayWindowBehavior(mainWindow, updates.alwaysOnTop)
    }
    if (updates.windowOpacity !== undefined && mainWindow) {
      mainWindow.setOpacity(updates.windowOpacity)
    }

    return settingsManager?.getSettings()
  })

  ipcMain.handle('has-api-keys', () => {
    return settingsManager?.hasApiKeys()
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
      if (openaiService && session && sessionManager?.getActiveSession()?.id === id) {
        openaiService.loadSession(session)
      }
      return session
    }
  )

  ipcMain.handle('set-active-session', (_event, id: string) => {
    const session = sessionManager?.setActiveSession(id)
    if (openaiService && session) {
      openaiService.loadSession(session)
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
      mainWindow?.webContents.send('question-detected', {
        text,
        confidence: 1,
        questionType: 'direct'
      })
      await service.generateAnswer(text)
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to answer'
      mainWindow?.webContents.send('answer-error', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('set-force-next-question', (_event, enabled: boolean) => {
    forceNextTranscriptAsQuestion = Boolean(enabled)
    mainWindow?.webContents.send('force-next-question-changed', forceNextTranscriptAsQuestion)
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
    async (
      _event,
      apiKey: string,
      options?: { provider?: LlmProvider; baseUrl?: string }
    ) => {
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
  ipcMain.handle('start-capture', async () => {
    const settings = settingsManager?.getSettings()

    // Debug: Log API key status (not the actual keys)
    console.log('API Keys configured:', {
      provider: settings?.llmProvider || 'openai',
      openai: settings?.openaiApiKey ? `Yes (${settings.openaiApiKey.length} chars)` : 'No',
      baseUrl: settings?.apiBaseUrl || '(provider default)'
    })

    if (!settings?.openaiApiKey) {
      throw new Error('API key not configured. Please add it in Settings.')
    }

    try {
      // IMPORTANT: Clean up any existing services/listeners first to prevent duplicates
      if (whisperService) {
        whisperService.removeAllListeners()
        whisperService = null
      }
      if (openaiService) {
        openaiService.removeAllListeners()
        openaiService = null
      }
      questionDetector?.removeAllListeners()

      const provider = settings.llmProvider || 'openai'

      // Initialize Whisper service for transcription
      whisperService = new WhisperService({
        apiKey: settings.openaiApiKey,
        provider,
        baseUrl: settings.apiBaseUrl,
        model: DEFAULT_STT_MODELS[provider],
        language: 'en'
      })

      // Initialize OpenAI-compatible service for answer generation (bound to active session)
      const activeSession = sessionManager?.getActiveSession() || null
      openaiService = new OpenAIService({
        apiKey: settings.openaiApiKey,
        provider,
        baseUrl: settings.apiBaseUrl,
        model: settings.openaiModel || DEFAULT_CHAT_MODELS[provider],
        session: activeSession
      })

      wireOpenAIServiceEvents(openaiService)

      // Set up Whisper event listeners
      whisperService.on('transcript', async (event) => {
        console.log('Transcript received:', event.text)
        questionDetector?.addTranscript(event.text, event.isFinal)
        mainWindow?.webContents.send('transcript', event)

        if (!event.isFinal || !openaiService) return

        // Manual safety net: next utterance after Mic Ask is always answered
        if (forceNextTranscriptAsQuestion) {
          forceNextTranscriptAsQuestion = false
          mainWindow?.webContents.send('force-next-question-changed', false)
          mainWindow?.webContents.send('question-detected', {
            text: event.text,
            confidence: 1,
            questionType: 'direct'
          })
          try {
            await openaiService.generateAnswer(event.text)
          } catch (error) {
            mainWindow?.webContents.send('answer-error', (error as Error).message)
          }
          return
        }

        // Auto early detection for high-confidence questions
        if (questionDetector) {
          const earlyDetection = questionDetector.checkEarlyDetection(event.text)
          if (earlyDetection) {
            console.log('Early question detection triggered:', earlyDetection.text)
            mainWindow?.webContents.send('question-detected', earlyDetection)
            try {
              await openaiService.generateAnswer(earlyDetection.text)
            } catch (error) {
              mainWindow?.webContents.send('answer-error', (error as Error).message)
            }
          }
        }
      })

      whisperService.on('utteranceEnd', () => {
        console.log('Processing utterance...')
        questionDetector?.onUtteranceEnd()
        mainWindow?.webContents.send('utterance-end')
      })

      whisperService.on('speechStarted', () => {
        mainWindow?.webContents.send('speech-started')
      })

      whisperService.on('error', (error) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown capture error'
        console.error('Whisper error:', errorMessage)
        mainWindow?.webContents.send('capture-error', errorMessage)
      })

      // Set up question detector listener ONCE
      questionDetector?.on('questionDetected', async (detection) => {
        console.log('Question detected:', detection.text)
        mainWindow?.webContents.send('question-detected', detection)

        if (openaiService) {
          try {
            await openaiService.generateAnswer(detection.text)
          } catch (error) {
            mainWindow?.webContents.send('answer-error', (error as Error).message)
          }
        }
      })

      // Start Whisper service
      whisperService.start()
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
    forceNextTranscriptAsQuestion = false
    mainWindow?.webContents.send('force-next-question-changed', false)

    if (whisperService) {
      whisperService.stop()
      whisperService.removeAllListeners()
      whisperService = null
    }

    // Keep openaiService alive so manual Ask / Summarize still work after Stop
    // (listeners remain wired)

    questionDetector?.removeAllListeners()
    questionDetector?.clearBuffer()
    console.log('Audio capture stopped')

    return { success: true }
  })

  ipcMain.handle('get-capture-status', () => {
    return isCapturing
  })

  // Audio data from renderer
  ipcMain.on('audio-data', (_event, audioData: ArrayBuffer) => {
    if (whisperService && isCapturing) {
      whisperService.addAudioData(audioData)
    }
  })

  // Get audio sources for system audio capture
  ipcMain.handle('get-audio-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      fetchWindowIcons: true
    })

    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }))
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
    const settings = settingsManager?.getSettings()

    if (!settings?.openaiApiKey) {
      return {
        success: false,
        error: 'API key not configured. Please add it in Settings.'
      }
    }

    try {
      const provider = settings.llmProvider || 'openai'

      // Always rebuild vision client from current settings (provider/key may change)
      visionService = new VisionService({
        apiKey: settings.openaiApiKey,
        provider,
        baseUrl: settings.apiBaseUrl,
        model: DEFAULT_VISION_MODELS[provider]
      })

      if (!openaiService) {
        openaiService = new OpenAIService({
          apiKey: settings.openaiApiKey,
          provider,
          baseUrl: settings.apiBaseUrl,
          model: settings.openaiModel || DEFAULT_CHAT_MODELS[provider],
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

export function cleanupIpcHandlers(): void {
  if (whisperService) {
    whisperService.stop()
    whisperService = null
  }
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
