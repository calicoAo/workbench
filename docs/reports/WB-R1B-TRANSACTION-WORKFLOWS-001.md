# WB-R1B-TRANSACTION-WORKFLOWS-001

Date: 2026-09-20

## 1. Scope

This work package implements the R1B backend command layer over the R1A data model. It adds retry identity, per-user Execution serialization, vNext Session/Segment lifecycle commands, Task lifecycle commands, Assignment and continuation commands, and Manual Actual commands. It does not implement the R1C Web integration or any R1D page workflow.

No production database was connected to or changed. All database evidence below came from a temporary local MySQL 8.0.25 instance and databases whose names ended in `_test`.

Workspace baseline at task start:

| Item | Evidence |
| --- | --- |
| Branch | `codex/workbench-auth-system` |
| HEAD | `9b16b76ded6778b3ce6a32da9021994714abe039` |
| Node / npm | Node `v24.2.0`, npm `11.3.0` |
| Working tree | Dirty R0/R1A WIP was present and preserved; no stash, reset, cleanup, or overwrite was performed |
| Migration baseline | V1, V2, V2.1, V3-V19; V19 was the frozen R1A migration |
| V19 SHA-256 | `daac9ac8adf77651d04b6bd0c26280471f61554204424972ef13154ff543feda` |
| R1A focused baseline | Passed against real MySQL before and after R1B changes |

The pre-existing WIP included the R0 safety changes, R1A schema/read model, Media Watch retirement, architecture/OpenAPI edits, API test work, and Web edits visible in `git status`. This work package changed only the R1B-owned surfaces plus the minimum test determinism correction described in section 15.

## 2. R1A Inputs

The implementation consumes the R1A owners and identities without changing V1-V19:

- `timer_segments` is canonical vNext timer time.
- `user_execution_slots` is the single-active-Session serialization row.
- `mutation_receipts` owns mutation identity and replay metadata only.
- `task_completion_events` owns immutable completion lifecycles.
- Assignment continuation fields own resolution state and target references.
- `(userId, timerSegmentId, sliceDate)` is the TIMER projection identity.
- `recordTimezone`, absolute UTC interval fields, business dates, and occurrence attribution remain the R1A time model.

The R1B test suite pins the V19 SHA-256 above. V1-V18 remain pinned by the R1A checksum test.

## 3. Mutation Receipt Implementation

`apps/api/src/mutation-receipt.ts` provides one transaction-aware `runMutation` capability. It does not dispatch commands or own domain state machines.

For a first request it inserts `(userId, operationId)`, a command type/version, a stable SHA-256 request fingerprint, and a stable request snapshot inside the outer transaction. After the domain owner succeeds, the same transaction writes result reference/metadata and `committedAt`.

A duplicate operation row is locked. Matching command type/version/fingerprint returns stored result metadata before current domain versions or terminal states are reinterpreted. A changed fingerprint returns 409. An uncommitted orphan receipt returns an explicit repair conflict. A transaction failure rolls back both the receipt and domain changes.

Verified evidence:

- Same operationId and request replays the exact result.
- Changed parameters return 409.
- A trigger-injected failure after receipt claim leaves zero receipt/domain rows.
- Retrying after that rollback commits exactly one Session, Segment, Assignment, and receipt.

## 4. Locking / Execution Slot

R1B Execution commands use the fixed order:

```text
mutation receipt
-> user_execution_slots
-> Task (stable ID order where multiple Tasks are involved)
-> TimerSession / TimerSegment
-> Assignment / continuation
-> Rewards
```

`apps/api/src/execution-slot.ts` locks the per-user slot with `FOR UPDATE`. Start requires an empty slot; PAUSED keeps the Session ID; finish/cancel release it in the owner transaction. A missing slot or mismatched slot/Session returns a 409 repair-required conflict and is not auto-healed.

A real two-request concurrent-start test produced exactly one success, one conflict, one Session, and one occupied slot.

## 5. Start / Pause / Resume / Finish / Cancel

`apps/api/src/work-session.ts` is the single vNext Execution transaction owner.

| Command | Atomic result |
| --- | --- |
| start | slot claim, Task transition if needed, Session, first open Segment, existing Assignment validation, receipt |
| accept-and-start | start result plus Assignment accept/create in the same transaction |
| pause | close open Segment, generate date-slice projections, derive duration, set PAUSED, retain slot; no final reward |
| resume | validate PAUSED/slot/version, create exactly one new open Segment, set RUNNING |
| finish | close an open Segment when needed, derive net Segment seconds, finish Session, release slot, grant Timer reward once, optionally complete Task |
| cancel | void all Session Segments, soft-delete projections, set CANCELLED, release slot, grant no reward |

Finish defaults to `completeTask=false`. A zero-second immediate finish closes the Segment but creates no zero-length projection. Matching pause/resume/finish/cancel retries replay their committed result; a different operation against a terminal Session conflicts.

Session `recordTimezone` always snapshots `user.timezone` at start. Assignment timezone input remains a separate Assignment context. A setting change does not alter the active Session; a new Session uses the new setting.

## 6. Task Completion

`apps/api/src/task-completion.ts` owns complete, reopen, archive, and soft removal.

A real non-DONE to DONE transition sets status/progress/completedAt/version, increments the lifecycle sequence, inserts one `TaskCompletionEvent`, closes PENDING/DEFERRED continuations, and invokes the existing first-completion reward capability in one transaction. Matching retries add no event. A different completion operation on an already-DONE Task adds no event.

Reopen clears the current completion state but preserves completion events, time, rewards, and resolved continuations. A second real completion creates a second event, while the existing `task_done:<userId>:<taskId>` reward key keeps first-completion reward count at one.

Archive and delete-equivalent finalization close pending continuations. Removal is soft, preserving historical Session, Segment, Schedule, Assignment, completion, and reward facts.

## 7. Complete + Finish Atomic Workflow

`finishWorkSession({ completeTask: true })` owns the cross-domain transaction. It closes the current Segment, writes all projections, derives time, finishes the Session, releases the slot, completes the Task, inserts the completion event, closes continuations, and grants Task/Timer rewards before committing one receipt.

A reward-table trigger injected after the earlier writes proved full rollback: Session remained RUNNING, Segment remained OPEN, Task remained IN_PROGRESS, slot remained occupied, and there were zero projections, completion events, reward events, and finish receipt rows.

## 8. Assignment Commands

`apps/api/src/task-assignments.ts` owns:

- retryable `acceptTaskForDate` using the existing `(userId, taskId, taskDate)` uniqueness;
- retryable `releaseAssignment`, which changes only Assignment acceptance and preserves time facts;
- atomic `acceptAndStartTask` participation through the public transaction-aware accept capability;
- compatibility `replaceAssignmentsForDate` for `PUT /task-days`.

The compatibility set workflow now locks Tasks then Assignments, updates ACCEPTED/RELEASED and sort order, and inserts only missing rows. It no longer route-deletes/reinserts Assignment history, and an unchanged repeated set does not increment versions.

## 9. Continuation Resolution

`resolveContinuation` validates and locks every source version before changing any source. All sources must belong to one continuable Task.

| Resolution | Atomic behavior |
| --- | --- |
| CARRIED_FORWARD | close all sources and create/reuse one target Assignment without overwriting an existing target's sort/focus |
| DEFERRED | store target date/timezone and handled time; GET visibility is date-derived and performs no write |
| DISMISSED | permanently resolve the candidate; later explicit accept remains possible |
| RESCHEDULED | create/reuse target Assignment, create planned Schedule, and resolve every source together |

A stale version among two sources produced 409 and left both sources PENDING. Completion/archive close pending continuations, and reopen does not resurrect them.

## 10. Manual Actual

`apps/api/src/manual-actual.ts` owns retryable record, correct, and cancel operations. A Manual Actual is a MANUAL Schedule with absolute UTC interval, record timezone, business date, category occurrence snapshot, version, and `manual:<operationId>` source identity. It does not create a TimerSegment or use TIMER source.

Default behavior is time-only. The optional record-and-complete command holds the slot/Task locks and commits the Manual Actual, Task completion event, continuation closure, reward effects, and receipt together. A trigger-injected reward failure left neither Schedule nor Task transition.

Included Manual Actual intervals reject overlap with included schedules and open/closed valid Timer Segments. An explicit excluded overlap is stored but omitted from ActualTime. Correction replaces the source interval once; cancellation soft-deletes the source fact.

## 11. Projection / ActualTime

Every non-zero closed Segment is split at its Session `recordTimezone` business-day boundary. Each slice is a TIMER Schedule projection identified by `(userId, timerSegmentId, sliceDate)`. TIMER projections cannot be edited by generic Calendar routes.

ActualTime reads:

```text
Timer time    = CLOSED, non-deleted TimerSegments
Manual time   = included, non-deleted MANUAL_ACTUAL Schedules
Legacy time   = included, eligible LEGACY_ACTUAL Schedules
Projection    = excluded from aggregate truth
```

The pause/resume test measured three 10-minute Segments separated by two 10-minute gaps and returned exactly 1,800 seconds. A Shanghai 23:50-00:10 Segment produced exactly two slice projections and 1,200 seconds.

### R1A_CONTRACT_CORRECTION

V20, `V20__add_actual_time_inclusion.sql`, is the only new migration. It adds `schedules.include_in_actual_time`, backfills any pre-existing V19 TIMER projection to 0, and enforces that TIMER projections cannot be marked included. This field is required to persist the designed "overlapping annotation excluded from ActualTime" choice; V19 had no durable representation for it.

V20 SHA-256: `c66f766845062731d48ff229750c746727870d22d27a707f2d6ecf70d1c72623`.

A dedicated production-like migration fixture stopped at V19, inserted a valid TIMER projection, applied V20, verified `include_in_actual_time=0`, and verified that MySQL rejects setting it to 1.

## 12. Legacy Compatibility

The focused suite created 11 frozen legacy PAUSED Sessions and 11 eligible legacy TIMER Actual Schedules.

- No legacy Session became current through the execution slot.
- No legacy Session received a Segment.
- Resume against a legacy Session returned 409.
- All 11 legacy Actual rows appeared exactly once in ActualTime.
- All legacy rows retained null Session/Segment linkage; no source linkage was guessed.

## 13. API / Contract Delta

Zod routes and `docs/openapi.yaml` now document operationId, expected versions, replay/conflict behavior, and the transaction owner paths for:

- Task complete/reopen/archive/remove;
- Assignment accept/release and continuation resolve/carry-over;
- Timer start/accept-and-start/pause/resume/finish/cancel;
- Manual Actual record/correct/cancel and optional completion.

An authenticated Hono integration test executed the new Timer start and finish payloads and confirmed default time-only finish. OpenAPI parsed successfully as 3.0.3.

`docs/ARCHITECTURE.md` now records the R1B owners and lock order. The existing route-centric architecture is preserved; no command bus, repository layer, or parallel source of truth was introduced.

## 14. Failure Injection / Concurrency Evidence

| Evidence | Result |
| --- | --- |
| Session insert trigger after receipt/Task work | Full rollback; retry committed exactly once |
| Reward insert trigger during complete-and-finish | Full rollback of time, projections, Task, event, rewards, slot release, and receipt |
| Reward insert trigger during Manual Actual + completion | Full rollback of Schedule, Task, event, reward, and receipt |
| Concurrent starts for different Tasks/devices | One success, one conflict |
| Two-source continuation with one stale version | 409; zero partial source updates |
| Response-lost simulation by identical finish retry | Exact stored result replay; one Timer reward |

## 15. Full Validation

All database tests used `TEST_DATABASE_URL=mysql://root@127.0.0.1:3407/personal_workbench_r1b_test` on temporary MySQL 8.0.25. The database was recreated from V1 through V20 after the final migration edit.

| Command / check | Result |
| --- | --- |
| ordered fresh migration to V20 | PASS |
| V18 production-like fixture -> V19 -> V20 | PASS |
| V19 TIMER-projection fixture -> V20 | PASS |
| `npm run test:r1a` | PASS, 6/6, no skipped/TODO |
| `npm run test:r1b` | PASS, 22/22, no skipped/TODO |
| `npm run test:workflows` | PASS, 6/6, no skipped/TODO |
| `TEST_DATABASE_URL=... npm run test` | PASS, API 35 and Web 49, no skipped/TODO |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| OpenAPI YAML parse | PASS, version 3.0.3 |
| `git diff --check` | PASS |

The Web test initially failed because its hard-coded target date equaled the environment's current date (`2026-09-20`), so React correctly observed no state change. The test now chooses a guaranteed different date. This is a deterministic test-only correction; production behavior was not changed.

Required database scenarios 1-38 map to executable tests as follows:

| Required cases | Test evidence |
| --- | --- |
| 1-4 operation identity | replay/change conflict; receipt rollback/retry test |
| 5-9 execution slot | concurrent start; paused/finish/cancel slot lifecycle; repair conflict |
| 10-13 segments | multi-resume lifecycle; gap duration; resume replay; cross-midnight split |
| 14-16 finish | response-lost replay; default time-only; reward once |
| 17-21 completion | direct/retry/reopen; atomic complete-and-finish success/failure |
| 22-24 Assignment | duplicate accept; release preserves time; accept-and-start rollback |
| 25-30 continuation | merge target; multi-version conflict; deferred/dismissed; completion/archive/reopen |
| 31-34 Manual Actual | 30m time-only; correction; exclusion; atomic combined workflow |
| 35-38 legacy | 11 PAUSED non-current; 11 Actual once-counted; no Segment; no guessed linkage |

## 16. Remaining R1C / R1D Requirements

R1C must integrate the Web client with operationId generation/persistence, expected versions, current Session/Segment responses, pause/resume/cancel, explicit continuation actions, and Manual Actual inclusion/correction UI. It must preserve an operationId across response-loss retries and refresh from committed server state after success/conflict.

R1D remains out of scope. No Today redesign, Router/Query migration, Projects, Growth redesign, Quick Notes R1.5, Finance, Agent Bridge, Media DROP, or general command infrastructure was started.

## 17. R1B Gate Assessment

```text
OPERATION_IDEMPOTENCY:
PASS

EXECUTION_SLOT_SERIALIZATION:
PASS

SESSION_SEGMENT_LIFECYCLE:
PASS

TASK_COMPLETION_ATOMICITY:
PASS

CONTINUATION_WORKFLOW:
PASS

MANUAL_ACTUAL:
PASS

LEGACY_COMPATIBILITY:
PASS

R1B_GATE:
PASS

READY_FOR_R1C_INTEGRATION:
YES

READY_FOR_R1D:
NO
```
