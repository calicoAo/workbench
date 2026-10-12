# PRODUCT-CLOSURE-02 / LIABILITY-ACCOUNT-SURFACE

Date: 2026-10-11

## RESULT

**PASS — LIABILITY-ACCOUNT-SURFACE COMPLETE.**

Users create ordinary CREDIT liabilities with positive amounts owed. Accounts have explicit Assets, Liabilities and optional Archived groups. Signed Entry balances, Finance-owned totals, account identities, inclusion preferences and historical records retain their existing semantics.

## CURRENT ACCOUNT MODEL

The existing account types remain CASH, BANK, PAYMENT and CREDIT. CREDIT is the existing model for a named credit card, personal loan or installment debt; these examples introduce no persisted subtype.

Audit traced the Finance page, private Accounts and AccountDialog components, model money adapters, Overview, authenticated account routes, Finance commands, SQL schema, i18n and existing tests:

- `AccountDialog.submit` was the existing yuan-to-signed-cents boundary: `decimalToCents(draft.openingBalance)` inside the creation payload.
- Finance account creation atomically inserts the account, optional nonzero OPENING Transaction/Entry and receipt. The server already accepts negative CREDIT opening amounts.
- Account balances are SQL sums of signed Entries. There is no Account balance column.
- The existing account editor is the account detail/settings surface. Its metadata command accepts version, name and inclusion preference; type and opening amount are not editable.
- Finance Overview owns assets, liabilities, net worth and monthly flows. Eligibility remains active plus included; positive CREDIT balances contribute to assets.
- Before this slice, the list mixed account types and archive states, creation required signed-ledger knowledge, and zero/positive CREDIT balances lacked settled/prepaid labels.

## ACCOUNT GROUPING

| Group | Membership |
| --- | --- |
| 资产账户 | Active CASH, BANK and PAYMENT |
| 负债账户 | All active CREDIT, including zero and prepaid balances |
| 已归档账户 | All archived types, when the existing 显示已归档 toggle is enabled |

Grouping derives directly from returned account type/archive metadata during rendering. Balance sign and `includeInOverview` do not change group membership. Empty groups have a lightweight empty message. The liability group explains: “信用卡、借款等统一作为负债账户管理。”

## CREDIT CREATION

CREDIT's type label is “负债 / 信用账户”. The form provides a credit-card/personal-loan name example, “当前欠款（元）” input and “输入当前欠款金额即可，无需填写负数。” helper.

The user enters a nonnegative amount owed. Negative amounts and amounts beyond two decimal places produce a recoverable validation error without a write. Zero remains a valid settled account creation. Switching type resets the amount draft to `0.00`, updates the label/helper and uses the final selected type's conversion, while preserving name/date/inclusion drafts.

## SIGN CONVERSION

Conversion remains in the existing Finance creation submit boundary:

```text
CREDIT input 3200 yuan
→ decimalToCents: "320000"
→ one BigInt negation: "-320000"
→ existing account-create command
→ one OPENING Transaction + one negative Entry
```

No floating-point money arithmetic or global CREDIT sign inversion was introduced. CASH/BANK/PAYMENT retain both positive and negative opening-balance semantics. Existing-account updates do not execute the creation conversion.

## NEGATIVE / ZERO / POSITIVE CREDIT PRESENTATION

| Returned CREDIT balance | Account presentation |
| --- | --- |
| Negative | Positive amount owed: 欠款 ¥3,200.00 |
| Zero | 已结清 |
| Positive | Positive prepaid amount: 预存 ¥125.00 |

One Finance-private formatting helper serves Accounts, Overview account rows and the editor's read-only current balance. It formats returned facts and does not calculate totals. Amount privacy masking is preserved. Non-CREDIT signed balances retain ordinary currency formatting.

## ARCHIVED ACCOUNT BEHAVIOR

Archived assets and liabilities appear only in Archived, with their original identity, type, balance and inclusion preference. Existing archive/restore commands and query invalidation remain in their established owner. Restored CREDIT returns to Liabilities, even when prepaid; restored non-CREDIT returns to Assets.

Existing posting selectors still exclude archived accounts, and the API still rejects new ordinary postings to them. Historical transactions remain readable. The already-closed archive calculation contract was not changed.

## EXISTING ACCOUNT SAFETY

Saving metadata sends only `expectedVersion`, `name` and `includeInOverview`. No opening balance, current balance or type is sent. The account detail displays the returned current balance read-only.

Permanent tests cover negative, zero and positive CREDIT metadata updates, plus negative non-CREDIT. Real browser/API/MySQL acceptance renamed an existing prepaid CREDIT and compared every Transaction/Entry before and after: unchanged. Its positive `12500` cents balance was retained. Archiving/restoring the newly created debt likewise left every Transaction/Entry unchanged.

## TESTS

| Verification actually run | Result |
| --- | --- |
| Focused Finance Web: existing Finance, liability account and FIN-03 tests | 51 passed |
| Full Web suite, rerun after the mobile layout fix | 30 files, 257 tests passed |
| Existing real-MySQL archive/current-state suite | 5 passed |
| Existing real-MySQL FIN-01 suite, including its fresh/upgrade migration coverage | 8 passed |
| Actual public UI → API → MySQL CREDIT creation | One OPENING Entry at `-320000` cents; public history reports OPENING with the same amount |
| Actual prepaid metadata edit and debt archive/restore | Full ledger snapshots unchanged; inclusion and balances preserved |
| API/Web typecheck | PASS |
| API/Web lint and i18n audit | PASS; missing messages 0, untranslated English 0, visible Chinese 0 |
| Production API/Web build, after the mobile layout fix | PASS |
| Engineering architecture checker | 0 errors, 0 warnings |
| `git diff --check` | PASS |

Permanent Web regressions cover all twelve requested account cases: three-way grouping, positive owed creation and exact negative payload, all three non-CREDIT types with both signs, type switching, CREDIT's three balance states, archive/restore grouping, independent inclusion, metadata safety and privacy masking. The permanent CDP browser script covers actual desktop/mobile account layout and database-backed creation/edit/archive acceptance.

### Browser evidence

Chrome used a fresh isolated profile and the repository's established CDP approach. CSS viewports were explicitly set and asserted at **1440 × 1000** and **375 × 812**; page scroll width equaled viewport width. Account edit controls remain inside their rows and have 44px touch targets on mobile. Public onboarding/welcome controls were dismissed before account acceptance.

Visual review found mobile grid auto-placement putting the account edit button on a separate row. The smallest Finance-scoped correction pins that button beside account identity on mobile. The browser assertion now checks that placement, and the final screenshots were inspected after transitions settled. No shared Button/IconButton behavior changed.

- [Desktop account groups](WB-PRODUCT-CLOSURE-02-LIABILITY-ACCOUNT-accounts-1440.png)
- [Mobile account groups](WB-PRODUCT-CLOSURE-02-LIABILITY-ACCOUNT-accounts-375.png)
- [Mobile liabilities: owed, settled and prepaid](WB-PRODUCT-CLOSURE-02-LIABILITY-ACCOUNT-liabilities-375.png)
- [Desktop CREDIT creation](WB-PRODUCT-CLOSURE-02-LIABILITY-ACCOUNT-create-1440.png)
- [Mobile CREDIT creation](WB-PRODUCT-CLOSURE-02-LIABILITY-ACCOUNT-create-375.png)
- [Mobile archive group and restored debt](WB-PRODUCT-CLOSURE-02-LIABILITY-ACCOUNT-archived-375.png)
- [Browser/API/SQL assertions](WB-PRODUCT-CLOSURE-02-LIABILITY-ACCOUNT-browser.json)

Real-DB acceptance reused the established isolated native MySQL 8 convention at `127.0.0.1:33307`, after probing repository-known service candidates. The browser database `workbench_liability_surface_test` applied all **42 migrations through V41**. Integration suites created/dropped their own disposable `_test` databases. The browser database was dropped, final inventory contained only MySQL system schemas, and temporary API/Web/MySQL/Chrome processes, datadir, browser profile and QA token file were cleaned up. Logs remain in `/tmp/workbench-liability-Xj1eZV`.

### Commands

```sh
# Repository root
npm test -w apps/web -- src/features/finance/index.test.tsx src/features/finance/liability-accounts.test.tsx src/features/finance/fin03.test.tsx
npm test -w apps/web
npm run typecheck
npm run lint
npm run build
node /Users/lijingru/.codex/skills/engineering-architecture/scripts/architecture-check.mjs --root /Users/lijingru/Developer/workbench --json
git diff --check

# apps/api; TEST_DATABASE_URL pointed only at the isolated service
TZ=UTC npx tsx --test --test-concurrency=1 tests/finance-archived-current-state.test.ts tests/r3-fin01-core-ledger.test.ts

# Fresh disposable database/API/Web/Chrome; QA user's token supplied via environment
node scripts/liability-account-browser-evidence.mjs
```

## ARCHITECTURE CONFORMANCE

Finance API remains the owner of account truth, signed Entries, exact money, Overview calculations and archive/restore. Web Finance's existing private account components own grouping, form interaction, command adaptation and labels. `FinancePage` only adds the existing privacy flag to its account editor composition. AppShell and public feature surfaces gain no liability logic.

No new account type, schema/migration, persisted balance, debt domain, global store, endpoint or duplicated query truth was introduced. Loans/installments remain names on CREDIT accounts. Interest, reminders, limits, adjustment transactions, repayment/transfer changes, Settings relocation and visual migration remain outside this slice.

Architecture review found no durable ownership/API/dependency change requiring an architecture-document update. Pre-existing Task lifecycle, AppShell and prior archive-slice workspace changes were preserved; their dirty files are not new changes belonging to this slice.

## REMAINING BLOCKERS

NONE. Required integration and visual verification ran successfully.
