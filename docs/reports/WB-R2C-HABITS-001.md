# WB-R2C Habits

Date: 2026-09-21  
Task: `WB-R2C-HABITS-001`  
Branch: `codex/workbench-auth-system`  
Baseline HEAD: `e312009cee1d4ee83782e66da26d65695f78d79e`

## 1. Scope

This package delivers the R2C Habits domain only: effective-dated definitions, schedule rules and goals; explicit occurrences; daily, specific-weekday and weekly-N evaluation; `/routines`; lightweight Today composition; explicit Habit-to-Task publication; Search and Export integration; migration, tests and browser evidence.

It does not add Growth roles, streak rewards, Period Reviews, Finance, Import, Agent Bridge, calendar recurrence, a generic event platform, or a second truth for Water, Morning Writing or Sleep. The implementation follows the owner boundaries in `docs/ARCHITECTURE.md` and adds no speculative shared layer. Existing R2A/R2B working-tree changes were preserved without reset, stash, cleanup or migration rewrites.

## 2. R2B Baseline

R2B remained the accepted baseline: Trash continues to compose owner capabilities, Quick Notes continues to own Note-to-Project material association, and Projects/Tasks/Execution retain their existing ownership. R2C touches Task completion only through one transaction-aware Habits public capability for an explicit binary link.

Workspace baseline:

- branch `codex/workbench-auth-system`, HEAD `e312009cee1d4ee83782e66da26d65695f78d79e`;
- Node `v24.2.0`, npm `11.3.0`, MySQL client `8.0.25`;
- pre-existing R2A/R2B WIP remained uncommitted and intact;
- V1-V25 bytes were not modified; R2C adds only V26;
- browser acceptance used the existing Web/API development servers and isolated local MySQL on `127.0.0.1:3408`.

## 3. Habit Domain

`V26__add_habit_domain.sql` creates five normalized tables:

| Owner record | Responsibility |
| --- | --- |
| `habit_definitions` | identity, name/description, optional category, date bounds, record mode/unit, binary Task-sync opt-in, optimistic version, archive marker |
| `habit_rule_versions` | effective date, DAILY/SPECIFIC_WEEKDAYS/WEEKLY_N shape, enabled state |
| `habit_goal_versions` | effective date and positive decimal target |
| `habit_occurrences` | explicit completed/partial/skipped fact, value/reason, date/timezone/source/version |
| `habit_task_links` | one explicit Habit/date to one Task relation and binary completion policy snapshot |

The API exposes a single Habits owner in `apps/api/src/habits.ts` and route surface in `apps/api/src/routes/habits.ts`. Authenticated ownership is checked before read or mutation; category references are validated against the same user. All mutations use the existing `mutation_receipts` workflow and optimistic versions where an existing aggregate or occurrence changes.

Record modes are one enum and one occurrence table: `COMPLETION`, `COUNT`, `QUANTITY`, and `MINUTES`. No Habit reward event or Growth mapping was introduced.

## 4. Rule Versioning

Rules are append-only by `(habit_id, effective_from)` and selected by the latest effective row at the queried business date. Changes accept the current user business date or a future date, reject past dates, increment the definition version, and never update an earlier rule row. A same-date collision is an explicit `409`, preventing silent replacement.

The browser Flow B proves:

- `晨间拉伸` kept its `2026-09-21 DAILY` rule and completed occurrence;
- a new `2026-09-22 SPECIFIC_WEEKDAYS` row was added;
- weekday mask `21` means Monday, Wednesday and Friday;
- the detail history still shows the old completion under the old rule.

The UI states that the new configuration applies from the selected date and previous history is not recalculated. It supports immediate or future selection and an explicit seven-day mask.

## 5. Goal Versioning

Goals are independent effective-dated decimal rows. Rule and goal lookup both use the queried date, so a later target cannot change an earlier partial/completed interpretation. API tests prove a future target version is appended, the old target remains selected for the earlier date, and a stale definition version receives `409` without partial writes.

## 6. Occurrence Semantics

Only real user facts are stored. `PENDING` and `MISSED` are derived from the applicable rule, date and user timezone; they never create rows. Stored statuses are `PARTIAL`, `COMPLETED`, and `SKIPPED`.

- completion mode stores value `1`;
- count, quantity and minutes preserve the submitted decimal value;
- below-target values are partial and at/above-target values are completed without truncation;
- occurrence uniqueness is `(user_id, habit_id, occurrence_date)`;
- edits lock the row and require `expectedVersion`;
- future occurrence writes are rejected;
- `record_timezone` is stored with the date and historical dates do not drift after a user timezone change.

Focused tests prove partial-to-complete edits, stale-version `409`, no future pre-generation, per-user summaries and cross-user `404`.

## 7. Daily / Weekday / Weekly-N

DAILY expects every in-range enabled date. SPECIFIC_WEEKDAYS uses a Monday-bit-0 through Sunday-bit-6 mask. WEEKLY_N is one Monday-to-Sunday target with a completed occurrence count; it does not synthesize seven daily obligations.

Backend evidence covers the required states:

| Case | Evidence |
| --- | --- |
| Daily pending/missed | derived with zero occurrence rows |
| Weekday include/exclude | Monday-Friday mask excludes Sunday |
| Weekly 0/3 | `IN_PROGRESS`, completed `0` |
| Weekly 2/3 | week `2026-09-14..2026-09-20`, completed `2` |
| Weekly 3/3 | `COMPLETED`, exactly three occurrence rows |
| No fake misses | no extra rows exist for unused week dates |
| Week boundary | deterministic Monday/Sunday helpers, independent of server locale |
| Timezone | summary uses user timezone; occurrence retains record timezone |

Real E2E Flow A created `运动 E2E`, recorded 9/14, 9/16 and 9/18 through the Web, and showed `0/3 -> 1/3 -> 2/3 -> 3/3`. The isolated DB contains exactly those three rows, not seven missed rows.

## 8. Skip

The Today card exposes skip as a reachable icon action. It writes one explicit `SKIPPED` occurrence with optional reason, null actual value and optimistic version. Skip is excluded from weekly completed counts, is distinct from derived missed, creates no penalty, and can be replaced by a later versioned user record. No automatic make-up occurrence is created.

## 9. Water / Writing / Sleep Integration

Routines composes specialized owners as read-only projections:

- Water reads `water_records.cups/target_cups`;
- Morning Writing is complete only when the saved owner body is non-empty;
- Sleep reads `sleep_records` duration and quality.

No adapter writes `habit_occurrences`. Focused tests insert all three specialized records, verify the projected summary, and assert zero generic occurrences. Real Flow D recorded 3/8 cups through the existing Water UI; Routines showed 3/8 and the database query found zero Habit definitions/occurrences named Water.

## 10. Task Integration

`POST /api/habits/:id/task` explicitly calls the Tasks public transaction capability and creates an accepted Today Task plus `habit_task_links` in the same receipt-backed transaction. Database constraints enforce one link for `(user_id, habit_id, occurrence_date)` and one source link per Task.

Task completion calls `completeLinkedHabitFromTaskInClient` inside the existing Task completion transaction. It acts only when:

- the Habit was `COMPLETION` mode;
- the definition explicitly enabled Task completion sync;
- the Task has the exact source relation;
- the relation snapshot allows the completion.

Numeric modes never auto-fill. No Habit reward is granted, so Task completion still produces only its existing Task reward. Unit and browser tests prove duplicate publication, operation replay and duplicate Task completion cannot create a second Task, occurrence, receipt, completion event or reward.

Real Flow C created `晚间整理`, published Task 9, completed it in the Web and replayed the saved operation receipt. Final counts remained: one receipt, one Task completion event, one linked Habit occurrence with source `LINKED_TASK`, and one Task reward.

## 11. Search / Export

Search adds only Habit definitions, matching name/description/unit and deep-linking to `/routines?habit=<id>`. Occurrences are deliberately not indexed. Queries remain user-scoped and archived definitions remain historically discoverable.

Export adds the `habits` domain and serializes definitions, rule versions, goal versions, occurrences and Task links. JSON/CSV/Markdown use the existing on-demand export mechanism; no copied index or persisted export was added. Tests prove all four required history kinds are present and another user's Habit is absent. Settings exposes the Habits export choice.

## 12. Mobile

At 375 x 812, `/routines` uses compact Today cards with visible status, concise goal/progress, primary completion/record action, direct skip and Task conversion. The creation form progressively reveals weekday or weekly-N controls. The detail view stacks history and future configuration without a table.

Measured browser evidence:

- `scrollWidth=375`, `clientWidth=375` on Today and detail;
- at maximum scroll, final specialized summary bottom `724px`, bottom-nav top `748px`, gap `24px`;
- no MiniTimer was active; existing shell reserve prevents bottom-nav obstruction;
- weekday chips wrap with normal-size touch controls;
- all required actions remain reachable without horizontal scrolling.

Screenshot: `docs/reports/WB-R2C-routines-375.png`.

## 13. Desktop

At 1440 x 1000, Routines is a constrained two-column layout: the Habit list gets the wider work area and specialized life projection remains a compact secondary column. Mobile cards are not stretched across the viewport. `scrollWidth=clientWidth=1440`.

Screenshots:

- `docs/reports/WB-R2C-routines-1440.png`;
- `docs/reports/WB-R2C-habit-detail-375.png`.

## 14. Migration

New forward migration: `db/migration/V26__add_habit_domain.sql`. V1-V25 were not edited.

| Check | Result | Evidence |
| --- | --- | --- |
| Fresh V1-V26 | PASS | `personal_workbench_r2c_fresh_test`, 34 tables, all five Habit tables present |
| Production-like V1-V25 -> V26 | PASS | `personal_workbench_r2c_upgrade_test` |
| Existing life rows preserved | PASS | Water/Sleep/Morning Writing counts `1/1/1` before and `1/1/1` after |
| No specialized backfill | PASS | definitions `0`, occurrences `0` after upgrade |
| Constraints | PASS | positive goals, valid rule shapes, unique occurrence and Task-source keys enforced in SQL |

These are isolated local migration fixtures applied in version order. No Flyway repair, deployed checksum change, production connection or production data write occurred.

## 15. Real DB Evidence

Browser acceptance used `personal_workbench_r1d_e2e_test`, migrated through V26, user 6 only. The final database showed:

- 4 generic Habit definitions;
- `晨间拉伸`: DAILY on 9/21 plus weekday mask 21 from 9/22;
- `力量训练`: weekly target 3, one manual occurrence, linked Task with reverse sync disabled;
- `晚间整理`: one `LINKED_TASK` completed occurrence and one Task link;
- `运动 E2E`: exactly three manual completed occurrences on 9/14, 9/16 and 9/18;
- Water record 3/8 on 9/21 and zero generic Water occurrences.

The focused API run passed 8 top-level integration tests containing the 30 required backend assertions: definition/rules 1-7, occurrence 8-14, weekly-N 15-20, specialized sources 21-23, Task integration 24-28, and isolation 29-30. Result: 8/8, 0 skipped, 0 TODO.

## 16. Browser Evidence

Real browser acceptance used Web `127.0.0.1:5173`, API `127.0.0.1:3000` and isolated MySQL.

- Flow A PASS: weekly 3 Habit progressed across three actual dates to 3/3; no daily missed rows.
- Flow B PASS: daily completion remained under the old rule after a future Mon/Wed/Fri version was appended.
- Flow C PASS: binary Habit -> Task -> Task completion -> one Habit occurrence; identical operation replay stayed single-counted.
- Flow D PASS: Water progress appeared from `water_records`; no generic occurrence was written.
- Search deep link, Habits export choice, Today snapshot, `/routines` tabs, creation, manual completion, numeric record, skip affordance and Task conversion were exercised in the running application.

Required screenshots were generated from the final code and visually inspected:

- `docs/reports/WB-R2C-routines-375.png`;
- `docs/reports/WB-R2C-habit-detail-375.png`;
- `docs/reports/WB-R2C-routines-1440.png`.

## 17. Regression

| Command / evidence | Result |
| --- | --- |
| `TEST_DATABASE_URL=mysql://root@127.0.0.1:3408/personal_workbench_r2c_fresh_test npm run test:r2c --workspace @workbench/api` | PASS, 8/8, 0 skipped/TODO |
| fresh V1-V26 + `TEST_DATABASE_URL=mysql://root@127.0.0.1:3408/personal_workbench_r2c_full_test npm test --workspace @workbench/api` | PASS, 81/81, 0 skipped/TODO |
| `npm test --workspace @workbench/web` | PASS, 20 files, 100/100 |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS; repository lint is TypeScript validation |
| `npm run build` | PASS; API TypeScript and Web Vite production build |
| OpenAPI YAML parse | PASS |
| `git diff --check` | PASS |

Frontend acceptance maps all 17 requested areas to evidence: Routines, create, future rule, daily completion, weekly progress, skip, quantity state, disable/archive, Today summary, Water, Morning Writing, occurrence-to-Task, deep link, Search, 375px, 1440px and R1/R2 regression. Direct Habits component tests are 7/7; Habits plus Search and Settings focused tests are 13/13. The full 100-test suite covers Shell/Today, Search, Settings/Export and prior R1/R2A/R2B behavior. Browser and database evidence covers the responsive and cross-owner cases that mock-only component tests cannot prove.

The full API suite includes the existing Project -> Task -> accept -> start -> pause/resume -> finish workflow, QuickNote, Search, Trash restore, Journal/owner records, Export, operation receipts and transaction rollback coverage.

## 18. Deferred Growth Work

R2C deliberately defers Habit XP, streaks, penalties, milestone economy, Growth role mapping, radar charts and Period Reviews. Category remains the optional neutral classification surface. Water/Sleep/Writing remain specialized truths. Automatic Timer-to-Habit inference, import, Bridge access and recurrence engines remain outside this package.

## 19. Gate

```text
HABIT_DOMAIN:
PASS

RULE_VERSIONING:
PASS

OCCURRENCE_SEMANTICS:
PASS

WEEKLY_N:
PASS

SPECIALIZED_LIFE_SOURCES:
PASS

HABIT_TASK_INTEGRATION:
PASS

HABIT_SEARCH_EXPORT:
PASS

R1_R2_REGRESSION:
PASS

R2C_GATE:
PASS

READY_FOR_R2D:
YES
```

R2C stops here. R2D was not started.
