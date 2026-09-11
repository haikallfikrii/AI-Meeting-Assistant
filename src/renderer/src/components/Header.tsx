import { History, Mic, Minus, Pin, PinOff, Plus, Settings, X } from 'lucide-react'
import { useInterviewStore } from '../store/interviewStore'

export function Header(): React.JSX.Element {
  const {
    settings,
    updateSettings,
    setShowSettings,
    showHistory,
    setShowHistory,
    activeSession,
    setShowSessionEditor
  } = useInterviewStore()

  const isAlwaysOnTop = settings.alwaysOnTop

  const handleMinimize = (): void => {
    window.api.minimizeWindow()
  }

  const handleClose = (): void => {
    window.api.closeWindow()
  }

  const toggleAlwaysOnTop = async (): Promise<void> => {
    const newValue = !isAlwaysOnTop
    await window.api.setAlwaysOnTop(newValue)
    updateSettings({ alwaysOnTop: newValue })
  }

  const modeLabel =
    activeSession?.mode === 'client-meeting'
      ? 'Client'
      : activeSession?.mode === 'random-chat'
        ? 'Chat'
        : 'Interview'

  return (
    <header className="flex items-center justify-between px-4 py-1.5 bg-dark-900 border-b border-dark-700 select-none app-drag">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary shadow-sm shrink-0">
          <Mic className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <span className="text-xs font-bold text-dark-100 tracking-wide shrink-0">Kalfi</span>
        {activeSession ? (
          <>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-800 text-dark-400 border border-dark-700 shrink-0">
              {modeLabel}
            </span>
            <span
              className="text-[11px] text-dark-300 truncate max-w-[100px]"
              title={activeSession.threadTitle || activeSession.title}
            >
              {activeSession.threadTitle || activeSession.title}
            </span>
            <span
              className="text-[10px] text-dark-500 truncate max-w-[90px] hidden sm:inline"
              title={activeSession.meetingLabel}
            >
              {activeSession.meetingLabel}
            </span>
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 app-no-drag shrink-0">
        <button
          onClick={() => setShowSessionEditor(true, 'create')}
          className="p-1.5 rounded hover:bg-dark-700 transition-colors text-dark-400 hover:text-blue-400"
          title="New session"
        >
          <Plus size={14} />
        </button>

        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`p-1.5 rounded hover:bg-dark-700 transition-colors ${
            showHistory ? 'text-blue-400' : 'text-dark-400'
          } hover:text-blue-400`}
          title={showHistory ? 'Back to live answers' : 'Sessions & history'}
        >
          <History size={14} />
        </button>

        <button
          onClick={toggleAlwaysOnTop}
          className={`p-1.5 rounded hover:bg-dark-700 transition-colors ${
            isAlwaysOnTop ? 'text-blue-400' : 'text-dark-400'
          }`}
          title={isAlwaysOnTop ? 'Unpin window' : 'Pin window on top'}
        >
          {isAlwaysOnTop ? <Pin size={14} /> : <PinOff size={14} />}
        </button>

        <button
          onClick={() => setShowSettings(true)}
          className="p-1.5 rounded hover:bg-dark-700 transition-colors text-dark-400 hover:text-dark-200"
          title="Settings"
        >
          <Settings size={14} />
        </button>

        <button
          onClick={handleMinimize}
          className="p-1.5 rounded hover:bg-dark-700 transition-colors text-dark-400 hover:text-dark-200"
          title="Minimize"
        >
          <Minus size={14} />
        </button>

        <button
          onClick={handleClose}
          className="p-1.5 rounded hover:bg-red-500/20 transition-colors text-dark-400 hover:text-red-400"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  )
}
