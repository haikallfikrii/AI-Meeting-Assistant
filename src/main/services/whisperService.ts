import { EventEmitter } from 'events'
import * as fs from 'fs'
import OpenAI from 'openai'
import * as os from 'os'
import * as path from 'path'
import {
  DEFAULT_STT_MODELS,
  LlmProvider,
  createOpenAIClient,
  transcribeWithOpenRouter
} from './providerConfig'

export interface TranscriptEvent {
  text: string
  isFinal: boolean
  confidence: number
  /** Wall-clock ms when the first voiced chunk of this utterance arrived. */
  startedAt: number
}

export interface WhisperConfig {
  apiKey: string
  provider?: LlmProvider
  baseUrl?: string
  model?: string
  language?: string
  /** Pause (ms) after the last voiced chunk before an utterance is transcribed. */
  silenceMs?: number
  /** Utterances with fewer words are dropped as noise. */
  minWords?: number
}

export const MIN_SILENCE_MS = 300
export const MAX_SILENCE_MS = 5000

export function clampSilenceMs(value: unknown, fallback = 1500): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(MAX_SILENCE_MS, Math.max(MIN_SILENCE_MS, Math.round(n)))
}

export class WhisperService extends EventEmitter {
  private client: OpenAI
  private config: WhisperConfig
  private audioBuffer: Buffer[] = []
  private isProcessing = false
  private isRunning = false
  private processInterval: NodeJS.Timeout | null = null
  private lastAudioTime = 0
  private bufferStartedAt = 0
  private readonly SAMPLE_RATE = 16000
  private readonly BYTES_PER_SAMPLE = 2 // 16-bit audio
  private readonly MIN_AUDIO_DURATION_MS = 800
  private readonly MAX_BUFFER_DURATION_MS = 20000
  private silenceMs: number

  constructor(config: WhisperConfig) {
    super()
    this.config = config
    this.silenceMs = clampSilenceMs(config.silenceMs)
    this.client = createOpenAIClient({
      apiKey: config.apiKey,
      provider: config.provider,
      baseUrl: config.baseUrl
    })
  }

  setLanguage(language?: string): void {
    this.config.language = language
  }

  setSilenceMs(ms: number): void {
    this.silenceMs = clampSilenceMs(ms, this.silenceMs)
  }

  /** Drop audio that has not been sent for transcription yet. */
  resetBuffer(): void {
    this.audioBuffer = []
    this.bufferStartedAt = 0
  }

  /** ISO-639-1 for Whisper, or undefined for auto-detect. */
  private resolveWhisperLanguage(): string | undefined {
    const raw = (this.config.language || '').trim().toLowerCase()
    if (!raw || raw === 'auto') return undefined
    return raw
  }

  private getSttModel(): string {
    const provider = this.config.provider || 'openai'
    return this.config.model || DEFAULT_STT_MODELS[provider]
  }

  start(): void {
    if (this.isRunning) return

    this.isRunning = true
    this.resetBuffer()
    this.lastAudioTime = Date.now()

    this.processInterval = setInterval(() => {
      this.checkAndProcess()
    }, 100)

    console.log('WhisperService started')
    this.emit('started')
  }

  stop(): void {
    this.isRunning = false

    if (this.processInterval) {
      clearInterval(this.processInterval)
      this.processInterval = null
    }

    // Process any remaining audio
    if (this.audioBuffer.length > 0) {
      this.processAudioBuffer()
    }

    this.resetBuffer()
    console.log('WhisperService stopped')
    this.emit('stopped')
  }

  addAudioData(audioData: Buffer | ArrayBuffer): void {
    if (!this.isRunning) return

    const buffer = audioData instanceof ArrayBuffer ? Buffer.from(audioData) : audioData

    // Check if this chunk has actual audio (not silence)
    if (this.hasAudio(buffer)) {
      if (this.audioBuffer.length === 0) this.bufferStartedAt = Date.now()
      this.audioBuffer.push(buffer)
      this.lastAudioTime = Date.now()
    }
  }

  // Check if audio buffer contains actual sound (not silence)
  private hasAudio(buffer: Buffer): boolean {
    // Calculate RMS (root mean square) to detect if there's actual audio
    let sum = 0
    const samples = buffer.length / this.BYTES_PER_SAMPLE

    for (let i = 0; i < buffer.length; i += 2) {
      const sample = buffer.readInt16LE(i)
      sum += sample * sample
    }

    const rms = Math.sqrt(sum / samples)
    // Threshold for considering it as actual audio vs silence
    // Lower than before so quieter laptop mics still register
    return rms > 250
  }

  private getBufferDurationMs(): number {
    const totalBytes = this.audioBuffer.reduce((sum, buf) => sum + buf.length, 0)
    const samples = totalBytes / this.BYTES_PER_SAMPLE
    return (samples / this.SAMPLE_RATE) * 1000
  }

  private checkAndProcess(): void {
    if (this.isProcessing || !this.isRunning) return

    const bufferDuration = this.getBufferDurationMs()
    const timeSinceLastAudio = Date.now() - this.lastAudioTime

    // Process if:
    // 1. We have enough audio AND enough silence has passed
    // 2. OR buffer is getting too large (force process)
    const hasEnoughAudio = bufferDuration >= this.MIN_AUDIO_DURATION_MS
    const hasSilence = timeSinceLastAudio >= this.silenceMs
    const bufferTooLarge = bufferDuration >= this.MAX_BUFFER_DURATION_MS

    if ((hasEnoughAudio && hasSilence) || bufferTooLarge) {
      console.log(
        `===> Processing: ${(bufferDuration / 1000).toFixed(2)}s audio, ${(timeSinceLastAudio / 1000).toFixed(2)}s since last audio`
      )
      this.processAudioBuffer()
    }
  }

  private async processAudioBuffer(): Promise<void> {
    if (this.audioBuffer.length === 0 || this.isProcessing) return

    this.isProcessing = true

    const combinedBuffer = Buffer.concat(this.audioBuffer)
    const startedAt = this.bufferStartedAt || Date.now()
    this.resetBuffer()

    // Skip if audio is too short
    const durationMs = (combinedBuffer.length / this.BYTES_PER_SAMPLE / this.SAMPLE_RATE) * 1000
    if (durationMs < this.MIN_AUDIO_DURATION_MS) {
      console.log(`===> Skipping: audio too short (${(durationMs / 1000).toFixed(2)}s)`)
      this.isProcessing = false
      return
    }

    try {
      // Create WAV file from raw PCM data
      const wavBuffer = this.createWavBuffer(combinedBuffer)
      const sttModel = this.getSttModel()
      const language = this.resolveWhisperLanguage()

      console.log(
        `===> Sending ${(durationMs / 1000).toFixed(2)}s of audio to Whisper (${language || 'auto'})...`
      )

      let text = ''

      if (this.config.provider === 'openrouter') {
        // OpenRouter STT expects JSON + base64, not OpenAI SDK multipart uploads
        text = await transcribeWithOpenRouter({
          apiKey: this.config.apiKey,
          baseUrl: this.config.baseUrl,
          wavBuffer,
          model: sttModel,
          language
        })
      } else {
        // OpenAI-compatible multipart transcription (OpenAI / custom providers)
        const tempFile = path.join(os.tmpdir(), `whisper_${Date.now()}.wav`)
        fs.writeFileSync(tempFile, wavBuffer)

        try {
          const payload: {
            file: fs.ReadStream
            model: string
            response_format: 'json'
            language?: string
          } = {
            file: fs.createReadStream(tempFile),
            model: sttModel,
            response_format: 'json'
          }
          if (language) payload.language = language

          const transcription = await this.client.audio.transcriptions.create(payload)
          text = transcription.text?.trim() || ''
        } finally {
          fs.unlinkSync(tempFile)
        }
      }

      if (text && text.length > 0) {
        // Filter out common noise transcriptions
        if (this.isNoise(text)) {
          console.log(`Filtered noise: "${text}"`)
        } else {
          console.log(`Transcription: "${text}"`)

          const event: TranscriptEvent = {
            text: text,
            isFinal: true,
            confidence: 1.0,
            startedAt
          }

          this.emit('transcript', event)
          this.emit('utteranceEnd')
        }
      }
    } catch (error) {
      console.error('Whisper transcription error:', error)
      this.emit('error', error instanceof Error ? error : new Error('Transcription failed'))
    } finally {
      this.isProcessing = false
    }
  }

  // Filter out common noise/hallucination from Whisper
  private isNoise(text: string): boolean {
    const noisePatterns = [
      /^you+\.?$/i,
      /^\.+$/,
      /^[,.\s]+$/,
      /^(um+|uh+|ah+|oh+|hmm+)\.?$/i,
      /^(bye|hi|hello|hey)\.?$/i,
      /^thank(s| you)\.?$/i,
      /^okay\.?$/i,
      /^(yes|no|yeah|yep|nope)\.?$/i,
      /^good\.?$/i,
      /^right\.?$/i,
      /^(subs|subtitles) by/i,
      /^www\./i,
      /^\[.*\]$/, // [Music], [Applause], etc.
      /^♪.*♪$/
    ]

    for (const pattern of noisePatterns) {
      if (pattern.test(text.trim())) {
        return true
      }
    }

    const wordCount = text.split(/\s+/).length
    if (wordCount < (this.config.minWords ?? 3)) {
      return true
    }

    return false
  }

  private createWavBuffer(pcmData: Buffer): Buffer {
    // WAV header for 16-bit mono PCM at 16kHz
    const numChannels = 1
    const sampleRate = this.SAMPLE_RATE
    const bitsPerSample = 16
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
    const blockAlign = numChannels * (bitsPerSample / 8)
    const dataSize = pcmData.length
    const headerSize = 44

    const header = Buffer.alloc(headerSize)

    // RIFF header
    header.write('RIFF', 0)
    header.writeUInt32LE(dataSize + headerSize - 8, 4)
    header.write('WAVE', 8)

    // fmt chunk
    header.write('fmt ', 12)
    header.writeUInt32LE(16, 16) // Subchunk1Size for PCM
    header.writeUInt16LE(1, 20) // AudioFormat (1 = PCM)
    header.writeUInt16LE(numChannels, 22)
    header.writeUInt32LE(sampleRate, 24)
    header.writeUInt32LE(byteRate, 28)
    header.writeUInt16LE(blockAlign, 32)
    header.writeUInt16LE(bitsPerSample, 34)

    // data chunk
    header.write('data', 36)
    header.writeUInt32LE(dataSize, 40)

    return Buffer.concat([header, pcmData])
  }

  getIsRunning(): boolean {
    return this.isRunning
  }
}
