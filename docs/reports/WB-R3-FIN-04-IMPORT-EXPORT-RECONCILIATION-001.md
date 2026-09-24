# WB-R3-FIN-04 Import, Export & Reconciliation

## Scope

FIN-04 adds Finance-owned staging for external CSV imports, sensitive JSON/CSV maintenance exports, empty-ledger Workbench Finance JSON restore, read-only reconciliation, and Finance-aware search. Existing FIN-01 through FIN-03 transaction and reporting semantics remain the source of truth. No FIN-05/Hero Growth/AI/Agent work was started.

## Implementation Evidence

- `db/migration/V31__add_finance_data_maintenance.sql` adds import batches/rows, audit records, canonical source identity, and `FinanceTransactionSource.IMPORT`.
- `apps/api/src/finance-maintenance.ts` owns preview, validation, dedupe, retryable confirmation, graph backup/restore, and reconciliation. Imported ledger writes go through the Finance capability in `apps/api/src/finance.ts`.
- External preview is ledger-pure. Exact source identity is unique on `(user_id, source_namespace, source_row_fingerprint)`; possible duplicates require explicit opt-in. Row failures use savepoints and remain retryable.
- Restore validates the complete graph, requires an empty Finance domain, inserts atomically, maps account/category/batch/transaction/template IDs, and records an audit event.
- Search returns Finance transaction matches without amount values and deep-links to transaction detail.
- Settings > Data exposes explicit-confirmation JSON/CSV export, CSV preview/confirm, restore preview/confirm, and reconciliation.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| FIN04 real MySQL focused | PASS | `5/5` in `npm run test:fin04` |
| FIN03 focused | PASS | `11/11`, including cross-month flow/correction, month-end day 31, weekly weekday, endDate, GET purity, confirm rollback, template history, invalid posting |
| FIN02 focused | PASS | `9/9` |
| FIN01 focused | PASS | `8/8` |
| Full API | PASS | `119/119` |
| Full Web | PASS | `131/131` across 22 files |
| Typecheck / lint / build | PASS | root workspace commands |
| `git diff --check` | PASS | no whitespace errors |
| Architecture check | PASS | `architecture-check.mjs`: 0 errors, 0 warnings |
| OpenAPI YAML | PASS | Ruby YAML parser accepted `docs/openapi.yaml` |

## Browser Evidence

`scripts/fin04-browser-evidence.mjs` uses a fresh Chrome CDP process/profile, sets `1440x900` and `375x812`, and asserts the mobile `innerWidth`, `innerHeight`, and `document.documentElement.scrollWidth === 375`. It binds a real four-row CSV through `DOM.setFileInputFiles`, confirms the import in the browser, verifies native downloads/audits, searches without leaking amounts, checks reconciliation, and restores the exported backup only to a fresh user. The complete evidence set is:

- `WB-R3-FIN04-import-preview-1440.png`
- `WB-R3-FIN04-import-result-1440.png`
- `WB-R3-FIN04-export-1440.png`
- `WB-R3-FIN04-search-1440.png`
- `WB-R3-FIN04-reconciliation-1440.png`
- `WB-R3-FIN04-data-actions-375.png`
- `WB-R3-FIN04-import-preview-375.png`

The closure run reported 4 Finance transactions, 4 entries, 3 imported transactions with provenance, and `8000` expense cents in both Budget and Report. Full details are in `WB-R3-FIN04-BROWSER-ACCEPTANCE-CLOSURE-002.md`.

## Final Gates

```text
IMPORT_PREVIEW: PASS
IMPORT_VALIDATION: PASS
IMPORT_EXACT_DEDUPE: PASS
IMPORT_POSSIBLE_DUPLICATE: PASS
IMPORT_PARTIAL_RETRY: PASS
IMPORT_PROVENANCE: PASS
SENSITIVE_EXPORT: PASS
FINANCE_JSON_BACKUP: PASS
FINANCE_RESTORE: PASS
RESTORE_RELATION_MAPPING: PASS
RECONCILIATION_REPORT: PASS
RECONCILIATION_ANOMALY_DETECTION: PASS
FINANCE_SEARCH: PASS
MOBILE_DATA_MAINTENANCE: PASS
FIN03_REGRESSION: PASS
FIN02_REGRESSION: PASS
FIN01_REGRESSION: PASS
FULL_REGRESSION: PASS
FIN04_BROWSER_ACCEPTANCE: PASS
FIN04_GATE: PASS
R3_FINANCE_COMPLETE: PASS
READY_FOR_HERO_GROWTH: YES
```

The implementation, API/domain acceptance, and final browser acceptance are complete. Per the request, no later phase was started.
