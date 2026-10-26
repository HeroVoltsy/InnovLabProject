import { useEffect, useRef, useState } from "react"

function UploadIcon({ camera = false }) {
  return camera ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <path
        d="M4 7h4l2-3h4l2 3h4v13H4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="13"
        r="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <path
        d="M12 16V4m0 0L7 9m5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function ReceiptUploader({
  file,
  onFileChange,
  disabled,
  error,
}) {
  const galleryInput = useRef(null)

  const videoRef = useRef(null)

  const streamRef = useRef(null)

  const cameraRequestRef = useRef(0)

  const cameraStartingRef = useRef(false)

  const [previewUrl, setPreviewUrl] = useState("")

  const [cameraOpen, setCameraOpen] = useState(false)

  const [cameraStarting, setCameraStarting] = useState(false)

  const [cameraReady, setCameraReady] = useState(false)

  const [cameraStream, setCameraStream] = useState(null)

  const [cameraError, setCameraError] = useState("")

  const [capturedFile, setCapturedFile] = useState(null)

  const [capturedUrl, setCapturedUrl] = useState("")

  const isPdf =
    file?.type === "application/pdf" ||
    file?.name.toLowerCase().endsWith(".pdf")

  useEffect(() => {
    if (!capturedFile) {
      setCapturedUrl("")

      return undefined
    }

    const url = URL.createObjectURL(capturedFile)

    setCapturedUrl(url)

    return () => URL.revokeObjectURL(url)
  }, [capturedFile])

  useEffect(() => {
    if (!file || isPdf || !file.type.startsWith("image/")) {
      setPreviewUrl("")

      return undefined
    }

    const url = URL.createObjectURL(file)

    setPreviewUrl(url)

    return () => URL.revokeObjectURL(url)
  }, [file, isPdf])

  useEffect(() => {
    if (!cameraStream || !videoRef.current) return undefined

    const video = videoRef.current

    video.srcObject = cameraStream

    const playback = video.play()

    playback?.catch(() => {
      setCameraError(
        "The camera preview could not start. Check your browser permissions or upload the receipt from your device.",
      )
    })

    return () => {
      video.srcObject = null
    }
  }, [cameraStream])

  useEffect(() => {
    if (!cameraOpen) return undefined

    const closeOnEscape = (event) => {
      if (event.key === "Escape") closeCamera()
    }

    window.addEventListener("keydown", closeOnEscape)

    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [cameraOpen])

  useEffect(
    () => () => {
      cameraRequestRef.current += 1

      cameraStartingRef.current = false

      streamRef.current?.getTracks().forEach((track) => track.stop())

      streamRef.current = null
    },
    [],
  )

  const chooseFile = (event) => {
    const selected = event.target.files?.[0] || null

    onFileChange(selected)

    event.target.value = ""
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())

    streamRef.current = null

    setCameraStream(null)

    setCameraReady(false)
  }

  const cameraErrorMessage = (cameraError) => {
    if (
      cameraError?.name === "NotAllowedError" ||
      cameraError?.name === "PermissionDeniedError"
    ) {
      return "Camera access was denied. Allow camera access in your browser settings, or upload the receipt from your device."
    }

    if (
      cameraError?.name === "NotFoundError" ||
      cameraError?.name === "DevicesNotFoundError"
    ) {
      return "No camera was found on this device. You can upload the receipt from your device instead."
    }

    if (
      cameraError?.name === "NotReadableError" ||
      cameraError?.name === "TrackStartError"
    ) {
      return "The camera is in use by another app or could not start. Close other camera apps, or upload the receipt from your device."
    }

    if (cameraError?.name === "SecurityError") {
      return "Camera access requires a secure page (HTTPS or localhost). You can upload the receipt from your device instead."
    }

    return "The camera could not be opened. Check your browser permissions or upload the receipt from your device."
  }

  const openCamera = async () => {
    if (disabled || cameraStartingRef.current || streamRef.current) return

    setCameraOpen(true)

    setCameraError("")

    setCapturedFile(null)

    setCameraReady(false)

    const getUserMedia = navigator.mediaDevices?.getUserMedia

    if (!getUserMedia) {
      setCameraError(
        "This browser does not support live camera access, or the page is not secure. Use HTTPS or localhost, or upload the receipt from your device.",
      )

      return
    }

    const requestId = ++cameraRequestRef.current

    cameraStartingRef.current = true

    setCameraStarting(true)

    try {
      const stream = await getUserMedia.call(navigator.mediaDevices, {
        audio: false,

        video: { facingMode: { ideal: "environment" } },
      })

      if (cameraRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop())

        return
      }

      streamRef.current = stream

      setCameraStream(stream)
    } catch (error) {
      if (cameraRequestRef.current === requestId)
        setCameraError(cameraErrorMessage(error))
    } finally {
      if (cameraRequestRef.current === requestId) {
        cameraStartingRef.current = false

        setCameraStarting(false)
      }
    }
  }

  const closeCamera = () => {
    cameraRequestRef.current += 1

    cameraStartingRef.current = false

    stopCamera()

    setCameraStarting(false)

    setCameraError("")

    setCapturedFile(null)

    setCameraOpen(false)
  }

  const capturePhoto = () => {
    const video = videoRef.current

    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError(
        "The camera image is not ready yet. Please wait a moment and try again.",
      )

      return
    }

    const canvas = document.createElement("canvas")

    canvas.width = video.videoWidth

    canvas.height = video.videoHeight

    const captureId = ++cameraRequestRef.current

    cameraStartingRef.current = false

    stopCamera()

    setCameraStarting(false)

    setCameraError("")

    try {
      const context = canvas.getContext("2d")

      if (!context) throw new Error("Canvas is unavailable")

      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      canvas.toBlob(
        (blob) => {
          if (cameraRequestRef.current !== captureId) return

          if (!blob) {
            setCameraError(
              "We could not prepare that photo. Please try again or upload the receipt from your device.",
            )

            return
          }

          setCapturedFile(
            new File([blob], `receipt-${Date.now()}.jpg`, {
              type: "image/jpeg",
              lastModified: Date.now(),
            }),
          )
        },
        "image/jpeg",
        0.92,
      )
    } catch {
      setCameraError(
        "We could not prepare that photo. Please try again or upload the receipt from your device.",
      )
    }
  }

  const retakePhoto = () => {
    setCapturedFile(null)

    void openCamera()
  }

  const useCapturedPhoto = () => {
    if (!capturedFile) return

    onFileChange(capturedFile)

    closeCamera()
  }

  const uploadFromCameraError = () => {
    closeCamera()

    galleryInput.current?.click()
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">
            Step 1 · Receipt
          </p>
          <h2 className="mt-1 text-lg font-bold text-navy">Add a receipt</h2>
        </div>
        {file && (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            Attached
          </span>
        )}
      </div>

      {!file ? (
        <div className="mt-5 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-5 text-center sm:p-7">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-teal-50 text-teal-700">
            <UploadIcon camera />
          </div>
          <p className="mt-3 font-semibold text-slate-800">
            A clear receipt photo helps Pondo read the details.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            JPG, PNG, WebP, HEIC or PDF · under 10 MB
          </p>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              disabled={disabled}
              onClick={() => void openCamera()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-navy px-5 py-3 text-sm font-bold text-white transition hover:bg-[#0c2947] disabled:opacity-60"
            >
              <UploadIcon camera /> Take Photo
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => galleryInput.current?.click()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-navy hover:bg-slate-50 disabled:opacity-60"
            >
              <UploadIcon /> Upload from Device
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
          {isPdf ? (
            <div className="grid h-32 w-full shrink-0 place-items-center rounded-lg bg-red-50 text-red-700 sm:w-32">
              <div className="text-center">
                <span className="text-3xl" aria-hidden="true">
                  📄
                </span>
                <p className="text-xs font-extrabold">PDF</p>
              </div>
            </div>
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt="Receipt preview"
              className="h-40 w-full rounded-lg bg-white object-contain sm:w-40"
            />
          ) : (
            <div className="grid h-32 w-full place-items-center rounded-lg bg-slate-200 text-sm text-slate-600 sm:w-32">
              Image preview
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="break-all font-semibold text-slate-800">
              {file.name}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {(file.size / (1024 * 1024)).toFixed(2)} MB
            </p>
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
        ref={galleryInput}
        className="sr-only"
        type="file"
        accept="image/*,application/pdf"
        onChange={chooseFile}
        disabled={disabled}
        aria-label="Upload receipt from device"
      />
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800"
        >
          {error}
        </p>
      )}

      {cameraOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/70 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCamera()
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="receipt-camera-title"
            className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">
                  Step 1 · Receipt
                </p>
                <h2
                  id="receipt-camera-title"
                  className="mt-1 text-lg font-bold text-navy"
                >
                  {capturedFile ? "Review your photo" : "Take a receipt photo"}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close camera"
                onClick={closeCamera}
                className="grid size-10 shrink-0 place-items-center rounded-full border border-slate-200 text-xl text-slate-600 hover:bg-slate-50"
              >
                ×
              </button>
            </div>

            {capturedFile ? (
              <img
                src={capturedUrl}
                alt="Captured receipt preview"
                className="mt-4 max-h-[60vh] w-full rounded-xl bg-slate-100 object-contain"
              />
            ) : cameraStream ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                onLoadedMetadata={(event) =>
                  setCameraReady(Boolean(event.currentTarget.videoWidth))
                }
                onCanPlay={(event) =>
                  setCameraReady(Boolean(event.currentTarget.videoWidth))
                }
                className="mt-4 max-h-[60vh] min-h-56 w-full rounded-xl bg-slate-950 object-contain"
                aria-label="Live camera preview"
              />
            ) : (
              <div className="mt-4 grid min-h-56 place-items-center rounded-xl bg-slate-100 px-5 text-center text-sm text-slate-600">
                {cameraStarting
                  ? "Opening your camera…"
                  : "Camera preview is not available."}
              </div>
            )}

            {cameraError && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
              >
                <p>{cameraError}</p>
                <button
                  type="button"
                  onClick={uploadFromCameraError}
                  className="mt-2 font-bold text-navy underline underline-offset-4"
                >
                  Upload from Device instead
                </button>
              </div>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeCamera}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-navy hover:bg-slate-50"
              >
                Cancel
              </button>
              {capturedFile ? (
                <>
                  <button
                    type="button"
                    onClick={retakePhoto}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-navy hover:bg-slate-50"
                  >
                    Retake
                  </button>
                  <button
                    type="button"
                    onClick={useCapturedPhoto}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-navy px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0c2947]"
                  >
                    Use Photo
                  </button>
                </>
              ) : (
                <>
                  {cameraError && !cameraStream && (
                    <button
                      type="button"
                      onClick={() => void openCamera()}
                      disabled={cameraStarting}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-navy hover:bg-slate-50 disabled:opacity-60"
                    >
                      Try camera again
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!cameraReady || cameraStarting}
                    onClick={capturePhoto}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-navy px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0c2947] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <UploadIcon camera /> Capture Photo
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
