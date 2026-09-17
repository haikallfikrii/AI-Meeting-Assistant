import {
  AnswerLength,
  AnswerTone,
  SessionContext,
  WorkSession,
  emptySessionContext
} from './sessionTypes'

export type SessionMode = 'interview' | 'client-meeting' | 'random-chat'

export type { SessionContext, WorkSession, AnswerLength, AnswerTone }

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

function lengthRules(length: AnswerLength): string {
  switch (length) {
    case 'brief':
      return `LENGTH: BRIEF — 1–2 short sentences max. Line 1 = the full answer. Skip bullets unless essential. Speakable in ~10–20 seconds.`
    case 'detailed':
      return `LENGTH: DETAILED — Give a full answer with structure (short intro + 3–5 bullets or short paragraphs). Still speakable; avoid essays. ~45–90 seconds when read aloud.`
    case 'balanced':
    default:
      return `LENGTH: BALANCED — Line 1 = core answer. Then 2–3 short bullets if needed. Speakable in ~20–45 seconds.`
  }
}

function toneRules(tone: AnswerTone): string {
  switch (tone) {
    case 'formal':
      return `TONE: FORMAL — Polished, professional wording. Complete sentences. No slang, no filler, no jokes unless asked.`
    case 'casual':
      return `TONE: CASUAL — Natural spoken style. Friendly, relaxed, short. Light slang OK if the other person uses it.`
    case 'neutral':
    default:
      return `TONE: NEUTRAL — Clear, confident, conversational. Not stiff, not too slangy.`
  }
}

function languageRules(lang: string | undefined): string {
  const code = (lang || 'auto').toLowerCase()
  const map: Record<string, string> = {
    en: 'English',
    id: 'Indonesian (Bahasa Indonesia)',
    zh: 'Chinese (Simplified preferred unless the caller uses Traditional)',
    ja: 'Japanese',
    ko: 'Korean',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    pt: 'Portuguese',
    hi: 'Hindi',
    ar: 'Arabic',
    vi: 'Vietnamese',
    th: 'Thai',
    ms: 'Malay'
  }
  if (code === 'auto' || !map[code]) {
    return `LANGUAGE: Match the language the other person is speaking in this meeting. If mixed, prefer the language of the latest question. Do not translate unless they ask.`
  }
  return `LANGUAGE: Write the entire suggested reply in ${map[code]}. Do not switch languages unless the question is clearly in another language and they expect that reply.`
}

function speakingRules(ctx: SessionContext): string {
  return `
SPEAKING & FORMAT RULES:
1. SIMPLE WORDS & SHORT SENTENCES — everyday language, prefer 10–15 words per sentence when possible.
2. **Bold** key terms for quick scanning.
3. NO AI filler ("Certainly!", "Great question", "I'd be happy to..."). Jump straight to the answer.
4. ${lengthRules(ctx.answerLength || 'balanced')}
5. ${toneRules(ctx.answerTone || 'neutral')}
6. ${languageRules(ctx.meetingLanguage)}
`
}

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
${speakingRules(ctx)}
7. For conceptual "What is X?" questions: stay proportional to the length setting; no multi-line code unless asked.
8. SPEAKER AWARENESS: Prefer answering the interviewer's question. If the latest line is the candidate confirming/repeating the question ("so you're asking…", "just to confirm…"), answer the underlying interviewer question — not the confirmation itself.
9. Do not treat the candidate's own first-person statements as interviewer questions.
`
}

function clientMeetingPrompt(ctx: SessionContext): string {
  return `
You are helping someone in a live CLIENT / PROJECT MEETING. Draft replies they can say out loud.
${clientMeetingContextBlock(ctx)}
CORE GOAL: Clear, calm, client-friendly answers — status, trade-offs, next steps, estimates, risks.
IMPORTANT: This session may span multiple meetings with the same client/project.
Use earlier conversation turns in THIS session as memory of what was already discussed (decisions, blockers, commitments).
Prefer action-oriented language ("We can...", "Next step is...", "The risk is...").
${speakingRules(ctx)}
`
}

function randomChatPrompt(ctx: SessionContext): string {
  return `
You are a discreet live assistant during a casual conversation or random chat/call.
Draft natural replies the user can say out loud.
${randomChatContextBlock(ctx)}
CORE GOAL: Helpful, natural — match the energy of a normal conversation.
Remember prior turns in this chat session for continuity.
Do NOT sound like a job interview unless the other person is clearly interviewing.
${speakingRules(ctx)}
7. Keep replies proportional to the other person's energy.
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
  answerLength?: AnswerLength
  answerTone?: AnswerTone
}

export function buildSystemPrompt(ctx: ContextSettings): string {
  const session: WorkSession = {
    id: 'temp',
    title: 'temp',
    mode: normalizeSessionMode(ctx.sessionMode),
    createdAt: 0,
    updatedAt: 0,
    threadId: 'temp',
    threadTitle: 'temp',
    meetingLabel: '',
    timeOfDay: 'afternoon',
    summary: '',
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
      chatNotes: ctx.chatNotes || '',
      answerLength: ctx.answerLength || 'balanced',
      answerTone: ctx.answerTone || 'neutral'
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
