# PRODUCT-CLOSURE-02 / ARCHIVED-ACCOUNT-CURRENT-STATE

## RESULT

**PASS — ARCHIVED-ACCOUNT-CURRENT-STATE COMPLETE**

Finance Overview consistently excludes archived assets and liabilities. Finance remains the calculation owner; Web consumes its projection and explains the scope in the existing Overview and Account editor. This slice adds no schema, migration, account type, balance cache or financial workflow.

## ROOT CAUSE

`financeOverviewForUser` reads all accounts but previously filtered only `includeInOverview`. Account lists and active account counts recognized archive state while headline totals did not. Before changing production code, the new authenticated real-MySQL asset regression failed: after archive, assets/net worth were still `70000` cents instead of `0`.

FIX: one guard in the existing Finance Overview aggregation excludes archived accounts before any asset/liability/net-worth contribution. Projection rule descriptions and two existing UI surfaces now explain eligibility.

REGRESSION_RISK: CREDIT sign handling, explicit inclusion preferences and historical monthly calculations could be affected by a broader account filter. The guard is local to current headline aggregation, and real-DB assertions cover these adjacent behaviors.

## BEFORE FORMULA

Eligible accounts: `includeInOverview === true`, including archived accounts.

Assets = signed non-CREDIT balances + positive CREDIT balances.
Liabilities = absolute values of negative CREDIT balances.
Net worth = signed sum of eligible account balances.

## AFTER FORMULA

Eligible accounts: `archivedAt === null && includeInOverview === true`.

The existing signed formulas apply to this eligible set. These are scoped current Overview totals. Exclusion from Overview does not extinguish a real balance or liability.

## ASSET ARCHIVE/RESTORE

Verified through authenticated public API requests against MySQL:

| State | BANK balance | Current assets | Current net worth | Monthly expense |
| --- | ---: | ---: | ---: | ---: |
| Opening 1000 minus expense 300 | 700 | 700 | 700 | 300 |
| Archived | 700 | 0 | 0 | 300 |
| Restored | 700 | 700 | 700 | 300 |

The archived account remains readable through the existing archived/all account views and transaction history/detail.

## LIABILITY ARCHIVE/RESTORE

With BANK 1000 and CREDIT -500:

| State | CREDIT balance | Current assets | Current liabilities | Current net worth |
| --- | ---: | ---: | ---: | ---: |
| Active | -500 | 1000 | 500 | 500 |
| CREDIT archived | -500 | 1000 | 0 | 1000 |
| CREDIT restored | -500 | 1000 | 500 | 500 |

CREDIT negative, zero and positive balances retain their existing liability/settled/asset treatment. Signed negative non-CREDIT balances also retain their existing treatment.

## INCLUDE-IN-OVERVIEW SEMANTICS

| Archive state | Inclusion preference | Contributes |
| --- | --- | --- |
| Active | Included | Yes |
| Active | Excluded | No |
| Archived | Included | No |
| Archived | Excluded | No |
| Restored | Included | Yes |
| Restored | Excluded | No |

The real-DB regression exercises all six combinations through existing versioned account update/archive/unarchive commands. Archive and restoration preserve the user's inclusion preference.

## HISTORICAL DATA SAFETY

Full ordered Transaction/Entry row snapshots are identical before and after archive/restore. Account identity and Entry-derived balance persist. Transaction lists/details and monthly income/expense, Budget and Report projections remain unchanged. No compensating or zeroing Entry is created.

Archived accounts still reject new income, expense and transfers in either direction with HTTP 409 and no ledger mutation. Web selectors omit archived accounts while retaining active accounts excluded from Overview.

## TESTS

All requested checks ran and passed; no required test was skipped.

| Check | Result |
| --- | --- |
| New archive/current-state MySQL integration | 5 passed; covers acceptance A–G |
| FIN-01 MySQL | 8 passed, including existing fresh/upgrade migration checks |
| FIN-02 MySQL | 9 passed, including existing fresh/upgrade migration checks |
| FIN-03 Budget/Recurring/Reports and edge cases MySQL | 11 passed |
| Focused Finance Web | 27 passed across 2 files |
| Full Web | 233 passed across 29 files |
| API/Web typecheck | PASS |
| API test typecheck | PASS through FIN-01/FIN-02 scripts |
| Lint / i18n audit | PASS; missing/untranslated/visible Chinese all 0 |
| API/Web production build | PASS |
| Engineering architecture checker | 0 errors, 0 warnings |
| `git diff --check` | PASS |

Database setup used an isolated native MySQL 8 instance on `127.0.0.1:33307` after probing known local candidates. The new suite creates its own `_test` database and applies all 42 current migration files through V41. Existing FIN-01/FIN-02 retain their established migration test ranges; FIN-03 also applies all current migrations. Suites drop their databases; final inventory contained only MySQL system schemas. The temporary MySQL process was stopped and its datadir removed. Verification logs remain in `/tmp/workbench-wallet-archive-KFLlhT`.

Commands run from repository root unless indicated:

```sh
# DB-backed commands used TEST_DATABASE_URL pointing at the isolated test service.
# From apps/api:
TZ=UTC npx tsx --test tests/finance-archived-current-state.test.ts
TZ=UTC npx tsx --test --test-concurrency=1 tests/r3-fin03-budget-recurring-reports.test.ts tests/r3-fin03-edge-cases.test.ts
# From repository root:
npm run test:fin01 -w apps/api
npm run test:fin02 -w apps/api
npm test -w apps/web -- src/features/finance/index.test.tsx src/features/finance/fin03.test.tsx
npm test -w apps/web
npm run typecheck
npm run lint
npm run build
node /Users/lijingru/.codex/skills/engineering-architecture/scripts/architecture-check.mjs --root /Users/lijingru/Developer/workbench --json
git diff --check
```

## ARCHITECTURE DOCUMENTATION

`docs/ARCHITECTURE.md` now states the established ledger reality: balances sum all signed Entries, including original and appended reversal/correction Entries; filtering that sum by Transaction status is incorrect. The FIN-01 Overview contract also specifies active + included eligibility, scoped totals, restoration and historical analytics independence.

The architecture delta stays within Finance's existing command/query owner and Web Finance's existing presentation surfaces. Existing Task lifecycle edits in the workspace were preserved and are outside this slice.

## REMAINING BLOCKERS

NONE.
