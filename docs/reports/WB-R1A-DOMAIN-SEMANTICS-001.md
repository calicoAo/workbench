# WB-R1A-DOMAIN-SEMANTICS-001

Audit/implementation date: 2026-09-19 (Asia/Shanghai)

## 1. Scope

This work package freezes the R1A persistence and read semantics required by Personal Workbench vNext:

- Assignment continuation state separate from daily acceptance;
- one durable execution slot per user;
- legacy versus vNext TimerSession classification and canonical TimerSegments;
- timezone/business-date and occurrence-attribution snapshots;
- TaskCompletionEvent history;
- mutation receipt identity;
- Segment/slice TIMER projection identity and a normalized ActualTime read model.

The implementation is deliberately limited to schema, forward migration, pure queries, compatibility classification, contracts, and focused tests. It does not implement R1B start/pause/resume/finish, continuation-resolution, or Task completion commands. Existing terminal workflows remain legacy compatibility behavior.

## 2. Pre-R1A Baseline

| Item | Recorded value |
| --- | --- |
| Branch | `codex/workbench-auth-system` |
| HEAD at task start/end | `9b16b76ded6778b3ce6a32da9021994714abe039` |
| Workspace | npm workspaces: `apps/api`, `apps/web`; MySQL migrations under `db/migration` |
| Node / npm | Node `v24.2.0`, npm `11.3.0` |
| MySQL used for validation | MySQL `8.0.25`, isolated local server on port 33308 |
| Production migration fact inherited from R0 | successful maximum V18 |
| Existing migrations at start | V1, V2, V2.1, V3-V18; no V19 |
| Assigned migration | `V19__add_vnext_domain_semantics.sql` |

The working tree already contained the R0 Safety Closure changes, including Media application retirement, GET purity, tests, reports, and architecture/OpenAPI edits. Those changes were preserved. No stash, reset, checkout, cleanup, or production operation was performed.

V1-V18 were not edited. The focused suite verifies their complete SHA-256 values against the R0 audit ledger on every run.

## 3. Schema Delta

V19 adds four tables:

| Table | Purpose / identity |
| --- | --- |
| `timer_segments` | Canonical vNext timer intervals; at most one open, non-deleted Segment per Session |
| `user_execution_slots` | One row per user; nullable unique active Session reference and optimistic version |
| `task_completion_events` | Immutable completion lifecycle events, unique per task lifecycle and operation identity |
| `mutation_receipts` | Cross-domain operation identity, unique `(user_id, operation_id)`, fingerprint/snapshot/result metadata |

V19 extends existing tables:

- `users.timezone`, default `Asia/Shanghai`;
- Task optimistic version and current represented `completion_sequence`;
- Assignment acceptance status, record timezone, continuation state/handling/target fields and version;
- TimerSession `session_model`, fixed `record_timezone`, and version;
- Schedule timezone, UTC-semantic absolute actual interval, actual-time class, Session/Segment/slice identity, occurrence attribution, and version;
- Journal and QuickNote record timezone.

The SQL adds checks for state domains, Segment intervals, attribution status/ID consistency, complete Schedule time facts, TIMER projection shape, and all-or-none Segment projection identity. MySQL's real NULL/UNIQUE behavior was tested: multiple legacy null identities coexist, while `(user_id, timer_segment_id, slice_date)` rejects a duplicate projection.

## 4. Migration Strategy

The migration is forward-only and intentionally non-destructive.

1. Existing users receive `timezone = Asia/Shanghai` and one empty execution slot.
2. Existing Assignments receive `LEGACY_UNRESOLVED`, not `PENDING`.
3. Existing TimerSessions receive `LEGACY`; no Segment is synthesized and no slot is populated from a PAUSED row.
4. Existing Actual Schedules receive `LEGACY_ACTUAL`. Their date/time is converted from the frozen historical Shanghai wall-clock convention into explicit UTC-semantic `actual_started_at`/`actual_ended_at`. Legacy TIMER `source_id`, Segment identity, and pairing remain null.
5. Existing currently-DONE Tasks with a provable `completed_at` receive exactly one `LEGACY_COMPLETION` event. The historical Shanghai business date is preserved and the absolute instant is stored in UTC semantics. No reward path is invoked.
6. Journal and QuickNote date context is backfilled with the known historical `Asia/Shanghai` convention.
7. `media_watch_records`, `weekly_summaries`, Quick Note rows, reward rows, Task relationships, and legacy Timer/Schedule identities are otherwise untouched.

New absolute-time columns are mapped as UTC strings in Drizzle, then parsed at the ActualTime boundary. This prevents the Node process timezone from reinterpreting MySQL `DATETIME`. Product `recordTimezone` and process `TZ` remain separate concepts.

Rollback is not automatic: V19 changes table shapes, creates constraints, and classifies/backfills rows. A rollback would require a separately reviewed restore/forward migration. No down migration or Flyway repair was added.

## 5. Assignment Continuation Model

`assignment_status` describes acceptance for the assigned date (`ACCEPTED`, `RELEASED`). `continuation_state` independently describes resolution of that historical source:

| Value | Meaning | Actionable read behavior |
| --- | --- | --- |
| `LEGACY_UNRESOLVED` | Historical decision cannot be proven | Excluded |
| `PENDING` | Explicit new unresolved continuation | Included after source day |
| `CARRIED_FORWARD` | Resolved to a target Assignment | Excluded |
| `DEFERRED` | Delayed to explicit date/timezone | Included only when due |
| `DISMISSED` | Explicitly closed | Excluded |
| `RESCHEDULED` | Resolved to a Schedule/date | Excluded |

`GET /api/task-days/continuations?date=...` is a pure read over this contract. It excludes completed/archived/deleted Tasks and all legacy unresolved rows. V19 production-like evidence: 72/72 old Assignments remain `LEGACY_UNRESOLVED`; 0 become `PENDING`.

No carry or resolve mutation exists in R1A.

## 6. Execution Slot Model

`user_execution_slots.user_id` is the primary key; `active_session_id` is nullable, unique, and foreign-keyed to TimerSession. This creates a stable row for R1B `SELECT ... FOR UPDATE` even when no Session is active.

- V19 creates empty slots for existing non-deleted users.
- Registration creates the user, empty slot, and default categories in one transaction.
- A vNext PAUSED Session remains eligible as current when referenced by its slot.
- Frozen legacy PAUSED Sessions are not assigned to slots and cannot become current.
- Current-session GET performs no insert, repair, or lazy creation.

The focused suite proves duplicate user slots fail, a vNext PAUSED slot remains current, and 11 legacy PAUSED fixtures occupy zero slots.

## 7. Session / Segment Model

TimerSession owns workflow identity, Task/category source, lifecycle state, fixed `recordTimezone`, `session_model` (`LEGACY` or `VNEXT`), and optimistic version. `duration_minutes` remains for legacy compatibility or a derived cache; it is explicitly not a second vNext time fact.

TimerSegment owns actual execution intervals:

- UTC-semantic `started_at` / `ended_at`;
- `OPEN`, `CLOSED`, or `VOIDED` state;
- business date and fixed record timezone;
- Task and occurrence attribution snapshots;
- version/correction identity.

The generated `open_session_id` plus a unique index gives at most one open non-deleted Segment per Session. A Session may have any number of closed Segments, which supports pause/resume without treating pause gaps as elapsed time. Net vNext Timer time is the sum of valid closed Segment intervals, not Session duration.

## 8. Timezone Model

`user.timezone` is the default for new facts, initially `Asia/Shanghai`. Record snapshots do not change when that preference changes.

| Fact | Stored timezone/date semantics |
| --- | --- |
| Assignment, Journal, QuickNote | selected business date plus `recordTimezone` |
| TimerSession | fixed Session `recordTimezone` |
| TimerSegment | UTC-semantic interval plus business date and fixed timezone |
| Manual/legacy Actual Schedule | UTC-semantic interval plus schedule date and fixed timezone |
| TaskCompletionEvent | UTC-semantic occurrence plus business date and fixed timezone |

Tests run with process `TZ=UTC` and explicitly cover UTC, Asia/Shanghai, Asia/Tokyo, and the 23-hour America/New_York DST day. Updating the fixture user's preference to Tokyo leaves all migrated Assignment, Session, and CompletionEvent snapshots at Shanghai.

## 9. Occurrence Attribution Model

TimerSegment and Schedule Actual facts carry occurrence-time project/category fields. The status is explicit:

- `UNKNOWN`: historical attribution cannot be proved;
- `NONE`: explicitly no project / uncategorized;
- `ATTRIBUTED`: the corresponding occurrence ID is present.

Checks reject an attributed state without an ID and reject an ID attached to UNKNOWN/NONE. There is intentionally no Projects table or project FK in R1A. Legacy records are not joined to a Task's current category/project to invent history. New manual Actual records freeze the reliable current category and explicit no-project state.

## 10. Completion Event Model

`task_completion_events` can represent every future non-DONE to DONE lifecycle with `(task, lifecycle_version)`, occurrence instant, record timezone, business date, optional operation identity, and source.

The production-like fixture proves:

- 11 current DONE Tasks with `completed_at` produce 11 legacy events;
- reward count remains exactly 1 fixture row before and after migration;
- a second lifecycle event for the same Task is valid with lifecycle version 2;
- no unknown reopen/completion history is fabricated.

Current R0 completion commands do not yet append these events. Reopen/complete command integration is an explicit R1B requirement, not an R1A PASS claim.

## 11. Mutation Receipt Model

`mutation_receipts` stores operation ID, command type, contract version, SHA-256-sized fingerprint, normalized request JSON, result reference/metadata, creation time, and optional commit time. The database enforces unique `(user_id, operation_id)`.

The focused test proves a second row with the same operation ID and a changed fingerprint is rejected while the original fingerprint/snapshot remains available for replay comparison. R1B must supply transaction-aware lookup/insert/replay logic; R1A does not introduce a command bus or generic workflow engine.

## 12. ActualTime / Projection Semantics

`execution-read-model.ts` is the canonical normalized read owner:

| Source | Included in ActualTime | Canonical owner |
| --- | --- | --- |
| Closed, non-deleted vNext TimerSegment | Yes | Segment interval |
| Manual ACTUAL Schedule | Yes | Schedule absolute interval |
| Eligible legacy ACTUAL Schedule | Yes | Schedule absolute interval |
| TIMER Schedule projection | No | Display-only projection |
| TimerSession duration | No | Legacy/derived cache |

`GET /api/timer-sessions/actual-time?date=...&timezone=...` clips intervals to the requested business-day UTC bounds and returns seconds without per-segment minute rounding. A real query fixture containing one Segment, its TIMER projection, and one manual Actual returns exactly two facts: `TIMER_SEGMENT` and `MANUAL_ACTUAL`.

New TIMER projections carry Session ID, Segment ID, and slice date. One Segment may produce multiple date slices; each Segment/date pair can occur once. Legacy TIMER Actual rows keep null Segment identity and coexist under MySQL NULL/UNIQUE behavior.

## 13. Legacy Migration Results

The production-like fixture was constructed at V18, populated with the R0 production cardinalities, then migrated with V19.

| Invariant | Before | After | Result |
| --- | ---: | ---: | --- |
| Tasks | 21 | 21 | PASS |
| Assignments | 72 | 72 | PASS |
| Legacy-unresolved Assignments | n/a | 72 | PASS |
| PENDING historical Assignments | n/a | 0 | PASS |
| PAUSED TimerSessions | 11 | 11 LEGACY | PASS |
| TimerSegments synthesized | 0 | 0 | PASS |
| Legacy Session in execution slot | 0 | 0 | PASS |
| TIMER Actual Schedules | 11 | 11 LEGACY_ACTUAL | PASS |
| Guessed Schedule source/Segment linkage | 0 | 0 | PASS |
| Fixture reward events | 1 | 1 | PASS |
| Legacy completion events | n/a | 11 provable DONE facts | PASS |

Quick Notes and `weekly_summaries` receive no unrelated row mutation; Media is not dropped. The test fixture does not invent production rows for those empty R0 tables.

## 14. Contract / OpenAPI Delta

Implemented public reads:

- `GET /api/task-days/continuations`;
- `GET /api/timer-sessions/current`;
- `GET /api/timer-sessions/actual-time`.

OpenAPI documents those routes plus User timezone, Assignment continuation, Session model/timezone/version, TimerSegment, Schedule actual/projection identities, CompletionEvent, MutationReceipt, and ActualTime entries. The YAML parses successfully. Drizzle schema, enums, route Zod query validation, OpenAPI, and architecture ownership were updated together.

No R1B mutation endpoint is documented or implemented. Web does not import API source and no new shared workspace/package was introduced; the narrow runtime contracts remain API-owned in the current architecture.

## 15. Validation Evidence

| Command | Result | Evidence |
| --- | --- | --- |
| Fresh V1-V19 against isolated MySQL 8.0.25 | PASS | all migrations executed from empty schema |
| V1-V18 fixture then V19 | PASS | exact 21/72/11/11 preservation and classifications above |
| `TEST_DATABASE_URL=... npm run test:r1a` | PASS | 5/5 top-level focused tests; 0 skip/TODO |
| `TEST_DATABASE_URL=... npm run test -w apps/api` | PASS | 19/19; focused migration plus existing workflow/surface tests |
| `TEST_DATABASE_URL=... npm run test:workflows:ci` | PASS | 13/13 workflow tests; strict gate 0 skip/TODO |
| `npm run test -w apps/web` | PASS | 49/49, 10/10 files |
| `npm run typecheck` | PASS | API and Web |
| `npm run lint` | PASS | API and Web TypeScript lint scripts |
| `npm run build` | PASS | API TypeScript and Web Vite production build |
| OpenAPI YAML parse | PASS | Ruby YAML parser accepted `docs/openapi.yaml` |
| `git diff --check` | PASS | no whitespace errors |
| V1-V18 checksum ledger | PASS | every full SHA-256 matches the R0 audited bytes |

The test scripts and CI job now set `TZ=UTC`. Business timezone behavior is tested explicitly rather than inherited from the developer machine. CI still uses Flyway 10 for migrate/validate; the local environment had no Flyway/Docker binary, so local fresh/fixture validation applied the same ordered SQL files directly to MySQL. No production database was accessed in R1A.

## 16. Remaining R1B Requirements

Each item below is `R1B REQUIRED SCENARIO`, not a skipped or passing R1A test:

1. Receipt-first replay/conflict handling and the fixed receipt -> slot -> Task -> Session/Segment -> Assignment -> Reward lock order.
2. Atomic accept/start with one active vNext Session per user and an initial open Segment.
3. Pause closes only the current Segment, preserves the slot, and excludes the pause gap.
4. Resume creates a new Segment using the Session's frozen timezone/attribution rules.
5. Finish closes the Segment, releases the slot, produces cross-day projections, rewards once, and defaults `completeTask=false`.
6. Continuation carry/defer/dismiss/reschedule commands with expected version and operation identity.
7. Complete/reopen commands that append TaskCompletionEvent for each real lifecycle while preserving first-reward eligibility.
8. Correction/void semantics for Segment versions and derived projection rebuilding.
9. Settings mutation for future default timezone without historical rewrites.
10. Project attribution mutation only after pausing; Projects domain remains R2.

## 17. R1A Gate Assessment

| Gate | Decision | Basis |
| --- | --- | --- |
| Schema | PASS | V19 tables/columns/checks/identities exist and Drizzle matches |
| Migration | PASS | fresh and production-like MySQL runs preserve required cardinalities; V1-V18 unchanged |
| Contracts | PASS | implemented pure reads, Zod, ORM, OpenAPI, architecture, and tests agree |
| Legacy Timer preservation | PASS | 11 remain LEGACY; no Segment, slot, or guessed Schedule link |
| Time truth single owner | PASS | Segment is vNext timer fact; TIMER projection and Session duration excluded from ActualTime |
| R1B readiness | YES | R1A foundations are complete; R1B requirements remain explicitly bounded |

Architecture delta: Execution now owns a narrow pure read model and the slot/Segment persistence boundary; mutation receipts own only operation identity; Tasks own Assignment continuation and completion history. Route-centric CRUD and existing workflow owners remain. No speculative repository/service layer, command bus, event store, or Projects domain was added.

```text
R1A_SCHEMA:
PASS

R1A_MIGRATION:
PASS

R1A_CONTRACTS:
PASS

LEGACY_TIMER_PRESERVATION:
PASS

TIME_TRUTH_SINGLE_OWNER:
PASS

R1A_GATE:
PASS

READY_FOR_R1B:
YES
```

This task stops at R1A. No R1B command implementation was started.
