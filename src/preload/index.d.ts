import { ElectronAPI } from '@electron-toolkit/preload'

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

export interface Api {
  getSettings: () => Promise<AppSettings>
  updateSettings: (updates: Partial<AppSettings>) => Promise<AppSettings>
  pickBrandLogo: () => Promise<{ ok: boolean; error?: string; settings?: AppSettings }>
  clearBrandLogo: () => Promise<AppSettings>
  hasApiKeys: () => Promise<boolean>
  fetchOpenAIModels: (
    apiKey: string,
    options?: { provider?: 'openai' | 'openrouter' | 'custom'; baseUrl?: string }
  ) => Promise<{ success: boolean; models: Array<{ id: string; name: string }>; error?: string }>

  listSessions: () => Promise<WorkSession[]>
  getActiveSession: () => Promise<WorkSession | null>
  createSession: (input: {
    mode: SessionMode
    title?: string
    context?: Partial<SessionContext>
  }) => Promise<WorkSession>
  updateSession: (
    id: string,
    updates: {
      title?: string
      mode?: SessionMode
      context?: Partial<SessionContext>
      threadTitle?: string
      summary?: string
    }
  ) => Promise<WorkSession | null>
  setActiveSession: (id: string) => Promise<WorkSession | null>
  deleteSession: (id: string) => Promise<{ success: boolean; active: WorkSession | null }>
  clearSessionConversation: (id: string) => Promise<WorkSession | null>
  continueThread: (fromSessionId: string) => Promise<WorkSession | null>
  askQuestion: (question: string) => Promise<{ success: boolean; error?: string }>
  setForceNextQuestion: (enabled: boolean) => Promise<boolean>
  getForceNextQuestion: () => Promise<boolean>
  summarizeSession: (
    sessionId?: string
  ) => Promise<{ success: boolean; summary?: string; session?: WorkSession; error?: string }>

  startCapture: (source?: 'microphone' | 'system' | 'both') => Promise<{ success: boolean }>
  stopCapture: () => Promise<{ success: boolean }>
  getCaptureStatus: () => Promise<boolean>
  sendAudioData: (audioData: ArrayBuffer) => void
  getAudioSources: () => Promise<AudioSource[]>
  setAlwaysOnTop: (value: boolean) => Promise<boolean>
  setWindowOpacity: (value: number) => Promise<number>
  minimizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  clearHistory: () => Promise<{ success: boolean }>
  getHistory: () => Promise<AnswerEntry[]>
  saveHistoryEntry: (entry: AnswerEntry) => Promise<{ success: boolean }>
  saveHistoryEntries: (entries: AnswerEntry[]) => Promise<{ success: boolean }>
  clearSavedHistory: () => Promise<{ success: boolean }>
  deleteHistoryEntry: (id: string) => Promise<{ success: boolean }>
  writeToClipboard: (text: string) => Promise<{ success: boolean; error?: string }>
  captureScreenshot: () => Promise<{ success: boolean; imageData?: string; error?: string }>
  analyzeScreenshot: (imageData: string) => Promise<{
    success: boolean
    isQuestion?: boolean
    questionText?: string
    questionType?: 'leetcode' | 'system-design' | 'other'
    error?: string
    message?: string
  }>
  callSessionApi: (payload: {
    sessionDuration: number
    timestamp: number
    [key: string]: unknown
  }) => Promise<{ success: boolean; data?: unknown; error?: string }>

  onTranscript: (callback: (event: TranscriptEvent) => void) => () => void
  onUtteranceEnd: (callback: () => void) => () => void
  onSpeechStarted: (callback: () => void) => () => void
  onQuestionDetected: (callback: (question: DetectedQuestion) => void) => () => void
  onAnswerStream: (callback: (chunk: string) => void) => () => void
  onAnswerComplete: (callback: (answer: string) => void) => () => void
  onCaptureError: (callback: (error: string) => void) => () => void
  onAnswerError: (callback: (error: string) => void) => () => void
  onScreenshotCaptured: (callback: (data: { imageData: string }) => void) => () => void
  onQuestionDetectedFromImage: (
    callback: (question: DetectedQuestionFromImage) => void
  ) => () => void
  onScreenshotNoQuestion: (callback: (data: { message: string }) => void) => () => void
  onSessionUpdated: (callback: (session: WorkSession) => void) => () => void
  onForceNextQuestionChanged: (callback: (enabled: boolean) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
