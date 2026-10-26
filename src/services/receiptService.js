const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
const USE_MOCK = import.meta.env.VITE_USE_RECEIPT_MOCK === 'true' || import.meta.env.VITE_USE_MOCK === 'true'
const SAMPLE_RECEIPT = {
  date: '2026-10-20',
  vendor: 'Naga Hardware Supply',
  total: 1250.5,
  category: 'Program Supplies',
  description: 'Plywood',
  confidence: { date: 'high', vendor: 'medium', total: 'high' },
}

export class ReceiptServiceError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ReceiptServiceError'
    this.code = code
  }
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Request aborted', 'AbortError'))
      return
    }

    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Request aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

function mockScenario() {
  if (!import.meta.env.DEV) return null
  return new URLSearchParams(window.location.search).get('mock')
}

async function extractMock(signal) {
  const scenario = mockScenario()
  await wait(scenario === 'slow' ? 31_000 : 2_000 + Math.random() * 1_000, signal)

  if (scenario === 'notimage') {
    throw new ReceiptServiceError('not-an-image', 'The selected file could not be read as a receipt image.')
  }
  if (scenario === 'toolarge') {
    throw new ReceiptServiceError('too-large', 'That file is too large to process.')
  }
  if (scenario === 'error') {
    throw new ReceiptServiceError('server', 'The receipt service is temporarily unavailable.')
  }
  if (scenario === 'partial') {
    return {
      ...SAMPLE_RECEIPT,
      vendor: null,
      total: null,
      confidence: { date: 'high', vendor: null, total: null },
    }
  }
  return { ...SAMPLE_RECEIPT, confidence: { ...SAMPLE_RECEIPT.confidence } }
}

function responseError(response) {
  if (response.status === 400) {
    return new ReceiptServiceError('not-an-image', 'We could not read this file as a receipt. Try another photo or enter the details manually.')
  }
  if (response.status === 422) {
    return new ReceiptServiceError('request', 'The receipt upload is missing required fields. Please try selecting the image again.')
  }
  if (response.status === 413) {
    return new ReceiptServiceError('too-large', 'This receipt file is too large. Choose a file under 10 MB.')
  }
  if (response.status >= 500) {
    return new ReceiptServiceError('server', 'The receipt service is having trouble. Please try again in a moment.')
  }
  return new ReceiptServiceError('request', 'We could not process this receipt. Please try again.')
}

function normalizeExtractionResponse(payload) {
  const extracted = payload?.extracted_data
  if (payload?.status !== 'success' || !extracted || typeof extracted !== 'object') {
    throw new ReceiptServiceError('invalid-response', 'The receipt service returned an unexpected response. Please try again.')
  }

  return {
    date: extracted.transaction_date ?? null,
    vendor: extracted.vendor_name ?? null,
    total: extracted.total_amount ?? null,
    category: extracted.expense_category ?? null,
    description: extracted.specific_purpose ?? null,
    confidence: extracted.confidence ?? {},
    filename: payload.filename ?? null,
    raw: extracted,
  }
}

export async function extractReceipt(file, { signal } = {}) {
  if (USE_MOCK) return extractMock(signal)

  const body = new FormData()
  body.append('file', file)

  let response
  try {
    response = await fetch(`${API_BASE_URL}/api/receipts/process`, {
      method: 'POST',
      body,
      signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ReceiptServiceError('network', 'We could not connect. Check your connection and try again.')
  }

  if (!response.ok) throw responseError(response)
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new ReceiptServiceError('invalid-response', 'The receipt service returned invalid JSON. Please try again.')
  }

  return normalizeExtractionResponse(payload)
}
