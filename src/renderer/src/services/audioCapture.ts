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

export class AudioCaptureService {
  private audioContext: AudioContext | null = null
  private mediaStreams: MediaStream[] = []
  private workletNode: AudioWorkletNode | null = null
  private sourceNodes: MediaStreamAudioSourceNode[] = []
  private mixerNode: GainNode | null = null
  private isCapturing = false
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

  private async startCapture(mode: CaptureMode, systemSourceId?: string): Promise<void> {
    if (this.isCapturing) return

    try {
      const streams: MediaStream[] = []

      if (mode === 'microphone' || mode === 'both') {
        streams.push(await this.openMicrophoneStream())
      }

      if (mode === 'system' || mode === 'both') {
        if (!systemSourceId) {
          throw new Error('System audio source id is required')
        }
        streams.push(await this.openSystemStream(systemSourceId))
      }

      this.mediaStreams = streams

      this.audioContext = new AudioContext({
        sampleRate: this.options.sampleRate
      })

      // Resume if browser/Electron started the context suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      this.workletUrl = this.createWorkletBlobUrl()
      await this.audioContext.audioWorklet.addModule(this.workletUrl)

      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor')
      this.workletNode.port.onmessage = (event) => {
        if (event.data.audioData) {
          this.handleAudioData(event.data.audioData)
        }
      }

      // Mix all sources into one node before the worklet
      this.mixerNode = this.audioContext.createGain()
      this.mixerNode.gain.value = 1

      this.sourceNodes = streams.map((stream) => {
        const source = this.audioContext!.createMediaStreamSource(stream)
        source.connect(this.mixerNode!)
        return source
      })

      this.mixerNode.connect(this.workletNode)
      this.isCapturing = true
    } catch (error) {
      await this.stop()
      console.error('Failed to start audio capture:', error)
      throw error
    }
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

  private handleAudioData(audioData: ArrayBuffer): void {
    if (window.api) {
      window.api.sendAudioData(audioData)
    }
  }

  async stop(): Promise<void> {
    if (this.workletNode) {
      this.workletNode.disconnect()
      this.workletNode = null
    }

    if (this.mixerNode) {
      this.mixerNode.disconnect()
      this.mixerNode = null
    }

    this.sourceNodes.forEach((node) => node.disconnect())
    this.sourceNodes = []

    this.mediaStreams.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop())
    })
    this.mediaStreams = []

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
  }

  getIsCapturing(): boolean {
    return this.isCapturing
  }
}
