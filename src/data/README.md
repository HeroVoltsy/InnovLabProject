# Report data files

`events.json` contains the public event index. `budgets.json` and
`expenses.json` are the destination files for confirmed Angat Buhay records.
Do not copy provisional figures into either confirmed file until Angat Buhay
has confirmed them.

The current draft figures are isolated in `figures.pending.json`. Each record
is explicitly marked `provisional: true`; these values are for interface and
calculation testing, not Angat Buhay financials. `src/config/site.js` controls
whether the loader includes them.

To replace them:

1. Obtain records confirmed by Angat Buhay and retain the supplied document
   references.
2. Add budget records to `budgets.json` with `id`, `dateReceived`
   (`YYYY-MM-DD`), `sourceDonor`, `sourceType`, `amount` (numeric PHP amount),
   `restriction` (`Restricted` or `Unrestricted`), `targetEventId` (known event
   ID or `null`), `targetProject` (text or `null`), and `referenceDocument`
   (reference or `null`). Restricted records must name an event or project.
3. Add expense records to `expenses.json` with `id`, `date` (`YYYY-MM-DD`),
   `vendor`, `amount` (numeric PHP amount), `category` (one of the four
   categories below), `description`, `receiptRef`, `submitter`, `status`
   (`Approved`, `Pending`, or `Returned`), `eventId` (known event ID or
   `null`), and `program`.
4. Use only `Program Supplies`, `Transportation`, `Administrative`, or
   `Equipment` for expense categories. Only `Approved` expenses are reported.
5. Remove superseded entries from `figures.pending.json`, then run
   `npm run validate-data` and `npm test`.

Event dates with incomplete precision use `datePrecision` (`month` or `year`)
and an ISO date prefix (`YYYY-MM` or `YYYY`). They match every day within that
period in report date filters.
