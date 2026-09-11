import { Check, Clock, Copy, MessageSquarePlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { WorkSession, useInterviewStore } from '../store/interviewStore'
import { MarkdownRenderer } from './MarkdownRenderer'

const MODE_BADGE: Record<WorkSession['mode'], string> = {
  interview: 'Interview',
  'client-meeting': 'Client',
  'random-chat': 'Chat'
}

interface SessionsPanelProps {
  onClose: () => void
}

export function SessionsPanel({ onClose }: SessionsPanelProps): React.JSX.Element {
  const { activeSession, setActiveSession, setShowSessionEditor, clearAll } = useInterviewStore()
  const [sessions, setSessions] = useState<WorkSession[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)

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

  const selectSession = async (id: string): Promise<void> => {
    const session = await window.api.setActiveSession(id)
    if (session) {
      setActiveSession(session)
      clearAll()
      onClose()
    }
  }

  const deleteSession = async (id: string): Promise<void> => {
    if (!confirm('Delete this session and its conversation memory?')) return
    const result = await window.api.deleteSession(id)
    if (result?.success) {
      setActiveSession(result.active)
      await refresh()
    } else {
      alert('Keep at least one session.')
    }
  }

  const clearConversation = async (id: string): Promise<void> => {
    if (!confirm('Clear Q&A memory for this session? Context fields stay.')) return
    const updated = await window.api.clearSessionConversation(id)
    if (updated) {
      setActiveSession(updated)
      await refresh()
      clearAll()
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
          <span className="text-xs text-dark-500">({sessions.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSessionEditor(true, 'create')}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white"
          >
            <Plus size={12} />
            New
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

      <div className="flex-1 min-h-0 grid grid-cols-[140px_1fr]">
        <div className="border-r border-dark-800 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {loading ? (
            <p className="text-xs text-dark-500 p-2">Loading…</p>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => selectSession(s.id)}
                className={`w-full text-left rounded-lg px-2 py-2 transition-colors ${
                  viewing?.id === s.id
                    ? 'bg-dark-800 border border-blue-500/40'
                    : 'hover:bg-dark-900 border border-transparent'
                }`}
              >
                <p className="text-[10px] uppercase tracking-wide text-dark-500">
                  {MODE_BADGE[s.mode]}
                </p>
                <p className="text-xs text-dark-100 line-clamp-2 leading-snug">{s.title}</p>
                <p className="text-[10px] text-dark-500 mt-1">{s.answers.length} replies</p>
              </button>
            ))
          )}
        </div>

        <div className="flex flex-col min-h-0 overflow-hidden">
          {viewing ? (
            <>
              <div className="px-3 py-2 border-b border-dark-800 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-dark-100 truncate">{viewing.title}</p>
                  <p className="text-[10px] text-dark-500 flex items-center gap-1 mt-0.5">
                    <Clock size={10} />
                    Updated {new Date(viewing.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
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
                    title="Delete session"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
                {viewing.answers.length === 0 ? (
                  <p className="text-sm text-dark-500 text-center py-8">
                    No replies yet in this session. Start listening to build memory.
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
            <p className="text-sm text-dark-500 text-center py-10">Select a session</p>
          )}
        </div>
      </div>
    </div>
  )
}
