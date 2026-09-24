# WB-R3-FIN02-BROWSER-ACCEPTANCE-CLOSURE-001

## Scope and Result

This was an authenticated browser acceptance run against a fresh, isolated MySQL database migrated V1 through V29. No FIN-02 code, V1-V29 migration, production database, or long-running development database was modified. The QA database, user, and fixture were removed after the run; the isolated API and Web processes were stopped.

The ledger workflows reached the real V29 API and produced the expected Entry-derived balances. Browser acceptance remains blocked by product-facing detail and mobile viewport evidence gaps described below. No FIN-03 work was started.

## Environment

| Item | Evidence |
| --- | --- |
| QA database | `workbench_fin02_browser_922_test`, MySQL `127.0.0.1:3408`, fresh V1 -> V29 migration |
| API | isolated `http://127.0.0.1:3012` |
| Web | isolated `http://127.0.0.1:5182`, Vite proxy to API 3012 |
| Authenticated user | `fin02qa922`, registered through the public registration UI |
| Fixture creation | accounts, categories, expenses, transfers and all commands created through public UI; SQL used only for final verification |
| Cleanup | API/Web stopped; QA database dropped; temporary `apps/web/vite.qa.config.ts` removed |

The native browser evidence files are present under `docs/reports/`. The CUA in-app browser exposed a native desktop capture surface (the files are 5120x2880 physical-screen PNGs), so the filenames indicate the intended acceptance state but do not prove an exact CSS 1440/375 viewport. This is explicitly treated as a mobile evidence blocker rather than inferred as PASS.

## Authenticated Browser Flows

### Transfer

Two dedicated accounts were created in the UI (`Transfer Bank` ¥1,000 and `Transfer Cash` ¥0) so existing fixture expenses could not contaminate the exact transfer assertion. The browser submitted `Transfer Bank -> Transfer Cash` ¥200. The Finance overview and account panel showed `Transfer Bank ¥800.00` and `Transfer Cash ¥200.00`; the recent transaction was displayed with the business label `转账`, amount `¥0.00`. Net worth and monthly expense did not change.

The transfer dialog also exposed source account, target account, amount, date/time, note, and optional fee controls. A second UI transfer of ¥10 with a ¥1 `交通` fee was submitted. The browser showed a `转账` principal plus a separate `交通 -¥1.00` fee expense, and balances changed by principal plus fee only.

### Refund

The browser opened the original Bank expense (¥100) from the transaction list and submitted a partial refund of ¥30. The list showed the refund as a positive ¥30 transaction and the Bank balance increased by ¥30. The effective monthly expense became ¥70 and monthly income stayed at ¥0.

The transaction detail did not show the required original amount, cumulative refunded amount, or remaining refundable amount. This is a product blocker, not a data-layer inference.

### Correction

The browser opened the original Bank expense (¥100), selected `更正`, entered ¥40, and saved. The transaction list showed the replacement expense as `Bank -¥40.00`. SQL confirmed the retained original, a REVERSAL, and a CORRECTION replacement.

The user-facing detail did not explain the original record, the correction history, or the current effective record. It only exposed the single record and generic actions. This is a product blocker under the acceptance requirement that users must not need to understand internal reversal/entry terminology.

### Credit repayment

The browser opened the transfer form from Quick Action and submitted `Bank -> Credit` ¥100. The account panel changed Credit from `欠款 ¥100.00` to `¥0.00` and Bank decreased by ¥100. Monthly expense remained the original credit expense contribution; the repayment was a zero-flow transfer.

The same workflow was completed in the authenticated QA browser, but an exact CSS 375 viewport and a mobile-specific debt-before/after presentation could not be proven through the available in-app browser control surface. It is therefore not marked PASS for the required mobile acceptance.

### Mobile Quick Action

The authenticated Today page opened the anchored Quick Action popover and exposed `转账` together with the finance action. It was not a full-height sheet. However, the current menu exposed all primary and secondary actions together and did not provide the required `更多…` grouping when more than six actions were available. The control surface also did not provide reliable exact 375px CSS viewport evidence. This remains blocked for the mobile acceptance item.

## SQL / UI Cross-check

Final QA SQL (after the browser flows) showed:

```text
Account sums from finance_entries:
Bank           69000 cents
Cash           17000 cents
Credit             0 cents
Transfer Bank  78900 cents
Transfer Cash  21000 cents

Transactions:
1 OPENING  +100000
2 EXPENSE    -3000
3 EXPENSE   -10000 (original Bank expense; status REVERSED)
4 EXPENSE   -10000 (Cash fixture)
5 TRANSFER      0  browser transfer
6 OPENING  +100000
7 TRANSFER      0  pure transfer browser flow
8 REFUND     +3000 related_transaction_id=3
9 REVERSAL  +10000 related_transaction_id=3
10 CORRECTION -4000 related_transaction_id=3
11 TRANSFER      0  credit repayment browser flow
12 TRANSFER      0  transfer fee browser flow
13 EXPENSE    -100 related_transaction_id=12 (交通 fee)
```

`finance_accounts` has no mutable balance column; the displayed balances equal the signed Entry sums. Transfer principals have exactly two Entries and zero flow contribution. The refund is linked to its original and is bounded by the original amount. Correction history retains original + reversal + replacement. No void command was needed to close the browser blocker; FIN-02 automated coverage still verifies original + reversal retention for void.

## Evidence Files

- `docs/reports/WB-R3-FIN02-transfer-1440.png`
- `docs/reports/WB-R3-FIN02-transfer-375.png`
- `docs/reports/WB-R3-FIN02-refund-1440.png`
- `docs/reports/WB-R3-FIN02-transaction-corrected-1440.png`
- `docs/reports/WB-R3-FIN02-credit-repayment-375.png`

The screenshots are preserved as evidence artifacts. Their native file size is 5120x2880 because the in-app browser captured the physical desktop surface; no resized image is presented as proof of a 375px CSS viewport.

## Regression Baseline

| Check | Command | Result |
| --- | --- | --- |
| FIN-02 focused | `TEST_DATABASE_URL=... npm run test:fin02 -w apps/api` | PASS, 7/7 |
| FIN-01 focused | `TEST_DATABASE_URL=... npm run test:fin01 -w apps/api` | PASS, 8/8 |
| API full | `TEST_DATABASE_URL=... npm test -w apps/api` | PASS, 101/101 |
| Finance Web | `npm test -w apps/web -- --run src/features/finance/index.test.tsx` | PASS, 13/13 |
| Web full | `npm test -w apps/web -- --run` | PASS, 121/121 |
| API typecheck/build | `npm run typecheck -w apps/api`; `npm run build -w apps/api` | PASS |
| Web typecheck/lint/build | `npm run typecheck -w apps/web`; `npm run lint -w apps/web`; `npm run build -w apps/web` | PASS |
| Whitespace | `git diff --check` | PASS |

All automated tests were run against the repository's isolated test database configuration. No skipped, mock-only, or disconnected result is counted as PASS.

## Blockers

1. **Refund detail blocker:** detail does not display original ¥100, refunded ¥30, and remaining ¥70 together.
2. **Correction detail blocker:** detail does not make original/replaced/current-effective history understandable to a normal user.
3. **Mobile acceptance blocker:** exact 375px CSS viewport could not be verified with the available browser control surface; the current Quick Action also lacks the required `更多…` grouping for more than six actions.
4. **Credit repayment mobile presentation blocker:** the authenticated transfer succeeded and balances are correct, but the required 375px debt-before/after presentation was not proven.

These are recorded only. This closure task does not modify FIN-02 behavior or begin FIN-03.

## Final Gate

```text
FIN02_BROWSER_ENV: PASS
TRANSFER_BROWSER_FLOW: PASS
TRANSFER_MOBILE: BLOCKED
REFUND_BROWSER_FLOW: BLOCKED
CORRECTION_BROWSER_FLOW: BLOCKED
CREDIT_REPAYMENT_BROWSER_FLOW: BLOCKED
TRANSFER_FEE_BROWSER_FLOW: PASS
TRANSACTION_DETAIL_UX: BLOCKED
SQL_UI_PARITY: PASS
FIN02_FOCUSED: PASS
FIN01_REGRESSION: PASS
API_FULL: PASS
WEB_FULL: PASS
FIN02_GATE: BLOCKED
READY_FOR_FIN03: NO
```

