# WB-R3-FIN-02-TRANSFER-REFUND-REVERSAL-001

## Executive Summary

FIN-02 is implemented as a forward-only V29 extension of the FIN-01 entry ledger. Transfers, optional transfer fees, refunds, corrections and voids are receipt-backed multi-table commands. Original transaction headers remain retained; effective balance and monthly flow continue to derive from signed Entries.

The isolated MySQL integration suite and the existing FIN-01 suite pass. The Web suite, typechecks, builds and `git diff --check` pass. Browser interaction reached the new Finance transfer dialog and the unified Quick Action transfer item, but the long-running dev API was connected to a pre-FINANCE database and returned `server error` for Finance initialization. That blocks a clean authenticated data-flow browser acceptance in this workspace.

## Scope and Non-Goals

- Added only the FIN-02 forward migration and Finance workflow surfaces.
- No V1-V28 migration bytes were changed.
- No mutable balance column, Timer lifecycle, Task semantics, Budget, Recurring, Import, Growth, AI or Agent Bridge work was added.
- Existing uncommitted work was preserved.

## Database and Migration

`db/migration/V29__extend_finance_transfer_refund_reversal.sql` adds `source_account_id`, `target_account_id`, `related_transaction_id`, expanded type/status checks, relation indexes and user-scoped foreign keys. It was executed successfully on an isolated fresh database and on a V28 upgrade fixture.

V17 remains untouched. No production Flyway history was accessed:

`PRODUCTION_FLYWAY_HISTORY: BLOCKED / NOT_VERIFIED`

Repository migration order is unique through V29. The V29 test verifies that the current V28 fixture remains readable after the forward migration.

## Existing and New Semantics

- Transfer: one TRANSFER header and exactly two signed Entries; source and target are explicit, distinct, owned, CNY and active. Transfer contributes zero monthly income/expense.
- Credit repayment uses the same transfer semantics. An optional fee is a linked EXPENSE and is the only flow contribution.
- Refund: only a posted EXPENSE can be refunded. Original category and history remain readable even after category disablement. Cumulative refunds are locked and bounded by the original expense.
- Correction: original is marked REVERSED and retained; a REVERSAL plus replacement CORRECTION are appended atomically.
- Void: original is marked VOIDED and a REVERSAL is appended. There is no hard delete.
- Account archive/unarchive is receipt-backed. Archived accounts retain derived balance/history and reject new writes.
- Account balance remains `SUM(finance_entries.amount_cents)`; no mutable balance storage was introduced.
- All new commands use `expectedVersion` where the original mutable header is involved.

## API and Web

Implemented endpoints:

- `POST /api/finance/transfers`
- `POST /api/finance/transactions/:id/refunds`
- `POST /api/finance/transactions/:id/correct`
- `POST /api/finance/transactions/:id/void`
- `POST /api/finance/accounts/:id/archive`
- `POST /api/finance/accounts/:id/unarchive`

The Finance page now exposes a transfer dialog and transaction detail actions for refund/correction/void. The unified Quick Action keeps one owner/FAB and adds `转账` without changing domain APIs. `docs/openapi.yaml` and `docs/ARCHITECTURE.md` document the new public surface and ownership.

## Test Baseline

| Check | Command | Result |
| --- | --- | --- |
| FIN-02 isolated MySQL suite | `TEST_DATABASE_URL=mysql://..._test npm run test:fin02 -w apps/api` | PASS, 7/7 |
| FIN-01 regression | `TEST_DATABASE_URL=mysql://..._test npm run test:fin01 -w apps/api` | PASS, 8/8 |
| Full API | `TEST_DATABASE_URL=mysql://..._test npm test -w apps/api` | PASS, 101/101 |
| Affected Web Finance suite | `npm test -w apps/web -- --run src/features/finance/index.test.tsx` | PASS, 13/13 |
| Full Web | `npm test -w apps/web -- --run` | PASS, 121/121 |
| API typecheck/build | `npm run typecheck -w apps/api`; `npm run build -w apps/api` | PASS |
| Web typecheck/lint/build | `npm run typecheck -w apps/web`; `npm run lint -w apps/web`; `npm run build -w apps/web` | PASS |
| Diff whitespace | `git diff --check` | PASS |

The FIN-02 suite includes migration fresh/upgrade, transfer zero-flow and replay, fee classification, credit repayment, partial refund bound, disabled-category history, correction, void, archive/unarchive and injected-entry rollback.

## Browser Evidence

Evidence files were captured under `docs/reports/`:

- `WB-R3-FIN02-transfer-1440.png`
- `WB-R3-FIN02-transfer-375.png`
- `WB-R3-FIN02-refund-1440.png`
- `WB-R3-FIN02-transaction-corrected-1440.png`
- `WB-R3-FIN02-credit-repayment-375.png`

The browser reached the Finance route, displayed the transfer action/dialog and displayed Quick Action with `转账`. The dev API used by the running browser did not have the Finance schema available to that process, so initialize/posted-data/detail smoke could not be completed there. This is an environment blocker, not a passing browser data-flow assertion.

## Gate Matrix

| Gate | Status | Evidence |
| --- | --- | --- |
| TRANSFER_ATOMICITY | PASS | FIN-02 test: one header/two Entries and trigger rollback |
| TRANSFER_FLOW_CLASSIFICATION | PASS | zero monthly flow; fee-only EXPENSE |
| CREDIT_REPAYMENT | PASS | transfer test targets CREDIT account |
| TRANSFER_FEE | PASS | linked fee transaction and expense total |
| REFUND | PASS | linked refund with retained category/history |
| PARTIAL_REFUND_INVARIANT | PASS | locked cumulative bound and 409 over-refund |
| CORRECTION | PASS | retained original + REVERSAL + replacement |
| VOID | PASS | retained VOIDED original + reversal |
| APPEND_ONLY_HISTORY | PASS | no hard delete; relation rows retained |
| ACCOUNT_ARCHIVE | PASS | archive blocks new writes, balance/history retained, unarchive works |
| FINANCE_CONCURRENCY | PASS | row locks and expectedVersion checks in command owner |
| FINANCE_IDEMPOTENCY | PASS | shared mutation receipts; replay test |
| FINANCE_UI | PASS_WITH_BLOCKERS | Web tests pass; dev browser API schema blocker |
| MOBILE_FINANCE | BLOCKED | authenticated 375 data-flow smoke blocked by dev API environment |
| QUICK_ACTION_REGRESSION | PASS | full Web suite and browser-visible transfer item |
| FULL_REGRESSION | PASS | API 101/101, Web 121/121, typecheck/build |

## Recommended Follow-up

1. Point the running dev API at a database migrated through V29, then rerun authenticated 1440/375 Finance transfer, refund, correction and credit-repayment browser smoke.
2. Keep V29 immutable once deployed; future Finance changes must use V30+.
3. Do not start FIN-03 until the browser environment blocker is closed and the five evidence states are re-captured at their intended viewport sizes.

## Final Result

TRANSFER_ATOMICITY: PASS

TRANSFER_FLOW_CLASSIFICATION: PASS

CREDIT_REPAYMENT: PASS

TRANSFER_FEE: PASS

REFUND: PASS

PARTIAL_REFUND_INVARIANT: PASS

CORRECTION: PASS

VOID: PASS

APPEND_ONLY_HISTORY: PASS

ACCOUNT_ARCHIVE: PASS

FINANCE_CONCURRENCY: PASS

FINANCE_IDEMPOTENCY: PASS

FINANCE_UI: PASS_WITH_BLOCKERS

MOBILE_FINANCE: BLOCKED

QUICK_ACTION_REGRESSION: PASS

FULL_REGRESSION: PASS

FIN02_GATE: PASS_WITH_BLOCKERS

READY_FOR_FIN03: NO
