import { create } from 'zustand'
import type { SessionMode, WorkSession } from '../../../preload/index'

export interface TranscriptEntry {
  id: string
  text: string
  timestamp: number
  isFinal: boolean
}

export interface AnswerEntry {
  id: string
  question: string
  answer: string
  timestamp: number
  isStreaming: boolean
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

interface InterviewState {
  isCapturing: boolean
  isConnected: boolean
  isSpeaking: boolean
  isGenerating: boolean
  isProcessingScreenshot: boolean

  transcripts: TranscriptEntry[]
  currentTranscript: string

  answers: AnswerEntry[]
  currentAnswer: string
  currentQuestion: string

  settings: AppSettings
  showSettings: boolean
  showHistory: boolean
  showSessionEditor: boolean
  sessionEditorMode: 'create' | 'edit'
  editorTargetSession: WorkSession | null
  activeSession: WorkSession | null
  forceNextAsk: boolean
  isSummarizing: boolean

  isSessionActive: boolean
  sessionStartTime: number | null
  sessionElapsedTime: number

  error: string | null

  setCapturing: (isCapturing: boolean) => void
  setConnected: (isConnected: boolean) => void
  setSpeaking: (isSpeaking: boolean) => void
  setGenerating: (isGenerating: boolean) => void
  setProcessingScreenshot: (processing: boolean) => void
  setForceNextAsk: (enabled: boolean) => void
  setSummarizing: (value: boolean) => void

  addTranscript: (entry: TranscriptEntry) => void
  setCurrentTranscript: (text: string) => void
  clearTranscripts: () => void

  addAnswer: (entry: AnswerEntry) => void
  updateCurrentAnswer: (chunk: string) => void
  setCurrentQuestion: (question: string) => void
  finalizeAnswer: () => void | Promise<void>
  clearAnswers: () => void

  setSettings: (settings: AppSettings) => void
  updateSettings: (updates: Partial<AppSettings>) => void
  setShowSettings: (show: boolean) => void

  setShowHistory: (show: boolean) => void
  setShowSessionEditor: (
    show: boolean,
    mode?: 'create' | 'edit',
    target?: WorkSession | null
  ) => void
  setActiveSession: (session: WorkSession | null) => void

  startSession: () => void
  endSession: () => void
  updateSessionTime: (elapsedTime: number) => void

  setError: (error: string | null) => void
  clearAll: () => void
}

const DEFAULT_SETTINGS: AppSettings = {
  llmProvider: 'openai',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  apiBaseUrl: '',
  alwaysOnTop: true,
  windowOpacity: 1.0,
  pauseThreshold: 1500,
  autoStart: false,
  brandName: '',
  brandLogoPath: '',
  brandLogoDataUrl: '',
  hideFromDock: true,
  accountName: '',
  accountEmail: '',
  authToken: '',
  membershipPlan: 'free',
  membershipStatus: 'inactive',
  billingInterval: 'none',
  singleSession: null,
  onboardingCompleted: false
}

export type { SessionMode, WorkSession }

export const useInterviewStore = create<InterviewState>((set, get) => ({
  isCapturing: false,
  isConnected: false,
  isSpeaking: false,
  isGenerating: false,
  isProcessingScreenshot: false,

  transcripts: [],
  currentTranscript: '',

  answers: [],
  currentAnswer: '',
  currentQuestion: '',

  settings: DEFAULT_SETTINGS,
  showSettings: false,
  showHistory: false,
  showSessionEditor: false,
  sessionEditorMode: 'create',
  editorTargetSession: null,
  activeSession: null,
  forceNextAsk: false,
  isSummarizing: false,

  isSessionActive: true,
  sessionStartTime: null,
  sessionElapsedTime: 0,

  error: null,

  setCapturing: (isCapturing) => set({ isCapturing }),
  setConnected: (isConnected) => set({ isConnected }),
  setSpeaking: (isSpeaking) => set({ isSpeaking }),
  setGenerating: (isGenerating) => set({ isGenerating }),
  setProcessingScreenshot: (processing) => set({ isProcessingScreenshot: processing }),
  setForceNextAsk: (enabled) => set({ forceNextAsk: enabled }),
  setSummarizing: (value) => set({ isSummarizing: value }),

  addTranscript: (entry) =>
    set((state) => ({
      transcripts: [...state.transcripts.slice(-50), entry]
    })),

  setCurrentTranscript: (text) => set({ currentTranscript: text }),
  clearTranscripts: () => set({ transcripts: [], currentTranscript: '' }),

  addAnswer: (entry) =>
    set((state) => ({
      answers: [...state.answers, entry],
      currentAnswer: '',
      currentQuestion: entry.question
    })),

  updateCurrentAnswer: (chunk) =>
    set((state) => ({
      currentAnswer: state.currentAnswer + chunk,
      isGenerating: true
    })),

  setCurrentQuestion: (question) => set({ currentQuestion: question }),

  finalizeAnswer: async () => {
    const state = get()
    if (state.currentAnswer && state.currentQuestion) {
      const entry: AnswerEntry = {
        id: Date.now().toString(),
        question: state.currentQuestion,
        answer: state.currentAnswer,
        timestamp: Date.now(),
        isStreaming: false
      }
      set((s) => ({
        answers: [...s.answers.slice(-20), entry],
        currentAnswer: '',
        currentQuestion: '',
        isGenerating: false
      }))
      // Persistence is handled in main via session exchange events
    } else {
      set({ isGenerating: false })
    }
  },

  clearAnswers: () => set({ answers: [], currentAnswer: '', currentQuestion: '' }),

  setSettings: (settings) => set({ settings }),
  updateSettings: (updates) =>
    set((state) => ({
      settings: { ...state.settings, ...updates }
    })),
  setShowSettings: (show) => set({ showSettings: show }),

  setShowHistory: (show) => set({ showHistory: show }),
  setShowSessionEditor: (show, mode = 'create', target = null) =>
    set({
      showSessionEditor: show,
      sessionEditorMode: mode,
      editorTargetSession: show && mode === 'edit' ? target : null
    }),
  setActiveSession: (session) => set({ activeSession: session }),

  startSession: () =>
    set({
      isSessionActive: true,
      sessionStartTime: Date.now(),
      sessionElapsedTime: 0
    }),

  endSession: () =>
    set((state) => ({
      isSessionActive: false,
      sessionStartTime: state.sessionStartTime,
      sessionElapsedTime: state.sessionElapsedTime
    })),

  updateSessionTime: (elapsedTime) =>
    set((state) => {
      if (state.isSessionActive) {
        return { sessionElapsedTime: elapsedTime }
      }
      return state
    }),

  setError: (error) => set({ error }),

  clearAll: () =>
    set({
      transcripts: [],
      currentTranscript: '',
      answers: [],
      currentAnswer: '',
      currentQuestion: '',
      error: null
    })
}))
