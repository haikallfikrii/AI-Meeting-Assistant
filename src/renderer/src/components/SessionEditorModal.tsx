import { Save, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  SessionMode,
  WorkSession,
  useInterviewStore
} from '../store/interviewStore'

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
  chatNotes: ''
})

const MODE_LABELS: Record<SessionMode, string> = {
  interview: 'Job Interview',
  'client-meeting': 'Client / Project Meeting',
  'random-chat': 'Random Chat'
}

export function SessionEditorModal(): React.ReactNode | null {
  const {
    showSessionEditor,
    sessionEditorMode,
    activeSession,
    setShowSessionEditor,
    setActiveSession,
    clearAll
  } = useInterviewStore()

  const [mode, setMode] = useState<SessionMode>('interview')
  const [title, setTitle] = useState('')
  const [context, setContext] = useState(emptyContext())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!showSessionEditor) return
    if (sessionEditorMode === 'edit' && activeSession) {
      setMode(activeSession.mode)
      setTitle(activeSession.title)
      setContext({ ...emptyContext(), ...activeSession.context })
    } else {
      setMode('interview')
      setTitle('')
      setContext(emptyContext())
    }
  }, [showSessionEditor, sessionEditorMode, activeSession])

  if (!showSessionEditor) return null

  const patch = (updates: Partial<WorkSession['context']>): void => {
    setContext((prev) => ({ ...prev, ...updates }))
  }

  const handleSave = async (): Promise<void> => {
    try {
      setSaving(true)
      if (sessionEditorMode === 'edit' && activeSession) {
        const updated = await window.api.updateSession(activeSession.id, {
          title: title.trim() || undefined,
          mode,
          context
        })
        if (updated) setActiveSession(updated)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-dark-900 rounded-xl border border-dark-700 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <h2 className="text-lg font-semibold text-dark-100">
            {sessionEditorMode === 'edit' ? 'Edit Session' : 'New Session'}
          </h2>
          <button
            onClick={() => setShowSessionEditor(false)}
            className="p-1.5 rounded hover:bg-dark-700 text-dark-400 hover:text-dark-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4 max-h-[36rem] overflow-y-auto custom-scrollbar">
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
              <p className="text-xs text-dark-500">Mode is fixed after creation. Start a new session to switch modes.</p>
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

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-dark-700">
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
