# Architecture Governance Baseline

> 本文档是 Personal Workbench 当前项目级 architecture system of record。它记录已经由代码形成、并经审计确认的 ownership、边界和依赖方向，而不是一套待套用的目录模板。
>
> 状态：Baseline，2026-09-18。对架构事实或决策的有意变更必须同步更新本文档。

## System Shape

本仓库是一个 npm workspaces 全栈 monorepo，包含两个运行时应用和一套共享数据库演进资产：

```text
Browser
  -> apps/web: React + Vite SPA
       -> HTTP /api/*
            -> apps/api: Hono application
                 -> route modules
                      -> Drizzle ORM -> MySQL
                      -> task completion capability
                      -> work-session finalization workflow
                      -> rewards domain service
                      -> OpenAI Responses API (selected AI features)

db/migration/* -> Flyway/MySQL schema evolution
docs/openapi.yaml -> public HTTP contract documentation
deploy/* -> production container and reverse-proxy composition
```

当前组织方式是：

- 仓库级：package-centric，`apps/web` 和 `apps/api` 是 workspace 边界。
- Web：feature-oriented SPA；`App.tsx` 是纯应用组合入口，认证 gate、Workspace/Dashboard 生命周期和全局反馈各自拥有明确边界，各业务 feature 通过自己的 public surface 拥有草稿和 mutations。
- API：route-centric；简单 CRUD 的 transport、validation 和 data access colocate 在对应 route module。
- 数据库：SQL migration 记录演进历史，Drizzle schema 提供运行时映射。
- 集成：Web 与 API 只通过 HTTP 交互，不跨 workspace import 源码。

项目规模不要求机械引入通用 service/repository/use-case 分层。只有真实业务 contract、跨表 invariant、复用或独立测试需求出现时才建立应用或领域边界。

## Module / Feature Ownership

| Module / feature | Owns | Does not own | Current public surface |
| --- | --- | --- | --- |
| `apps/web/src/main.tsx` | React bootstrap、根样式加载、挂载 `App` | feature state、业务规则、data fetching | 浏览器入口 |
| Web application shell | 组合全局反馈、认证 gate 与 authenticated Workspace | Workspace snapshot、feature drafts、业务 mutation policy | `App` -> `ApplicationFeedback` -> `AuthGate` -> `WorkspaceShell` |
| Web Authentication feature | token session validation、login/register drafts、auth mutation、logout/session reset | Workspace date/snapshot、global feedback rendering、feature records | `features/auth/index.tsx` exports `AuthGate`, `AuthSession`, and `AuthUser` |
| Web Workspace / Dashboard shell | selected date、page mode、Dashboard remote snapshot、explicit date preparation、Dashboard reload、top-level feature composition | auth form/session lifecycle、feature drafts/mutations、global popup state | `app/workspace/index.tsx` exports `WorkspaceShell`; `app/workspace/header.tsx` owns header interaction/time display |
| Web application feedback | global notice/confirm/reward popup state and presentation; narrow callbacks injected into Auth/Workspace/features | feature validation, feature drafts, domain policy | `app/feedback.tsx` exports `ApplicationFeedback` and `FeedbackActions` |
| Web Rewards feature | Rewards 页面 UI、成长摘要、奖励预估规则、远端 snapshot、奖励创建 draft、奖励项 mutations | session、顶层 navigation、其他 feature 的奖励触发 workflow | `features/rewards/index.ts` exports the feature UI and reward contracts |
| Web Decision Tools feature | 决策与心理桥梁 UI、modal 状态、editable drafts、最近记录 snapshot、loading 和 mutations | session、顶层 navigation、Dashboard snapshot、全局奖励/错误展示 | `features/decision-tools/index.tsx` exports `DecisionToolsFeature` |
| Web Writing / Reflection feature | 晨写、日记、股市复盘的 selected-date drafts、编辑 UI/modal、保存 mutations、写作 AI insight 状态与分析 workflow | session、顶层 navigation、跨 feature History archive 组合、媒体/睡眠等其他 daily records | `features/writing-reflection/index.tsx` exports the owner and its composition surfaces |
| Web Tasks feature | Task 面板、排序、直接完成意图和 Task HTTP mutations；创建、今日接取、编辑、直接完成分别由 feature 内私有 workflow 拥有 | Timer terminal policy、Schedule CRUD、服务端完成 transition/reward policy、全局反馈展示 | `features/tasks/index.tsx` exports `TasksFeature` and `TasksPanel`；其余 workflow 文件均为私有实现 |
| Web Media Watch feature | 影视陪伴的 selected-date draft、编辑 UI、保存 mutation、日期与 snapshot 初始化 lifecycle | session、顶层 navigation、跨 feature History archive 组合、其他 daily records | `features/media-watch/index.tsx` exports `MediaWatchFeature`, `MediaWatchEditor`, and the remote record contract |
| Web Sleep feature | 睡眠摘要交互、selected-date draft、编辑 dialog、保存 mutation、日期与 snapshot 初始化 lifecycle | Dashboard/History 聚合、Timeline 投影、Water 派生节奏、其他 daily records | `features/sleep/index.tsx` exports `SleepFeature` and the remote record contract |
| Web Calendar feature | selected-date Schedule 草稿、编辑 dialog、手工 planned/actual CRUD、时间轴布局与呈现 | Dashboard snapshot、跨 feature Sleep/Water 标记归一化、Timer/Task 完成策略 | `features/calendar/index.tsx` exports `CalendarFeature` and the timeline composition contracts |
| Web Water feature | 饮水 snapshot 呈现、睡眠感知节奏推导、杯数 mutation、Calendar 时间点投影 | Sleep 记录、Calendar 布局、Dashboard 聚合、全局反馈展示 | `features/water/index.tsx` exports `WaterFeature`, `WaterRecord`, and `waterTimelineItems` |
| Web Categories / Ability feature | 分类/技能 CRUD 草稿、维度元数据与能力统计派生 | Task lifecycle、Calendar CRUD、服务端累计规则、全局反馈展示 | `features/categories/index.tsx` exports `CategoriesFeature` and stable category/dimension contracts |
| Web Timer feature | Timer start/pause/finish 客户端 workflow、finish draft、校验与 Task-facing narrow actions | 服务端 terminal/transaction/reward policy、Task UI、Dashboard snapshot | `features/timer/index.tsx` exports `TimerFeature` and Timer contracts |
| Web History feature | 归档标签和远端记录、详情弹窗、睡眠区间、时间/能力/周统计的只读组合 | 各记录的 canonical writes、Dashboard fetch、顶层 navigation | `features/history/index.tsx` exports `HistoryFeature` and History series contracts；`archive.tsx` 为私有实现 |
| Authentication | 登录/注册 UI、token persistence、session validation；API 的 token/password/auth middleware | tasks、records 等业务状态 | `/api/auth/*`；API `auth.ts` helpers |
| Dashboard / history read model | 指定日期的跨 feature 聚合、统计和展示组合 | 各 feature 的 canonical writes；长期业务规则 | `GET /api/dashboard`；Dashboard response contract |
| Daily carryover workflow | 把前一日未完成的 daily assignments 与 planned schedules 准备到目标日期；幂等与事务边界 | Dashboard 聚合、Task lifecycle、generic Schedule CRUD、Growth 初始化 | `POST /api/daily-carryovers`；`applyDailyCarryover` |
| Tasks and daily assignments | task lifecycle、今日接取、排序、完成反思；`completeTask` 拥有完成 transition 与完成奖励的事务组合 | generic rewards policy、Timer lifecycle、无关记录 | `/api/tasks/*`、`/api/task-days/*`；`task-completion.ts` |
| Timer execution | timer session lifecycle；`finishWorkSession` / `pauseWorkSession` 拥有终结、Timer-derived Actual projection、Timer reward 与可选 Task completion 的外层事务 | Task completion policy、generic Schedule CRUD、Task Days | `/api/timer-sessions/*`；`work-session.ts` |
| Calendar / schedules | planned block、手工 Actual block、时间轴 CRUD；保存 Execution workflow 产生的可追溯 projection | Timer 状态与 Task 完成决策 | `/api/schedules/*`；`schedules` mapping |
| Task categories / abilities | 分类、能力维度、累计时间目标 | task lifecycle、全局设计 token | `/api/task-categories/*` |
| Daily records | sleep、water、morning writing、journal、stock review、media watch 各自的记录和历史 | Dashboard 聚合、跨记录通用状态容器 | 各 resource 的 `/api/<resource>` routes |
| Quick Notes (current API capability) | `quick_notes` 的正文、记录日期、可选标题／单标签、按用户查询与创建／删除 | Task lifecycle、Journal 正文、Timeline 时间事实；当前未发现 Web 调用入口 | `/api/quick-notes` GET/POST；`/api/quick-notes/:id` DELETE；route-local validation |
| Rewards and growth | reward policy、幂等 event key、XP/coin 计算、growth summary、兑换 | 触发奖励的 feature workflow 本身 | `apps/api/src/rewards.ts` exported functions；`/api/rewards/*` |
| AI insights | writing analysis、AI response validation、insight persistence | writing draft 的 canonical ownership | `/api/ai-insights/*` |
| Decision tools | decision records、psychological bridge generation/persistence | generic modal infrastructure、其他记录 owner | `/api/decision-tools/*` |
| API infrastructure | environment validation、DB connection、response/error mapping、logging、shared enums | feature policy | `env.ts`、`db/*`、`http.ts`、`errors.ts`、`logger.ts`、`enums.ts` |
| Database evolution | schema history、constraints、migration ordering | HTTP behavior、client types | versioned files under `db/migration/` |
| Deployment | container build、service composition、Nginx proxy | application business behavior | `deploy/*` and root `docker-compose.yml` |

Ownership follows business behavior, not file length. A long cohesive schema catalog, query aggregator, chart, or parser is not automatically a split candidate. Split when independent change reasons or canonical owners are present.

## Dependency Direction

Intended dependency direction:

```text
root workspace scripts
  -> apps/web | apps/api

apps/web/main.tsx
  -> web application composition
       -> feature public surfaces
            -> feature UI/workflows
            -> web-local shared primitives/contracts
            -> HTTP API

apps/api/index.ts
  -> apps/api/app.ts
       -> route modules
            -> feature/application contract when one exists
            -> API infrastructure
                 -> db/index.ts -> db/schema.ts

tasks route -> task-completion.ts -> rewards.ts
timer route -> work-session.ts -> rewards.ts
                              -> task-completion.ts
                              -> Timer persistence / Schedule projection
other route modules -> rewards.ts is an intentional cross-feature dependency
apps/web -X-> apps/api source imports
route module -X-> another route module's internals
```

Rules:

1. `main.tsx`, `index.ts`, and `app.ts` point inward only for composition and startup.
2. API route modules may use shared infrastructure and their owned tables directly for simple CRUD.
3. Route modules must not import another route module's handlers, validators, or private helpers.
4. A workflow spanning multiple feature owners belongs in an explicit application/workflow contract visible to all participants, not in one participant's internals.
5. Web feature modules, as they emerge, must expose intentional public surfaces. Cross-feature consumers must not deep-import implementation files.
6. Cycles must be resolved through ownership or orchestration; moving types to a generic `common` folder is not by itself a resolution.

## Entry Points

| Entry point | Allowed responsibilities | Must not accumulate |
| --- | --- | --- |
| `apps/web/src/main.tsx` | mount React, root providers, global styles | feature logic, requests, forms |
| `apps/web/src/App.tsx` | compose `ApplicationFeedback`, `AuthGate`, and `WorkspaceShell` | session state, workspace state, feature behavior, popup state, direct data loading |
| `apps/api/src/index.ts` | process startup, port binding, startup logging | route behavior, SQL, domain policy |
| `apps/api/src/app.ts` | middleware/error setup and route registration | feature SQL, validation schemas, workflow implementation |
| `apps/api/src/routes/*.ts` | HTTP decoding, auth handoff, validation, response mapping; colocated simple CRUD；调用已建立的 workflow public contracts | unrelated feature internals; multi-owner workflow implementation |
| `db/migration/*.sql` | forward schema evolution | application behavior or repair logic that belongs in runtime workflows |

Route files are transport entrypoints and may remain the complete owner of cohesive, simple CRUD. Thin route files are not a goal by themselves.

## State Ownership

For every mutable value, one canonical owner must be identifiable.

- Server truth: MySQL is canonical for persisted business data. A Web response object is a snapshot, not an independent authority.
- Session: localStorage persists the bearer token; validated in-memory user state owns the active browser session. Persistence must not bypass `/api/auth/me` validation.
- Authentication UI: `AuthGate` owns login/register drafts, auth mutation state, token persistence, session validation, and logout reset; `App` only composes the gate.
- Workspace state: `WorkspaceShell` owns selected date, page mode, Dashboard snapshot, explicit date preparation, reload lifecycle, and authenticated feature composition. `WorkspaceHeader` owns only its controls and clock tick. There is no mirrored App/Workspace state.
- Dashboard data: the Dashboard request owns a replaceable remote snapshot for the selected date. Derived lists, maps, totals, filters, and chart series should be computed from that snapshot rather than stored as competing state.
- Feature drafts: editable forms are distinct drafts. They should be owned by the lowest feature/modal/workflow coordinating them, initialized intentionally when editing begins, and not overwritten by unrelated background reloads.
- Writing/reflection drafts initialize from the selected-date Dashboard snapshot only when that date's feature owner mounts. Same-date Dashboard refreshes do not synchronize back into active drafts; changing date deliberately remounts the owner from the new date snapshot.
- Media Watch draft initializes once the selected date's Dashboard snapshot is ready. Same-date refreshes do not overwrite active input; a date change clears the old draft while waiting and initializes exactly once from the new snapshot.
- Sleep draft initializes once the selected date's Dashboard snapshot is ready. Same-date refreshes do not overwrite an open editor; changing date closes the old editor, clears its draft, and waits for the new snapshot before editing is enabled.
- Local UI state: open/close, hover, tab, drag, and local input state belongs to the lowest component or workflow that coordinates it.
- Workflow state: state shared across several steps or sibling panels belongs to that workflow boundary, not automatically to `App` or a global store.
- Navigation/date state: `pageMode` and `selectedDate` are currently in-memory application state. URL ownership is not required until deep links, refresh restoration, or browser history become product requirements.
- Persisted client state: adding localStorage/IndexedDB persistence does not create a second semantic owner; hydration direction and schema/version behavior must be explicit.

Prohibited by default:

- `server snapshot -> Effect/load callback -> local state mirror` without a named draft/snapshot/offline contract;
- Effects whose primary job is keeping two in-memory owners synchronized;
- promoting feature state to an app-wide store only to avoid ordinary composition props.

Effects remain appropriate for authentication, network loading, timers, browser APIs, subscriptions, and other external synchronization.

## Data/API Ownership

- Each resource route owns request validation, authentication context use, response serialization, and simple queries for its capability.
- `dashboard.ts` owns a pure cross-feature read model. It may read several owners' data but must not initialize Growth, carry work forward, or become the canonical owner of feature writes or rules.
- `daily-carryover.ts` owns explicit target-date preparation. Daily-assignment inheritance and planned-Schedule carryover are independent commit units so one may succeed when the other fails; each is retry-safe. Within the planned-Schedule unit, the projection and its handled-source marker commit atomically.
- A carried planned Schedule uses `(userId, source=PLANNED_TASK, sourceId=daily-carryover:<targetDate>:<fromScheduleId>)` as its database-enforced identity. `schedule_carryovers` keeps the handled-source identity, while `task_daily_assignments` keeps its existing `(userId, taskId, taskDate)` identity.
- `rewards.ts` owns reward calculation, growth updates, and idempotency. Feature workflows decide when a qualifying event occurred and call its public contract.
- `task-completion.ts` owns the transition to Task `DONE`, `completedAt`, completion reflection, and lifecycle reward invocation. `completeTask` opens a transaction standalone and `completeTaskInClient` participates in an existing outer transaction.
- `work-session.ts` owns pause/finish terminal transitions, Timer-derived Actual projections, Timer/partial rewards, and optional explicit Task completion. One outer transaction covers the combined invariant.
- A Timer-derived Schedule uses `(userId, source=TIMER, sourceId=timerSessionId)` as its database-enforced projection identity. A direct completion with an Actual block uses a caller-stable `completionKey`; ordinary manual Schedules keep no workflow source identity.
- Work-session retry identity is the session ID plus terminal transition and explicit Task-completion intent. A matching retry returns the committed result; a different command against a terminal session conflicts.
- A multi-table invariant must have one workflow owner and one database transaction. Independent `Promise.all` writes are not a transaction.
- `db/schema.ts` is the runtime ORM mapping. Versioned SQL migrations are the authoritative history for changing deployed database shape.
- `docs/openapi.yaml` is the repository's documented public HTTP surface. Changes to route paths, request/response fields, authentication, or error semantics must update it in the same change.
- Web types currently mirror API contracts manually. Until a generated/shared contract is justified, API implementation, OpenAPI, and Web types must be reviewed together.
- All user-owned queries and writes must scope by authenticated `userId` unless an endpoint is explicitly public.
- Business dates use `YYYY-MM-DD`; application display and date/time conversion follow Asia/Shanghai semantics unless a contract explicitly states otherwise.

## Public Module Surfaces

Current intentional surfaces:

- `apps/web`: browser bundle entry via `main.tsx`; `App` is a composition-only surface. `app/api.ts`, `ApplicationFeedback`, `AuthGate`, and `WorkspaceShell` are the explicit application-level surfaces; feature internals remain private behind their existing feature exports.
- `apps/web/src/features/rewards/index.ts`: the Rewards feature public surface. It exports `RewardsFeature`, the header growth summary, the task reward estimate contract, and reward types required by application composition and task/reward presentation; implementation details remain internal.
- `apps/web/src/features/decision-tools/index.tsx`: the Decision Tools feature public surface. It exports `DecisionToolsFeature`; application composition injects authenticated HTTP access, selected date, global error/reward presentation, and Dashboard refresh without owning the feature's drafts or mutations.
- `apps/web/src/features/writing-reflection/index.tsx`: the Writing / Reflection public surface. It exports the feature owner plus header-shortcut and history-editor composition surfaces, along with the remote record types required by Dashboard and cross-feature archive composition. Drafts, save behavior, AI analysis policy, dialogs, and same-date refresh behavior remain internal.
- `apps/web/src/features/tasks/index.tsx`: the Web Tasks public surface. It exports the workflow owner and its panel composition surface. Application composition injects Dashboard snapshots, authenticated HTTP access, refresh/feedback capabilities, and narrow Timer callbacks; feature-private modules own create, daily-selection, edit, and direct-completion lifecycles, while their models and dialog primitives are not cross-feature surfaces.
- `apps/web/src/features/media-watch/index.tsx`: the Media Watch public surface. It exports the selected-date draft owner, its editor composition surface, and the remote record type needed by Dashboard and History. Application composition injects snapshot readiness, authenticated HTTP access, and refresh/error capabilities; draft transitions and save behavior remain internal.
- `apps/web/src/features/sleep/index.tsx`: the Sleep public surface. It exports the complete summary/editor workflow and the remote record type needed by Dashboard, Timeline, Water derivation, and History. Application composition injects the matching-date snapshot, authenticated HTTP access, and refresh/error capabilities; draft, dialog, and save behavior remain internal.
- `apps/web/src/features/calendar/index.tsx`: the Calendar public surface. It exports the Schedule workflow owner plus the `Schedule` and `TimelineItem` contracts needed for cross-feature composition. Application composition injects normalized timeline items, Dashboard snapshots, authenticated HTTP access, and refresh/error capabilities; Schedule drafts, mutations, dialog state, and timeline layout remain internal.
- `apps/web/src/features/water/index.tsx`: the Water public surface. It exports the complete hydration display/mutation owner, the remote record contract, and a pure Calendar-marker projection. Application composition injects the matching Water and Sleep snapshots plus authenticated HTTP, refresh, and error capabilities; rhythm policy, cup interaction, mutation behavior, and drink-time parsing remain internal.
- `apps/web/src/features/auth/index.tsx`: the Authentication public surface. `AuthGate` owns session validation, login/register drafts, auth mutations, token persistence, and logout reset; it exposes only the authenticated session capability to the Workspace shell.
- `apps/web/src/app/workspace/index.tsx`: the authenticated Workspace / Dashboard public surface. `WorkspaceShell` owns selected date, page mode, Dashboard snapshot, explicit carryover preparation, reload lifecycle, and top-level feature composition. Its internal Dashboard region remains private.
- `apps/web/src/app/workspace/header.tsx`: the Workspace header surface. It owns page/date controls, account interaction, and its own clock tick; it does not own Dashboard data or feature mutations.
- `apps/web/src/app/feedback.tsx`: the application feedback surface. `ApplicationFeedback` owns notice, confirmation, and reward popup lifecycles and injects narrow callbacks; feature-specific policy remains with the caller.
- `apps/web/src/features/categories/index.tsx`: the Categories / Ability public surface. It exports the CRUD owner plus category/dimension contracts and pure dimension helpers required by Tasks, Calendar, and History; editor state and mutation behavior remain internal.
- `apps/web/src/features/timer/index.tsx`: the Timer client public surface. It exports the Timer workflow owner and session/action contracts. Tasks receives only start/pause/finish actions through composition; the finish draft, request payload construction, validation, and result handling remain internal.
- `apps/web/src/features/history/index.tsx`: the History public surface. It exports the complete read-only History composition and series contracts needed by the Dashboard snapshot. Archive fetching, tab state, record normalization, detail state, charts, and derived statistics remain internal.
- `apps/api/src/app.ts`: exports the configured Hono `app` to the process entrypoint and tests.
- `apps/api/src/routes/*.ts`: each file exports only the route object needed by `app.ts`; all other declarations are internal by default.
- `apps/api/src/task-completion.ts`: `completeTask` is the Task completion contract; its transaction-aware form exists for an owning outer workflow, and `completeTaskWithActualTime` preserves the current direct-completion HTTP behavior without moving generic Schedule CRUD into Tasks.
- `apps/api/src/work-session.ts`: `finishWorkSession` and `pauseWorkSession` are the Execution finalization contracts. Routes must not reproduce their writes.
- `apps/api/src/daily-carryover.ts`: `applyDailyCarryover` is the explicit date-preparation contract. Dashboard and resource routes must not reproduce its writes.
- `apps/api/src/rewards.ts`: exported reward/growth functions are an intentional cross-feature service surface.
- API infrastructure files expose narrowly named helpers used by routes and startup code.
- HTTP endpoints documented in `docs/openapi.yaml` are the public Web/API contract.

An exported symbol is not automatically an approved cross-feature surface. New public surfaces must represent a stable semantic contract and name their owner.

## Internal Boundaries

- Route-local Zod schemas, mapping helpers, SQL details, and response assembly are private to their route unless deliberately promoted.
- A feature must not reach into another feature's private component, hook, validator, query helper, or persistence details.
- Cross-feature composition may live in Dashboard/application orchestration because that owner can legitimately see the participating features.
- Database tables do not define application ownership by themselves. A route touching several tables must still respect the workflow owner and transaction boundary.
- UI primitives may own generic accessibility and interaction behavior; they must not absorb product policy.
- `styles.css` is currently a global styling implementation, not a license to create globally shared business semantics.

## Shared-Code Promotion Rules

Keep code local to its feature/workflow until all of these are true:

1. At least two independent owners need the behavior or contract.
2. Its semantics are not specific to the originating feature.
3. The contract is stable and can be named precisely.
4. Consumers should not depend on the original feature's internal layout.

Do not create `shared`, `common`, `utils`, wrappers, repositories, or generic services to anticipate reuse. A wrapper must own behavior, validation, state, domain semantics, accessibility, or another real contract; prop forwarding alone is insufficient.

`rewards.ts` is the current example of justified shared domain behavior. Date formatting or UI primitives may be promoted later when independent consumers and stable semantics are demonstrated.

## Testing Boundaries

The repository has focused MySQL integration tests for Task completion, work-session finalization, Daily carryover idempotency/rollback, and Dashboard read purity under `apps/api/tests/workflows.test.ts`. They require a dedicated `TEST_DATABASE_URL` whose database name ends in `_test` and the complete migration schema; missing configuration or an unavailable database fails the tests. Fixtures clean workflow data but do not recreate tables. The Web workspace uses a minimal Vitest + React Testing Library + jsdom harness for feature behavior; its suites protect Writing / Reflection, Media Watch, Sleep, Calendar, Water, Categories / Ability, Timer, and History ownership plus the Tasks create/daily-selection/direct-completion lifecycle. `npm run lint` still performs TypeScript checking rather than ESLint-style rules.

`.github/workflows/ci.yml` owns CI verification only: an isolated MySQL 8 service starts with an empty `personal_workbench_test` database, Flyway applies and validates all versioned SQL migrations, then `npm run test:workflows:ci` executes the focused database suite and the Web workspace runs its feature behavior tests. The CI reporter fails on skipped/TODO/cancelled/failed database tests or a missing/empty summary. Typecheck, lint and build run only after the focused suites pass. `.github/workflows/deploy.yml` owns the GitHub trigger, tested commit selection, and SSH transfer for production delivery; `deploy/release.sh` owns server-side backup, build, Flyway migration, Compose restart, health check, and failed-service rollback. Deployment does not own application behavior or database policy; Flyway remains the canonical migration executor.

Minimum verification for non-trivial changes:

```text
npm run typecheck
npm run lint
npm run build
```

Tests should be added at the owner whose contract could regress:

- Pure domain rules: unit tests for task transitions, reward calculation/idempotency, and date/time transformations.
- Route-owned CRUD: focused API tests covering validation, authentication scoping, and response contracts.
- Multi-table workflows: integration tests against a database transaction boundary, including rollback/partial-failure cases.
- Dashboard: read-model/aggregation tests and, after its command behavior is removed, a no-write/idempotency test for GET.
- Web feature workflows: component tests for draft initialization, mutation outcomes, and preservation of unsaved input across unrelated reloads.
- Public HTTP contract: contract checks for the high-change Dashboard, tasks, timers, rewards, and auth surfaces.

Test helpers belong to the module they support until multiple independent test suites need a stable shared fixture contract.

## Guardrails

Current executable checks:

```text
npm run typecheck  # TypeScript boundaries and type safety across both workspaces
npm run lint       # Currently aliases TypeScript checks; no additional lint policy
npm run build      # API compilation and production Web bundle
npm test           # Focused tests; DB-backed workflow cases require TEST_DATABASE_URL
npm run test:workflows:ci  # Required DB suite with a no-skip reporter and its regression checks
```

Current architecture rules are otherwise soft contract. Do not add dependencies solely to claim governance coverage.

Good future Harden candidates, after the relevant boundary exists and false positives have been assessed:

- forbid imports from one API route module into another route module;
- forbid cross-feature Web deep imports once feature public surfaces exist;
- ensure only composition roots mount route exports;
- detect workspace dependency cycles and forbidden Web-to-API source imports;
- validate unique/ordered Flyway migration versions;
- contract-test OpenAPI against critical request/response shapes;
- transaction tests for task completion, timer finish, category/task destructive workflows, and rewards;
- CI gates for typecheck, build, tests, and Flyway validation.

File length, hook count, component count, directory names, or mandatory service/repository layers are review signals, not hard guardrails.

## Known Exceptions

| Exception | Reason / current impact | Scope | Revisit when |
| --- | --- | --- | --- |
| Some multi-table writes still use separate calls or `Promise.all` rather than one transaction | Task completion and Timer pause/finish now have explicit transaction owners; unrelated historical multi-write paths remain | task create/update/delete, categories, selected records/rewards | When touching each remaining workflow, decide its invariant and transaction owner rather than copying completion architecture mechanically |
| API, OpenAPI, and Web response types are manually synchronized | No generated/shared contract has yet justified added tooling | HTTP boundary | Contract drift recurs or a generator can be adopted with lower cost than manual sync |
| Page mode and selected date are not URL state | Current product is a single-page personal tool and does not require deep links | Web navigation | Deep linking, refresh restoration, or browser history becomes a requirement |
| Route modules directly access Drizzle | Simple CRUD remains cohesive and the extra layer would be ceremonial | API resource routes | Queries are reused, storage changes independently, or business logic needs isolated tests |
| Hard and soft deletion semantics are mixed | Historical implementation is inconsistent | selected API resources | A feature's retention/recovery policy is changed; decide deliberately rather than copying nearby code |
| Quick Note creation and its reward grant are separate writes; DELETE hard-deletes despite the legacy deletedAt field | Current route inserts a note then calls grantReward; retrying creation can create a new note/reward ID, and hard deletion is not recoverable | `routes/quick-notes.ts` | B29 establishes an idempotent create transaction and deliberate soft-delete/recovery contract; do not copy the current exception |

Known exceptions are not patterns to copy. New code must not expand their scope without explicitly updating the relevant architecture decision.

## Architecture Decisions

### 2026-09-17 - Preserve the two-workspace system boundary

- Context: Web and API deploy separately but implement one product; they already communicate only over HTTP.
- Decision: Keep `apps/web` and `apps/api` as workspace/runtime boundaries. Do not import API source directly into Web to share types or helpers.
- Consequences: HTTP contracts must be maintained deliberately; shared packages require evidence and an explicit owner.

### 2026-09-17 - Preserve route-centric API ownership for cohesive CRUD

- Context: Most API modules are small, resource-focused handlers with colocated Zod validation and Drizzle access.
- Decision: Do not require service/repository layers for every route. Extract an application/domain contract only for a real cross-route workflow, reusable rule, transaction, or independently testable capability.
- Consequences: Route size is not an architecture failure; cross-table invariant ownership is still mandatory.

### 2026-09-17 - Separate remote snapshots from editable drafts

- Context: The current Web root copies Dashboard records into many local form fields during every reload.
- Decision: Remote data remains a snapshot; editable state is an explicit feature-owned draft initialized at a deliberate workflow boundary.
- Consequences: New features must not add silent server-state mirrors at the root. Existing drafts migrate incrementally.

### 2026-09-17 - Require explicit owners for multi-table workflows

- Context: Completing work can update timers, schedules, tasks, and rewards; several existing paths are not atomic.
- Decision: New or modified multi-table invariants require one workflow owner and one transaction boundary.
- Consequences: Transport routes delegate only when this real contract exists; no broad service layer is implied.

### 2026-09-17 - Treat OpenAPI and migrations as maintained contracts

- Context: HTTP shapes and database schema are represented in multiple artifacts and are not generated automatically.
- Decision: Route-contract changes update OpenAPI; deployed schema changes use versioned migrations and update Drizzle mappings in the same change.
- Consequences: Manual conformance review remains required until focused automation is justified.

### 2026-09-17 - Establish Rewards as the first Web feature boundary

- Context: Rewards UI, remote state, editable draft, and mutations were historically owned by `App.tsx` even though they change as one capability.
- Decision: `features/rewards` owns the complete Rewards page workflow, growth presentation, and client-side reward estimation, and exposes them only through `features/rewards/index.ts`. Application composition injects authenticated HTTP access, global error presentation, and a callback for refreshing the cross-feature Dashboard snapshot after redemption.
- Consequences: Rewards internals no longer belong in `App.tsx`; other features must use its public surface, and this structure is evidence for incremental feature migration rather than a mandatory template for every local component.

### 2026-09-18 - Establish Task completion and work-session finalization owners

- Context: Task completion existed in two routes, while Timer pause/finish wrote Timer, Schedule, Task, and Rewards sequentially. A lost response, partial failure, or concurrent terminal request could leave missing or duplicate facts.
- Decision: `task-completion.ts` owns the Task completion transition and lifecycle reward. `work-session.ts` owns Timer terminal transitions and their Actual projection/reward, and may compose Task completion only through its public transaction-aware contract. Matching terminal retries replay the stored result; transaction row locks serialize concurrent requests.
- Consequences: Generic Task status mutation cannot set `DONE`; Timer finish carries explicit Task-completion intent; workflow projections have stable database identities. Route-centric ownership remains the default for cohesive CRUD.

### 2026-09-18 - Establish Decision Tools as a Web feature boundary

- Context: Decision and psychological-bridge modal state, editable drafts, record loading, validation, mutations, and result/loading state were historically owned by `App.tsx`. Dashboard refresh after a mutation could be composed without making the root the feature owner.
- Decision: `features/decision-tools` owns the complete Decision Tools workflow and exposes only `DecisionToolsFeature`. Application composition injects the selected date, authenticated HTTP access, global error/reward presentation, and a callback that refreshes the cross-feature Dashboard snapshot.
- Consequences: Decision Tools remote reloads update only its record snapshots and never overwrite its active drafts. `App.tsx` no longer owns or reaches into Decision Tools state or handlers, and no generic store, request service, or modal framework is introduced.

### 2026-09-18 - Establish Writing / Reflection draft ownership

- Context: `App.tsx` copied the selected-date Dashboard morning writing, journal, and stock review records into editable fields on every Dashboard load. Any refresh triggered by an unrelated feature could silently replace active unsaved text.
- Decision: `features/writing-reflection` owns the three selected-date drafts, their editors/dialogs, save mutations, and morning/journal AI-analysis workflow. Dashboard provides an initialization snapshot. The feature is deliberately remounted for a selected-date change, while same-date snapshot refreshes never synchronize into its active drafts. Cross-feature archive composition, including media, remains with History rather than being pulled into this feature.
- Consequences: Background Dashboard refresh cannot overwrite an active writing/reflection draft. Failed saves and AI analysis preserve text; successful saves normalize the owned draft. The Web workspace now has a focused component-test harness for this contract, without a global store or generic form/AI/modal layer.

### 2026-09-18 - Establish Tasks as a Web feature boundary

- Context: `App.tsx` owned the Task panel, create/edit/completion drafts, daily-assignment selection, sorting, and Task mutations. Direct Task completion also reused the Timer finish date/time fields, leaving two workflows with split draft ownership.
- Decision: `features/tasks` owns the complete Web Task workflow and exposes `TasksFeature` plus `TasksPanel`. Dashboard data remains a remote snapshot. Application composition injects authenticated HTTP access, refresh/feedback capabilities, and narrow Timer start/pause/finish callbacks. Direct completion owns a separate date/time/note/idempotency draft and still calls the existing Task completion HTTP contract.
- Consequences: Same-date Dashboard refreshes do not replace active create or daily-selection drafts; failed mutations preserve input and successful mutations reset at the workflow boundary. Timer and Schedule state remain with their existing owners, and the Web extraction does not duplicate the server-side completion or work-session policy.

### 2026-09-18 - Establish Media Watch draft ownership

- Context: `App.tsx` copied the selected-date Media Watch record into editable fields after every Dashboard load. An unrelated same-date refresh could replace unsaved title, progress, or notes.
- Decision: `features/media-watch` owns the selected-date draft, editor, and save mutation. Dashboard remains a remote initialization snapshot: the owner waits for a matching-date snapshot, initializes once, ignores later same-date snapshots, and deliberately resets while changing dates. History archive loading remains application composition rather than becoming part of the editor workflow.
- Consequences: Background Dashboard refresh cannot overwrite an active Media Watch draft. Failed saves preserve input and successful saves normalize from the API response, without introducing a generic daily-record abstraction or coupling Media Watch to Sleep.

### 2026-09-19 - Establish Sleep workflow ownership

- Context: `App.tsx` owned the Sleep draft fields, editor dialog, save mutation, and summary interaction, and copied each matching Dashboard response into editable state. Same-date background refreshes could replace an open unsaved Sleep draft, while a date with no record could retain values from the previous date.
- Decision: `features/sleep` owns the complete summary/editor workflow and exposes only `SleepFeature` plus the remote record contract needed by application composition. Dashboard remains the remote snapshot; same-date refreshes update presentation but never synchronize into an active draft. A date change closes the editor and waits for the matching snapshot before reinitializing.
- Consequences: `App.tsx` retains cross-feature use of the Sleep snapshot for Timeline, Water rhythm, and History, but no longer owns Sleep interaction state or mutations. The feature contains one draft/dialog lifecycle, with the dialog private; no provider, generic daily-record abstraction, shared modal framework, or state hook was introduced.

### 2026-09-19 - Establish Calendar / Schedule Web ownership

- Context: `App.tsx` owned the selected-date Schedule draft, editor dialog, create/delete mutations, and all timeline layout/presentation. Category and Task snapshot reconciliation also reached into that draft from the application root.
- Decision: `features/calendar` owns the manual planned/actual Schedule workflow and timeline presentation. Application composition supplies the selected date, remote Schedule/Task/Category snapshots, and normalized cross-feature Sleep/Water marker inputs; the feature derives valid draft selections without copying remote state into a second owner.
- Consequences: Same-date Dashboard refreshes preserve an active Schedule draft, while a selected-date change closes and resets it. Timer and Task completion policy remain with their existing owners, and `App.tsx` retains only the cross-feature timeline input composition required by Calendar and History. No generic form, modal, store, or timeline abstraction was introduced.

### 2026-09-19 - Establish Water workflow ownership

- Context: `App.tsx` owned Water rhythm derivation, drink-time parsing, Calendar marker projection, cup mutation, and the complete hydration panel. This coupled a cohesive daily-record workflow to root rendering and made its behavior testable only through the application shell.
- Decision: `features/water` owns Water snapshot presentation, Sleep-informed rhythm policy, cup mutation, and the pure projection of persisted drink timestamps into Calendar markers. Application composition supplies selected-date Water and Sleep snapshots, then combines the exported markers with other timeline inputs without reaching into Water internals.
- Consequences: Water remains server-canonical and introduces no editable mirror or global store. Calendar still owns layout rather than drink semantics; Sleep remains an injected read-only input rather than a feature-to-feature implementation dependency. No generic daily-record, panel, or timeline abstraction was added.

### 2026-09-19 - Complete the current Web feature-ownership migration

- Context: Categories / Ability CRUD, Timer terminal drafts, archive loading, History statistics, and four independent Task dialog lifecycles still lived in the application root or one oversized feature component after the earlier feature extractions.
- Decision: `features/categories`, `features/timer`, and `features/history` own those cohesive workflows and expose only their semantic composition contracts. Tasks keeps one public feature boundary, while create, daily selection, edit, and direct completion each own their state and mutation lifecycle in private modules; the Task root retains list derivation, row actions, drag/reorder, and composition.
- Consequences at that stage: `App.tsx` owned only the then-remaining session, navigation/date, replaceable Dashboard snapshot, explicit date-entry carryover orchestration, global feedback, and cross-feature composition. Same-date refreshes could not overwrite the migrated drafts, archive state no longer leaked into the root, and no global store, shared package, generic form framework, or cosmetic layer was added. The later application-shell decision below moves those remaining root lifecycles into explicit owners.

### 2026-09-19 - Make Dashboard pure and establish Daily carryover ownership

- Context: `GET /api/dashboard` inherited daily Tasks and unfinished plans and initialized Growth as incidental read side effects. Repeated reads could mutate state, and Schedule creation plus handled-source recording did not share a transaction or stable projection identity.
- Decision: Dashboard is observational only. `POST /api/daily-carryovers` delegates to `applyDailyCarryover({ userId, targetDate })`, which owns explicit date preparation. Daily assignments and planned Schedules are separate retry-safe commit units; the planned projection and carryover marker are atomic, with a database-enforced source identity. Missing Growth is represented as an in-memory zero summary during reads.
- Consequences: Web entry into an authenticated date invokes the command once and then reads Dashboard; ordinary refreshes remain GET-only. Lost responses, retries, and concurrent commands do not duplicate target rows. Migration versions are unique: Quick Notes remains V17 and workflow projection identity is V18.

### 2026-09-19 - Establish the application shell boundaries

- Context: After feature migration, `App.tsx` still owned authentication drafts/session validation, selected-date preparation, Dashboard loading, page composition, header clock/navigation, and global feedback. Those responsibilities had different lifecycles even though feature-specific state had already moved out.
- Decision: `ApplicationFeedback` owns global notice/confirm/reward presentation; `AuthGate` owns token validation, login/register drafts, auth mutations, and logout; `WorkspaceShell` owns selected date, page mode, Dashboard snapshot, explicit carryover-before-read orchestration, reload, and authenticated feature composition. `WorkspaceHeader` owns only header interaction and its clock tick. `App.tsx` composes these owners and nothing else.
- Consequences: Session and Workspace state each have one canonical owner. Dashboard preparation remains an explicit command followed by a read, while ordinary refresh remains read-only. No router, global store, event bus, or generic application controller was introduced; the Workspace dashboard region remains private and is split only where it owns a meaningful composition contract.

## Current Deepen Priorities

`WEB-ROOT-OWNERSHIP-DEEPEN` 的当前实现 backlog 已于 2026-09-19 完成。`APP-SHELL-PURIFICATION` 的当前实现 backlog 已于 2026-09-19 完成。以下是后续变更的持续守护项，不是尚未完成的 feature 迁移切片：

1. Preserve the established Web feature boundaries and keep `App.tsx` limited to composition of application-level owners; do not collapse session, Workspace state, feature drafts, or mutations back into the root.
2. Extend the focused completion CI suite only for newly identified execution invariants such as resume/segments or single-active-session enforcement.
3. Add focused tests when a remaining state transition, Dashboard aggregation rule, or critical HTTP contract is changed; avoid speculative test scaffolding disconnected from behavior.
4. Resolve delete/retention semantics per business capability and reassess URL/shared contracts only when product needs provide evidence.

## vNext Planning Record — Not Yet Implemented

2026-09-17：新增 [vNext PRD](PRD_VNEXT.md)、[功能设计](FUNCTIONAL_DESIGN_VNEXT.md)、[开发计划](DEVELOPMENT_PLAN_VNEXT.md) 与 [Finance PRD](PERSONAL_WORKBENCH_FINANCE_PRD.md)。它们记录后续产品要求；本文上方的当前架构事实仍以现有代码为准。本次文档交付不表示新路由、共享 package、事务或数据模型已经实现。

后续实施采用以下有意决策，并在对应工作包落地时更新本文当前事实与 Known Exceptions：

| Decision | Rationale / ownership | Activation |
| --- | --- | --- |
| 悬赏仍是 Task，接取仍是 TaskDailyAssignment | 保留现有领域与用户选择的主流程；不创建竞争性的 Bounty 真值 | B06 |
| 页面、日期与可分享筛选迁为 URL state | vNext 明确要求深链、刷新恢复与历史导航，满足现有例外的重新评估条件 | B02、B06 |
| 共享 contracts package 从 Task／时间输入与 DTO 开始 | Web/API 已有重复契约，新页面与 Bridge 将增加消费者；仅共享 schema/type，不共享数据库或业务服务 | B05；扩展 npm workspaces 时复审依赖与构建 |
| Execution workflow 统一计时、任务完成、时间投影与奖励事务 | Task completion 与当前 Timer terminal workflow 的 owner/事务/幂等 projection 已于 2026-09-18 激活；结束意图已在 API 显式化。TimerSegment、resume、跨日裁切和 legacy 统计迁移仍未实现 | B07 partial；后续仍须处理 legacy 来源与重复统计 |
| 全部业务 GET 纯读，日结转为幂等命令 | Dashboard carryover 与成长初始化副作用已移除；显式命令 owner 于 2026-09-19 激活 | B04 已激活 |
| Projects、Habits、Finance、Integrations 按独立领域递增加入 | 保持现实事实 owner、权限与账本隔离；Today/Search/Insights 只做组合或派生 | B13 起分域实施 |
| 保留 route-centric 简单 CRUD 与现有 Rewards feature public surface | 不机械采用建议书的整套 domains/service/repository 目录；仅提取有真实事务或复用契约的工作流 | 全阶段 |

产品规格与本记录若后续出现边界冲突，应在实现前明确调整决策，并同次更新本文；不能以“规划里写过”为理由绕过当前 public surface。

### 2026-09-18 — Planning revision: capture, personal growth, and staged delivery

本次核验补入了已有 Quick Notes API ownership，同时记录其前端入口缺失与创建／奖励非原子现状；重复 V17 已通过把 workflow projection identity 顺延为 V18 解决。以下是 **待实施** 决策，不表示已更改运行时契约：

| Decision | Canonical owner / boundary | Activation |
| --- | --- | --- |
| 随手记作为独立捕捉能力，产品入口归 Journal | `quick_notes` 是原文真值；拟设 Web Quick Notes feature 拥有草稿／列表／mutations，经 public surface 被 Quick Add 和 Journal 组合。转 Task 为明确应用事务，引用日记只操作公开草稿入口 | R1.5 / B29；不把状态加回 App 或 Writing / Reflection 内部 |
| 源时间事实权威，统计仅一个 ActualTime 读模型 | TimerSegment 是计时真值，Session 时长派生；手动／legacy Actual 是其自身来源真值，TIMER Schedule 为可重建投影。Execution 对外提供规范化查询，组合 Calendar 的手动记录公开能力；统计排除重复投影，不新增可写通用账本 | R1A/B / B07a/b；现有 session 级唯一身份需先扩展为片段／日期切片身份 |
| 历史日期归属稳定保存 | 绝对发生时刻＋记录 timezone＋businessDate；日期实体保留用户选定业务日期；偏好时区变化不自动重写历史 | R1A/B 起分域扩展，旧记录迁移留依据 |
| 个人成长页与 N 维配置 | Growth 拥有维度／目标版本、个人展示与派生统计，复用 Category 作为技能基础；Rewards 保持 XP／金币唯一 owner，Tasks 仍只引用 Category | R2D / B30；固定 dimensionKey 枚举届时兼容迁移 |
| 周月总结共享唯一正文 owner | Journal / Period Review 拥有正文、已确认事实快照与修订；Growth 页只组合公开读取／编辑入口。AI 只产生可选草稿，不覆盖正文；旧 weekly_summaries 需核验后归并 | R2D / B15 |
| Release 依赖围绕执行切片 | R0 纯读与安全基线 → R1A 语义 → R1B 原子命令 → R1C 骨架 → R1D 主链；R1.5 归位；R2 成长与组织；R3 Finance；R4 Bridge | 以修订开发计划为序，原 B 编号保留用于追踪 |

随手记、成长聚合和周月总结按个人数据边界处理，不能通过 Today/Tasks 集成 scope 展开其原文／关联敏感事实。默认先让 Finance 独立成立，再接 Agent；Finance Projection 与钱包对账仍在其后。简单 CRUD 的 route-centric 组织与现有 feature public surfaces 保持不变。

### 2026-09-18 — v1.4 planning: close semantics before parallel implementation

以下均为待实施决策，当前 route／workflow 仍以本文 Current public surface 和实际源码为准；本次不宣称 slot、Segment、completion events 或 receipts 已落地。

| Decision | Ownership / constraint | Activation |
| --- | --- | --- |
| Assignment 续接决定独立于接取状态 | Tasks 在 Assignment 保存 continuationState（PENDING/CARRIED_FORWARD/DEFERRED/DISMISSED/RESCHEDULED）、处理时间、目标日期／时区／Assignment、版本；批量来源决定与目标写入一个事务 | R1A 固定 schema；R1B B04b/B06a 实现，GET 不解析成隐式写入 |
| 独立用户执行槽为串行化锚点 | Execution 拥有 `user_execution_slots`，userId 主键、activeSessionId 可空；注册／迁移建行，命令必要时按主键幂等补建再 FOR UPDATE；pause 占槽，finish/cancel 同事务释放 | R1A/B；旧适配也必须经过同一锚点，不只查 Session status |
| 统一用户时区快照模型 | user.timezone 默认 Asia/Shanghai；Session.recordTimezone、日期实体 timezone context、Review.periodTimezone 固定各自归属。新偏好不改历史；Review 时区固定边界，UTC 时间区间与日期型记录分别按契约纳入 | R1A 起分域实施；替代“所有业务日期永久上海”的任何目标设计表述，当前旧实现转换规则待迁移 |
| 时间发生时固定项目／类别 | Segment／Manual Actual 保存 projectIdAtOccurrence、categoryIdAtOccurrence；新片段才采新归属，运行中改归属先暂停；legacy 无证据不按当前 Task 回填 | R1A 加可空字段／依据；R2 Projects 消费，ActualTime 聚合沿用源快照 |
| 完成事件独立于当前 Task 和奖励资格 | Task completion owner 每次真实 DONE transition 追加 TaskCompletionEvent；reopen 保留事件、清当前 completedAt；首次奖励仍 taskId 一次，周期统计先筛事件再对 taskId 去重 | R1B；迁旧 completedAt 不虚构不可恢复历史、不补发奖励 |
| 一次动作一个 operationId | API 基础设施提供 transaction-aware mutation_receipts，唯一 userId/operationId，包含 commandType、requestFingerprint、有效默认参数与结果引用；业务 owner 控制外层事务 | R1B 公共底座，随手记／Finance／Bridge 复用；旧 session 终结身份仅保留为业务约束 |

执行类锁顺序按功能设计 3.2 固定为 receipt → user slot → Task → Session/Segment → Assignment/continuation → Reward；跨领域 composition 只能调用公开事务能力，不能不同 route 自行再写一套锁序。回执重放先检查权限、先于新的 version 校验，回放成功结果不重执行业务；不同合法 resume 是不同 operationId。

并行开发按开发计划 G0–G11 分组，当前实现阶段的 ownership 不因此改变。每组单一集成负责人串行合并 schema／迁移编号、OpenAPI、contracts、入口、manifest/lockfile 与本文；其他任务按 feature owner 修改独立文件。契约冻结后可以实现并行，数据库事务和完整链的验收不可拆开宣称通过。R2A/B 后 Finance 可与成长线并行，导入按已稳定领域接入，无需等待所有 R2E 适配。
