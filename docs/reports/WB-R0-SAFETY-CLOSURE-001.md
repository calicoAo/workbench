# WB-R0-SAFETY-CLOSURE-001

Audit date: 2026-09-19 (Asia/Shanghai)

## 1. Scope

This R0 G1 safety-closure task implemented only the authorized application changes:

- B04a: remove the remaining business write from `GET /api/rewards` and prove repeated Rewards/Dashboard reads are observational.
- B01a: retire Media Watch from the application layer while preserving its deployed table, ORM mapping, migration, and stored rows.
- B00b: make the existing transaction/retry/rollback baseline an explicit gate decision.
- Freeze the disposition of the 11 legacy PAUSED TimerSessions and 11 unlinked TIMER Actual Schedules.

No vNext Timer schema, TimerSegment, execution slot, mutation receipt, lifecycle change, rollover redesign, migration edit, Flyway repair, production write, or Media table drop was performed. The branch remained `codex/workbench-auth-system`; HEAD remained `9b16b76ded6778b3ce6a32da9021994714abe039`. Pre-existing untracked audit work under `docs/reports/` was preserved.

## 2. Audit Facts Inherited

The following facts are inherited from `WB-R0-DATA-SEMANTICS-AUDIT-001` and were not re-guessed:

| Fact | Inherited evidence |
| --- | --- |
| Canonical migration lineage | Production baseline V16, Quick Notes V17 checksum `1652612228`, workflow projection identity V18 checksum `-812618562`; maximum deployed version 18 |
| V17 action | Keep V17 Quick Notes and V18 workflow identity unchanged; no rename, checksum edit, or `repair` |
| Task/Assignment inventory | 21 Tasks: 10 TODO, 11 DONE; 72 assignments; no measured duplicate/orphan/sort anomaly |
| Timer inventory | 11 TimerSessions, all PAUSED; one user owns all 11 active-status legacy rows |
| Timer/Schedule linkage | 11 TIMER Actual Schedules, all `source_id IS NULL`; stable unique linkage 0/11 |
| Other production inventory | Quick Notes 0; weekly summaries 0 |
| Prior GET audit | Dashboard pure; sole discovered business GET write was Rewards -> `ensureGrowth` -> `INSERT user_growth` |
| Prior CI baseline | GitHub Actions run `35446518281`, exact HEAD above: 12/12 MySQL workflow tests, 54/54 Web tests, typecheck/lint/build PASS |

Production data and Flyway history were not queried or modified again for this closure task.

## 3. GET Purity Change

### Ownership decision

The old `ensureGrowth` had two roles: an implicit prerequisite of the Rewards query and a missing-row prerequisite of the redeem write command. A Growth row is not required at registration and reward-grant transactions already create it when they persist the first reward. Therefore:

- `GET /api/rewards` now directly selects `user_growth` and returns the same in-memory zero summary as Dashboard when no row exists.
- No user row is initialized, repaired, or updated by a GET.
- The helper remains only for the redeem mutation and is named `ensureGrowthForWrite` so its write contract is explicit.
- Existing users without a row receive `{ level: 1, xpTotal: 0, coins: 0, xpInLevel: 0, xpForNextLevel: 50 }` without persistence.
- No event bus, new service layer, or registration-time write was introduced.

### Focused evidence

`apps/api/tests/workflows.test.ts` now calls Rewards and Dashboard three times with no Growth row, then three times with an existing Growth row. Before/after snapshots compare:

- row counts for all 22 business tables in the migrated schema, including `media_watch_records` and legacy `weekly_summaries`;
- every row key and `updated_at` value for all business tables that have `updated_at`;
- zero-value and existing-value Growth response equality across both GET endpoints.

The focused test passed against a fresh isolated MySQL 8 database with V1-V18 applied. A repository-wide GET route scan found no remaining GET call to an `ensure*` write helper. The explicit `POST /api/daily-carryovers` remains the owner of date preparation.

`B04a_GET_PURITY: PASS`

## 4. Media Application Decommission

Removed application surfaces:

- API route module and `/api/media-watch-records` registration;
- Dashboard query and `mediaWatchRecord` response field;
- Web Media Watch feature, editor panel, request code, types, and feature tests;
- History Media tab, archive request, record union, and presentation mapping;
- Media reward amount and trigger path;
- OpenAPI Media endpoints, Dashboard field, and request/response schemas.

Preserved intentionally:

- `db/migration/V8__add_media_watch_records.sql`;
- `mediaWatchRecords` in `apps/api/src/db/schema.ts`;
- all production rows and schema state.

Runtime source/OpenAPI scans find no Media reference outside the preserved Drizzle mapping. Authenticated GET and POST requests to the retired path both return 404 in `apps/api/tests/app-surface.test.ts`. Journal, Morning Writing, Stock Review, Quick Notes, and Writing/Reflection routes and owners were not changed. The History test now verifies switching from Morning Writing to Journal instead of calling Media.

`docs/ARCHITECTURE.md` now records that Media Watch has no application owner or public surface and that physical cleanup is a separate decision. Historical ADR text remains as history and is explicitly superseded.

`B01a_MEDIA_APP_DECOMMISSION: PASS`

## 5. Test Baseline Decision

### B00b decision

`B00b_TEST_BASELINE: PASS`

The baseline is real rather than mock-only:

1. Exact-HEAD CI run `35446518281` used an empty MySQL 8 service, applied and validated all migrations through V18, and passed 12/12 workflow tests with 0 skipped/TODO.
2. Those tests execute real transactions for Task completion, Timer finish/pause, projection identity, reward idempotency, carryover retry/concurrency, and injected rollback failures.
3. This task created a fresh ephemeral local MySQL 8 database, applied V1-V18, and passed the expanded strict suite 13/13 with 0 skipped/TODO.
4. The complete API suite passed 14/14, including the database workflows and the Media route-surface test.

`LOCAL_DATABASE_TEST_ENV: PASS (ephemeral isolated database)`

The repository's usual `TEST_DATABASE_URL` was initially unset and the default local ports 3306/3307 were closed, so the first API/workflow commands correctly BLOCKED before executing business tests. A local MySQL binary was then run only against a `mktemp` data directory on port 33307. The temporary server was shut down and its directory moved to macOS Trash after validation. No persistent or production database was used.

One diagnostic run under the host's Asia/Shanghai process timezone reproduced an existing fixture/driver time mismatch in the concurrent pause test (`09:00` fixture start versus `02:00` Drizzle end, duration 0). Running with `TZ=UTC`, matching GitHub's runner environment, passed the full suite. This was an environment interpretation issue; no Timer code was changed.

## 6. Legacy Timer Disposition

`LEGACY_TIMER_DISPOSITION: FROZEN`

The following migration disposition is binding input to R1A; it does not mutate current data:

- Preserve all 11 PAUSED TimerSessions. Do not finish, cancel, resume, segment, relink, or delete them.
- They are legacy terminal artifacts under current semantics, not vNext active sessions, and must not be candidates for a future `/timer-sessions/current` response.
- Current Dashboard compatibility already exposes only `TimerStatus.RUNNING`; PAUSED rows are not returned as `activeTimer`/`activeTimers`. There is no current `/timer-sessions/current` endpoint.
- Preserve all 11 unlinked TIMER Actual Schedules as `LEGACY ACTUAL` candidates. Each Schedule contributes its own duration once to ActualTime; do not add the associated legacy TimerSession duration again.
- Do not infer `sourceId`, Task association, or pairing from title or nearby timestamps. Stable linkage remains 0/11.
- Continuing a Task under vNext creates a new vNext Session; it never resumes a legacy PAUSED row.
- R1A may add an explicit legacy classification/cutover marker, but this task adds no field, table, backfill, or new Timer model.

## 7. Validation Evidence

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | PASS | API and Web TypeScript checks exit 0 |
| `npm run lint` | PASS | Current repository lint scripts are TypeScript checks; both workspaces exit 0 |
| `npm run build` | PASS | API build and Web Vite production build; 1,602 modules transformed |
| `npm run test -w apps/web` | PASS | 49/49 tests, 10/10 files, 0 reported skip/TODO |
| `TZ=UTC TEST_DATABASE_URL=... npm run test -w apps/api` | PASS | 14/14 tests, including 13 real-DB workflows and 1 Media route-surface test |
| `TZ=UTC TEST_DATABASE_URL=... npm run test:workflows:ci` | PASS | 13/13 business tests, 0 failed/cancelled/skipped/TODO; strict reporter self-tests 6/6 |
| `npx tsc -p apps/api/tsconfig.test.json --noEmit` | PASS | New test code compiles |
| OpenAPI YAML parse | PASS | Ruby YAML parser accepted `docs/openapi.yaml` |
| Media runtime reference scan | PASS | Only preserved `db/schema.ts` mapping and V8 migration remain in runtime/schema scope |
| `git diff --check` | PASS | No whitespace errors |

Test-count change is expected: the removed Media Web feature suite contained five tests, taking Web from 54 to 49. API grew from 12 database cases to 13 plus one non-database surface case.

## 8. Remaining R0 Items

- R0.5 may physically remove `media_watch_records` and its Drizzle mapping only through a separately reviewed migration/data-retention decision. It is not required for application detachment and was deliberately not performed.
- The two trashed ephemeral database directories are recoverable under `~/.Trash/workbench-r0-test.*`; they contain test-only data and no repository or production state.
- R1A still needs to encode the frozen legacy Timer classification/cutover rule in its schema design. No historical linkage may be invented during that work.
- The standard persistent local database remains unconfigured; this task proved a repeatable ephemeral path and did not modify repository environment defaults.

There is no remaining blocker in B00b, B04a, B01a, or the legacy disposition decision.

## 9. R0 Gate Assessment

| Gate | Decision | Basis |
| --- | --- | --- |
| B00b test/invariant baseline | PASS | Exact-HEAD CI evidence plus current 13/13 isolated MySQL workflow run |
| B04a GET purity | PASS | Pure-select implementation and full-table count/updated-at regression test |
| B01a Media application decommission | PASS | No route, aggregate, Web entry/call, reward trigger, or OpenAPI endpoint; 404 test passes |
| Legacy Timer disposition | FROZEN | Rules above are explicit; current Dashboard excludes PAUSED rows |
| R0.5 physical cleanup | DEFERRED / ALLOWED | Table, mapping, migration, and data preserved; application fully detached |
| Ready for R1A schema design | YES | All G1 safety-closure gates are satisfied; R0.5 may proceed independently |

Architecture delta: the active Media Watch public surface was removed and the architecture record updated. No new layer, shared abstraction, dependency, schema owner, or competing source of truth was introduced.

```text
B00b_TEST_BASELINE:
PASS

B04a_GET_PURITY:
PASS

B01a_MEDIA_APP_DECOMMISSION:
PASS

LEGACY_TIMER_DISPOSITION:
FROZEN

R0_GATE:
PASS_WITH_REMAINING_R0_5

READY_FOR_R1A:
YES
```

This task stops at R0 safety closure. No R1A work was started.
