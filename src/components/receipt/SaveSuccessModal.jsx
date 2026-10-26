import { useEffect, useRef } from 'react'
import PondoCat from './PondoCat.jsx'

export default function SaveSuccessModal({ pet, grownMessage, onAddAnother, onViewExpenses }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const previousFocus = document.activeElement
    dialogRef.current?.querySelector('button')?.focus()

    const trapFocus = (event) => {
      if (event.key !== 'Tab' || !dialogRef.current) return
      const buttons = [...dialogRef.current.querySelectorAll('button:not([disabled])')]
      if (!buttons.length) return
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', trapFocus)
    return () => {
      document.removeEventListener('keydown', trapFocus)
      previousFocus instanceof HTMLElement && previousFocus.focus()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-4">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-title"
        className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl sm:p-8"
      >
        <div className="receipt-success-check mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-3xl font-black text-emerald-700" aria-hidden="true">✓</div>
        <p className="mt-4 text-xs font-extrabold tracking-[0.2em] text-teal-700">SALAMAT!</p>
        <h2 id="saved-title" className="mt-1 text-2xl font-black text-navy">EXPENSE SAVED!</h2>
        <p className="mt-2 text-sm text-slate-600">Na-save na ang expense and sent for review.</p>
        <div className="mt-5 text-left">
          <PondoCat
            stage={pet.stage}
            saveCount={pet.saveCount}
            remaining={pet.remaining}
            celebrationKey={pet.celebrationKey}
            grownMessage={grownMessage}
          />
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={onAddAnother} className="min-h-11 flex-1 rounded-xl bg-navy px-4 py-3 text-sm font-bold text-white hover:bg-[#0c2947]">Add another</button>
          <button type="button" onClick={onViewExpenses} className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-navy hover:bg-slate-50">View expenses</button>
        </div>
      </section>
    </div>
  )
}
