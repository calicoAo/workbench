# PRODUCT-CLOSURE-02 / GROWTH-INSIGHTS-G1

## RESULT

**PASS — GROWTH-CATEGORY-READ-CONTRACT COMPLETE。** 2026-10-12。

仅实施批准的 G1：扩展现有 Growth overview 的分类统计读契约，并修正 Growth 报表时区分桶。不实现 G2 详情 endpoint/下钻、G3 视觉对齐或 G4 映射 UI 所有权调整。无 schema、migration 或写命令变化；既有 Bounty、Timer、Finance、Daily Entry、Execution Date Attribution 切片保持关闭。

基线 HEAD `ef8eb8796b6093c43bc37c7c2ddc08b3d0d44a87`，验收对象为含已完成闭环改动的当前工作区。开始时记录 118 个已有 dirty/untracked 文件；115 个 hash 保持，三个重叠文件仅做本轮增量（Task completion public read、Growth Web DTO、架构文档）。其他本轮变更是先前干净的 Growth API、Growth Web tests、OpenAPI，以及新 Growth-private aggregation / current-head integration test 和报告证据。

## BEFORE READ MODEL

原 overview 有维度/未映射分钟、完成次数、趋势、Rewards Hero 和最多八条近期完成；缺少分类统计与精确秒数、去重 Segment 数。历史贡献已按 occurrence Category identity + 当前映射解释，但 Web 无契约说明哪些分类贡献了多少。

ActualTime 已按 user timezone 的 UTC 查询窗口裁剪；原 Growth 累计完整结果，trend 却按每条原 recordTimezone 的 slice.businessDate 再过滤，用户变更时区后可出现总计 20m、趋势仅 5m。

## AFTER READ MODEL

- `growth.ts` 保留 public orchestration、现有配置/写能力及所有旧响应字段；新增 `categoryBreakdown` 和 exact metrics。
- Growth-private `growth-contributions.ts` 先形成 Category buckets，再 roll up 到 Dimension/unmapped/summary/trend；所有层使用同一 eligible ActualTime 与 CompletionEvent 集合，没有 Web 聚合或持久化统计副本。
- Tasks public `completionEventsForRange` 拥有原 CompletionEvent selection/user isolation；当前 Task metadata 只提供标题，不用当前 Category 或 DONE status 改写历史。
- Web 声明完整增量 DTO，只保留现有展示与加载/错误/空状态，没有分类列表或详情占位 UI。

相关实现：[Growth owner](../../apps/api/src/growth.ts)、[private aggregation](../../apps/api/src/growth-contributions.ts)、[Tasks public read](../../apps/api/src/task-completion.ts)、[Web DTO](../../apps/web/src/features/growth/index.tsx)。

## CANONICAL FACT SOURCES

| 来源 | 贡献与身份 |
| --- | --- |
| `actualTimeForRange` | 正时长 CLOSED Timer Segments + included Manual/Legacy Actual；排除 OPEN/VOIDED/deleted、TIMER display projections |
| Timer Segment | `sourceId` 稳定身份；发生时 Category ID；有效 interval，包含已暂停 Session 的闭合 work |
| CompletionEvent | immutable occurrence、businessDate、lifecycleVersion、发生时 Category ID；重开不删除历史 |
| TaskCategory | 当前 user-owned metadata、enabled 与 nullable dimensionKey；不是历史事实替代品 |
| GrowthDimension | 当前配置 key/name/color/order/enabled；Category 最多解析到一个 enabled Dimension |
| Rewards | Hero 累计 XP/level/coins 唯一来源 |
| Habit occurrence | 保留整体完成数/趋势；没有规范 Category 映射，因此不进入分类/维度 rollup |

`timer_sessions.note` 保持一 Session 一份；新 Overview 不返回 note，也不把 note、Session.durationMinutes cache 或 start→end wall-clock 当执行贡献。

## METRIC FORMULAS

| 字段 | 公式 |
| --- | --- |
| `actualSeconds` | eligible clipped intervals 秒数求和，按报表日分桶后累计，不先对 Segment 或 slice 取分钟 |
| `actualMinutes` | `floor(actualSeconds / 60)`，旧字段兼容 |
| `completionEventCount` | eligible immutable CompletionEvent 行数 |
| `completedTaskCount` | 上述 event count 的兼容 alias，保留现有语义 |
| `closedSegmentCount` | eligible positive-duration TIMER_SEGMENT 的 distinct `sourceId` Set 大小；Manual/Legacy 不贡献该计数 |
| `mappedActualSeconds` | 当前 enabled Dimension 下所有 Category 秒数之和 |
| Dimension share | Dimension seconds / mappedActualSeconds；分母零时 0 |
| `lastActivityDate` | Growth report 日期或 eligible completion 日期最大值，配置无活动为 null |

跨午夜 Segment 可分别计入两个 daily buckets，但 multi-day period 只算一个；不能将 daily distinct counts 相加得到期间 count。59s + 59s 精确总计 118s，分类各 floor=0m、总计 floor=1m，分钟不是对账依据。

## CATEGORY / DIMENSION RECONCILIATION

同一事实集、相同期间、同一当前 mapping 解释下：

```text
sum(Category actualSeconds) = summary.actualSeconds
sum(Dimension actualSeconds) + unmapped.actualSeconds = summary.actualSeconds
sum(mapped Categories in Dimension) = Dimension contribution
sum(trend actualSeconds) = summary.actualSeconds
sum(Category trend actualSeconds) = that Category actualSeconds
```

完成事件数同样可逐层/趋势对账。Segment counts 在 Category→Dimension/overall 及每个 trend bucket 内按 source ID 做集合并集；同一个 Segment 只有一个 occurrence Category。跨日期趋势 counts 不保证可加。

Habit 不属于分类/维度事实集，保留独立 `habitCompletedCount`。Hero progression 是当前累计 Rewards 值，与所选期间分开；不为兼容表面相等而分摊 Habit/XP。

## TIMEZONE AND PERIOD BUCKETING

保留 7/30/90 inclusive business-date period；default `to` 来自 user.timezone，explicit `to` 保留。Execution owner 的规范读取先按该查询时区裁剪 UTC window。

Growth 使用现有 `splitByBusinessDay`，只将已裁剪 interval 投影到查询时区的报表日期。现有 7 天 daily、30 天 5-day、90 天 10-day bucket granularity 不变；累计与趋势用同一 seconds。UTC timestamps、original recordTimezone/businessDate、source IDs、Execution slices/API 没有改写。

真实回归：Tokyo 10/06 23:55→10/07 00:15。用户 Tokyo、`to=10/06` 为 300s；改为 UTC 后相同 `to` 为 1200s，总计与最后趋势桶均 1200s。SQL 确认 source timestamps/businessDate/timezone/Category 原样。CompletionEvent 10/07 仍是 10/07，不因查询时区改变回移到 10/06。New York DST 25h day 从 UTC source slices 累计 90000s，仍只计一个 Segment。

这是 Growth read projection 的明确修正，没有扩展 Execution Date Attribution；CompletionEvent 与 Habit 继续按其已存日期筛选，不静默统一成 timestamp 再解释日期。

## UNMAPPED / DISABLED CATEGORY BEHAVIOR

`categoryBreakdown` 有稳定 `categoryRef`：`category:{id}` / `unassigned` / `unknown`。

- 包含当前 nondeleted Categories，包括 disabled、zero-activity；disabled Category 的历史继续参与已映射维度。
- metadata 缺失或已删除的历史 ID 保持 `categoryId`，availability=UNAVAILABLE，name/color/icon/enabled 为 null，reason=CATEGORY_UNAVAILABLE；不猜 snapshot 名称或用当前 Task Category 替换。
- 有 Category 无 mapping → NO_MAPPING；旧 key 缺失/disabled → DIMENSION_UNAVAILABLE/DIMENSION_DISABLED，保留 raw dimensionKey，resolvedDimensionKey=null，进入 unmapped。
- ActualTime null identity 由 canonical attributionStatus 区分 NONE 与 UNKNOWN，分别形成 unassigned/unknown。
- CompletionEvent null 没有 attributionStatus snapshot，归通用 unassigned，不能推断 legacy 是否曾分类；此限制写入 OpenAPI。
- Custom/rename 使用稳定 key；修改当前 mapping 重新解释历史 Dimension 分组，原 category IDs 不变。Dimension 停用原子解除映射行为保持。

## XP BOUNDARY

新 Category contract **没有 XP 总额或能力分**；不把秒数换成 XP。Hero 继续调用 `growthSummary`，SQL-backed tests 与 `/api/rewards` progression 对账。

现有近期奖励查询的 latest-50 preview 保持既有行为；OpenAPI/架构明确它不代表完整历史账本或分类 XP。没有更改奖励规则、账本、level、first-completion 幂等或 Timer grant。

## API CONTRACT

只增量扩展 **`GET /api/growth/overview`**，无新 route：

```text
summary/dimensions/unmapped/trend:
  actualSeconds, completionEventCount, closedSegmentCount
  原 actualMinutes/completedTaskCount 等字段继续存在
summary:
  mappedActualSeconds + 原 mappedActualMinutes
categoryBreakdown[]:
  stable Category identity / attribution
  current display metadata / availability / enabled
  dimensionKey / resolvedDimensionKey / unmappedReason
  exact metrics / lastActivityDate / compact trend[]
```

Overview 不展开 Tasks、Segments、Sessions 或 notes。分类每行只有 metadata、metric totals 和现有至多九个 period buckets；无按 Task 数增长的 payload。Public DTO 不暴露 SQL rows、Set、内部 accumulator。

已补 [OpenAPI](../openapi.yaml) response/schema 和 Growth Web 类型。所有旧字段与现有页面路径保留；G2 detail endpoint 尚未实施。

## REAL MYSQL TESTS

**19 Growth tests PASS，0 failed / 0 skipped；46 Task/Execution regression PASS，0 failed / 0 skipped。**

新增 current-head permanent suite [growth-category-read-contract.test.ts](../../apps/api/tests/growth-category-read-contract.test.ts) 12 tests，覆盖用户要求全部 16 场景；原 R2D1 7 tests（含 V31→V32 historical migration）保持。

| 场景 | 永久真实 DB evidence |
| --- | --- |
| 1–2、16 单/多分类、同维度、秒数 | 两个分类各 59s，维度/总计118s；事件仍用发生时分类，Task 当前分类变化不覆盖 |
| 3–4 未映射/未分类 | unmapped / NONE / UNKNOWN / missing identity 均保留并对账 |
| 5–7 custom/rename/disabled/mapping history | stable custom key、改名、停用分类贡献；mapping变更历史重解释；occurrence SQL 未变 |
| 8 完成事件 vs DONE | 通过 authenticated complete→reopen→complete→reopen，2 events、0 DONE、0 time/Segment，Rewards保持 |
| 9 两 Segment / pause | 同 Session 两有效区间，忽略暂停间隙，PAUSED 已闭合工作仍参与，Segment 分类各自保留 |
| 10–11 午夜 single/multi | 单 Segment 5m+15m但期间count=1；两个 midnight Segments 时长2400s、期间count=2，daily counts合计4 |
| 12–13 period与trend | 首尾 clipped slices、期间外events/time排除；7/30/90与各分类/维度秒数对账 |
| 14 timezone | Tokyo→UTC source SQL unchanged + totals/trend reconcile；DST 25h真实秒数 |
| 15 user isolation | 外用户Category/Task/events/Segments不混入；各用户canonical GET分别正确 |
| eligibility / notes | Manual/Legacy各计一次且不计Segment，排除TIMER/OPEN/VOIDED/deleted；Session note仍只有原行，Overview无note payload |

环境使用仓库 established native MySQL 8.0.25 temporary datadir，仅 loopback 33307。先探测 3306/3307/3407/3408/33307，均关闭；初始化临时实例；G1/Execution disposable `_test` schemas 全量应用 **42 migrations through V41**。首次测试 fixture 的 OPEN endedAt / TIMER projection identity 不完整触发原 CHECK constraints，修正 fixtures 后 focused19全部重跑通过；没有修改 guard/migration/生产 invariant。

命令（`apps/api`）：

```sh
TZ=UTC ../../node_modules/.bin/tsc -p tsconfig.test.json --noEmit
TEST_DATABASE_URL=mysql://root@127.0.0.1:33307/workbench_growth_g1_regression_test \
  TZ=UTC ../../node_modules/.bin/tsx --test --test-concurrency=1 \
  tests/growth-category-read-contract.test.ts tests/r2d1-growth.test.ts
TEST_DATABASE_URL=mysql://root@127.0.0.1:33307/workbench_growth_g1_regression_test \
  TZ=UTC ../../node_modules/.bin/tsx --test --test-concurrency=1 \
  tests/r1b-transaction-workflows.test.ts tests/r1d-execution-vertical.test.ts
```

[Growth execution log](./WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G1-focused-api.log)、[Execution regression log](./WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G1-execution-regression.log)、[verification/cleanup JSON](./WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G1-evidence.json)。

## WEB TESTS

- Focused Growth：**7 PASS**，含 typed additive response、query保存Category metrics、保留旧UI而不提前出现全部分类、loading/error、typed zero-empty fixtures。
- Full Web：**35 files / 330 PASS**。最后仅完善 zero fixture 的类型与字段，focused7与Web typecheck再次通过；没有之后的UI/生产逻辑修改。
- API/Web typecheck、API test-source typecheck、lint/i18n：**PASS**；missing/untranslated/visible Chinese 均0。
- API/Web production build：**PASS**。仅既有 npm config / experimental type stripping 非失败提示。
- Architecture checker：**0 errors / 0 warnings**（defaults-only，非新增repository boundary rules）；OpenAPI YAML用Ruby stdlib解析：**PASS**；git diff whitespace checks：**PASS**。

```sh
npm run test -w apps/web -- src/features/growth/index.test.tsx
npm run test -w apps/web
npm run typecheck
npm run lint
npm run build
node /Users/lijingru/.codex/skills/engineering-architecture/scripts/architecture-check.mjs --root .
git diff --check
```

无新视觉交互，本轮没有 browser screenshot acceptance；不以Web mock替代数据库统计验证。

## ARCHITECTURE CONFORMANCE

Growth owner保持statistics/read projection；新的私有文件拥有实际聚合职责，没有generic analytics layer。Tasks拥有窄CompletionEvent public read，Task commands/status/slot invariants unchanged。Execution public read、Category mutations/current mapping字段、Rewards truth保持。

Web只新增契约，无React统计副本、Global store或新endpoint。AppShell、Bounty quick managers、Timer、Finance、Daily Entry未修改。Session Note仍是single Session-owned fact。已在 [ARCHITECTURE](../ARCHITECTURE.md) 更新耐久读所有权、时间eligibility/报表日期、精确秒数及non-additive Segment semantics；没有提前修改G4 mapping交互边界。

## REMAINING BLOCKERS

**NONE。** 所有required checks已完成；隔离测试schema已删除。停止MySQL前只剩四个system schemas；temporary server stopped、33307 closed、datadir removed，日志保留。没有production或long-lived development DB操作。

**G1 COMPLETE。** 停止在本刀；G2/G3/G4未启动。
