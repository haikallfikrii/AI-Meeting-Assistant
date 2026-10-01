import type { AudioChannel } from '../../../preload/index'

export interface AudioCaptureOptions {
  sampleRate?: number
  channelCount?: number
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
}

const DEFAULT_OPTIONS: AudioCaptureOptions = {
  sampleRate: 16000,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
}

export type CaptureMode = 'microphone' | 'system' | 'both'

interface Lane {
  stream: MediaStream
  source: MediaStreamAudioSourceNode
  worklet: AudioWorkletNode
}

/**
 * Each audio source is transcribed on its own lane so the main process knows
 * who is speaking: `them` = meeting/system audio, `me` = the user's mic,
 * `mixed` = Mic-only capture where speakers cannot be separated.
 */
export class AudioCaptureService {
  private audioContext: AudioContext | null = null
  private lanes: Partial<Record<AudioChannel, Lane>> = {}
  private isCapturing = false
  private mode: CaptureMode | null = null
  private options: AudioCaptureOptions
  private workletUrl: string | null = null

  constructor(options: AudioCaptureOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  async startMicrophoneCapture(): Promise<void> {
    await this.startCapture('microphone')
  }

  async startSystemAudioCapture(sourceId: string): Promise<void> {
    await this.startCapture('system', sourceId)
  }

  async startMixedCapture(systemSourceId: string): Promise<void> {
    await this.startCapture('both', systemSourceId)
  }

  getMode(): CaptureMode | null {
    return this.mode
  }

  hasMicLane(): boolean {
    return Boolean(this.lanes.me || this.lanes.mixed)
  }

  /** System-only capture: open the mic on demand (Mic Ask). */
  async openMicLane(): Promise<void> {
    if (!this.isCapturing || this.lanes.me || this.lanes.mixed) return
    await this.addLane('me', await this.openMicrophoneStream())
  }

  /** Close an on-demand mic lane; Both / Mic captures keep their mic open. */
  closeMicLane(): void {
    if (this.mode !== 'system') return
    this.removeLane('me')
  }

  private async startCapture(mode: CaptureMode, systemSourceId?: string): Promise<void> {
    if (this.isCapturing) return

    const pending: Array<[AudioChannel, MediaStream]> = []
    try {
      if (mode === 'system' || mode === 'both') {
        if (!systemSourceId) {
          throw new Error('System audio source id is required')
        }
        pending.push(['them', await this.openSystemStream(systemSourceId)])
      }
      if (mode === 'microphone') {
        pending.push(['mixed', await this.openMicrophoneStream()])
      }
      if (mode === 'both') {
        pending.push(['me', await this.openMicrophoneStream()])
      }

      this.audioContext = new AudioContext({
        sampleRate: this.options.sampleRate
      })

      // Resume if browser/Electron started the context suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      this.workletUrl = this.createWorkletBlobUrl()
      await this.audioContext.audioWorklet.addModule(this.workletUrl)

      this.isCapturing = true
      this.mode = mode
      for (const [channel, stream] of pending) {
        await this.addLane(channel, stream)
      }
    } catch (error) {
      pending.forEach(([, stream]) => stream.getTracks().forEach((track) => track.stop()))
      await this.stop()
      console.error('Failed to start audio capture:', error)
      throw error
    }
  }

  private async addLane(channel: AudioChannel, stream: MediaStream): Promise<void> {
    if (!this.audioContext) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    const worklet = new AudioWorkletNode(this.audioContext, 'audio-processor')
    worklet.port.onmessage = (event) => {
      if (event.data.audioData && window.api) {
        window.api.sendAudioData(event.data.audioData, channel)
      }
    }
    const source = this.audioContext.createMediaStreamSource(stream)
    source.connect(worklet)
    this.lanes[channel] = { stream, source, worklet }
  }

  private removeLane(channel: AudioChannel): void {
    const lane = this.lanes[channel]
    if (!lane) return
    lane.source.disconnect()
    lane.worklet.port.onmessage = null
    lane.worklet.disconnect()
    lane.stream.getTracks().forEach((track) => track.stop())
    delete this.lanes[channel]
  }

  private async openMicrophoneStream(): Promise<MediaStream> {
    // Avoid forcing sampleRate in getUserMedia — many devices reject it.
    // AudioContext will resample to 16 kHz for Whisper.
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: this.options.channelCount,
          echoCancellation: this.options.echoCancellation,
          noiseSuppression: this.options.noiseSuppression,
          autoGainControl: this.options.autoGainControl
        },
        video: false
      })
    } catch (firstError) {
      console.warn('Mic constraints failed, retrying with basic audio:', firstError)
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Microphone permission denied or unavailable'
        throw new Error(
          `Microphone not available. Allow mic access for Kalfi in System Settings → Privacy → Microphone. (${message})`
        )
      }
    }
  }

  private async openSystemStream(sourceId: string): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // @ts-expect-error Electron desktop capture constraint
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId
        }
      },
      video: {
        // @ts-expect-error Electron desktop capture constraint
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId
        }
      }
    })

    // Video track only needed to open the desktop stream
    stream.getVideoTracks().forEach((track) => track.stop())
    return stream
  }

  private createWorkletBlobUrl(): string {
    const workletCode = `
      class AudioProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.bufferSize = 4096;
          this.buffer = new Float32Array(this.bufferSize);
          this.bufferIndex = 0;
        }

        process(inputs) {
          const input = inputs[0];
          if (input && input[0]) {
            const inputData = input[0];

            for (let i = 0; i < inputData.length; i++) {
              this.buffer[this.bufferIndex++] = inputData[i];

              if (this.bufferIndex >= this.bufferSize) {
                const int16Buffer = new Int16Array(this.bufferSize);
                for (let j = 0; j < this.bufferSize; j++) {
                  const s = Math.max(-1, Math.min(1, this.buffer[j]));
                  int16Buffer[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                this.port.postMessage({
                  audioData: int16Buffer.buffer
                }, [int16Buffer.buffer]);

                this.buffer = new Float32Array(this.bufferSize);
                this.bufferIndex = 0;
              }
            }
          }
          return true;
        }
      }

      registerProcessor('audio-processor', AudioProcessor);
    `

    const blob = new Blob([workletCode], { type: 'application/javascript' })
    return URL.createObjectURL(blob)
  }

  async stop(): Promise<void> {
    ;(Object.keys(this.lanes) as AudioChannel[]).forEach((channel) => this.removeLane(channel))
    this.lanes = {}

    if (this.audioContext) {
      try {
        await this.audioContext.close()
      } catch {
        // ignore
      }
      this.audioContext = null
    }

    if (this.workletUrl) {
      URL.revokeObjectURL(this.workletUrl)
      this.workletUrl = null
    }

    this.isCapturing = false
    this.mode = null
  }

  getIsCapturing(): boolean {
    return this.isCapturing
  }
}
