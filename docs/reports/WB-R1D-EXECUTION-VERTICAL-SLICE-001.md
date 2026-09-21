# WB-R1D-EXECUTION-VERTICAL-SLICE-001

Date: 2026-09-20  
Result: `PASS`  
Scope: Personal Workbench vNext / R1D Execution Vertical Slice

## 1. Scope

R1D delivers the first daily-use execution path on the existing R1A/R1B truths:

`Publish -> Accept -> Start -> Pause -> route switch/refresh -> Resume -> Finish without completion -> Start again -> Complete and finish -> Timeline/totals/rewards -> Journal`

It also exposes direct completion without fake time, Manual Actual without implicit completion, continuation decisions, day/week Calendar, historical browsing, exact cross-day slicing, responsive layouts, and explicit loading/empty/error/ready states. It does not implement Projects, Habits, Quick Notes UI, month/recurring Calendar, Finance, Agent Bridge, Search, Growth, or any R1.5 capability.

No production database was connected to or changed. All database and browser evidence used local MySQL `8.0.46` databases whose names end in `_test`.

## 2. Pre-R1D Baseline

| Item | Baseline |
| --- | --- |
| Branch | `codex/workbench-auth-system` |
| HEAD before R1D | `531569197d64a6d43abfea43be855e77937168d6` |
| Initial worktree | clean |
| Node / npm | `v24.2.0` / `11.3.0` |
| R1C gate | all seven R1C gates PASS; `READY_FOR_R1D: YES` |
| Runtime | Web `127.0.0.1:5173`, API `127.0.0.1:3000` |
| Isolated DBs | `personal_workbench_r1d_test`, `personal_workbench_r1d_e2e_test`, `personal_workbench_r1d_fresh_validation` |

The implementation kept Today as composition, Tasks/Assignments as Task surfaces, Timer as Execution UI/command owner, Calendar as Planned/Manual Actual owner, Rewards as reward owner, Writing/Reflection as text owner, and React Query as replaceable server snapshot state. `docs/ARCHITECTURE.md` records the activated R1D boundary.

## 3. Bounty Board

`/tasks` now provides available, accepted, completed, and archived views; card/list modes; Inbox/category/priority/deadline/keyword filters; state-dependent primary actions; and a More menu for secondary/destructive actions. Projects are absent because no Project capability exists.

The create surface requires only title and supports optional category, priority, difficulty, description, deadline, estimate, and progress. `publish-and-accept` calls `task-publishing.ts`, which creates Task and Assignment under one mutation receipt and transaction. The R1D DB test proves replay stability and rollback on injected Assignment failure.

## 4. Task Detail

`/tasks/:taskId` is a refresh-safe route with Task fields, assignment state, planned blocks, source-aware ActualTime history, completion result, timestamps, and state-dependent commands. Real browser deep-link validation found exactly one `R1D 真执行闭环` detail heading after direct navigation.

Finish on Task detail uses the Timer-owned finish panel. The page cannot bypass the default incomplete finish semantics.

## 5. Today

Today composes, in order, Current Focus, continuation decisions, grouped bounties, Timeline/Calendar, lifestyle snapshots, canonical summary, and Journal handoff. Assignment `focus_rank` owns up to three focus items; it does not alter Task `pinned`.

Empty dates remain valid. The real historical route displayed `查看 9月18日` and the explicit warning that starts belong to real today. Before/after DB counts remained `2` Assignments and `0` carryover receipts, proving historical browsing issued no continuation/carryover write.

Initial Today loading has a fixed request fan-out, not one request per Task: explicit carryover only for real today, then Dashboard, Tasks, Assignments, Continuations, Current Session, and ActualTime queries. Task detail adds one aggregate request only when opened.

## 6. Current Focus / Timer

MiniTimer and Current Focus consume the same `current-session` query. Browser evidence showed both as RUNNING for the same Task and MiniTimer remained PAUSED after a route switch and full refresh. Pause/resume/finish invalidate the scoped server snapshots.

The shared finish panel shows Segment-derived net time, Segment count, optional progress, and optional note. Its default command sends `completeTask: false`; Task completion remains a distinct button. ESC close, focus trap, initial focus, and focus return were exercised in the real browser. Today rows no longer expose a direct finish shortcut that could bypass this panel.

## 7. Continuation UX

Continuation candidates are grouped by Task while preserving every backend `sourceAssignmentId` and version. Carry, defer, dismiss, and reschedule use explicit labels and one backend resolution command. R1B tests prove one target Assignment, deferred visibility, dismissal persistence, and all-or-nothing version conflict behavior.

## 8. Timeline

The Web maps the backend `ActualTime` contract into explicit `计划`, `计时`, `补录`, and `历史实际` labels. TIMER projection schedules are not aggregate truth and are not editable through ordinary Schedule editing. Running time is displayed from the active Session but does not enter the settled summary.

`dailyExecutionForUser` is the only settled summary owner. Today and Calendar consume `completedAssignments`, `totalAssignments`, `focusedSeconds`, `actualSeconds`, and `plannedSeconds`; Calendar no longer totals minute-rounded visual blocks.

## 9. Calendar Day/Week

`/calendar` has day and seven-day week modes. Real browser validation returned seven `打开日视图` links. Planned records support create/update/cancel/reschedule with `PENDING`, `EXECUTED`, `CANCELLED`, and `RESCHEDULED` lifecycle state. Manual Actual enters the correction workflow; Timer Actual and Legacy Actual are read-only in the generic editor.

V21 adds `schedules.lifecycle_state`, `rescheduled_from_schedule_id`, and Assignment `focus_rank`, with constraints/indexes and no rewrite of R1A/R1B truths.

## 10. Quick Add

Quick Add contains only `发布悬赏`, `安排计划`, and `补录实际`. Each Calendar action carries a UI nonce so closing and reopening the same type on the same URL works, and the menu closes before navigation. No R1.5 action was added.

## 11. Direct Complete

The direct-complete dialog contains no start/end fields and explicitly says it will not fabricate Actual time. Browser completion of `R1D 两分钟小事` produced `+20 XP / +6 金币`. DB evidence: Task 2 is DONE, it has `0` Schedule rows and `0` Timer rewards.

## 12. Manual Actual

The browser created a Task-linked Manual Actual with the default `同时完成悬赏` unchecked. The source-aware correction contract set the final interval to `10:00-10:30`. DB evidence: exactly 30 minutes, `include_in_actual_time=1`, while the linked Task remained non-DONE. Today then showed `30m 补录` and canonical actual total increased by exactly 30 minutes.

Overlap conflicts offer either time adjustment or an explicit excluded annotation. The latter persists `includeInActualTime=false`; no silent double count is allowed. Optional atomic completion uses the existing Manual Actual transaction workflow, not two Web calls.

## 13. Historical / Cross-day Behavior

The R1D controlled-clock test executes `23:50 -> 00:20` in `Asia/Shanghai` and asserts Day A `600s`, Day B `1200s`, total `1800s`. R1A/R1B tests continue to prove timezone snapshot stability and projection identity.

Historical Today/Calendar reads do not change the current slot. A historical start passes real-today `taskDate` through accept-and-start and the UI states this before execution.

## 14. Mobile

Real Chrome used device metrics `375x812`. Measured values:

- `clientWidth=375`, `scrollWidth=375`, horizontal overflow `false`.
- Current Focus `y=60..180`; Today grid starts at `y=188`.
- MiniTimer `y=677.5..746`; bottom navigation `y=758..805.5`, so they do not overlap.
- Visible order is Current Focus, bounties, Timeline, lifestyle/review; primary controls use mobile touch sizing.

Evidence: [375 screenshot](WB-R1D-browser-375.png).

## 15. Desktop

Real Chrome used device metrics `1440x900` (`1429px` content width after scrollbar). Horizontal overflow is false. Current Focus spans `1207px`; the Today grid is a real two-column `1207px` work area with Tasks and Timeline both visible in the first viewport. Mobile navigation is absent.

Evidence: [1440 screenshot](WB-R1D-browser-1440.png).

## 16. Accessibility

Task, Writing, Timer finish, and Calendar dialogs trap focus, close on ESC, focus their first control, and restore focus. Statuses use text as well as styling; buttons have semantic names; form controls have labels; focus rings remain; `prefers-reduced-motion` suppresses animation. The real browser exercised keyboard close/reopen on the finish panel.

## 17. Existing Feature Regression

Sleep, Water, Morning Writing, Journal/Review, Rewards, Settings, Tools, and History remain routed feature owners. The real browser reached Sleep/Water on Today, Writing/Journal, Rewards (`Lv.1`, `42/50 XP`, `12` coins during the E2E fixture), Settings, and Tools navigation. The full 67-test Web suite covers their retained interactions and draft ownership.

## 18. Real E2E Evidence

Environment: real Vite Web + current Hono API + fresh local MySQL `personal_workbench_r1d_e2e_test`.

1. Registered isolated user `r1d_e2e`; published `R1D 真执行闭环` through Quick Add.
2. Accepted it through the shared drawer and set Assignment focus rank 1.
3. Started, paused, changed to Calendar, refreshed, and observed the same PAUSED Session.
4. Resumed; opened the finish panel; verified ESC/focus behavior; finished with progress 40 and note. Task remained incomplete.
5. Started a second Session; Today and MiniTimer showed the same RUNNING Session; complete-and-finish made Task DONE and summary `1/1`.
6. Timeline showed source-labelled Timer Actual; canonical focus and actual totals matched.
7. Rewards showed both Task completion events; Journal opened without writing to its draft.
8. Direct completion created no Schedule/Timer reward. Manual Actual finalized at 30 minutes without completing its Task.
9. Final DB state had zero RUNNING/PAUSED Sessions.

## 19. Browser Evidence

Besides the screenshots, semantic browser assertions covered: Bounty Board states and shared accept drawer, Current Focus/MiniTimer consistency, refresh restoration, finish-default-incomplete, Timeline labels/totals, Rewards, Journal, historical banner, Task detail deep link, and seven-day week view.

## 20. Validation

| Command / evidence | Result |
| --- | --- |
| `npm run test --workspace apps/web` | PASS, 13 files / 67 tests |
| `TEST_DATABASE_URL=... npm run test --workspace apps/api` | PASS, 41/41, 0 skipped/TODO |
| `npm run test:r1d` | PASS, 6/6, 0 skipped/TODO |
| `npm run test:r1a` | PASS, 6/6 |
| `npm run test:r1b` | PASS, 22/22 |
| `npm run test:workflows:ci` | PASS, 6/6 business tests; strict no-skip gate |
| `npm run typecheck` | PASS, API + Web |
| `npm run lint` | PASS, API + Web |
| `npm run build` | PASS, API TypeScript + Vite 1660 modules |
| fresh V1-current | PASS, two fresh databases, 26 tables, all V21 columns present |
| production-like migration | PASS, legacy identity/counts preserved by R1A fixture |
| OpenAPI YAML parse | PASS |
| `git diff --check` | PASS |
| real Chrome 375 / 1440 | PASS, screenshots + geometry + overflow checks |
| real Web/API/MySQL flow | PASS |

The R1A fresh/fixture migration helper uses numeric Flyway order (`V2` before `V2_1`) and is the authoritative migration-order test. The additional blank-database smoke check confirmed the final 26-table/V21 shape. No Flyway repair, checksum rewrite, deployed migration rename, production connection, or production data mutation occurred.

## 21. Required Product Test Mapping

| Cases | Evidence |
| --- | --- |
| 1-13 main flow | real browser/API/MySQL steps in section 18; DB reward/time queries |
| 14-17 direct complete | real browser dialog/reward; zero Schedule and Timer reward DB assertions |
| 18-20 Manual Actual | real browser source flow; final 30m DB interval; linked Task non-DONE |
| 21-25 continuation | R1B DB tests: visibility, one target, defer/dismiss, version conflict |
| 26-29 Timer | R1B pause-gap/conflict/replay tests; real refresh and dual-surface browser evidence |
| 30-32 time | exact R1D 10m/20m test; historical browser+DB counts; R1B timezone test |
| 33-36 navigation | real deep link/week/history/refresh; shell back-forward tests |
| 37 draft | Writing/Reflection same-date refresh component tests |
| 38-43 existing features | real route reachability plus full Web regression suite |

## 22. Known Non-R1D Work

- Quick Notes full feature, Projects, Habits, Growth, Period Reviews, Search, Finance, Agent Bridge, Inventory, recurring/month Calendar, and notifications remain later work.
- V21 must follow the normal Flyway migrate/validate deployment gate; this task did not deploy it.
- The E2E databases and browser screenshots are local evidence only. No production claim is inferred from repository migration presence.

## 23. R1D Gate Assessment

```text
BOUNTY_BOARD: PASS
TASK_DETAIL: PASS
TODAY_EXECUTION_DESK: PASS
TIMELINE_CALENDAR: PASS
CONTINUATION_UX: PASS
QUICK_ADD: PASS
DIRECT_COMPLETE: PASS
MANUAL_ACTUAL: PASS
MOBILE_375: PASS
DESKTOP_1440: PASS
REAL_EXECUTION_E2E: PASS

R1D_GATE: PASS
WB_EXECUTION_VERTICAL_SLICE_001: PASS
READY_FOR_R1_5: YES
```

R1D is complete. This work package stops here and does not begin R1.5.
