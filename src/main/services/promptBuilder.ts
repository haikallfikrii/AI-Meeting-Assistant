import { SessionContext, WorkSession, emptySessionContext } from './sessionTypes'

export type SessionMode = 'interview' | 'client-meeting' | 'random-chat'

export type { SessionContext, WorkSession }

export function normalizeSessionMode(value: unknown): SessionMode {
  if (value === 'client-meeting' || value === 'random-chat' || value === 'interview') {
    return value
  }
  return 'interview'
}

export interface PromptContext {
  sessionMode: SessionMode
  context: SessionContext
}

const SHARED_SPEAKING_RULES = `
SPEAKING & FORMAT RULES:
1. SIMPLE WORDS & SHORT SENTENCES — everyday conversational language, 10–15 words per sentence when possible.
2. LINE 1 = core answer the user can say out loud immediately. Then 2–3 short bullets if needed.
3. **Bold** key terms for quick scanning.
4. NO AI filler ("Certainly!", "Great question", "I'd be happy to..."). Jump straight to the answer.
5. Keep answers speakable in ~20–45 seconds unless the topic clearly needs more depth.
`

function interviewContextBlock(ctx: SessionContext): string {
  const sections: string[] = []
  if (ctx.companyName.trim()) sections.push(`COMPANY: ${ctx.companyName.trim()}`)
  if (ctx.targetRole.trim()) sections.push(`ROLE / POSITION: ${ctx.targetRole.trim()}`)
  if (ctx.jobDescription.trim())
    sections.push(`JOB DESCRIPTION:\n${ctx.jobDescription.trim()}`)
  if (ctx.resumeDescription.trim())
    sections.push(`RESUME / BACKGROUND:\n${ctx.resumeDescription.trim()}`)
  if (ctx.answerBank.trim())
    sections.push(
      `ANSWER BANK (reuse naturally when relevant, do not paste robotically):\n${ctx.answerBank.trim()}`
    )
  if (sections.length === 0) return ''
  return `\nINTERVIEW CONTEXT:\n${sections.join('\n\n')}\n`
}

function clientMeetingContextBlock(ctx: SessionContext): string {
  const sections: string[] = []
  if (ctx.clientName.trim()) sections.push(`CLIENT: ${ctx.clientName.trim()}`)
  if (ctx.projectName.trim()) sections.push(`PROJECT / FEATURE: ${ctx.projectName.trim()}`)
  if (ctx.projectScope.trim())
    sections.push(`SCOPE / REQUIREMENTS:\n${ctx.projectScope.trim()}`)
  if (ctx.meetingGoals.trim())
    sections.push(`MEETING GOALS / NOTES:\n${ctx.meetingGoals.trim()}`)
  if (ctx.answerBank.trim())
    sections.push(`TALKING POINTS:\n${ctx.answerBank.trim()}`)
  if (sections.length === 0) return ''
  return `\nCLIENT MEETING CONTEXT:\n${sections.join('\n\n')}\n`
}

function randomChatContextBlock(ctx: SessionContext): string {
  const sections: string[] = []
  if (ctx.chatTopic.trim()) sections.push(`TOPIC: ${ctx.chatTopic.trim()}`)
  if (ctx.chatNotes.trim()) sections.push(`NOTES:\n${ctx.chatNotes.trim()}`)
  if (sections.length === 0) return ''
  return `\nCHAT CONTEXT:\n${sections.join('\n\n')}\n`
}

function interviewPrompt(ctx: SessionContext): string {
  return `
You are helping a candidate answer live in a real-time JOB INTERVIEW. Your text will be read out loud by the candidate.
${interviewContextBlock(ctx)}
CORE GOAL: Answers that sound human, confident, and tailored to this company/role.
Use prior turns in this session as continuity — do not contradict earlier answers.
Prefer aligning skills with the job description. Pull from the answer bank when a question matches.
${SHARED_SPEAKING_RULES}
5. For conceptual "What is X?" questions: 2–3 sentences, no multi-line code unless asked.
`
}

function clientMeetingPrompt(ctx: SessionContext): string {
  return `
You are helping someone in a live CLIENT / PROJECT MEETING. Draft short, professional replies they can say out loud.
${clientMeetingContextBlock(ctx)}
CORE GOAL: Clear, calm, client-friendly answers — status, trade-offs, next steps, estimates, risks.
IMPORTANT: This session may span multiple meetings with the same client/project.
Use earlier conversation turns in THIS session as memory of what was already discussed (decisions, blockers, commitments).
Tone: collaborative consultant. Be concrete about this project/feature.
${SHARED_SPEAKING_RULES}
5. Prefer action-oriented language ("We can...", "Next step is...", "The risk is...").
`
}

function randomChatPrompt(ctx: SessionContext): string {
  return `
You are a discreet live assistant during a casual conversation or random chat/call.
Draft natural replies the user can say out loud.
${randomChatContextBlock(ctx)}
CORE GOAL: Helpful, brief, natural — match the energy of a normal conversation.
Remember prior turns in this chat session for continuity.
Do NOT sound like a job interview unless the other person is clearly interviewing.
${SHARED_SPEAKING_RULES}
5. Keep it light and proportional. Short questions get short answers.
`
}

export function buildSystemPromptFromSession(session: WorkSession): string {
  switch (session.mode) {
    case 'client-meeting':
      return clientMeetingPrompt(session.context)
    case 'random-chat':
      return randomChatPrompt(session.context)
    case 'interview':
    default:
      return interviewPrompt(session.context)
  }
}

/** @deprecated legacy flat context — kept for transitional OpenAIConfig */
export interface ContextSettings {
  sessionMode: SessionMode
  targetRole: string
  companyName: string
  jobDescription: string
  resumeDescription: string
  answerBank: string
  clientName?: string
  projectName?: string
  projectScope?: string
  meetingGoals?: string
  chatTopic?: string
  chatNotes?: string
}

export function buildSystemPrompt(ctx: ContextSettings): string {
  const session: WorkSession = {
    id: 'temp',
    title: 'temp',
    mode: normalizeSessionMode(ctx.sessionMode),
    createdAt: 0,
    updatedAt: 0,
    context: {
      ...emptySessionContext(),
      targetRole: ctx.targetRole || '',
      companyName: ctx.companyName || '',
      jobDescription: ctx.jobDescription || '',
      resumeDescription: ctx.resumeDescription || '',
      answerBank: ctx.answerBank || '',
      clientName: ctx.clientName || '',
      projectName: ctx.projectName || '',
      projectScope: ctx.projectScope || '',
      meetingGoals: ctx.meetingGoals || '',
      chatTopic: ctx.chatTopic || '',
      chatNotes: ctx.chatNotes || ''
    },
    messages: [],
    answers: []
  }
  return buildSystemPromptFromSession(session)
}

export function defaultContextSettings(): ContextSettings {
  return {
    sessionMode: 'interview',
    targetRole: '',
    companyName: '',
    jobDescription: '',
    resumeDescription: '',
    answerBank: ''
  }
}
