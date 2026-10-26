import fs from "node:fs"

import path from "node:path"

import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const readJson = (name) =>
  JSON.parse(fs.readFileSync(path.join(root, "src", "data", name), "utf8"))

const events = readJson("events.json")

const budgets = readJson("budgets.json")

const expenses = readJson("expenses.json")

const pending = readJson("figures.pending.json")

const expenseCategories = new Set([
  "Program Supplies",

  "Transportation",

  "Administrative",

  "Equipment",
])

const expenseStatuses = new Set(["Approved", "Pending", "Returned"])

const datePattern = /^\d{4}-\d{2}-\d{2}$/

const errors = []

const eventIds = new Set(
  Array.isArray(events) ? events.map((event) => event?.id).filter(Boolean) : [],
)

function validDate(value) {
  if (typeof value !== "string" || !datePattern.test(value)) return false

  const date = new Date(`${value}T00:00:00Z`)

  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  )
}

function requireFields(record, fields, label, nullableFields = []) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    errors.push(`${label}: record must be an object`)

    return
  }

  for (const field of fields) {
    if (
      !(field in record) ||
      record[field] === "" ||
      (record[field] === null && !nullableFields.includes(field))
    ) {
      errors.push(`${label}: missing ${field}`)
    }
  }
}

for (const event of Array.isArray(events) ? events : []) {
  const label = `Event ${event?.id ?? "(no id)"}`

  requireFields(
    event,

    ["id", "name", "date", "program", "location", "description", "sourceNote"],

    label,
  )
  if (!event || typeof event !== "object" || Array.isArray(event)) continue
  const precision = event.datePrecision ?? "day"

  const pattern =
    precision === "year"
      ? /^\d{4}$/
      : precision === "month"
        ? /^\d{4}-(0[1-9]|1[0-2])$/
        : precision === "day"
          ? datePattern
          : null

  if (!pattern || !pattern.test(event.date)) {
    errors.push(`${label}: date does not match precision`)
  } else if (precision === "day" && !validDate(event.date)) {
    errors.push(`${label}: invalid date`)
  }

  if (event.endDate) {
    const endPrecision =
      event.endDate.length === 4
        ? "year"
        : event.endDate.length === 7
          ? "month"
          : "day"
    const endPattern =
      endPrecision === "year"
        ? /^\d{4}$/
        : endPrecision === "month"
          ? /^\d{4}-(0[1-9]|1[0-2])$/
          : datePattern
    if (!endPattern.test(event.endDate)) {
      errors.push(`${label}: invalid endDate`)
    } else if (endPrecision === "day" && !validDate(event.endDate)) {
      errors.push(`${label}: invalid endDate`)
    }
  }
}

function validateBudgets(records, label) {
  for (const budget of records) {
    const item = `${label} ${budget?.id ?? "(no id)"}`

    requireFields(
      budget,

      [
        "id",

        "dateReceived",

        "sourceDonor",

        "sourceType",

        "amount",

        "restriction",

        "targetEventId",

        "targetProject",

        "referenceDocument",
      ],

      item,

      ["targetEventId", "targetProject", "referenceDocument"],
    )

    if (!budget || typeof budget !== "object" || Array.isArray(budget)) continue

    if (!validDate(budget.dateReceived))
      errors.push(`${item}: invalid dateReceived`)

    if (!Number.isFinite(budget.amount) || budget.amount < 0) {
      errors.push(`${item}: amount must be a non-negative number`)
    }

    if (!["Restricted", "Unrestricted"].includes(budget.restriction)) {
      errors.push(`${item}: invalid restriction`)
    }

    if (
      budget.restriction === "Restricted" &&
      !budget.targetEventId &&
      !budget.targetProject
    ) {
      errors.push(`${item}: restricted records need an event or project target`)
    }

    if (budget.targetEventId && !eventIds.has(budget.targetEventId)) {
      errors.push(`${item}: unknown eventId ${budget.targetEventId}`)
    }
  }
}

function validateExpenses(records, label) {
  for (const expense of records) {
    const item = `${label} ${expense?.id ?? "(no id)"}`

    requireFields(
      expense,

      [
        "id",

        "date",

        "vendor",

        "amount",

        "category",

        "description",

        "receiptRef",

        "submitter",

        "status",

        "eventId",

        "program",
      ],

      item,

      ["eventId"],
    )

    if (!expense || typeof expense !== "object" || Array.isArray(expense))
      continue

    if (!validDate(expense.date)) errors.push(`${item}: invalid date`)

    if (!Number.isFinite(expense.amount) || expense.amount < 0) {
      errors.push(`${item}: amount must be a non-negative number`)
    }

    if (!expenseCategories.has(expense.category)) {
      errors.push(`${item}: invalid category ${expense.category}`)
    }

    if (!expenseStatuses.has(expense.status)) {
      errors.push(`${item}: invalid status ${expense.status}`)
    }

    if (expense.eventId && !eventIds.has(expense.eventId)) {
      errors.push(`${item}: unknown eventId ${expense.eventId}`)
    }
  }
}

if (
  !Array.isArray(events) ||
  !Array.isArray(budgets) ||
  !Array.isArray(expenses)
) {
  errors.push("Events, budgets, and expenses must be JSON arrays")
} else {
  validateBudgets(budgets, "Budget")

  validateExpenses(expenses, "Expense")
}

if (
  !pending ||
  !Array.isArray(pending.budgets) ||
  !Array.isArray(pending.expenses)
) {
  errors.push("Pending figures must include budget and expense arrays")
} else {
  for (const record of [...pending.budgets, ...pending.expenses]) {
    if (record?.provisional !== true) {
      errors.push(
        `Pending figure ${record?.id ?? "(no id)"} is not marked provisional`,
      )
    }
  }

  validateBudgets(pending.budgets, "Pending budget")

  validateExpenses(pending.expenses, "Pending expense")
}

if (errors.length) {
  console.error(`Data validation failed:\n- ${errors.join("\n- ")}`)

  process.exitCode = 1
} else {
  console.log(
    `Data valid: ${events.length} events, ${budgets.length + pending.budgets.length} budgets, ${expenses.length + pending.expenses.length} expenses.`,
  )
}
