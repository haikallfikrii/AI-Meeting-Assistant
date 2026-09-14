import { Save, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  SessionMode,
  WorkSession,
  useInterviewStore
} from '../store/interviewStore'

type AnswerLength = WorkSession['context']['answerLength']
type AnswerTone = WorkSession['context']['answerTone']

const emptyContext = (): WorkSession['context'] => ({
  companyName: '',
  targetRole: '',
  jobDescription: '',
  resumeDescription: '',
  answerBank: '',
  clientName: '',
  projectName: '',
  projectScope: '',
  meetingGoals: '',
  chatTopic: '',
  chatNotes: '',
  answerLength: 'balanced',
  answerTone: 'neutral'
})

const MODE_LABELS: Record<SessionMode, string> = {
  interview: 'Job Interview',
  'client-meeting': 'Client / Project Meeting',
  'random-chat': 'Random Chat'
}

const LENGTH_OPTIONS: { id: AnswerLength; label: string; hint: string }[] = [
  { id: 'brief', label: 'Singkat', hint: '1–2 kalimat, langsung ke poin' },
  { id: 'balanced', label: 'Sedang', hint: 'Jawaban inti + 2–3 bullet' },
  { id: 'detailed', label: 'Detail', hint: 'Lebih lengkap, tetap bisa diucapkan' }
]

const TONE_OPTIONS: { id: AnswerTone; label: string; hint: string }[] = [
  { id: 'formal', label: 'Formal', hint: 'Polished, profesional' },
  { id: 'neutral', label: 'Netral', hint: 'Jelas, percaya diri' },
  { id: 'casual', label: 'Santai', hint: 'Natural, ringan' }
]

export function SessionEditorModal(): React.ReactNode | null {
  const {
    showSessionEditor,
    sessionEditorMode,
    activeSession,
    editorTargetSession,
    setShowSessionEditor,
    setActiveSession,
    clearAll
  } = useInterviewStore()

  const targetSession =
    sessionEditorMode === 'edit' ? editorTargetSession || activeSession : null

  const [mode, setMode] = useState<SessionMode>('interview')
  const [title, setTitle] = useState('')
  const [context, setContext] = useState(emptyContext())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!showSessionEditor) return
    if (sessionEditorMode === 'edit' && targetSession) {
      setMode(targetSession.mode)
      setTitle(targetSession.threadTitle || targetSession.title)
      setContext({ ...emptyContext(), ...targetSession.context })
    } else {
      setMode('interview')
      setTitle('')
      setContext(emptyContext())
    }
  }, [showSessionEditor, sessionEditorMode, targetSession])

  if (!showSessionEditor) return null

  const patch = (updates: Partial<WorkSession['context']>): void => {
    setContext((prev) => ({ ...prev, ...updates }))
  }

  const handleSave = async (): Promise<void> => {
    try {
      setSaving(true)
      if (sessionEditorMode === 'edit' && targetSession) {
        const updated = await window.api.updateSession(targetSession.id, {
          title: title.trim() || undefined,
          mode,
          context,
          threadTitle: title.trim() || undefined
        })
        if (updated && activeSession?.id === updated.id) {
          setActiveSession(updated)
        }
      } else {
        const created = await window.api.createSession({
          mode,
          title: title.trim() || undefined,
          context
        })
        setActiveSession(created)
        clearAll()
      }
      setShowSessionEditor(false)
    } catch (err) {
      console.error('Failed to save session:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[min(92vh,720px)] flex flex-col bg-dark-900 rounded-xl border border-dark-700 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-dark-700 shrink-0">
          <h2 className="text-lg font-semibold text-dark-100">
            {sessionEditorMode === 'edit' ? 'Edit Session' : 'New Session'}
          </h2>
          <button
            onClick={() => setShowSessionEditor(false)}
            className="p-1.5 rounded hover:bg-dark-700 text-dark-400 hover:text-dark-200"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 sm:px-5 py-4 sm:py-5 space-y-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-dark-200">Session Mode</label>
            <select
              value={mode}
              disabled={sessionEditorMode === 'edit'}
              onChange={(e) => setMode(e.target.value as SessionMode)}
              className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-100 focus:outline-none focus:border-blue-500 disabled:opacity-60"
            >
              {(Object.keys(MODE_LABELS) as SessionMode[]).map((id) => (
                <option key={id} value={id}>
                  {MODE_LABELS[id]}
                </option>
              ))}
            </select>
            {sessionEditorMode === 'edit' ? (
              <p className="text-xs text-dark-500">
                Mode is fixed after creation. Start a new session to switch modes.
              </p>
            ) : (
              <p className="text-xs text-dark-500">
                Each mode has its own fields — like separate ChatGPT chats.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-dark-200">
              Title <span className="text-dark-500 font-normal">(optional)</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Auto-named from company/client if empty"
              className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-100 placeholder-dark-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-3 rounded-lg border border-dark-700 p-3">
            <p className="text-sm font-medium text-dark-200">Gaya bahasa</p>
            <div className="space-y-1.5">
              <p className="text-xs text-dark-400">Panjang jawaban</p>
              <div className="grid grid-cols-3 gap-1.5">
                {LENGTH_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => patch({ answerLength: opt.id })}
                    className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                      context.answerLength === opt.id
                        ? 'border-blue-500/60 bg-blue-500/10 text-dark-100'
                        : 'border-dark-700 bg-dark-850 text-dark-300 hover:border-dark-600'
                    }`}
                  >
                    <p className="text-xs font-medium">{opt.label}</p>
                    <p className="text-[10px] text-dark-500 mt-0.5 leading-snug">{opt.hint}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-dark-400">Nada / tone</p>
              <div className="grid grid-cols-3 gap-1.5">
                {TONE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => patch({ answerTone: opt.id })}
                    className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                      context.answerTone === opt.id
                        ? 'border-blue-500/60 bg-blue-500/10 text-dark-100'
                        : 'border-dark-700 bg-dark-850 text-dark-300 hover:border-dark-600'
                    }`}
                  >
                    <p className="text-xs font-medium">{opt.label}</p>
                    <p className="text-[10px] text-dark-500 mt-0.5 leading-snug">{opt.hint}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {mode === 'interview' && (
            <div className="space-y-3 rounded-lg border border-dark-700 p-3">
              <p className="text-sm font-medium text-dark-200">Interview context</p>
              <Field
                label="Company"
                value={context.companyName}
                onChange={(v) => patch({ companyName: v })}
                placeholder="e.g. Acme Corp"
              />
              <Field
                label="Role / Position"
                value={context.targetRole}
                onChange={(v) => patch({ targetRole: v })}
                placeholder="e.g. Senior Frontend Engineer"
              />
              <Area
                label="Job Description"
                hint="Paste the JD so answers match what they need."
                value={context.jobDescription}
                onChange={(v) => patch({ jobDescription: v })}
                rows={4}
              />
              <Area
                label="Resume / Background"
                hint="Your experience for this interview."
                value={context.resumeDescription}
                onChange={(v) => patch({ resumeDescription: v })}
                rows={5}
              />
              <Area
                label="Answer Bank"
                hint="STAR stories, salary range, why this company…"
                value={context.answerBank}
                onChange={(v) => patch({ answerBank: v })}
                rows={4}
              />
            </div>
          )}

          {mode === 'client-meeting' && (
            <div className="space-y-3 rounded-lg border border-dark-700 p-3">
              <p className="text-sm font-medium text-dark-200">Client / project context</p>
              <Field
                label="Client"
                value={context.clientName}
                onChange={(v) => patch({ clientName: v })}
                placeholder="e.g. Client A"
              />
              <Field
                label="Project / Feature"
                value={context.projectName}
                onChange={(v) => patch({ projectName: v })}
                placeholder="e.g. Checkout redesign"
              />
              <Area
                label="Scope / Requirements"
                hint="What you're building, constraints, stack."
                value={context.projectScope}
                onChange={(v) => patch({ projectScope: v })}
                rows={4}
              />
              <Area
                label="Meeting goals / running notes"
                hint="Agenda today, open questions, decisions so far."
                value={context.meetingGoals}
                onChange={(v) => patch({ meetingGoals: v })}
                rows={4}
              />
              <Area
                label="Talking points"
                value={context.answerBank}
                onChange={(v) => patch({ answerBank: v })}
                rows={3}
              />
            </div>
          )}

          {mode === 'random-chat' && (
            <div className="space-y-3 rounded-lg border border-dark-700 p-3">
              <p className="text-sm font-medium text-dark-200">Chat context</p>
              <Field
                label="Topic"
                value={context.chatTopic}
                onChange={(v) => patch({ chatTopic: v })}
                placeholder="e.g. Catch-up with mentor"
              />
              <Area
                label="Notes"
                hint="Optional background for this chat."
                value={context.chatNotes}
                onChange={(v) => patch({ chatNotes: v })}
                rows={4}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 sm:px-5 py-3 sm:py-4 border-t border-dark-700 shrink-0 bg-dark-900">
          <button
            onClick={() => setShowSessionEditor(false)}
            className="px-4 py-2 text-sm text-dark-300 hover:text-dark-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Session'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-dark-200">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-100 placeholder-dark-500 focus:outline-none focus:border-blue-500"
      />
    </div>
  )
}

function Area({
  label,
  hint,
  value,
  onChange,
  rows
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  rows: number
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-dark-200">{label}</label>
      {hint ? <p className="text-xs text-dark-500">{hint}</p> : null}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-100 focus:outline-none focus:border-blue-500 resize-y"
      />
    </div>
  )
}
