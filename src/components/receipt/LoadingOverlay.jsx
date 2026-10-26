import { useEffect, useRef } from 'react'

export default function LoadingOverlay() {
  const overlayRef = useRef(null)

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    overlayRef.current?.focus()

    const trapFocus = (event) => {
      if (event.key === 'Tab') {
        event.preventDefault()
        overlayRef.current?.focus()
      }
    }

    document.addEventListener('keydown', trapFocus)
    return () => {
      document.removeEventListener('keydown', trapFocus)
      document.body.style.overflow = previousOverflow
      previousFocus instanceof HTMLElement && previousFocus.focus()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-5" aria-modal="true">
      <div
        ref={overlayRef}
        role="status"
        aria-busy="true"
        aria-live="polite"
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-2xl outline-none"
      >
        <span className="mx-auto block size-12 animate-spin rounded-full border-4 border-slate-200 border-t-teal-600 motion-reduce:animate-none" />
        <p className="mt-5 text-lg font-bold text-navy">Reading your receipt...</p>
        <p className="mt-2 text-sm text-slate-500">One moment lang. You can review everything before saving.</p>
      </div>
    </div>
  )
}
