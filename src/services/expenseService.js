const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

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

export class ExpenseServiceError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ExpenseServiceError'
    this.code = code
  }
}

export async function saveExpense(formData, { signal } = {}) {
  if (USE_MOCK) {
    await wait(1_500, signal)
    return { id: `expense-${Date.now()}`, status: 'pending' }
  }

  const body = new FormData()
  for (const [key, value] of Object.entries(formData)) {
    if (value !== null && value !== undefined && value !== '') body.append(key, value)
  }

  let response
  try {
    // TODO: Connect this endpoint to the FastAPI expense creation implementation.
    response = await fetch(`${API_BASE_URL}/api/expenses`, {
      method: 'POST',
      body,
      signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ExpenseServiceError('network', 'We could not connect. Your expense details are still here; please try again.')
  }

  if (response.status >= 500) {
    throw new ExpenseServiceError('server', 'The server could not save this expense. Your details are still here; please try again.')
  }
  if (!response.ok) {
    throw new ExpenseServiceError('request', 'We could not save this expense. Check the details and try again.')
  }
  return response.json()
}
