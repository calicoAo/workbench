# WB-R3-FIN-03-BUDGET-RECURRING-REPORTS-001

## Scope

FIN-03 adds Finance-owned budgets, recurring templates/occurrences, and deterministic monthly reports. V1-V29 migrations and FIN-02 write semantics were left unchanged. No FIN-04 import/reconciliation workflow, Growth, AI, or Agent behavior was added.

## Implementation Evidence

- Forward-only schema is [V30__add_finance_budget_recurring.sql](../../db/migration/V30__add_finance_budget_recurring.sql). It uses an explicit `category_scope_key` (`TOTAL` or category id) so the nullable total scope has a real unique key.
- Finance command/query ownership remains in [finance.ts](../../apps/api/src/finance.ts); transport validation remains in [routes/finance.ts](../../apps/api/src/routes/finance.ts).
- Budgets calculate spend from the existing effective Finance flow read model. Recurring GETs only read; preparation is an explicit receipt-backed POST. Confirmation locks the occurrence, account, and category, then writes the existing Finance header/Entry capability and updates the occurrence in the same mutation transaction. Skip writes no Finance transaction.
- Reports expose monthly income/expense/net cashflow, category net expense (refunds can be negative), account movement, and a derived reconciliation check. No totals, balances, or report snapshots are stored.
- Web Finance now exposes 概览/账户/流水/预算/周期/报表 in [finance/index.tsx](../../apps/web/src/features/finance/index.tsx). Finance-specific focused tests are in [fin03.test.tsx](../../apps/web/src/features/finance/fin03.test.tsx).
- Architecture and public contract references were updated in [ARCHITECTURE.md](../ARCHITECTURE.md) and [openapi.yaml](../openapi.yaml).

## Test Baseline

| Check | Result | Evidence |
|---|---|---|
| API typecheck | PASS | `npm run typecheck -w apps/api` |
| API lint command | PASS | `npm run lint -w apps/api` (repository script is TypeScript checking) |
| API test compilation | PASS | `TZ=UTC npx tsc -p apps/api/tsconfig.test.json --noEmit` |
| Web Finance tests | PASS | 20 tests in `src/features/finance/index.test.tsx` |
| FIN-03 Web focused tests | PASS | 3 tests in `src/features/finance/fin03.test.tsx` |
| Full Web suite | PASS | 22 files, 131 tests |
| Web typecheck | PASS | `npm run typecheck -w apps/web` |
| Web build | PASS | `npm run build -w apps/web` |
| `git diff --check` | PASS | no whitespace errors |
| FIN-03 MySQL integration | BLOCKED | requires isolated `TEST_DATABASE_URL`; no test database is configured in this environment |
| FIN-01 / FIN-02 / full API integration | BLOCKED | same missing isolated MySQL prerequisite; tests fail at their explicit configuration guard, not as skipped tests |

## Browser Evidence

The required 1440px and 375px screenshots were not generated because the API cannot start against a configured database in this environment. No screenshot is claimed as PASS without a real Finance API response. Required files remain to be captured in an isolated QA database:

- `docs/reports/WB-R3-FIN03-overview-1440.png`
- `docs/reports/WB-R3-FIN03-budget-1440.png`
- `docs/reports/WB-R3-FIN03-recurring-1440.png`
- `docs/reports/WB-R3-FIN03-report-1440.png`
- `docs/reports/WB-R3-FIN03-budget-375.png`
- `docs/reports/WB-R3-FIN03-recurring-confirm-375.png`
- `docs/reports/WB-R3-FIN03-report-375.png`

## Gate

The code and Web presentation are implemented and statically verified. Database-backed behavior and browser acceptance remain unverified because the required isolated MySQL environment is unavailable.

```text
BUDGET_TOTAL: BLOCKED
BUDGET_CATEGORY: BLOCKED
BUDGET_EFFECTIVE_FLOW: BLOCKED
RECURRING_TEMPLATE: BLOCKED
RECURRING_PREPARATION: BLOCKED
RECURRING_PENDING_NO_BALANCE_EFFECT: BLOCKED
RECURRING_CONFIRM_ATOMICITY: BLOCKED
RECURRING_SKIP: BLOCKED
REPORT_MONTHLY_FLOW: BLOCKED
REPORT_CATEGORY_BREAKDOWN: BLOCKED
REPORT_ACCOUNT_MOVEMENT: BLOCKED
BALANCE_RECONCILIATION: BLOCKED
FINANCE_OVERVIEW_FIN03: BLOCKED
MOBILE_FINANCE: BLOCKED
FIN02_REGRESSION: BLOCKED
FIN01_REGRESSION: BLOCKED
FULL_REGRESSION: BLOCKED
FIN03_GATE: PASS_WITH_BLOCKERS
READY_FOR_FIN04: NO
```

The blocker is environmental and explicit: configure a dedicated database whose name ends in `_test`, run the FIN-03 integration suite and the existing FIN-01/FIN-02/full API suites, then capture the seven browser screenshots. This task stops here and does not begin FIN-04.
