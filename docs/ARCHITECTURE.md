# Architecture Governance Baseline

> 本文档是 Personal Workbench 当前项目级 architecture system of record。它记录已经由代码形成、并经审计确认的 ownership、边界和依赖方向，而不是一套待套用的目录模板。
>
> 状态：Baseline，2026-09-21。对架构事实或决策的有意变更必须同步更新本文档。

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
| Web application shell | Router、authenticated AppShell、导航/日期 URL、route outlet、全局 quick action、Timer UI 的路由级 placement、认证边界组合 | Task/Timer/Timeline 业务状态、feature drafts、Timer UI 实现、奖励计算 | `App` -> QueryClient/BrowserRouter -> `ApplicationFeedback` -> `AuthGate` -> `WorkspaceRouter` -> `AppShell` |
| Web Authentication feature | token session validation、login/register drafts、auth mutation、logout/session reset | Workspace date/snapshot、global feedback rendering、feature records | `features/auth/index.tsx` exports `AuthGate`, `AuthSession`, and `AuthUser` |
| Web Router / server-state composition | route tree、按 URL date 执行显式日期准备、按 user/resource/date/id 隔离 Query snapshot、精确 invalidation、跨 route feature composition | feature draft、领域写语义、第二份 Session 真值 | `app/shell/index.tsx`, `app/query.ts`; `app/workspace/index.tsx` 仅保留兼容导出 |
| Web API client | bearer header、HTTP/envelope decode、typed `ApiError`、409/retryable/requestId/field-error metadata | feature query key、领域 command payload、UI feedback policy | `app/api.ts` exports `api`, `ApiError`, `Request`, token storage |
| Web application feedback | global notice/confirm/reward popup state and presentation; narrow callbacks injected into Auth/Workspace/features | feature validation, feature drafts, domain policy | `app/feedback.tsx` exports `ApplicationFeedback` and `FeedbackActions` |
| Web shared UI primitives | 跨 feature 的 Button、IconButton、Badge、FilterChip 交互、可访问性和稳定视觉 variants/sizes | Task/Timer 等领域语义、页面布局、业务状态 | `shared/ui/index.tsx` exports the minimal primitive surface |
| Web Rewards feature | Rewards 页面 UI、成长摘要、奖励预估规则、远端 snapshot、奖励创建 draft、奖励项 mutations | session、顶层 navigation、其他 feature 的奖励触发 workflow | `features/rewards/index.ts` exports the feature UI and reward contracts |
| Web Growth feature | Hero Growth 页面、7/30/90 天投入分布、维度配置/分类映射交互、Today 紧凑入口、Pixel Visual V1 asset slots/fallback | XP/Level 公式、ActualTime、Task completion、Habit occurrence、Finance truth、AppShell navigation ownership | `features/growth/index.tsx`；`pixel-assets.tsx`；`docs/PIXEL_ASSET_CONTRACT_V1.md` |
| Web Decision Tools feature | 决策与心理桥梁 UI、modal 状态、editable drafts、最近记录 snapshot、loading 和 mutations | session、顶层 navigation、Dashboard snapshot、全局奖励/错误展示 | `features/decision-tools/index.tsx` exports `DecisionToolsFeature` |
| Web Writing / Reflection feature | 晨写、日记、股市复盘的 selected-date drafts、编辑 UI/modal、保存 mutations、写作 AI insight 状态与分析 workflow | session、顶层 navigation、跨 feature History archive 组合、媒体/睡眠等其他 daily records | `features/writing-reflection/index.tsx` exports the owner and its composition surfaces |
| Web Tasks feature | 悬赏板、Task detail、Today Task 分组、Assignment 重点、创建／接取／编辑／直接完成意图和 Task HTTP mutations | Timer terminal policy、Schedule CRUD、服务端完成 transition/reward policy、全局反馈展示 | `features/tasks/index.tsx` exports Tasks public surfaces；workflow 文件保持 feature-private |
| Web Sleep feature | 睡眠摘要交互、selected-date draft、编辑 dialog、保存 mutation、日期与 snapshot 初始化 lifecycle | Dashboard/History 聚合、Timeline 投影、Water 派生节奏、其他 daily records | `features/sleep/index.tsx` exports `SleepFeature` and the remote record contract |
| Web Calendar feature | day/week Schedule 呈现、planned lifecycle、Manual Actual correction、时间轴布局与编辑草稿 | Dashboard snapshot、跨 feature Sleep/Water 标记归一化、Timer projection 编辑、Task 完成策略 | `features/calendar/index.tsx` exports `CalendarFeature` and the timeline composition contracts |
| Web Water feature | 饮水 snapshot 呈现、睡眠感知节奏推导、杯数 mutation、Calendar 时间点投影 | Sleep 记录、Calendar 布局、Dashboard 聚合、全局反馈展示 | `features/water/index.tsx` exports `WaterFeature`, `WaterRecord`, and `waterTimelineItems` |
| Web Categories / Ability feature | 分类/技能 CRUD 草稿、维度元数据与能力统计派生 | Task lifecycle、Calendar CRUD、服务端累计规则、全局反馈展示 | `features/categories/index.tsx` exports `CategoriesFeature` and stable category/dimension contracts |
| Web Timer feature | canonical current-session query、R1B commands、stable operation retry、CurrentFocusCard、MiniTimer、结束本次面板 | 服务端 terminal/transaction/reward policy、Task UI、Dashboard `activeTimer`、路由 placement | `features/timer/index.tsx` exports hooks, command contracts and Timer UI surfaces |
| Web Tasks / Assignments / Timeline integration | Tasks 查询与 detail、按日 Assignment/continuation、ActualTime typed mapping 和后端日汇总；Today 只做执行桌面组合 | Today 写 owner、Web 二次统计、page-local Timer truth | `features/tasks` public index、`features/assignments/index.tsx`、`features/timeline/index.ts`、`app/shell` Today route |
| Web History feature | 归档标签和远端记录、详情弹窗、睡眠区间、时间/能力/周统计的只读组合 | 各记录的 canonical writes、Dashboard fetch、顶层 navigation | `features/history/index.tsx` exports `HistoryFeature` and History series contracts；`archive.tsx` 为私有实现 |
| Web Quick Notes feature | 随手记 capture/list/detail/edit/archive/recovery、可选 Project 素材关联、转 Task 确认草稿、引用 Journal 的用户意图 | Project 正文、Task 发布事务、Journal server record、跨域 Search 真值 | `features/quick-notes/index.tsx` exports capture/list/detail surfaces；只经 Projects、Tasks 与 Writing 的公开能力连接 |
| Web Writing Inspiration feature | 灵感库列表/搜索/状态筛选、显式标签 picker/管理、QuickNote 加入灵感库、直接创建、Writing 面板插入当前正文的交互 | QuickNote 正文/标题/项目关系、通用分类体系、Task/Finance truth、自动扫描正文 hashtag | `features/inspirations/index.tsx` exports `InspirationLibraryPage`, `TagPicker`, `QuickNoteInspirationDialog`, `InspirationWritingPanel`；AppShell 只做 Writing 路由组合 |
| Web Search / Settings / Trash features | Search 查询与 URL filters；个人资料、时区、类别启停、展示偏好、主动导出 UI；可恢复删除记录的组合列表与 owner restore 调用 | 各领域记录真值、删除生命周期、奖励结算、历史日期重算、导出持久副本 | `features/search/index.tsx`、`features/settings/index.tsx`、`features/trash/index.tsx`；AppShell 只组合路由与展示开关 |
| Web Finance feature | Finance Overview、Accounts、Transactions、Budgets、Recurring、Reports 六个视图，账户/分类/记账草稿、页面级金额隐藏、筛选与详情交互 | 余额计算、账本事务、Workbench Coins、Agent Wallet、全局 privacy framework；AppShell 只挂路由和 launcher | `features/finance/index.tsx` public surface；公开 Finance-owned cents presentation formatter 供 Settings 的 Finance 数据维护 UI 使用，Account/Record dialogs 保持 feature-private |
| Authentication | 登录/注册 UI、token persistence、session validation；API 的 token/password/auth middleware | tasks、records 等业务状态 | `/api/auth/*`；API `auth.ts` helpers |
| Dashboard / history read model | 指定日期的跨 feature 聚合、统计和展示组合 | 各 feature 的 canonical writes；长期业务规则 | `GET /api/dashboard`；Dashboard response contract |
| Daily carryover workflow | 把前一日未完成的 daily assignments 与 planned schedules 准备到目标日期；幂等与事务边界 | Dashboard 聚合、Task lifecycle、generic Schedule CRUD、Growth 初始化 | `POST /api/daily-carryovers`；`applyDailyCarryover` |
| Tasks and daily assignments | task lifecycle、原子发布/发布并接取、今日接取、重点排序、完成反思；`completeTask` 拥有完成 transition 与完成奖励的事务组合 | generic rewards policy、Timer lifecycle、无关记录 | `/api/tasks/*`、`/api/task-days/*`；`task-publishing.ts`、`task-completion.ts` |
| Timer execution | timer session lifecycle；`finishWorkSession` / `pauseWorkSession` 拥有终结、Timer-derived Actual projection、Timer reward 与可选 Task completion 的外层事务 | Task completion policy、generic Schedule CRUD、Task Days | `/api/timer-sessions/*`；`work-session.ts` |
| Calendar / schedules | planned lifecycle、手工 Actual correction、范围读取；保存 Execution workflow 产生的只读可追溯 projection | Timer 状态与 Task 完成决策；普通 Schedule CRUD 不得修改 TIMER projection | `/api/schedules/*`；`schedules` mapping |
| Task categories | 分类、累计时间目标、nullable current Growth mapping 字段 | Growth dimension config、task lifecycle、全局设计 token | `/api/task-categories/*`；Growth mapping writes 由 Growth public capability 验证 enabled dimension 后更新同一字段 |
| Hero Growth composition | 用户可配置 GrowthDimension；当前 Category→Dimension 解释；7/30/90 天 derived overview；停用维度原子解除当前分类映射 | Task、CompletionEvent、ActualTime、Rewards XP/Level、Habit occurrence、Finance；不持久化 period totals/radar values | `growth.ts`；`/api/growth/*`；V32 `growth_dimensions`；overview 只消费 owners 的 public read capability |
| Daily records | sleep、water、morning writing、journal、stock review 各自的记录和历史 | Dashboard 聚合、跨记录通用状态容器 | 各 resource 的 `/api/<resource>` routes |
| Quick Notes and controlled linking | `quick_notes` 原文、版本化生命周期、幂等恢复、创建奖励事务；一次 Note 到一次 Task 的稳定来源关系；可选当前 Project 素材关联与素材摘要 capability | Project 正文、Task lifecycle、Journal server record、Timeline 时间事实；Task/通用 Project DTO 不反向展开私人原文 | `/api/quick-notes/*`、`GET /api/projects/:id/materials`；`quick-note.ts`、`quick-note-linking.ts`；Web Quick Notes public surface |
| Writing Inspiration Library | `writing_inspirations` 只拥有用户级 favorite/pinned/archive 元数据；`inspiration_tags` 与 link 的规范化、AND 过滤、标签管理和 QuickNote→Inspiration/直接创建事务；正文、标题、noteDate、projectId 永远复用 `quick_notes`，不复制另一份内容真值 | QuickNote 正文 schema、Project relation owner、自动 hashtag 分类、通用 InspirationCategory、Task/Finance 事实 | `/api/writing/inspirations*`、`/api/writing/inspiration-tags*`、`POST /api/quick-notes/:id/inspiration`；`inspiration.ts` 是 Writing public capability，routes 只做 transport validation |
| Habits | Habit definition、生效日 rule/goal、explicit occurrence、skip、weekly-N progress 与 Habit-to-Task source relation；Routines UI | Water/Morning Writing/Sleep 专用事实、Task lifecycle/reward、Growth 目标；不预生成 pending/missed occurrence | `/api/habits/*`；`habits.ts`；Web `features/habits` public surface。Task completion 只调用 Habits 的事务内 binary-link capability |
| Finance core ledger | FinanceAccount/FinanceCategory metadata，append-only FinanceTransaction headers，signed FinanceEntry truth，期初/收入/支出/转账/退款/冲正/更正原子命令，Entry 派生账户余额与 Overview；V30 前置预算、周期模板/发生项和确定性报表；V31 Finance-owned import staging、source identity、sensitive export/restore、reconciliation | Workbench rewards/Coins、Task lifecycle、Stock Review、Agent Wallet、支付执行、通用 Import platform | `/api/finance/*`；`finance.ts` owns canonical transaction posting and read projections；`finance-maintenance.ts` owns batch/staging/backup/reconciliation orchestration；`routes/finance.ts` owns transport validation only |
| Unified Trash read model | 已具备稳定软删除语义的领域摘要组合、分页/类型筛选、向 domain public restore capability 分发命令 | 通用 Trash 真值、别域 lifecycle、永久删除平台、领域表直接恢复写入 | `GET /api/trash`、`POST /api/trash/:type/:id/restore`；当前 eligible type 仅 `quick_note` |
| Search / Settings / Export query surfaces | 登录用户的多域查询组合、用户偏好、主动分域序列化 | 新搜索真值、通用 Item、历史时区重写、自动上传或 Import | `/api/search`、`/api/settings`、`/api/exports/:domain`；route-centric read/serialization |
| Rewards and growth | reward policy、幂等 event key、XP/coin 计算、growth summary、兑换 | 触发奖励的 feature workflow 本身 | `apps/api/src/rewards.ts` exported functions；`/api/rewards/*` |
| AI insights | writing analysis、AI response validation、insight persistence | writing draft 的 canonical ownership | `/api/ai-insights/*` |
| Decision tools | decision records、psychological bridge generation/persistence | generic modal infrastructure、其他记录 owner | `/api/decision-tools/*` |
| Internal AI orchestration（planned consolidation） | provider routing、budget/cost telemetry、AI Artifact、source version/stale、prompt version；逐步接住既有 AI Insight / Decision provider 调用 | Journal/Task/Project/Finance 等业务 truth、外部 Agent Grant | B31；落地前不得把它当成已实现公共 surface |
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
| `apps/web/src/App.tsx` | compose QueryClientProvider、BrowserRouter、`ApplicationFeedback`、`AuthGate` and `WorkspaceRouter` | session state、route state、server snapshots、feature behavior、popup state、direct data loading |
| `apps/api/src/index.ts` | process startup, port binding, startup logging | route behavior, SQL, domain policy |
| `apps/api/src/app.ts` | middleware/error setup and route registration | feature SQL, validation schemas, workflow implementation |
| `apps/api/src/routes/*.ts` | HTTP decoding, auth handoff, validation, response mapping; colocated simple CRUD；调用已建立的 workflow public contracts | unrelated feature internals; multi-owner workflow implementation |
| `db/migration/*.sql` | forward schema evolution | application behavior or repair logic that belongs in runtime workflows |

Route files are transport entrypoints and may remain the complete owner of cohesive, simple CRUD. Thin route files are not a goal by themselves.

## State Ownership

For every mutable value, one canonical owner must be identifiable.

- Server truth: MySQL is canonical for persisted business data. A Web response object is a snapshot, not an independent authority.
- Session: localStorage persists the bearer token; validated in-memory user state owns the active browser session. Persistence must not bypass `/api/auth/me` validation. Logout、invalid token 和新登录都清空 QueryClient，query keys 仍包含 user identity 作为第二层隔离。
- Authentication UI: `AuthGate` owns login/register drafts, auth mutation state, token persistence, session validation, and logout reset; `App` only composes the gate.
- Navigation/date state: Browser Router path 和 `date` query param 是 desktop/mobile 共用真值；refresh、deep link、back/forward 不依赖 component-local `pageMode`。`/` 只负责 replace redirect 到当天 `/today?date=...`。
- Server snapshots: QueryClient 保存按 user/resource/date/id 隔离、可替换的远端快照；MySQL/API 仍是真值。Dashboard 是生活记录聚合 snapshot，Tasks、Assignments、ActualTime、current-session 使用各自 canonical query，不从 Dashboard `activeTimer` 建立并行状态。
- Current Session: `features/timer` 的 `['current-session', userId]` query 是 Today、Task detail、Task cards、AppShell mini timer 的唯一客户端服务端状态源。本地只允许 elapsed render tick；pause gap 由 Segment snapshot 计算，mutation 成功或冲突后精确 invalidation/refetch。
- Feature drafts: editable forms are distinct drafts. They should be owned by the lowest feature/modal/workflow coordinating them, initialized intentionally when editing begins, and not overwritten by unrelated background reloads.
- Writing/reflection drafts initialize from the selected-date Dashboard snapshot only when that date's feature owner mounts. Same-date Dashboard refreshes do not synchronize back into active drafts; changing date deliberately remounts the owner from the new date snapshot.
- Sleep draft initializes once the selected date's Dashboard snapshot is ready. Same-date refreshes do not overwrite an open editor; changing date closes the old editor, clears its draft, and waits for the new snapshot before editing is enabled.
- Local UI state: open/close, hover, tab, drag, and local input state belongs to the lowest component or workflow that coordinates it.
- Workflow state: state shared across several steps or sibling panels belongs to that workflow boundary, not automatically to `App` or a global store.
- Mutation identity: Web 的 retryable Timer command 在一次用户动作开始时生成一个 UUID，同一次自动 HTTP retry 复用；下一次 pause/resume/finish 等动作生成新 UUID。`expectedVersion` 始终作为独立 payload 字段。
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
- `growth.ts` owns GrowthDimension configuration and the current TaskCategory mapping interpretation. Its overview is a derived composition: XP/Level comes from `growthSummary`, time comes only from `actualTimeForRange`, completed actions come from immutable CompletionEvent rows, and explicit Habit completions are summary-only. Finance is outside Growth. Disabling a dimension atomically clears current category mappings to that key; it never rewrites Task, CompletionEvent, ActualTime, Reward, Habit, or Finance facts.
- `task-completion.ts` owns complete, reopen, archive/removal finalization, completion history, pending-continuation closure, and first-completion reward invocation. `completeTask` opens a retryable transaction standalone and its transaction-aware capability participates in an existing outer workflow.
- `work-session.ts` owns vNext start, accept-and-start, pause, resume, finish, cancel, Segment lifecycle, TIMER projections, Timer rewards, slot lifecycle, and optional explicit Task completion. One outer transaction covers every combined invariant; pause does not grant a final reward.
- `task-assignments.ts` owns retryable accept/release and continuation resolution. CARRIED_FORWARD and RESCHEDULED create or reuse the target Assignment in the same transaction; RESCHEDULED also creates its planned Schedule before sources are marked resolved.
- `manual-actual.ts` owns retryable Manual Actual record/correct/cancel and optional atomic Task completion. Manual Actual remains Schedule-owned time truth and never creates a TimerSegment or uses TIMER source identity.
- `execution-read-model.ts` owns pure current-session and ActualTime reads, including the reusable inclusive business-date range capability. Current session is reached only through `user_execution_slots` and must be a vNext RUNNING/PAUSED Session. ActualTime contains closed TimerSegments plus manual/eligible legacy Actual Schedules; TIMER Schedule projections are excluded.
- V19 freezes `(userId, timerSegmentId, sliceDate)` as the vNext TIMER projection identity. The existing `(userId, source, sourceId)` identity remains for workflow compatibility. Manual Actual uses `manual:<operationId>` as replayable source identity; direct Task completion does not create an Actual block.
- `timer_segments` is the canonical time fact for vNext timers; Session duration is a legacy/derived cache and TIMER Schedules are display projections. `actual_time_class` explicitly distinguishes manual Actual, eligible legacy Actual, projection, and non-Actual rows.
- `user_execution_slots` is the per-user serialization anchor. V19 creates an empty row for existing users and registration creates one for new users; GET routes never create slots. vNext start claims the slot, PAUSED retains it, and FINISHED/CANCELLED releases it in the owning transaction. Slot/Session mismatch is a repair-required conflict and is never auto-healed by a command.
- `mutation_receipts` owns only `(userId, operationId)` identity, request fingerprint/snapshot, and replay metadata. Domain workflow owners retain state-machine and transaction ownership; no command bus is introduced.
- `quick-note-linking.ts` owns QuickNote-to-Task conversion. It locks the source Note, composes Task publication through `publishTaskInClient`, persists the one-to-one source relation, and completes the mutation receipt in one transaction; Quick Notes routes must not reproduce Task or Assignment writes.
- Projects owns Project identity, lifecycle, notes, and its read model. Tasks owns the nullable current `projectId` association and validates it through the Projects public capability; Projects must publish Tasks through the Tasks public surface rather than inserting them. Project progress is the equal-weight average of unarchived current Tasks (DONE contributes 100). Project invested time is derived exactly once from occurrence-attributed closed TimerSegments plus included Manual/eligible Legacy Actual Schedules; TIMER Schedule projections and `Task.projectId` joins are excluded.
- A running Task's Project or Category association cannot change while an OPEN Segment exists. Pause closes the old occurrence snapshot; an allowed Task edit changes only current association, and resume creates a new Segment from that association. Manual Actual records an explicit/current Project occurrence snapshot, while correction preserves the existing snapshot unless the caller explicitly changes it. Existing UNKNOWN/NONE history is never inferred or backfilled.
- Journal references are client draft operations owned by Writing / Reflection. Quick Notes can stage a selected text snapshot plus source marker, but cannot save or mutate a Journal server record. The per-user/date local draft and duplicate registry are browser-local aids, not a second domain truth.
- Search directly composes user-scoped domain queries and returns summaries/deep links only. Export serializes each domain on explicit request; Timer-derived Schedule projections are excluded when canonical TimerSegments are exported so time is not double-counted. Neither capability persists a universal record or index.
- Trash is a composition read/dispatch surface, not a persistence owner. It returns only deleted summaries for domains with complete restore contracts and delegates restoration through the owning capability. Archive remains independent. Quick Notes is currently the only eligible domain; Tasks, Schedules, Writing, Projects, Sleep, and Water do not gain new delete semantics from Trash.
- Quick Notes owns nullable `projectId` material association and validates changes through the Projects public capability. Project materials read through a Quick Notes summary capability, exclude deleted Notes, and never copy full body text into the generic Project DTO. Project archive preserves historical association; new association requires an unarchived same-user Project.
- Every retryable R1B command accepts a caller UUID operationId. The receipt is claimed before domain locks; the lock order is receipt → user slot → Task in stable ID order → Session/Segment → Assignment/continuation → Reward. A matching fingerprint returns stored result metadata before current versions/states are reinterpreted; a changed fingerprint returns 409.
- A multi-table invariant must have one workflow owner and one database transaction. Independent `Promise.all` writes are not a transaction.
- `db/schema.ts` is the runtime ORM mapping. Versioned SQL migrations are the authoritative history for changing deployed database shape.
- `docs/openapi.yaml` is the repository's documented public HTTP surface. Changes to route paths, request/response fields, authentication, or error semantics must update it in the same change.
- Media Watch has no application owner or HTTP surface. Its historical `media_watch_records` migration and Drizzle mapping remain only to preserve deployed data until the separately reviewed physical cleanup; runtime code must not query or mutate that table.
- Web types currently mirror API contracts manually. Until a generated/shared contract is justified, API implementation, OpenAPI, and Web types must be reviewed together.
- All user-owned queries and writes must scope by authenticated `userId` unless an endpoint is explicitly public.
- Business dates use `YYYY-MM-DD`. `user.timezone` defaults to Asia/Shanghai for new records, while each persisted `recordTimezone`/`businessDate` snapshot remains stable when preferences or process timezone change. Absolute time facts use UTC semantics.

## Public Module Surfaces

Current intentional surfaces:

- `apps/web`: browser bundle entry via `main.tsx`; `App` 仅组合 QueryClient、BrowserRouter、ApplicationFeedback、AuthGate 与 WorkspaceRouter。`app/api.ts`、`app/query.ts`、`app/shell/index.tsx` 是 application-level surfaces；feature internals 仍隐藏在各自 public exports 后。
- `apps/web/src/features/rewards/index.ts`: the Rewards feature public surface. It exports `RewardsFeature`, the header growth summary, the task reward estimate contract, and reward types required by application composition and task/reward presentation; implementation details remain internal.
- `apps/web/src/features/decision-tools/index.tsx`: the Decision Tools feature public surface. It exports `DecisionToolsFeature`; application composition injects authenticated HTTP access, selected date, global error/reward presentation, and Dashboard refresh without owning the feature's drafts or mutations.
- `apps/web/src/features/writing-reflection/index.tsx`: the Writing / Reflection public surface. It exports the feature owner plus header-shortcut and history-editor composition surfaces, along with the remote record types required by Dashboard and cross-feature archive composition. Drafts, save behavior, AI analysis policy, dialogs, and same-date refresh behavior remain internal.
- `apps/web/src/features/tasks/index.tsx`: the Web Tasks public surface. It exports the workflow owner and its panel composition surface. Application composition injects Dashboard snapshots, authenticated HTTP access, refresh/feedback capabilities, and narrow Timer callbacks; feature-private modules own create, daily-selection, edit, and direct-completion lifecycles, while their models and dialog primitives are not cross-feature surfaces.
- `apps/web/src/features/sleep/index.tsx`: the Sleep public surface. It exports the complete summary/editor workflow and the remote record type needed by Dashboard, Timeline, Water derivation, and History. Application composition injects the matching-date snapshot, authenticated HTTP access, and refresh/error capabilities; draft, dialog, and save behavior remain internal.
- `apps/web/src/features/calendar/index.tsx`: the Calendar public surface. It exports the Schedule workflow owner plus the `Schedule` and `TimelineItem` contracts needed for cross-feature composition. Application composition injects normalized timeline items, Dashboard snapshots, authenticated HTTP access, and refresh/error capabilities; Schedule drafts, mutations, dialog state, and timeline layout remain internal.
- `apps/web/src/features/water/index.tsx`: the Water public surface. It exports the complete hydration display/mutation owner, the remote record contract, and a pure Calendar-marker projection. Application composition injects the matching Water and Sleep snapshots plus authenticated HTTP, refresh, and error capabilities; rhythm policy, cup interaction, mutation behavior, and drink-time parsing remain internal.
- `apps/web/src/features/auth/index.tsx`: the Authentication public surface. `AuthGate` owns session validation, login/register drafts, auth mutations, token persistence, and logout reset; it exposes only the authenticated session capability to the Workspace shell.
- `apps/web/src/app/shell/index.tsx`: authenticated route composition 和 AppShell public surface；拥有 route/date parsing、Outlet、navigation、global mini timer placement 和跨 feature composition，不拥有领域 truth 或 drafts。
- `apps/web/src/app/workspace/index.tsx`: legacy import compatibility export only。`app/workspace/header.tsx` 不再是导航真值，不得作为新 route/pageMode 模式扩展。
- `apps/web/src/app/feedback.tsx`: the application feedback surface. `ApplicationFeedback` owns notice, confirmation, and reward popup lifecycles and injects narrow callbacks; feature-specific policy remains with the caller.
- `apps/web/src/features/categories/index.tsx`: the Categories / Ability public surface. It exports the CRUD owner plus category/dimension contracts and pure dimension helpers required by Tasks, Calendar, and History; editor state and mutation behavior remain internal.
- `apps/web/src/features/timer/index.tsx`: current-session query、R1B Timer command adapter、stable operation retry、CurrentFocusCard、MiniTimer 和共享结束面板 public surface。AppShell 只决定 `/today` 与非 Today 的 placement；其他页面不得声明独立 current timer state 或直接重造 finish UX。
- `apps/web/src/shared/ui/index.tsx`: minimal Button、IconButton、Badge、FilterChip public surface。它只拥有通用 variant、size、focus、disabled/loading 和 icon hit-target contract，不得依赖或分支 Task、Timer、Calendar 等领域语义。
- `apps/web/src/features/tasks/integration.tsx`、`features/assignments/index.tsx`、`features/timeline/index.ts`: typed query/read-model surfaces。App composition 只从 Tasks feature public index 消费 Task surface；独立 Assignments/Timeline feature 不跨入其他 feature internals。
- `apps/web/src/features/history/index.tsx`: the History public surface. It exports the complete read-only History composition and series contracts needed by the Dashboard snapshot. Archive fetching, tab state, record normalization, detail state, charts, and derived statistics remain internal.
- `apps/web/src/features/quick-notes/index.tsx`: the Quick Notes public surface. It exports capture, library, and detail workflows. Conversion UI calls the QuickNote linking command; Journal quoting delegates to the Writing-owned `stageJournalReference` capability and never writes Journal records directly.
- `apps/web/src/features/projects/index.tsx`: the Projects public surface. It owns Project list/detail queries, lifecycle/editor UI, URL-backed detail tabs, and Project composition of Task/plan/ActualTime snapshots. Task creation and editing are delegated to the Tasks public surfaces; Projects does not own Task drafts or writes.
- `apps/web/src/features/finance/index.tsx`: the Finance public surface. It owns Finance page query/draft/dialog interaction and only consumes `/api/finance/*`; account and record forms remain internal. It also exposes the Finance-owned integer-cents presentation formatter to Settings data-maintenance UI so canonical amounts are never reformatted with floating point or duplicated logic. AppShell owns no Finance fact or calculation and exposes only `/finance` plus the existing unified Quick Action launchers.
- `apps/web/src/features/search/index.tsx`, `features/settings/index.tsx`, and `features/trash/index.tsx`: focused route surfaces for URL-backed domain search, user-controlled settings/export, and recoverable deleted-summary composition. Trash owns filter/pagination/restore interaction state but not domain lifecycle or persistence.
- `apps/api/src/app.ts`: exports the configured Hono `app` to the process entrypoint and tests.
- `apps/api/src/routes/*.ts`: each file exports only the route object needed by `app.ts`; all other declarations are internal by default.
- `apps/api/src/mutation-receipt.ts`: `runMutation` is shared retry identity infrastructure. It owns receipt claim/fingerprint/replay only and is not a command bus.
- `apps/api/src/execution-slot.ts`: slot row locking and consistency guards are the shared Execution serialization capability.
- `apps/api/src/task-completion.ts`: complete/reopen/archive/remove are Task lifecycle contracts; transaction-aware completion exists for work-session and Manual Actual composition.
- `apps/api/src/task-publishing.ts`: publish and optional same-transaction accept are the Task publication contract; routes must not compose create-then-accept calls.
- `apps/api/src/quick-note-linking.ts`: QuickNote-to-Task conversion is the cross-domain transaction contract and may compose the transaction-aware Task publication capability. Routes must not call Task route handlers or write Task/Assignment rows themselves.
- `apps/api/src/quick-note.ts`: Quick Note create/reward and idempotent restore are transaction contracts; `projectMaterialsForUser` is the personal-text protected summary surface consumed by Projects. Trash and Projects must not write/read Quick Note internals around these contracts.
- `apps/api/src/finance.ts`: Finance command/query public capability. It owns receipt-backed Account+OPENING+Entry and INCOME/EXPENSE/TRANSFER/REFUND/REVERSAL/CORRECTION+Entry transactions, safe metadata version checks, user/category/account/relation invariants, exact cents and all balance/monthly aggregation. Routes and Web must not insert Entries or recalculate Overview totals.
- `apps/api/src/work-session.ts`: start/accept-and-start/pause/resume/finish/cancel are the vNext Execution contracts. Routes must not reproduce their writes.
- `apps/api/src/task-assignments.ts`: accept/release/resolve/carry-over are Assignment and continuation contracts.
- `apps/api/src/manual-actual.ts`: record/correct/cancel are Manual Actual contracts, including the optional atomic Task-completion composition.
- `apps/api/src/execution-read-model.ts`: `currentSessionForUser`, `actualTimeForUser` and `dailyExecutionForUser` are the canonical pure Execution read contracts. They do not create slots, infer legacy links, or write projections; Web must not recompute settled time totals.
- `apps/api/src/time.ts`: timezone validation and business-day boundary conversion are shared infrastructure for persisted timezone semantics, including DST boundaries.
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

`rewards.ts` is the current example of justified shared domain behavior. `shared/ui` contains only the four primitives already consumed by independent R1D feature owners; Panel、Card、PageHeader and domain components remain local until equivalent evidence exists. Date formatting and other visual helpers are not promoted speculatively.

## Testing Boundaries

The repository has focused MySQL integration tests for Daily carryover and GET purity under `apps/api/tests/workflows.test.ts`. `r1a-domain-semantics.test.ts` independently migrates a fresh database and a production-like V18 fixture through the current forward migrations. `r1b-transaction-workflows.test.ts` verifies operation replay/rollback, concurrent slot claims, Session/Segment lifecycle, atomic completion, Assignment/continuation resolution, Manual Actual, timezone snapshots, and frozen legacy behavior against real MySQL. `r1_5-quick-notes.test.ts` verifies Quick Note receipt/reward atomicity, optimistic edits, recoverable lifecycle, cursor traversal, filters, personal-data isolation, and absence of Task/Timeline/ActualTime side effects. `r1_5-g5b.test.ts` verifies cross-domain conversion replay/concurrency/privacy, Search isolation/filter/pagination, domain Export policy, and Settings/category semantics. `r3-fin01-core-ledger.test.ts` migrates fresh and production-like V27 fixtures through V28 and verifies exact Entry-derived balance, monthly flow, CREDIT liability, receipt replay/conflict, transaction rollback, isolation, disabled history references, timezone snapshots, filters and optimistic metadata. All pin process timezone to `TZ=UTC` where applicable and require a dedicated `TEST_DATABASE_URL` whose database name ends in `_test`; missing configuration or an unavailable database fails rather than skips. The Web workspace uses Vitest + React Testing Library + jsdom. `npm run lint` still performs TypeScript checking rather than ESLint-style rules.

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

### 2026-09-20 - Activate R1B retryable transaction workflows

- Context: V19 established identities and time semantics but did not implement operation replay, slot serialization, Segment lifecycle commands, continuation resolution, or Manual Actual correction. Manual overlap annotations also lacked a persistent aggregate-exclusion marker.
- Decision: Keep the established route-centric architecture and add narrow workflow owners: `mutation-receipt.ts` for identity only, `execution-slot.ts` for serialization guards, `work-session.ts` for Execution, `task-completion.ts` for Task lifecycle, `task-assignments.ts` for Assignment/continuation, and `manual-actual.ts` for Manual Actual. V20 is the minimal forward R1A contract correction adding `schedules.include_in_actual_time`; V1-V19 remain unchanged.
- Consequences: R1B mutations use operationId replay and the fixed lock order, multi-table workflows commit or roll back as one unit, TIMER projections remain derived, and frozen legacy Sessions remain outside slot/Segment commands. R1C must integrate these public HTTP contracts before the R1D user journey can begin.

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

### 2026-09-19 - Retire the Media Watch application capability

- Context: R0 safety closure removes Media Watch from the active product surface, while the deployed `media_watch_records` table and its migration history must remain intact until the separately reviewed physical cleanup.
- Decision: Remove the Media Watch API route, Dashboard aggregate field, Web editor/archive entry, reward trigger, and OpenAPI contract. Keep only the historical migration and the Drizzle table mapping; neither is an active application surface. This decision supersedes the runtime ownership established by the preceding Media Watch decision.
- Consequences: Current application code has no Media Watch read or write path and no UI entry. Existing rows remain untouched and recoverable for R0.5; removing the table or mapping requires a later explicit migration decision.

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

### 2026-09-20 - Activate the R1C Router and server-state shell

- Context: R1C requires direct task links, refresh restoration, browser history, cross-route Timer controls, R1B versioned commands, and user/date cache isolation. The earlier in-memory `pageMode`/Dashboard ownership was intentionally scoped only until these product requirements became real.
- Decision: Browser Router path plus `date` query parameter now own navigation. A single QueryClient owns replaceable server snapshots with user/resource/date/id keys and is cleared on session transitions. `features/timer` owns the one current-session query and R1B command adapter; AppShell places MiniTimer but does not own Timer state. Tasks, Assignments and Timeline expose focused read adapters, while Today remains a composition boundary without a write store. The minimal API client normalizes transport/envelope errors and retry metadata without becoming a generated SDK.
- Consequences: Deep links, refresh, and back/forward share one truth across desktop/mobile. Timer mutation success and 409 conflict invalidate only affected snapshots; one user action retains one operationId across automatic retry. Writing/Reflection drafts remain feature-local and remount only for user/date changes or the initial loading-to-ready snapshot, not same-date refetch. `app/workspace` is a compatibility export and the prior no-router consequence is superseded.

### 2026-09-20 - Deliver the R1D execution vertical slice

- Context: The R1B commands and R1C shell were individually usable but did not yet expose one daily product path for publishing, accepting, executing, reviewing time, and handing off to Journal. Planned lifecycle and Assignment focus also lacked the minimal persisted UI contract.
- Decision: Tasks owns the Bounty Board, Task detail, title-first atomic publish, shared accept surface, and Assignment focus selection. Timer owns all finish-session UI and continues to call only R1B commands. Calendar owns day/week presentation, planned lifecycle, and Manual Actual correction; TIMER projections remain read-only there. Today only composes these owners and consumes `dailyExecutionForUser` totals. Historical dates skip carryover commands and never relocate the canonical current Session. V21 adds only Assignment focus rank and planned Schedule lifecycle/reschedule identity.
- Consequences: The first execution path uses existing Task, Assignment, Segment, Schedule projection, completion, receipt, and reward truths without a page-local store or second time calculation. Publish-and-accept is one backend transaction; settled summaries come from one backend read model; Quick Add exposes only Task, Plan, and Manual Actual. Projects, Quick Notes, recurring schedules, month view, and R1.5+ capabilities remain outside this boundary.

### 2026-09-20 - Activate the G5a capture and rehome boundary

- Context: Quick Notes already had a canonical table and route, but creation and reward were separate transactions, deletion was destructive, the list stopped at one limited page, and no Web owner exposed the capability. Existing writing, life, reward, insight, and tool owners also needed stable routes without moving their state into AppShell.
- Decision: `quick_notes` remains the only capture truth. `quick-note.ts` owns only the cross-table create workflow and composes the existing mutation receipt and transaction-aware reward capabilities; versioned edit/archive/delete/restore and cursor queries remain route-centric. Web `features/quick-notes` owns user-isolated local drafts, list/filter pagination, capture, and detail state. AppShell only composes `/notes`, `/notes/:noteId`, `/journal`, and `/routines`; Writing/Reflection, Sleep, Water, Rewards, History/Insights, and Decision Tools retain their existing state and mutation owners.
- Consequences: A create retry cannot duplicate a Note or reward, reward failure rolls the full command back, and personal Note bodies do not enter Today or Task projections. Today exposes only a light capture trigger; mobile navigation stays at five primary tabs. QuickNote-to-Task and QuickNote-to-Journal remain absent until G5b, and no generic item, habits, growth, search, or cross-domain form abstraction was introduced.

### 2026-09-20 - Activate controlled G5b links and horizontal query surfaces

- Context: G5a established Quick Notes as private source text, while G5b requires an explicit Task snapshot, a non-saving Journal draft reference, user preferences, domain search, and deliberate export without merging their owners.
- Decision: `quick-note-linking.ts` is the single transaction owner for Note-to-Task and composes `publishTaskInClient`; the database enforces one direct Task per Note. Writing / Reflection remains the only Journal draft owner and accepts a selected snapshot through `stageJournalReference`. Settings stays route-centric, Search uses direct user-scoped domain queries, and Export serializes domains on demand. No universal item/index, persisted export copy, shared cross-domain draft, or new data platform is introduced.
- Consequences: Task DTOs expose only a minimal source identity and never Note body/tag; edits or deletion on either side do not propagate content or cascade records. Timezone changes affect future defaults only, disabled categories remain valid historical references, reward display can be hidden without suppressing reward settlement, and Timer projections are not duplicated by Export.

### 2026-09-21 - Establish R2B Trash composition and Project materials

- Context: Quick Notes already had the repository's only complete soft-delete/restore lifecycle, while Projects needed the deferred optional material association. Treating archive as Trash or copying deleted records/private text into universal tables would create competing owners.
- Decision: `routes/trash.ts` is a summary-only composition and restore-dispatch surface with no persistence table. Quick Notes owns idempotent restore and nullable single-Project association; Projects consumes only a first-party protected Quick Note summary capability. V25 adds only `quick_notes.project_id` with `ON DELETE SET NULL` and leaves V1-V24 unchanged.
- Consequences: Current Trash eligibility is intentionally limited to Quick Notes. Archive remains a domain state, restore cannot re-award creation rewards, deleted Notes disappear from Project materials and reappear after restore, and full Note bodies remain outside generic Project/Search/Trash contracts. No permanent-delete platform, universal item, or universal event layer is introduced.

### 2026-09-21 - Establish R2C Habits and specialized life projections

- Context: Routines needed recurring daily, weekday, and weekly-N behavior semantics without converting Water, Morning Writing, or Sleep into duplicate generic facts, and without coupling Habits to the later Growth owner.
- Decision: Habits owns definitions, effective-dated rules/goals, explicit occurrences, and one stable `(userId, habitId, occurrenceDate)` Task link. Pending/missed remain query-derived. Water, Morning Writing, and Sleep are read-only projections composed by Routines. Habit commands reuse mutation receipts; Task completion calls one public transaction-aware Habits capability only for explicitly configured completion-mode links.
- Consequences: Rule, goal, disable, and archive changes do not rewrite history; weekly-N has one Monday-based weekly progress and no fabricated daily misses. Task retry cannot duplicate a Habit occurrence or reward, numeric modes never auto-fill from Task, and R2C adds no Habit reward or Growth target system.

### 2026-09-21 - Establish R2D0 personalization and Today composition

- Context: Pre-Growth product closure needs user-defined Categories, configurable writing entrances, wake-date Sleep semantics, a denser mobile command surface, and a desktop Today utility rail without moving domain state into AppShell or creating Project-local category truth.
- Decision: Settings owns Category presentation metadata and Writing Slot preferences. Category remains a user-wide, cross-Project Task classification and optional nullable future Growth mapping; color never participates in identity, permission, attribution, or calculation. `writing_slots` stores only `enabled` and `sortOrder` for the existing Morning Writing, Journal, and Stock Review owners. Sleep owns explicit start/wake local dates, times, timezone, and wake-date business attribution. Today and AppShell only compose owner surfaces and local navigation/sidebar preferences. Manual Actual continues to use the Calendar editor and existing atomic workflow, with eligible Tasks read from the selected date's accepted Assignments.
- Consequences: Disabling a writing slot removes primary Today/navigation/quick-action entry points but does not delete or hide history, Search, or Export. Existing Categories and historical references remain intact; new accounts receive seven general-purpose defaults and Stock Review stays opt-in. A future `ProjectSection` may organize content only inside one Project and must not replace or duplicate TaskCategory. No Project Category table, generic preference platform, Growth editor, or second time/sleep truth is introduced.


### 2026-09-21 - Prioritize Finance and separate Internal AI from Agent Bridge

- Context: R2A Projects、R2B Trash/Project Materials、R2C Habits 与 R2D0 Personalization 已经激活。Workbench 已覆盖行动、时间、项目、习惯、生活和文字事实，但仍缺真实财务 truth。与此同时，产品新增“英雄培养 + 指引魔法使 + Pixel Fantasy Skin”方向；已有 `ai-insights` / `decision-tools` 只是局部 AI 能力，不能把它们和外部 Agent Bridge 混成一个 owner。
- Decision:
  1. R2D0 的唯一待修产品项是新用户 Writing Slot seed：目标为 Morning Writing / Journal / Stock Review 全部 opt-in；既有用户 preference 与历史正文不通过迁移强改。
  2. Finance 是下一独立核心域。FinanceAccount / FinanceTransaction / FinanceEntry / Budget / Recurring / FinanceImportBatch 归 Finance owner；余额只由有效 Entry 派生。Finance import 不等待通用 R2E。
  3. Internal AI 是 Workbench 内部 orchestration boundary，未来拥有 provider routing、per-feature budget、usage/cost telemetry、AI Artifact、source provenance/version/stale 与 prompt version；它 **不拥有** Journal、Task、Project、Habit、Finance 等业务 truth。
  4. Jev 仅作为可选 typed-decision adapter，用于分类、筛选、routing、gate；统计、金额、日期、时间、完成率等 deterministic facts 继续由 code/SQL 计算。生成式 LLM 只做语义理解、文字生成和复杂推理。
  5. AI 产生的 Task / Journal / Finance 修改一律先成为候选；用户确认后调用目标 domain public capability。不得由 AI orchestration 直接写领域表。
  6. Familiar 是 Internal AI 的 presentation shell 和本地动画状态，不是新的业务 owner。Pixel assets / Hero visual 是 presentation layer，可与 Finance 开发并行，不影响数据语义。
  7. R4 Agent Bridge 仍是外部授权边界：Grant / scope / Candidate / audit。它不复用 Internal AI 的“模型已看过数据”作为授权，也不因 Familiar 存在而自动获得个人文字或财务 scope。
- Consequences: 后续路线可先完成 Finance，再接 Hero Growth / Familiar / Writing AI。AI 成本与模型使用可量化且可替换；确定性日报不必调用 Jev 或 LLM。Finance、Workbench Coins、Agent Wallet 继续永久分账。

### 2026-09-22 - Activate FIN-01 core ledger

- Context: Finance planning froze the independent money boundary, but no executable account, category, transaction or Entry truth existed. FIN-01 requires the first daily-usable ledger without prematurely adding transfer, refund, reversal, budget, recurring, import, payment or projection semantics.
- Decision: Finance owns `finance_accounts`, `finance_categories`, `finance_transactions` and `finance_entries`, with integer CNY cents and authenticated user ownership on every row. Account balance is always a SQL sum of signed Entries whose Transaction status is POSTED; no account/month aggregate stores a competing balance. Account creation may atomically add one OPENING Transaction/Entry and the shared mutation receipt. Opening amount is creation-only in FIN-01. INCOME and EXPENSE each atomically write one header, one signed Entry and one shared receipt after locking and validating the owned active Account and enabled matching Category. Transaction amount/account/date are immutable; note is the only editable transaction metadata. Account/Category metadata use `expectedVersion`.
- Decision: Overview owns one calculation rule: included CASH/BANK/PAYMENT signed balances plus positive CREDIT balances are assets; negative CREDIT balances contribute their absolute value to liabilities; net worth is the signed sum of every included account. Monthly income/expense reads persisted `business_date`, excludes OPENING, and never derives flow from balance changes. New transaction `record_timezone` snapshots `user.timezone`.
- Consequences: Default Finance categories are created only by explicit receipt-backed `POST /api/finance/initialize`; all Finance GETs remain pure. Archived Accounts reject new transactions but retain history and derived balances. Disabled Categories reject new transactions but remain readable through historical references. Web `/finance` owns the user interaction while AppShell only mounts the route, sidebar link and two launchers in the single existing Quick Action. Workbench Coins, Task rewards/lifecycle, Stock Review, Agent Wallet and payment execution remain separate owners. FIN-02 must extend this ledger with explicit transfer/refund/reversal semantics rather than mutating posted FIN-01 amounts.

### 2026-09-22 - Activate FIN-02 append-only money workflows

- Context: Transfer, refund, correction and void workflows must preserve FIN-01 history while changing effective account flow.
- Decision: V29 adds explicit transaction provenance (`source_account_id`, `target_account_id`, `related_transaction_id`) and status values POSTED/REVERSED/VOIDED. Transfer writes one zero-flow header plus two signed Entries; optional fees are a linked EXPENSE. Refunds lock the original EXPENSE and accumulate against its signed Entry. Correction and void append reversal Entries and retain the original header. Account archive/unarchive is receipt-backed and archived accounts reject new writes but remain in all-account history and balance reads.
- Consequences: `finance.ts` remains the sole multi-table owner; routes validate only. Balance is always Entry-derived and GET projections never repair or infer missing relations. FIN-03 budget/recurring/import semantics remain outside this boundary.

### 2026-09-23 - Close FIN-03 effective-flow and recurring edge semantics

- Context: Budget, Overview, and Report must not diverge when a refund or correction is recorded in a later business month; recurring preparation and posting also need explicit date, snapshot, and rollback contracts.
- Decision: `finance.ts` owns one effective-flow read rule consumed by Overview, Budget, and Report. Original transactions stay in their original month. A later correction is append-only: the correction month contains a reversal plus replacement net adjustment, while the original month is not rewritten. A positive refund is a negative expense contribution. Monthly recurrence clamps day values to the last calendar day (including leap February); weekly recurrence matches the stored weekday and never emits dates after `endDate`. Preparation is an explicit idempotent command keyed by `(templateId, scheduledDate)`, and each occurrence snapshots amount/account/category at preparation time. Posted and skipped snapshots are immutable; future pending snapshots are frozen under the current policy. Confirm is receipt-idempotent and transactionally rolls back the occurrence, ledger, and receipt together on failure.
- Consequences: `routes/finance.ts` remains transport-only while all cross-table invariants stay in `finance.ts`; archived accounts and disabled categories fail pending posting explicitly. No consumer may introduce a second monthly-flow or recurring-date interpretation.

### 2026-09-24 - Activate FIN-04 Finance data maintenance

- Context: External CSV maintenance and Workbench Finance backup must remain distinct from canonical ledger writes while preserving auditability and graph relations.
- Decision: V31 adds Finance-owned import batches/rows/audits and canonical transaction source identity. `finance-maintenance.ts` owns preview, duplicate classification, partial retry, versioned JSON/CSV export, isolated empty-domain restore, and read-only reconciliation; each confirmed external row calls the Finance-owned imported-posting capability in `finance.ts`. Restore is preview-first, operationId-backed, all-or-nothing, and remaps IDs rather than preserving auto-increment values. Sensitive export is explicit POST-only and records metadata, never file contents.
- Consequences: External CSV supports only explicit INCOME/EXPENSE candidates; transfer/refund/correction remain existing Finance workflows. Preview can stage rows but never changes balances, budgets, or reports. Search may expose Finance summaries without amounts and deep-link to Finance detail. No generic import platform or second ledger truth is introduced.


## Current Deepen Priorities

`WEB-ROOT-OWNERSHIP-DEEPEN` 的当前实现 backlog 已于 2026-09-19 完成。`APP-SHELL-PURIFICATION` 的当前实现 backlog 已于 2026-09-19 完成。以下是后续变更的持续守护项，不是尚未完成的 feature 迁移切片：

1. Preserve the established Web feature boundaries and keep `App.tsx` limited to composition of application-level owners; do not collapse session, Workspace state, feature drafts, or mutations back into the root.
2. Extend the focused completion CI suite only for newly identified execution invariants such as resume/segments or single-active-session enforcement.
3. Add focused tests when a remaining state transition, Dashboard aggregation rule, or critical HTTP contract is changed; avoid speculative test scaffolding disconnected from behavior.
4. Resolve delete/retention semantics per business capability and reassess URL/shared contracts only when product needs provide evidence.

## vNext Staged Architecture Record

2026-09-17：新增 [vNext PRD](PRD_VNEXT.md)、[功能设计](FUNCTIONAL_DESIGN_VNEXT.md)、[开发计划](DEVELOPMENT_PLAN_VNEXT.md) 与 [Finance PRD](PERSONAL_WORKBENCH_FINANCE_PRD.md)。此表按工作包记录分阶段激活状态；本文上方的当前架构事实与实际源码仍是当前 contract。

后续实施采用以下有意决策，并在对应工作包落地时更新本文当前事实与 Known Exceptions：

| Decision | Rationale / ownership | Activation |
| --- | --- | --- |
| 悬赏仍是 Task，接取仍是 TaskDailyAssignment | 保留现有领域与用户选择的主流程；不创建竞争性的 Bounty 真值 | B06 |
| 页面、日期与可分享筛选迁为 URL state | vNext 明确要求深链、刷新恢复与历史导航，满足现有例外的重新评估条件 | B02、B06 |
| 共享 contracts package 从 Task／时间输入与 DTO 开始 | Web/API 已有重复契约，新页面与 Bridge 将增加消费者；仅共享 schema/type，不共享数据库或业务服务 | B05；扩展 npm workspaces 时复审依赖与构建 |
| Execution workflow 统一计时、任务完成、时间投影与奖励事务 | Segment/slot、operation receipt、Task lifecycle、continuation、Manual Actual、projection slice identity 和 ActualTime 已由窄 workflow owner 实现；legacy Session 冻结 | R1A schema/read 与 R1B command 已激活；R1C 接入 |
| 全部业务 GET 纯读，日结转为幂等命令 | Dashboard carryover 与成长初始化副作用已移除；显式命令 owner 于 2026-09-19 激活 | B04 已激活 |
| Projects、Habits、Finance、Internal AI、Integrations 按独立边界加入 | Projects、Habits、R2D0 Personalization 已激活；Finance 仍是独立财务 truth；Internal AI 只产生派生 artifacts；外部 Integrations 继续通过 Grant/Candidate 边界 | Projects/Habits/R2D0 已激活；Finance 为下一领域；AI/Bridge 后续分阶段 |
| 保留 route-centric 简单 CRUD 与现有 Rewards feature public surface | 不机械采用建议书的整套 domains/service/repository 目录；仅提取有真实事务或复用契约的工作流 | 全阶段 |

产品规格与本记录若后续出现边界冲突，应在实现前明确调整决策，并同次更新本文；不能以“规划里写过”为理由绕过当前 public surface。

### 2026-09-18 — Planning revision: capture, personal growth, and staged delivery

本次核验补入了已有 Quick Notes API ownership，同时记录其前端入口缺失与创建／奖励非原子现状；重复 V17 已通过把 workflow projection identity 顺延为 V18 解决。下表保留阶段性决策及其当前激活状态：

| Decision | Canonical owner / boundary | Activation |
| --- | --- | --- |
| 随手记作为独立捕捉能力，产品入口归 Journal | `quick_notes` 是原文真值；Web `features/quick-notes` 拥有按用户隔离的草稿、列表、详情和 mutations，经 public surface 被 Today 与 Journal 组合。API `quick-note.ts` 拥有创建事务，`quick-note-linking.ts` 组合 Task publication；Journal 引用只经 Writing-owned draft bridge | R1.5 G5a capture 与 G5b 受控连接已激活；不把原文状态加回 App、Tasks 或 Journal server record |
| 源时间事实权威，统计仅一个 ActualTime 读模型 | TimerSegment 是计时真值，Session 时长派生；手动／legacy Actual 是其自身来源真值，TIMER Schedule 为可重建投影。Execution 对外提供规范化查询，统计排除 TIMER projection 与显式 exclusion | R1A schema/query 与 R1B 写命令已激活 |
| 历史日期归属稳定保存 | 绝对发生时刻＋记录 timezone＋businessDate；日期实体保留用户选定业务日期；偏好时区变化不自动重写历史 | R1A 执行链字段与 migration 已激活；其余领域按阶段扩展 |
| 个人成长页与 N 维配置 | Growth 拥有维度／目标版本、个人展示与派生统计，复用 Category 作为技能基础；Rewards 保持 XP／金币唯一 owner，Tasks 仍只引用 Category | R2D / B30；固定 dimensionKey 枚举届时兼容迁移 |
| 周月总结共享唯一正文 owner | Journal / Period Review 拥有正文、已确认事实快照与修订；Growth 页只组合公开读取／编辑入口。AI 只产生可选草稿，不覆盖正文；旧 weekly_summaries 需核验后归并 | R2D / B15 |
| Release 依赖围绕已稳定 truth owner | 已完成 R0→R2D0；后续产品顺序调整为 R2D0.1 → R3 Finance → Hero Growth → Internal AI / Familiar → Reviews / AI experiences → R2E Import → R4 Bridge | 以 v1.5 开发计划为序；优先级调整不改变既有 owner |

随手记、成长聚合和周月总结按个人数据边界处理，不能通过 Today/Tasks 集成 scope 展开其原文／关联敏感事实。默认先让 Finance 独立成立，再接 Agent；Finance Projection 与钱包对账仍在其后。简单 CRUD 的 route-centric 组织与现有 feature public surfaces 保持不变。

### 2026-09-18 — v1.4 planning: close semantics before parallel implementation

V19 已激活 R1A schema 与只读契约；V20 仅补充 Manual Actual 的显式聚合包含标记。R1B 命令事务、锁序与 replay 已激活，legacy Session 仍冻结且不进入 slot/Segment 命令。

| Decision | Ownership / constraint | Activation |
| --- | --- | --- |
| Assignment 续接决定独立于接取状态 | Tasks 在 Assignment 保存 continuationState（LEGACY_UNRESOLVED/PENDING/CARRIED_FORWARD/DEFERRED/DISMISSED/RESCHEDULED）、处理时间、目标日期／时区／Assignment、版本；纯读候选排除 legacy unresolved | R1A schema/query 与 R1B 批量决定命令已激活 |
| 独立用户执行槽为串行化锚点 | Execution 拥有 `user_execution_slots`，userId 主键、activeSessionId 可空；迁移和注册建空 slot，legacy PAUSED 不占 slot，GET 只读 | R1A schema/query 与 R1B start/pause/resume/finish/cancel 锁序已激活 |
| 统一用户时区快照模型 | user.timezone 默认 Asia/Shanghai；Session、Assignment、Schedule、Journal、QuickNote 和 CompletionEvent 固定 recordTimezone，真实区间存 UTC 语义绝对时间 | R1A schema/conversion 已激活；R1.5 G5b 设置 UI 已接入未来默认值，历史快照不重算 |
| 时间发生时固定项目／类别 | Segment／Manual Actual 保存 project/category occurrence ID 与 UNKNOWN/NONE/ATTRIBUTED 状态；legacy 无证据保持 UNKNOWN。V24 建立 Project owner 与 Task 当前 FK，但 occurrence 快照仍不加历史推断 FK 或回填 | R1A schema/read 与 R2A Projects 消费已激活 |
| 完成事件独立于当前 Task 和奖励资格 | TaskCompletionEvent 保存 lifecycle identity；每次真实 non-DONE → DONE 新增事件，reopen 不删除历史，首次奖励仍由 taskId 唯一事件键限制 | R1A schema/backfill 与 R1B reopen/complete 已激活 |
| 一次动作一个 operationId | mutation_receipts 唯一 userId/operationId，保存 commandType、版本、fingerprint、参数快照与结果元数据；业务 owner 控制事务 | R1A schema 与 R1B transaction-aware replay 已激活 |

执行类锁顺序按功能设计 3.2 固定为 receipt → user slot → Task → Session/Segment → Assignment/continuation → Reward；跨领域 composition 只能调用公开事务能力，不能不同 route 自行再写一套锁序。回执重放先检查权限、先于新的 version 校验，回放成功结果不重执行业务；不同合法 resume 是不同 operationId。

历史 G0–G11 已覆盖至 R2D0 的主体实施。后续按 v1.5 当前工作包推进：Finance 作为下一核心域，视觉资产可并行；Internal AI 与外部 Bridge 分开。单一集成负责人仍串行合并 schema／迁移编号、OpenAPI、contracts、入口、manifest/lockfile 与本文；事务和完整链验收不可拆开宣称通过。
