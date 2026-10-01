import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioCaptureService, CaptureMode } from '../services/audioCapture'

export type AudioSource = 'microphone' | 'system' | 'both'

interface UseAudioCaptureReturn {
  isCapturing: boolean
  error: string | null
  audioSource: AudioSource
  /** Mode actually running (differs from audioSource after a mic fallback). */
  captureMode: CaptureMode | null
  startCapture: (source?: AudioSource, sourceId?: string) => Promise<void>
  stopCapture: () => Promise<void>
  setAudioSource: (source: AudioSource) => void
  openMicLane: () => Promise<void>
  closeMicLane: () => void
}

export function useAudioCapture(): UseAudioCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Default Both; demo-record / denied screen switches to Mic
  const [audioSource, setAudioSource] = useState<AudioSource>('both')
  const [captureMode, setCaptureMode] = useState<CaptureMode | null>(null)
  const audioServiceRef = useRef<AudioCaptureService | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const demo = await window.api.getDemoRecordMode?.()
        const screen = await window.api.getScreenRecordingStatus?.()
        if (cancelled) return
        if (demo || screen?.status === 'denied' || screen?.status === 'restricted') {
          setAudioSource('microphone')
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const resolveSystemSourceId = async (sourceId?: string): Promise<string> => {
    const sources = await window.api.getAudioSources()

    if (sources.length === 0) {
      throw new Error(
        'No screen/audio sources. Enable Screen Recording for "Electron" in System Settings, then reopen.'
      )
    }

    if (sourceId) return sourceId

    const screenSource = sources.find(
      (s) =>
        s.name.toLowerCase().includes('entire screen') ||
        s.name.toLowerCase().includes('screen 1') ||
        s.name.toLowerCase() === 'screen'
    )

    return screenSource?.id || sources[0].id
  }

  const startCapture = useCallback(
    async (source: AudioSource = audioSource, sourceId?: string) => {
      try {
        setError(null)

        await window.api.startCapture(source)

        const service = new AudioCaptureService({
          sampleRate: 16000,
          channelCount: 1
        })
        audioServiceRef.current = service

        if (source === 'microphone') {
          console.log('Starting microphone capture')
          await service.startMicrophoneCapture()
        } else {
          try {
            const targetSourceId = await resolveSystemSourceId(sourceId)
            console.log(`Starting ${source} capture with source:`, targetSourceId)
            if (source === 'system') {
              await service.startSystemAudioCapture(targetSourceId)
            } else {
              await service.startMixedCapture(targetSourceId)
            }
          } catch (screenErr) {
            console.warn('System audio unavailable, falling back to microphone:', screenErr)
            await service.startMicrophoneCapture()
          }
        }

        setCaptureMode(service.getMode())
        setIsCapturing(true)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start capture'
        setError(message)
        console.error('Audio capture error:', err)

        if (audioServiceRef.current) {
          await audioServiceRef.current.stop()
          audioServiceRef.current = null
        }
        setCaptureMode(null)

        try {
          await window.api.stopCapture()
        } catch {
          // Ignore stop errors
        }
      }
    },
    [audioSource]
  )

  const stopCapture = useCallback(async () => {
    try {
      if (audioServiceRef.current) {
        await audioServiceRef.current.stop()
        audioServiceRef.current = null
      }

      await window.api.stopCapture()

      setIsCapturing(false)
      setCaptureMode(null)
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop capture'
      setError(message)
      console.error('Stop capture error:', err)
    }
  }, [])

  const openMicLane = useCallback(async () => {
    await audioServiceRef.current?.openMicLane()
  }, [])

  const closeMicLane = useCallback(() => {
    audioServiceRef.current?.closeMicLane()
  }, [])

  return {
    isCapturing,
    error,
    audioSource,
    captureMode,
    startCapture,
    stopCapture,
    setAudioSource,
    openMicLane,
    closeMicLane
  }
}
