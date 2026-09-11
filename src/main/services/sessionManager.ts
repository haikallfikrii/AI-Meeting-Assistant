import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { SessionMode, normalizeSessionMode } from './promptBuilder'
import {
  SessionAnswer,
  SessionMessage,
  WorkSession,
  createSessionId,
  createThreadId,
  defaultSessionTitle,
  emptySessionContext,
  formatMeetingLabel,
  getTimeOfDay,
  normalizeSession
} from './sessionTypes'

const MAX_MESSAGES_PER_SESSION = 80
const MAX_ANSWERS_PER_SESSION = 100

interface SessionsFile {
  activeSessionId: string | null
  sessions: WorkSession[]
}

export class SessionManager {
  private filePath: string
  private data: SessionsFile

  constructor() {
    const userDataPath = app.getPath('userData')
    this.filePath = path.join(userDataPath, 'sessions.json')
    this.data = this.load()
    if (this.data.sessions.length === 0) {
      const session = this.buildNewSession('interview')
      this.data.sessions = [session]
      this.data.activeSessionId = session.id
      this.persist()
    } else if (
      !this.data.activeSessionId ||
      !this.data.sessions.find((s) => s.id === this.data.activeSessionId)
    ) {
      this.data.activeSessionId = this.data.sessions[0].id
      this.persist()
    }
  }

  private load(): SessionsFile {
    try {
      if (fs.existsSync(this.filePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as SessionsFile
        return {
          activeSessionId: parsed.activeSessionId || null,
          sessions: Array.isArray(parsed.sessions)
            ? parsed.sessions.map((s) => normalizeSession(s))
            : []
        }
      }
    } catch (error) {
      console.error('Failed to load sessions:', error)
    }
    return { activeSessionId: null, sessions: [] }
  }

  private persist(): void {
    try {
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2))
    } catch (error) {
      console.error('Failed to save sessions:', error)
    }
  }

  private buildNewSession(
    mode: SessionMode,
    partial?: {
      title?: string
      context?: Partial<WorkSession['context']>
      threadId?: string
      threadTitle?: string
    }
  ): WorkSession {
    const context = { ...emptySessionContext(), ...(partial?.context || {}) }
    const now = Date.now()
    const id = createSessionId()
    const threadTitle = partial?.threadTitle?.trim() || defaultSessionTitle(mode, context)
    const meetingLabel = formatMeetingLabel(new Date(now))

    return normalizeSession({
      id,
      mode,
      title: partial?.title?.trim() || `${threadTitle} · ${meetingLabel}`,
      context,
      createdAt: now,
      updatedAt: now,
      threadId: partial?.threadId || createThreadId(),
      threadTitle,
      meetingLabel,
      timeOfDay: getTimeOfDay(new Date(now)),
      summary: '',
      messages: [],
      answers: []
    })
  }

  listSessions(): WorkSession[] {
    return [...this.data.sessions].sort((a, b) => b.updatedAt - a.updatedAt)
  }

  getActiveSession(): WorkSession | null {
    return this.data.sessions.find((s) => s.id === this.data.activeSessionId) || null
  }

  getSession(id: string): WorkSession | null {
    return this.data.sessions.find((s) => s.id === id) || null
  }

  createSession(input: {
    mode: SessionMode
    title?: string
    context?: Partial<WorkSession['context']>
  }): WorkSession {
    const session = this.buildNewSession(normalizeSessionMode(input.mode), input)
    this.data.sessions.unshift(session)
    this.data.activeSessionId = session.id
    this.persist()
    return session
  }

  /**
   * Start a fresh meeting under the same project/interview thread.
   * Copies context; conversation memory starts empty for this meeting.
   */
  continueThread(fromSessionId: string): WorkSession | null {
    const source = this.getSession(fromSessionId)
    if (!source) return null

    const session = this.buildNewSession(source.mode, {
      context: { ...source.context },
      threadId: source.threadId,
      threadTitle: source.threadTitle
    })
    this.data.sessions.unshift(session)
    this.data.activeSessionId = session.id
    this.persist()
    return session
  }

  updateSession(
    id: string,
    updates: {
      title?: string
      mode?: SessionMode
      context?: Partial<WorkSession['context']>
      summary?: string
      threadTitle?: string
    }
  ): WorkSession | null {
    const idx = this.data.sessions.findIndex((s) => s.id === id)
    if (idx < 0) return null

    const current = this.data.sessions[idx]
    const mode = updates.mode ? normalizeSessionMode(updates.mode) : current.mode
    const context = updates.context
      ? { ...current.context, ...updates.context }
      : current.context
    const threadTitle =
      updates.threadTitle?.trim() ||
      (updates.context ? defaultSessionTitle(mode, context) : current.threadTitle)

    const next: WorkSession = {
      ...current,
      mode,
      context,
      threadTitle,
      title: updates.title?.trim() || `${threadTitle} · ${current.meetingLabel}`,
      summary: updates.summary !== undefined ? updates.summary : current.summary,
      updatedAt: Date.now()
    }

    // Keep thread title in sync across siblings when context renamed
    if (updates.threadTitle || updates.context) {
      this.data.sessions = this.data.sessions.map((s) =>
        s.threadId === current.threadId && s.id !== id
          ? { ...s, threadTitle, updatedAt: Date.now() }
          : s
      )
    }

    this.data.sessions[idx] = next
    this.persist()
    return next
  }

  setSummary(id: string, summary: string): WorkSession | null {
    return this.updateSession(id, { summary })
  }

  setActiveSession(id: string): WorkSession | null {
    const session = this.getSession(id)
    if (!session) return null
    this.data.activeSessionId = id
    this.persist()
    return session
  }

  deleteSession(id: string): { success: boolean; active: WorkSession | null } {
    if (this.data.sessions.length <= 1) {
      return { success: false, active: this.getActiveSession() }
    }
    this.data.sessions = this.data.sessions.filter((s) => s.id !== id)
    if (this.data.activeSessionId === id) {
      this.data.activeSessionId = this.data.sessions[0]?.id || null
    }
    this.persist()
    return { success: true, active: this.getActiveSession() }
  }

  appendExchange(sessionId: string, question: string, answer: string): WorkSession | null {
    const idx = this.data.sessions.findIndex((s) => s.id === sessionId)
    if (idx < 0) return null

    const now = Date.now()
    const session = this.data.sessions[idx]
    const userMsg: SessionMessage = {
      role: 'user',
      content: question,
      timestamp: now
    }
    const assistantMsg: SessionMessage = {
      role: 'assistant',
      content: answer,
      timestamp: now + 1
    }
    const answerEntry: SessionAnswer = {
      id: `${now}`,
      question,
      answer,
      timestamp: now
    }

    const messages = [...session.messages, userMsg, assistantMsg].slice(-MAX_MESSAGES_PER_SESSION)
    const answers = [answerEntry, ...session.answers].slice(0, MAX_ANSWERS_PER_SESSION)

    const next: WorkSession = {
      ...session,
      messages,
      answers,
      updatedAt: now
    }
    this.data.sessions[idx] = next
    this.persist()
    return next
  }

  clearSessionConversation(sessionId: string): WorkSession | null {
    const idx = this.data.sessions.findIndex((s) => s.id === sessionId)
    if (idx < 0) return null
    const next: WorkSession = {
      ...this.data.sessions[idx],
      messages: [],
      answers: [],
      summary: '',
      updatedAt: Date.now()
    }
    this.data.sessions[idx] = next
    this.persist()
    return next
  }

  migrateFromLegacySettings(legacy: {
    sessionMode?: string
    targetRole?: string
    companyName?: string
    jobDescription?: string
    resumeDescription?: string
    answerBank?: string
  }): void {
    if (this.data.sessions.length !== 1) return
    const only = this.data.sessions[0]
    const hasAnyContext = Object.values(only.context).some((v) => v && String(v).trim())
    if (hasAnyContext) return

    const mode = normalizeSessionMode(legacy.sessionMode)
    const context = {
      ...emptySessionContext(),
      companyName: legacy.companyName || '',
      targetRole: legacy.targetRole || '',
      jobDescription: legacy.jobDescription || '',
      resumeDescription: legacy.resumeDescription || '',
      answerBank: legacy.answerBank || ''
    }
    const threadTitle = defaultSessionTitle(mode, context)
    this.data.sessions[0] = normalizeSession({
      ...only,
      mode,
      context,
      threadTitle,
      title: `${threadTitle} · ${only.meetingLabel}`,
      updatedAt: Date.now()
    })
    this.persist()
  }
}
