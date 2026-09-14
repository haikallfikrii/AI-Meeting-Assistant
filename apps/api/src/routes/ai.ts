import { Hono } from 'hono'
import { z } from 'zod'
import { env, proTokenCap } from '../lib/config.js'
import { bumpUsage, publicUser } from '../lib/store.js'
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
  if (user.tokensUsed >= proTokenCap()) {
    return c.json({ error: 'Monthly Pro quota reached', code: 'QUOTA' }, 429)
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
  bumpUsage(user.id, tokens)
  const refreshed = c.get('user')

  return c.json({
    content: data.choices?.[0]?.message?.content || '',
    usage: data.usage,
    user: publicUser(bumpUsage(refreshed.id, 0) || refreshed)
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
  if (user.tokensUsed >= proTokenCap()) {
    return c.json({ error: 'Monthly Pro quota reached', code: 'QUOTA' }, 429)
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

  bumpUsage(user.id, 1200)
  return c.json({ text: data.text || '' })
})
