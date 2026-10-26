import { useCallback, useEffect, useRef, useState } from 'react'
import { extractReceipt, ReceiptServiceError } from '../services/receiptService.js'

const EXTRACTION_TIMEOUT_MS = 30_000

export function useReceiptExtraction() {
  const controllerRef = useRef(null)
  const requestIdRef = useRef(0)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractedData, setExtractedData] = useState(null)
  const [error, setError] = useState(null)

  const extract = useCallback(async (file) => {
    controllerRef.current?.abort()
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    const controller = new AbortController()
    controllerRef.current = controller
    setIsExtracting(true)
    setExtractedData(null)
    setError(null)
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, EXTRACTION_TIMEOUT_MS)

    try {
      const data = await extractReceipt(file, { signal: controller.signal })
      if (requestIdRef.current === requestId) setExtractedData(data)
      return data
    } catch (error) {
      if (timedOut) {
        const timeoutError = new ReceiptServiceError('timeout', 'Reading this receipt took too long. Check your connection or enter the details manually.')
        if (requestIdRef.current === requestId) setError(timeoutError)
        throw timeoutError
      }
      if (error?.name !== 'AbortError' && requestIdRef.current === requestId) setError(error)
      if (error?.name === 'AbortError') throw error
      throw error
    } finally {
      clearTimeout(timeout)
      if (controllerRef.current === controller) controllerRef.current = null
      if (requestIdRef.current === requestId) setIsExtracting(false)
    }
  }, [])

  const cancel = useCallback(() => controllerRef.current?.abort(), [])
  const reset = useCallback(() => {
    setError(null)
    setExtractedData(null)
  }, [])

  useEffect(() => cancel, [cancel])

  return { extract, cancel, reset, isExtracting, extractedData, error }
}
