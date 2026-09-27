import { Hono } from 'hono'
import { z } from 'zod'
import { env } from '../lib/config.js'
import {
  bumpUsage,
  currentMonthTokens,
  effectiveTokenCap,
  publicUser
} from '../lib/store.js'
import { requireAuth, requirePro, type AppVars } from '../middleware/auth.js'

export const aiRoutes = new Hono<{ Variables: AppVars }>()

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string()
      })
    )
    .min(1),
  model: z.string().optional()
})

aiRoutes.use('*', requireAuth, requirePro)

aiRoutes.post('/chat', async (c) => {
  const key = env('OPENROUTER_API_KEY')
  if (!key) return c.json({ error: 'Hosted AI not configured' }, 503)

  const user = c.get('user')
  const used = currentMonthTokens(user)
  const cap = effectiveTokenCap(user)
  if (used >= cap || cap <= 0) {
    return c.json(
      {
        error: 'Monthly Pro quota reached',
        code: 'QUOTA',
        tokensUsed: used,
        tokenCap: cap
      },
      429
    )
  }

  const body = chatSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)

  const model = body.data.model || env('HOSTED_CHAT_MODEL', 'openai/gpt-4o-mini')
  const base = env('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1').replace(/\/$/, '')

  const upstream = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': env('APP_URL', 'https://kalfi.app'),
      'X-Title': 'Kalfi'
    },
    body: JSON.stringify({
      model,
      messages: body.data.messages,
      stream: false
    })
  })

  const data = (await upstream.json()) as {
    error?: { message?: string }
    usage?: { total_tokens?: number }
    choices?: Array<{ message?: { content?: string } }>
  }

  if (!upstream.ok) {
    return c.json({ error: data.error?.message || 'Upstream AI error' }, 502)
  }

  const tokens = data.usage?.total_tokens || 800
  const updated = bumpUsage(user.id, tokens)

  return c.json({
    content: data.choices?.[0]?.message?.content || '',
    usage: data.usage,
    user: publicUser(updated || user)
  })
})

const sttSchema = z.object({
  /** base64 wav/webm/mp3 */
  audioBase64: z.string().min(16),
  mimeType: z.string().default('audio/wav')
})

aiRoutes.post('/transcribe', async (c) => {
  const key = env('OPENROUTER_API_KEY')
  if (!key) return c.json({ error: 'Hosted AI not configured' }, 503)

  const user = c.get('user')
  const used = currentMonthTokens(user)
  const cap = effectiveTokenCap(user)
  if (used >= cap || cap <= 0) {
    return c.json(
      {
        error: 'Monthly Pro quota reached',
        code: 'QUOTA',
        tokensUsed: used,
        tokenCap: cap
      },
      429
    )
  }

  const body = sttSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid payload' }, 400)

  const base = env('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1').replace(/\/$/, '')
  const model = env('HOSTED_STT_MODEL', 'openai/whisper-1')

  const upstream = await fetch(`${base}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': env('APP_URL', 'https://kalfi.app'),
      'X-Title': 'Kalfi'
    },
    body: JSON.stringify({
      model,
      input_audio: {
        data: body.data.audioBase64,
        format: body.data.mimeType.includes('wav') ? 'wav' : 'mp3'
      }
    })
  })

  const data = (await upstream.json()) as { text?: string; error?: { message?: string } }
  if (!upstream.ok) {
    return c.json({ error: data.error?.message || 'STT failed' }, 502)
  }

  const updated = bumpUsage(user.id, 1200)
  return c.json({ text: data.text || '', user: publicUser(updated || user) })
})

/**
 * OpenAI-compatible surface for the desktop app (Hosted plans).
 * The app points its OpenAI SDK at `${API}/v1/ai/openai` with the Kalfi JWT as the key.
 * Model is chosen server-side so a leaked token can't burn expensive models.
 */
function openaiError(message: string, code: string, status: 401 | 402 | 429 | 400 | 502 | 503) {
  return new Response(JSON.stringify({ error: { message, code, type: code } }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function quotaExceeded(user: AppVars['user']): Response | null {
  const used = currentMonthTokens(user)
  const cap = effectiveTokenCap(user)
  if (used >= cap || cap <= 0) {
    return openaiError(
      `Monthly Hosted AI quota reached (${used}/${cap} tokens). Contact support to extend.`,
      'QUOTA',
      429
    )
  }
  return null
}

function hasImageContent(messages: unknown): boolean {
  if (!Array.isArray(messages)) return false
  return messages.some(
    (m) =>
      Array.isArray((m as { content?: unknown })?.content) &&
      ((m as { content: Array<{ type?: string }> }).content).some((p) => p?.type === 'image_url')
  )
}

function estimateTokens(messages: unknown, completion: string): number {
  const promptChars = JSON.stringify(messages || '').length
  return Math.ceil((promptChars + completion.length) / 4) || 800
}

aiRoutes.post('/openai/chat/completions', async (c) => {
  const key = env('OPENROUTER_API_KEY')
  if (!key) return openaiError('Hosted AI not configured', 'NOT_CONFIGURED', 503)

  const user = c.get('user')
  const blocked = quotaExceeded(user)
  if (blocked) return blocked

  let body: Record<string, unknown>
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    return openaiError('Invalid JSON body', 'BAD_REQUEST', 400)
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return openaiError('messages is required', 'BAD_REQUEST', 400)
  }

  const vision = hasImageContent(body.messages)
  const model = vision
    ? env('HOSTED_VISION_MODEL', 'openai/gpt-4o-mini')
    : env('HOSTED_CHAT_MODEL', 'openai/gpt-4o-mini')
  const maxTokens = Math.min(
    Number(body.max_completion_tokens || body.max_tokens || 800) || 800,
    Number(env('HOSTED_MAX_OUTPUT_TOKENS', '2000')) || 2000
  )
  const stream = body.stream === true
  const base = env('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1').replace(/\/$/, '')

  const upstream = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': env('APP_URL', 'https://kalfi.app'),
      'X-Title': 'Kalfi'
    },
    body: JSON.stringify({
      model,
      messages: body.messages,
      max_tokens: maxTokens,
      ...(typeof body.temperature === 'number' ? { temperature: body.temperature } : {}),
      ...(body.response_format ? { response_format: body.response_format } : {}),
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : {})
    })
  })

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '')
    let message = 'Upstream AI error'
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message || message
    } catch {
      /* keep default */
    }
    return openaiError(message, 'UPSTREAM', 502)
  }

  if (!stream) {
    const data = (await upstream.json()) as {
      usage?: { total_tokens?: number }
      choices?: Array<{ message?: { content?: string } }>
    }
    const tokens =
      data.usage?.total_tokens ||
      estimateTokens(body.messages, data.choices?.[0]?.message?.content || '')
    bumpUsage(user.id, tokens)
    return c.json(data)
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let completion = ''
  let reportedTokens = 0

  const scanLines = (chunk: string): void => {
    pending += chunk
    const lines = pending.split('\n')
    pending = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const evt = JSON.parse(payload) as {
          usage?: { total_tokens?: number }
          choices?: Array<{ delta?: { content?: string } }>
        }
        if (evt.usage?.total_tokens) reportedTokens = evt.usage.total_tokens
        const delta = evt.choices?.[0]?.delta?.content
        if (delta) completion += delta
      } catch {
        /* OpenRouter keep-alive comments etc. */
      }
    }
  }

  const passthrough = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          bumpUsage(user.id, reportedTokens || estimateTokens(body.messages, completion))
          controller.close()
          return
        }
        scanLines(decoder.decode(value, { stream: true }))
        controller.enqueue(value)
      } catch (err) {
        bumpUsage(user.id, reportedTokens || estimateTokens(body.messages, completion))
        controller.error(err)
      }
    },
    cancel() {
      bumpUsage(user.id, reportedTokens || estimateTokens(body.messages, completion))
      void reader.cancel()
    }
  })

  return new Response(passthrough, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  })
})

aiRoutes.post('/openai/audio/transcriptions', async (c) => {
  const key = env('OPENROUTER_API_KEY')
  if (!key) return openaiError('Hosted AI not configured', 'NOT_CONFIGURED', 503)

  const user = c.get('user')
  const blocked = quotaExceeded(user)
  if (blocked) return blocked

  let body: { language?: string; input_audio?: { data?: string; format?: string } }
  try {
    body = await c.req.json()
  } catch {
    return openaiError('Invalid JSON body', 'BAD_REQUEST', 400)
  }
  const audio = body.input_audio?.data
  if (!audio || audio.length < 16) {
    return openaiError('input_audio.data is required', 'BAD_REQUEST', 400)
  }

  const base = env('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1').replace(/\/$/, '')
  const upstream = await fetch(`${base}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': env('APP_URL', 'https://kalfi.app'),
      'X-Title': 'Kalfi'
    },
    body: JSON.stringify({
      model: env('HOSTED_STT_MODEL', 'openai/whisper-1'),
      ...(body.language ? { language: body.language } : {}),
      input_audio: { data: audio, format: body.input_audio?.format || 'wav' }
    })
  })

  const data = (await upstream.json().catch(() => ({}))) as {
    text?: string
    error?: { message?: string }
  }
  if (!upstream.ok) {
    return openaiError(data.error?.message || 'Transcription failed', 'UPSTREAM', 502)
  }

  // ~16 kHz mono 16-bit wav: 32 KB per second of audio; bill ~25 tokens/sec
  const seconds = Math.max(1, Math.round((audio.length * 0.75) / 32000))
  bumpUsage(user.id, seconds * 25)
  return c.json({ text: data.text || '' })
})
