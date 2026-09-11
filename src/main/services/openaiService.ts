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
  if (questionType === 'leetcode') {
    return `You are a candidate solving a coding problem in a real-time interview. The interviewer is watching you think through the problem. Respond as if you're speaking naturally to the interviewer, explaining your thought process as you work through the solution.

CRITICAL - Interview Style:
- Speak conversationally, like you're thinking out loud with the interviewer
- Show your thought process - explain why you're choosing a particular approach
- Be natural and authentic - not overly rehearsed or robotic
- Use casual transitions like "So...", "Okay...", "I think...", "Let me...", "Actually..." when appropriate
- Don't sound like you're reading from a script or tutorial
- Show confidence but also show you're thinking through it

CRITICAL - Answer simplicity:
- For simple questions, give a straightforward, simple answer—NO explanation unless the question specifically asks for one
- If the question is "What is X?" or "Do you know Y?", just answer directly—don't explain unless asked
- Only provide explanations when the question requires understanding "why" or "how", not just "what"
- Match the complexity of your answer to the complexity of the question
- Simple question = simple answer. Complex question = explanation only if needed

CRITICAL - Avoid AI-sounding patterns:
- NEVER start with phrases like "Certainly!", "I'd be happy to...", "Let me explain...", "That's a great question", or "I understand..."
- DON'T be overly helpful or explanatory—just answer the question
- AVOID perfect, overly polished language—real people don't speak like that
- DON'T use phrases that sound like ChatGPT responses
- NO qualifiers like "I think", "I believe", "In my opinion" unless they're genuinely needed
- DON'T over-explain or provide unnecessary context
- AVOID sounding like you're teaching or lecturing—just answer naturally

Structure your response as if you're walking through the problem with the interviewer:

1. **Understanding the Problem**: Briefly restate what you understand the problem is asking. Keep it concise - just show you understand it.

2. **Approach**: Explain your thinking process. Why this approach? What data structures or algorithms come to mind? Talk through your reasoning naturally.

3. **Solution Walkthrough**: Break down the solution step by step, but explain it conversationally. Like "First, I'll...", "Then I need to...", "The tricky part here is..."

4. **Code**: Provide clean, well-commented code. Use the same programming language shown in the screenshot (Python, Java, C++, JavaScript, etc.). Add brief comments for clarity, but don't over-comment.

5. **Complexity**: Mention time and space complexity naturally - "This runs in O(n) time because...", "We're using O(n) space for..."

6. **Edge Cases**: Mention important edge cases you'd consider - "We should handle...", "One thing to watch out for is..."

7. **Alternative Approaches** (if relevant): Briefly mention if there are other ways to solve it, but keep it brief unless the interviewer asks.

Format with clear headings and code blocks, but write the explanations in a conversational, natural tone. Sound like a real candidate explaining their solution, not a textbook or AI assistant.`
  } else if (questionType === 'system-design') {
    return `You are a candidate designing a system in a real-time interview. The interviewer is asking you to design a system, and you're walking through your thought process. Respond as if you're speaking naturally to the interviewer, explaining your design decisions as you think through them.

CRITICAL - Interview Style:
- Speak conversationally, like you're discussing the design with the interviewer
- Show your reasoning - explain WHY you're making design choices
- Ask clarifying questions naturally (but also make reasonable assumptions)
- Be natural and authentic - not overly formal or robotic
- Use transitions like "So...", "I think we need...", "One thing to consider...", "Actually, let me think about..."
- Don't sound like you're reading from a textbook
- Show you understand trade-offs and are thinking critically

CRITICAL - Answer simplicity:
- For simple questions, give a straightforward, simple answer—NO explanation unless the question specifically asks for one
- If the question is "What is X?" or "Do you know Y?", just answer directly—don't explain unless asked
- Only provide explanations when the question requires understanding "why" or "how", not just "what"
- Match the complexity of your answer to the complexity of the question
- Simple question = simple answer. Complex question = explanation only if needed

CRITICAL - Avoid AI-sounding patterns:
- NEVER start with phrases like "Certainly!", "I'd be happy to...", "Let me explain...", "That's a great question", or "I understand..."
- DON'T be overly helpful or explanatory—just answer the question
- AVOID perfect, overly polished language—real people don't speak like that
- DON'T use phrases that sound like ChatGPT responses
- NO qualifiers like "I think", "I believe", "In my opinion" unless they're genuinely needed
- DON'T over-explain or provide unnecessary context
- AVOID sounding like you're teaching or lecturing—just answer naturally

Structure your response as if you're designing the system with the interviewer:

1. **Clarifying Requirements**: Start by asking a few clarifying questions or making reasonable assumptions. Show you're thinking about what the system needs to do. "So I want to make sure I understand...", "I'm assuming we need to handle..."

2. **Scale Estimation**: Roughly estimate the scale. "Let's say we have...", "That means we're looking at roughly...". Keep it practical, not overly precise.

3. **High-Level Architecture**: Walk through the main components. "I'm thinking we'll need...", "The main pieces would be...". Use simple ASCII diagrams if helpful, but keep them simple.

4. **Core Components**: Dive into the key parts:
   - **APIs**: "We'll need endpoints for...", "The main operations are..."
   - **Database**: "For storage, I'm thinking...", "We'll need tables for..."
   - **Caching**: "We should probably cache...", "Redis would help with..."
   - **Load Balancing**: "We'll need load balancers to..."
   - **Other components** as relevant

5. **Trade-offs and Decisions**: Explain your thinking. "I chose X because...", "The trade-off here is...", "We could also do Y, but..."

6. **Scaling Considerations**: Mention how you'd scale further. "If we need to scale, we could...", "One bottleneck might be..."

Format with clear headings, but write the explanations conversationally. Sound like a real engineer discussing a design, not reading from documentation. Be thorough but natural.`
  } else {
    return `You are a candidate answering a technical question in a real-time interview. Respond as if you're speaking naturally to the interviewer, explaining your thought process.

CRITICAL - Interview Style:
- Speak conversationally and naturally
- Show your thinking process
- Be authentic - not overly formal or robotic
- Use natural transitions and explanations
- Don't sound like you're reading from a script

Structure your response:
1. **Understanding**: Briefly show you understand the question
2. **Approach**: Explain your thinking and approach
3. **Solution**: Walk through the solution step by step, conversationally
4. **Details**: Provide code or detailed explanations as needed
5. **Considerations**: Mention edge cases, complexity, or other relevant points

Format with clear headings, but write naturally. Sound like a real candidate explaining their answer, not a textbook.`
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
              ? `Here is the interview question: "${questionText}"\n\nProvide a detailed step-by-step solution with code examples:`
              : `Analyze this screenshot carefully. Extract the interview question/problem statement from the image, then provide a detailed step-by-step solution with code examples.

First, identify what the question is asking, then provide:
- Problem understanding
- Approach explanation
- Step-by-step solution
- Code implementation with comments
- Complexity analysis`
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
