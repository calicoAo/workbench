# WB-R3-FIN03-EDGE-CASES-AND-VIEWPORT-CLOSURE-002

Date: 2026-09-23  
Scope: FIN-03 final acceptance supplement only. FIN-04 was not started.

## Result

The requested edge-case and viewport closure is complete. The only production changes were inside the Finance owner: one effective-flow read path, recurring date/prepare validation, editable template fields with snapshot policy, and explicit mobile pending-posting copy.

## Cross-Month Rule

Finance uses append-only recognition:

- The original transaction remains in its original business month.
- A later correction writes a reversal and replacement in the correction month; it does not rewrite the original month.
- A positive refund is a negative expense contribution.
- Example verified in the real DB: August expense `10000`, September refund `3000` produced August `10000` and September `-3000` in Overview, Budget, and Report. August `10000` corrected to September `4000` produced August `10000` and September `-6000`.

Overview calls `financeEffectiveFlowForMonth`; Budget calls Report; Report calls the same `financeEffectiveRowsForMonth`/contribution logic. This is one Finance-owned semantic path, not three consumer calculations.

## Recurring Rules

- MONTHLY day `31` clamps to the calendar month end: `2026-04-30`, `2026-02-28`, and `2028-02-29` were all prepared.
- WEEKLY matches the stored UTC weekday value. A Monday template prepared `2026-04-06`, `2026-04-13`, and `2026-04-20` only.
- `endDate` is inclusive; no occurrence was generated after it.
- GET for templates/occurrences left row counts unchanged.
- POST prepare created one PENDING occurrence and a repeated prepare created zero new rows. The database unique key `uk_finance_recurring_occurrence_date (template_id, scheduled_date)` was present and enforced.

## Confirm / Rollback

- Replaying the same `operationId` and payload returned the same transaction and left one transaction, one Entry, and one POSTED occurrence.
- Reusing the same `operationId` with a changed `occurredTime` returned `409`.
- A forced `finance_entries` insert failure returned `500`; the occurrence remained PENDING, no transaction/Entry was committed, and the mutation receipt count did not change.
- Archiving the snapshot account or disabling the snapshot category each returned explicit `409`; neither pending occurrence posted or changed balances/reports.

## Template Edit History

The real DB suite created one POSTED, one SKIPPED, and one future PENDING occurrence, then edited amount, account, category, and schedule. POSTED and SKIPPED snapshots remained unchanged. The current policy is **freeze pending snapshots**: the future PENDING occurrence retained the amount/account/category captured at prepare time, while the template itself advanced to the new version.

## Exact Browser Evidence

Evidence used a dedicated Chrome CDP target and `Emulation.setDeviceMetricsOverride`; no in-app browser screenshot backend was used. The script asserts `innerWidth`, `innerHeight`, and `document.documentElement.scrollWidth` for every capture.

Desktop assertions: `1440 x 900`, `scrollWidth = 1440`.  
Mobile assertions: `375 x 812`, `scrollWidth = 375`.

Artifacts:

- [WB-R3-FIN03-overview-1440.png](WB-R3-FIN03-overview-1440.png)
- [WB-R3-FIN03-budget-1440.png](WB-R3-FIN03-budget-1440.png)
- [WB-R3-FIN03-recurring-1440.png](WB-R3-FIN03-recurring-1440.png)
- [WB-R3-FIN03-report-1440.png](WB-R3-FIN03-report-1440.png)
- [WB-R3-FIN03-budget-375.png](WB-R3-FIN03-budget-375.png)
- [WB-R3-FIN03-recurring-confirm-375.png](WB-R3-FIN03-recurring-confirm-375.png)
- [WB-R3-FIN03-report-375.png](WB-R3-FIN03-report-375.png)

The 375px checks confirmed readable budget totals/category/progress and form controls, a visible `预计入账 · 未入账` recurring state with an in-viewport `确认入账` CTA, explicit “影响真实余额” copy, and a vertical report with income, expense, net cashflow, category, account movement, and reconciliation sections. Quick Action remains the existing compact + More surface; no Budget/Report/Recurring shortcut was added.

## Verification

| Gate | Result | Evidence |
| --- | --- | --- |
| FIN03 focused | PASS | `r3-fin03-budget-recurring-reports.test.ts` 4/4 + `r3-fin03-edge-cases.test.ts` 7/7; combined 11/11 |
| FIN02 focused | PASS | 9/9 |
| FIN01 focused | PASS | 8/8 |
| Full API | PASS | 114/114 |
| Finance Web / full Web | PASS | 22 files, 131 tests |
| Typecheck | PASS | workspace API + Web |
| Lint | PASS | workspace API + Web |
| Build | PASS | API compile + Vite production build |
| `git diff --check` | PASS | clean |
| Architecture check | PASS | `engineering-architecture/scripts/architecture-check.mjs`: 0 errors, 0 warnings |
| OpenAPI check | PASS | Ruby YAML parser accepted `docs/openapi.yaml` |

## Final Gates

```text
CROSS_MONTH_FLOW: PASS
RECURRING_MONTH_END_RULE: PASS
RECURRING_WEEKLY_RULE: PASS
RECURRING_END_DATE: PASS
RECURRING_GET_PURITY: PASS
RECURRING_PREPARE_IDEMPOTENCY: PASS
RECURRING_CONFIRM_REPLAY: PASS
RECURRING_CONFIRM_ROLLBACK: PASS
RECURRING_TEMPLATE_EDIT_HISTORY: PASS
RECURRING_INVALID_POSTING: PASS
EXACT_375_EVIDENCE: PASS
MOBILE_FINANCE: PASS
FIN03_REGRESSION: PASS
FIN03_GATE: PASS
READY_FOR_FIN04: YES
```

Stop condition honored: no FIN-04 work was started.
