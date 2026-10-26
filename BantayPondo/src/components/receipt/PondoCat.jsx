import { useState } from 'react'

export default function PondoCat({ stage, saveCount, remaining, celebrationKey = 0, grownMessage = '' }) {
  const [showMeow, setShowMeow] = useState(false)
  const isMax = !remaining && stage.name === 'Max Cat'
  const nextThreshold = isMax ? 50 : saveCount + remaining
  const stageProgress = isMax ? 1 : (saveCount - stage.min) / Math.max(1, nextThreshold - stage.min)
  const progress = Math.min(100, Math.max(0, stageProgress * 100))

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#f3db9d] bg-gradient-to-br from-[#fff9e9] to-[#fff1cf] p-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={isMax ? 'Pondo the Max Cat says meow' : `Pondo the cat, ${stage.name}`}
          className={`grid size-14 shrink-0 place-items-center rounded-2xl bg-white text-3xl shadow-sm ${celebrationKey ? 'receipt-pet-bounce' : ''}`}
          key={celebrationKey}
          onClick={() => isMax && setShowMeow(true)}
          disabled={!isMax}
        >
          🐱
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Pondo the Cat</p>
              <p className="font-extrabold text-navy">{stage.name} <span className="text-xs font-semibold text-slate-500">· {saveCount} saved</span></p>
            </div>
            <span key={celebrationKey} className={`text-lg ${celebrationKey ? 'receipt-pet-sparkle' : ''}`} aria-hidden="true">✨</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80">
            <div className="h-full rounded-full bg-gold transition-[width] duration-700" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1.5 text-xs font-medium text-amber-900">
            {isMax ? 'Max growth! Tap Pondo for a meow.' : `${remaining} more ${remaining === 1 ? 'expense' : 'expenses'} to grow!`}
          </p>
        </div>
      </div>
      {grownMessage && <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-sm font-bold text-amber-900" aria-live="polite">{grownMessage}</p>}
      {isMax && (
        <button
          type="button"
          onClick={() => setShowMeow(true)}
          className="mt-3 min-h-11 rounded-lg bg-white px-4 text-sm font-bold text-amber-900 shadow-sm"
        >
          Say hello
        </button>
      )}
      {isMax && showMeow && <p className="absolute right-4 top-3 rounded-xl bg-white px-3 py-2 text-xs font-bold text-navy shadow" aria-live="polite">Meow! Salamat for helping Pondo grow.</p>}
    </section>
  )
}
