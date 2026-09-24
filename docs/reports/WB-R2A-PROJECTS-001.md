# WB-R2A-PROJECTS-001

Date: 2026-09-21  
Branch: `codex/workbench-auth-system`  
Baseline HEAD: `e312009cee1d4ee83782e66da26d65695f78d79e`

## 1. Scope

R2A delivers the Project owner, lifecycle, single current Task association, occurrence-stable time attribution, progress/time read model, Project list/detail UI, Search, and domain export. It does not implement Habits, Growth, Period Reviews, Finance, Import, milestones, dependencies, Gantt, templates, or a universal item/event platform.

QuickNote-to-Project association is explicitly deferred to an R2A follow-up. Adding it would expand the stable Quick Notes linking contract and is not required for the Project-to-Task-to-time main loop.

## 2. R1.5 Baseline

The task started from clean HEAD `e312009c`. Existing Task publication, Assignment acceptance, Timer Segment truth, Schedule projections, Manual Actual, Quick Notes linking, Search, Export, AppShell, and React Query ownership were preserved. No pre-V24 migration was edited.

The final regression baseline is:

- API: 66/66 passed against a freshly migrated isolated MySQL database.
- Web: 84/84 passed, including 3 new Projects tests.
- Typecheck, lint, production build, and `git diff --check`: passed.

## 3. Project Domain

`V24__add_projects.sql` creates `projects` with `id`, `userId`, `name`, `description`, `status`, `priority`, `startDate`, `targetDate`, `notes`, `version`, timestamps, and independent `archivedAt`. Status values are PLANNING, ACTIVE, PAUSED, and DONE. Archive remains a separate timestamp.

`apps/api/src/routes/projects.ts` owns Project CRUD/lifecycle and its composed read model. `apps/api/src/projects.ts` exposes only ownership/assignability validation needed by Task and Manual Actual workflows. All reads and writes are scoped by authenticated `userId`.

## 4. Lifecycle

Create starts at PLANNING. Explicit commands support update, start, pause, resume, complete, archive, and restore with optimistic `expectedVersion` checks. A stale update returns 409.

DONE is never inferred from progress. Completing a Project with unfinished Tasks returns 409 unless the caller explicitly sends `unfinishedTaskPolicy=KEEP`. This command changes only Project status. It does not complete, archive, delete, or otherwise mutate Tasks.

Archive is permitted after leaving ACTIVE execution state and never deletes Task or time facts. Restore clears only `archivedAt` and retains the Project business status.

## 5. Task Association

V24 adds nullable `tasks.project_id` with a user/project/status index and Project FK. No join table or multi-project relation was introduced.

Task create/edit supports Project selection and `Inbox / 无项目`. Task publication validates the Project through the Projects capability. Project detail opens the existing Tasks publication/editor surfaces; Projects never inserts a Task directly.

Changing Project or Category while an OPEN TimerSegment exists returns 409 with a pause-first instruction. Once paused, the Task current Project can change. Resume creates a new Segment using the new Task association.

## 6. Historical Attribution

Timer start/resume now writes `projectIdAtOccurrence` plus ATTRIBUTED/NONE from the current Task. Closed Segment projections copy the frozen occurrence fields. Moving a Task never updates previous Segment or Schedule occurrence columns.

Manual Actual exposes an explicit occurrence Project selector and defaults it from the selected Task. Correcting an entry preserves its existing occurrence Project unless the caller explicitly changes it. Existing UNKNOWN/NONE history is not inferred or backfilled.

The real database test proves `Project X = 10h` and `Project Y = 1h` after a Task move. A separate test proves a 2h Manual Actual remains with X after the Task moves to Y.

## 7. Project Progress

Progress is the equal-weight average of all current, non-deleted, non-ARCHIVED Tasks. DONE contributes 100 regardless of its prior `progressPercent`. An empty Project returns `progressPercent: null` and the UI renders `尚无任务`, not a failed 0% state.

The formula test uses 20%, DONE, and ARCHIVED Tasks and returns 60% across two included Tasks. The UI explains that adding or removing Tasks changes the denominator without framing a decrease as regression.

## 8. Project Time

Project time is derived exactly once from:

- closed, non-deleted TimerSegments with matching `projectIdAtOccurrence` and ATTRIBUTED status;
- included Manual/eligible Legacy Actual Schedules with matching occurrence Project.

TIMER Schedule projections are excluded. The read model never joins historical time through `Task.projectId` and never adds a second child-Task total. The 10h/1h test also inserts TIMER projections and confirms totals remain 10h/1h.

## 9. Project Detail

`/projects` provides current/archive views and compact cards with status, priority, target, progress, task counts, invested time, and next unfinished Task. `/projects/:projectId` provides URL-backed Overview, Tasks, Plans & Time, and Notes tabs.

Overview combines the Project owner with Task-derived progress and occurrence-derived time. Plans are composed from Planned Schedules whose current Task belongs to the Project. Actual entries remain occurrence-attributed. Notes remain `Project.notes`; Quick Note bodies are not copied.

## 10. Search / Export Integration

Search adds `type=project` over Project name, description, and notes with deep links to `/projects/:id`. It extends the existing direct union query and does not create an index or universal record.

Export adds `projects` JSON/CSV using the existing domain exporter. Archived Projects are included because archive is a retained domain state, not Trash. Import remains deferred to R2E.

## 11. Mobile

At 375x812, Project list/detail use the existing AppShell and five-item bottom navigation. Projects is reachable through the secondary topbar Project action; no sixth bottom tab was added. Cards and detail sections are single-column, controls retain usable hit areas, and tabs scroll rather than compress.

Chromium evidence reported `innerWidth=375` and `documentElement.scrollWidth=375` for both routes. No horizontal overflow was present.

Screenshot: `docs/reports/WB-R2A-projects-375.png`  
Screenshot: `docs/reports/WB-R2A-project-detail-375.png`

## 12. Desktop

At 1440x1000, Project detail uses the existing shell with a flexible main overview and compact 280px summary column. The layout does not stretch the mobile stack across the viewport and has no horizontal overflow (`scrollWidth=1440`).

Screenshot: `docs/reports/WB-R2A-project-detail-1440.png`

## 13. Real DB Evidence

A new isolated database, `personal_workbench_r2a_fresh_test`, was created and migrations V1 through V24 were applied in version order. Schema inspection returned all four required tables (`projects`, `tasks`, `timer_segments`, `schedules`) and `tasks.project_id bigint unsigned NULL` with an index.

`npm run test:r2a` passed 8/8 database-backed scenarios covering all 17 required backend acceptance categories. The full API suite then passed 66/66 on the same freshly migrated database.

The browser E2E isolated account produced one Project, one completed Task, one canonical closed Segment, and one TIMER projection. Database evidence showed one included Task at 100%, 2,747 seconds of canonical Segment time (displayed as 45m), and one excluded projection. The Project read model displayed 45m, proving the projection was not double-counted.

## 14. Browser Evidence

Real Web + API + isolated MySQL flow:

`Create Project "导游考试" -> create Task "第三章练习" -> publish & accept -> start Timer -> controlled 45m -> finish with completeTask=false -> Project shows 45m and 40% -> explicitly complete Task -> Project shows 100% and 1/1.`

The create form preselected `导游考试`. Refresh showed the Task under Project. A discovered stale Project-detail query after Task publication was fixed by invalidating both list and detail Project query prefixes. Detail tabs were then verified through browser back/forward: Overview -> `tab=time` -> back to Overview -> forward to `tab=time`.

Chromium device evidence for all three screenshots confirmed the expected URL/title, visible Project name, 45m, 100%, and exact viewport/scroll widths.

## 15. R1 Regression

The full database suite retained publish, accept, start, pause, resume, finish, completion, replay, rollback, continuation, Manual Actual, Quick Note creation/reward, QuickNote-to-Task conversion, Search, Journal-related snapshots, and user isolation. It passed 66/66 with no skips or TODO substitutions.

The full Web suite retained Timer, Tasks, Calendar, Quick Notes, Search, Writing/Journal, Settings, shell, and responsive component behavior. It passed 84/84. Production API/Web builds passed.

## 16. Deferred R2 Work

- QuickNote-to-Project material links: deferred R2A follow-up.
- Unified Trash: R2B or its designated later owner; Project archive/restore is complete independently.
- Habits, Growth, Period Reviews, Finance, Import, recurring schedules, milestones, dependencies, Gantt, templates, and notifications: not started.
- Existing legacy UNKNOWN/NONE Project attribution: intentionally unchanged; no guessing or repair.

## 17. Gate

`PROJECT_DOMAIN: PASS`  
`PROJECT_TASK_ASSOCIATION: PASS`  
`PROJECT_HISTORICAL_ATTRIBUTION: PASS`  
`PROJECT_PROGRESS: PASS`  
`PROJECT_TIME_AGGREGATION: PASS`  
`PROJECT_SEARCH_EXPORT: PASS`  
`PROJECT_MOBILE: PASS`  
`PROJECT_DESKTOP: PASS`  
`R1_REGRESSION: PASS`

`R2A_GATE: PASS`  
`READY_FOR_R2B: YES`

## Evidence Commands

```text
mysql ... personal_workbench_r2a_fresh_test < db/migration/V*.sql
TEST_DATABASE_URL=mysql://root@127.0.0.1:3408/personal_workbench_r2a_fresh_test npm run test:r2a
TEST_DATABASE_URL=mysql://root@127.0.0.1:3408/personal_workbench_r2a_fresh_test npm test -w apps/api
npm test -w apps/web
npm run typecheck
npm run lint
npm run build
ruby -e "require 'yaml'; YAML.load_file('docs/openapi.yaml')"
git diff --check
```
