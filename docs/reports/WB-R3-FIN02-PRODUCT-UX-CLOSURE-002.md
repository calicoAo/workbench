# WB-R3-FIN02 Product UX Closure

## Executive Summary

FIN-02 product UX blockers are closed within the existing Finance API and Web owners. The transaction read model now exposes principal/display amounts and relation summaries for transfers, refunds, corrections, and voided records. The Web UI renders those summaries with product-facing language, shows credit repayment preview, and keeps Quick Action compact on mobile with a More group.

No migration, public command contract, ledger mutation semantics, or production data was changed. Browser evidence was generated against the isolated MySQL database `workbench_fin02_ux_002` at exact viewport sizes.

## Scope And Evidence

- Transfer list/detail: principal amount and source/target account names are visible.
- Refund detail: original amount, refunded amount, remaining refundable amount, and refund history are visible.
- Correction detail: original and current effective records are visible.
- Voided detail: historical retention and non-impacting status are visible.
- Credit repayment: current debt, repayment, and after-repayment balance preview are visible before submit.
- Mobile Quick Action: compact two-column menu and `更多...` grouping are visible without horizontal overflow.

The read model remains owned by `apps/api/src/finance.ts`; Web rendering remains in `apps/web/src/features/finance/`. Quick Action remains owned by the AppShell.

## Browser Acceptance

Evidence files were captured by `scripts/fin02-ux-browser-evidence.mjs` through Chrome CDP:

| Evidence | Viewport | Result |
| --- | ---: | --- |
| `WB-R3-FIN02-transactions-1440.png` | 1440x900 | PASS |
| `WB-R3-FIN02-transfer-detail-1440.png` | 1440x900 | PASS |
| `WB-R3-FIN02-refund-detail-1440.png` | 1440x900 | PASS |
| `WB-R3-FIN02-corrected-detail-1440.png` | 1440x900 | PASS |
| `WB-R3-FIN02-void-detail-1440.png` | 1440x900 | PASS |
| `WB-R3-FIN02-quick-action-375.png` | 375x812 | PASS |
| `WB-R3-FIN02-quick-action-more-375.png` | 375x812 | PASS |
| `WB-R3-FIN02-credit-repayment-375.png` | 375x812 | PASS |
| `WB-R3-FIN02-transfer-375.png` | 375x812 | PASS |

The CDP evidence run reported `innerWidth=375`, `innerHeight=812`, and `document.documentElement.scrollWidth=375` for the final mobile state. The visual inspection confirms the modal summaries are readable, the Quick Action menu preserves Today context, and the mobile menu remains above the bottom navigation.

## Implementation Notes

`financeTransactionsForUser` and `financeTransactionForUser` now provide `displayAmountCents`, signed contribution fields, account names, and product-facing transfer/refund/correction/voided summaries. Detail responses explicitly include `amountCents`; child correction entries are included in account-name enrichment so the current effective record does not display as unassociated.

The Web transaction detail uses the read DTO rather than reconstructing ledger meaning from `FinanceEntry` rows. Missing optional display values are rendered defensively as zero without changing stored values or mutation behavior.

## Tests And Regression

- `TEST_DATABASE_URL=mysql://root@127.0.0.1:3408/personal_workbench_r2d0_full_test npm run test:fin02 -w apps/api`: PASS, 8 tests.
- `npm test -w apps/web -- --run src/features/finance/index.test.tsx src/app/shell/index.test.tsx`: PASS, 31 tests.
- Browser evidence flow: PASS, exact viewport screenshots and transfer/refund/correction/void/credit-preview flows completed.
- `TEST_DATABASE_URL=mysql://root@127.0.0.1:3408/personal_workbench_r2d0_full_test npm test -w apps/api`: PASS, 102 tests.
- `npm test -w apps/web`: PASS, 124 tests across 21 files.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.

Existing unrelated worktree changes were preserved.

## Final Gates

FIN02_READ_MODEL: PASS  
FIN02_TRANSFER_DISPLAY: PASS  
FIN02_REFUND_SUMMARY: PASS  
FIN02_CORRECTION_HISTORY: PASS  
FIN02_CREDIT_REPAYMENT_PREVIEW: PASS  
FIN02_QUICK_ACTION_GROUPING: PASS  
FIN02_BROWSER_EVIDENCE: PASS  
FIN02_PRODUCT_UX_CLOSURE: PASS  
READY_FOR_FIN03: NO (this task stops at FIN-02 UX closure)
