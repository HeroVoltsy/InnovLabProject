import events from "./events.json"

import budgets from "./budgets.json"

import expenses from "./expenses.json"

import pendingFigures from "./figures.pending.json"

import { SHOW_DATA_NOTICE } from "../config/site.js"

export function loadReportData(showProvisional = SHOW_DATA_NOTICE) {
  const includeProvisional = SHOW_DATA_NOTICE && showProvisional

  return {
    events,

    budgets: includeProvisional
      ? [...budgets, ...pendingFigures.budgets]
      : budgets,

    expenses: includeProvisional
      ? [...expenses, ...pendingFigures.expenses]
      : expenses,
  }
}

export const reportData = loadReportData()
