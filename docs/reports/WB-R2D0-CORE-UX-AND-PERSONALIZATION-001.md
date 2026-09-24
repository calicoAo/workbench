# WB-R2D0 Core UX and Personalization

Date: 2026-09-21  
Branch: `codex/workbench-auth-system`  
Baseline HEAD: `e312009cee1d4ee83782e66da26d65695f78d79e`  
Runtime: Node `v24.2.0`, npm `11.3.0`

## Executive Summary

R2D0 is complete. The implementation closes the requested pre-Growth UX and personalization scope without adding Growth, AI, Finance, a ProjectSection schema, a second time truth, or a generic preference platform.

The durable data change is the forward-only `V27__add_personalization_preferences.sql`. It makes the existing Category-to-Growth mapping nullable, snapshots a Sleep record timezone, and stores the three Writing Slot visibility/order preferences. Existing Category IDs and Writing/Sleep rows are preserved. No production database or production data was accessed or changed.

The final product decisions are:

- New accounts receive `工作`, `学习`, `创作`, `生活`, `健康`, `社交`, `其他`; no Stock/Investment Category is seeded.
- Correction `WB-R2D0-WRITING-SLOT-DEFAULT-CORRECTION-001`: new registrations start all three Writing Slots disabled, making every module explicit opt-in. Existing persisted preferences are unchanged.
- `TaskCategory` remains cross-Project attribution and optional Growth classification. A future `ProjectSection` or Workstream may organize one Project locally, but no such schema is introduced here.
- Sleep business date is the wake date. Start date, start time, wake date, wake time, and record timezone are explicit inputs and persisted semantics.

## Architecture and Ownership

The implementation follows `docs/ARCHITECTURE.md` and records the R2D0 decision there.

| Concern | Owner | R2D0 boundary |
| --- | --- | --- |
| Category identity and presentation | Settings / Categories | Nullable Growth mapping and normalized color; color is not identity or attribution logic |
| Writing records | Existing Morning Writing, Journal, Stock Review owners | Writing Slot stores only `enabled` and `sortOrder` |
| Sleep truth | Sleep | Explicit local dates/times plus timezone; wake date is business date |
| Manual Actual and completion | Existing Manual Actual workflow | Web submits one atomic command; it does not chain mutations |
| Water mutation | Water public capability | AppShell composes `recordWaterCups`; it does not reproduce the request contract |
| Sidebar state | AppShell browser preference | Local-only collapsed state; no server preference platform |
| Project classification | TaskCategory / future ProjectSection | Category is cross-Project; no `Project.categoryId` or ProjectSection table |

Architecture delta review: no module reaches through another owner's internals, no new competing state owner was introduced, and AppShell remains a composition surface.

## Migration and Data Preservation

Migration: `db/migration/V27__add_personalization_preferences.sql`

- `task_categories.dimension_key` becomes nullable.
- `sleep_records.record_timezone` is added with the existing product default `Asia/Shanghai` for historical rows.
- `writing_slots` stores one row per user and fixed slot key, unique on `(user_id, slot_key)`.
- At the original V27 migration boundary, existing active users received Morning Writing enabled at 10, Journal enabled at 20, and Stock Review disabled at 30. The correction does not modify V27 or rewrite those persisted preferences.
- V1-V26 were not edited by R2D0.

Fresh migration evidence:

```text
database: personal_workbench_r2d0_final_test
migration files applied: 28 (V1, V2, V2_1, ... V27)
last migration: V27__add_personalization_preferences.sql
tables: 35
result: PASS
```

Production-like V26 to V27 evidence:

| Data | Before | After |
| --- | ---: | ---: |
| Categories | 4 | 4 |
| Morning Writing | 1 | 1 |
| Journals | 1 | 1 |
| Stock Reviews | 1 | 1 |
| Sleep records | 1 | 1 |
| Writing Slots | n/a | 3 |

Both legacy Stock Review category rows remained enabled and addressable; no name-based deletion or disabling was attempted. The existing Sleep row received `record_timezone='Asia/Shanghai'` without changing its date or interval.

The test databases were dedicated `_test` databases on `127.0.0.1:3408`. The browser acceptance account used the existing local development database. `PRODUCTION_DATA_MODIFIED: NO`.

## Feature Acceptance

| Requirement | Result | Evidence |
| --- | --- | --- |
| Category defaults | PASS | Registration integration test asserts the exact seven names and absence of Stock/Investment |
| Category creation UX | PASS | Settings first-level 分类 panel and Task create/edit inline creation with automatic selection |
| Custom Category color | PASS | Preset swatches, native picker, Hex input; API accepts exact `#RRGGBB` and normalizes uppercase |
| Nullable Growth mapping | PASS | V27 nullable column, API nullable contract, `暂不映射` UI and selectable unmapped group |
| Writing Slot preferences | PASS | Settings toggles and ordering persist all three fixed keys |
| Writing history preservation | PASS | Preference integration test retains all owner rows; primary entry filtering does not affect History/Search/Export |
| Sleep date semantics | PASS | API test proves wake-date identity and timezone; Web test proves `00:30 -> D` and `23:30 -> D-1` smart defaults |
| Today composition | PASS | Main has no nested scroll; only enabled Writing actions are composed |
| Utility rail | PASS | Water, Sleep, Quick Note/Writing, Habits and Timeline are ordered in a 320px rail |
| Sidebar collapse | PASS | Expanded 152px, collapsed 60px; state persists in localStorage and controls retain labels/tooltips |
| Mobile Quick Action | PASS | One bottom sheet contains Task/Plan/Actual, Water, Sleep, Quick Note, and enabled Writing actions |
| Mobile Timeline editing | PASS | Planned/Manual use their owner editor; Sleep delegates to Sleep; Timer/legacy records remain source-aware and read-only where correction is unsupported |
| Manual Actual candidates | PASS | API and Web tests restrict new records to accepted Assignments for the target date while retaining an existing edit attribution |
| Complete Task with optional time | PASS | Direct completion writes no time; optional time sends one `POST /api/schedules` with `completeTask=true`; backend atomic workflow regression passes |
| Mobile Task density | PASS | Three measured Today rows are 72px; primary actions retain 44px targets and no horizontal overflow |
| Project classification | PASS | Architecture decision documents cross-Project TaskCategory and future Project-local ProjectSection boundary |

## Browser Acceptance

The checked browser was Chromium 153 through the repository evidence script at 1440x1000, 1024x900, and 375x812.

Measured results:

```text
1440: Today main 933.875px, utility 320px, nested Task overflow visible
1024: Today main 609.875px, utility 320px, document scrollWidth 1024px
collapsed: shell columns 60px / 1380px, sidebar rect 60px, persisted=true
375: document scrollWidth 375px, Task rows 72/72/72px
375 bottom: last content bottom 723.875px, nav top 748px, clear=true
375 Quick Action: menu bottom 746px, nav top 748px, clear=true
```

The Quick Action contents were `发布悬赏`, `安排计划`, `补录实际`, `喝水 +1`, `记录睡眠`, `随手记`, `晨写`, and `日记`. Disabled Stock Review was absent.

Screenshots:

- `docs/reports/WB-R2D0-today-1440.png`
- `docs/reports/WB-R2D0-today-collapsed-1440.png`
- `docs/reports/WB-R2D0-today-375.png`
- `docs/reports/WB-R2D0-time-editor-375.png`
- `docs/reports/WB-R2D0-sleep-375.png`
- `docs/reports/WB-R2D0-category-375.png`
- `docs/reports/WB-R2D0-writing-settings-375.png`

All seven files have the requested dimensions and were visually inspected. Mobile date/time/select controls are stacked, dialogs fit the viewport, the bottom navigation remains unobstructed, and Category color and Writing configuration controls are visible.

## Regression Evidence

| Command | Result |
| --- | --- |
| `TEST_DATABASE_URL=... npm run test --workspace @workbench/api` | PASS, 86/86, 0 skipped, 0 todo |
| `TEST_DATABASE_URL=... npm run test:r2c --workspace @workbench/api` | PASS, 8/8 |
| `npm run test --workspace @workbench/web` | PASS, 104/104 |
| Focused Web R2D0 tests | PASS, 37/37 |
| `npm run lint` | PASS, API and Web TypeScript checks |
| `npm run build` | PASS, API TypeScript and Web production bundle |
| `git diff --check` | PASS |
| OpenAPI YAML parse | PASS |

The API suite includes explicit coverage for Habit weekly-N, future Habit rules, Water/Morning Writing/Sleep projections, Project to Task to Timer attribution, QuickNote to Task, QuickNote to Project materials, Trash restore, Search, and Export. It also retains R1B atomic completion and Manual Actual transaction coverage.

## Files and Commands

Primary R2D0 implementation surfaces:

- `db/migration/V27__add_personalization_preferences.sql`
- `apps/api/src/writing-slots.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/routes/settings.ts`
- `apps/api/src/routes/sleep-records.ts`
- `apps/api/src/routes/task-categories.ts`
- `apps/api/src/routes/schedules.ts`
- `apps/web/src/app/shell/index.tsx`
- `apps/web/src/features/settings/index.tsx`
- `apps/web/src/features/sleep/index.tsx`
- `apps/web/src/features/calendar/index.tsx`
- `apps/web/src/features/tasks/complete-task.tsx`
- `apps/web/src/features/tasks/task-ui.tsx`
- `apps/web/src/features/water/index.tsx`
- `apps/web/src/features/writing-reflection/index.tsx`
- `apps/web/src/styles.css`
- `docs/ARCHITECTURE.md`
- `docs/openapi.yaml`
- `scripts/r2d0-browser-evidence.mjs`

Existing uncommitted R2A/R2B/R2C work was preserved. No stash, reset, clean, migration rewrite, or production-data operation was performed.

## Final Gate

```text
CATEGORY_DEFAULTS:
PASS

CATEGORY_CREATE_UX:
PASS

CATEGORY_CUSTOM_COLOR:
PASS

WRITING_SLOT_PREFERENCES:
PASS

WRITING_HISTORY_PRESERVATION:
PASS

SLEEP_DATE_SEMANTICS:
PASS

TODAY_LAYOUT:
PASS

UTILITY_RAIL:
PASS

SIDEBAR_COLLAPSE:
PASS

MOBILE_QUICK_ACTION:
PASS

MOBILE_TIMELINE_EDIT:
PASS

MANUAL_ACTUAL_TASK_FILTER:
PASS

TASK_COMPLETE_TIME_OPTION:
PASS

PROJECT_CLASSIFICATION_DECISION:
PASS

R2C_REGRESSION:
PASS

R2D0_GATE:
PASS

READY_FOR_AI_FOUNDATION:
YES
```

No R2D0 blocker remains. This task stops here; AI and Growth work were not started.

## Writing Slot Default Correction

`WB-R2D0-WRITING-SLOT-DEFAULT-CORRECTION-001` changes only the new-registration seed and its empty-state UI fallback: Morning Writing, Journal, and Stock Review now all start disabled. Settings explicitly says “选择你想使用的书写模块。” and retains independent toggles and ordering for all three slots.

V27 remains byte-for-byte unchanged (`SHA-256 16c2c60a0a281c1c19f2c6e692a12395ce3f28c154d8c9bad7098a3c81dc4701`). No migration, startup rewrite, or existing-preference backfill was added. The registration test compares an existing user's full slot rows before and after another user registers. The disabled-state integration test confirms the persisted Journal remains available through History list, Search, and Writing Export.

Correction regression results: API focused 5/5, API full 86/86, Web full 106/106, with no skipped or todo tests.

```text
WRITING_SLOT_NEW_USER_DEFAULTS: PASS
WRITING_SLOT_EXPLICIT_OPT_IN: PASS
WRITING_HISTORY_PRESERVATION: PASS
R2D0_CORRECTION_GATE: PASS
READY_FOR_AI_FOUNDATION: YES
```
