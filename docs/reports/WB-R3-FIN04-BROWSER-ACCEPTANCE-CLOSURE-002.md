# WB-R3-FIN04 Browser Acceptance Closure

## Outcome

FIN04 browser acceptance is closed against a fresh V31 database, isolated API/Web processes, and a fresh temporary Chrome profile on a dedicated CDP port. The run used a real CSV file bound through `DOM.setFileInputFiles`; no import browser assertion was substituted with an API-only call. No Hero Growth, AI Foundation, Agent Bridge, Finance Projection, or Agent Wallet work was started.

One product bug was found and fixed: MySQL `DATE` values in import preview were serialized through UTC and appeared one day early when the API ran in Asia/Shanghai. `mysqlDate` now preserves the database calendar date, with a FIN04 regression assertion for `2026-09-20` and `2026-09-21`. The remaining changes are presentation/evidence work: readable preview rows and result wording, explicit JSON/CSV purpose copy, Finance search affordances, and the repeatable CDP script.

## Browser Run

- Desktop viewport: `1440x900`.
- Mobile viewport: `375x812`; asserted `innerWidth=375`, `innerHeight=812`, and `document.documentElement.scrollWidth=375` at capture time.
- CSV fixture: four rows covering `EXACT_DUPLICATE`, `POSSIBLE_DUPLICATE`, `READY`, and `INVALID`.
- Import confirmation: two rows imported, one exact duplicate skipped, one possible duplicate explicitly accepted, and one invalid row left for correction.
- Exact duplicate re-upload: Finance transaction count unchanged.
- Export: opening Settings caused no download; JSON and CSV required a native confirmation dialog, produced real downloaded files, and wrote two audit rows.
- Search: note, category, and account-name searches returned Finance results without amounts; the deep-linked transaction detail displayed the real amount.
- Reconciliation: browser showed `账本核对：全部正常`; anomaly validator coverage remains in the focused API suite.
- Restore: the populated source ledger was blocked; the exported backup preview showed schema version/object counts and restored only into a fresh user.
- Browser/API/DB parity: 4 Finance transactions, 4 entries, 3 imported transactions with provenance, and `8000` expense cents in both Budget and Report.

## Evidence

- `WB-R3-FIN04-import-preview-1440.png`
- `WB-R3-FIN04-import-result-1440.png`
- `WB-R3-FIN04-export-1440.png`
- `WB-R3-FIN04-search-1440.png`
- `WB-R3-FIN04-reconciliation-1440.png`
- `WB-R3-FIN04-data-actions-375.png`
- `WB-R3-FIN04-import-preview-375.png`

The mobile captures show readable single-line actions, a stacked import preview with all required fields/statuses, reachable confirmation, no horizontal overflow, and no FAB/bottom-navigation overlap. User-facing copy uses backup, restore, duplicate, import, and reconciliation language; internal source fingerprint, batch implementation, savepoint, graph, and canonical-identity terms are not exposed.

## Regression

| Check | Result |
| --- | --- |
| FIN04 focused | PASS, `5/5` |
| FIN03 focused | PASS, `11/11` |
| FIN02 focused | PASS, `9/9` |
| FIN01 focused | PASS, `8/8` |
| Full API | PASS, `119/119` |
| Finance/Search/Settings/AppShell focused Web | PASS, `45/45` |
| Full Web | PASS, `131/131` across 22 files |
| Typecheck / lint / build | PASS |
| `git diff --check` | PASS |
| Architecture check | PASS, 0 errors and 0 warnings |
| OpenAPI YAML | PASS |

## Final Gates

```text
FIN04_BROWSER_ENV: PASS
IMPORT_PREVIEW_DESKTOP: PASS
IMPORT_RESULT_DESKTOP: PASS
EXPORT_BROWSER_FLOW: PASS
SEARCH_BROWSER_FLOW: PASS
SEARCH_AMOUNT_PRIVACY: PASS
RECONCILIATION_BROWSER: PASS
EXACT_375_EVIDENCE: PASS
MOBILE_DATA_ACTIONS: PASS
MOBILE_IMPORT_PREVIEW: PASS
MOBILE_IMPORT_CONFIRM: PASS
RESTORE_BROWSER_FLOW: PASS
FIN04_BROWSER_ACCEPTANCE: PASS
FIN04_GATE: PASS
FIN01_GATE: PASS
FIN02_GATE: PASS
FIN03_GATE: PASS
R3_FINANCE_COMPLETE: PASS
READY_FOR_HERO_GROWTH: YES
```

The task stops at R3 Finance closure.
