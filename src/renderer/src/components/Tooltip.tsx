import { ReactNode, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Side = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  content: string
  children: ReactNode
  side?: Side
  delayMs?: number
  className?: string
}

/**
 * In-window tooltip via portal so it isn't clipped by overflow:hidden
 * and isn't painted behind Electron's always-on-top panel (native title is).
 */
export function Tooltip({
  content,
  children,
  side = 'bottom',
  delayMs = 350,
  className = ''
}: TooltipProps): React.JSX.Element {
  const id = useId()
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const timerRef = useRef<number | null>(null)

  const clearTimer = (): void => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const updatePosition = (): void => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const gap = 8
    let top = rect.bottom + gap
    let left = rect.left + rect.width / 2

    if (side === 'top') {
      top = rect.top - gap
    } else if (side === 'left') {
      top = rect.top + rect.height / 2
      left = rect.left - gap
    } else if (side === 'right') {
      top = rect.top + rect.height / 2
      left = rect.right + gap
    }

    // Keep tooltip inside the window horizontally
    const margin = 8
    const approxWidth = 220
    left = Math.max(margin + approxWidth / 2, Math.min(left, window.innerWidth - margin - approxWidth / 2))

    setCoords({ top, left })
  }

  const show = (): void => {
    if (!content) return
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      updatePosition()
      setOpen(true)
    }, delayMs)
  }

  const hide = (): void => {
    clearTimer()
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onMove = (): void => updatePosition()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, side])

  useEffect(() => () => clearTimer(), [])

  const transform =
    side === 'top'
      ? 'translate(-50%, -100%)'
      : side === 'left'
        ? 'translate(-100%, -50%)'
        : side === 'right'
          ? 'translate(0, -50%)'
          : 'translate(-50%, 0)'

  return (
    <>
      <span
        ref={triggerRef}
        className={`inline-flex ${className}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-describedby={open ? id : undefined}
      >
        {children}
      </span>
      {open && content
        ? createPortal(
            <div
              id={id}
              role="tooltip"
              className="pointer-events-none fixed z-[10000] max-w-[220px] rounded-md border border-dark-600 bg-dark-800 px-2 py-1.5 text-[11px] leading-snug text-dark-100 shadow-lg"
              style={{ top: coords.top, left: coords.left, transform }}
            >
              {content}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
