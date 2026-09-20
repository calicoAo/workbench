# WB-R0-DATA-SEMANTICS-AUDIT-001

- Audit date: 2026-09-19 (Asia/Shanghai)
- Scope: repository, migration lineage, CI test database, deployed production schema/data, current code and tests
- Authority: `PRD_VNEXT.md` v1.4, `FUNCTIONAL_DESIGN_VNEXT.md` v1.4, `DEVELOPMENT_PLAN_VNEXT.md` v1.4, `PERSONAL_WORKBENCH_FINANCE_PRD.md` v1.2, `ARCHITECTURE.md`
- Production access mode: aggregate/schema `SELECT` only; no production writes, Flyway repair, migration, rename, or data correction
- Result: `PASS_WITH_BLOCKERS`

## 1. Executive Summary

The repository and deployed database now have a trustworthy R0.1 baseline, with these main conclusions:

1. The repository currently has 19 uniquely versioned migrations: V1, V2, V2.1, and V3 through V18. The historical duplicate V17 existed in Git, but the repository now keeps Quick Notes at V17 and workflow projection identity at V18.
2. Production Flyway history is verified, not inferred. It contains a baseline at V16, then successful V17 Quick Notes and V18 workflow projection identity rows. Production is at V18 and the current HEAD deployment successfully validated the migration set. No repair or migration change is recommended for the canonical production lineage.
3. Production V1-V16 are represented only by the V16 baseline row. Their individual version, description, checksum, and install time are therefore not recoverable from Flyway history. The V2 `completion_note` and V2.1 `schedules.kind` columns are present in the actual production schema, but their historical checksums remain unknown.
4. Production has 21 current Tasks (10 TODO, 11 DONE), 72 TaskDailyAssignments, 11 TimerSessions, 11 TIMER Schedules, 0 Quick Notes, and 0 weekly summaries. No Assignment duplicate-key/orphan/sort anomaly or Task completion-state inconsistency was found by the queries in this report.
5. All 11 TimerSessions are PAUSED and belong to the same user. All 11 TIMER Schedules have `source_id IS NULL`. No Session can be uniquely linked to a Schedule using the current stable identity. The proven linkage rate is `0 / 11 = 0.00%`; all unmatched rows are `UNKNOWN / LEGACY CANDIDATE` and must not be guessed into pairs.
6. Current Task completion and Timer terminal workflows have explicit transaction owners, stable current-generation projection identities, reward event deduplication, retry replay, and rollback coverage. The current behavior is narrower than vNext: pause is terminal, no resume/segments exist, and no operation receipt, completion event history, timezone snapshot, occurrence snapshot, cross-day slicing, or per-user execution slot exists.
7. Dashboard GET is observational and database-tested. The full business GET scan found one remaining write chain: `GET /api/rewards -> ensureGrowth -> INSERT user_growth` when the row is missing. Therefore the repository does not yet satisfy the global GET-purity invariant.
8. Local typecheck, lint, build, and 54 Web tests passed. Local API/database tests were blocked because no dedicated `_test` database was available and the installed local `mysqld` cannot start due to a missing ICU 69 library. The same HEAD's CI independently passed Flyway migrate/validate, 12 database workflow tests with no skips/TODOs, 54 Web tests, typecheck, lint, and build.

The audit result is `PASS_WITH_BLOCKERS`, not full PASS. The evidence is sufficient to proceed with R0.2 and to scope R0.3. R1A's gate is not yet met because R0.3 and the remaining R0 application-level work are unfinished, and the 11 PAUSED legacy Sessions require an explicit migration/user-resolution policy before execution-slot backfill.

## 2. Workspace Baseline

### Git

| Item | Value |
| --- | --- |
| Branch | `codex/workbench-auth-system` |
| HEAD | `9b16b76ded6778b3ce6a32da9021994714abe039` |
| Upstream | `origin/codex/workbench-auth-system` |
| Ahead/behind | `0/0` |
| Initial `git status` | Clean; no staged, unstaged, or untracked files |
| Existing WIP | None detected at audit start |
| Audit write | This report only |

No reset, checkout, stash, cleanup, migration edit, or production write was performed.

### Workspace and toolchain

| Item | Value / command |
| --- | --- |
| Repository shape | npm workspaces monorepo, `apps/*` |
| Runtime apps | `apps/api` (Hono/Drizzle/MySQL), `apps/web` (React/Vite) |
| Shared schema evolution | `db/migration/*.sql` via Flyway |
| Node | `v24.2.0` locally; CI uses Node 22 |
| npm | `11.3.0`; repository lockfile is `package-lock.json` |
| Other installed managers | pnpm `9.11.0`, Yarn `1.22.5`; neither is the repository runner |
| API dev | `npm run dev -w apps/api`; default `http://localhost:3000` |
| Web dev | `npm run dev -w apps/web`; default `http://localhost:5173` |
| Combined dev | `npm run dev` |
| API production start | `npm run start -w apps/api` after build |
| API tests | `npm run test -w apps/api`; requires migrated `TEST_DATABASE_URL` ending `_test` |
| Strict workflow tests | `npm run test:workflows:ci` |
| Web tests | `npm run test -w apps/web` |
| Required static/build checks | `npm run typecheck`, `npm run lint`, `npm run build` |

`lint` currently invokes TypeScript checking in both workspaces; it is not an ESLint-style rule set.

### Database connection and environments

| Environment | Connection / runner | Verified state |
| --- | --- | --- |
| Repository development default | `.env.example` and `db/flyway.conf` point to MySQL on `127.0.0.1:3307/personal_workbench` | Not reachable during audit (`ERROR 2003`) |
| Local isolated test | Must end in `_test`; no `TEST_DATABASE_URL` was set | BLOCKED; local `mysqld 8.0.25` cannot load `libicuuc.69.dylib` |
| CI isolated test | GitHub MySQL 8 service, ephemeral `personal_workbench_test`, Flyway 10 container | VERIFIED for HEAD; 19 migrations applied, final V18 |
| Production | Compose MySQL 8.0.46, internal port 3306, API uses `DATABASE_URL`; Flyway service reads production secret from server `deploy/.env` | VERIFIED read-only; schema/data/history queried |

Credentials are intentionally omitted. The production server reports session/global timezone as `SYSTEM`; deployment sets container `TZ=Asia/Shanghai` and JDBC uses `serverTimezone=Asia/Shanghai`.

### Flyway runners

- Local config: `db/flyway.conf`, filesystem location `db/migration`, table `flyway_schema_history`, `baselineOnMigrate=true`, `validateOnMigrate=true`.
- CI: `flyway/flyway:10-alpine`, empty `_test` database, `baselineOnMigrate=false`, `validateMigrationNaming=true`, then `migrate validate`.
- Production: `deploy/migrate.sh` invokes Compose profile `tools`; `flyway/flyway:10-alpine`, `baselineVersion=16`, `baselineDescription=Production baseline before automated deployment`, validation and naming validation enabled.
- Development caveat: root `npm run db:init` loads only V1 directly and does not create Flyway history or apply V2-V18. It must not be treated as a full current schema bootstrap.

## 3. Database / Flyway State

### Environment distinction

| Fact | Repository | CI test database | Production database |
| --- | --- | --- | --- |
| Migration files | 19 files, V1..V18 including V2.1 | 19 applied from empty database | Baseline V16 + V17 + V18 history rows |
| Maximum version | V18 file exists | V18 | V18 |
| V17 meaning | Quick Notes | Quick Notes | Quick Notes |
| V18 meaning | Workflow projection identity | Workflow projection identity | Workflow projection identity |
| V1-V16 checksums | Files present | Validated on clean schema | Not recorded individually; production is baselined at V16 |
| Existing business data | Not inferable | Test fixtures only, ephemeral | Queried in sections 5-6 |

### Production Flyway history

`PRODUCTION_FLYWAY_HISTORY: VERIFIED`

| rank | version | description | type | script | checksum | installed_on | success |
| ---: | ---: | --- | --- | --- | ---: | --- | ---: |
| 1 | 16 | Production baseline before automated deployment | BASELINE | Production baseline before automated deployment | NULL | 2026-09-18 15:25:20 | 1 |
| 2 | 17 | add quick notes | SQL | `V17__add_quick_notes.sql` | 1652612228 | 2026-09-18 15:25:20 | 1 |
| 3 | 18 | add workflow projection identity | SQL | `V18__add_workflow_projection_identity.sql` | -812618562 | 2026-09-18 15:25:20 | 1 |

The maximum successful deployed version is 18. The successful deployment of the audited HEAD later reported `Successfully validated 20 migrations`, `Current version ... 18`, and `Schema ... is up to date`. The count includes the resolved/applied baseline context; the clean CI database reports 19 versioned migrations.

### Repository migration inventory

The order below is Flyway semantic order, not lexicographic filename order. SHA-256 prefixes identify current repository bytes; they are not Flyway checksums.

| Order | File | SHA-256 prefix |
| ---: | --- | --- |
| 1 | `V1__init_schema.sql` | `f4fcca48` |
| 2 | `V2__add_task_completion_note.sql` | `d6186b8b` |
| 3 | `V2_1__schedule_kind.sql` (version 2.1) | `1095c479` |
| 4 | `V3__schedule_source.sql` | `177fd031` |
| 5 | `V4__add_morning_writing_and_water.sql` | `b3f883e3` |
| 6 | `V5__add_water_last_drink_time.sql` | `067d65a4` |
| 7 | `V6__update_default_category_colors.sql` | `ec0c5f4b` |
| 8 | `V7__add_water_drink_times.sql` | `98a358d6` |
| 9 | `V8__add_media_watch_records.sql` | `951be25c` |
| 10 | `V9__seed_owner_user_password.sql` | `9aad31d3` |
| 11 | `V10__add_schedule_carryovers.sql` | `c9817d80` |
| 12 | `V11__add_task_due_at.sql` | `0456a859` |
| 13 | `V12__add_task_progress_percent.sql` | `a0c3aa9e` |
| 14 | `V13__add_growth_rewards_and_ai_insights.sql` | `e8cfb9d3` |
| 15 | `V14__add_task_category_dimensions.sql` | `bbbc29fa` |
| 16 | `V15__add_decision_tools.sql` | `7f313156` |
| 17 | `V16__add_daily_task_assignments.sql` | `b9d6bf08` |
| 18 | `V17__add_quick_notes.sql` | `8f05fb6d` |
| 19 | `V18__add_workflow_projection_identity.sql` | `b03d21bc` |

Current repository findings:

- No duplicate version is present.
- No integer version from 1 through 18 is missing; V2.1 is intentionally ordered between V2 and V3.
- Fresh CI migration naming validation, migration, and validation pass on all 19 files.
- Production validates the current V17/V18 checksums.
- Production Flyway cannot validate historical V1-V16 checksums because those versions were baselined, not individually recorded.

## 4. Migration Conflict Analysis

### V2 / V2.1 history

Git history shows that `V2__schedule_kind.sql` originally coexisted with `V2__add_task_completion_note.sql`, then commit `d086d736...` renamed schedule kind to `V2_1__schedule_kind.sql`. This creates a historical risk for any database that ran the old schedule-kind V2 before the rename:

- Its Flyway V2 description/checksum could refer to schedule kind rather than task completion note.
- Current validation would disagree at V2.
- Applying V2.1 could attempt to add an already-present `kind` column.

Production does not expose individual V2 rows because it was baselined at V16. Actual schema inspection confirms both `tasks.completion_note` and `schedules.kind` exist. This proves shape, not migration lineage or checksum.

### Duplicate V17 history

Git history establishes this sequence:

1. Commit `d086d736...` added `V17__add_workflow_projection_identity.sql`.
2. Commit `76c6f425...` added `V17__add_quick_notes.sql`, temporarily creating duplicate V17 files.
3. Commit `12ea6ae0...` renamed workflow projection identity to V18. Its old V17 SHA-256 was `f3cf164e...`; the current V18 bytes differ because the filename header also changed.

Production chose the desired canonical lineage: V17 Quick Notes and V18 workflow projection identity. There is no production V17 conflict to fix.

### Recommended V17 strategy

1. Keep the repository and canonical production lineage unchanged: Quick Notes V17, workflow projection identity V18.
2. Do not run `repair`, rename V17/V18 again, or edit either deployed file.
3. Before migrating any other persistent environment, export its `flyway_schema_history` and inspect actual `quick_notes`, `timer_sessions`, and `schedules` shape.
4. If an environment has no V17, migrate V17 then V18 after backup and validation.
5. If V17 is Quick Notes with the current checksum, apply/validate V18 normally.
6. If V17 is the old workflow projection migration, stop automated migration. Treat it as a divergent lineage. Preserve the exact applied migration and design a separately reviewed forward reconciliation/adoption path above the environment's maximum version; do not guess, reuse the canonical V17 file, or silently repair metadata.

No migration action is required for production in this task.

## 5. Existing Data Inventory

All counts in this section are production aggregate queries executed read-only on 2026-09-19.

### Task / Assignment

| Metric | Result |
| --- | ---: |
| Task rows | 21 |
| Current / soft-deleted Tasks | 21 / 0 |
| TODO / IN_PROGRESS / DONE / ARCHIVED | 10 / 0 / 11 / 0 |
| TaskDailyAssignment rows | 72 |
| Duplicate `(user_id, task_id, task_date)` groups / excess rows | 0 / 0 |
| Orphan task / orphan user assignments | 0 / 0 |
| Non-positive assignment sort order | 0 |
| Duplicate `(user_id, task_date, sort_order)` groups | 0 |
| DONE without `completed_at` | 0 |
| non-DONE with `completed_at` | 0 |
| Current DONE Tasks with first-completion reward | 11 / 11 |
| Current DONE Tasks with Assignment on `DATE(completed_at)` | 6 / 11 |

Actual Assignment uniqueness is database-enforced by `uk_user_task_date(user_id, task_id, task_date)`.

Current completion facts are split as follows:

- Current lifecycle truth: `tasks.status`, with `tasks.completed_at` and `completion_note` for the current completion.
- First-completion reward truth: `reward_events.event_key = task_done:<userId>:<taskId>`, unique globally by `uk_event_key`.
- Daily selection: `task_daily_assignments`; it contains date and sort order only. It has no completion/result field and no completion-event reference.

Therefore `completedAt`, reward event, and Assignment daily result are not explicitly linked. A same-date Assignment can be derived for only 6 of the 11 currently DONE Tasks, and even those matches are not a persisted attribution contract. Reopen overwrites/clears current `completedAt`; historical daily completion cannot be reconstructed reliably from the current schema.

### Quick Notes

| Metric | Result |
| --- | ---: |
| Table exists | Yes |
| All/current/soft-deleted rows | 0 / 0 / 0 |
| `quick_note` reward events | 0 |
| Current note without reward / reward without note | 0 / 0 |

The production table matches the current Drizzle/route fields: id, user, note date, optional title, required content, optional tag, timestamps, and nullable `deleted_at`. OpenAPI documents GET/POST and explicitly describes DELETE as hard delete, matching the route.

Deletion is currently hard delete: `DELETE /api/quick-notes/:id` executes SQL DELETE. `deleted_at` is a legacy unused soft-delete marker; GET filters it but no current route sets it.

Creation and the 6 XP / 2 coin reward are not in one transaction. The route inserts the note, reads it, then calls a separate reward transaction. `quick_note:<userId>:<insertId>` plus `uk_event_key` prevents a repeated reward grant for the same inserted note ID. It does not prevent a retried POST from inserting a second note with a new ID and a second reward, and it does not roll back the note if reward persistence fails.

### `weekly_summaries`

| Metric | Result |
| --- | ---: |
| Table exists | Yes |
| All/current/soft-deleted rows | 0 / 0 / 0 |
| ORM mapping | None |
| API route/service | None |
| Web consumer | None |
| OpenAPI endpoint | None in current vNext API contract |

Schema: id, user, `week_start`, `week_end`, achievements, problems, next-week plan, timestamps, nullable `deleted_at`, with unique `(user_id, week_start)`. In the current deployed system this is an empty, unused legacy table, not an active Period Review source. This task does not create a replacement table.

## 6. Timer / Schedule Linkage Analysis

### Production inventory

| Metric | Result |
| --- | ---: |
| TimerSession rows (current/deleted) | 11 / 0 |
| RUNNING / PAUSED / FINISHED / CANCELLED | 0 / 11 / 0 / 0 |
| Users with more than one RUNNING-or-PAUSED Session | 1 |
| Active-status rows for that user / excess rows | 11 / 10 |
| RUNNING over 4 hours | 0 |
| PAUSED duration over 4 hours | 0 |
| Maximum PAUSED recorded duration | 94 minutes |
| TIMER Schedule rows | 11 |
| TIMER Schedules with null `source_id` | 11 |
| TIMER Schedules with non-null source but missing Session | 0 |

Current code treats pause as a terminal projection/reward operation and provides no resume endpoint. The production PAUSED rows therefore reflect legacy/current terminal semantics, while vNext defines PAUSED as active and resumable. They must not be silently used to populate `user_execution_slots`.

### Proven linkage

The only accepted identity for current-generation Timer projections is:

`schedules(user_id, source=TIMER, source_id=CAST(timer_sessions.id AS CHAR))`

Production and migration V18 define unique index:

`uk_user_source_identity(user_id, source, source_id)`

Results using only that identity:

| Metric | Result |
| --- | ---: |
| Total Sessions | 11 |
| Sessions with exactly one projection | 0 |
| Sessions with no projection | 11 |
| Sessions with more than one projection | 0 |
| Non-null TIMER Schedule sources linked to a Session | 0 |
| Null-source TIMER Schedules | 11 |
| **Timer/Schedule uniquely linkable rate** | **0 / 11 = 0.00%** |

`Timer/Schedule 可唯一关联率: 0 / 11 = 0.00%`

The 11 Sessions and 11 null-source TIMER Schedules may look numerically symmetric, but there is no stable key. Per the vNext contract, titles or nearby timestamps must not be used to pair them. Classification:

`UNKNOWN / LEGACY CANDIDATE: 11 TimerSessions + 11 null-source TIMER Schedules`

Dashboard currently aggregates ACTUAL Schedule durations and does not separately add TimerSession duration, so its current code path does not double-sum both tables. This is not yet the vNext single-source ActualTime contract, and the legacy records remain unattributed.

## 7. Existing Transaction Semantics

### Task completion

| Guarantee | Current status | Evidence |
| --- | --- | --- |
| Task transition to DONE and `completedAt` | Yes | `task-completion.ts` locks Task `FOR UPDATE` and updates within the caller transaction |
| Task reward in same transaction | Yes | `grantTaskDoneRewardInClient` receives the same Drizzle transaction client |
| First reward deduplication | Yes | `task_done:<userId>:<taskId>` + unique `reward_events.event_key` |
| Direct-completion retry avoids duplicate Actual | Yes, for stable `completionKey` | `task-completion:<completionKey>` stored in Schedule `source_id`; same payload replays, changed payload conflicts |
| Already-DONE no-op | Yes | `completeTask` returns `completed:false`, reward null |
| Transaction rollback | Yes | CI test forces reward insert failure and observes Task fields/growth unchanged |
| Completion history across reopen | No | No TaskCompletionEvent table; status route clears current `completedAt` |
| General operation receipt | No | No `mutation_receipts` table or `operationId` contract |

The database tests also show that reopening then completing with a new completion key creates a second Actual Schedule but does not repeat the first-completion reward. That is not equivalent to preserving completion-event history.

### Timer finish / pause

| Guarantee | Current status | Evidence |
| --- | --- | --- |
| Session status update | Yes | `work-session.ts` row-locks Session and updates inside outer transaction |
| ACTUAL Schedule projection | Yes for current terminal operation | Same transaction, source TIMER, `source_id=sessionId` |
| Timer/partial reward | Yes | Same transaction client; event keys are session-based |
| `completeTask=false` default | Yes | finish route Zod schema defaults false |
| Explicit optional Task completion | Yes for finish | Same outer transaction calls `completeTaskInClient` only when requested |
| Duplicate finish replay | Yes for matching current command | Terminal state, completion intent, projection and requested times are checked |
| Concurrent finish/pause dedup | Yes | Session row lock plus unique projection identity; database tests cover both |
| Combined rollback | Yes | CI fault-injection test observes Session, Task, Schedule, rewards, and growth rolled back |
| Pause rollback test | Code-level transaction only | Same outer transaction, but no focused pause fault-injection test |
| Resume / pause-gap exclusion | No | Pause is terminal in current code; no resume or TimerSegment |
| Cross-day projection | No | One Schedule per Session; no day slicing |
| Single active Session per user | No | start checks only RUNNING for the same Task; no user slot/constraint |
| Cancel | No route | Enum value exists; no cancel command |

The current database identity is deliberately session-level and permits only one Schedule per TimerSession. It must be extended before multi-segment resume is enabled.

### Manual Actual

`POST /api/schedules` inserts a manual ACTUAL and may grant a Schedule reward, but does not update Task status. Thus manual Actual currently does not auto-complete a Task. The Schedule insert and optional reward are separate transactions, so this path is not atomic with its reward.

## 8. GET Side Effect Inventory

All registered GET handlers and their direct call chains were inspected. The only business GET write chain found is:

| GET route | Call chain | Possible write | Status |
| --- | --- | --- | --- |
| `GET /api/rewards` | route -> `ensureGrowth(userId)` -> select -> missing-row insert -> select | `INSERT user_growth` | Violates global GET-purity invariant |

Important read-only cases:

- `GET /api/dashboard`: select-only. It does not call carryover or `ensureGrowth`; missing Growth is represented in memory. CI repeats the GET three times and verifies no Assignment, Schedule, carryover marker, or Growth row is created.
- `GET /api/tasks`, `/api/task-days`, `/api/quick-notes`, `/api/task-categories`, `/api/ai-insights`, daily-record list/detail routes, decision/bridge history, `/api/auth/me`, and `/api/health`: select/computation only in current handlers.
- Date preparation is an explicit `POST /api/daily-carryovers`, called before the first Dashboard read by the Web workspace. Ordinary Dashboard refresh performs only GET.

No GET -> UPDATE, DELETE, rollover, or carryover chain was found. R0.3 still has real work because the Rewards GET can insert Growth.

Exhaustive registered GET inventory at this HEAD:

| Route group | GET endpoints inspected | Current result |
| --- | --- | --- |
| Health/Auth | `/api/health`, `/api/auth/me` | Read-only |
| Aggregates/Growth | `/api/dashboard`, `/api/rewards` | Dashboard read-only; Rewards has the `ensureGrowth` insert chain above |
| Tasks | `/api/tasks`, `/api/task-days` | Read-only |
| Quick Notes | `/api/quick-notes` | Read-only |
| Categories | `/api/task-categories` | Read-only |
| Writing/history | `/api/journals`, `/api/journals/list`, `/api/morning-writings`, `/api/morning-writings/list`, `/api/stock-reviews`, `/api/stock-reviews/list` | Read-only |
| Daily records | `/api/sleep-records`, `/api/water-records`, `/api/media-watch-records`, `/api/media-watch-records/list` | Read-only |
| AI/Decision | `/api/ai-insights`, `/api/decision-tools/decisions`, `/api/decision-tools/bridges` | Read-only |

There is currently no GET handler under TimerSession or Schedule routes; both modules expose mutation endpoints only.

## 9. Test Baseline

### Local execution

| Command | Result | Test count | Reason / notes | Related to WIP? |
| --- | --- | ---: | --- | --- |
| `npm run typecheck` | PASS | N/A | API `tsc --noEmit` and Web `tsc -b --noEmit` exited 0 | No WIP present |
| `npm run lint` | PASS | N/A | Both workspace TypeScript checks exited 0; this is not semantic linting | No |
| `npm run build` | PASS | N/A | API compile + Web production bundle; 1603 modules transformed | No |
| `npm run test -w apps/web` | PASS | 54/54, 11 files | No skipped/TODO reported | No |
| `npm run test -w apps/api` | BLOCK | 0 business tests | `TEST_DATABASE_URL` absent; suite deliberately rejects non-dedicated/missing DB | Environment, not WIP |
| `npm run test:workflows:ci` | BLOCK locally | 6/6 reporter self-tests; 0 business tests | Reporter self-test passed, then workflow suite failed before execution because no `_test` DB | Environment, not WIP |

The attempt to create a local isolated database was also blocked before any data directory was created because local `mysqld 8.0.25` cannot load `libicuuc.69.dylib`. No existing database was modified.

### Same-HEAD CI evidence

GitHub Actions run `35446518281` for exact HEAD `9b16b76...` completed successfully:

| CI command/stage | Result | Count / evidence |
| --- | --- | --- |
| Flyway migrate + validate on empty `_test` DB | PASS | 19 migrations, final V18, validated before and after |
| `npm run test:workflows:ci` | PASS | 12/12 business tests, 0 failed/cancelled/skipped/TODO; reporter self-tests 6/6 |
| `npm run test -w apps/web` | PASS | 54/54 tests, 11/11 files |
| `npm run typecheck` | PASS | exit 0 |
| `npm run lint` | PASS | exit 0 |
| `npm run build` | PASS | exit 0 |

CI URL: <https://github.com/calicoAo/workbench/actions/runs/35446518281>

Deployment run `35446593110` used the same HEAD, validated production Flyway history at V18, restarted services, and passed health checks. This is deployment/migration evidence, not a substitute for production data queries.

## 10. Invariant Matrix

`NOT_IMPLEMENTED` means the vNext invariant is absent; it is not a test failure and is not counted as PASS.

| Invariant | Current status | Code evidence | Test/data evidence | vNext stage |
| --- | --- | --- | --- | --- |
| Task completion retry does not repeat reward | PASS (current scope) | Task lock; DONE no-op; unique `task_done` event key; direct completion key | CI task completion retry/reopen test: one reward | R0.2 baseline; generalized identity R1B |
| Timer finish retry does not repeat time | PASS (current scope) | terminal replay + unique `(user,source,sourceId)` | CI matching and concurrent finish tests: one projection/reward | R0.2 baseline |
| Timer finish defaults to not completing Task | PASS | finish body defaults `completeTask=false` | CI concurrent finish leaves Task TODO | R0.2 baseline |
| Pause/resume gap is excluded | NOT_IMPLEMENTED | No TimerSegment/resume; pause is terminal | No target test | R1A/R1B |
| One active Session per user | NOT_IMPLEMENTED | start checks same user+same task RUNNING only; no slot | Production has one user with 11 PAUSED Sessions | R1A/R1B |
| Cross-day slicing | NOT_IMPLEMENTED | One session-level Schedule; fixed date/time projection | No target test | R1A/R1B |
| Business GET has no writes | FAIL | Rewards GET calls `ensureGrowth` insert path | Dashboard-only purity test passes; Rewards GET untested | R0.3 |
| Daily rollover is idempotent | PASS for current carryover semantics | explicit POST; assignment and plan units use unique identities/upserts | CI retry, concurrent, isolation, rollback/retry tests | R0.3; target continuation semantics R1B/B04b |
| Manual Actual does not auto-complete Task | PASS by code | Schedule route never updates Task | No focused DB assertion; Web Calendar tests cover request ownership only | R0.2 baseline / R1B preserve |
| Timer/Schedule is counted once | PARTIAL / LEGACY BLOCKER | Dashboard counts ACTUAL Schedules, not TimerSession duration; no ActualTime owner | Production stable linkage 0%; 11+11 legacy candidates | R1A |
| QuickNote create retry does not duplicate record/reward | NOT_IMPLEMENTED | New insert ID per POST; reward is separate transaction | No QuickNote reliability tests; production has 0 rows | R1.5 / B29a |
| Task reopen preserves completion history | NOT_IMPLEMENTED | Only current `completedAt`; reopen clears it; no event table | Existing test proves reward once, not event history | R1A/R1B |
| Occurrence attribution snapshot | NOT_IMPLEMENTED | Current task edits update TimerSession/Schedule category; no project/category occurrence fields | No target test | R1A/R1B |
| Timezone snapshot | NOT_IMPLEMENTED | Fixed Asia/Shanghai conversion; no user/record/period timezone fields | No target test | R1A/R1B |
| OperationId receipt | NOT_IMPLEMENTED | No `mutation_receipts`; current keys are workflow-specific | No target test | R1A/R1B |

## 11. Blockers / Unknowns

1. **V1-V16 production lineage:** Production was baselined at V16. Actual shape can be checked, but per-version checksums/install times cannot be reconstructed from Flyway history.
2. **Local database reproducibility:** Local configured DB is down, Docker/Flyway CLI are unavailable, and local `mysqld` has a broken ICU dependency. CI is currently the only verified isolated DB runner for this HEAD.
3. **Legacy Timer attribution:** 11 Sessions and 11 TIMER Schedules have no stable link. All remain `UNKNOWN / LEGACY CANDIDATE`; historical pairing and per-source canonical ownership are unknown.
4. **Execution-slot migration:** One production user has 11 PAUSED rows. Because current pause is terminal but vNext pause is active, an explicit legacy classification/user resolution is required before slot backfill.
5. **GET purity:** Rewards GET can write Growth.
6. **QuickNote reliability:** Creation/reward is non-atomic and request retry is not idempotent. No current data exists, so there is no data repair need, but behavior remains a known exception.
7. **Completion history:** Current data has only the latest completion timestamp and first reward. Prior reopen/completion events cannot be recovered without inventing history.
8. **Weekly summaries:** Production is empty, which removes a content migration blocker, but the table has no current owner/consumer and must not be duplicated by a new Period Review table before R2 design.
9. **No focused tests:** Rewards GET purity, QuickNote atomicity/idempotency, manual-Actual Task non-completion at DB level, pause rollback injection, resume/gaps, cross-day behavior, slots, snapshots, and receipts are not currently covered.

## 12. Recommended R0 Actions

1. Record the verified production history as canonical: baseline V16, Quick Notes V17, workflow identity V18. Make no V17/V18 migration change and no repair.
2. For R0.2, retain the current transaction/retry/rollback tests as regression gates. Restore a local isolated MySQL/Flyway environment when practical, but do not block CI-backed investigation or point tests at production.
3. In R0.3, remove the `ensureGrowth` write from Rewards GET. Reads should return an in-memory zero summary when absent; Growth creation belongs in registration or an explicit repair/write command. Add a database assertion that Rewards GET creates no row.
4. Preserve the explicit `POST /api/daily-carryovers` and its current idempotency tests. Do not implement the new continuation semantics in R0.3.
5. Before R1A slot/segment migration, define a reviewed disposition for all 11 PAUSED production Sessions. Do not mark them active, finished, cancelled, or linked based on inference. Preserve all 11 null-source TIMER Schedules as legacy Actual candidates.
6. Design R1A's legacy marker/read rules around the measured 0% stable linkage rate. New Timer data may use stronger identities; old rows must remain countable once without fabricated links.
7. Preserve current Task completion, Timer finish/pause, reward event keys, and projection uniqueness while adding future semantics. Do not replace working transaction owners with route-level orchestration.
8. Defer QuickNote soft-delete and atomic/idempotent create changes to B29; add tests before changing behavior. No reward-policy change is needed.
9. Treat empty `weekly_summaries` as a verified legacy table. Do not create Period Review in R0; use the R2 design to choose one future owner and forward migration.
10. Complete the separately scoped R0 application work, including GET purity and Media application detachment, before declaring the R0 release gate complete.

### Gate decisions

| Gate question | Decision | Reason |
| --- | --- | --- |
| Ready to enter R0.2? | YES | Existing regression suite and isolated CI DB are verified for exact HEAD; local DB remains an environment blocker to record, not a production-data reason to skip tests |
| Ready to enter R0.3? | YES | GET scan is complete enough to scope the known Rewards write; Dashboard purity and explicit carryover already have tests |
| Is R0.3 complete? | NO | Rewards GET still inserts Growth |
| Ready to start R1A schema design under the published gate? | NO | R0 is not complete; Media application detachment is separate, Rewards GET remains impure, and legacy PAUSED Session disposition must be decided first |

## 13. Evidence / Commands

Representative commands used; secrets and host identity are redacted where appropriate.

```bash
git branch --show-current
git rev-parse HEAD
git status --short --branch
git diff --name-status
node --version
npm --version
cat package.json apps/api/package.json apps/web/package.json
```

```bash
rg --files db/migration | sort
shasum -a 256 db/migration/*.sql
git log --all --date=iso-strict --name-status -- db/migration
git show d086d736861ed76ee29d67b845fecd7dff0551ac:db/migration/V17__add_workflow_projection_identity.sql
```

```bash
npm run typecheck
npm run lint
npm run build
npm run test -w apps/web
npm run test -w apps/api
npm run test:workflows:ci
```

```bash
gh run view 35446518281 --json conclusion,headSha,jobs,url
gh run view 35446518281 --log
gh run view 35446593110 --log
```

Production queries were sent through SSH to the existing MySQL container with the server-side password passed only through `MYSQL_PWD`. Only SELECT/information-schema statements were executed. Core query shapes:

```sql
SELECT installed_rank, version, description, type, script, checksum,
       installed_on, execution_time, success
FROM flyway_schema_history
ORDER BY installed_rank;

SELECT status, COUNT(*) FROM tasks
WHERE deleted_at IS NULL GROUP BY status;

SELECT user_id, task_id, task_date, COUNT(*)
FROM task_daily_assignments
GROUP BY user_id, task_id, task_date HAVING COUNT(*) > 1;

SELECT status, COUNT(*) FROM timer_sessions
WHERE deleted_at IS NULL GROUP BY status;

SELECT ts.id, COUNT(s.id) AS projection_count
FROM timer_sessions ts
LEFT JOIN schedules s
  ON s.user_id = ts.user_id
 AND s.source = 1
 AND s.source_id = CAST(ts.id AS CHAR)
 AND s.deleted_at IS NULL
WHERE ts.deleted_at IS NULL
GROUP BY ts.id;

SELECT COUNT(*) FROM quick_notes;
SELECT COUNT(*) FROM weekly_summaries;
```

Code evidence is concentrated in:

- `apps/api/src/task-completion.ts`
- `apps/api/src/work-session.ts`
- `apps/api/src/routes/timer-sessions.ts`
- `apps/api/src/routes/tasks.ts`
- `apps/api/src/routes/task-days.ts`
- `apps/api/src/routes/dashboard.ts`
- `apps/api/src/routes/quick-notes.ts`
- `apps/api/src/routes/schedules.ts`
- `apps/api/src/routes/rewards.ts`
- `apps/api/src/rewards.ts`
- `apps/api/src/db/schema.ts`
- `apps/api/tests/workflows.test.ts`
- `db/migration/*.sql`

No production behavior or architecture boundary changed. `docs/ARCHITECTURE.md` remains valid and was not modified.

`R0_AUDIT_RESULT: PASS_WITH_BLOCKERS`
