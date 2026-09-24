# WB-R3-FIN02 Semantic Presentation Correction

## Scope

This was a final FIN-02 presentation correction. No V1-V29 migration, transfer/refund/correction/void write path, API command contract, or production database was changed.

Finance API remains the owner of read-model derivation; Web Finance remains the owner of presentation. The correction stayed within those existing boundaries.

## Corrections

### CREDIT repayment preview

The preview now derives the projected signed balance as `target.balanceCents + transferAmountCents`:

- negative: `还款后欠款` with absolute amount;
- zero: `还款后欠款 ¥0.00`;
- positive: `还款后余额` with the positive amount.

Focused Web coverage passes for `-100 + 80`, `-100 + 100`, `0 + 80`, and `-100 + 120`.

### Corrected and voided originals

The Finance detail read model now reports `remainingRefundableCents=0` and `canRefund=false` whenever the original is no longer posted. Web detail suppresses refund progress for corrected/voided originals and shows:

- corrected: `这笔原记录已更正` and `退款请对当前有效记录操作`, with original/current records;
- voided: `这笔记录已作废，不再影响余额和报表` and `不可再发起退款`.

Historical refund totals remain read-only when present.

Small non-blocking presentation fixes also landed: REFUND list rows use `退款 · <原分类>`, TRANSFER amounts use neutral styling, and fee category remains disabled until a positive fee is entered.

## Browser Evidence

Evidence was captured against isolated database `workbench_fin02_semantic_003` through Chrome CDP at exact viewport sizes:

| Evidence | Viewport | Result |
| --- | ---: | --- |
| `WB-R3-FIN02-credit-repayment-375.png` | 375x812 | PASS: current 0 + transfer 80 shows `还款后余额 ¥80.00` |
| `WB-R3-FIN02-corrected-detail-1440.png` | 1440x900 | PASS: corrected original shows current-record-only refund guidance and current effective record |
| `WB-R3-FIN02-void-detail-1440.png` | 1440x900 | PASS: voided original shows no refund action/progress and explicit non-impacting status |

## Verification

- `npm run test:fin02 -w apps/api`: PASS, 9 tests.
- `npm run test:fin01 -w apps/api`: PASS, 8 tests.
- `npm test -w apps/api`: PASS, 103 tests.
- Finance Web focused suite: PASS, 20 tests.
- `npm test -w apps/web`: PASS, 128 tests across 21 files.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.

## Final Gates

```text
CREDIT_SIGN_PRESENTATION: PASS
CORRECTED_REFUND_PRESENTATION: PASS
VOIDED_REFUND_PRESENTATION: PASS
FIN02_REGRESSION: PASS
FIN02_GATE: PASS
READY_FOR_FIN03: YES
```

The task stops here. FIN-03 was not started.
