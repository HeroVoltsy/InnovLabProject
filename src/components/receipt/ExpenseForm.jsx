import { useMemo, useReducer, useState } from 'react'
import ConfidenceBadge from './ConfidenceBadge.jsx'
import LoadingOverlay from './LoadingOverlay.jsx'
import PondoCat from './PondoCat.jsx'
import ReceiptUploader from './ReceiptUploader.jsx'
import SaveSuccessModal from './SaveSuccessModal.jsx'
import { useExpenseSave } from '../../hooks/useExpenseSave.js'
import { usePet } from '../../hooks/usePet.js'
import { useReceiptExtraction } from '../../hooks/useReceiptExtraction.js'
import './receipt.css'

const CATEGORIES = ['Program Supplies', 'Transportation', 'Administrative', 'Equipment']

const initialState = {
  phase: 'idle',
  file: null,
  form: { date: '', vendor: '', total: '', category: '', description: '', submitter: '' },
  confidence: {},
  autofilled: {},
  errorKind: '',
  errorMessage: '',
  uploadError: '',
}

function reducer(state, action) {
  switch (action.type) {
    case 'FILE_SELECTED':
      return { ...state, phase: 'previewing', file: action.file, errorKind: '', errorMessage: '', uploadError: '' }
    case 'UPLOAD_ERROR':
      return { ...state, uploadError: action.message }
    case 'EXTRACTION_STARTED':
      return { ...state, phase: 'extracting', errorKind: '', errorMessage: '' }
    case 'EXTRACTION_SUCCEEDED': {
      const data = action.data
      const autofilled = {
        date: data.date !== null && data.date !== undefined && data.date !== '',
        vendor: data.vendor !== null && data.vendor !== undefined && data.vendor !== '',
        total: data.total !== null && data.total !== undefined,
        category: CATEGORIES.includes(data.category),
        description: data.description !== null && data.description !== undefined && data.description !== '',
      }
      const confidence = { ...(data.confidence || {}) }
      Object.keys(autofilled).forEach((field) => {
        if (autofilled[field] && !confidence[field]) confidence[field] = 'medium'
      })
      return {
        ...state,
        phase: 'reviewing',
        form: {
          ...state.form,
          date: data.date ?? '',
          vendor: data.vendor ?? '',
          total: data.total === null || data.total === undefined ? '' : String(data.total),
          category: CATEGORIES.includes(data.category) ? data.category : '',
          description: data.description ?? '',
        },
        confidence,
        autofilled,
      }
    }
    case 'EXTRACTION_FAILED':
      return { ...state, phase: 'error', errorKind: 'extract', errorMessage: action.message }
    case 'SAVE_STARTED':
      return { ...state, phase: 'saving', errorKind: '', errorMessage: '' }
    case 'SAVE_FAILED':
      return { ...state, phase: 'error', errorKind: 'save', errorMessage: action.message }
    case 'SAVED':
      return { ...state, phase: 'saved', errorKind: '', errorMessage: '' }
    case 'MANUAL_REVIEW':
      return { ...state, phase: 'reviewing', errorKind: '', errorMessage: '' }
    case 'FIELD_CHANGED':
      return { ...state, form: { ...state.form, [action.field]: action.value } }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

function validateForm(form) {
  const errors = {}
  const today = new Date()
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  if (!form.date) errors.date = 'Enter the transaction date.'
  else if (form.date > todayString) errors.date = 'The transaction date cannot be in the future.'
  if (!form.vendor.trim()) errors.vendor = 'Enter the vendor or payee name.'
  if (!form.total || !Number.isFinite(Number(form.total)) || Number(form.total) <= 0) errors.total = 'Enter an amount greater than ₱0.'
  else if (!/^\d+(?:\.\d{1,2})?$/.test(form.total)) errors.total = 'Use no more than 2 decimal places.'
  if (!CATEGORIES.includes(form.category)) errors.category = 'Choose an expense category.'
  if (!form.submitter.trim()) errors.submitter = 'Enter your name as the submitter.'
  return errors
}

function friendlyError(error, action) {
  const code = error?.code
  if (code === 'not-an-image') return 'We could not read this as a receipt (400). Try a clearer photo, or enter the details manually.'
  if (code === 'too-large') return 'This file is too large (413). Choose a receipt under 10 MB.'
  if (code === 'timeout') return 'This is taking longer than 30 seconds. Check your connection and try again, or enter the details manually.'
  if (code === 'network') return 'We could not connect. Check your internet connection and try again.'
  if (code === 'server') return 'Our server is having trouble (500). Please try again in a moment.'
  return action === 'save'
    ? 'We could not save this expense. Your entries are still here; please try again.'
    : 'We could not read this receipt. Please try again or enter the details manually.'
}

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
const ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp|heic)$/i
const MAX_FILE_SIZE = 10 * 1024 * 1024

export default function ExpenseForm({ onViewExpenses }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [highlightKey, setHighlightKey] = useState(0)
  const [attemptedSave, setAttemptedSave] = useState(false)
  const [growthMessage, setGrowthMessage] = useState('')
  const { extract, isExtracting } = useReceiptExtraction()
  const { save, isSaving } = useExpenseSave()
  const pet = usePet()
  const errors = useMemo(() => validateForm(state.form), [state.form])
  const isLocked = isSaving || isExtracting

  const updateField = (field, value) => dispatch({ type: 'FIELD_CHANGED', field, value })

  const runExtraction = async (file) => {
    if (isExtracting) return
    dispatch({ type: 'EXTRACTION_STARTED' })
    try {
      const data = await extract(file)
      dispatch({ type: 'EXTRACTION_SUCCEEDED', data })
      setHighlightKey((key) => key + 1)
    } catch (error) {
      if (error?.name === 'AbortError') return
      dispatch({ type: 'EXTRACTION_FAILED', message: friendlyError(error, 'extract') })
    }
  }

  const handleFileChange = (file) => {
    if (!file) return
    dispatch({ type: 'FILE_SELECTED', file })

    // Courtesy check only. The backend must perform the real file validation.
    const hasAllowedType = ALLOWED_MIME_TYPES.has(file.type) || ALLOWED_EXTENSIONS.test(file.name)
    if (!hasAllowedType) {
      dispatch({ type: 'UPLOAD_ERROR', message: 'Please choose a JPEG, PNG, WebP, or HEIC receipt image.' })
      return
    }
    if (file.size >= MAX_FILE_SIZE) {
      dispatch({ type: 'UPLOAD_ERROR', message: 'This file must be under 10 MB. Please choose a smaller receipt.' })
      return
    }

    void runExtraction(file)
  }

  const handleSave = async (event) => {
    event.preventDefault()
    setAttemptedSave(true)
    if (Object.keys(errors).length || isSaving) return

    dispatch({ type: 'SAVE_STARTED' })
    const payload = { ...state.form, total: Number(state.form.total), receipt: state.file }
    try {
      const result = await save(payload)
      if (!result) return
      const petResult = pet.celebrateSavedExpense()
      setGrowthMessage(petResult.grew ? `Pondo grew into a ${petResult.stage.name}!` : '')
      dispatch({ type: 'SAVED' })
    } catch (error) {
      dispatch({ type: 'SAVE_FAILED', message: friendlyError(error, 'save') })
    }
  }

  const resetForm = () => {
    dispatch({ type: 'RESET' })
    setAttemptedSave(false)
    setHighlightKey(0)
    setGrowthMessage('')
  }

  const fieldClass = (field) => {
    const uncertain = ['low', 'medium'].includes(String(state.confidence[field] || '').toLowerCase())
    const isAutofilled = Boolean(state.autofilled[field])
    return [
      'mt-1 min-h-11 w-full rounded-xl border bg-white px-3 py-2.5 text-base text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100',
      uncertain ? 'border-amber-400' : 'border-slate-300',
      isAutofilled && highlightKey ? `receipt-field-highlight-${highlightKey % 2 ? 'a' : 'b'}` : '',
      attemptedSave && errors[field] ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-100' : '',
    ].filter(Boolean).join(' ')
  }

  const confidenceHint = (field) => {
    const confidence = String(state.confidence[field] || '').toLowerCase()
    if (confidence === 'low' || confidence === 'medium') {
      return <p className="mt-1 text-xs font-medium text-amber-800">Please double-check this detail.</p>
    }
    return null
  }

  const showManualHint = (field) =>
    ['reviewing', 'error'].includes(state.phase) && !state.autofilled[field] && !state.form[field]

  const fieldError = (field) => (attemptedSave || state.form[field]) && errors[field]
    ? <p className="mt-1 text-xs font-medium text-rose-700">{errors[field]}</p>
    : null

  return (
    <div className="receipt-page mx-auto w-full max-w-5xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-teal-700">Expenses / New record</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-navy">Record an expense</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">Snap a receipt and we’ll help fill in the details. You’ll review everything before saving.</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <ReceiptUploader
            file={state.file}
            onFileChange={handleFileChange}
            disabled={isLocked}
            error={state.uploadError}
          />

          {state.phase === 'error' && (
            <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:p-5">
              <p className="font-bold text-rose-900">{state.errorMessage}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                {state.errorKind === 'extract' ? (
                  <>
                    <button type="button" onClick={() => state.file && void runExtraction(state.file)} className="min-h-11 rounded-xl bg-navy px-4 py-2.5 text-sm font-bold text-white">Try again</button>
                    <button type="button" onClick={() => dispatch({ type: 'MANUAL_REVIEW' })} className="min-h-11 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-bold text-rose-900">Enter manually instead</button>
                  </>
                ) : (
                  <button type="button" onClick={() => handleSave({ preventDefault() {} })} className="min-h-11 rounded-xl bg-navy px-4 py-2.5 text-sm font-bold text-white">Try saving again</button>
                )}
              </div>
            </section>
          )}

          <form onSubmit={handleSave} noValidate>
            <fieldset disabled={isLocked} className="min-w-0 space-y-5 disabled:opacity-90">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-5">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Step 2 · Review</p>
                  <h2 className="mt-1 text-lg font-bold text-navy">Expense details</h2>
                  <p className="mt-1 text-sm text-slate-500">Please check the extracted information and fix anything that needs it.</p>
                </div>

                <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    <span>Date of Transaction *</span>
                    <input type="date" value={state.form.date} onChange={(event) => updateField('date', event.target.value)} className={fieldClass('date')} aria-invalid={Boolean(attemptedSave && errors.date)} />
                    {state.autofilled.date ? <ConfidenceBadge value={state.confidence.date} /> : showManualHint('date') && <p className="mt-1 text-xs text-amber-800">Couldn’t read this, please enter it manually.</p>}
                    {confidenceHint('date')}{fieldError('date')}
                  </label>

                  <label className="block text-sm font-semibold text-slate-700">
                    <span>Vendor / Payee Name *</span>
                    <input type="text" value={state.form.vendor} onChange={(event) => updateField('vendor', event.target.value)} className={fieldClass('vendor')} placeholder="e.g. Naga Hardware Supply" aria-invalid={Boolean(attemptedSave && errors.vendor)} />
                    {state.autofilled.vendor ? <ConfidenceBadge value={state.confidence.vendor} /> : showManualHint('vendor') && <p className="mt-1 text-xs text-amber-800">Couldn’t read this, please enter it manually.</p>}
                    {confidenceHint('vendor')}{fieldError('vendor')}
                  </label>

                  <label className="block text-sm font-semibold text-slate-700">
                    <span>Total Amount (PHP) *</span>
                    <div className="relative mt-1">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-slate-500">₱</span>
                      <input type="number" min="0.01" step="0.01" value={state.form.total} onChange={(event) => updateField('total', event.target.value)} className={`${fieldClass('total')} pl-8`} placeholder="0.00" aria-invalid={Boolean(attemptedSave && errors.total)} />
                    </div>
                    {state.autofilled.total ? <ConfidenceBadge value={state.confidence.total} /> : showManualHint('total') && <p className="mt-1 text-xs text-amber-800">Couldn’t read this, please enter it manually.</p>}
                    {confidenceHint('total')}{fieldError('total')}
                  </label>

                  <label className="block text-sm font-semibold text-slate-700">
                    <span>Expense Category *</span>
                    <select value={state.form.category} onChange={(event) => updateField('category', event.target.value)} className={fieldClass('category')} aria-invalid={Boolean(attemptedSave && errors.category)}>
                      <option value="">Choose a category</option>
                      {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                    {state.autofilled.category ? <ConfidenceBadge value={state.confidence.category} /> : showManualHint('category') && <p className="mt-1 text-xs text-amber-800">Couldn’t read this, please choose a category.</p>}
                    {confidenceHint('category')}{fieldError('category')}
                  </label>

                  <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
                    <span>Specific Purpose / Description</span>
                    <textarea rows="3" value={state.form.description} onChange={(event) => updateField('description', event.target.value)} className={`${fieldClass('description')} resize-y`} placeholder="What was this purchase for?" />
                    {state.autofilled.description ? <ConfidenceBadge value={state.confidence.description} /> : showManualHint('description') && <p className="mt-1 text-xs text-slate-500">Couldn’t read this, please enter it manually if available.</p>}
                    {confidenceHint('description')}
                  </label>

                  <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
                    <span>Submitter / Volunteer Name *</span>
                    <input type="text" autoComplete="name" value={state.form.submitter} onChange={(event) => updateField('submitter', event.target.value)} className={fieldClass('submitter')} placeholder="Your name" aria-invalid={Boolean(attemptedSave && errors.submitter)} />
                    <p className="mt-1 text-xs text-slate-500">This field is not filled from the receipt.</p>
                    {fieldError('submitter')}
                  </label>
                </div>
              </section>

              {attemptedSave && Object.keys(errors).length > 0 && (
                <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">A few required details need your attention before saving.</p>
              )}

              {state.phase !== 'saved' && (
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">Only approved expenses appear in public reports.</p>
                  <button type="submit" disabled={isLocked || Object.keys(errors).length > 0} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-teal-700 px-6 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-45">
                    {isSaving && <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" />}
                    {isSaving ? 'Saving...' : 'Save expense'}
                  </button>
                </div>
              )}
            </fieldset>
          </form>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <PondoCat
            stage={pet.stage}
            saveCount={pet.saveCount}
            remaining={pet.remaining}
            celebrationKey={pet.celebrationKey}
            grownMessage={growthMessage}
          />
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
            <p className="font-bold text-navy">A quick reminder</p>
            <p className="mt-1">The receipt reader is here to help. You can edit every field before saving.</p>
          </div>
        </aside>
      </div>

      {isExtracting && <LoadingOverlay />}
      {state.phase === 'saved' && (
        <SaveSuccessModal
          pet={pet}
          grownMessage={growthMessage}
          onAddAnother={resetForm}
          onViewExpenses={onViewExpenses}
        />
      )}
    </div>
  )
}
