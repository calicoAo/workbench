# PRODUCT-CLOSURE-02 / WALLET-SETTINGS-OWNERSHIP

2026-10-11 · Approved implementation · baseline HEAD `ef8eb879` with existing uncommitted work preserved.

## RESULT

**PASS — WALLET-SETTINGS-OWNERSHIP COMPLETE**

Two approved slices are implemented. Slice 1 was independently verified with focused Web tests, FIN-04 real MySQL and real browser acceptance before Slice 2 began. Final combined verification passed. Finance ledger/archive/liability policy, API contracts and migrations were not changed by this work package.

## SLICE 1 — FINANCE MAINTENANCE RELOCATION

The existing maintenance workflow moved from Settings into private `apps/web/src/features/finance/maintenance.tsx`. FinancePage composes the seventh URL-backed tab. JSON backup, CSV export, CSV header mapping/staging/confirmation, restore preview/confirmation and read-only reconciliation remain available. No maintenance framework or public cross-feature workflow export was introduced.

Finance maintenance is available independently of account/category loading and initialization. The private workflow owns its files, parsed payloads, previews, pending state, notices, confirmations and retry behavior. Selecting a new restore file clears the old valid preview before parsing, preventing an invalid replacement file from leaving a stale confirmable backup.

## SLICE 2 — SETTINGS NAVIGATION CLEANUP

Wallet was removed from Settings' desktop topic list and mobile topic selector. AppShell's SettingsRoute performs replace compatibility navigation for `topic=wallet`. Settings Data now says **工作台数据导出** and retains only cross-domain exports, Search/Trash and an informational **钱包数据维护** link.

## OWNERSHIP BEFORE / AFTER

| Concern | Before | After |
| --- | --- | --- |
| Finance file/preview/confirmation/retry UI | Settings private workflow | Finance private maintenance workflow |
| Finance ledger, import, restore and validation authority | Finance API | Finance API |
| Workbench exports and AI permissions | Global Settings | Global Settings |
| Finance navigation | Existing Finance URL tab model | Same model with seventh tab |
| Legacy Wallet Settings compatibility | Wallet launcher topic | AppShell routing-only replace |
| Integer-cents presentation | Finance public formatter exception for Settings | Finance-private formatter; obsolete export removed |

## WALLET TAB / URL BEHAVIOR

Canonical route: `/finance?tab=maintenance`. Overview, Accounts, Transactions, Budgets, Recurring and Reports remain. Accounts and category management retain their existing Accounts placement. Finance tab selection preserves existing query parameters; direct entry, reload and browser Back/Forward were exercised.

Legacy `/settings?topic=wallet&date=2026-09-19&format=csv&tab=maintenance` replaces with `/finance?date=2026-09-19`. Settings-only parameters are discarded. Missing, malformed and impossible calendar dates fall back to `/finance`; AppShell's established user-timezone date composition may then add the current business date. Tests cover malformed input, `2026-02-30` and `2026-99-99`. No second navigation state or redirect loop was added.

**Existing issue retained separately:** AppShell's date-picker handler can drop non-date parameters, including a Finance tab. Global date routing was not reconstructed in this slice.

## EMPTY-DOMAIN RESTORE ACCESS

Real browser acceptance verified a fresh authenticated user had zero Finance accounts and categories, no initialization control on maintenance, and no previous-user upload or preview. Uploading the downloaded Finance backup, receiving a valid preview and explicitly confirming restored four transactions. Visiting maintenance itself does not initialize, export, import, restore or reconcile.

## IMPORT / EXPORT / RESTORE SAFETY

- Sensitive Finance JSON/CSV downloads still require explicit confirmation and use the existing audited POST endpoints. Opening maintenance triggers no download.
- CSV preview stages rows without posting. The existing mapping, user timezone, source filename/fingerprint and row classification are preserved; amounts render with the Finance integer-cents formatter.
- Confirmation retains **`allowPossibleDuplicates: true`**. The browser fixture imported two eligible rows, skipped one exact duplicate, identified one possible duplicate and retained one invalid row. Re-staging the same file did not post transactions. FIN-04 verifies source/operation idempotency and correction/retry after partial failure.
- Restore remains preview-first and empty-domain-only; confirmation-time revalidation, relation remapping, atomicity, conflicts and rollback remain Finance API responsibilities. Real browser evidence rejects a populated destination and restores the fresh destination.
- Reconciliation remains an explicit read-only command. Browser SQL assertions verify the entry count is unchanged.

**Future policy review:** possible-duplicate opt-in remains unchanged; whether to expose a different user choice requires a separate approved policy decision.

## AUTH ISOLATION

The maintenance component is keyed by authenticated user ID. Unmount/user switch clears file inputs and all local workflow state. Guards discard late file reads before issuing previews and discard previous-user request completions before displaying drafts, errors, downloads or refresh callbacks. Focused tests cover direct user switching, late file reads and late rejected requests; real browser acceptance covers switching to a fresh user and confirms the previous restore preview/file is absent.

## CACHE INVALIDATION

Successful import/restore invokes Finance's existing refresh mechanism. It invalidates user-scoped Overview, Accounts, Categories, Transactions, Budgets, recurring templates, recurring occurrences and Reports queries. The old generic `finance-recurring` invalidation did not match the actual queries; the refresh now names both real recurring query families. Regression tests assert those cached queries actually become invalidated, not just that an invalidation method was called.

Real browser navigation to Accounts after both import and restore displays the refreshed `-¥80.00` balance without a manual page reload.

## GLOBAL SETTINGS AFTER CLEANUP

Language, timezone, profile/general settings, appearance, global AI permissions including `allowWallet`, existing Hero/Adventure/Writing/Growth topics and workbench exports remain. Data retains Projects, Tasks, Habits, Writing, Calendar/time, Rewards, Sleep/Water exports, the include-trash control, Search and Trash. It contains no Finance upload, staging, backup, restore or reconciliation workflow. A real Task export produced `personal-workbench-tasks.json` with the expected domain, includeTrash flag and records.

## BROWSER / MOBILE ACCEPTANCE

The existing `scripts/fin04-browser-evidence.mjs` now uses Wallet maintenance. It binds actual files through CDP, accepts native confirmation dialogs, checks actual downloads, verifies SQL ledger invariants and performs public UI navigation. Unrelated onboarding/Daily Welcome is dismissed through its public controls; screenshots reject obstructing welcome overlays.

**PASS: 1440×900 and 375×812 CSS viewports.** The script asserts dimensions and horizontal overflow. Mobile action labels fit, the import confirmation button is above bottom navigation, maintenance FAB is hidden and other Finance tabs retain their prior FAB behavior. The mobile Settings topic selector is visible and usable. Screenshots were visually reviewed.

Evidence is in [the browser result](WB-PRODUCT-CLOSURE-02-WALLET-SETTINGS-OWNERSHIP-evidence/browser.json), with nine screenshots under the same directory. Desktop/mobile Finance previews and desktop/mobile Settings Data were reviewed against the real viewports.

## REAL MYSQL TESTS

| Verification | Result |
| --- | --- |
| FIN-04 `npm run test:fin04 -w apps/api` | **5 passed, 0 failed, 0 skipped** |
| FIN-01 `npm run test:fin01 -w apps/api` | **8 passed, 0 failed, 0 skipped** |
| Fresh QA migration | Current V41 head, 42 migrations applied |
| Real browser import/export/restore/reconciliation | **PASS** |

Established native MySQL 8.0.25 verification was reused after probing known local test ports. A task-only loopback instance at 33307 hosted fresh disposable `_test` schemas; the API suites created/dropped their own test databases. Browser API and Web processes used isolated ports 3014/5184 and a temporary Chrome profile on CDP 9334. No development or production database was used.

The browser QA database was dropped; remaining databases were only `information_schema`, `mysql`, `performance_schema`, `sys`. API, Web, Chrome and MySQL were stopped; all four ports were asserted closed. Temporary database files, browser profile and uploaded/downloaded payloads were removed. [Cleanup evidence](WB-PRODUCT-CLOSURE-02-WALLET-SETTINGS-OWNERSHIP-evidence/cleanup.json).

## OTHER TESTS

| Command/check | Final result |
| --- | --- |
| Focused Finance/maintenance/FIN03/Settings/AppShell Web tests | **104 passed across 5 files** |
| Full Web suite | **293 passed across 32 files** |
| `npm run typecheck` | **PASS**, API and Web |
| `npm run lint` | **PASS**, API and Web |
| i18n audit | **0 missing keys, 0 untranslated English, 0 visible Chinese** |
| `npm run build` | **PASS**, API compilation and Web production bundle |
| Skill architecture checker, scoped boundary configuration | **0 errors, 0 warnings** |
| `git diff --check` | **PASS** |

Focused regressions additionally cover no automatic writes/downloads, empty-domain access, timezone staging, formatted row status/amounts, export denial/failure/retry, import failure/retry, restore failure/retry, invalid replacement backup, user isolation, all query invalidations, Settings export success/failure, mobile topic selection and legacy replace Back/Forward. Existing Finance concurrency/ledger tests were retained.

Raw focused/full Web, MySQL, typecheck/lint/build logs and the architecture checker configuration/output are stored alongside browser evidence. Browser evidence exercises the valid-date and malformed-date compatibility paths; the additional impossible-calendar-date cases are covered by the permanent AppShell tests.

## ARCHITECTURE CONFORMANCE

`docs/ARCHITECTURE.md` now records Finance-private maintenance ownership, Global Settings cross-domain export ownership, authenticated draft lifecycle, current recurring cache keys and AppShell routing-only legacy compatibility. Settings has no dependency on Finance internals. FinancePage remains composition/query/navigation plus the existing refresh capability; the maintenance workflow stays local to Finance. The obsolete public cents formatter exception/export was removed after checking external consumers.

The architecture checker used a task-scoped configuration for Settings→Finance dependency exclusion, AppShell→Finance private-module exclusion and Finance→Settings dependency exclusion. Configuration and output are preserved for review. No persistent generic framework, store, event bus, new endpoint, schema or migration was introduced.

## REMAINING BLOCKERS

**NONE.** The approved scope is complete and verified. Existing date-picker parameter loss and possible-duplicate policy review are recorded above as separate future work, not hidden changes or blockers to this closure. Existing unrelated uncommitted changes were preserved; this task did not commit them.
