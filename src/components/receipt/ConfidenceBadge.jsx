export default function ConfidenceBadge({ value }) {
  if (!value) return null
  return (
    <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold capitalize text-teal-800">
      Auto-filled from receipt · {value} confidence
    </span>
  )
}
