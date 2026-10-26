import { useCallback, useEffect, useRef, useState } from 'react'
import { ExpenseServiceError, saveExpense } from '../services/expenseService.js'

const SAVE_TIMEOUT_MS = 30_000

export function useExpenseSave() {
  const [isSaving, setIsSaving] = useState(false)
  const controllerRef = useRef(null)
  const savingRef = useRef(false)

  const save = useCallback(async (formData) => {
    if (savingRef.current) return null
    savingRef.current = true
    setIsSaving(true)
    const controller = new AbortController()
    controllerRef.current = controller
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, SAVE_TIMEOUT_MS)

    try {
      return await saveExpense(formData, { signal: controller.signal })
    } catch (error) {
      if (timedOut) {
        throw new ExpenseServiceError('timeout', 'Saving took too long. Your details are still here; please try again.')
      }
      if (error?.name === 'AbortError') throw error
      throw error
    } finally {
      clearTimeout(timeout)
      savingRef.current = false
      setIsSaving(false)
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [])

  useEffect(() => () => controllerRef.current?.abort(), [])

  return { save, isSaving }
}
