export const DIRECT_PROGRAM_CATEGORIES = Object.freeze([
  "Program Supplies",

  "Transportation",

  "Equipment",
])

export const EXPENSE_CATEGORIES = Object.freeze([
  "Program Supplies",

  "Transportation",

  "Administrative",

  "Equipment",
])

const PROGRAM_ACTIVITY_DEFINITION =
  "Program Supplies + Transportation + Equipment"

const approvedExpenses = (expenses) =>
  expenses.filter((expense) => expense.status === "Approved")

const isInDateRange = (date, startDate, endDate) =>
  (!startDate || date >= startDate) && (!endDate || date <= endDate)

const matchesExpenseFilters = (expense, filters = {}) => {
  if (expense.status !== "Approved") return false

  if (!isInDateRange(expense.date, filters.startDate, filters.endDate))
    return false

  if (filters.eventId && expense.eventId !== filters.eventId) return false

  if (filters.program && expense.program !== filters.program) return false

  if (
    filters.categories?.length &&
    !filters.categories.includes(expense.category)
  ) {
    return false
  }

  const query = filters.search?.trim().toLocaleLowerCase()

  if (
    query &&
    !`${expense.vendor} ${expense.description}`
      .toLocaleLowerCase()
      .includes(query)
  ) {
    return false
  }

  return true
}

const startOfPeriod = (date, precision) => {
  if (precision === "year") return `${date.slice(0, 4)}-01-01`

  if (precision === "month") return `${date.slice(0, 7)}-01`

  return date
}

const endOfPeriod = (date, precision) => {
  if (precision === "year") return `${date.slice(0, 4)}-12-31`

  if (precision === "month") {
    const [year, month] = date.slice(0, 7).split("-").map(Number)

    return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  }

  return date
}

export function getEventDateRange(event) {
  const precision = event.datePrecision ?? "day"

  const startDate = startOfPeriod(event.date, precision)

  const endDate = event.endDate
    ? endOfPeriod(
        event.endDate,

        event.endDate.length === 4
          ? "year"
          : event.endDate.length === 7
            ? "month"
            : "day",
      )
    : endOfPeriod(event.date, precision)

  return { startDate, endDate }
}

export function getTotalFundsAvailable(endDate, budgets = []) {
  return budgets

    .filter((budget) => !endDate || budget.dateReceived <= endDate)

    .reduce((total, budget) => total + Number(budget.amount), 0)
}

export function getPeriodExpenses(
  startDate,

  endDate,

  expenses = [],

  filters = {},
) {
  const combinedFilters = { ...filters, startDate, endDate }

  return approvedExpenses(expenses)

    .filter((expense) => matchesExpenseFilters(expense, combinedFilters))

    .reduce((total, expense) => total + Number(expense.amount), 0)
}

export function getEndingBalance(endDate, budgets = [], expenses = []) {
  const totalFundsAvailable = getTotalFundsAvailable(endDate, budgets)

  const cumulativeApprovedExpenses = getPeriodExpenses(
    undefined,

    endDate,

    expenses,
  )

  return totalFundsAvailable - cumulativeApprovedExpenses
}

export function getLedger(filters = {}, expenses = []) {
  const rows = approvedExpenses(expenses)

    .filter((expense) => matchesExpenseFilters(expense, filters))

    .map(({ date, vendor, description, category, amount, receiptRef, id }) => ({
      id,

      date,

      vendor,

      description,

      category,

      amount: Number(amount),

      receiptRef,
    }))

    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.id.localeCompare(right.id),
    )

  return {
    rows,

    grandTotal: rows.reduce((total, expense) => total + expense.amount, 0),
  }
}

export function getCategoryBreakdown(filters = {}, expenses = []) {
  const ledger = getLedger(filters, expenses)

  const total = ledger.grandTotal

  const categories = EXPENSE_CATEGORIES.map((category) => {
    const amount = ledger.rows

      .filter((expense) => expense.category === category)

      .reduce((sum, expense) => sum + expense.amount, 0)

    return {
      category,

      amount,

      percentage: total ? (amount / total) * 100 : 0,
    }
  })

  const directProgramActivities = categories

    .filter(({ category }) => DIRECT_PROGRAM_CATEGORIES.includes(category))

    .reduce((sum, item) => sum + item.amount, 0)

  return {
    categories,

    total,

    directProgramActivities,

    directProgramPercentage: total
      ? (directProgramActivities / total) * 100
      : 0,

    definition: PROGRAM_ACTIVITY_DEFINITION,
  }
}

export function getMonthlySeries(filters = {}, expenses = []) {
  const ledger = getLedger(filters, expenses)

  const months = new Map()

  for (const expense of ledger.rows) {
    const month = expense.date.slice(0, 7)

    months.set(month, (months.get(month) ?? 0) + expense.amount)
  }

  const start = filters.startDate?.slice(0, 7)

  const end = filters.endDate?.slice(0, 7)

  if (start && end) {
    const [startYear, startMonth] = start.split("-").map(Number)

    const [endYear, endMonth] = end.split("-").map(Number)

    for (
      let year = startYear, month = startMonth;
      year < endYear || (year === endYear && month <= endMonth);
    ) {
      const key = `${year}-${String(month).padStart(2, "0")}`

      if (!months.has(key)) months.set(key, 0)

      month += 1

      if (month > 12) {
        year += 1

        month = 1
      }
    }
  }

  return [...months.entries()]

    .sort(([left], [right]) => left.localeCompare(right))

    .map(([month, total]) => ({ month, total }))
}

export function getEventSummary(
  eventId,
  events = [],
  budgets = [],
  expenses = [],
) {
  const event = events.find((item) => item.id === eventId)

  if (!event) return null

  const restrictedFunds = budgets

    .filter(
      (budget) =>
        budget.restriction === "Restricted" && budget.targetEventId === eventId,
    )

    .reduce((sum, budget) => sum + Number(budget.amount), 0)

  const ledger = getLedger({ eventId }, expenses)

  const categories = getCategoryBreakdown({ eventId }, expenses).categories

  return {
    event,

    restrictedFunds,

    spent: ledger.grandTotal,

    remainingBalance: restrictedFunds - ledger.grandTotal,

    categories,
  }
}
