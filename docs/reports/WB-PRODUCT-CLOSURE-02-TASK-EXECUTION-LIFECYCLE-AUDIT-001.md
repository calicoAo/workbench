# PRODUCT-CLOSURE-02 — TASK-EXECUTION-LIFECYCLE-FIX 前置审计

日期：2026-10-10

## RESULT

AUDIT_COMPLETE。两个现象均已找到可复现根因；本次没有实施产品修复，不能把 `TASK-EXECUTION-LIFECYCLE-FIX` 标为关闭。

范围仅为 Task complete 的 active-session guard，以及 pause/resume → Segment → execution history。PRODUCT-CLOSURE-01 保持关闭；钱包、星标、Dialog、Settings、Save Point 与视觉迁移不在本次范围。

## ROOT_CAUSE — 409 COMPLETE

`PUT /api/tasks/:id/complete` 委托 `completeTask`。该函数先锁用户 execution slot，再调用 `requireEmptySlot`，之后才读取目标 Task。guard 只判断 `activeSessionId !== null`，没有比较 Session 的 `taskId` 与目标 Task。

所以以下四种情况都返回相同的 `409 another session is active`：

| 用户执行槽 | 要完成的目标 | 当前结果 |
| --- | --- | --- |
| Task A RUNNING | 无关 Task B | 409 |
| Task A PAUSED | 无关 Task B | 409 |
| Task A RUNNING | 同一个 Task A | 409 |
| Task A PAUSED | 同一个 Task A | 409 |

这不是并发请求偶发冲突，也不是 `expectedVersion` 不匹配；该 guard 发生在 Task 版本校验之前。PAUSED 持续占槽是已经明确的执行契约，不能通过释放暂停槽来规避这个问题。

证据：

- `apps/api/src/routes/tasks.ts:340`：Task complete 路由。
- `apps/api/src/task-completion.ts:72`：standalone complete workflow；85–88 行先判空槽再锁 Task。
- `apps/api/src/execution-slot.ts:12`：`requireEmptySlot` 仅判断槽是否为空。
- `docs/ARCHITECTURE.md:216`：PAUSED 保留槽，FINISHED/CANCELLED 在事务内释放槽。

直接完成的“同时补录实际投入”分支还会调用 `recordManualActual(... completeTask: true)`；它在 `apps/api/src/manual-actual.ts:70` 复用了相同的全用户空槽限制。这是同一 guard 范围问题的相邻入口，实施时应有一致的目标 Task 判断；本次仅静态确认该分支，没有把它列为已执行的动态场景。

原始生产请求中的 Task #23 当时究竟关联哪个 active Session，本次没有生产快照，不能据此断言。上述四种情况均在隔离环境通过真实 authenticated API 复现。

## SAME-TASK COMPLETION — EXISTING SEMANTICS

仓库已经提供明确的原子路径：

`PUT /api/timer-sessions/:id/finish`

带 `completeTask: true`、`expectedVersion`、`expectedTaskVersion`。

`finishWorkSession` 关闭仍 OPEN 的 Segment、累计实际工作时间、完成 Session、释放 slot、调用 Task completion capability、生成完成事件和奖励；这些步骤在同一 receipt-backed 事务中完成。PAUSED 也能走这个路径，暂停间隔不计为工作。

Task detail 已区分当前 Task 与非当前 Task：当前 Task 展示“完成悬赏并结束”，由 Timer command 执行；非当前 Task 展示直接完成。Today 的 Task row 完成入口和 Bounty 的 more menu 仍通向 `CompleteTaskWorkflow`，该 workflow 没有接收 active-session 关系，最终调用 standalone complete。因此不同入口对同一个当前 Task 的完成意图不一致。

证据：

- `apps/api/src/work-session.ts:244`：原子 complete-and-finish。
- `apps/web/src/features/timer/index.tsx:85`：Timer command adapter 的 `completeAndFinish`。
- `apps/web/src/app/shell/index.tsx:413`：Task detail 的显式原子完成组合。
- `apps/web/src/features/tasks/index.tsx:186`：Task row 的 `onDone` 通向 `toggleDone`。
- `apps/web/src/features/tasks/index.tsx:269`：直接完成 workflow 的组合输入没有 current-session 判断能力。
- `apps/web/src/features/tasks/bounty-board.tsx:61`：当前 Task 的 more menu 仍可选“直接完成”。
- `apps/web/src/features/tasks/complete-task.tsx:53`：direct/manual completion 选择。

实施建议是把这些完成入口对齐到现有显式“完成悬赏并结束”意图，保留 Timer workflow 的事务所有权。不要在 standalone Task complete 内悄悄结束 Timer，也不要让客户端先 finish 再 complete 两次提交。

## ROOT_CAUSE — PAUSE / RESUME HISTORY

后端执行事实已经完整：

1. pause 把当前 OPEN Segment 变成 CLOSED，并立即生成 TIMER Schedule projections。
2. Session 变成 PAUSED，Task 保持 IN_PROGRESS，pause 不产生 Task completion event 或最终 Timer reward。
3. resume 在同一个 Session 下创建新的 OPEN Segment。
4. Task detail GET 已返回每一个 CLOSED Segment；ActualTime 也直接读取 CLOSED Segment，不等待 Session FINISHED。

缺口出现在 Task detail 的展示：`TaskDetailPage` 用 `session:<timerSessionId>` 把所有 ActualTime entries 放进一个 Map。不同 Segment 因为属于同一个 Session，也被合并成一行。随后该行展示 `sessionStartedAt/sessionEndedAt`，而不是 Segment 起止时间。

结果是：暂停前已经结束的两段工作消失成一个 Session envelope；PAUSED 时 `sessionEndedAt` 为空，历史行显示“未知结束”。FINISHED 后 envelope 横跨暂停间隔，也不能表达每段工作。正确累计时长仍来自 Segment，不能把 envelope 的跨度解释为实际投入。

证据：

- `apps/api/src/work-session.ts:94`：close segment + projection。
- `apps/api/src/work-session.ts:195`：pause。
- `apps/api/src/work-session.ts:212`：resume 新 Segment。
- `apps/api/src/routes/tasks.ts:100`：查询所有 CLOSED Segments。
- `apps/api/src/routes/tasks.ts:104`：每个 Segment 转 business-date slices。
- `apps/api/src/execution-read-model.ts:79`：ActualTime 读取 CLOSED Segments。
- `apps/web/src/features/tasks/integration.tsx:99`：按 Session ID 折叠历史。
- `apps/web/src/features/tasks/integration.tsx:116`：使用 Session 起止时间展示历史。

“查看已完成任务”和 Today 的“已完成”区目前明确筛选 `Task.status === DONE`。它们是 Task lifecycle surface，不能为了显示 pause 记录而让暂停完成 Task。应在执行历史中呈现已经结束的工作段。

## MINIMAL FIX PLAN / OWNERS

| 修复点 | Owner | 最小改变 |
| --- | --- | --- |
| 完成无关 Task 被阻塞 | API Task completion | 保留 receipt 和 slot 序列化；检查占槽 Session 是否关联目标 Task；无关 Task 可完成，同 Task 使用显式 Timer workflow |
| Manual Actual + complete 的同类 guard | API Manual Actual | 与 Task completion 采用一致的目标关系规则；保留自身事务、interval validation 和版本校验 |
| 同 Task 完成入口不一致 | Web Tasks / Timer；AppShell 只组合 | 复用 Timer 的显式 complete-and-finish 公共能力，保持 Task completion draft 与 Timer mutation ownership |
| 暂停段在历史中消失 | Web Tasks detail | Session 可作为父组；按 `sourceId` 展示不同 CLOSED Segments 的起止/实际时长，Session note 只在父组展示一次 |

不要全局修改 `requireEmptySlot`：start 的单 active-session 限制仍有效，reopen/archive/remove 不是本次授权的语义调整对象。保留 receipt → slot → Task → Session/Segment 的锁序；对槽/Session 不一致维持 repair-required conflict，不能“自动修复”。

不需要新 Episode 表、Segment note 列、Timer Session 每次 pause 拆分、新的 ActualTime truth 或 global store。Episode 在这里可作为用户可理解的展示名称，对应现有 Segment。

同一个 Segment 跨午夜可以形成多个日期 slice，仍然是一个工作段。Task history 应按 Segment identity 保留工作段，按 Session identity 保留一次 canonical note；Timeline 继续使用日期 slice，Daily Summary 的 terminal-date note 规则保持原有契约。不能通过把同一 Session note 复制到每条 Segment 来补历史。

## REPRODUCTION / TESTS_RUN

没有使用生产或长期开发库。先探测仓库历史约定中的 3306、3307、3407、3408、33307，均 ECONNREFUSED；复用报告中已有的临时本机 MySQL 方式，启动 MySQL 8.0.25，在临时 datadir 下监听 127.0.0.1:33307。

专属 disposable DB：`workbench_closure02_audit_test`，满足 `_test` 安全后缀。fresh 按仓库测试约定依次执行 V1–V41，共 42 个 migration 文件。

复现步骤使用 Task A/B 测试 fixture 和真实 authenticated Hono API（`app.request`），执行命令调用真实 MySQL workflow；没有用 Web mock 替代数据库验证：

1. A start；A/B standalone complete 均 409。
2. A 13:20 → 13:47 pause（Asia/Shanghai）；产生一个 CLOSED Segment、一个 projection，GET detail 返回一段，Task IN_PROGRESS。
3. PAUSED 时 A/B standalone complete 仍 409。
4. A 14:05 resume → 14:31 pause；GET detail 返回两个不同 `sourceId`、相同 `timerSessionId`，累计 53 分钟。
5. PAUSED Session 经公开 finish API + `completeTask: true` 成功；Task DONE、一个 completion event、slot 清空。

| 验证 | 结果 | 含义 |
| --- | --- | --- |
| Fresh V1–V41 migrations | PASS，42 files | 隔离环境具备当前 schema |
| 定向真实 MySQL / API 复现 | REPRODUCED | 证实当前错误行为，并确认已有原子完成路径 |
| `npm run test:r1a -w apps/api` | PASS，6/6 | 现有 fresh/legacy-upgrade/约束与时区 suite |
| `npm run test:r1b -w apps/api` | PASS，22/22 | receipt、slot、pause/resume、原子完成、回滚等既有不变量 |
| focused Tasks / Timer / AppShell Web suites | PASS，52/52 | 既有界面回归 |
| 临时 RTL characterization | REPRODUCED，1/1 | 输入两条 CLOSED Segment，真实 TaskDetailPage 只渲染一条且显示“未知结束” |
| Architecture checker (`app/architecture.test.ts`) | PASS，3/3 | 既有依赖边界检查 |
| `git diff --check` | PASS | 本次仅报告文件，无 whitespace 错误 |
| full Web / lint / production build / browser acceptance | NOT_RUN | 本次为定向审计，没有修改产品代码；不得视为修复验收 |

临时 characterization test 仅用于观察当前错误，执行后删除；不要把错误现状写成需要永久保持的 regression contract。临时 DB 已删除，MySQL 已关闭，临时 datadir 已清理。

## REGRESSION GAPS / IMPLEMENTATION ACCEPTANCE

现有 green suite 并不能证明这两个用户场景正确：它验证 Segment 数量与累计时间，Web note 测试验证同 Session note 一次，却没有验证同 Session 多个 Segment 必须逐段可见。

下一刀应补这些永久 regression cases：

- A RUNNING / PAUSED 时完成无关 B 成功；A Session、slot、Segment 均不被修改。
- 同 Task 的 Today row、Bounty menu、Task detail 都呈现并执行显式 combined completion；不能走两次独立提交。
- 同 Task 的直接 API 请求维持明确 conflict，错误指出应使用 combined finish；stale version、重复 operation、rollback 与并发 start/complete 均受保护。
- 两次 pause/resume：同 Session 的两个 CLOSED Segments 逐段可见，暂停间隔不计时，Task 仍未完成；当前 OPEN Segment 与已闭合历史区分。
- 同 Segment 跨午夜与多 Segment 跨午夜都不丢工作段；Session note 仍一次、Task completionNote 仍独立。
- Manual Actual + complete 的无关 active-task 场景通过真实 DB 验证，避免修好一个入口留下同类 guard。

## ARCHITECTURE CONFORMANCE / REMAINING_BLOCKERS

本次只新增审计报告；没有改 schema、API、状态 owner、projection/date semantics 或生产 UI。`docs/ARCHITECTURE.md` 的当前 execution 模型与后端实现一致。问题是目标关系 guard 过宽，以及历史展示把 Session 分组误用为 Segment 折叠。

REMAINING_BLOCKERS：NONE（审计）。产品修复尚未实施，不能报告 PASS closure。上述计划保留既有所有权；实施时如明确 Task completion 的目标范围契约，应在同一变更补充架构文档。
