# WB-R1C-APP-SHELL-INTEGRATION-001

Date: 2026-09-20

## 1. Scope

This work package activates the R1C frontend integration boundary: a real Browser Router, authenticated AppShell, TanStack Query server snapshots, one Web API client, one canonical current-Session query, R1B Timer commands, Task/Assignment/Timeline read integration, and URL-owned navigation/date state. It preserves the existing lifestyle, writing, rewards, tools, insights, and settings capabilities behind routes or existing feature composition.

This is not the R1D product-page implementation. No R1A/R1B domain behavior was redesigned, no migration was added or changed, no production database was connected, and no production data was touched. The real integration flow used a temporary local MySQL database named `personal_workbench_r1c_test`.

## 2. Pre-R1C Baseline

| Item | Baseline evidence |
| --- | --- |
| Branch | `codex/workbench-auth-system` |
| HEAD | `9b16b76ded6778b3ce6a32da9021994714abe039` |
| Node / npm | Node `v24.2.0`, npm `11.3.0` |
| Working tree | Dirty cumulative R0/R1A/R1B WIP was present and preserved; no stash, reset, cleanup, or overwrite was performed |
| Web entry | `App.tsx` composed feedback, auth, and the prior in-memory Workspace shell |
| Navigation | `pageMode` was component state and there was no route tree or stable Task-detail URL |
| Remote state | Dashboard loading was ad hoc; there was no Query client or user/date/resource key policy |
| Timer client | The old Web payload did not implement the R1B operationId/versioned command contract |
| API access | Components used the common request function, but error normalization lacked the R1C requestId/conflict/retry metadata contract |
| Draft ownership | Writing, Task, Calendar, Sleep, and other editable drafts were already feature-local from the preceding ownership work |
| Migration baseline | V1-V20; V1-V19 are frozen and V20 is the R1B contract correction |

The dependency change is limited to `@tanstack/react-query@5.103.1` and `react-router@7.18.4`. The installed versions support the repository's React 18 runtime. The existing Vite proxy remains the Web/API development boundary.

## 3. Router

`App.tsx` now composes `QueryClientProvider -> BrowserRouter -> ApplicationFeedback -> AuthGate -> WorkspaceRouter`. The route tree defines:

```text
/ -> /today?date=<today>
/today
/tasks
/tasks/:taskId
/calendar
/journal
/writing
/rewards
/tools
/insights
/settings
```

The path and `date` query parameter are the navigation truth for desktop and mobile. The old Workspace module is only a compatibility export; active shell code does not use `pageMode`.

Evidence:

- Component tests open `/tasks/11?date=2026-09-19` directly, remount it as a refresh-equivalent render, validate root redirect, and exercise back/forward history.
- A real browser opened `/tasks/71?date=2026-09-20` while logged out. After login it remained on that exact deep link and rendered Task 71.
- Real browser history moved Settings -> Journal -> Settings while preserving the URL date and current Session.

## 4. AppShell

`app/shell` owns the authenticated navigation chrome, route outlet, URL date input, global quick-action entry, global MiniTimer placement, route title/focus update, and cross-feature composition. It does not own Task truth, Timer lifecycle state, Timeline writes, drafts, or reward calculation.

`App.tsx` is now only application-level composition. The Shell passes server snapshots and narrow feature commands through the route outlet. Today is a composition route rather than a second store.

## 5. API Client

`app/api.ts` is the single Web transport boundary. It provides:

- bearer-token handling;
- JSON/envelope decoding;
- typed success values;
- `ApiError` normalization for HTTP status, application code, requestId, field errors, conflict status, and retryable transport/server failures;
- token storage without importing API implementation code.

The Web source scan found the only direct `fetch` call in `app/api.ts`. Focused tests verify auth headers, success decoding, 409/requestId/field-error normalization, and retryable network failures.

## 6. Query Architecture

One QueryClient owns replaceable server snapshots. Canonical keys include user identity and the required resource/date/id dimensions:

```text
['current-session', userId]
['today', userId, date]
['tasks', userId]
['task', userId, taskId]
['assignments', userId, date]
['continuations', userId, date]
['timeline', userId, date]
```

Mutations invalidate only affected keys; there is no parameterless global `invalidateQueries()`. Ordinary query failures keep any safe cached snapshot and display a textual stale/error banner. Auth transitions clear the QueryClient, while query keys separately scope all personal snapshots by user.

Date-isolation and User A -> clear -> User B cache behavior are covered by focused Query tests. `AuthGate` calls the cache-reset boundary for invalid persisted credentials, successful login, and logout.

## 7. Feature Ownership

| Owner | R1C public responsibility |
| --- | --- |
| `features/tasks` | Task list/detail queries, stable detail URL, Task/Assignment presentation, start and complete-and-finish entry points |
| `features/assignments` | Date-scoped Assignment and continuation-candidate read adapters |
| `features/timer` | Canonical current-Session query, operation retry wrapper, R1B commands, MiniTimer, net elapsed derivation |
| `features/timeline` | Typed Planned / Timer Actual / Manual Actual / Legacy Actual read mapping |
| `app/shell` Today route | Read-only composition of current Session, Assignments, continuation candidates, Timeline, Tasks, and existing lifestyle summary |

Features consume only public exports. A source test rejects Web imports from `apps/api`, and Timeline does not become a Timer write owner.

## 8. Current Session / Mini Timer

`useCurrentSession` is instantiated once in `WorkspaceRoot`. Today, Task cards, Task detail, timer controls, and the global MiniTimer consume that same snapshot. A source guard checks that no route/component introduces a second current-session query.

MiniTimer displays Task title, authoritative RUNNING/PAUSED state, segment-derived net elapsed time, pause/resume, finish, cancel, and a Task-detail link. The local interval changes display only; server state and Segment snapshots remain authoritative.

The real flow showed the same Session 49 on Task detail, Journal, and Settings. Refresh on Journal restored `PAUSED` and `01:33` from the API. Browser navigation did not unmount or replace the canonical query.

## 9. Timer Mutation Integration

The Web adapter calls the R1B start, accept-and-start, pause, resume, finish, cancel, and complete-and-finish contracts with explicit expected versions. `finish` defaults to `completeTask: false`.

`retryableOperation` creates one operationId per user action and reuses it for its automatic retry. A later action invokes the wrapper again and receives a new operationId. Mutation success invalidates the affected current Session, Task, Assignment, Timeline, and reward/summary keys as required. A 409 shows a conflict message and refetches authoritative state; failure returns false and does not present success.

Two kinds of evidence cover response-loss behavior:

- Web test: a retryable pause fails once with 503 and retries with the identical operationId and expectedVersion; a separate resume receives a different operationId.
- Real API/database: pause operation `11111111-1111-4111-8111-1111111111c1` was sent twice with expected version 3. Both responses represented the same committed result (`status=PAUSED`, `version=4`, `durationSeconds=93`, projection 82), and one committed `PAUSE_SESSION` receipt exists.

## 10. Tasks / Assignment Integration

The integration surface reads the real Task list, Task detail, date Assignment set, and continuation candidates. Task detail exposes the Assignment state and selects start versus accept-and-start from the real date-scoped Assignment snapshot.

In the real flow, Task 71 began as TODO/unassigned at version 1. `接取并开始` atomically produced an accepted Assignment, Task `IN_PROGRESS` version 2, and Session 49. Default finish removed the current Session but left Task 71 `IN_PROGRESS`, version 2, `completedAt=NULL`, proving the client did not accidentally request Task completion.

## 11. Timeline Read Integration

The Timeline adapter composes planned Schedules with ActualTime entries and preserves four distinct view-model sources: `PLANNED`, `TIMER_ACTUAL`, `MANUAL_ACTUAL`, and `LEGACY_ACTUAL`. TIMER Schedule projections are not added as ActualTime entries, and an open Segment is not settled time.

The focused mapping test supplies all source classes and verifies that projections are excluded without hiding legacy/manual facts. In the real flow, `/actual-time` returned exactly the three closed Segment facts for Session 49. The three TIMER Schedule projections 81-83 remained derived and `include_in_actual_time=0`.

## 12. Today Composition Boundary

Today reads the canonical Tasks, Assignments, continuation candidates, current Session, ActualTime/Timeline, and the existing lifestyle Dashboard snapshot. Its explicit date preparation invokes the existing idempotent carryover command before reading Dashboard. Today owns no business write state and no `TodayStore`; actions delegate to the owning feature.

## 13. Draft Protection

Writing/Reflection remains feature-local. Its owner is keyed by `userId:date` and the one initial loading-to-ready transition, so a same-date query refetch does not remount or reinitialize active text. Existing Task and Calendar draft protections remain in their feature owners.

Evidence:

- Writing tests verify ordinary remote refresh, save failure, AI response, and same-date changes do not overwrite the active draft; date changes deliberately initialize from the new snapshot.
- Task and Calendar tests verify active create/edit/selection drafts survive unrelated same-date snapshot refresh or failed mutations.
- In the real browser, an unsaved Morning Writing value remained intact while the global Timer pause mutation completed and its queries refreshed.

## 14. Auth / Cache Isolation

All Query keys contain the authenticated user ID. `AuthGate` invokes one stable `queryClient.clear()` callback on invalid-token cleanup, successful login, and logout. Draft-owning composition is mounted below AuthGate and namespaced/remounted by user/date, preventing one user's local feature state from becoming the next user's initial state.

Auth tests cover persisted-session validation, login/logout reset, and invalid-token cleanup. The Query test seeds User A data, clears the client, and confirms no User A or User B key remains before the next session mounts.

## 15. Existing Feature Regression

The existing surfaces remain reachable without creating fake Projects/Growth/Finance routes:

- Today continues to compose Sleep and Water.
- Journal/Writing exposes Morning Writing, Journal, Stock Review, and Reflection workflows.
- `/rewards`, `/tools`, `/insights`, and `/settings` use their existing feature owners.
- `/calendar` keeps the existing Calendar workflow; TIMER projections cannot be deleted through its generic Schedule controls.

Parameterized route tests cover Calendar, Journal, Rewards, Tools, Insights, and Settings. The real browser additionally exercised Journal and Settings while a Session was active.

## 16. Real API Integration Evidence

Environment:

```text
MySQL 8.0.46, temporary /tmp runtime, port 3408
database: personal_workbench_r1c_test
API: http://127.0.0.1:3000
Web: http://127.0.0.1:5173
user: isolated R1C test account, userId 2
task: 71, R1C real integration task
```

V1, V2, V2_1, and V3-V20 were applied in semantic version order to the empty isolated database. The executed real flow was:

```text
direct /tasks/71 deep link while logged out
-> Web login, same deep link restored
-> accept-and-start
-> navigate Task -> Journal (MiniTimer remains)
-> enter unsaved writing draft
-> pause through Web (draft remains)
-> refresh Journal (PAUSED restored from server)
-> resume through Web
-> navigate Settings and exercise browser back/forward
-> pause twice through real API with one operationId (one result/receipt)
-> refresh (PAUSED version 4 restored)
-> resume through Web
-> navigate to Task detail
-> finish through Web with default completeTask=false
```

Final facts for Session 49:

| Fact | Result |
| --- | --- |
| Current Session after finish | `null` |
| Session status/version | FINISHED / 6 |
| Task 71 | IN_PROGRESS / version 2 / `completedAt=NULL` |
| Execution slot | `active_session_id=NULL` |
| Closed Segments | 31: 37s, 32: 56s, 33: 8s |
| Net ActualTime | 101 seconds |
| Wall-clock span | 151 seconds |
| Pause gaps excluded | 50 seconds |
| ActualTime sources | exactly Segments 31, 32, 33 |
| TIMER projections | 81, 82, 83; all excluded from aggregate truth |

A separate Session 50 was started only to render the active MiniTimer at both responsive widths and then cancelled through the Web UI. Its cancellation released the execution slot and granted no completed time.

## 17. Responsive / Accessibility Evidence

Real browser viewport overrides were used rather than inferred CSS-only checks:

| Viewport | Evidence |
| --- | --- |
| 375x812 | `clientWidth=scrollWidth=bodyScrollWidth=375`; mobile bottom navigation visible; MiniTimer bounds stayed within x=0..375; primary Task action remained visible; no horizontal overflow |
| 1440x900 | `clientWidth=scrollWidth=bodyScrollWidth=1440`; shell columns were `196px 1244px`; mobile navigation was `display:none`; MiniTimer bounds stayed within the content column |

The Shell uses real links/buttons, labelled navigation regions, textual loading/error states, route-specific document titles, and moves focus to the route main region. Task and Writing dialogs use `role=dialog`, `aria-modal`, initial focus, Tab/Shift+Tab containment, Escape close, and trigger-focus restoration. The test viewport override was reset after validation.

## 18. Validation

| Command / check | Result |
| --- | --- |
| ordered fresh migration V1-V20 | PASS on isolated MySQL 8.0.46 |
| `TEST_DATABASE_URL=... npm test -w apps/api` | PASS, 35/35; 0 failed/skipped/TODO |
| `TEST_DATABASE_URL=... npm run test:r1a` | PASS, 6/6; 0 failed/skipped/TODO |
| `TEST_DATABASE_URL=... npm run test:r1b` | PASS, 22/22; 0 failed/skipped/TODO |
| `TEST_DATABASE_URL=... npm run test:workflows` | PASS, 6/6; 0 failed/skipped/TODO |
| `npm test -w apps/web` | PASS, 13 files / 67 tests |
| `npm run typecheck` | PASS, API and Web |
| `npm run lint` | PASS, API and Web |
| `npm run build` | PASS, API and Web; Vite 1,659 modules |
| OpenAPI YAML parse | PASS, OpenAPI 3.0.3 |
| `git diff --check` | PASS |
| direct API + Web + database flow | PASS; evidence in section 16 |
| responsive browser validation | PASS at 375x812 and 1440x900 |

Required frontend evidence maps as follows:

| Required case | Evidence |
| --- | --- |
| 1-4 deep link, refresh, history, root redirect | Shell tests plus real logged-out deep link, reload, back/forward |
| 5-6 cross-route current Session and one query state | Shell test call count and real Task/Journal/Settings flow |
| 7-8 operationId retry/new action | Timer focused tests |
| 9-10 409/refetch/no false success | Timer focused test |
| 11 Task detail/Today consistency | shared Query keys and mutation invalidation tests/source guard |
| 12 date cache isolation | Shell Query test |
| 13 auth cache isolation | Auth tests and Query clear test |
| 14 draft preservation | Writing, Task, Calendar tests plus real Timer mutation with unsaved text |
| 15 Actual source distinction | Timeline focused test and real Segment/projection evidence |
| 16 existing routes | parameterized Shell route test and real Journal/Settings navigation |
| 17 no API implementation imports | architecture source test |
| 18 no page-local Timer truth | architecture source test, one query call test, real cross-route flow |

The recurring npm `ELECTRON_MIRROR` configuration warning is unrelated to the repository and did not suppress or skip validation.

## 19. Remaining R1D Work

R1D may now build the final Today and Task-board product journeys on the activated Shell/query boundaries. The R1C integration pages intentionally remain minimal. Final product-density, empty-state, and advanced Calendar presentation belong to R1D, while Projects, Habits, Growth, Quick Notes R1.5, Finance, Agent Bridge, and physical Media cleanup remain their separately planned work packages.

No R1D work was started here.

## 20. R1C Gate Assessment

```text
ROUTER_DEEP_LINKS:
PASS

SERVER_STATE_QUERY:
PASS

GLOBAL_TIMER_SINGLE_SOURCE:
PASS

MUTATION_INTEGRATION:
PASS

DRAFT_PROTECTION:
PASS

AUTH_CACHE_ISOLATION:
PASS

REAL_API_WEB_INTEGRATION:
PASS

R1C_GATE:
PASS

READY_FOR_R1D:
YES
```
