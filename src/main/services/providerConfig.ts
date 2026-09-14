import OpenAI from 'openai'

export type LlmProvider = 'openai' | 'openrouter' | 'custom'

export const OPENAI_BASE_URL = 'https://api.openai.com/v1'
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

export const DEFAULT_CHAT_MODELS: Record<LlmProvider, string> = {
  openai: 'gpt-4o-mini',
  openrouter: 'openai/gpt-4o-mini',
  custom: 'gpt-4o-mini'
}

export const DEFAULT_STT_MODELS: Record<LlmProvider, string> = {
  openai: 'whisper-1',
  openrouter: 'openai/whisper-1',
  custom: 'whisper-1'
}

export const DEFAULT_VISION_MODELS: Record<LlmProvider, string> = {
  openai: 'gpt-4o',
  openrouter: 'openai/gpt-4o',
  custom: 'gpt-4o'
}

export interface ProviderClientOptions {
  apiKey: string
  provider?: LlmProvider
  baseUrl?: string
}

/** Resolve the effective API base URL for the selected provider. */
export function resolveBaseUrl(provider: LlmProvider = 'openai', customBaseUrl?: string): string {
  const trimmed = customBaseUrl?.trim()
  if (trimmed) {
    return trimmed.replace(/\/$/, '')
  }

  switch (provider) {
    case 'openrouter':
      return OPENROUTER_BASE_URL
    case 'custom':
      return OPENAI_BASE_URL
    case 'openai':
    default:
      return OPENAI_BASE_URL
  }
}

/** Extra headers required by OpenRouter (safe to omit for other providers). */
export function resolveDefaultHeaders(provider: LlmProvider = 'openai'): Record<string, string> {
  if (provider === 'openrouter') {
    return {
      'HTTP-Referer': 'https://kalfi.app',
      'X-Title': 'Kalfi'
    }
  }
  return {}
}

export function createOpenAIClient(options: ProviderClientOptions): OpenAI {
  const provider = options.provider || 'openai'
  const baseURL = resolveBaseUrl(provider, options.baseUrl)
  const defaultHeaders = resolveDefaultHeaders(provider)

  return new OpenAI({
    apiKey: options.apiKey,
    baseURL,
    ...(Object.keys(defaultHeaders).length > 0 ? { defaultHeaders } : {})
  })
}

/**
 * OpenRouter STT uses a JSON body (base64 input_audio), not the OpenAI SDK
 * multipart shape. Call this when provider === 'openrouter'.
 */
export async function transcribeWithOpenRouter(options: {
  apiKey: string
  baseUrl?: string
  wavBuffer: Buffer
  model: string
  language?: string
}): Promise<string> {
  const baseURL = resolveBaseUrl('openrouter', options.baseUrl)
  const headers = resolveDefaultHeaders('openrouter')

  const response = await fetch(`${baseURL}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      model: options.model,
      ...(options.language ? { language: options.language } : {}),
      input_audio: {
        data: options.wavBuffer.toString('base64'),
        format: 'wav'
      }
    })
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `OpenRouter transcription failed (${response.status}): ${errorText || response.statusText}`
    )
  }

  const result = (await response.json()) as { text?: string }
  return result.text?.trim() || ''
}
