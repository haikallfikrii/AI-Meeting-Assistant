import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import {
  SessionAnswer,
  SessionMessage,
  WorkSession,
  createSessionId,
  defaultSessionTitle,
  emptySessionContext,
  normalizeSession
} from './sessionTypes'
import { SessionMode, normalizeSessionMode } from './promptBuilder'

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
    }
  ): WorkSession {
    const context = { ...emptySessionContext(), ...(partial?.context || {}) }
    const now = Date.now()
    return normalizeSession({
      id: createSessionId(),
      mode,
      title: partial?.title,
      context,
      createdAt: now,
      updatedAt: now,
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

  updateSession(
    id: string,
    updates: {
      title?: string
      mode?: SessionMode
      context?: Partial<WorkSession['context']>
    }
  ): WorkSession | null {
    const idx = this.data.sessions.findIndex((s) => s.id === id)
    if (idx < 0) return null

    const current = this.data.sessions[idx]
    const mode = updates.mode ? normalizeSessionMode(updates.mode) : current.mode
    const context = updates.context
      ? { ...current.context, ...updates.context }
      : current.context
    const title =
      updates.title?.trim() ||
      (updates.context || updates.mode
        ? defaultSessionTitle(mode, context)
        : current.title)

    const next: WorkSession = {
      ...current,
      mode,
      context,
      title,
      updatedAt: Date.now()
    }
    this.data.sessions[idx] = next
    this.persist()
    return next
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

  appendExchange(
    sessionId: string,
    question: string,
    answer: string
  ): WorkSession | null {
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
      updatedAt: Date.now()
    }
    this.data.sessions[idx] = next
    this.persist()
    return next
  }

  /**
   * One-time migration from legacy flat settings context → first session.
   */
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
    this.data.sessions[0] = {
      ...only,
      mode,
      context,
      title: defaultSessionTitle(mode, context),
      updatedAt: Date.now()
    }
    this.persist()
  }
}
