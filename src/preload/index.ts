import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, ipcRenderer } from 'electron'

export interface TranscriptEvent {
  text: string
  isFinal: boolean
  confidence: number
}

export interface DetectedQuestion {
  text: string
  confidence: number
  questionType: 'direct' | 'indirect' | 'rhetorical' | 'unknown'
}

export interface DetectedQuestionFromImage {
  text: string
  questionType?: 'leetcode' | 'system-design' | 'other'
  confidence?: number
}

export type SessionMode = 'interview' | 'client-meeting' | 'random-chat'

export interface SessionContext {
  companyName: string
  targetRole: string
  jobDescription: string
  resumeDescription: string
  answerBank: string
  clientName: string
  projectName: string
  projectScope: string
  meetingGoals: string
  chatTopic: string
  chatNotes: string
  meetingLanguage:
    | 'auto'
    | 'en'
    | 'id'
    | 'zh'
    | 'ja'
    | 'ko'
    | 'es'
    | 'fr'
    | 'de'
    | 'pt'
    | 'hi'
    | 'ar'
    | 'vi'
    | 'th'
    | 'ms'
  answerLength: 'brief' | 'balanced' | 'detailed'
  answerTone: 'formal' | 'neutral' | 'casual'
}

export interface SessionMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface SessionAnswer {
  id: string
  question: string
  answer: string
  timestamp: number
}

export interface WorkSession {
  id: string
  title: string
  mode: SessionMode
  createdAt: number
  updatedAt: number
  threadId: string
  threadTitle: string
  meetingLabel: string
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night'
  summary: string
  context: SessionContext
  messages: SessionMessage[]
  answers: SessionAnswer[]
}

export interface AppSettings {
  llmProvider: 'openai' | 'openrouter' | 'custom'
  openaiApiKey: string
  openaiModel: string
  apiBaseUrl: string
  alwaysOnTop: boolean
  windowOpacity: number
  pauseThreshold: number
  autoStart: boolean
  brandName: string
  brandLogoPath: string
  brandLogoDataUrl?: string
  hideFromDock: boolean
  accountName: string
  accountEmail: string
  authToken: string
  membershipPlan:
    | 'free'
    | 'byok_monthly'
    | 'byok_annual'
    | 'hosted_monthly'
    | 'hosted_annual'
    | 'team'
    | 'single_session'
  membershipStatus: 'inactive' | 'active' | 'trial' | 'past_due' | 'canceled' | 'expired'
  billingInterval?: 'none' | 'month' | 'year' | 'one_time'
  singleSession?: {
    status: 'unused' | 'active_in_session' | 'consumed' | 'expired'
    purchasedAt: number
    expiresAt: number
    sessionStartedAt?: number
  } | null
  onboardingCompleted: boolean
}

export interface AudioSource {
  id: string
  name: string
  thumbnail: string
}

export interface AnswerEntry {
  id: string
  question: string
  answer: string
  timestamp: number
  isStreaming: boolean
}

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('get-settings'),
  updateSettings: (updates: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('update-settings', updates),
  pickBrandLogo: (): Promise<{
    ok: boolean
    error?: string
    settings?: AppSettings
  }> => ipcRenderer.invoke('pick-brand-logo'),
  clearBrandLogo: (): Promise<AppSettings> => ipcRenderer.invoke('clear-brand-logo'),
  hasApiKeys: (): Promise<boolean> => ipcRenderer.invoke('has-api-keys'),
  fetchOpenAIModels: (
    apiKey: string,
    options?: { provider?: 'openai' | 'openrouter' | 'custom'; baseUrl?: string }
  ): Promise<{ success: boolean; models: Array<{ id: string; name: string }>; error?: string }> =>
    ipcRenderer.invoke('fetch-openai-models', apiKey, options),

  listSessions: (): Promise<WorkSession[]> => ipcRenderer.invoke('list-sessions'),
  getActiveSession: (): Promise<WorkSession | null> => ipcRenderer.invoke('get-active-session'),
  createSession: (input: {
    mode: SessionMode
    title?: string
    context?: Partial<SessionContext>
  }): Promise<WorkSession> => ipcRenderer.invoke('create-session', input),
  updateSession: (
    id: string,
    updates: {
      title?: string
      mode?: SessionMode
      context?: Partial<SessionContext>
      threadTitle?: string
      summary?: string
    }
  ): Promise<WorkSession | null> => ipcRenderer.invoke('update-session', id, updates),
  setActiveSession: (id: string): Promise<WorkSession | null> =>
    ipcRenderer.invoke('set-active-session', id),
  deleteSession: (id: string): Promise<{ success: boolean; active: WorkSession | null }> =>
    ipcRenderer.invoke('delete-session', id),
  clearSessionConversation: (id: string): Promise<WorkSession | null> =>
    ipcRenderer.invoke('clear-session-conversation', id),
  continueThread: (fromSessionId: string): Promise<WorkSession | null> =>
    ipcRenderer.invoke('continue-thread', fromSessionId),
  askQuestion: (question: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('ask-question', question),
  setForceNextQuestion: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('set-force-next-question', enabled),
  getForceNextQuestion: (): Promise<boolean> => ipcRenderer.invoke('get-force-next-question'),
  summarizeSession: (
    sessionId?: string
  ): Promise<{ success: boolean; summary?: string; session?: WorkSession; error?: string }> =>
    ipcRenderer.invoke('summarize-session', sessionId),

  startCapture: (source?: 'microphone' | 'system' | 'both'): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('start-capture', source),
  stopCapture: (): Promise<{ success: boolean }> => ipcRenderer.invoke('stop-capture'),
  getCaptureStatus: (): Promise<boolean> => ipcRenderer.invoke('get-capture-status'),
  sendAudioData: (audioData: ArrayBuffer): void => ipcRenderer.send('audio-data', audioData),
  getAudioSources: (): Promise<AudioSource[]> => ipcRenderer.invoke('get-audio-sources'),

  setAlwaysOnTop: (value: boolean): Promise<boolean> =>
    ipcRenderer.invoke('set-always-on-top', value),
  setWindowOpacity: (value: number): Promise<number> =>
    ipcRenderer.invoke('set-window-opacity', value),
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('minimize-window'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('close-window'),

  clearHistory: (): Promise<{ success: boolean }> => ipcRenderer.invoke('clear-history'),
  getHistory: (): Promise<AnswerEntry[]> => ipcRenderer.invoke('get-history'),
  saveHistoryEntry: (entry: AnswerEntry): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('save-history-entry', entry),
  saveHistoryEntries: (entries: AnswerEntry[]): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('save-history-entries', entries),
  clearSavedHistory: (): Promise<{ success: boolean }> => ipcRenderer.invoke('clear-saved-history'),
  deleteHistoryEntry: (id: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('delete-history-entry', id),

  writeToClipboard: (text: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('write-to-clipboard', text),

  captureScreenshot: (): Promise<{ success: boolean; imageData?: string; error?: string }> =>
    ipcRenderer.invoke('capture-screenshot'),
  analyzeScreenshot: (
    imageData: string
  ): Promise<{
    success: boolean
    isQuestion?: boolean
    questionText?: string
    questionType?: 'leetcode' | 'system-design' | 'other'
    error?: string
    message?: string
  }> => ipcRenderer.invoke('analyze-screenshot', imageData),

  callSessionApi: (payload: {
    sessionDuration: number
    timestamp: number
    [key: string]: unknown
  }): Promise<{ success: boolean; data?: unknown; error?: string }> =>
    ipcRenderer.invoke('call-session-api', payload),

  onTranscript: (callback: (event: TranscriptEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: TranscriptEvent): void =>
      callback(data)
    ipcRenderer.on('transcript', handler)
    return () => ipcRenderer.removeListener('transcript', handler)
  },
  onUtteranceEnd: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('utterance-end', handler)
    return () => ipcRenderer.removeListener('utterance-end', handler)
  },
  onSpeechStarted: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('speech-started', handler)
    return () => ipcRenderer.removeListener('speech-started', handler)
  },
  onQuestionDetected: (callback: (question: DetectedQuestion) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: DetectedQuestion): void =>
      callback(data)
    ipcRenderer.on('question-detected', handler)
    return () => ipcRenderer.removeListener('question-detected', handler)
  },
  onAnswerStream: (callback: (chunk: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: string): void => callback(chunk)
    ipcRenderer.on('answer-stream', handler)
    return () => ipcRenderer.removeListener('answer-stream', handler)
  },
  onAnswerComplete: (callback: (answer: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, answer: string): void => callback(answer)
    ipcRenderer.on('answer-complete', handler)
    return () => ipcRenderer.removeListener('answer-complete', handler)
  },
  onCaptureError: (callback: (error: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: string): void => callback(error)
    ipcRenderer.on('capture-error', handler)
    return () => ipcRenderer.removeListener('capture-error', handler)
  },
  onAnswerError: (callback: (error: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: string): void => callback(error)
    ipcRenderer.on('answer-error', handler)
    return () => ipcRenderer.removeListener('answer-error', handler)
  },
  onScreenshotCaptured: (callback: (data: { imageData: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { imageData: string }): void =>
      callback(data)
    ipcRenderer.on('screenshot-captured', handler)
    return () => ipcRenderer.removeListener('screenshot-captured', handler)
  },
  onQuestionDetectedFromImage: (
    callback: (question: DetectedQuestionFromImage) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      question: DetectedQuestionFromImage
    ): void => callback(question)
    ipcRenderer.on('question-detected-from-image', handler)
    return () => ipcRenderer.removeListener('question-detected-from-image', handler)
  },
  onScreenshotNoQuestion: (callback: (data: { message: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { message: string }): void =>
      callback(data)
    ipcRenderer.on('screenshot-no-question', handler)
    return () => ipcRenderer.removeListener('screenshot-no-question', handler)
  },
  onSessionUpdated: (callback: (session: WorkSession) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, session: WorkSession): void =>
      callback(session)
    ipcRenderer.on('session-updated', handler)
    return () => ipcRenderer.removeListener('session-updated', handler)
  },
  onForceNextQuestionChanged: (callback: (enabled: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, enabled: boolean): void => callback(enabled)
    ipcRenderer.on('force-next-question-changed', handler)
    return () => ipcRenderer.removeListener('force-next-question-changed', handler)
  },
  onTriggerShot: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('trigger-shot', handler)
    return () => ipcRenderer.removeListener('trigger-shot', handler)
  },
  getShotShortcut: (): Promise<string> => ipcRenderer.invoke('get-shot-shortcut')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
