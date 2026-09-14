import { SessionMode, normalizeSessionMode } from './promptBuilder'

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

export type AnswerLength = 'brief' | 'balanced' | 'detailed'
export type AnswerTone = 'formal' | 'neutral' | 'casual'
/** Whisper / answer language. `auto` = let Whisper detect. */
export type MeetingLanguage =
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

/** Shared + mode-specific context for a single workspace/session. */
export interface SessionContext {
  // Interview
  companyName: string
  targetRole: string
  jobDescription: string
  resumeDescription: string
  answerBank: string
  // Client / project meeting
  clientName: string
  projectName: string
  projectScope: string
  meetingGoals: string
  // Random chat
  chatTopic: string
  chatNotes: string
  // Speaking style + meeting language (STT + answers)
  meetingLanguage: MeetingLanguage
  answerLength: AnswerLength
  answerTone: AnswerTone
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

export interface WorkSession {
  id: string
  title: string
  mode: SessionMode
  createdAt: number
  updatedAt: number
  /** Groups related meetings under one project/interview thread */
  threadId: string
  /** Stable display name for the thread (e.g. Client A — App) */
  threadTitle: string
  /** Human label for this meeting occurrence */
  meetingLabel: string
  timeOfDay: TimeOfDay
  /** Optional AI-generated meeting summary */
  summary: string
  context: SessionContext
  /** LLM memory — previous turns in this session */
  messages: SessionMessage[]
  /** UI Q&A log for this session */
  answers: SessionAnswer[]
}

export function normalizeAnswerLength(value: unknown): AnswerLength {
  if (value === 'brief' || value === 'balanced' || value === 'detailed') return value
  return 'balanced'
}

export function normalizeAnswerTone(value: unknown): AnswerTone {
  if (value === 'formal' || value === 'neutral' || value === 'casual') return value
  return 'neutral'
}

const MEETING_LANGUAGES: MeetingLanguage[] = [
  'auto',
  'en',
  'id',
  'zh',
  'ja',
  'ko',
  'es',
  'fr',
  'de',
  'pt',
  'hi',
  'ar',
  'vi',
  'th',
  'ms'
]

export function normalizeMeetingLanguage(value: unknown): MeetingLanguage {
  if (typeof value === 'string' && (MEETING_LANGUAGES as string[]).includes(value)) {
    return value as MeetingLanguage
  }
  return 'auto'
}

/** ISO-639-1 for Whisper, or undefined for auto-detect. */
export function whisperLanguageCode(lang: MeetingLanguage | string | undefined): string | undefined {
  const normalized = normalizeMeetingLanguage(lang)
  return normalized === 'auto' ? undefined : normalized
}

export function emptySessionContext(): SessionContext {
  return {
    companyName: '',
    targetRole: '',
    jobDescription: '',
    resumeDescription: '',
    answerBank: '',
    clientName: '',
    projectName: '',
    projectScope: '',
    meetingGoals: '',
    chatTopic: '',
    chatNotes: '',
    meetingLanguage: 'auto',
    answerLength: 'balanced',
    answerTone: 'neutral'
  }
}

export function createSessionId(): string {
  return `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function createThreadId(): string {
  return `thr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function getTimeOfDay(date = new Date()): TimeOfDay {
  const hour = date.getHours()
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

export function timeOfDayLabel(tod: TimeOfDay): string {
  switch (tod) {
    case 'morning':
      return 'Morning'
    case 'afternoon':
      return 'Afternoon'
    case 'evening':
      return 'Evening'
    case 'night':
      return 'Night'
  }
}

export function formatMeetingLabel(date = new Date()): string {
  const tod = getTimeOfDay(date)
  const day = date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  })
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${day} · ${timeOfDayLabel(tod)} · ${time}`
}

export function defaultSessionTitle(mode: SessionMode, context: SessionContext): string {
  if (mode === 'interview') {
    const company = context.companyName.trim()
    const role = context.targetRole.trim()
    if (company && role) return `${role} @ ${company}`
    if (company) return `Interview — ${company}`
    if (role) return `Interview — ${role}`
    return 'New Interview'
  }
  if (mode === 'client-meeting') {
    const client = context.clientName.trim()
    const project = context.projectName.trim()
    if (client && project) return `${client} — ${project}`
    if (client) return `Meeting — ${client}`
    if (project) return `Project — ${project}`
    return 'New Client Meeting'
  }
  const topic = context.chatTopic.trim()
  return topic ? `Chat — ${topic}` : 'New Chat'
}

export function normalizeSession(raw: Partial<WorkSession> & { id?: string }): WorkSession {
  const mode = normalizeSessionMode(raw.mode)
  const merged = { ...emptySessionContext(), ...(raw.context || {}) }
  const context: SessionContext = {
    ...merged,
    meetingLanguage: normalizeMeetingLanguage(merged.meetingLanguage),
    answerLength: normalizeAnswerLength(merged.answerLength),
    answerTone: normalizeAnswerTone(merged.answerTone)
  }
  const now = Date.now()
  const id = raw.id || createSessionId()
  const threadTitle = raw.threadTitle?.trim() || defaultSessionTitle(mode, context)
  const createdAt = raw.createdAt || now
  const tod = raw.timeOfDay || getTimeOfDay(new Date(createdAt))

  return {
    id,
    title: raw.title?.trim() || `${threadTitle} · ${formatMeetingLabel(new Date(createdAt))}`,
    mode,
    createdAt,
    updatedAt: raw.updatedAt || now,
    threadId: raw.threadId || id,
    threadTitle,
    meetingLabel: raw.meetingLabel || formatMeetingLabel(new Date(createdAt)),
    timeOfDay: tod,
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    context,
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    answers: Array.isArray(raw.answers) ? raw.answers : []
  }
}
