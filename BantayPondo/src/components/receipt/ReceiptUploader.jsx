import { useEffect, useRef, useState } from 'react'

function UploadIcon({ camera = false }) {
  return camera ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <path d="M4 7h4l2-3h4l2 3h4v13H4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <path d="M12 16V4m0 0L7 9m5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function ReceiptUploader({ file, onFileChange, disabled, error }) {
  const cameraInput = useRef(null)
  const galleryInput = useRef(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const isPdf = file?.type === 'application/pdf' || file?.name.toLowerCase().endsWith('.pdf')

  useEffect(() => {
    if (!file || isPdf || !file.type.startsWith('image/')) {
      setPreviewUrl('')
      return undefined
    }

    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file, isPdf])

  const chooseFile = (event) => {
    const selected = event.target.files?.[0] || null
    onFileChange(selected)
    event.target.value = ''
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Step 1 · Receipt</p>
          <h2 className="mt-1 text-lg font-bold text-navy">Take a photo or upload</h2>
        </div>
        {file && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">Attached</span>}
      </div>

      {!file ? (
        <div className="mt-5 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-5 text-center sm:p-7">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-teal-50 text-teal-700">
            <UploadIcon camera />
          </div>
          <p className="mt-3 font-semibold text-slate-800">A clear receipt photo helps Pondo read the details.</p>
          <p className="mt-1 text-sm text-slate-500">JPG, PNG, WebP, HEIC or PDF · under 10 MB</p>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              disabled={disabled}
              onClick={() => cameraInput.current?.click()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-navy px-5 py-3 text-sm font-bold text-white transition hover:bg-[#0c2947] disabled:opacity-60"
            >
              <UploadIcon camera /> Camera / upload
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => galleryInput.current?.click()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-navy hover:bg-slate-50 disabled:opacity-60"
            >
              <UploadIcon /> Upload from gallery / files
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
          {isPdf ? (
            <div className="grid h-32 w-full shrink-0 place-items-center rounded-lg bg-red-50 text-red-700 sm:w-32">
              <div className="text-center">
                <span className="text-3xl" aria-hidden="true">📄</span>
                <p className="text-xs font-extrabold">PDF</p>
              </div>
            </div>
          ) : previewUrl ? (
            <img src={previewUrl} alt="Receipt preview" className="h-40 w-full rounded-lg bg-white object-contain sm:w-40" />
          ) : (
            <div className="grid h-32 w-full place-items-center rounded-lg bg-slate-200 text-sm text-slate-600 sm:w-32">Image preview</div>
          )}
          <div className="min-w-0 flex-1">
            <p className="break-all font-semibold text-slate-800">{file.name}</p>
            <p className="mt-1 text-sm text-slate-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => galleryInput.current?.click()}
              className="mt-3 inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-bold text-teal-800 underline decoration-teal-300 underline-offset-4 disabled:opacity-60"
            >
              Replace receipt
            </button>
          </div>
        </div>
      )}

      <input
        ref={cameraInput}
        className="sr-only"
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        onChange={chooseFile}
        disabled={disabled}
        aria-label="Take a receipt photo or choose a file"
      />
      <input
        ref={galleryInput}
        className="sr-only"
        type="file"
        accept="image/*,application/pdf"
        onChange={chooseFile}
        disabled={disabled}
        aria-label="Upload receipt from gallery or files"
      />
      {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{error}</p>}
    </section>
  )
}
