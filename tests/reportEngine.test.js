import { describe, expect, it } from "vitest"

import {
  getCategoryBreakdown,
  getEndingBalance,
  getEventDateRange,
  getEventSummary,
  getLedger,
  getPeriodExpenses,
  getTotalFundsAvailable,
} from "../src/lib/reportEngine.js"

import { loadReportData } from "../src/data/loader.js"

const budgets = [
  { dateReceived: "2024-01-01", amount: 1000 },

  { dateReceived: "2024-02-01", amount: 250 },
]

const expenses = [
  {
    id: "a",

    date: "2024-01-08",

    vendor: "Stationery",

    description: "Paper",

    category: "Program Supplies",

    amount: 150,

    status: "Approved",
  },

  {
    id: "b",

    date: "2024-01-20",

    vendor: "Transit",

    description: "Volunteer transport",

    category: "Transportation",

    amount: 50,

    status: "Approved",
  },

  {
    id: "c",

    date: "2024-01-25",

    vendor: "Pending supplier",

    description: "Pending purchase",

    category: "Equipment",

    amount: 600,

    status: "Pending",
  },
]

describe("report calculations", () => {
  it("keeps the ledger grand total equal to period expenses", () => {
    const filters = { startDate: "2024-01-01", endDate: "2024-01-31" }

    const ledger = getLedger(filters, expenses)

    expect(ledger.grandTotal).toBe(
      getPeriodExpenses(filters.startDate, filters.endDate, expenses),
    )

    expect(ledger.grandTotal).toBe(200)
  })

  it("calculates ending balance from received funds and cumulative approved expenses", () => {
    const funds = getTotalFundsAvailable("2024-02-29", budgets)

    const cumulativeExpenses = getPeriodExpenses(
      undefined,
      "2024-02-29",
      expenses,
    )

    expect(getEndingBalance("2024-02-29", budgets, expenses)).toBe(
      funds - cumulativeExpenses,
    )

    expect(getEndingBalance("2024-02-29", budgets, expenses)).toBe(1050)
  })

  it("applies shared filters and counts direct program categories consistently", () => {
    const breakdown = getCategoryBreakdown(
      { startDate: "2024-01-01", endDate: "2024-01-31" },

      expenses,
    )

    expect(breakdown.total).toBe(200)

    expect(breakdown.directProgramActivities).toBe(200)

    expect(breakdown.directProgramPercentage).toBe(100)
  })

  it("only merges explicitly provisional figures when the notice is enabled", () => {
    const withoutProvisional = loadReportData(false)
    const withProvisional = loadReportData()

    expect(withoutProvisional.budgets).toHaveLength(0)

    expect(withoutProvisional.expenses).toHaveLength(0)

    expect(
      withProvisional.budgets.every((item) => item.provisional === true),
    ).toBe(true)

    expect(
      withProvisional.expenses.every((item) => item.provisional === true),
    ).toBe(true)
  })

  it("expands imprecise event dates to the matching calendar period", () => {
    expect(
      getEventDateRange({ date: "2023-04", datePrecision: "month" }),
    ).toEqual({ startDate: "2023-04-01", endDate: "2023-04-30" })
  })

  it("summarizes only approved expenses for an event", () => {
    const summary = getEventSummary(
      "event-1",
      [{ id: "event-1" }],
      [
        {
          restriction: "Restricted",
          targetEventId: "event-1",
          amount: 100,
        },
      ],
      [
        {
          id: "approved",

          date: "2024-01-02",

          vendor: "Vendor",

          description: "Expense",

          category: "Program Supplies",

          amount: 40,

          eventId: "event-1",

          status: "Approved",
        },
        {
          id: "pending",
          date: "2024-01-03",
          vendor: "Vendor",
          description: "Pending expense",

          category: "Equipment",

          amount: 30,

          eventId: "event-1",

          status: "Pending",
        },
      ],
    )

    expect(summary.spent).toBe(40)
    expect(summary.remainingBalance).toBe(60)
    expect(
      summary.categories.find((item) => item.category === "Equipment").amount,
    ).toBe(0)
  })
})
