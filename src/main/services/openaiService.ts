import { EventEmitter } from 'events'
import OpenAI from 'openai'
import {
  DEFAULT_CHAT_MODELS,
  LlmProvider,
  createOpenAIClient
} from './providerConfig'
import { buildSystemPromptFromSession } from './promptBuilder'
import { SessionMessage, WorkSession } from './sessionTypes'

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OpenAIConfig {
  apiKey: string
  provider?: LlmProvider
  baseUrl?: string
  model?: string
  maxTokens?: number
  temperature?: number
  session?: WorkSession | null
}

const getSolutionSystemPrompt = (questionType?: 'leetcode' | 'system-design' | 'other'): string => {
  const sharedRules = `
CRITICAL — Match answer complexity to the question:
- Simple arithmetic, definitions, yes/no, or one-line conceptual questions → answer in 1–3 short speakable sentences. NO code blocks unless the question explicitly asks to write/code/implement.
- Only use full coding walkthroughs when the screenshot clearly shows a coding/algorithm problem (LeetCode-style, implement a function, etc.).
- Never invent a coding problem when the screen shows a simple question like "what is 1+1" or a short behavioral prompt.
- Prefer spoken interview style over textbook essays.`

  if (questionType === 'leetcode') {
    return `You are a candidate solving a coding problem in a real-time interview. The interviewer is watching you think through the problem. Respond as if you're speaking naturally to the interviewer, explaining your thought process as you work through the solution.
${sharedRules}

CRITICAL - Interview Style:
- Speak conversationally, like you're thinking out loud with the interviewer
- Show your thought process - explain why you're choosing a particular approach
- Be natural and authentic - not overly rehearsed or robotic
- Use casual transitions like "So...", "Okay...", "I think...", "Let me...", "Actually..." when appropriate
- Don't sound like you're reading from a script or tutorial
- Show confidence but also show you're thinking through it

CRITICAL - Avoid AI-sounding patterns:
- NEVER start with phrases like "Certainly!", "I'd be happy to...", "Let me explain...", "That's a great question", or "I understand..."
- DON'T be overly helpful or explanatory—just answer the question
- AVOID perfect, overly polished language—real people don't speak like that
- DON'T use phrases that sound like ChatGPT responses

ONLY if this is a real coding/algorithm problem, structure as:
1. Understanding (1 sentence)
2. Approach (short)
3. Code (same language as on screen if visible)
4. Complexity (brief)

If the question is NOT a coding problem, ignore the code structure and give a short spoken answer only.`
  } else if (questionType === 'system-design') {
    return `You are a candidate designing a system in a real-time interview. Respond as if you're speaking naturally to the interviewer.
${sharedRules}

Speak conversationally. Cover: clarifying assumptions, high-level pieces, key trade-offs. Keep it speakable — not a whitepaper.
NO large code dumps unless asked.`
  } else {
    return `You are a candidate answering a live interview question. Speak naturally to the interviewer.
${sharedRules}

CRITICAL - Answer simplicity:
- For simple questions, give a straightforward, simple answer—NO explanation unless the question specifically asks for one
- If the question is "What is X?" or "Do you know Y?", just answer directly—don't explain unless asked
- Match the complexity of your answer to the complexity of the question
- Simple question = simple answer. Complex question = explanation only if needed
- Do NOT output code unless the question explicitly asks for code, an algorithm, or an implementation

CRITICAL - Avoid AI-sounding patterns:
- NEVER start with "Certainly!", "I'd be happy to...", "Great question"
- Jump straight to the answer in a natural spoken tone`
  }
}

function userPromptForMode(mode: WorkSession['mode'], question: string): string {
  if (mode === 'client-meeting') {
    return `Client/meeting remark or question: "${question}"\n\nProvide a professional spoken reply:`
  }
  if (mode === 'random-chat') {
    return `Conversation line: "${question}"\n\nProvide a natural spoken reply:`
  }
  return `Interview question: "${question}"\n\nProvide a professional answer:`
}

export class OpenAIService extends EventEmitter {
  private client: OpenAI | null = null
  private config: OpenAIConfig
  private conversationHistory: Message[] = []
  private maxHistoryLength = 40
  private systemPrompt: string = ''
  private sessionMode: WorkSession['mode'] = 'interview'
  private activeSessionId: string | null = null

  constructor(config: OpenAIConfig) {
    super()
    this.config = config
    this.client = createOpenAIClient({
      apiKey: config.apiKey,
      provider: config.provider,
      baseUrl: config.baseUrl
    })
    this.applySession(config.session || null)
  }

  private getChatModel(): string {
    const provider = this.config.provider || 'openai'
    return this.config.model || DEFAULT_CHAT_MODELS[provider]
  }

  private applySession(session: WorkSession | null): void {
    if (!session) {
      this.systemPrompt =
        'You are a discreet live assistant. Give short, speakable replies. No AI filler.'
      this.conversationHistory = []
      this.sessionMode = 'interview'
      this.activeSessionId = null
      return
    }

    this.activeSessionId = session.id
    this.sessionMode = session.mode
    this.systemPrompt = buildSystemPromptFromSession(session)
    this.conversationHistory = session.messages
      .slice(-this.maxHistoryLength)
      .map((m: SessionMessage) => ({
        role: m.role,
        content: m.content
      }))
  }

  getActiveSessionId(): string | null {
    return this.activeSessionId
  }

  loadSession(session: WorkSession): void {
    this.config.session = session
    this.applySession(session)
  }

  async generateAnswer(question: string): Promise<string> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized')
    }

    this.conversationHistory.push({
      role: 'user',
      content: userPromptForMode(this.sessionMode, question)
    })

    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength)
    }

    const messages: Message[] = [
      { role: 'system', content: this.systemPrompt },
      ...this.conversationHistory
    ]

    try {
      let fullResponse = ''

      const stream = await this.client.chat.completions.create({
        model: this.getChatModel(),
        messages: messages,
        max_completion_tokens: this.config.maxTokens || 500,
        temperature: this.config.temperature || 0.7,
        stream: true
      })

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || ''
        if (content) {
          fullResponse += content
          this.emit('stream', content)
        }
      }

      this.conversationHistory.push({
        role: 'assistant',
        content: fullResponse
      })

      this.emit('complete', fullResponse)
      this.emit('exchange', {
        sessionId: this.activeSessionId,
        question,
        answer: fullResponse
      })
      return fullResponse
    } catch (error) {
      this.emit('error', error)
      throw error
    }
  }

  clearHistory(): void {
    this.conversationHistory = []
  }

  async summarizeSession(): Promise<string> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized')
    }

    const transcript = this.conversationHistory
      .map((m) => `${m.role === 'user' ? 'Q' : 'A'}: ${m.content}`)
      .join('\n\n')

    if (!transcript.trim()) {
      throw new Error('No conversation yet to summarize in this meeting session.')
    }

    const response = await this.client.chat.completions.create({
      model: this.getChatModel(),
      messages: [
        {
          role: 'system',
          content: `You summarize a live meeting/interview session for the user.
Write a clear, scannable summary with:
1. **Overview** (2–3 sentences)
2. **Key points discussed** (bullets)
3. **Decisions / commitments** (bullets, if any)
4. **Open questions / next steps** (bullets)
Keep it concise. Use markdown. No fluff.`
        },
        {
          role: 'user',
          content: `Summarize this session conversation:\n\n${transcript}`
        }
      ],
      max_completion_tokens: 800,
      temperature: 0.4
    })

    const summary = response.choices[0]?.message?.content?.trim() || ''
    if (!summary) {
      throw new Error('Empty summary returned')
    }
    return summary
  }

  async generateSolutionFromImage(
    imageBase64: string,
    questionText?: string,
    questionType?: 'leetcode' | 'system-design' | 'other'
  ): Promise<string> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized')
    }

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
    const solutionPrompt = getSolutionSystemPrompt(questionType)

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: solutionPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: questionText
              ? `Interview question from the screen: "${questionText}"

Rules:
- Match answer length to question difficulty.
- If this is a simple / non-coding question, answer in 1–3 short spoken sentences with NO code.
- Only include code if the question clearly asks to implement/write an algorithm or function.

Provide the answer the candidate should say:`
              : `Analyze this screenshot. Extract the visible interview question, then answer it.

Rules:
- Match answer length to question difficulty.
- Simple questions (math, definitions, short prompts) → short spoken answer, NO code.
- Coding/algorithm problems only → then include approach + code.
- Do not invent a coding problem if the screen does not show one.`
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${base64Data}`
            }
          }
        ]
      }
    ]

    try {
      let fullResponse = ''
      const model = this.getChatModel()
      const looksVisionCapable =
        /gpt-4o|gpt-4\.1|gemini|claude|vision|llava/i.test(model) || model.includes('/')
      const visionModel = looksVisionCapable
        ? model
        : this.config.provider === 'openrouter'
          ? 'openai/gpt-4o-mini'
          : 'gpt-4o-mini'

      const stream = await this.client.chat.completions.create({
        model: visionModel,
        messages: messages,
        max_completion_tokens: this.config.maxTokens || 2000,
        temperature: this.config.temperature || 0.7,
        stream: true
      })

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || ''
        if (content) {
          fullResponse += content
          this.emit('stream', content)
        }
      }

      const question = questionText || 'Screenshot question'
      this.emit('complete', fullResponse)
      this.emit('exchange', {
        sessionId: this.activeSessionId,
        question,
        answer: fullResponse
      })
      return fullResponse
    } catch (error) {
      this.emit('error', error)
      throw error
    }
  }

  updateConfig(config: Partial<OpenAIConfig>): void {
    this.config = { ...this.config, ...config }
    if (config.apiKey || config.provider || config.baseUrl !== undefined) {
      this.client = createOpenAIClient({
        apiKey: this.config.apiKey,
        provider: this.config.provider,
        baseUrl: this.config.baseUrl
      })
    }
    if (config.session !== undefined) {
      this.applySession(config.session)
    }
  }
}
