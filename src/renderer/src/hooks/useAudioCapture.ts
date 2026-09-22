import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioCaptureService } from '../services/audioCapture'

export type AudioSource = 'microphone' | 'system' | 'both'

interface UseAudioCaptureReturn {
  isCapturing: boolean
  error: string | null
  audioSource: AudioSource
  startCapture: (source?: AudioSource, sourceId?: string) => Promise<void>
  stopCapture: () => Promise<void>
  setAudioSource: (source: AudioSource) => void
}

export function useAudioCapture(): UseAudioCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Default Both; demo-record / denied screen switches to Mic
  const [audioSource, setAudioSource] = useState<AudioSource>('both')
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

        audioServiceRef.current = new AudioCaptureService({
          sampleRate: 16000,
          channelCount: 1
        })

        if (source === 'microphone') {
          console.log('Starting microphone capture')
          await audioServiceRef.current.startMicrophoneCapture()
        } else if (source === 'system') {
          try {
            const targetSourceId = await resolveSystemSourceId(sourceId)
            console.log('Starting system audio capture with source:', targetSourceId)
            await audioServiceRef.current.startSystemAudioCapture(targetSourceId)
          } catch (screenErr) {
            console.warn('System audio unavailable, falling back to microphone:', screenErr)
            await audioServiceRef.current.startMicrophoneCapture()
          }
        } else {
          try {
            const targetSourceId = await resolveSystemSourceId(sourceId)
            console.log('Starting mixed mic + system capture:', targetSourceId)
            await audioServiceRef.current.startMixedCapture(targetSourceId)
          } catch (screenErr) {
            console.warn('System audio unavailable, falling back to microphone:', screenErr)
            await audioServiceRef.current.startMicrophoneCapture()
          }
        }

        setIsCapturing(true)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start capture'
        setError(message)
        console.error('Audio capture error:', err)

        if (audioServiceRef.current) {
          await audioServiceRef.current.stop()
          audioServiceRef.current = null
        }

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
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop capture'
      setError(message)
      console.error('Stop capture error:', err)
    }
  }, [])

  return {
    isCapturing,
    error,
    audioSource,
    startCapture,
    stopCapture,
    setAudioSource
  }
}
