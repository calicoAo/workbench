# 产品整改方案：2026-10-23

## RESULT

AUDIT_AND_DESIGN_COMPLETE。仅新增本报告，没有修改生产代码、API 或数据库，也没有重新开启此前已关闭的 PRODUCT-CLOSURE 切片。

本次工作包：用户最新提出的七项问题，以及上一项已确认的流水“最后录入的放最上面”。下列实现与验收均为后续计划，不代表已完成修复。工作区已有的奖励反馈改动属于此前工作，本报告保留它们。

依据 `docs/ARCHITECTURE.md`、engineering-architecture 和 ponytail 技能，优先复用现有事实、公开读取和领域命令。建议按下表串行交付，每片通过自己的闭环验收再进入下一片。

| 顺序 | 优先级 | 切片 | 完成标准 |
| --- | --- | --- | --- |
| 1 | P0 | TODAY-COMPLETED-VISIBILITY | 当日真实完成记录在刷新、重新接取、重新进入后仍可见 |
| 2 | P1 | WALLET-ENTRY-ORDER | 流水按录入顺序倒序，分页无遗漏/重复 |
| 3 | P1 | TASK-FOCUS-AND-DEADLINE-PIN | 星星统一表示今日重点；截止倒数使用独立固定入口 |
| 4 | P1 | FORM-FIELD-CONSISTENCY | 输入框与多行文本框使用一致的圆角矩形风格 |
| 5 | P2 | MONTH-ACTIVITY-CALENDAR | 月历每日格子展示真实事项，可进入对应日期/详情 |
| 6 | P2 | LIBRARY-METADATA-IMPORT | 来源解析、预览、确认、持久化、重入查看、重复处理形成闭环 |
| 7 | P3 | DEEPSEEK-TASK-DRAFTING | 文字生成任务草稿，经用户审核后走现有 Tasks 发布事务 |

P0 的风险是完成事实在界面消失；目前证据不表明完成事件或奖励数据被删除。外部数据源接入确认可在前五片期间提前进行。

## 1. TODAY-COMPLETED-VISIBILITY

### 当前事实与根因

- `apps/web/src/features/tasks/index.tsx` 先从 `dailyTaskIds` 筛选已接取任务，再用当前 `Task.status === DONE` 得出 `completedToday`。因此“已完成”实际上依赖当日仍被接取的任务集合，并非按完成日期读取。
- `apps/web/src/features/tasks/select-daily-tasks.tsx` 的可选池排除 DONE，重新打开接取面板时也会过滤这些 ID。
- `apps/api/src/task-assignments.ts` 的 `replaceAssignmentsForDate` 会将未提交的原有接取关系改为 RELEASED；再次保存接取列表后，已完成项可能因此退出 Today 的读取集合。
- `apps/api/src/routes/tasks.ts` 并没有一律过滤 DONE；单纯归因于“Tasks API 不返回完成任务”不成立。
- `apps/api/src/task-completion.ts` 已保存带 businessDate/lifecycle identity 的 CompletionEvent，并提供 `completionEventsForRange`。完成事实与当前接取状态、当前 Task 状态已有明确区分。

已确认的是上述代码路径。用户描述的“只刷新就消失”尚未用其真实数据复现；实施第一步须抓取完成前后 Tasks / task-days 的读取结果，核对具体路径，不能把推测当成现场复现。

### 最小修复与 ownership

Tasks 拥有按日期读取和展示完成事件的能力；Today 只组合其 public surface。复用 CompletionEvent，不新增“今日完成任务”表或客户端持久列表。

已完成区按完成事件的业务日期读取，不再以当前 ACCEPTED 集合或当前 Task.status 决定历史完成事实是否存在。重新打开任务不抹掉历史完成事件；同一任务不同生命周期的完成保留事件身份。当前任务操作与历史事件展示区分，避免用过时按钮操作历史快照。

接取列表的保存只改变接取意图，不承担隐藏历史完成事实的职责。完成、奖励和 Timer 的业务语义保持既有合同；停止计时不等于完成任务。

### 闭环与验收

完成任务 → 事件持久化 → 当日已完成区可见 → 硬刷新/离开返回仍可见。

增加精确回归：完成后刷新；完成后重新选择其他接取项再刷新；未接取任务的直接完成；日期切换；用户时区午夜；reopen 后历史日期仍可见；再次完成不混淆生命周期。执行真实 MySQL 完成事件与接取关系回归、Web Tasks/AppShell 测试和公开 UI 路径验收。

## 2. WALLET-ENTRY-ORDER

### 当前事实与根因

`apps/api/src/finance.ts` 的 `financeTransactionsForUser` 按 `occurredAt DESC, id DESC` 排序，分页条件却是 `id < cursor`。它不符合用户已经明确的“最后录入的放最上面”；而且发生时间与 ID 顺序不一致时，分页可能遗漏或重复。

### 最小修复与 ownership

Finance 统一按不可变的交易录入序号 `id DESC` 读取，并沿用同方向的 ID 游标。该语义适用于正常串行录入；不声称 ID 代表并发事务的精确提交时刻。编辑备注不改变排序；补录更早发生日期的记录也会排到当前筛选结果顶部。发生日期继续用于筛选、月报和账本归属，不改写发生时间。

不在 Web 对一页结果重新排序，不新增排序表、时间字段或 UI 配置。

### 闭环与验收

录入 → 当前筛选范围内立即出现顶部 → 刷新不变 → 下一页不重不漏。

真实 MySQL 覆盖：同一天不同发生时间、后录入更早日期、相同发生时间、多页边界、备注编辑、收入/支出/转账/退款与用户隔离。Web 验证新记录刷新与过滤条件提示。复用 Finance 现有集成套件，不更改账本和奖励规则。

## 3. TASK-FOCUS-AND-DEADLINE-PIN

### 当前事实与根因

- 接取面板的星星操作 Assignment 的 `focusRank`，每日最多三项。
- Adventure 列表的星星调用 `/api/tasks/:id/pinned`，操作跨日期的 `Task.pinned`。无截止日期时它甚至标注“重要标记”，容易被理解为今日重点。
- `apps/web/src/features/reminders/index.tsx` 已实现截止倒数：筛选 pinned、未完成/未归档、具有有效 dueAt 的 Tasks；因此无需再建倒计时数据模型。
- 倒数使用全部 Tasks，不要求该任务一定被接取到当天；当前可发现的固定入口却主要在每日列表，形成入口与能力不匹配。
- 另一个相关日期缺口：`apps/api/src/routes/tasks.ts` 发布路径已使用 recordTimezone，而部分旧创建/编辑路径的 `localDateTime` 仍附加固定 `+08:00`。此处是 Task deadline 的一致性问题，不重新审计已关闭的执行日期归属。

### 当前如何固定

设置任务截止日期/时间并保存，在 Adventure 任务列表点星星，其可访问名称为“固定到主页”；符合条件的任务就会进入主页截止倒数。没有截止时间、已完成或已归档的任务不会显示。

### 推荐交互

- 两处星星均表示“今日重点”，均操作相同的按日 Assignment 事实，保留最多三项规则。
- “固定截止倒数 / 取消固定”改为独立 Pin 图标或明确菜单动作，复用 Task.pinned。
- Task detail/任务池也提供固定入口，使未接取到今日的任务可以直接固定。
- 无截止日期时，引导先设置截止日期；不显示一个没有效果的固定成功状态。
- 修改截止时间后倒数更新；取消固定后移除；完成/归档后按既有规则退出。失败保留原值并允许重试。

### ownership、风险与验收

Tasks 拥有重点与固定写入；Reminders 只消费公开读取；AppShell 组合。不得新增第三个“重要”字段，或把两个事实互相同步。

重点写入若复用现有批量接取命令，必须先保证不因重建已选集合而释放其他关系；结合切片 1 验收。截止时间创建、编辑、格式化统一用户时区，使用既有日期转换能力。

验收：两处星星双向一致/最多三项；固定与重点互不影响；未接取任务固定；刷新持久化；修改/取消/完成；无截止时间；错误重试；Asia/Shanghai 与非 +08 时区；跨午夜与逾期。运行 Tasks/Reminders/AppShell Web 测试、相关真实 MySQL 持久化和日期回归。

## 4. FORM-FIELD-CONSISTENCY

### 当前事实与根因

`apps/web/src/styles.css` 的共享 `.field` 使用 `h-9 rounded-full`。Library 创建表单的 input、select、textarea 都使用 `.field`；多行文本框再加 min-height，便形成截图中的大胶囊。

这是共享字段样式的实际根因，允许在共享样式修复；不是给 Library 单独盖一层样式。

### 最小修复

统一既有文本输入/select/textarea 的边框、字体、内边距、focus/error/disabled 状态，采用固定 8–12px 圆角；单行控件高度一致，多行按内容区域高度展示。核对局部重复样式，避免共享修复被页面覆盖。

checkbox、radio、开关和图标按钮保留自身形态。Library 表单补齐字段 label/可访问名称，不能只靠 placeholder。复用已完成的 Modal header/body/footer 结构，不重新设计全站弹窗。

### 闭环与验收

打开 → 输入/切换/校验 → 提交失败仍保留草稿 → 成功保存 → 详情可读。

真实 375/1024/1440 CSS viewport 检查 Library、Wallet、Tasks、Writing 的代表表单，覆盖多行文本、焦点环、长中文、下拉选择、移动端键盘/固定底部 UI。共享样式影响广，执行完整 Web suite、typecheck、lint/i18n、build 与截图验收。

## 5. MONTH-ACTIVITY-CALENDAR

### 当前事实与根因

`apps/web/src/app/shell/index.tsx` 的 MonthCalendar 只消费 `{businessDate, actualMinutes, plannedCount}`；`GET /api/schedules/summary` 同样只返回汇总。现有接口没有事项标题，单改格子尺寸不能实现事项月历。

详细 Schedule 查询限制 1–7 天，不应对每个日期发请求或放开成无界明细。另需校验当前 42 格渲染与月份 summary 查询范围一致，避免末行跨月日期没有数据。

### 推荐呈现与事实来源

采用七列月历：日期头 + 实际事项行，展示标题、时间/时长与分类颜色。未完成但已经执行的事项也属于实际活动；没有计时的完成事件应有“完成”标识。计划与已发生事项必须能区分。

先显示约 3–5 条，超出显示“+N 项”进入当天列表/详情，避免单日大量记录撑坏整个网格。手机保留月份选择与选中日清单，保证能读完整事项。截图中的节假日/农历不自动纳入本片。

Calendar 提供有界的可见月份事项读取（覆盖完整可见网格，最多 42 天），仅组合 Execution/ActualTime 与 Tasks CompletionEvent 的公开读取；不新增事实表，不复制 Session note，不二次计算投入时长。执行与完成使用各自身份和类型，避免把同一件事当成重复活动或重复累计时长。

MonthCalendar 的交互由 Calendar 公开能力承担，AppShell 只保留日期/模式/路由组合。实施时同步修订 `docs/ARCHITECTURE.md` 中现有 month compact summary 的具体边界。

### 闭环与验收

执行/补录/完成 → 对应业务日期格子出现 → 点击具体事项可看详情 → 点击 +N 查看当日 → 编辑或删除后月历更新 → 刷新一致。

覆盖月首/月末/跨年、42 格边界、跨午夜 Session 多切片但单一 note、仅完成无计时、进行中事实的既有可见性、category 颜色、空日、大量事项、历史 ?date、Back/Forward、时区与移动端。真实 MySQL 验证月读取与既有 ActualTime/CompletionEvent 结果一致，保留 year heatmap 和 day/week 行为。

## 6. LIBRARY-METADATA-IMPORT

### 当前事实

Library 当前有 title/originalTitle/creator/type/coverRef/externalRef、个人 rating/status/date、shortNote 和 Notebook relation。externalRef 只是链接，没有 IMDb/Douban 解析或导入流程；个人短备注不应被外部作品简介覆盖。现有 API 集成回归可从 `apps/api/tests/vnext-11-14.test.ts` 复用。

### 数据源现实

- IMDb 官方非商业基础数据列出的字段包括作品标识、标题、年份、时长、类型等，不包含 plot 或封面；因此不能承诺靠这套免费数据自动获得作品简介。见 [IMDb 官方数据说明](https://developer.imdb.com/non-commercial-datasets/)。
- 豆瓣尚未确认当前可用的官方自助 API/授权接入；不能把历史 API 地址当作可用服务。其内容使用需结合官方声明核对授权，见 [豆瓣官方声明](https://www.douban.com/about/legal)。

### 一个推荐方案

Library 内提供“导入作品资料”：输入来源 URL/ID → 从已确认可用的数据源解析 → 预览并编辑 → 确认保存。数据源未接通或失败时，同一预览流程允许用户粘贴有权使用的资料；明确说明哪些字段未取得，不静默创建空壳，也不承诺绕过来源限制抓取。

Library 拥有导入草稿、外部标识和作品元数据。最小持久合同增加来源身份与独立简介字段，使用新 forward-only migration；外部评分如将来显示，必须与用户自己的五分制 rating 区分。本片先不增加外部评分功能。

按用户 + 规范化 provider/source ID 查重；命中已有作品提示打开已有条目或确认更新，保留用户 rating/status/笔记。提交重试不能重复创建。BOOK/MOVIE/SERIES/GAME 仅在来源确实支持时映射，无法判断时要求用户确认。

服务端获取来源，限定允许的官方/已批准主机及重定向，阻断私有网络目标，限制超时/响应体；封面失败有 fallback。复用当前 HTTP 和校验能力，不引入通用爬虫框架。

### 闭环与验收

来源 → 解析/明确失败 → 预览 → 用户确认 → Library 持久化 → 列表/详情可读 → 可编辑 → 重复导入可识别。

先完成数据源可用性检查，再实现完整垂直切片。覆盖电影/剧集、无简介、无封面、无效 URL、同来源重复、连续点击/网络重试、来源冲突、跨用户隔离、个人字段不被覆盖。新字段跑 fresh/upgrade migrations 和真实 MySQL；实际来源接入要有真实请求证据，mock 不能替代。

需要 owner 提供或确认可用的数据源/授权凭证后，才能将“IMDb/豆瓣自动简介导入”标记为完成。人工粘贴只作为降级路径，不能替代这项自动导入验收。

## 7. DEEPSEEK-TASK-DRAFTING

### 当前事实

`apps/api/src/ai-foundation.ts` 已有结构化生成 gateway、AIArtifact、来源指纹/重试身份、usage/cost 与领域权限。现有实现主要支持 Morning Writing，OpenAI 路径使用 `/responses`；不能只换 BASE_URL 就视为 DeepSeek 接入完成。

Tasks 已有 `task-publishing.ts` 的 publish / publish-and-accept 命令、operation receipt、Category/Project 校验和原子接取，继续作为唯一任务发布 owner。

### 推荐设计

1. 在任务创建入口提供“文字拆任务”，输入目标/原文；默认只发送这段用户明确输入，不读取 Wallet、Notebook 或其他背景数据。
2. AI Foundation 校验启用状态与 Adventure 权限，调用服务端 DeepSeek gateway。API key 只存服务端配置，不放客户端或 Settings 普通字段。
3. 使用 DeepSeek Chat Completions 的 JSON Output，服务器再次校验输出结构、条数、字段长度和引用身份。官方文档：[JSON Output](https://api-docs.deepseek.com/guides/json_mode/)、[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)。JSON mode 不能替代业务校验；处理空输出、截断、超时与限流。
4. 输出保存为 AIArtifact 草稿，预览为可勾选任务：标题、说明/步骤、预估时长，截止日期只在原文明确或用户确认后填写。建议单次最多 10 条，不引入父子任务/依赖图新模型。
5. 用户编辑、取消、选中后明确点击“发布”或“发布并接取”。Category/Project 从现有选项确认，不接受模型虚构 ID，不自动创建分类或项目。
6. Tasks 通过既有命令逐项发布。每项有稳定 operationId；部分成功时保留成功身份，只重试失败项，避免重复任务/Assignment/奖励。无需新建批量发布框架。
7. 成功项进入既有悬赏板/当日已接取；取消或仅生成不创建 Task。AI 成本与 usage 可查；生成草稿与发布任务是两个独立确认阶段。

模型名和服务可用性在接入时依据官方支持列表验证，不把当前型号硬编码为长期事实。沿用现有 AI Foundation 配置/权限结构，只增加实际需要的 provider 适配。

### 闭环与验收

输入 → 生成/可重试错误 → 保存并展示草稿 → 编辑/选中 → 明确发布 → Task 身份持久化 → 页面可见 → 重试不重复。

覆盖权限关闭/撤销、无效 JSON/空结果/截断、过长原文、超时/429、非法分类项目、用户隔离、取消不写 Task、双击发布、部分成功重试、发布并接取的原子性。Provider mock 用于确定性回归；真实 MySQL 验证 artifact 与 Task receipt；可用服务端凭证下完成一次真实 DeepSeek→草稿→发布的公开 UI 冒烟验证后，才认定接入闭环。

## 同类问题与共同验收门槛

本轮已经发现并纳入相应切片的同类问题：

- 流水排序和 ID 游标不一致：必须与排序一起修，不能只调整首屏。
- 同一个星星操作两个领域事实：分离交互，保留 focusRank 与 pinned 各自语义。
- 已完成区依赖当前状态/接取关系：读取不可变完成事件，避免历史随着当前选择消失。
- 多行字段复用 rounded-full：检查共享 `.field` 的全部消费面，不逐个页面打补丁。
- 截止时间发布/编辑使用不同时区转换：随固定倒数切片验证，不重新开启 Execution 日期工作包。
- 月历渲染网格与查询日期范围：把完整可见网格纳入数据读取边界。
- 外部资料与个人笔记、AI 草稿与真实 Task：分别保留来源和用户确认边界。

每片根据影响执行 focused tests、直接相邻集成和必要的真实数据库/浏览器验收。涉及 Web 实现时运行完整 Web suite、typecheck、lint/i18n audit、production build、architecture checker、git diff --check。涉及数据库合同时跑隔离数据库 fresh/upgrade 迁移；涉及读取/写入语义时跑真实 MySQL 集成。界面反馈、loading、失败保留输入、可重试、重复点击、用户隔离、中文/英文与移动端都属于闭环，不作为“以后补”。

既有规则继续保持：Session Note 仍只属于 Session；Timer projection 不可经普通 Schedule CRUD 编辑；ActualTime 不允许重叠的现行规则不变；Finance 入账奖励不重复结算；Global Settings 不重新承担 Wallet 的领域状态。

## 本轮实际验证

- PASS：Web Tasks、Reminders、AppShell 现有测试，共 3 文件 / 67 tests。
- Library 没有独立的 `index.test.tsx`，此次指定路径没有形成第四个测试文件；不得计为 Library Web 测试通过。
- NOT_RUN：本轮真实浏览器复现、真实 MySQL、迁移、完整 Web suite、typecheck/lint/build/architecture checker；本轮是审计设计，不对未来修复宣称通过。
- 本轮只新增整改报告；此前反馈改动和证据保留，未在此报告中重新认定为新的功能交付。

## NEXT ACTION

先实施切片 1：精确复现“完成后刷新/重新接取丢失”，闭合按完成业务日期读取的 Today 已完成区。随后按顺序交付切片 2–7。此次停在整改方案，不自动实施。

## 实施状态更新 · 2026-10-23

用户随后授权实施前五项，并追加“拖拽任务进入今日重点”。**前五项及追加拖拽现已 PASS**；实施、测试及真实浏览器/数据库证据见 [整改闭环报告](WB-PRODUCT-BUGS-1-5-CLOSURE-2026-10-23.md)。上文保留为最初审计，不代表当前尚未实施。

媒体信息导入及 DeepSeek 自动拆任务仍为后续设计范围，见 [下一窗口交接](WB-LIBRARY-AI-DESIGN-HANDOFF-2026-10-23.md)，不在本次继续实施。
