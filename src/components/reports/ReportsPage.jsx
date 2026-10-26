import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { DATA_NOTICE_TEXT, SHOW_DATA_NOTICE } from "../../config/site.js"

import {
  getCategoryBreakdown,
  getEndingBalance,
  getEventDateRange,
  getEventSummary,
  getLedger,
  getMonthlySeries,
  getPeriodExpenses,
  getTotalFundsAvailable,
} from "../../lib/reportEngine.js"

import { getReportData } from "../../services/reportService.js"

import "./reports.css"

const categoryColors = ["#1F9E89", "#F2B33D", "#5B6B7A", "#12355B"]

const categoryOptions = [
  "Program Supplies",

  "Transportation",

  "Administrative",

  "Equipment",
]

const programOptions = [
  "Public Education",

  "Health and Nutrition",

  "Climate Action",

  "Community Engagement",

  "Disaster Relief and Rehabilitation",
]

const monthOptions = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),

  label: new Intl.DateTimeFormat("en-PH", { month: "long" }).format(
    new Date(2024, index, 1),
  ),
}))

const formatPhp = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",

    currency: "PHP",

    maximumFractionDigits: 2,
  }).format(amount)

function readFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search)

  const allowedTypes = new Set(["monthly", "event", "custom", "annual"])

  const requestedType = params.get("type")
  const currentYear = new Date().getFullYear()
  const requestedYear = Number(params.get("year"))
  const requestedMonth = params.get("month") ?? "all"
  const requestedFrom = Number(params.get("from"))
  const requestedTo = Number(params.get("to"))
  return {
    type: allowedTypes.has(requestedType) ? requestedType : "monthly",
    year:
      Number.isInteger(requestedYear) &&
      requestedYear >= 2022 &&
      requestedYear <= currentYear
        ? String(requestedYear)
        : String(currentYear),
    month:
      requestedMonth === "all" ||
      (Number.isInteger(Number(requestedMonth)) &&
        Number(requestedMonth) >= 1 &&
        Number(requestedMonth) <= 12)
        ? requestedMonth
        : "all",
    from:
      Number.isInteger(requestedFrom) &&
      requestedFrom >= 1 &&
      requestedFrom <= 12
        ? String(requestedFrom)
        : "1",
    to:
      Number.isInteger(requestedTo) && requestedTo >= 1 && requestedTo <= 12
        ? String(requestedTo)
        : "12",

    eventId: params.get("event") || "",

    program: params.get("program") || "",

    categories: params.get("categories")
      ? params

          .get("categories")

          .split(",")

          .filter((category) => categoryOptions.includes(category))
      : [],

    search: params.get("search") || "",
  }
}

function dateFromMonth(year, month) {
  return `${year}-${String(month).padStart(2, "0")}-01`
}

function lastDateOfMonth(year, month) {
  return new Date(Date.UTC(Number(year), Number(month), 0))

    .toISOString()

    .slice(0, 10)
}

function getSelectedDateRange(filters, events) {
  if (filters.eventId) {
    const event = events.find((item) => item.id === filters.eventId)

    if (event) return getEventDateRange(event)
  }

  if (filters.type === "custom") {
    const startMonth = Math.min(Number(filters.from), Number(filters.to))

    const endMonth = Math.max(Number(filters.from), Number(filters.to))

    return {
      startDate: dateFromMonth(filters.year, startMonth),

      endDate: lastDateOfMonth(filters.year, endMonth),
    }
  }

  if (filters.type === "annual" || filters.month === "all") {
    return {
      startDate: `${filters.year}-01-01`,

      endDate: `${filters.year}-12-31`,
    }
  }

  const month = Number(filters.month)

  return {
    startDate: dateFromMonth(filters.year, month),

    endDate: lastDateOfMonth(filters.year, month),
  }
}

function getYears(events, budgets, expenses) {
  const thisYear = new Date().getFullYear()

  const dates = [
    ...events.map((event) => event.date.slice(0, 4)),

    ...budgets.map((budget) => budget.dateReceived.slice(0, 4)),

    ...expenses.map((expense) => expense.date.slice(0, 4)),
  ]

    .map(Number)

    .filter((year) => year >= 2022 && year <= thisYear)

  const firstYear = Math.min(2022, ...dates)

  const lastYear = Math.max(thisYear, ...dates)

  return Array.from({ length: lastYear - firstYear + 1 }, (_, index) =>
    String(firstYear + index),
  )
}

function updateReportUrl(filters) {
  const params = new URLSearchParams(window.location.search)

  params.set("type", filters.type)

  params.set("year", filters.year)

  if (filters.month && filters.month !== "all")
    params.set("month", filters.month)
  else params.delete("month")

  if (filters.type === "custom") {
    params.set("from", filters.from)

    params.set("to", filters.to)
  } else {
    params.delete("from")

    params.delete("to")
  }

  if (filters.eventId) params.set("event", filters.eventId)
  else params.delete("event")

  if (filters.program) params.set("program", filters.program)
  else params.delete("program")

  if (filters.categories.length) {
    params.set("categories", filters.categories.join(","))
  } else {
    params.delete("categories")
  }

  if (filters.search.trim()) params.set("search", filters.search.trim())
  else params.delete("search")

  const query = params.toString()

  window.history.replaceState(
    null,

    "",

    `${window.location.pathname}${
      query ? `?${query}` : ""
    }${window.location.hash}`,
  )
}

function periodLabel(filters, range, event) {
  if (event) return event.name

  if (filters.type === "annual" || filters.month === "all") {
    return String(filters.year)
  }

  if (filters.type === "custom") {
    const from = monthOptions[Number(filters.from) - 1]?.label

    const to = monthOptions[Number(filters.to) - 1]?.label

    return `${from}–${to} ${filters.year}`
  }

  return new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric" })

    .format(new Date(`${range.startDate}T00:00:00`))
}

function setMonthFromChart(monthKey, setFilters) {
  const [year, month] = monthKey.split("-")

  setFilters((previous) => ({
    ...previous,

    type: "monthly",

    year,

    month: String(Number(month)),

    eventId: "",
  }))
}

export function FilterBar({
  filters,

  events,

  years,

  expanded,

  setExpanded,

  setFilters,

  onReset,
}) {
  const setValue = (key, value) =>
    setFilters((previous) => ({ ...previous, [key]: value }))

  return (
    <section className="report-filter-panel" aria-label="Report filters">
      <button
        className="report-filter-toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls="report-filter-controls"
        onClick={() => setExpanded((open) => !open)}
      >
        <span>Report filters</span>
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      <div
        className={`report-filter-controls${expanded ? " is-expanded" : ""}`}
        id="report-filter-controls"
      >
        <div className="report-filter-grid">
          <label>
            Report type
            <select
              value={filters.type}
              onChange={(event) =>
                setFilters((previous) => ({
                  ...previous,

                  type: event.target.value,

                  eventId:
                    event.target.value === "event" ? previous.eventId : "",

                  month:
                    event.target.value === "annual" ||
                    event.target.value === "event"
                      ? "all"
                      : previous.month,
                }))
              }
            >
              <option value="monthly">Monthly Summary</option>
              <option value="event">Event Summary</option>
              <option value="custom">Custom Range</option>
              <option value="annual">Annual</option>
            </select>
          </label>
          <label>
            Year
            <select
              value={filters.year}
              onChange={(event) => setValue("year", event.target.value)}
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          {filters.type === "custom" ? (
            <>
              <label>
                From month
                <select
                  value={filters.from}
                  onChange={(event) => setValue("from", event.target.value)}
                >
                  {monthOptions.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                To month
                <select
                  value={filters.to}
                  onChange={(event) => setValue("to", event.target.value)}
                >
                  {monthOptions.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            filters.type !== "event" &&
            filters.type !== "annual" && (
              <label>
                Month
                <select
                  value={filters.month}
                  onChange={(event) => setValue("month", event.target.value)}
                >
                  <option value="all">All months</option>
                  {monthOptions.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )
          )}
          <label>
            Event
            <select
              value={filters.eventId}
              onChange={(event) => {
                const selected = events.find(
                  (item) => item.id === event.target.value,
                )

                setFilters((previous) => ({
                  ...previous,

                  eventId: event.target.value,

                  type: event.target.value ? "event" : previous.type,

                  year: selected ? selected.date.slice(0, 4) : previous.year,

                  month: "all",
                }))
              }}
            >
              <option value="">All events</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Program
            <select
              value={filters.program}
              onChange={(event) => setValue("program", event.target.value)}
            >
              <option value="">All programs</option>
              {programOptions.map((program) => (
                <option key={program} value={program}>
                  {program}
                </option>
              ))}
            </select>
          </label>
          <label className="report-search-field">
            Search vendor or description
            <input
              type="search"
              value={filters.search}
              onChange={(event) => setValue("search", event.target.value)}
              aria-label="Search vendor or expense description"
            />
          </label>
        </div>
        <fieldset className="report-category-options">
          <legend>Expense categories</legend>
          {categoryOptions.map((category) => (
            <label key={category}>
              <input
                type="checkbox"
                checked={filters.categories.includes(category)}
                onChange={(event) =>
                  setFilters((previous) => ({
                    ...previous,

                    categories: event.target.checked
                      ? [...previous.categories, category]
                      : previous.categories.filter((item) => item !== category),
                  }))
                }
              />
              {category}
            </label>
          ))}
        </fieldset>
        <div className="report-filter-actions">
          <button
            type="button"
            className="report-reset-button"
            onClick={onReset}
          >
            Reset filters
          </button>
          <button
            type="button"
            className="report-apply-button"
            onClick={() => setExpanded(false)}
          >
            Done
          </button>
        </div>
      </div>
    </section>
  )
}

export function ActiveFilterChips({
  filters,
  events,
  setFilters,
  yearDefault,
}) {
  const event = events.find((item) => item.id === filters.eventId)

  const chips = [
    {
      key: "type",

      label: `Report: ${
        filters.type === "event"
          ? "Event Summary"
          : filters.type === "custom"
            ? "Custom Range"
            : filters.type === "annual"
              ? "Annual"
              : "Monthly Summary"
      }`,

      remove: () =>
        setFilters((previous) => ({
          ...previous,
          type: "monthly",
          eventId: previous.type === "event" ? "" : previous.eventId,
        })),
    },

    {
      key: "year",

      label: `Year: ${filters.year}`,

      remove: () =>
        setFilters((previous) => ({ ...previous, year: yearDefault })),
    },
  ]

  if (event) {
    chips.push({
      key: "event",

      label: event.name,

      remove: () =>
        setFilters((previous) => ({
          ...previous,
          eventId: "",
          type: "monthly",
        })),
    })
  } else if (filters.type === "custom") {
    chips.push({
      key: "range",

      label: `Months: ${monthOptions[Number(filters.from) - 1]?.label}–${monthOptions[Number(filters.to) - 1]?.label}`,

      remove: () =>
        setFilters((previous) => ({
          ...previous,
          type: "monthly",
          month: "all",
        })),
    })
  } else if (filters.type === "annual") {
    chips.push({
      key: "month",

      label: "Full year",

      remove: () =>
        setFilters((previous) => ({ ...previous, type: "monthly" })),
    })
  } else {
    chips.push({
      key: "month",

      label:
        filters.month === "all"
          ? "All months"
          : monthOptions[Number(filters.month) - 1]?.label,

      remove: () => setFilters((previous) => ({ ...previous, month: "all" })),
    })
  }

  if (filters.program) {
    chips.push({
      key: "program",

      label: filters.program,

      remove: () => setFilters((previous) => ({ ...previous, program: "" })),
    })
  }

  for (const category of filters.categories) {
    chips.push({
      key: `category-${category}`,

      label: category,

      remove: () =>
        setFilters((previous) => ({
          ...previous,

          categories: previous.categories.filter((item) => item !== category),
        })),
    })
  }

  if (filters.search) {
    chips.push({
      key: "search",

      label: `Search: ${filters.search}`,

      remove: () => setFilters((previous) => ({ ...previous, search: "" })),
    })
  }

  return (
    <div className="report-active-filters" aria-label="Active filters">
      <span>Active filters</span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className="report-filter-chip"
          onClick={chip.remove}
          aria-label={`Remove filter ${chip.label}`}
        >
          {chip.label} <span aria-hidden="true">×</span>
        </button>
      ))}
    </div>
  )
}

export function ReportHeader({ period }) {
  return (
    <header className="report-executive-header">
      <div>
        <p className="report-kicker">ANGAT BUHAY · PUBLIC REPORT</p>
        <h2>Angat Buhay</h2>
        <p>{period}</p>
      </div>
      <p className="report-generated">
        Generated on{" "}
        {new Intl.DateTimeFormat("en-PH", {
          dateStyle: "medium",

          timeStyle: "short",
        }).format(new Date())}
      </p>
    </header>
  )
}

export function FinancialOverview({ funds, expenses, balance, range }) {
  const cards = [
    [
      "Total Funds Available",

      funds,

      `All recorded funds received on or before ${range.endDate}.`,
    ],

    [
      "Period Expenses",

      expenses,

      "Approved expenses recorded within the selected period and filters.",
    ],

    [
      "Ending Balance",

      balance,

      "Total funds available less all approved expenses through the period end.",
    ],
  ]

  return (
    <section
      className="report-section"
      aria-labelledby="financial-overview-title"
    >
      <div className="report-section-heading">
        <div>
          <p className="report-kicker">FINANCIAL OVERVIEW</p>
          <h3 id="financial-overview-title">A clear view of the period</h3>
        </div>
      </div>
      <div className="report-financial-cards">
        {cards.map(([label, amount, note]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{formatPhp(amount)}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>
    </section>
  )
}

export function CategoryBreakdown({ breakdown }) {
  return (
    <section
      className="report-section"
      aria-labelledby="category-breakdown-title"
    >
      <div className="report-section-heading">
        <div>
          <p className="report-kicker">CATEGORIZED BREAKDOWN</p>
          <h3 id="category-breakdown-title">How expenses were recorded</h3>
        </div>
      </div>
      <div className="report-category-layout">
        <div
          className="report-category-chart"
          aria-label="Expense category donut chart"
        >
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={breakdown.categories}
                dataKey="amount"
                nameKey="category"
                innerRadius={64}
                outerRadius={91}
                paddingAngle={2}
              >
                {breakdown.categories.map((item, index) => (
                  <Cell
                    key={item.category}
                    fill={categoryColors[index % categoryColors.length]}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatPhp(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
          <div className="report-donut-center">
            <strong>{formatPhp(breakdown.total)}</strong>
            <span>period expenses</span>
          </div>
        </div>
        <div className="report-category-table-wrap">
          <table className="report-category-table">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Total</th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.categories.map((item, index) => (
                <tr key={item.category}>
                  <td>
                    <i style={{ backgroundColor: categoryColors[index] }} />
                    {item.category}
                  </td>
                  <td>{formatPhp(item.amount)}</td>
                  <td>{item.percentage.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="report-program-callout">
            <strong>{breakdown.directProgramPercentage.toFixed(1)}%</strong> of
            period expenses went directly to program activities.
          </p>
          <small className="report-footnote">
            Definition: direct program activities include {breakdown.definition}
            .
          </small>
        </div>
      </div>
    </section>
  )
}

export function ExpenseLedger({ ledger, onReceipt }) {
  const [sort, setSort] = useState({ key: "date", direction: "asc" })

  const [page, setPage] = useState(1)

  const pageSize = 8

  const sortedRows = useMemo(
    () =>
      [...ledger.rows].sort((left, right) => {
        const result =
          sort.key === "amount"
            ? left.amount - right.amount
            : String(left[sort.key]).localeCompare(String(right[sort.key]))

        return sort.direction === "asc" ? result : -result
      }),

    [ledger.rows, sort],
  )

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize))

  const visibleRows = sortedRows.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => setPage(1), [ledger.rows])

  const sortBy = (key) =>
    setSort((previous) => ({
      key,

      direction:
        previous.key === key && previous.direction === "asc" ? "desc" : "asc",
    }))

  return (
    <section className="report-section" aria-labelledby="expense-ledger-title">
      <div className="report-section-heading">
        <div>
          <p className="report-kicker">ITEMIZED EXPENSE LEDGER</p>
          <h3 id="expense-ledger-title">Approved expenses</h3>
        </div>
        <span>{ledger.rows.length} records</span>
      </div>
      <div className="report-ledger-table-wrap">
        <table className="report-ledger-table">
          <thead>
            <tr>
              {[
                ["date", "Date"],

                ["vendor", "Vendor"],

                ["description", "Description"],

                ["category", "Category"],

                ["amount", "Amount"],
              ].map(([key, label]) => (
                <th key={key} scope="col">
                  <button
                    type="button"
                    onClick={() => sortBy(key)}
                    aria-label={`Sort by ${label}${
                      sort.key === key
                        ? `, currently ${
                            sort.direction === "asc"
                              ? "ascending"
                              : "descending"
                          }`
                        : ""
                    }`}
                  >
                    {label}{" "}
                    {sort.key === key
                      ? sort.direction === "asc"
                        ? "↑"
                        : "↓"
                      : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan="5">
                  No approved expenses recorded for this event.
                </td>
              </tr>
            )}
            {visibleRows.map((expense) => (
              <tr
                key={expense.id}
                onClick={() => onReceipt(expense)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()

                    onReceipt(expense)
                  }
                }}
                tabIndex={0}
                aria-label={`Open receipt for ${expense.vendor}, ${formatPhp(expense.amount)}`}
              >
                <td>{expense.date}</td>
                <td>{expense.vendor}</td>
                <td>{expense.description}</td>
                <td>{expense.category}</td>
                <td>{formatPhp(expense.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan="4" scope="row">
                Ledger total
              </th>
              <td>{formatPhp(ledger.grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="report-pagination" aria-label="Expense ledger pages">
        <span>
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          disabled={page === 1}
          onClick={() => setPage((current) => current - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => setPage((current) => current + 1)}
        >
          Next
        </button>
      </div>
    </section>
  )
}

export function EventSummaryCard({ summary }) {
  if (!summary) return null

  const { event } = summary

  const { startDate, endDate } = getEventDateRange(event)

  return (
    <section
      className="report-event-card"
      aria-labelledby="event-summary-title"
    >
      <div>
        <p className="report-kicker">EVENT SUMMARY</p>
        <h3 id="event-summary-title">{event.name}</h3>
        <p>
          {startDate === endDate ? startDate : `${startDate} – ${endDate}`} ·{" "}
          {event.location}
        </p>
        <p>{event.description}</p>
        <small>Source note: {event.sourceNote}</small>
      </div>
      <dl>
        <div>
          <dt>Restricted funds</dt>
          <dd>{formatPhp(summary.restrictedFunds)}</dd>
        </div>
        <div>
          <dt>Approved expenses</dt>
          <dd>{formatPhp(summary.spent)}</dd>
        </div>
        <div>
          <dt>Remaining balance</dt>
          <dd>{formatPhp(summary.remainingBalance)}</dd>
        </div>
      </dl>
      <div className="report-event-categories">
        <strong>Spending by category</strong>
        {summary.categories.map((category) => (
          <span key={category.category}>
            {category.category} <b>{formatPhp(category.amount)}</b>
          </span>
        ))}
      </div>
    </section>
  )
}

export function MonthlyTrendChart({ series, onSelectMonth }) {
  return (
    <section className="report-section" aria-labelledby="monthly-trend-title">
      <div className="report-section-heading">
        <div>
          <p className="report-kicker">MONTHLY TREND</p>
          <h3 id="monthly-trend-title">Approved expenses over time</h3>
        </div>
        <span>Select a bar to view that month</span>
      </div>
      <div className="report-trend-chart">
        <ResponsiveContainer width="100%" height={270}>
          <BarChart
            data={series}
            margin={{ top: 10, right: 12, left: 8, bottom: 10 }}
          >
            <XAxis dataKey="month" tickFormatter={(key) => key.slice(0, 7)} />
            <YAxis
              tickFormatter={(value) => formatPhp(Number(value))}
              width={84}
            />
            <Tooltip
              labelFormatter={(key) => key}
              formatter={(value) => formatPhp(Number(value))}
            />
            <Bar
              dataKey="total"
              name="Approved expenses"
              fill="#1F9E89"
              radius={[5, 5, 0, 0]}
              onClick={(item) => item?.month && onSelectMonth(item.month)}
              cursor="pointer"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

export function ReceiptViewerModal({ expense, onClose }) {
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => {
    if (!expense) return undefined

    previousFocusRef.current = document.activeElement
    dialogRef.current?.focus()

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose()
        return
      }

      if (event.key !== "Tab" || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === dialogRef.current)
      ) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      previousFocusRef.current?.focus?.()
    }
  }, [expense, onClose])

  if (!expense) return null

  return (
    <div
      className="report-receipt-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="report-receipt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-viewer-title"
        ref={dialogRef}
        tabIndex={-1}
      >
        <button
          type="button"
          className="report-modal-close"
          onClick={onClose}
          aria-label="Close receipt details"
        >
          ×
        </button>
        <p className="report-kicker">RECEIPT REFERENCE</p>
        <h2 id="receipt-viewer-title">{expense.vendor}</h2>
        <p>{expense.description}</p>
        <dl>
          <div>
            <dt>Date</dt>
            <dd>{expense.date}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{expense.category}</dd>
          </div>
          <div>
            <dt>Recorded amount</dt>
            <dd>{formatPhp(expense.amount)}</dd>
          </div>
          <div>
            <dt>Receipt reference</dt>
            <dd>{expense.receiptRef || "No receipt reference recorded."}</dd>
          </div>
        </dl>
        <p className="report-receipt-note">
          Receipt files are not published in this report view. The reference
          above identifies the recorded document.
        </p>
      </section>
    </div>
  )
}

function LoadingReport() {
  return (
    <div className="report-loading" role="status" aria-label="Loading report">
      <span />
      <span />
      <span />
    </div>
  )
}

function defaultFilters(year = String(new Date().getFullYear())) {
  return {
    type: "monthly",

    year,

    month: "all",

    from: "1",

    to: "12",

    eventId: "",

    program: "",

    categories: [],

    search: "",
  }
}

export default function ReportsPage() {
  const [filters, setFilters] = useState(readFiltersFromUrl)

  const [initialYearInUrl] = useState(() =>
    new URLSearchParams(window.location.search).has("year"),
  )

  const [defaultYearApplied, setDefaultYearApplied] = useState(false)

  const [data, setData] = useState(null)

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState("")

  const [filtersExpanded, setFiltersExpanded] = useState(false)

  const [selectedReceipt, setSelectedReceipt] = useState(null)

  const closeReceipt = useCallback(() => setSelectedReceipt(null), [])

  useEffect(() => {
    updateReportUrl(filters)
  }, [filters])

  useEffect(() => {
    let active = true

    setLoading(true)

    setError("")

    getReportData(filters)

      .then((result) => {
        if (
          !Array.isArray(result?.events) ||
          !Array.isArray(result?.budgets) ||
          !Array.isArray(result?.expenses)
        ) {
          throw new Error("The report service returned an incomplete data set.")
        }

        if (active) setData(result)
      })

      .catch((loadError) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Reports could not be loaded. Please try again.",
          )
        }
      })

      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [filters])

  const years = useMemo(
    () =>
      getYears(data?.events ?? [], data?.budgets ?? [], data?.expenses ?? []),

    [data],
  )

  const yearDefault = useMemo(() => {
    const recordedYears = [
      ...(data?.budgets ?? []).map((item) => item.dateReceived.slice(0, 4)),
      ...(data?.expenses ?? []).map((item) => item.date.slice(0, 4)),
      ...(data?.events ?? []).map((item) => item.date.slice(0, 4)),
    ]
      .map(Number)
      .filter((year) => year >= 2022 && year <= new Date().getFullYear())

    return String(
      recordedYears.length
        ? Math.max(...recordedYears)
        : new Date().getFullYear(),
    )
  }, [data])

  useEffect(() => {
    if (data && !initialYearInUrl && !defaultYearApplied) {
      setFilters((previous) => ({ ...previous, year: yearDefault }))
      setDefaultYearApplied(true)
    }
  }, [data, defaultYearApplied, initialYearInUrl, yearDefault])

  const range = useMemo(
    () => getSelectedDateRange(filters, data?.events ?? []),

    [filters, data],
  )

  const event = data?.events.find((item) => item.id === filters.eventId)

  const period = periodLabel(filters, range, event)

  const reportFilters = useMemo(
    () => ({
      ...range,

      eventId: filters.eventId,

      program: filters.program,

      categories: filters.categories,

      search: filters.search,
    }),

    [range, filters],
  )

  const ledger = useMemo(
    () => getLedger(reportFilters, data?.expenses ?? []),

    [reportFilters, data],
  )

  const breakdown = useMemo(
    () => getCategoryBreakdown(reportFilters, data?.expenses ?? []),

    [reportFilters, data],
  )

  const funds = useMemo(
    () => getTotalFundsAvailable(range.endDate, data?.budgets ?? []),

    [range.endDate, data],
  )

  const expenses = useMemo(
    () =>
      getPeriodExpenses(
        range.startDate,

        range.endDate,

        data?.expenses ?? [],

        reportFilters,
      ),

    [range, reportFilters, data],
  )

  const endingBalance = useMemo(
    () =>
      getEndingBalance(
        range.endDate,
        data?.budgets ?? [],
        data?.expenses ?? [],
      ),

    [range.endDate, data],
  )

  const series = useMemo(
    () => getMonthlySeries(reportFilters, data?.expenses ?? []),

    [reportFilters, data],
  )

  const eventSummary = useMemo(
    () =>
      filters.eventId
        ? getEventSummary(
            filters.eventId,

            data?.events ?? [],

            data?.budgets ?? [],

            data?.expenses ?? [],
          )
        : null,

    [filters.eventId, data],
  )

  const resultCount = `${ledger.rows.length} expenses, ${formatPhp(ledger.grandTotal)}, in ${period}`
  const hasExpenseFilters =
    filters.categories.length > 0 ||
    Boolean(filters.program || filters.search.trim())

  const resetFilters = () => setFilters(defaultFilters(yearDefault))

  return (
    <main className="public-main page report-library">
      <header className="report-library-heading">
        <div>
          <p className="report-kicker">PUBLIC LIBRARY</p>
          <h1>Transparency reports</h1>
          <p>
            Explore recorded and documented Angat Buhay expenses by period,
            program, or event.
          </p>
        </div>
        <button
          type="button"
          className="report-print-button"
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </button>
      </header>
      <FilterBar
        filters={filters}
        events={data?.events ?? []}
        years={years}
        expanded={filtersExpanded}
        setExpanded={setFiltersExpanded}
        setFilters={setFilters}
        onReset={resetFilters}
      />
      <ActiveFilterChips
        filters={filters}
        events={data?.events ?? []}
        setFilters={setFilters}
        yearDefault={yearDefault}
      />
      <p className="report-result-count" aria-live="polite" aria-atomic="true">
        {resultCount}
      </p>

      {loading ? (
        <LoadingReport />
      ) : error ? (
        <section className="report-error" role="alert">
          <h2>Reports are temporarily unavailable</h2>
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setFilters((current) => ({ ...current }))}
          >
            Try again
          </button>
        </section>
      ) : ledger.rows.length === 0 && (!eventSummary || hasExpenseFilters) ? (
        <section className="report-empty">
          <div aria-hidden="true">↗</div>
          <h2>No expenses match these filters</h2>
          <p>Try a different period, event, or search term.</p>
          <button type="button" onClick={resetFilters}>
            Reset filters
          </button>
        </section>
      ) : (
        <article className="report-print-layout">
          <ReportHeader period={period} />
          {eventSummary && <EventSummaryCard summary={eventSummary} />}
          <FinancialOverview
            funds={funds}
            expenses={expenses}
            balance={endingBalance}
            range={range}
          />
          <CategoryBreakdown breakdown={breakdown} />
          <MonthlyTrendChart
            series={series}
            onSelectMonth={(month) => setMonthFromChart(month, setFilters)}
          />
          <ExpenseLedger ledger={ledger} onReceipt={setSelectedReceipt} />
        </article>
      )}
      <ReceiptViewerModal expense={selectedReceipt} onClose={closeReceipt} />
      <div className="report-page-footer">
        <p>
          Based on records submitted by Angat Buhay. Not an independently
          audited statement.
        </p>
        {SHOW_DATA_NOTICE && (
          <p className="report-data-notice-line">{DATA_NOTICE_TEXT}</p>
        )}
      </div>
    </main>
  )
}
