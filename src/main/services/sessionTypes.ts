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
}

export interface WorkSession {
  id: string
  title: string
  mode: SessionMode
  createdAt: number
  updatedAt: number
  context: SessionContext
  /** LLM memory — previous turns in this session */
  messages: SessionMessage[]
  /** UI Q&A log for this session */
  answers: SessionAnswer[]
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
    chatNotes: ''
  }
}

export function createSessionId(): string {
  return `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
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
  const context = { ...emptySessionContext(), ...(raw.context || {}) }
  const now = Date.now()
  return {
    id: raw.id || createSessionId(),
    title: raw.title?.trim() || defaultSessionTitle(mode, context),
    mode,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
    context,
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    answers: Array.isArray(raw.answers) ? raw.answers : []
  }
}
