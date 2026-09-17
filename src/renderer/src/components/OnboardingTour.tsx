import { Camera, Check, Headphones, Mic, Play, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { AppSettings, useInterviewStore } from '../store/interviewStore'
import { hasPaidAccess } from '../lib/access'

const STEPS = [
  {
    title: 'Welcome to Kalfi',
    body: 'Live answers during interviews and calls — on your machine, with your key or Hosted plan. This short tour covers the essentials.',
    icon: Sparkles
  },
  {
    title: 'Stealth by default',
    body: 'Hide from Dock is on so Kalfi stays out of the Dock and Cmd+Tab. You can change this anytime in Settings → Stealth branding.',
    icon: Check
  },
  {
    title: 'Sessions first',
    body: 'Create a Session with your JD, resume, or meeting context. Answers stay grounded in that thread across calls.',
    icon: Headphones
  },
  {
    title: 'Start listening',
    body: 'Pick Both / System / Mic, then hit Start. Kalfi listens and drafts a speakable line when a question lands.',
    icon: Play
  },
  {
    title: 'Shot shortcut',
    body: 'For coding screens or written prompts, press ⌘⇧S (Ctrl+Shift+S on Windows/Linux) — or click Shot. Same action either way.',
    icon: Camera
  },
  {
    title: 'Ask & Mic Ask',
    body: 'Missed a line? Ask forces an answer on the latest transcript. Mic Ask arms your next spoken line to be answered.',
    icon: Mic
  }
]

export function OnboardingTour(): React.JSX.Element | null {
  const { settings, setSettings } = useInterviewStore()
  const [step, setStep] = useState(0)
  const entitled = hasPaidAccess(settings)

  if (!entitled || settings.onboardingCompleted) return null

  const Icon = STEPS[step].icon
  const isLast = step === STEPS.length - 1

  const finish = async (): Promise<void> => {
    const updated = await window.api.updateSettings({
      ...settings,
      onboardingCompleted: true
    })
    setSettings(updated as AppSettings)
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-dark-950/80 p-4">
      <div className="w-full max-w-md rounded-xl border border-dark-700 bg-dark-900 shadow-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-3 space-y-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/15 p-2.5 text-blue-400">
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-dark-500">
                Tour {step + 1} / {STEPS.length}
              </p>
              <h2 className="text-base font-semibold text-dark-100">{STEPS[step].title}</h2>
            </div>
          </div>
          <p className="text-sm text-dark-300 leading-relaxed">{STEPS[step].body}</p>
          <div className="flex gap-1.5 pt-1">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-blue-500' : 'bg-dark-700'}`}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-dark-800 bg-dark-850/80">
          <button
            type="button"
            onClick={() => void finish()}
            className="text-xs text-dark-500 hover:text-dark-300"
          >
            Skip
          </button>
          <div className="flex gap-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="px-3 py-1.5 rounded-md text-xs border border-dark-600 text-dark-300 hover:bg-dark-800"
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (isLast) void finish()
                else setStep((s) => s + 1)
              }}
              className="px-3 py-1.5 rounded-md text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium"
            >
              {isLast ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
