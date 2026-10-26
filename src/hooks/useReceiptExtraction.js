import { useCallback, useEffect, useRef } from 'react'
import { extractReceipt, ReceiptServiceError } from '../services/receiptService.js'

const EXTRACTION_TIMEOUT_MS = 30_000

export function useReceiptExtraction() {
  const controllerRef = useRef(null)

  const extract = useCallback(async (file) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, EXTRACTION_TIMEOUT_MS)

    try {
      return await extractReceipt(file, { signal: controller.signal })
    } catch (error) {
      if (timedOut) {
        throw new ReceiptServiceError('timeout', 'Reading this receipt took too long. Check your connection or enter the details manually.')
      }
      if (error?.name === 'AbortError') throw error
      throw error
    } finally {
      clearTimeout(timeout)
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [])

  const cancel = useCallback(() => controllerRef.current?.abort(), [])

  useEffect(() => cancel, [cancel])

  return { extract, cancel }
}
