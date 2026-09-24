# WB-R3-FIN04 Final Presentation Correction

## Scope

This correction is presentation-only. It does not change V1–V31, import/deduplication/restore/reconciliation/search semantics, API DTOs, or canonical integer cents.

## Corrections

- Import preview amounts now use the existing Finance-owned `BigInt` cents formatter. For example, `-1000` is presented as `-¥10.00`; raw canonical cents remain unchanged in the API and database.
- Import statuses use one centralized product-language map shared by desktop and mobile: `完全重复`, `可能重复`, `可导入`, `需要修正`, `需要映射`, `已导入`, and `导入失败`.
- AppShell marks Settings routes as dense management surfaces and hides only the mobile Quick Action wrapper there. Desktop Quick Action remains visible, and Today retains the existing compact Quick Action and More behavior.

The Finance formatter is exposed through the Finance public surface for the Settings-owned Finance maintenance presentation. `docs/ARCHITECTURE.md` records this narrow dependency; no competing money formatter or shared utility was introduced.

## Browser Evidence

The CDP run used a fresh temporary Chrome profile, isolated V31 database, isolated API/Web processes, a real CSV file bound with `DOM.setFileInputFiles`, and exact viewports.

- `WB-R3-FIN04-data-actions-375-final.png`
- `WB-R3-FIN04-import-preview-375-final.png`
- `WB-R3-FIN04-import-preview-1440-final.png`

At mobile capture time, `innerWidth=375`, `innerHeight=812`, and `document.documentElement.scrollWidth=375`. The script asserted that the Settings FAB was not visible, action labels fit, the confirmation CTA remained above bottom navigation, formatted Yuan amounts were present, and raw cents/raw enums were absent. Manual inspection confirmed all export buttons are unobstructed and clickable.

## Regression

| Check | Result |
| --- | --- |
| Finance / Settings / Search / AppShell focused Web | PASS, `44/44` |
| Full Web | PASS, `133/133` across 22 files |
| Typecheck | PASS |
| Lint | PASS |
| Build | PASS |
| `git diff --check` | PASS |
| Architecture check | PASS, 0 errors and 0 warnings |

No API/domain file or DTO was changed, so the Finance MySQL suites were not rerun for this presentation-only correction. The previously closed FIN01–FIN04 domain gates remain unchanged.

## Final Gates

```text
IMPORT_AMOUNT_PRESENTATION: PASS
IMPORT_STATUS_PRESENTATION: PASS
MOBILE_DATA_ACTION_SAFE_ZONE: PASS
FIN04_UI_REGRESSION: PASS
FIN04_GATE: PASS
FIN01_GATE: PASS
FIN02_GATE: PASS
FIN03_GATE: PASS
R3_FINANCE_COMPLETE: PASS
READY_FOR_HERO_GROWTH: YES
```

The task stops at the final R3 Finance presentation correction. Hero Growth was not started.
