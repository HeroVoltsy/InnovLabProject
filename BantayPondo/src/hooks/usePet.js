import { useCallback, useState } from 'react'
import { getPetStage, getSaveCount, incrementSaveCount, PET_STAGES } from '../services/petService.js'

export function usePet() {
  const [saveCount, setSaveCount] = useState(getSaveCount)
  const [celebrationKey, setCelebrationKey] = useState(0)
  const stage = getPetStage(saveCount)
  const nextStage = PET_STAGES[PET_STAGES.indexOf(stage) + 1] || null
  const remaining = nextStage ? Math.max(0, nextStage.min - saveCount) : 0

  const celebrateSavedExpense = useCallback(() => {
    const previousStage = getPetStage(saveCount)
    const nextCount = incrementSaveCount()
    const currentStage = getPetStage(nextCount)
    setSaveCount(nextCount)
    setCelebrationKey((key) => key + 1)
    return {
      count: nextCount,
      stage: currentStage,
      grew: currentStage.name !== previousStage.name,
    }
  }, [saveCount])

  return { saveCount, stage, remaining, celebrationKey, celebrateSavedExpense }
}
