# PRODUCT-CLOSURE-02 — WALLET-ACCOUNTING-CLOSURE

Audit date: 2026-10-11. Scope: AUDIT ONLY. Prior completed slices remain closed.

## RESULT

**AUDIT_COMPLETE**. The reported archive defect is reproduced against isolated real MySQL through authenticated public API routes. Credit purchases, repayments, loan proceeds, principal repayments and interest already fit the signed Account + Transaction + Entry ledger. Basic liability management needs presentation/workflow closure, not another debt ledger. A standalone balance adjustment is genuinely absent.

This audit changes only this report. Production source, migration history and the architecture system of record are untouched. Pre-existing uncommitted Task lifecycle work is preserved. No product fix has been implemented or committed.

## CURRENT WALLET MODEL

| Fact / projection | Exact current owner and representation |
|---|---|
| Account | `apps/api/src/db/schema.ts:654`, `finance_accounts`: id, userId, name, type, CNY currency, includeInOverview, openingDate, archivedAt, optimistic version, timestamps. No stored balance, account note, due date, minimum payment, interest rate or credit limit. |
| Account types | `apps/api/src/enums.ts:103`: CASH=0, BANK=1, PAYMENT=2, CREDIT=3. V28 constrains SQL values to 0–3; API and Web enumerate the same four types. No explicit ASSET/LIABILITY field or investment/loan/installment subtype. |
| Transaction | `apps/api/src/db/schema.ts:680`: owned header with type, occurredAt, recordTimezone, persisted businessDate, category, note, source/target/related transaction identity, status, import provenance and version. Types OPENING/INCOME/EXPENSE/TRANSFER/REFUND/REVERSAL/CORRECTION; statuses POSTED/REVERSED/VOIDED. |
| Money truth | `finance_entries`, schema line 755: signed BIGINT integer cents, user/account/transaction ownership, non-zero entry constraint and unique transaction/account association. Opening balance becomes an OPENING transaction/entry; it is not a mutable Account column. |
| Balance | `financeAccountsForUser`, `apps/api/src/finance.ts:298`: SQL `SUM(finance_entries.amount_cents)` including original and appended reversal entries. No transaction-status predicate. API sends exact decimal strings; Web uses BigInt formatting. |
| Posting and projections | `apps/api/src/finance.ts`: canonical multi-table posting, balances, overview, monthly effective flow, budgets, recurring and reports. `routes/finance.ts` validates transport; it does not calculate balances. |
| Maintenance | `apps/api/src/finance-maintenance.ts`: import staging, sensitive exports, empty-domain restore and reconciliation; imported posting delegates to Finance. |
| Wallet UI | Public `apps/web/src/features/finance/index.tsx`: user-scoped queries, URL tab/dialog composition and cache invalidation. Private forms/views own account, record, transfer and history interaction. AppShell only mounts `/finance` and launchers. |

Account archive is domain state: receipt-backed archive/unarchive updates `archivedAt` and version, rejects ordinary new postings, and permits restoration. It is not deletion or trash; there is no Account `enabled` or `deletedAt`. Category `enabled` controls new category use while retaining historical references. Ordinary record/transfer pickers already exclude archived accounts. History and all-account queries intentionally retain them.

The ledger has two signed legs for a transfer, but it is not a general double-entry accounting system with balancing income/expense/equity accounts. No such system is needed for this closure.

## CURRENT NET-WORTH FORMULA

Let `b(a)` be the SQL sum of all entries for the owned account, and `I = accounts WHERE includeInOverview = true`. **There is no archive predicate in I.**

```text
Assets = SUM(b for non-CREDIT in I) + SUM(max(b, 0) for CREDIT in I)
Liabilities = SUM(max(-b, 0) for CREDIT in I)
NetWorth = SUM(b for I) = Assets - Liabilities
Active accountCount = count(all accounts WHERE archivedAt IS NULL)
```

Source: `apps/api/src/finance.ts:384`. Non-CREDIT negative balances remain signed assets under the current rule; CREDIT positive balances are assets (overpayment/prepayment). These edge rules exist already and must not be silently changed while fixing archive inclusion.

The overview month parameter selects flow/budget/recurring summaries. Headline balances are current balances across the entire ledger, not month-end balance snapshots. Monthly income/expense comes from persisted businessDate, not balance changes.

## ARCHIVE ROOT CAUSE

`financeOverviewForUser` deliberately reads `financeAccountsForUser(userId, "all")`, then skips only `!includeInOverview`. It omits `archivedAt`. The Web account lists hide archived accounts, and the API account count excludes them, while the headline still sums their balances. Cache invalidation already refreshes overview after archive; this is a server projection eligibility defect, not stale client state.

Isolated MySQL reproduction, amounts below in yuan:

| Public API step | Assets | Liabilities | Net worth | Active accounts | Monthly expense |
|---|---:|---:|---:|---:|---:|
| Create BANK opening 1,000; expense 300 | 700 | 0 | 700 | 1 | 300 |
| Archive BANK | **700** | 0 | **700** | 0 | 300 |
| Restore BANK | 700 | 0 | 700 | 1 | 300 |
| Later: assets 695, loan debt 300 | 695 | 300 | 395 | 3 | 605 |
| Archive loan account | 695 | **300** | **395** | 2 | 605 |

After the first archive, `/accounts` returned no active account; `/accounts?view=all` retained the 700 balance. Entry count/sum were unchanged; a new expense returned 409; transaction history and monthly expense remained intact. Liability archive reproduces the same missing eligibility rule.

The smallest repair owner is **Finance Overview's current-account eligibility**, applied consistently to assets, liabilities and net worth. Keep all-account/history reads available. Do not delete entries, append compensating money movement, zero a balance or remove archived transactions from monthly analytics.

Archive changes participation in the displayed current financial scope; it is not repayment or debt forgiveness. Restoring reinstates the untouched balance. Excluding an asset can lower displayed net worth; excluding a liability can raise it without an economic transaction. Product copy should make this scope effect clear.

## LIABILITY FIT ANALYSIS

**Existing schema fits basic liabilities.** CREDIT already means a signed credit/debt account: expenses make it more negative; asset-to-CREDIT transfer reduces debt; CREDIT-to-asset transfer creates borrowed funds without income. A named CREDIT account can represent a loan or installment balance today. Real API/SQL evidence confirms this, rather than assuming enum support.

It does not distinguish credit card, installment, loan and other debt as first-class subtypes. `type:"LOAN"` returns API 400, and SQL account type 4 fails `ER_CHECK_CONSTRAINT_VIOLATED`. If separately persisted subtype identity becomes a requirement, add a small Account metadata/enum extension via a new forward migration. That is not a reason for a separate Debt table.

| Candidate field | Recommendation |
|---|---|
| Current owed balance | Derive `max(-balanceCents, 0)` from Entries. Never add a second balance column. |
| Due date | Defer. No billing-period/due/reminder workflow currently justifies storing it. |
| Minimum payment | Defer; it belongs to a particular billing obligation, not the timeless current balance. |
| Interest rate | Defer; interest is already an explicit expense. No schedule/accrual feature requested. |
| Credit limit | Defer until available-credit display or enforcement is explicitly required; it is not an asset balance. |
| Account note | Small optional metadata would fit Account, but is not required to fix archive/debt flows. Transaction notes already describe individual borrowing/repayment events. |

## RECOMMENDED LIGHTWEIGHT MODEL

1. Keep Account metadata, immutable/append-only Transaction + Entry truth, and Finance-owned read projections.
2. Derive asset/liability groups from existing account types; CASH/BANK/PAYMENT are asset accounts, CREDIT is the liability family. Present its zero/positive balance explicitly as settled/prepaid rather than negative owed money.
3. Current overview eligibility must require `archivedAt IS NULL`. Preserve the existing explicit `includeInOverview` preference in the first repair. The requested “all active accounts” headline and today's optional exclusion are different product scopes: either label totals as included active accounts or deliberately change that preference in a later product decision. Do not quietly remove it while fixing archive.
4. Group Accounts into Assets / Liabilities / Archived; make positive owed-balance entry and transfer-based borrowing/repayment understandable. Do not add another debt balance state.
5. Retain existing expense/refund/correction flow. Add independent adjustment only as a separately specified later slice.

The ledger can represent a manually maintained investment cash/value balance, but there is no investment type, valuation source or portfolio logic. Total assets including investments is not the same as immediately spendable cash. Defer investment-specific identity/valuation and any “usable assets” calculation until explicitly scoped; the archive repair cannot infer liquidity from existing data.

## TRANSACTION SEMANTICS

The matrix assumes participating active accounts, amount x, and no fee unless stated. Transfers across an excluded/archived scope would not preserve that scope's net worth; ordinary archived postings are already rejected.

| Product action | Current / proposed representation | Account effect | Net-worth effect | Income / expense analytics |
|---|---|---|---|---|
| Income | Existing INCOME | Asset signed balance +x | +x | Income +x |
| Cash expense | Existing EXPENSE | Asset -x | -x | Expense +x |
| Credit-card expense | Existing EXPENSE on CREDIT | CREDIT -x; debt +x | -x | Expense +x |
| Transfer | Existing TRANSFER | Source -x, target +x | 0 | Neither; optional fee is separate EXPENSE |
| Credit-card repayment | Existing TRANSFER, bank → CREDIT | Asset -x; debt -x until settled | 0 | Neither; never another expense |
| Loan proceeds | Existing TRANSFER, CREDIT → bank | CREDIT -x; debt +x; asset +x | 0 | Neither; never income |
| Principal repayment | Existing TRANSFER, bank → CREDIT | Asset -x; debt -x | 0 | Neither |
| Interest | Existing EXPENSE | Paid asset -x, or capitalized CREDIT -x | -x | Expense +x |
| Adjustment | **Absent standalone operation**; proposed explicit signed adjustment Entry | Account balance delta d | d | Proposed no income/expense; requires explicit contract |

Actual MySQL sequence after restoring the initial bank:

| Step | Assets | Debt | Net worth | Monthly income | Monthly expense |
|---|---:|---:|---:|---:|---:|
| Credit purchase 300 | 700 | 300 | 400 | 0 | 600 |
| Bank → credit repayment 300 | 400 | 0 | 400 | 0 | 600 |
| Loan → bank proceeds 500 | 900 | 500 | 400 | 0 | 600 |
| Bank → loan principal 200 | 700 | 300 | 400 | 0 | 600 |
| Bank-paid interest 5 | 695 | 300 | 395 | 0 | 605 |

The 600 expense includes the original bank expense 300 and credit purchase 300; repayment did not add a third expense. Every transfer had exactly two entries summing to zero.

`financeEffectiveRowsForMonth` / `effectiveContribution`, `finance.ts:464`, is shared by Overview, Budget and Report. INCOME signed entries contribute income; EXPENSE entries contribute their negation; REFUND credits reduce expense. REVERSAL interprets the related original type; CORRECTION replacement contributes income/expense by sign. OPENING and TRANSFER contribute neither. Categories validate matching income/expense kind and group results; account type and category labels do not turn repayments into spending.

Cross-month refund/correction adjustments are recognized in their persisted command business month and preserve the original month's history. Thus “monthly actual spending” currently means net ledger expense after refunds/corrections, not gross purchases or cash outflow. Archive does not rewrite that history.

CORRECTION is only available against an existing POSTED INCOME/EXPENSE, reverses the original and posts a replacement that still contributes to flow. It is **not** a generic balance adjustment. OPENING is creation-only; there is no opening edit or independent adjustment route. A future adjustment must not masquerade as income, expense, transfer or correction, and all shared analytics/export consumers must recognize it explicitly.

## BALANCE PRESENTATION

Keep internal signed cents. For CREDIT with -842600 cents, show **待偿还 ¥8,426**, not a negative balance entry burden. Account list and overview already render negative CREDIT as `欠款` with absolute value; transfer already previews debt after repayment. Preserve that behavior and improve account creation, which currently exposes generic signed opening balance without explaining negative debt input.

For a future liability-opening affordance, accept positive owed amount and convert once at the Finance contract boundary to negative opening cents. Do not store both values. Zero means settled; positive CREDIT is prepaid/overpaid credit and contributes assets under the existing contract. Existing Web repayment tests cover before/exact/overpayment states. Overpayment is not negative debt.

Non-CREDIT negative balances are currently allowed and reduce signed assets; neither schema nor UI enforces insufficient funds or credit limits. Whether to classify overdrafts as liabilities is a separate product decision, not part of the archive fix. No claim that all asset balances are necessarily positive is supported by current code.

## WALLET IA

Keep the existing `/finance` route and URL tab model. Smallest additions:

- **Overview:** active-scope assets, owed liabilities, net worth, monthly net expense; retain current income/budget/recurring summaries.
- **Accounts:** Assets / Liabilities / Archived groups within the existing view; owned create/edit/archive/restore actions. Today this is one mixed list with a “show archived” checkbox.
- **Transactions:** existing records, filters and detail; income/expense/transfer actions, with borrowing/repayment wording derived from account direction. Keep refund/correction/void history visible.
- **Wallet Settings:** Finance-specific category configuration and existing Finance maintenance UI.

Existing Budget / Recurring / Reports views are already implemented; retain them without building new budgeting or moving all navigation around. No general navigation framework or whole Wallet redesign is required.

Transfer UI currently labels any positive transfer into CREDIT as repayment, even CREDIT → CREDIT. This is a broad presentation heuristic, not a canonical transaction subtype. Future wording should distinguish generic transfer/borrowing/repayment without changing the underlying two-leg command.

## GLOBAL SETTINGS IMPACT

`apps/web/src/features/settings/index.tsx:293` Wallet topic is **only a link** to `/finance`; it does not duplicate account/category/budget state. It can remain a launcher or later deep-link to Wallet Settings.

The actual Finance-specific interaction in Global Settings is `FinanceDataMaintenance` at line 722, mounted under Data at line 330: Finance JSON backup/export CSV, restore preview/confirmation, external CSV mapping/import confirmation and reconciliation. These can eventually move as Finance-owned private UI into Wallet Settings. Keep the existing Finance maintenance APIs, sensitive explicit actions, preview/confirmation and restore safety contracts. Update the documented public-surface/Settings exception deliberately when that move occurs.

Global Workbench exports, timezone/language/profile preferences and the global AI permission to read Wallet remain Global Settings responsibilities. Do not remove them merely because Wallet is named in their configuration.

## MIGRATION IMPACT

Current repository head: **V41**, 42 ordered SQL files including minor-version migrations. The isolated audit migrated all 42 successfully.

| Future scope | Migration requirement |
|---|---|
| Exclude archived accounts from current overview | **None**; existing archivedAt is sufficient. |
| Assets/liabilities groups, positive owed display/input, loan/repayment actions using CREDIT/TRANSFER | **None** for basic semantics; no stored balance or Debt table. |
| Wallet Settings / maintenance UI ownership move | **None**. |
| Persist distinct investment/loan/installment kinds | **New forward migration needed** for account type constraint/metadata, plus API enums, Web contracts and backup/restore compatibility. Optional, not prerequisite. |
| Persist optional account note/due/minimum/rate/limit | New Account metadata migration if justified. Defer now. |
| Independent ADJUSTMENT | **New forward migration needed** to extend transaction type constraint and define posting/read/analytics/backup semantics. No new balance column or separate ledger. |

Do not modify V28/V29 or any applied migration. Future changes start after the then-current migration head. Existing backup schemaVersion=1, relation validation and enum assumptions require compatibility review whenever new money/account semantics are introduced.

## TEST GAPS

Executed evidence:

| Check | Result |
|---|---|
| Custom authenticated public-API audit on MySQL 8.0.25, fresh V1→V41 schema | PASS assertions for reproduction, archive/restore/history, archived write rejection, credit purchase/repayment, loan/principal/interest and SQL/API enum restrictions. Archive defect remains intentionally unfixed. |
| `npm run test:fin01 -w apps/api` | PASS 8/8; real DB fresh/upgrade, balances, category/account ownership, idempotency/rollback. |
| `npm run test:fin02 -w apps/api` | PASS 9/9; real DB transfers/fees/refunds/reversal/correction/archive. |
| `TZ=UTC npx tsx --test --test-concurrency=1 tests/r3-fin03-budget-recurring-reports.test.ts tests/r3-fin03-edge-cases.test.ts` from apps/api | PASS 11/11; real DB cross-month flow, shared Overview/Budget/Report, recurring and archive rejection. |
| Wallet `index.test.tsx` + `fin03.test.tsx` | PASS 23/23. |
| Web architecture boundary tests | PASS 3/3. |
| Skill architecture checker | 0 errors, 0 warnings; no repository-specific checker config detected. This does not validate economic semantics. |

FIN-01/02 suites also ran API test TypeScript compilation. Full Web suite, full lint/build and browser acceptance were **NOT_RUN**: audit-only changes do not require implementation gates or viewport claims. No unexecuted check is reported PASS.

Coverage to add during implementation:

1. Permanent archive headline regression for both a positive asset and negative CREDIT: excludes from assets/liabilities/net worth, retains balance/history/monthly flow, ordinary picker exclusion and server rejection, restore reinstates totals. Existing FIN-02 test checks retained balance/write rejection but not Overview.
2. Explicit `includeInOverview=false` + archive/restore interactions, zero/positive CREDIT and untouched account eligibility.
3. Permanent loan proceeds → principal → interest integration scenario and UI direction/wording coverage. This audit's temporary scenario is evidence, not a committed regression test.
4. Positive owed opening input, settled/overpaid display and asset/liability/archived grouping; current repayment tests already cover negative/exact/positive balance previews.
5. For adjustment only after specification: signed balance delta, no income/expense contribution, shared Overview/Budget/Report, idempotency/rollback, migration fresh/upgrade, export/restore/reconciliation.
6. Maintenance UI relocation must retain real import/restore flows and existing FIN-04 safety tests. FIN-04 was inspected but **NOT_RUN** in this audit.

Verification environment: inspected repository npm test scripts, `_test` safety guards, Compose MySQL 3307, migration directory and prior isolated native MySQL QA report. Probed 3306/3307/3407/3408/33307; all initially ECONNREFUSED. Reused the established native MySQL 8.0.25 binary in a new temporary datadir listening only on 127.0.0.1:33307. The custom database `workbench_wallet_accounting_audit_test` and suite-created fresh/upgrade databases were disposable; no production/development database was accessed. Temporary scripts, JSON evidence and logs were held outside the repository. Cleanup drops the audit database and stops/removes the temporary service/data.

## IMPLEMENTATION SLICES

| Order | Slice | Independent acceptance |
|---|---|---|
| 1 | **ARCHIVED-ACCOUNT-CURRENT-STATE** | Finance Overview excludes archived asset/debt balances consistently; history/monthly flow/restore preserved; real DB and Web archive regression. No schema change. |
| 2 | LIABILITY-ACCOUNT-SURFACE | Reuse CREDIT; Assets/Liabilities/Archived grouping, positive owed opening/display and settled/prepaid states. No second money truth or mandatory subtype fields. |
| 3 | LIABILITY-TRANSFER-FLOW | Loan proceeds / principal repayment / credit repayment wording and actions use existing TRANSFER; interest remains EXPENSE; end-to-end analytics evidence. |
| 4 | WALLET-SETTINGS-OWNERSHIP | Move existing Finance maintenance/category configuration into Finance UI, preserve APIs and safe flows, Global Settings deep-links. Update durable architecture owner contract. |
| 5 | BALANCE-ADJUSTMENT-CONTRACT | Separate optional slice after explicit product semantics; new transaction type and forward migration, append-only signed delta excluded from income/expense. |

Distinct debt/investment subtypes and billing metadata are deferred, not mandatory closure work. No bank sync, amortization, portfolio analytics, Save Point or unrelated closed-slice changes.

## ARCHITECTURE CONFORMANCE

Finance remains the sole canonical ledger/calculation owner; Web consumes its projections, and AppShell stays route composition only. No global financial store, debt domain, balance mirror or shared generic import layer is proposed. Existing command receipts, ownership checks, locks, optimistic versions and append-only history remain intact.

Verified documentation drift: `docs/ARCHITECTURE.md:546` FIN-01 says balance sums Entries whose transaction is POSTED. Actual `financeAccountsForUser` has no status filter; FIN-02 preserves original Entries and appends negating reversals. Real correction/void tests pass with the latter model. Adding a POSTED filter now would exclude originals while retaining their reversals and miscount balances. When implementing the first slice, clarify the current all-Entry balance contract together with active overview eligibility; do not “fix” code to match the stale historical sentence. This audit leaves the architecture file untouched.

The existing includeInOverview behavior and investment/liquidity distinctions are product-scope questions recorded above; they are not silently resolved by a local bug fix. The proposed Settings ownership move also requires a deliberate documentation update in its own implementation slice.

## NEXT ACTION

Implement exactly **PRODUCT-CLOSURE-02 / ARCHIVED-ACCOUNT-CURRENT-STATE** first: add the archive eligibility condition to the Finance-owned current Overview calculation, preserve includeInOverview/history/Entry balances/monthly flow, add asset and liability archive/restore regressions, clarify the architecture contract, and verify against isolated real MySQL. No liability redesign or adjustment migration in that first slice.
