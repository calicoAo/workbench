# WB-R3-FIN-01-CORE-LEDGER-001

Date: 2026-09-22  
Branch: `codex/workbench-auth-system`  
Baseline HEAD: `e312009cee1d4ee83782e66da26d65695f78d79e`

## 1. Executive summary

FIN-01 now has an independent CNY ledger with four owned facts: `finance_accounts`, `finance_categories`, `finance_transactions`, and `finance_entries`. Account balances and overview totals are derived from signed entries joined to POSTED transactions; `finance_accounts` has no mutable balance column. Workbench rewards, task lifecycle, stock review, Agent Wallet, and payment execution remain outside Finance.

The schema, account/category workflows, opening balance, income, expense, idempotency, timezone snapshots, API, and responsive UI passed focused tests and real-browser acceptance. The repository-wide Web suite passes. The default repository-wide API command reports 92/94 because two pre-existing R2C Habit tests hard-code 2026-09-21 as "today"; on 2026-09-22 they fail before exercising Finance. The R2C suite passes 8/8 when run at its fixture date. No R2C production or test code was changed in this work package.

Result: `PASS_WITH_BLOCKERS`. FIN-02 should wait until the default API suite has a deterministic clock and passes without an override.

## 2. Scope and architecture

- API domain owner: `apps/api/src/finance.ts`.
- Transport owner: `apps/api/src/routes/finance.ts`.
- Persistence mapping: `apps/api/src/db/schema.ts`; forward migration: `db/migration/V28__add_finance_core_ledger.sql`.
- Web owner: `apps/web/src/features/finance/`; AppShell only registers `/finance`, navigation, and the existing Quick Action launchers.
- Public contracts are recorded in `docs/openapi.yaml`; durable ownership and dependency decisions are recorded in `docs/ARCHITECTURE.md`.
- Money crosses the API as canonical integer-cent strings, is stored in signed MySQL `BIGINT`, and is formatted with `BigInt` on the Web. No JavaScript floating-point accumulation is used.
- FIN-02 semantics were not added: no transfer, refund, reversal, adjustment, budget, recurring transaction, import, AI, Growth, payment, or Agent Bridge behavior.

## 3. Migration and schema

`V28__add_finance_core_ledger.sql` is the only new migration. Existing migrations were not renamed or edited. In particular, V27 remained byte-identical during this task (`git hash-object`: `bf70a9eb8c7f5708181527b9d6092b3f14b436c1`).

| Table | Canonical responsibility | Key constraints |
| --- | --- | --- |
| `finance_accounts` | Account metadata only | user ownership, CNY, CASH/BANK/PAYMENT/CREDIT, optimistic `version`; no balance column |
| `finance_categories` | Finance-only INCOME/EXPENSE taxonomy | unique `(user_id, kind, name)`, enabled/sort/version |
| `finance_transactions` | Posted action header and historical date/time snapshot | OPENING/INCOME/EXPENSE, POSTED, manual source, category shape checks |
| `finance_entries` | Signed money fact | user/account/transaction composite FKs, non-zero amount, one account entry per FIN-01 transaction |

Migration verification used real MySQL 8.0.25:

- Fresh V1-V28 application: PASS.
- Production-like V27 to V28 upgrade: PASS; pre-existing data preserved by the integration test.
- Fresh isolated database contained 39 tables and zero `finance_accounts.balance` columns.
- The focused migration test is part of the 8/8 FIN-01 API suite.

## 4. Domain semantics

### Accounts and opening

Account creation uses `runMutation`. A non-zero opening balance writes the account, one OPENING transaction, one signed entry, and the mutation receipt in one database transaction. Zero opening balances do not create fake entries. Opening amounts are creation-only in FIN-01; the UI and API do not offer an in-place opening rewrite.

Account metadata updates use `expectedVersion`; stale edits return 409. Archive preserves all entries and historical reads while rejecting new transactions. `includeInOverview` controls inclusion independently of archive so archiving an account cannot silently erase a real balance from net worth.

### Categories

Finance categories are independent of Task categories. Initialization is an explicit idempotent POST and seeds nine expense categories (`餐饮`, `交通`, `购物`, `居住`, `娱乐`, `健康`, `学习`, `社交`, `其他`) and four income categories (`工资`, `奖金`, `副业`, `其他收入`). No refund category is created. Disabled categories remain readable on historical transactions and are rejected for new transactions.

### Transactions and entries

- INCOME requires a positive input amount and an enabled INCOME category, then writes a positive entry.
- EXPENSE requires a positive input amount and an enabled EXPENSE category, then writes a negative entry.
- Asset accounts may become negative; there is no insufficient-balance rejection.
- CREDIT expenses create a negative balance. The overview exposes its absolute value as liability, and the UI labels it `欠款 ¥X`.
- New transactions snapshot the user's current timezone into `recordTimezone` and persist `businessDate`; later preference changes do not reattribute history.
- Amount/category/account/type remain immutable after posting in FIN-01. A note-only optimistic metadata API is available; correction and void behavior are deferred to FIN-02.

### Derived reads

Every account balance is `SUM(finance_entries.amount_cents)` over POSTED transaction rows. Monthly income and expense are grouped by persisted `business_date` and transaction type; OPENING is excluded. Overview rules are returned by the API:

- Assets: signed CASH/BANK/PAYMENT balances plus positive CREDIT balances.
- Liabilities: absolute value of negative CREDIT balances.
- Net worth: signed sum of all included account balances.

Browser evidence data independently produced: assets `159550`, liabilities `10000`, net worth `149550`, monthly income `50000`, monthly expense `13000` cents. Direct SQL produced the same values and confirmed zero mutable balance columns.

## 5. Mutation identity and rollback

Account-with-opening, income, expense, and initialization reuse `mutation_receipts` through `runMutation`.

- Same operation ID and same fingerprint replays the original result without a second transaction or entry.
- Same operation ID with changed input returns 409.
- A forced entry-insert failure leaves no transaction and no receipt.
- Account, category, transaction, entry, and receipt writes share the same transaction boundary.
- Foreign-user account/category references return not found; category-kind and enabled checks occur inside the command transaction.

## 6. API and UI

Implemented routes:

- `POST /api/finance/initialize`
- `GET /api/finance/overview`
- `GET|POST /api/finance/accounts`; `PUT /api/finance/accounts/:id`
- `GET|POST /api/finance/categories`; `PUT /api/finance/categories/:id`
- `GET /api/finance/transactions`; `GET|PUT /api/finance/transactions/:id`
- `POST /api/finance/income`; `POST /api/finance/expenses`

`/finance` provides Overview, Accounts, and Transactions tabs. Overview includes privacy toggle, net worth/assets/liabilities, monthly flows, recent transactions, and account summary. Accounts supports create, creation-time opening, safe metadata edit, archive, and category management. Transactions supports date range, account, category, type, and note filters plus detail. The existing unified Quick Action contains `记一笔支出` and `记一笔收入`; no second FAB was added.

## 7. Browser acceptance

Acceptance ran against an isolated V1-V28 MySQL database, API on port 3010, Web on port 5180, and headless Chrome via CDP. No existing 3000/5173 process or its data was changed.

| Evidence | Result |
| --- | --- |
| `WB-R3-FIN01-overview-1440.png` | 1440 content width, no overflow; correct totals, five recent rows, three account summaries |
| `WB-R3-FIN01-accounts-1440.png` | three derived balances; CREDIT is `欠款 ¥100.00`; no mutable balance input |
| `WB-R3-FIN01-transactions-1440.png` | five rows; date/account/category/type/note controls visible |
| `WB-R3-FIN01-expense-375.png` | document width 375; modal x=13..362; amount/category/account and CTA visible; no horizontal overflow |
| `WB-R3-FIN01-quick-action-375.png` | both Finance actions present; menu bottom 746, bottom-nav top 748; no overlap |

No Budget, Transfer, Recurring, Import, or AI Finance entry point was present.

## 8. Test and verification ledger

| Command | Result | Count / evidence |
| --- | --- | --- |
| `npm run test:fin01 -w apps/api` with isolated MySQL | PASS | 8/8, 0 skipped/TODO |
| `npm test -w apps/web -- --run src/features/finance/index.test.tsx` | PASS | 12/12 |
| `npm test -w apps/web -- --run` | PASS | 118/118 across 21 files |
| `npm run typecheck` | PASS | API + Web |
| `npm run lint` | PASS | API + Web |
| `npm run build` | PASS | API + Web; Vite reports only the existing >500 kB chunk advisory |
| `node .../architecture-check.mjs --root .` | PASS | 0 errors, 0 warnings |
| Ruby parse of `docs/openapi.yaml` | PASS | valid YAML |
| `git diff --check` | PASS | no whitespace errors |
| `npm test -w apps/api` with isolated MySQL | BLOCKED | 92/94; two R2C date-fixture failures, FIN-01 8/8 within the same run |
| R2C Habit suite at its fixture clock (2026-09-21) | PASS | 8/8, confirming no Finance regression in that domain |

The default API failures are:

1. `daily and weekday expectations derive pending...`: the fixture expects 2026-09-21 to be PENDING, but the run date is 2026-09-22, so production correctly returns MISSED.
2. `future rule and goal revisions...`: it attempts to create an effective revision on 2026-09-21, which is now in the past; the follow-on assertion dereferences the rejected result.

These tests directly call `new Date()` through `apps/api/src/habits.ts` and have no dependency on Finance tables, routes, or services. They require a deterministic test clock or dates derived from the test clock. This task deliberately did not edit R2C behavior or its WIP tests.

## 9. Required coverage matrix

| Requirement | Evidence | Status |
| --- | --- | --- |
| Opening 1000 CNY derives 100000 cents | API integration + SQL | PASS |
| OPENING excluded from monthly flow | API integration | PASS |
| Bank 1000 - expense 30 = 970 | API integration | PASS |
| Income 500 adds 500 | API integration | PASS |
| CREDIT expense 100 => balance -100 and liability 100 | API integration + browser | PASS |
| No account balance truth | schema introspection + V28 | PASS |
| Replay single-counts transaction/entry | API integration | PASS |
| Changed operation payload => 409 | API integration | PASS |
| Entry failure rolls transaction/receipt back | forced-trigger integration | PASS |
| Foreign ownership rejected | API integration | PASS |
| Disabled category history/read vs new write | API integration | PASS |
| Historical timezone/business date stable | API integration | PASS |
| Stale account/category version => 409 | API + Web tests | PASS |
| Finance route, account, income/expense, refresh | 12 Web tests | PASS |
| Failed mutation preserves form; 409 visible | Web tests | PASS |
| Mobile quick record and 375 layout | Web tests + browser evidence | PASS |

## 10. Blockers and next action

- Blocker: the default complete API suite is not calendar-deterministic and currently fails two R2C tests. Fix the R2C test clock/fixtures in its owning work package, then rerun `npm test -w apps/api` on an isolated V1-V28 database.
- No Finance schema or behavior blocker was found.
- Do not start FIN-02 until the default full API command passes; then the FIN-01 gate can be promoted from `PASS_WITH_BLOCKERS` to `PASS` without changing the Finance implementation.
- V28 must remain forward-only. Do not modify V1-V27 or add repair/rewrite behavior.

## 11. Gate

```text
FINANCE_SCHEMA:
PASS

FINANCE_ACCOUNT:
PASS

FINANCE_CATEGORY:
PASS

OPENING_BALANCE:
PASS

INCOME:
PASS

EXPENSE:
PASS

ENTRY_DERIVED_BALANCE:
PASS

FINANCE_IDEMPOTENCY:
PASS

FINANCE_TIMEZONE:
PASS

FINANCE_UI:
PASS

MOBILE_QUICK_RECORD:
PASS

R2_REGRESSION:
BLOCKED

FIN01_GATE:
PASS_WITH_BLOCKERS

READY_FOR_FIN02:
NO
```
