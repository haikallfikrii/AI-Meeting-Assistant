import { MessageSquare, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useInterview } from '../hooks/useInterview'
import { useInterviewStore } from '../store/interviewStore'
import { Tooltip } from './Tooltip'

const MIN_H = 120
const MAX_H = 420
const DEFAULT_H = 192

function loadHeight(): number {
  try {
    const raw = localStorage.getItem('kalfi.transcriptPanelHeight')
    const n = raw ? Number(raw) : DEFAULT_H
    if (Number.isFinite(n)) return Math.min(MAX_H, Math.max(MIN_H, n))
  } catch {
    /* ignore */
  }
  return DEFAULT_H
}

export function TranscriptPanel(): React.JSX.Element {
  const { transcripts, currentTranscript, isCapturing, isSpeaking, isGenerating } = useInterview()
  const { forceNextAsk, setError, setCurrentQuestion } = useInterviewStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [askingId, setAskingId] = useState<string | null>(null)
  const [height, setHeight] = useState(loadHeight)
  const heightRef = useRef(height)
  const draggingRef = useRef(false)
  heightRef.current = height

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [transcripts, currentTranscript])

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!draggingRef.current) return
      const fromBottom = window.innerHeight - e.clientY
      // Panel sits above window chrome; clamp to usable range
      const next = Math.min(MAX_H, Math.max(MIN_H, fromBottom - 8))
      heightRef.current = next
      setHeight(next)
    }
    const onUp = (): void => {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try {
        localStorage.setItem('kalfi.transcriptPanelHeight', String(heightRef.current))
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const startResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    draggingRef.current = true
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }

  const hasContent = transcripts.length > 0 || currentTranscript

  const askText = async (id: string, text: string): Promise<void> => {
    const trimmed = text.trim()
    if (!trimmed || isGenerating) return
    try {
      setAskingId(id)
      setError(null)
      setCurrentQuestion(trimmed)
      const result = await window.api.askQuestion(trimmed)
      if (!result.success) {
        setError(result.error || 'Failed to ask question')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ask question')
    } finally {
      setAskingId(null)
    }
  }

  return (
    <div className="flex flex-col bg-dark-900/50 border-t border-dark-700 shrink-0" style={{ height }}>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize live transcript"
        onMouseDown={startResize}
        className="h-1.5 shrink-0 cursor-row-resize bg-dark-900 hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors"
        title="Drag to resize transcript"
      />

      <div className="flex items-center justify-between px-4 py-2 border-b border-dark-700/50 shrink-0">
        <div className="flex items-center gap-2 min-w-0 overflow-x-auto">
          <MessageSquare className="w-4 h-4 text-dark-400 shrink-0" />
          <span className="text-xs font-semibold text-dark-300 uppercase tracking-wide whitespace-nowrap">
            Live Transcript
          </span>
          {transcripts.length > 0 && (
            <span className="text-xs text-dark-500 whitespace-nowrap">({transcripts.length})</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {forceNextAsk && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap">
              Next speech → Answer
            </span>
          )}
          {isSpeaking && (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              <span className="text-xs text-green-400">Speaking</span>
            </div>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-auto px-4 py-3 scroll-smooth custom-scrollbar space-y-2"
      >
        {!isCapturing && !hasContent ? (
          <p className="text-sm text-dark-500 italic">
            Start listening to see real-time transcription...
          </p>
        ) : hasContent ? (
          <>
            {transcripts.map((transcript, index) => (
              <div
                key={transcript.id}
                className="group flex gap-2 text-sm border-l-2 border-dark-600 pl-3 py-0.5 min-w-0"
              >
                <span className="text-dark-500 font-mono text-xs min-w-[20px] shrink-0">
                  {index + 1}.
                </span>
                <p className="text-dark-200 leading-relaxed flex-1 break-words">{transcript.text}</p>
                <Tooltip content="Send this transcript to AI for an answer" side="left">
                  <button
                    onClick={() => askText(transcript.id, transcript.text)}
                    disabled={isGenerating || askingId === transcript.id}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-blue-500/20 text-dark-400 hover:text-blue-300 transition-opacity disabled:opacity-40 shrink-0"
                  >
                    <Send size={12} />
                  </button>
                </Tooltip>
              </div>
            ))}

            {currentTranscript && (
              <div className="flex gap-2 text-sm border-l-2 border-blue-500/50 pl-3 py-1 bg-blue-500/5 rounded-r min-w-0">
                <span className="text-blue-400 font-mono text-xs min-w-[20px] shrink-0">
                  {transcripts.length + 1}.
                </span>
                <p className="text-dark-300 leading-relaxed flex-1 break-words">
                  {currentTranscript}
                  <span className="inline-block w-0.5 h-4 bg-blue-400 ml-1 animate-pulse align-middle" />
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-dark-500 italic">Waiting for speech...</p>
        )}
      </div>
    </div>
  )
}
