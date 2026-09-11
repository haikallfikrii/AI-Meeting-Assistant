import {
  Check,
  Clock,
  Copy,
  MessageSquarePlus,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { WorkSession, useInterviewStore } from '../store/interviewStore'
import { MarkdownRenderer } from './MarkdownRenderer'

const MODE_BADGE: Record<WorkSession['mode'], string> = {
  interview: 'Interview',
  'client-meeting': 'Client',
  'random-chat': 'Chat'
}

const TOD_BADGE: Record<WorkSession['timeOfDay'], string> = {
  morning: 'Pagi',
  afternoon: 'Siang',
  evening: 'Sore',
  night: 'Malam'
}

interface SessionsPanelProps {
  onClose: () => void
}

interface ThreadGroup {
  threadId: string
  threadTitle: string
  mode: WorkSession['mode']
  meetings: WorkSession[]
}

export function SessionsPanel({ onClose }: SessionsPanelProps): React.JSX.Element {
  const { activeSession, setActiveSession, setShowSessionEditor, clearAll, setError } =
    useInterviewStore()
  const [sessions, setSessions] = useState<WorkSession[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [summarizing, setSummarizing] = useState(false)

  const refresh = useCallback(async () => {
    const list = await window.api.listSessions()
    setSessions(list)
    const active = await window.api.getActiveSession()
    setActiveSession(active)
  }, [setActiveSession])

  useEffect(() => {
    refresh()
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [refresh])

  const threads = useMemo(() => {
    const map = new Map<string, ThreadGroup>()
    for (const s of sessions) {
      const existing = map.get(s.threadId)
      if (existing) {
        existing.meetings.push(s)
      } else {
        map.set(s.threadId, {
          threadId: s.threadId,
          threadTitle: s.threadTitle || s.title,
          mode: s.mode,
          meetings: [s]
        })
      }
    }
    return Array.from(map.values())
      .map((t) => ({
        ...t,
        meetings: [...t.meetings].sort((a, b) => b.createdAt - a.createdAt)
      }))
      .sort((a, b) => (b.meetings[0]?.updatedAt || 0) - (a.meetings[0]?.updatedAt || 0))
  }, [sessions])

  const selectSession = async (id: string): Promise<void> => {
    const session = await window.api.setActiveSession(id)
    if (session) {
      setActiveSession(session)
      clearAll()
      onClose()
    }
  }

  const newMeetingInThread = async (fromId: string): Promise<void> => {
    const session = await window.api.continueThread(fromId)
    if (session) {
      setActiveSession(session)
      clearAll()
      await refresh()
      onClose()
    }
  }

  const deleteSession = async (id: string): Promise<void> => {
    if (!confirm('Delete this meeting session and its conversation?')) return
    const result = await window.api.deleteSession(id)
    if (result?.success) {
      setActiveSession(result.active)
      await refresh()
    } else {
      alert('Keep at least one session.')
    }
  }

  const clearConversation = async (id: string): Promise<void> => {
    if (!confirm('Clear Q&A memory for this meeting? Context fields stay.')) return
    const updated = await window.api.clearSessionConversation(id)
    if (updated) {
      setActiveSession(updated)
      await refresh()
      clearAll()
    }
  }

  const summarize = async (id: string): Promise<void> => {
    try {
      setSummarizing(true)
      const result = await window.api.summarizeSession(id)
      if (!result.success) {
        setError(result.error || 'Summarize failed')
        return
      }
      if (result.session) setActiveSession(result.session)
      await refresh()
    } finally {
      setSummarizing(false)
    }
  }

  const copy = async (text: string, id: string): Promise<void> => {
    await window.api.writeToClipboard(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const viewing = activeSession
    ? sessions.find((s) => s.id === activeSession.id) || activeSession
    : null

  return (
    <div className="flex flex-col h-full min-h-0 bg-dark-950">
      <div className="flex items-center justify-between px-4 py-2 border-b border-dark-800">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-dark-100">Sessions</h2>
          <span className="text-xs text-dark-500">
            ({threads.length} threads · {sessions.length} meetings)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSessionEditor(true, 'create')}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white"
          >
            <Plus size={12} />
            New thread
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-dark-800 text-dark-400"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[168px_1fr]">
        <div className="border-r border-dark-800 overflow-y-auto custom-scrollbar p-2 space-y-3">
          {loading ? (
            <p className="text-xs text-dark-500 p-2">Loading…</p>
          ) : (
            threads.map((thread) => (
              <div key={thread.threadId} className="space-y-1">
                <div className="px-1.5 flex items-center justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-dark-500">
                      {MODE_BADGE[thread.mode]}
                    </p>
                    <p className="text-[11px] font-medium text-dark-200 truncate">
                      {thread.threadTitle}
                    </p>
                  </div>
                  <button
                    onClick={() => newMeetingInThread(thread.meetings[0].id)}
                    className="p-1 rounded hover:bg-dark-800 text-blue-400 shrink-0"
                    title="Start today's new meeting in this thread"
                  >
                    <Plus size={12} />
                  </button>
                </div>
                {thread.meetings.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => selectSession(s.id)}
                    className={`w-full text-left rounded-lg px-2 py-1.5 transition-colors ${
                      viewing?.id === s.id
                        ? 'bg-dark-800 border border-blue-500/40'
                        : 'hover:bg-dark-900 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-[9px] px-1 rounded bg-dark-700 text-dark-300">
                        {TOD_BADGE[s.timeOfDay]}
                      </span>
                      <span className="text-[9px] text-dark-500 truncate">{s.meetingLabel}</span>
                    </div>
                    <p className="text-[10px] text-dark-400">{s.answers.length} replies</p>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="flex flex-col min-h-0 overflow-hidden">
          {viewing ? (
            <>
              <div className="px-3 py-2 border-b border-dark-800 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-dark-100 truncate">{viewing.threadTitle}</p>
                  <p className="text-[10px] text-dark-500 flex items-center gap-1 mt-0.5">
                    <Clock size={10} />
                    {viewing.meetingLabel}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => newMeetingInThread(viewing.id)}
                    className="p-1.5 rounded hover:bg-dark-800 text-blue-400"
                    title="New meeting today (same project/thread)"
                  >
                    <Plus size={13} />
                  </button>
                  <button
                    onClick={() => summarize(viewing.id)}
                    disabled={summarizing}
                    className="p-1.5 rounded hover:bg-dark-800 text-amber-300"
                    title="Summarize this meeting"
                  >
                    <Sparkles size={13} />
                  </button>
                  <button
                    onClick={() => setShowSessionEditor(true, 'edit')}
                    className="p-1.5 rounded hover:bg-dark-800 text-dark-400"
                    title="Edit context"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => clearConversation(viewing.id)}
                    className="p-1.5 rounded hover:bg-dark-800 text-dark-400"
                    title="Clear conversation memory"
                  >
                    <MessageSquarePlus size={13} />
                  </button>
                  <button
                    onClick={() => deleteSession(viewing.id)}
                    className="p-1.5 rounded hover:bg-red-500/20 text-dark-400 hover:text-red-400"
                    title="Delete meeting"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
                {viewing.summary ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-amber-300">Summary</p>
                    <div className="text-sm text-dark-200">
                      <MarkdownRenderer content={viewing.summary} />
                    </div>
                  </div>
                ) : null}

                {viewing.answers.length === 0 ? (
                  <p className="text-sm text-dark-500 text-center py-8">
                    No replies yet in this meeting. Start listening or use Ask / Mic Ask.
                  </p>
                ) : (
                  viewing.answers.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-dark-800 bg-dark-900/60 p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium text-blue-300">{entry.question}</p>
                        <button
                          onClick={() => copy(entry.answer, entry.id)}
                          className="p-1 text-dark-500 hover:text-dark-200"
                        >
                          {copiedId === entry.id ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      </div>
                      <div className="text-sm text-dark-200 prose-invert">
                        <MarkdownRenderer content={entry.answer} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-dark-500 text-center py-10">Select a meeting</p>
          )}
        </div>
      </div>
    </div>
  )
}
