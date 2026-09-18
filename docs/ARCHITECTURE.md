# Architecture Governance Baseline

> 本文档是 Personal Workbench 当前项目级 architecture system of record。它记录已经由代码形成、并经审计确认的 ownership、边界和依赖方向，而不是一套待套用的目录模板。
>
> 状态：Baseline，2026-09-17。对架构事实或决策的有意变更必须同步更新本文档。

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
- Web：当前为 root-centric SPA；`App.tsx` 仍承载多个 feature，属于已知待深化区域，而不是推荐扩展方式。
- API：route-centric；简单 CRUD 的 transport、validation 和 data access colocate 在对应 route module。
- 数据库：SQL migration 记录演进历史，Drizzle schema 提供运行时映射。
- 集成：Web 与 API 只通过 HTTP 交互，不跨 workspace import 源码。

项目规模不要求机械引入通用 service/repository/use-case 分层。只有真实业务 contract、跨表 invariant、复用或独立测试需求出现时才建立应用或领域边界。

## Module / Feature Ownership

| Module / feature | Owns | Does not own | Current public surface |
| --- | --- | --- | --- |
| `apps/web/src/main.tsx` | React bootstrap、根样式加载、挂载 `App` | feature state、业务规则、data fetching | 浏览器入口 |
| Web application composition | session gate、顶层页面组合、跨 feature navigation | feature-specific draft、mutation policy、可局部拥有的交互状态 | `App` component |
| Web Rewards feature | Rewards 页面 UI、成长摘要、奖励预估规则、远端 snapshot、奖励创建 draft、奖励项 mutations | session、顶层 navigation、其他 feature 的奖励触发 workflow | `features/rewards/index.ts` exports the feature UI and reward contracts |
| Authentication | 登录/注册 UI、token persistence、session validation；API 的 token/password/auth middleware | tasks、records 等业务状态 | `/api/auth/*`；API `auth.ts` helpers |
| Dashboard / history read model | 指定日期的跨 feature 聚合、统计和展示组合 | 各 feature 的 canonical writes；长期业务规则 | `GET /api/dashboard`；Dashboard response contract |
| Tasks and daily assignments | task lifecycle、今日接取、排序、完成反思；`completeTask` 拥有完成 transition 与完成奖励的事务组合 | generic rewards policy、Timer lifecycle、无关记录 | `/api/tasks/*`、`/api/task-days/*`；`task-completion.ts` |
| Timer execution | timer session lifecycle；`finishWorkSession` / `pauseWorkSession` 拥有终结、Timer-derived Actual projection、Timer reward 与可选 Task completion 的外层事务 | Task completion policy、generic Schedule CRUD、Task Days | `/api/timer-sessions/*`；`work-session.ts` |
| Calendar / schedules | planned block、手工 Actual block、时间轴 CRUD；保存 Execution workflow 产生的可追溯 projection | Timer 状态与 Task 完成决策 | `/api/schedules/*`；`schedules` mapping |
| Task categories / abilities | 分类、能力维度、累计时间目标 | task lifecycle、全局设计 token | `/api/task-categories/*` |
| Daily records | sleep、water、morning writing、journal、stock review、media watch 各自的记录和历史 | Dashboard 聚合、跨记录通用状态容器 | 各 resource 的 `/api/<resource>` routes |
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
| `apps/web/src/App.tsx` | session gate, top-level navigation/composition, temporary compatibility orchestration while features are migrated | new unrelated feature drafts, durable business policy, growing mutation families |
| `apps/api/src/index.ts` | process startup, port binding, startup logging | route behavior, SQL, domain policy |
| `apps/api/src/app.ts` | middleware/error setup and route registration | feature SQL, validation schemas, workflow implementation |
| `apps/api/src/routes/*.ts` | HTTP decoding, auth handoff, validation, response mapping; colocated simple CRUD；调用已建立的 workflow public contracts | unrelated feature internals; multi-owner workflow implementation |
| `db/migration/*.sql` | forward schema evolution | application behavior or repair logic that belongs in runtime workflows |

Route files are transport entrypoints and may remain the complete owner of cohesive, simple CRUD. Thin route files are not a goal by themselves.

## State Ownership

For every mutable value, one canonical owner must be identifiable.

- Server truth: MySQL is canonical for persisted business data. A Web response object is a snapshot, not an independent authority.
- Session: localStorage persists the bearer token; validated in-memory user state owns the active browser session. Persistence must not bypass `/api/auth/me` validation.
- Dashboard data: the Dashboard request owns a replaceable remote snapshot for the selected date. Derived lists, maps, totals, filters, and chart series should be computed from that snapshot rather than stored as competing state.
- Feature drafts: editable forms are distinct drafts. They should be owned by the lowest feature/modal/workflow coordinating them, initialized intentionally when editing begins, and not overwritten by unrelated background reloads.
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
- `dashboard.ts` owns a cross-feature read model. It may read several owners' data but must not become the canonical owner of their writes or rules.
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

- `apps/web`: browser bundle entry via `main.tsx`; `App` is the application composition surface. Other functions/components in `App.tsx` are internal despite residing in one file.
- `apps/web/src/features/rewards/index.ts`: the Rewards feature public surface. It exports `RewardsFeature`, the header growth summary, the task reward estimate contract, and reward types required by application composition and task/reward presentation; implementation details remain internal.
- `apps/api/src/app.ts`: exports the configured Hono `app` to the process entrypoint and tests.
- `apps/api/src/routes/*.ts`: each file exports only the route object needed by `app.ts`; all other declarations are internal by default.
- `apps/api/src/task-completion.ts`: `completeTask` is the Task completion contract; its transaction-aware form exists for an owning outer workflow, and `completeTaskWithActualTime` preserves the current direct-completion HTTP behavior without moving generic Schedule CRUD into Tasks.
- `apps/api/src/work-session.ts`: `finishWorkSession` and `pauseWorkSession` are the Execution finalization contracts. Routes must not reproduce their writes.
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

The repository has focused MySQL integration tests for Task completion and work-session finalization under `apps/api/tests/workflows.test.ts`. They require a dedicated `TEST_DATABASE_URL` whose database name ends in `_test` and the complete migration schema; missing configuration or an unavailable database fails the tests. Fixtures clean workflow data but do not recreate tables. `npm run lint` still performs TypeScript checking rather than ESLint-style rules.

`.github/workflows/ci.yml` owns CI verification only: an isolated MySQL 8 service starts with an empty `personal_workbench_test` database, Flyway applies and validates all versioned SQL migrations, then `npm run test:workflows:ci` executes the focused database suite. The CI reporter fails on skipped/TODO/cancelled/failed tests or a missing/empty summary. Typecheck, lint and build run only after the suite passes. Production composition and workflow ownership are unchanged; this workflow does not deploy.

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
| `App.tsx` owns many remaining feature drafts, mutations, derived data, and page composition | Incremental product growth concentrated ownership in the root; Rewards ownership has moved out, but unrelated remaining workflows are still coupled | Web application excluding Rewards | Migrate one coherent feature slice at a time; do not split by arbitrary LOC |
| `GET /api/dashboard` performs daily-task and schedule carryover writes | Carryover was coupled to opening a date; GET is not currently a pure read | Dashboard API | Define an explicit idempotent command/workflow and make Dashboard read-only |
| Some multi-table writes still use separate calls or `Promise.all` rather than one transaction | Task completion and Timer pause/finish now have explicit transaction owners; unrelated historical multi-write paths remain | task create/update/delete, categories, selected records/rewards | When touching each remaining workflow, decide its invariant and transaction owner rather than copying completion architecture mechanically |
| API, OpenAPI, and Web response types are manually synchronized | No generated/shared contract has yet justified added tooling | HTTP boundary | Contract drift recurs or a generator can be adopted with lower cost than manual sync |
| Page mode and selected date are not URL state | Current product is a single-page personal tool and does not require deep links | Web navigation | Deep linking, refresh restoration, or browser history becomes a requirement |
| Route modules directly access Drizzle | Simple CRUD remains cohesive and the extra layer would be ceremonial | API resource routes | Queries are reused, storage changes independently, or business logic needs isolated tests |
| Hard and soft deletion semantics are mixed | Historical implementation is inconsistent | selected API resources | A feature's retention/recovery policy is changed; decide deliberately rather than copying nearby code |

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

## Current Deepen Priorities

Ranked by change cost and architecture risk:

1. Move carryover/inheritance writes out of `GET /api/dashboard` into an explicit, idempotent workflow.
2. Continue migrating one coherent Web feature at a time out of root ownership. Rewards is the first established boundary and must not be collapsed back into `App.tsx`; preserve behavior and avoid arbitrary file splitting.
3. Move writing/record form drafts to their feature/modal owners so unrelated Dashboard reloads cannot overwrite unsaved input.
4. Extend the focused completion CI suite only for newly identified execution invariants such as resume/segments or single-active-session enforcement.
5. Add focused tests for remaining state transitions, Dashboard aggregation, and critical HTTP contracts.
6. Resolve delete/retention semantics per business capability and document deliberate exceptions.
7. Reassess URL navigation and generated/shared API contracts only when product needs or repeated drift provide evidence.

## vNext Planning Record — Not Yet Implemented

2026-09-17：新增 [vNext PRD](PRD_VNEXT.md)、[功能设计](FUNCTIONAL_DESIGN_VNEXT.md)、[开发计划](DEVELOPMENT_PLAN_VNEXT.md) 与 [Finance PRD](PERSONAL_WORKBENCH_FINANCE_PRD.md)。它们记录后续产品要求；本文上方的当前架构事实仍以现有代码为准。本次文档交付不表示新路由、共享 package、事务或数据模型已经实现。

后续实施采用以下有意决策，并在对应工作包落地时更新本文当前事实与 Known Exceptions：

| Decision | Rationale / ownership | Activation |
| --- | --- | --- |
| 悬赏仍是 Task，接取仍是 TaskDailyAssignment | 保留现有领域与用户选择的主流程；不创建竞争性的 Bounty 真值 | B06 |
| 页面、日期与可分享筛选迁为 URL state | vNext 明确要求深链、刷新恢复与历史导航，满足现有例外的重新评估条件 | B02、B06 |
| 共享 contracts package 从 Task／时间输入与 DTO 开始 | Web/API 已有重复契约，新页面与 Bridge 将增加消费者；仅共享 schema/type，不共享数据库或业务服务 | B05；扩展 npm workspaces 时复审依赖与构建 |
| Execution workflow 统一计时、任务完成、时间投影与奖励事务 | Task completion 与当前 Timer terminal workflow 的 owner/事务/幂等 projection 已于 2026-09-18 激活；结束意图已在 API 显式化。TimerSegment、resume、跨日裁切和 legacy 统计迁移仍未实现 | B07 partial；后续仍须处理 legacy 来源与重复统计 |
| 全部业务 GET 纯读，日结转为幂等命令 | 移除 Dashboard carryover 与成长初始化副作用，避免读取历史或集成读取改变事实 | B04 |
| Projects、Habits、Finance、Integrations 按独立领域递增加入 | 保持现实事实 owner、权限与账本隔离；Today/Search/Insights 只做组合或派生 | B13 起分域实施 |
| 保留 route-centric 简单 CRUD 与现有 Rewards feature public surface | 不机械采用建议书的整套 domains/service/repository 目录；仅提取有真实事务或复用契约的工作流 | 全阶段 |

产品规格与本记录若后续出现边界冲突，应在实现前明确调整决策，并同次更新本文；不能以“规划里写过”为理由绕过当前 public surface。
