# PRODUCT-CLOSURE-02 / GROWTH-INSIGHTS-AND-UI-CLOSURE

## RESULT

**AUDIT COMPLETE — DESIGN READY FOR OWNER REVIEW。未实施生产改动。**

2026-10-12；核对对象是当前工作区，而非仅 HEAD。HEAD 为 `ef8eb8796b6093c43bc37c7c2ddc08b3d0d44a87`，含已完成切片的未提交变更。本次仅新增审计报告与审计证据，不修改代码、API、schema、架构契约或既有闭环。

结论：现有规范事实足够支持分类时长、完成事件及执行片段下钻；缺少 Growth-owned 分类读投影和贡献身份 DTO。无需先建历史统计表。视觉问题主要来自 Growth 保留的 pixel panel、渐变/双描边/硬阴影，以及不完整的图表与导航语义。推荐一次建立精确读口径，再接渐进下钻，最后做 Growth 范围的视觉对齐。

**需要显式确认的边界**：完成指标按事件而非去重 Task；维度映射继续解释历史；变更用户时区后的报表分桶修正；分类映射编辑回归 Categories 的公共交互所有权。下文给出一个推荐方案，不并列多个重设计。

本次实际执行：现有 Growth Web **5 tests PASS**；architecture checker **0 errors / 0 warnings**（defaults-only）；纯时间 helper 与取整例子已复现，见 [audit evidence](./WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-AUDIT-evidence.json)。这些证据不等价于 MySQL acceptance。本次未执行新统计契约的真实数据库测试、全量 Web、生产构建或新 UI 浏览器验收；这些属于批准后的实施计划，并非环境阻塞。

## CURRENT GROWTH DATA MODEL

### 存储事实与派生投影

| 事实/投影 | 当前 owner 与持久化 | Growth 如何使用 |
| --- | --- | --- |
| GrowthDimension | `growth_dimensions`；用户级稳定 key、名称、颜色、排序、enabled、version | 当前配置；六个初始维度，可新增自定义维度、改名和停用 |
| Category metadata / mapping | `task_categories.dimension_key` 唯一 nullable 当前映射；分类有 enabled/deletedAt，无独立 archive 字段 | 由发生时 Category ID 查当前 metadata/mapping；非删除分类含 disabled |
| Task | 当前 title/category/status/completionSequence 等 | 当前身份与名称；不能用当前 category/status 重算历史贡献 |
| CompletionEvent | `task_completion_events`：taskId、发生时 categoryId、businessDate、recordTimezone、lifecycleVersion、source | 期间完成事件；Task 重开不删除旧事件 |
| Execution | `timer_segments`：CLOSED 区间、Session/Task ID、发生时 Category ID/status、UTC 时间、recordTimezone、标题快照 | `actualTimeForRange` 返回规范秒数与业务日切片 |
| Manual/Legacy Actual | schedules 中明确 eligible 的 ActualTime fact | 同一 ActualTime public read；排除 TIMER display projections |
| Session Note | `timer_sessions.note`，一 Session 一份 | 已有 ActualTime 引用含 sessionId/note/terminal metadata；Growth 不能另存或重复聚合 |
| Rewards | `reward_events` 幂等账本；`user_growth` XP/Coins 累计 | Hero 总进度复用 Rewards；维度没有持久化 XP/能力值 |
| Habit | completed occurrences / occurrenceDate | 只有整体完成数与趋势；无规范 Category/Dimension 映射 |
| Growth overview/trend | `growth.ts` 纯派生 | 没有 category statistics 表、period totals 或 radar score 存储 |

来源：[Growth API owner](../../apps/api/src/growth.ts:41)、[ActualTime contract](../../apps/api/src/execution-read-model.ts:28)、[Completion owner](../../apps/api/src/task-completion.ts:54)、[V32](../../db/migration/V32__add_growth_dimensions.sql)、[Rewards](../../apps/api/src/rewards.ts:85)。

规范追踪方向：

```text
配置 Dimension
  ← Category 当前 dimension_key
      ← Segment / Manual Actual / CompletionEvent 的 categoryIdAtOccurrence
          ← Task / Session 身份 + 真实执行或完成事实
              → Growth 只读期间投影
```

Task → Category 当前关联只决定后续事实。旧执行仍保留发生时 Category ID；修改该分类的 dimension_key 则会改变旧事实在 Growth 中的维度解释。两者不是同一层归属。

旧 `/insights` 的 Categories/Ability 区域并非新下钻的数据源：Dashboard `categoryTotals` 从所有非删除 Actual Schedule 的 start/end 累计，使用当前 schedule.categoryId，未复用 ActualTime 的 inclusion/projection 规则。Categories 的 targetMinutes/skill progress 也是另一展示语义。不能把这个旧 totalMinutes 接到 Growth 当规范分类统计。[dashboard.ts](../../apps/api/src/routes/dashboard.ts:123)、[legacy Ability](../../apps/web/src/features/categories/index.tsx:178)。旧入口保留，不在本轮迁移其计算或编辑流程。

## EXISTING METRIC FORMULAS

| 指标 | 真实公式/范围 | 产品解释与限制 |
| --- | --- | --- |
| 实际投入 | `floor(sum(ActualTime.durationSeconds)/60)` | CLOSED Segments + included Manual/Legacy；不是 Session wall-clock、计划时长或完成奖励 |
| 维度投入 | 发生时 Category ID 经当前 enabled dimension 分桶，秒数求和后 floor 分钟 | disabled/missing/unmapped dimension 进入 unmapped |
| 维度 share | 该维度秒数 / 全部映射秒数；分母零时 0 | 不含 unmapped；不是占全部时间，更不是能力评分 |
| completedTaskCount | 期间 CompletionEvent 行数 | 实为“任务完成次数”；同一 Task 重开再完成可计两次；不是 distinct Task 数 |
| 最近活动 | 执行 slice.businessDate 与完成 event.businessDate 的最大值 | 现 UI 写“最近投入”，但只有完成事件也能更新；宜改“最近活动” |
| Habit 完成 | completed occurrence 行数 | 独立整体指标，不能擅自分摊给 Category |
| 趋势 | 7 天按日；30 天每 5 天；90 天每 10 天分桶，各桶秒数 floor 分钟、事件数/occurrence 数 | 分桶分钟相加可能小于总分钟；没有分类趋势 DTO |
| XP / level | Rewards `xpForLevel(L)=50×L²`；逐级累计阈值决定 level；xpInLevel 扣除以前级阈值 | Hero 数据是当前累计值，并非所选期间 XP；不能拿期间分钟重算 |
| Task 完成奖励 | difficulty 1/2/3/4 → XP 10/20/40/70，Coins 3/6/12/20；pinned ×1.3 后四舍五入 | `task_done:userId:taskId` 幂等，重开完成不会再奖励；不按 lifecycle 次数乘 XP |
| Timer 奖励 | finish 时总有效分钟，`floor(minutes/25)×5 XP`、同数 Coins；不足 3 分钟无 grant | Rewards 只保存一次 Session 奖励，不按午夜切片/Segment 重发 |

来源：[aggregation](../../apps/api/src/growth.ts:87)、[trend](../../apps/api/src/growth.ts:127)、[Rewards formulas](../../apps/api/src/rewards.ts:18)、[finish](../../apps/api/src/work-session.ts:244)。Legacy `task_partial` 等奖励也有自己的规则；当前 vNext finish 不调用 partial grant，不应据函数存在就推断当前 Growth 有完整阶段 XP 分类统计。

### 三个精度/解释缺口

1. **取整**：两个 Category 各 59 秒，分别展示 floor 分钟均为 0，但维度 118 秒显示 1 分钟。未来 API 必须增加可对账的 `actualSeconds`；既有 minutes 字段保留。断言先比较秒数；显示采用统一时长格式及“少于 1 分钟”，不在 Web 发明尾差分配。
2. **近期 XP 非完整期间投影**：overview 仅加载用户最近 50 条 reward，再将其中 sourceType=task 按 taskId 关联 lifecycleVersion=1。老期间奖励可能因此查不到，现输出 0 不代表确定未奖励；recent 最多八条、也没有 taskId/categoryId/source reward identity，不适合作为下钻基础。[growth.ts](../../apps/api/src/growth.ts:84)、[recent](../../apps/api/src/growth.ts:155)。
3. **跨时区趋势差异**：ActualTime 先按当前 user.timezone 裁剪查询 UTC 窗口，再按每条 recordTimezone 切片；Growth 总计累加全部结果，trend 却再按 slice.businessDate 筛选。当前用户改为 UTC、旧 Tokyo 执行 10/06 23:55–10/07 00:15 时，结束日 10/06 的查询总计可含 20m，而趋势只含 5m。已用仓库 `splitByBusinessDay` 纯 helper 复现；尚未声称 real-DB 验收。[range](../../apps/api/src/execution-read-model.ts:69)、[trend filter](../../apps/api/src/growth.ts:134)。这是 Growth 消费/分桶问题，不能借机重开已关闭 Execution 日期归属切片。

## CATEGORY STATISTICS CAPABILITY

| 能力 | 可用事实 | 推荐支持 |
| --- | --- | --- |
| Category 实际时长 | ActualTime occurrence categoryId/status、durationSeconds | 直接派生，含手工/legacy，单独标明来源 |
| 完成计数 | CompletionEvent.categoryIdAtOccurrence | 保持事件口径，UI“完成次数”；API兼容既有 completedTaskCount |
| 已闭合执行片段 | TIMER_SEGMENT sourceId | 按 distinct Segment ID，限与本期有正时长交集；暂停关闭也计入，OPEN/VOIDED/deleted 不计 |
| Category 趋势 | 同一规范事实集合 + Growth 报表分桶 | 服务端派生；分类详情按需读取 |
| 贡献 Task | source taskId / event taskId | 按稳定 Task ID 分组；Task 的当前 Category 不改写历史组 |
| 实际 XP | Rewards 已授予事件 | 首轮不新增“Category 总 XP”。可显式核验 first-completion reward，但不代表全部分类 XP |
| 目标进度/能力评分 | 没有新规范 | 不把 targetMinutes 或分钟转换成新能力值 |

片段数不是 slice 数或 Session 数。跨午夜一个 Segment 两个 slices：时长 5m+15m=20m、Segment=1、Session=1。一个 Session 暂停再恢复有多个 Segments：各有效区间累加，暂停间隙不计；Segment 按 ID 去重，Note 按 Session ID。一 Session 若暂停期间修改 Task Category，恢复后的 Segment 可属于另一 Category，不能整 Session 强行归当前 Task 分类。[resume attribution](../../apps/api/src/work-session.ts:219)、[edit guard](../../apps/api/src/routes/tasks.ts:283)。

Segment distinct count、涉及 Task 数跨日是非可加指标：同一 Segment 横跨两天，每天可各有贡献，整个期间仍只计一次。不要从每日 count 相加得到期间 count。

## DIMENSION MAPPING / HISTORY SEMANTICS

**已建立且应保留：发生时 Category ID + 当前 Category→Dimension mapping。** 架构契约、OpenAPI、现 UI 文案及 real-DB 测试均明确该行为。[architecture](../ARCHITECTURE.md:79)、[OpenAPI](../openapi.yaml:136)、[existing test](../../apps/api/tests/r2d1-growth.test.ts:59)。

推荐固定展示文案：

> 按当前分类映射汇总。修改映射会重新归类历史投入与完成记录，不会修改原始执行事实。

处理规则：

- 无映射 Category：保留在全分类列表；维度视图进入未映射。
- 自定义/改名维度：稳定 key 关联，显示配置名称，按 sortOrder；不按名称或固定枚举推断。
- 停用维度：现 command 原子将相关分类 mapping 清空。重新启用不会恢复旧映射；配置页显示状态，历史仍可从分类找回。
- 停用 Category：现 configuration 含其 metadata，历史仍参与统计；展示“已停用”，不让新的统计筛选只使用 enabled options。
- “归档 Category”：当前没有这种独立状态，不能设计虚构的 archivedAt。
- 已删除/metadata 缺失：现实现硬删 Category，并清空 Task/Schedule/Session 当前 categoryId；occurrence IDs 保留。旧 Growth 会将无法解析的 ID 汇总至 unmapped。新全分类统计应保留该历史 ID 的“分类已不可用 #ID”行，不能猜测名称或并入另一个同名分类。
- Task 无 Category：保留未分类项。ActualTime 能用 attributionStatus 区分 NONE/UNKNOWN；CompletionEvent 的 null 无对应 status，不能保证区分“原本未分类”和“旧数据未保留分类”。界面说明该限制。
- V32 给旧 CompletionEvent 回填当时 Task.categoryId：这不是完整的发生时 mapping 历史。不能据此倒推出旧维度快照。

**不建议新增 mapping history 表。** 本轮不需要“当时维度”报表；没有数据支持可靠回填。若日后产品改变历史语义，应另立迁移与明确 cutover，不作为 UI 修复混入。

### 写入所有权漂移

任务要求 Categories 拥有 Category mapping mutation；当前 Growth MappingManager 自行 PUT `/growth/category-mappings/:id`，且架构记录了 Growth capability 写同一个字段的既有路径。Category editor 则已能经 Categories-owned PUT 写相同字段。它们没有两个数据库真值，但存在两个交互 owner，须在批准设计时明确。

推荐保留 Growth 配置入口的映射能力，由 Categories 公共映射交互持有 mutation/draft/pending/失败恢复；沿用既有 Category PUT，不新增写 endpoint。旧 Growth mapping API 保留兼容，不在本轮重写/删除。维度停用的原子解除映射保留 Growth command，属于已有跨表 invariant。

避免新 runtime cycle：Categories editor 已依赖 Growth public dimension select，Growth 不再反向导入 Categories。AppShell 只通过 public imports 注入 Categories-owned mapping surface 给 Growth 配置区；不把 draft/handlers 放入 AppShell。此边界须在实施时同步更新架构，不能悄悄把当前文档当不存在。

## MISSING READ CONTRACTS

**已有**：overview 只有维度/未映射 summary、趋势及八个近期完成；dimensions 返回 configuration，无分类贡献指标。Task detail 可展示历史执行，但不是期间/分类贡献查询，不能批量抓所有 Task detail 在 Web 汇总。

推荐最小只读扩展：

1. **增量扩展 `GET /api/growth/overview?period=7|30|90&to=...`**：保留全部已有字段；增加 summary/dimension/unmapped/trend 的 exact seconds，以及完整 `categoryBreakdown`。
   - categoryRef（稳定 ID 或明确 none/unknown bucket）、name、color、enabled/availability；当前 dimensionKey、resolvedDimensionKey/unmappedReason。
   - actualSeconds、completionEventCount、closedSegmentCount、lastActivityDate；必要的 source availability/status。
   - 同一 Growth 聚合中先形成 Category buckets，再卷入 Dimension/unmapped，保证同一事实集、相同 mapping 解释；禁止 Web 再算统计。
2. **新增按需 Category detail GET**（建议 `/api/growth/categories/:categoryRef?period=...&to=...&cursor=...&limit=...`）：该分类期间 summary/trend、服务端 Task 贡献组及有界分页。无 Task 的 Manual Actual 是明确独立组。
   - Task/group 稳定身份、历史贡献与当前可访问状态；completionEventId/lifecycleVersion/businessDate；execution source/sourceId、taskId、timerSessionId、切片 bounds/duration/recordTimezone/occurrence category。
   - Session context 独立按 ID 关联，完整 note 只出现于 Session detail；分页应按完整贡献组，不切断同一组再重复算指标。大量执行的 Task 组按需加载/分页，不能让一个重任务突破响应上限。
   - summary/trend 针对全期间，明确与当前页区分；cursor 用户/筛选范围隔离，401/404 按现有惯例。
   - 不新增 dimension detail API：维度总计与分类明细已在 overview。展开仅选择服务器提供的 rows，不做第二统计计算。

服务端可在 Growth 私有 `growth-contributions.ts` 中复用一次事实加载/聚合，供 overview 和 detail；Execution interval 真值继续调用 `actualTimeForRange`。Completion facts 如需多个消费者复用，优先在 Tasks owner 提供窄只读 capability，避免将现有 Growth 直接读表例外扩散到更多 feature。不是通用 analytics/repository 框架。

### 期间/时区建议

保留现有 7/30/90、AppShell canonical `date`→`to` 和 CompletionEvent 固定 businessDate 过滤，不提供新的浏览器本地日期或 timezone picker。Hero XP 继续是当前累计值，明确标注。

对旧 recordTimezone ≠ 当前查询 timezone 的边界，推荐在 **Growth 报表投影内**为裁剪后的 ActualTime 区间生成 query-timezone 的 `reportBusinessDate`，用已有服务器 time helper 分桶；source businessDate/recordTimezone 保留供 detail。总时长与原查询窗口不变，趋势完整覆盖总计。CompletionEvent 继续按存储业务日计次，不擅自改写其历史日期。此修正会改变混合时区的旧 trend 展示，须由 owner 明确批准并用 MySQL 场景验收；不改 Execution read API/schema/归属。

## RECOMMENDED GROWTH PAGE IA

```text
成长                                  [7天] [30天] [90天]
统计范围 · 查询时区
[总览] [全部分类] [配置]

总览
  当前等级 / XP / Coins（紧凑；累计）
  本期实际投入 · 任务完成次数 · Habit完成
  维度投入图（初始六维，尊重启用/自定义配置）
  维度列表 → 展开对应 Category 贡献
  投入趋势
  未映射摘要 → 全分类筛选
  最近完成（有身份链接）

全部分类
  搜索 / 含停用与不可用 / 排序
  分类 · 当前维度/未映射 · 时长 · 完成次数 · 片段数
  无分类/未知归属项（有事实时显示）
  → 分类详情：趋势 → 贡献 Task → 按需执行/完成详情

配置
  现有维度创建/改名/排序/启停
  Categories-owned 分类映射交互
```

默认总览不铺所有 Task。分类行零时长但有完成事件仍可见；无记录分类可通过“显示无活动分类”找到。Habit-only、少于一分钟投入也不能被误判全空（现 hasGrowth 只看 floor minutes/completedTaskCount，会隐藏部分真实摘要）。

配置仍保留原有功能；原 #dimensions/#mapping 入口兼容映射至配置对应分区。新的详情/筛选使用现有 router search params（如 `view=categories&category=12&period=30&date=...`），稳定 key，不用名字或数组下标。`date` 仍由 AppShell 所有；Growth 只拥有 feature 内 period/view/category disclosure。浏览器 Back/Forward 必须恢复这些 URL 状态，替换目前仅 mount 读取 hash、原生 replaceState 与本地 view 两套状态的行为。

## DIMENSION → CATEGORY → TASK DRILLDOWN

1. 总览维度行显示该维度统计，展开同一响应的 Category contributions。
2. 点击分类进入该日期/期间的分类详情；“返回”保留 period/date/维度来源。
3. Task 贡献行同时显示本期时长、完成次数；完成无 Timer 的 Task 显示 0 实际时长及真实完成事件，不造执行块。
4. 展开 Task 后显示 CLOSED Segment / Manual / Legacy 来源与完成事件，点击身份可到既有 Task detail；不可用 Task 保留历史贡献摘要，禁止死链接。
5. execution detail 按 Session ID 给 Session note，按 sourceId 给独立有效区间；跨午夜只累计片段秒数，不累计 Session.durationMinutes，不将 full Session 时长灌进每个 Category。
6. Note 不出现在分类/维度汇总列表。需要内联预览时沿用 terminal-slice 语义；任意来源切片可查看同一 Session context。多分类 Session 只说明属于同一次执行，不把一条 Note 拆成多个分类事实。

保留 Tasks 公共页及已关闭的 TaskExecutionHistory 行为；新 Growth 贡献明细拥有“本期/分类过滤”的展示契约，不深导入 Tasks 私有 integration/history 来拼统计。

## VISUAL INCONSISTENCY AUDIT

| 位置与来源 | 分类 | 具体问题 |
| --- | --- | --- |
| shared Button/IconButton/Badge/FilterChip、.field、semantic tokens | 可复用 primitive | 已存在；无 shared Card/Tab React primitive，不应假装有现成组件或借机建通用库 |
| pixel-surface、pixel-xp-track | legacy hard-coded visual style | 2px 描边、位移硬阴影、XP 黑框，与 Snow Soda 的柔和 border/focus 不同 |
| growth-hero-card/portrait | Growth-specific 区域 + legacy decoration | 大头像、16px 网格、mint→lavender 渐变占主要高度；手机信息密度偏低 |
| growth panel/summary/dimension cards | 重复 local styling | 白色 alpha border/card/shadow-glass 多处独立定义；维度 card 全边框上色和 hover 位移较重 |
| trend panel | 重复 local styling | 另一个 CSS 区域硬编码 8px radius、#8991A6/#3A7F79 与不同 shadow，未用已建立 tokens |
| period/subnav/管理 arrows | 重复 local controls | 手写按钮/active style，arrows 非共享 IconButton；颜色、可访问状态与 hit area 不一致 |
| 图表数据颜色 | 正当 Growth/domain visualization | 必须保留配置色；不能统一涂成 mint 或把 Category 色当装饰 token |
| Radar | 正当可视化但几何语义有缺陷 | 仅非零维度构成 axes，底图固定四边形，半径人为加 20；默认六维也不稳定，无完整轴标签 |
| Bars + donut + radar | 重复信息 | 多次表达同一投入 share，增加滚动高度；不是三套不同能力指标 |
| 文案与国际化 | 局部呈现缺口 | 默认 API 名称“事业/学习”等与前端默认识别“事业力/学习力”等不一致；donut legend 直接 item.name；“最近投入/完成任务”标签不精确 |

来源：[Growth markup](../../apps/web/src/features/growth/index.tsx:41)、[radar](../../apps/web/src/features/growth/index.tsx:55)、[base styles](../../apps/web/src/styles.css:59)、[trend styles](../../apps/web/src/styles.css:2753)、[Snow Soda layer](../../apps/web/src/styles.css:3039)、[primitives](../../apps/web/src/shared/ui/index.tsx)。

比较对象：当前 Today/Hero HUD、Wallet panel/commands、Task detail、AppShell semantic surface。它们也存在局部 legacy 样式；不声称全站已经无迁移债。查阅了仓库 Growth 1440/375 历史截图与较新的 Wallet 截图，用于印证视觉来源；这些不是本次当前 HEAD 的 fresh browser acceptance，手机导航等旧截图细节不得当当前事实。

## RECOMMENDED UI ALIGNMENT

- Growth 局部容器使用现有 `--surface-card`、`--border-soft`、`--text-*`、`--accent-*`、共享圆角/阴影约定；不改全局 tokens 或其他 feature CSS。
- Hero 改为紧凑累计进度区，保留现有 asset slot/fallback 能力和等级/XP/Coins；去掉该页面的粗像素框、网格底与装饰阴影。没有新增插画或全站 Pixel contract 迁移。
- 保留一个主要维度雷达 + 可展开贡献列表 + 总趋势，去除同屏冗余 donut/第二套 bars。雷达仅表达投入占比；默认六个轴，实际采用所有 enabled dimensions 的稳定 sortOrder，包含零值，自定义维度可增轴，少于三维用列表表达。轴/网格同 N、零归中心，不加虚假基础半径；有可读文本替代。
- 分类色只做小色点/标记，维度配置色仅用于图；停用状态使用 Badge，未映射保持中性提示。
- 操作用 Button/IconButton，period 用 FilterChip，feature tabs 复用既有 segmented/nav CSS pattern 与语义，不新增泛用 tabs/cards 框架。
- 统一 Growth 内字号与间距，body/metadata 不继续堆 9px；桌面最多双列，375px 单列，详情不横铺大表；移动交互 44px，注意底导航、MiniTimer、FAB、safe area。
- 维度名称通过同一 configured-name 规则呈现，原始用户改名不被翻译成系统文案。保留 mapping-history 说明；明确“当前累计进度”与“本期贡献”。

## API / SCHEMA IMPACT

**建议 API 只读扩展，schema impact = NONE。** 当前任务没有实施这些扩展。

保留现有 overview/config/维度写/Category 写与旧 mapping endpoint；增量增加 exact seconds/category rollup，以及按需 contribution detail。API 文档需说明完成事件、distinct Segment、映射与查询时区投影；Web DTO 与 query key 同步。

不添加 Category/Dimension XP balance、analytics 表、mapping history、note 列或统计快照。不改历史 migration，不把 Growth query 引入 Dashboard truth，不引入任意范围/时区选择器或 AI insight 生成能力。

若首轮决定显示已确认 completion XP，只能经 Rewards 的 owner-approved 精确 ledger read，按用户/明确 eventKey 关联 first lifecycle，缺失返回 unavailable 而非伪造 0。Timer reward 可能跨多个 Category/Segment，没有批准分配规则，因此不生成 Category 总 XP。Hero 现有累计 XP 和近期完成能力保留，近期关联的 50-row 限制在相同 read slice 内修正。

## IMPLEMENTATION SLICES

### G1 — GROWTH-CATEGORY-READ-CONTRACT

- **当前 owner → 目标 owner**：Growth aggregate → 同一 Growth 的 category-first 精确读投影；Execution/Tasks/Rewards 不变。
- **文件**：`apps/api/src/growth.ts`、`routes/growth.ts`；按聚合职责增加私有 contribution read 文件；必要的窄 Tasks/Rewards public read；`docs/openapi.yaml`、`docs/ARCHITECTURE.md`、API tests。
- **导航**：无。
- **API/schema**：overview 增量字段 + detail GET；无表/列。
- **测试**：真实 MySQL 分类/维度/未映射对账、事件数、Segment 去重、映射变更、时区边界、用户隔离、分页、ledger 精确关联；既有 R2D1/R1A/R1B 相关回归。
- **风险**：rounding、mixed timezone、legacy null 分类、过量响应、旧 DTO 兼容。
- **验收**：服务器 exact seconds 可逐层对账；sum Category→Dimension/unmapped 与 overview 同口径；不靠 Web 计算，不把缺失 ledger 当 0；旧 overview 字段保持可用。

### G2 — GROWTH-CATEGORY-DRILLDOWN

- **当前 owner → 目标 owner**：Growth root 内总览/配置 → Growth 内私有 overview/disclosure、category detail、dimension configuration owners；查询和详情状态随对应 owner。
- **文件**：`features/growth/index.tsx`、新私有 category-insights/detail workflow、DTO/query 文件（仅需要时）；`app/query.ts`、i18n、Growth tests；AppShell 仅保持路由注入。
- **导航**：Growth URL-backed view/category/period；兼容 #dimensions/#mapping，保留 canonical date 与浏览器历史。
- **API/schema**：消费 G1，无新写契约。
- **测试**：维度展开→分类→贡献→Task link；无分类/disabled/custom；date/period 改变查询；failure/retry/user switch；note Session identity 与分页去重；零时间完成、Habit-only/subminute 状态。
- **风险**：错误复用旧 Dashboard totals、错误 Session.duration 总计、列表/详情旧 cache 混用、hash/query 双状态。
- **验收**：主视图不展开所有 Tasks；任一汇总能找到对应规范事实和身份；返回保留筛选，不复制统计状态。

### G3 — GROWTH-LOCAL-UI-ALIGNMENT

- **当前 owner → 目标 owner**：Growth legacy style/chart → Growth 局部语义样式与稳定投入可视化。
- **文件**：Growth presentation/chart 私有组件、`styles.css` 中 Growth scoped selectors、i18n、Web/browser tests。保留 shared primitives 与 PixelAsset owner。
- **导航/API/schema**：无新增语义契约；保留 G2 入口。
- **测试**：雷达 0/1/2/6/N 维、零轴/改名/颜色、可访问替代、1440/375 真 CSS viewport；底部固定 UI、安全区、keyboard/overflow；比较 Today/Wallet/Task 相同 primitives。
- **风险**：删重复图误删数据、移动间距/字体、影响 TodayGrowthEntry/PixelAsset；CSS 必须限 Growth，不全局改 pixel-surface。
- **验收**：无伪能力评分、无装饰新增；信息完整且减少重复；desktop/mobile 均可读可操作。

### G4 — GROWTH-MAPPING-OWNER-ALIGNMENT

- **当前 owner → 目标 owner**：Growth 私有 MappingManager 写 Category → Categories 公共 mapping interaction，经 composition 注入；Growth 继续拥有维度配置和停用原子 invariant。
- **文件**：Categories 新窄 public surface/既有 queries 生命周期接入、Growth 配置组合、AppShell public capability injection、architecture/i18n/tests；不改已关闭 Bounty quick-manager/editor 行为。
- **导航**：Growth 配置映射仍可用；Settings 分类入口保留同一字段/owner。
- **API/schema**：复用 Category PUT；旧 Growth mapping API 兼容保留，无新写 endpoint/表。
- **测试**：映射 mutation payload、pending/失败、用户隔离、同用户 overview/category/detail 精确失效；原 Category/Bounty/Settings/Growth 5-test 与后续新增测试回归。
- **风险**：Categories→Growth 已有依赖造成反向 cycle、遗漏新 detail cache、误动现有停用语义。
- **验收**：Growth 不直接实现 Category mapping mutation；AppShell 只注入 surface；Categories/editor 不回归；新 read queries 在 Category mapping/Task/Timer 改变后保持用户范围一致。

顺序 G1→G2→G3→G4；每刀独立验收。G4 是针对本次显式所有权要求的窄治理切片，不把既有 Category CRUD/Bounty 闭环作为重做理由。实施时不能只按文件行数拆 Growth：overview 读取/下钻、维度编辑、Category mapping 是不同状态生命周期；避免把新详情/编辑/图表全继续塞入当前根组件。

## TEST PLAN

### Real MySQL（实施验收必需）

使用 fresh disposable `_test` database、当前 42 migrations/V41；复用仓库 native MySQL/Docker QA 方式与现有 safety guard。`r2d1-growth.test.ts` 当前只 migrate through V32，不能单独代表当前 schema 下新增能力；保留其 V31→V32 历史迁移测试，并新增当前 head fixture suite。

| 场景 | 必须核对 |
| --- | --- |
| 两分类同维度，含 59s/59s | 分类秒数和=维度；所有分类和=总计；展示取整不当精确对账 |
| unmapped/disabled/缺失 Category | 全分类保留；正确 unmapped reason；不猜当前 Task.category |
| custom/rename/disable/re-enable | key 稳定；名称变化；停用原子清映射、重启不自动恢复 |
| mapping A→B | 旧执行/完成统计重新归类；源 categoryId/时间/notes 不变 |
| Task 直接完成，无 Timer | completionEvent=1、actualSeconds=0、Segment=0；重开再完成 event=2、奖励不重复 |
| Session 多 Segment | 有效秒数相加，排除暂停空隙；片段数不同于 Session 数 |
| Tokyo 23:55→00:15 | 一 Segment 两切片、5m/15m、总20m、期间Segment=1、Note Session-owned |
| 暂停后改 Category 再恢复 | 每 Segment 用自己的 occurrence ID；一个 Note 不成为两份分类事实 |
| 用户时区变更 / DST | default to 来自用户；查询窗口/报表日期/source日期区分；summary/trend 秒数覆盖；completion 既有日期不改 |
| 7/30/90 inclusive boundaries | 开始/结束恰好边界、空期间、切片 clipped seconds、partial segments |
| 用户 A/B | 同名分类/维度不串数据；他人 detail/cursor 不可读 |
| Manual/Legacy/Projection | included manual/legacy 一次；TIMER Schedule 不重复；unknown provenance 不虚构 |
| XP precise read | 完成 reward 早于最近50仍可核验；first lifecycle only；missing unavailable；Session reward 不自动按分类拆分 |
| 分页/Task 不可用 | page 不改变总计；Task 删除后贡献仍保留可解释状态；notes 不按 slices 重复 |

需要实际 SQL/公共 API 检查，Web mocks 不替代。Fixtures 可直接写 canonical tables，最终聚合走 authenticated GET；至少一条 start/pause/resume/finish/complete 经公开命令验证实际 ledger/execution 组合。

### Web / routing / visual

- 基于真实 DTO 样例，断言 Category breakdown 与服务器 rollup 一致；不在组件实现第二聚合。
- 维度→分类→Task→execution 展开；独立全分类视图；零时长完成、未知/不可用身份；full note 按 Session ID。
- date A/B、period 7/30/90、deep link、Back/Forward、旧 hash、认证切换，query key 包含 user/filter。
- create/edit dimension 以及 Categories-owned mapping 的 pending、409、失败重试；保持 Bounty/Settings 现有行为。
- 1440×1000 与 375×812 fresh browser + isolated API/MySQL，设置并断言 CSS viewport；无水平溢出、44px controls、键盘焦点、底导航/MiniTimer/FAB/safe-bottom，不用缩放桌面截图。
- 原 Growth/Category/Tasks/AppShell/Feedback suites；全 Web；API/Web typecheck；lint/i18n；build；architecture checker；git diff --check。

本审计实际运行与未来验收分开：Growth Web 5 PASS、默认 checker PASS、纯 helper reproduction 已完成；未来新读契约 DB/browser scenarios **NOT_RUN（尚未实施）**。

## OWNER DECISIONS REQUIRED

建议批准以下明确口径，再开始 G1：

1. **保留当前映射解释历史**，不建 mapping history；采用明确说明文案。
2. **完成次数 = CompletionEvent count**；**已闭合片段 = 与期间相交的 distinct CLOSED Segment**。不偷偷改成 distinct Task / finished Session / 期间结束次数。
3. **批准 Growth-only reportBusinessDate 分桶修正**，保留原 ActualTime 窗口、source 日期和 CompletionEvent 固定业务日；用混合时区真实 DB 场景验证旧 trend 差异。
4. **首轮不发布 Category 总 XP/能力分**；Hero 累计 XP 保留，已确认完成奖励可经 Rewards 精确只读关联，未知不伪造 0。
5. **批准 Categories-owned mapping interaction 的窄对齐**，保留兼容 API 和维度停用原子行为，明确更新目前架构例外。

其余视觉/组件放置选择按上述单一方案执行，无需逐一新增审批。

## NEXT ACTION

**等待 owner 批准后，仅开始 G1 — GROWTH-CATEGORY-READ-CONTRACT。** 下一刀先把规范数据、秒数对账、身份与期间语义做实，再接 Web 下钻与局部视觉。当前停在审计与设计报告，没有实施代码。

等待依据是本次用户任务的明确限制：“Perform AUDIT + DESIGN ONLY”“WAIT FOR OWNER APPROVAL before implementation”；不是技能推导出的额外审批，也不是执行环境阻塞。
