import { useEffect } from 'react'
import { AnswerPanel } from './components/AnswerPanel'
import { Header } from './components/Header'
import { SessionEditorModal } from './components/SessionEditorModal'
import { SessionsPanel } from './components/SessionsPanel'
import { SettingsModal } from './components/SettingsModal'
import { StatusBar } from './components/StatusBar'
import { TranscriptPanel } from './components/TranscriptPanel'
import { useInterviewEvents } from './hooks/useInterviewEvents'
import { WorkSession, useInterviewStore } from './store/interviewStore'

function App(): React.JSX.Element {
  const {
    setShowSettings,
    settings,
    showHistory,
    setShowHistory,
    setActiveSession,
    setShowSessionEditor
  } = useInterviewStore()

  useInterviewEvents()

  useEffect(() => {
    const bootstrap = async (): Promise<void> => {
      try {
        const hasApiKeys = await window.api.hasApiKeys()
        if (!hasApiKeys) {
          setShowSettings(true)
        }

        const active = await window.api.getActiveSession()
        setActiveSession(active)

        if (active && !hasAnyContext(active) && hasApiKeys) {
          setShowSessionEditor(true, 'edit')
        }
      } catch (err) {
        console.error('Failed to bootstrap:', err)
      }
    }
    bootstrap()
  }, [setShowSettings, setActiveSession, setShowSessionEditor])

  useEffect(() => {
    if (settings.windowOpacity && settings.windowOpacity !== 1) {
      window.api.setWindowOpacity(settings.windowOpacity)
    }
  }, [settings.windowOpacity])

  return (
    <div className="flex flex-col h-screen bg-dark-950 text-dark-100 overflow-hidden">
      <Header />
      <StatusBar />
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {showHistory ? (
          <SessionsPanel onClose={() => setShowHistory(false)} />
        ) : (
          <AnswerPanel />
        )}
        <TranscriptPanel />
      </main>
      <SettingsModal />
      <SessionEditorModal />
    </div>
  )
}

function hasAnyContext(session: WorkSession): boolean {
  const skip = new Set(['answerLength', 'answerTone'])
  return Object.entries(session.context).some(
    ([key, value]) => !skip.has(key) && typeof value === 'string' && value.trim().length > 0
  )
}

export default App
