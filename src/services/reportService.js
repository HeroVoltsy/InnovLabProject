import { reportData } from "../data/loader.js"

export async function getReportData(filters = {}) {
  if (import.meta.env?.VITE_USE_REPORT_API === "true") {
    const params = new URLSearchParams()

    const apiFilters = { ...filters, event: filters.event ?? filters.eventId }

    delete apiFilters.eventId

    for (const [key, value] of Object.entries(apiFilters)) {
      if (Array.isArray(value)) {
        if (value.length) params.set(key, value.join(","))
      } else if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value))
      }
    }

    const response = await fetch(`/api/reports?${params.toString()}`)

    if (!response.ok) {
      throw new Error(`Report service returned ${response.status}.`)
    }

    return response.json()
  }

  return reportData
}
