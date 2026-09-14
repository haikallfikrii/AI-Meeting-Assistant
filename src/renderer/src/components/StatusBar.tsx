import {
  AlertCircle,
  Camera,
  Headphones,
  Loader2,
  Mic,
  Play,
  Send,
  Sparkles,
  Square,
  Trash2,
  Volume2
} from 'lucide-react'
import { AudioSource } from '../hooks/useAudioCapture'
import { useInterview } from '../hooks/useInterview'
import { useInterviewStore } from '../store/interviewStore'
import { Tooltip } from './Tooltip'

const SOURCE_OPTIONS: { id: AudioSource; label: string; title: string }[] = [
  { id: 'both', label: 'Both', title: 'System audio (Meet) + your microphone' },
  { id: 'system', label: 'System', title: 'Only system / meeting audio' },
  { id: 'microphone', label: 'Mic', title: 'Only your microphone' }
]

export function StatusBar(): React.JSX.Element {
  const {
    isCapturing,
    isSpeaking,
    isGenerating,
    isProcessingScreenshot,
    error,
    startInterview,
    stopInterview,
    captureAndAnalyzeScreenshot,
    answers,
    currentAnswer,
    clearHistory,
    transcripts,
    currentTranscript,
    audioSource,
    setAudioSource
  } = useInterview()

  const {
    forceNextAsk,
    setForceNextAsk,
    isSummarizing,
    setSummarizing,
    setError,
    setCurrentQuestion,
    activeSession,
    setActiveSession
  } = useInterviewStore()

  const sourceLabel =
    audioSource === 'both'
      ? 'System + Mic'
      : audioSource === 'microphone'
        ? 'Microphone'
        : 'System Audio'

  const getStatusText = (): string => {
    if (error) return 'Error'
    if (isSummarizing) return 'Summarizing meeting...'
    if (isProcessingScreenshot) return 'Analyzing screenshot...'
    if (isGenerating) return 'Generating answer...'
    if (forceNextAsk) return 'Mic armed — speak, then AI will answer'
    if (isSpeaking) return 'Listening...'
    if (isCapturing) return `Listening (${sourceLabel})`
    return ''
  }

  const getStatusColor = (): string => {
    if (error) return 'text-red-400'
    if (isSummarizing) return 'text-amber-400'
    if (isProcessingScreenshot) return 'text-orange-400'
    if (isGenerating) return 'text-purple-400'
    if (forceNextAsk) return 'text-amber-300'
    if (isSpeaking) return 'text-green-400'
    if (isCapturing) return 'text-blue-400'
    return 'text-dark-400'
  }

  const handleStart = (): void => {
    startInterview(audioSource)
  }

  const hasContent = answers.length > 0 || currentAnswer

  const askLatest = async (): Promise<void> => {
    const text = (currentTranscript || transcripts[transcripts.length - 1]?.text || '').trim()
    if (!text) {
      setError('No transcript yet to send. Wait for speech, or arm Mic Ask and speak.')
      return
    }
    try {
      setError(null)
      setCurrentQuestion(text)
      const result = await window.api.askQuestion(text)
      if (!result.success) setError(result.error || 'Failed to ask')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ask')
    }
  }

  const toggleMicAsk = async (): Promise<void> => {
    if (!isCapturing) {
      setError('Start listening first (prefer Both / Mic), then arm Mic Ask and speak.')
      return
    }
    if (audioSource === 'system') {
      setError('Mic Ask needs your mic. Switch source to Both or Mic, Stop, then Start again.')
      return
    }
    const next = !forceNextAsk
    await window.api.setForceNextQuestion(next)
    setForceNextAsk(next)
    setError(null)
  }

  const summarize = async (): Promise<void> => {
    try {
      setSummarizing(true)
      setError(null)
      const result = await window.api.summarizeSession(activeSession?.id)
      if (!result.success) {
        setError(result.error || 'Summarize failed')
        return
      }
      if (result.session) setActiveSession(result.session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Summarize failed')
    } finally {
      setSummarizing(false)
    }
  }

  return (
    <div className="px-3 py-0.5 bg-dark-850 border-b border-dark-700">
      <div className="flex items-center justify-between gap-3 min-h-[32px]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isCapturing && (
            <div className="relative flex-shrink-0 animate-pulse">
              <Volume2 className={`w-4 h-4 ${isSpeaking ? 'text-green-400' : 'text-blue-400'}`} />
              {isSpeaking && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-400 rounded-full animate-ping" />
              )}
            </div>
          )}
          {getStatusText() !== '' && (
            <div className="flex flex-col min-w-0">
              <span className={`text-xs font-medium ${getStatusColor()} truncate`}>
                {getStatusText()}
              </span>
              {error && <span className="text-xs text-red-400/80 truncate">{error}</span>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!isCapturing ? (
            <div className="flex items-center rounded-md border border-dark-700 bg-dark-800 p-0.5">
              {SOURCE_OPTIONS.map((opt) => (
                <Tooltip key={opt.id} content={opt.title} side="bottom">
                  <button
                    type="button"
                    onClick={() => setAudioSource(opt.id)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-0.5 ${
                      audioSource === opt.id
                        ? 'bg-dark-700 text-dark-100'
                        : 'text-dark-500 hover:text-dark-300'
                    }`}
                  >
                    {opt.id === 'microphone' ? (
                      <Mic className="w-3 h-3" />
                    ) : opt.id === 'system' ? (
                      <Headphones className="w-3 h-3" />
                    ) : (
                      <Volume2 className="w-3 h-3" />
                    )}
                    <span>{opt.label}</span>
                  </button>
                </Tooltip>
              ))}
            </div>
          ) : null}

          <Tooltip
            content="Arm mic: your next spoken line will be answered (needs Both or Mic source)"
            side="bottom"
          >
            <button
              onClick={toggleMicAsk}
              disabled={!isCapturing || isGenerating}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 disabled:opacity-50
                ${
                  forceNextAsk
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-dark-800 text-dark-300 hover:bg-dark-700 border border-dark-700'
                }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Mic Ask</span>
            </button>
          </Tooltip>

          <Tooltip content="Force-answer the latest transcript line" side="bottom">
            <button
              onClick={askLatest}
              disabled={isGenerating || (!transcripts.length && !currentTranscript)}
              className="px-2 py-1 rounded-md text-xs font-medium bg-dark-800 text-dark-300 hover:bg-dark-700 border border-dark-700 flex items-center gap-1 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Ask</span>
            </button>
          </Tooltip>

          <Tooltip content="Summarize this meeting session" side="bottom">
            <button
              onClick={summarize}
              disabled={isSummarizing || isGenerating}
              className="px-2 py-1 rounded-md text-xs font-medium bg-dark-800 text-dark-300 hover:bg-dark-700 border border-dark-700 flex items-center gap-1 disabled:opacity-50"
            >
              {isSummarizing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>Summary</span>
            </button>
          </Tooltip>

          <Tooltip content="Capture screenshot and analyze for interview questions" side="bottom">
            <button
              onClick={captureAndAnalyzeScreenshot}
              disabled={isProcessingScreenshot || isGenerating}
              className={`
                px-2.5 py-1 rounded-md text-xs font-medium transition-all
                flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed
                ${
                  isProcessingScreenshot
                    ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                    : 'bg-dark-800 text-dark-300 hover:bg-dark-700 hover:text-dark-100 border border-dark-700'
                }
              `}
            >
              {isProcessingScreenshot ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Analyzing</span>
                </>
              ) : (
                <>
                  <Camera className="w-3.5 h-3.5" />
                  <span>Shot</span>
                </>
              )}
            </button>
          </Tooltip>

          <button
            onClick={isCapturing ? stopInterview : handleStart}
            disabled={isGenerating || isProcessingScreenshot}
            className={`
              px-2.5 py-1 rounded-md text-xs font-medium transition-all
              flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed
              ${
                isCapturing
                  ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30'
                  : 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-500/40 shadow-sm'
              }
            `}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Processing</span>
              </>
            ) : isCapturing ? (
              <>
                <Square className="w-3.5 h-3.5" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Start</span>
              </>
            )}
          </button>

          {hasContent && (
            <Tooltip content="Clear live answers" side="bottom">
              <button
                onClick={clearHistory}
                className="flex items-center gap-1 px-2 py-1 text-xs text-dark-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 px-2.5 py-1.5 rounded-md border border-red-500/20">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
