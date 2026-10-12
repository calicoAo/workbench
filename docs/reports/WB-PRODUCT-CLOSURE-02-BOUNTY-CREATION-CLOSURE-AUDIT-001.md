# PRODUCT-CLOSURE-02 / BOUNTY-CREATION-CLOSURE

### RESULT

**AUDIT_AND_DESIGN_COMPLETE — IMPLEMENTATION_NOT_STARTED — WAITING_FOR_OWNER_APPROVAL.**

审计日期：2026-10-11。HEAD：`ef8eb8796b6093c43bc37c7c2ddc08b3d0d44a87`。证据来自当前工作区，包含之前切片尚未提交的改动；不把这些改动归入本次审计，也不把 HEAD 描述为当前工作区的全部状态。

本次只新增此报告，没有修改生产代码、API、数据库、迁移或架构契约。已关闭切片继续关闭。

结论：实现目标主要需要修复 Web 创建流程的组合和公开能力。现有 Category 创建 API 可以同时保存名称、颜色和一个可空 Growth 映射；现有 Project API 可以创建项目并返回稳定 ID。没有证据要求新 API、新表、多维映射关系、全局草稿容器或通用弹窗框架。

推荐一个方案：**悬赏表单保持挂载，分类／项目字段各提供轻量管理入口；域内编辑能力返回保存身份；Tasks 只更新选中 ID。一个 Tasks 弹窗管理当前活动面板，成功反馈复用 ApplicationFeedback。**

现有相关 Web 基线测试：6 个文件、85 个用例通过。架构检查：0 error / 0 warning；检查器使用 defaults，没有仓库专属依赖规则，不能据此推断所有跨模块边界已被自动验证。`git diff --check` 通过。新方案尚未实现，也未经过浏览器或真实数据库验收。

### CURRENT BOUNTY CREATION PATH

创建入口最终进入同一个 Tasks-owned `CreateTaskWorkflow`：

| 入口 | 当前接线 |
| --- | --- |
| Today 任务面板“发布悬赏” | Tasks panel 调用 `openCreate` |
| 全局 quick action | AppShell 调用 Tasks public `openCreate` |
| `/tasks` 悬赏板 | `BountyBoard.onCreate` 接 `openCreate` |
| Project detail 创建任务 | Projects 调用注入的 `onCreateTask({ projectId })`，预选当前项目 |

证据：[Tasks 面板](/Users/lijingru/Developer/workbench/apps/web/src/features/tasks/index.tsx:212)、[Tasks workflow 组合](/Users/lijingru/Developer/workbench/apps/web/src/features/tasks/index.tsx:265)、[Shell quick action](/Users/lijingru/Developer/workbench/apps/web/src/app/shell/index.tsx:342)、[悬赏板路由](/Users/lijingru/Developer/workbench/apps/web/src/app/shell/index.tsx:405)、[Project 路由](/Users/lijingru/Developer/workbench/apps/web/src/app/shell/index.tsx:418)。

当前链路：

```text
CreateTaskWorkflow 的本地草稿
  → CategoryField 选择 / 内联创建
      → POST /api/task-categories（强制 dimensionKey:null）
      → 等待整个 onChanged 刷新
      → 选择返回的 category.id
  → Project select（只有选项，没有创建 / 编辑入口）
  → POST /api/tasks（选中的 categoryId / projectId）
```

`CreateTaskWorkflow` 拥有标题、详情、分类／项目身份、优先级、难度、预计分钟、进度和截止时间。普通 snapshot 更新不会初始化这些草稿，已有测试保护这一点。

当前关闭行为需要精确描述：取消／X 只是 `setOpen(false)`，多数字段保留；下一次 `openCreate` 会重新指定或清空 Project ID；发布成功会清空多数字段，但保留 Category ID。本方案不顺手重写这个既有主弹窗生命周期。二级管理器每次开启必须使用明确的新建／编辑身份，关闭主弹窗时清掉二级面板状态。

证据：[创建与关闭语义](/Users/lijingru/Developer/workbench/apps/web/src/features/tasks/create-task.tsx:22)、[已有草稿刷新回归](/Users/lijingru/Developer/workbench/apps/web/src/features/tasks/index.test.tsx:87)。

### CATEGORY OWNERSHIP AND DIMENSION MAPPING

**唯一当前映射存储在 `task_categories.dimension_key`：每个 Category 对应零个或一个 GrowthDimension。** 没有独立映射关系表，也没有多选／权重契约。

| 责任 | 当前 owner / capability |
| --- | --- |
| 分类身份、名称、颜色、目标分钟、启用状态 | Categories UI；`/api/task-categories` 简单 CRUD |
| 用户可配置维度、名称、排序、启用状态 | Growth；`GET /api/growth/dimensions` |
| 非空映射的用户归属和启用校验 | Growth public `requireGrowthDimension` |
| 创建分类时同时保存映射 | Category POST 调用上述校验，并一次 INSERT 保存同一 Category 行 |
| 修改当前映射 | Category PUT 可修改同一字段；Growth mapping UI 调用 `/api/growth/category-mappings/:id`，也更新同一字段 |
| 停用维度并解除已有映射 | Growth 事务内 capability |
| 历史统计解释 | Growth 按当前映射派生；不改历史 Task / ActualTime facts |

创建时**不需要**先建分类再调用第二次 mapping mutation。一次 Category POST 即可提交 `name + color + dimensionKey`；非法／其他用户／已停用维度在 INSERT 前被拒绝。可空映射继续表示“暂不映射”。

必须限定“原子”的含义：分类属性和映射是一条 INSERT，不存在第二步失败留下半成品的创建流程；但 `requireGrowthDimension(db, ...)` 的读取与 INSERT 没有共同事务锁。因此当前实现**没有保证**分类创建与并发停用维度之间的串行化。不能承诺完整的并发原子校验。本方案沿用现有契约，单列这一现存风险；若 owner 要求补此竞态，应另行授权 API 并发修补并跑真实 MySQL，不能为了 UI 闭环暗改。

Web 还有一个必须覆盖的实际差异：Growth API 支持自定义维度 key 和改名；Categories 的 `DimensionOptions`、Tasks 的 `CategoryOptions` 使用静态维度列表，`Category.dimensionKey` 还是固定 union。映射到自定义 key 的分类可能根本不出现在悬赏选项中。只把旧编辑 JSX 搬过来不能闭环。

推荐 Growth 暴露最小的配置查询／维度选择公开能力，复用 `['growth-config', userId]` 和现有维度名称翻译语义；Categories 消费已启用的真实维度。分类选项的 key 契约接受服务端 string，确保所有可选分类都能显示；未知 key 至少保留分类选项，不能误称其 canonical mapping 为 null。范围限于本创建／编辑链路，不重做旧 Ability 统计。

证据：[分类 API](/Users/lijingru/Developer/workbench/apps/api/src/routes/task-categories.ts:43)、[Growth 校验与配置](/Users/lijingru/Developer/workbench/apps/api/src/growth.ts:31)、[Growth 映射写入](/Users/lijingru/Developer/workbench/apps/api/src/growth.ts:204)、[Growth mapping UI](/Users/lijingru/Developer/workbench/apps/web/src/features/growth/index.tsx:93)、[静态分类选项与内联创建](/Users/lijingru/Developer/workbench/apps/web/src/features/tasks/task-ui.tsx:10)、[Settings 分类编辑](/Users/lijingru/Developer/workbench/apps/web/src/features/categories/index.tsx:220)。

### PROJECT OWNERSHIP AND CREATION

Projects 已有列表、详情、创建／编辑、状态转换、归档／恢复能力。创建返回 `{ id, version, status }`，初始状态 PLANNING；更新需要 `expectedVersion`，冲突返回 409。Bounty 缺少入口，并非缺少领域创建能力。

现在的 `ProjectEditor` 是 feature-private，自己拥有草稿和 pending，但 `onSaved` 不返回新身份，创建结果被丢弃。推荐从 Projects public index 暴露轻量管理工作流，内部复用拥有草稿、校验、请求和失败重试的编辑能力；原 Projects 页面也消费同一内部 owner。不能让 Tasks 调用 private `ProjectEditor` 或自己写 Project POST / PUT。

本轮 quick manager 操作范围：

| 操作 | 推荐 | 理由 |
| --- | --- | --- |
| 创建 | 支持，成功自动选择 | 当前流程明确需要 |
| 选择 | 支持，直接返回 ID | 复用现有 Project identity |
| 元数据编辑 | 支持名称、说明及已有可选字段 | 可以修正本次选择，不改变生命周期；保留 version 校验 |
| 归档／恢复 | 不放进 quick manager | ACTIVE 不能直接归档，选中实体失效也需要额外意图处理 |
| 启动／暂停／完成 | 留在 Projects 原页面 | 包含完成未结束 Tasks 等业务决策，不属于悬赏关联选择 |

只允许关联未归档、未完成的项目。注意 `GET /api/projects?view=active` 的 active 指未归档，仍可能含 DONE；必须保留 Bounty 现有 `status !== 3` 筛选和服务端 assignable 校验。

编辑 Project 的失败或 409 保留该 Project 编辑草稿和父 Bounty 草稿；允许读取最新版本后明确重试，不静默强制覆盖。元数据编辑不能偷偷将未显示的 notes / 日期等字段清空。

证据：[Projects 查询与页面](/Users/lijingru/Developer/workbench/apps/web/src/features/projects/index.tsx:23)、[私有 ProjectEditor](/Users/lijingru/Developer/workbench/apps/web/src/features/projects/index.tsx:82)、[创建／版本更新 API](/Users/lijingru/Developer/workbench/apps/api/src/routes/projects.ts:98)、[归档 invariant](/Users/lijingru/Developer/workbench/apps/api/src/routes/projects.ts:138)、[Task 发布关联验证](/Users/lijingru/Developer/workbench/apps/api/src/task-publishing.ts:26)。

### CURRENT FEEDBACK BEHAVIOR

现有全局反馈是 `ApplicationFeedback` 的 notice / confirm / reward popup，**不是 toast 队列**。`notice(message, title?)` 已可提供成功标题，不需要另建通知系统。

现有 CategoryField 没有成功 notice、catch 或 pending；`void create()` 的请求失败可产生未处理 rejection。它先等待整个 shell refresh 再选择分类，刷新失败也会阻断成功后的选择。

Settings 分类编辑和 Projects 编辑有错误回调，通常注入全局 notice；成功以关闭／刷新体现，没有创建身份回传。全局 FeedbackPopup 目前也缺少完整的 dialog 标识、焦点圈和 Escape 处理；在有 Tasks 焦点圈的页面上叠加它，父层可能仍处理键盘。

推荐：成功只在领域 POST / PUT 已确认后发出“分类已创建／项目已创建” notice；先完成选项可见和身份选择，再恢复父表单。保留现有错误 notice，编辑草稿留在原位置。已有 feedback public surface 可窄幅暴露由 `popup !== null` 派生的只读 presentation 标记，供 Tasks 暂停自身焦点处理；FeedbackPopup 自己接管焦点、Escape 与关闭后恢复。该标记不是新增 store，也不保存领域状态。Shell 只接线，反馈仍由 application feedback owner 管理。

这是复用现有反馈所必需的交互修补，限于 focus / dismiss / accessibility，不做全站通知或弹窗外观迁移。

证据：[FeedbackActions](/Users/lijingru/Developer/workbench/apps/web/src/app/feedback.tsx:13)、[notice owner](/Users/lijingru/Developer/workbench/apps/web/src/app/feedback.tsx:30)、[FeedbackPopup](/Users/lijingru/Developer/workbench/apps/web/src/app/feedback.tsx:60)。

### COLOR PICKER REALITY

悬赏 CategoryField 当前只有原生 `input type=color`。Categories 的 Settings editor 已有更合适的基础：7 个紧凑预设、当前色、选中描边、自定义色入口和 HEX 输入。因此推荐抽出并复用 Categories-owned 的现有控件，不新增 color-picker 依赖，不引入 shared/global palette。

需要在该控件内补齐：

- 色块使用 Button 或原生 button，显式 `type=button`、可读名称、`aria-pressed`、键盘焦点和可见选中标记；不只靠色差表达选中。
- 保持紧凑排列，可换行；移动端命中区域适配现有按钮尺寸，避免 30px 色块成为唯一小点击目标。
- 自定义 HEX 继续接受 `#RRGGBB`，保存统一大写；非法值提供字段错误和 `aria-invalid`，不提交，也不悄悄保存旧色。
- 当前 HEX 输入仅 blur 时尝试写入，非法输入不会改变 `draft.color`，现有 save 仍可能保存旧色；复用时必须针对这个实际输入风险加测试。
- 不显示巨型原生色盘；原生 picker 只作自定义补充入口，HEX 是可访问的备用输入。

证据：[CategoryColorControl](/Users/lijingru/Developer/workbench/apps/web/src/features/categories/index.tsx:295)、[现有紧凑样式](/Users/lijingru/Developer/workbench/apps/web/src/styles.css:2805)。

### RECOMMENDED QUICK MANAGER UX

保留主悬赏表单布局，在 Category / Project select 旁提供“新建／管理”按钮，不跳转路由。

```text
发布悬赏（所有字段保持）
  → 分类：选择已有分类 / 新建或编辑
      → 单列：名称、紧凑色块、Growth 维度（可空）
      → 保存到 Categories → 返回身份 → 更新选项 → 自动选择新分类
  → 项目：选择已有项目 / 新建或编辑
      → 单列：名称、说明；已有优先级、日期、笔记按需展开
      → 保存到 Projects → 返回身份 → 更新选项 → 自动选择新项目
  → 原悬赏表单继续填写
  → 发布 / 发布并接取
```

二级管理器只管理可关联实体：Category 选择／创建／元数据编辑；Project 选择／创建／元数据编辑。Category 停用／删除继续留在完整管理页；不复制删除历史关联或 Project 生命周期流程。

编辑已选实体保留该选中身份；编辑列表中另一个实体不隐式替换父选择，用户通过“使用此分类／项目”明确选择。新建成功则自动选择新身份。

建议公开能力名如 `CategoryQuickManager` / `ProjectQuickManager`；名称可随实现调整，契约要稳定：域内拥有 editor draft、pending、validation、mutation；向 Tasks 返回保存／选择的 ID 及必要展示 snapshot。它们支持嵌入当前活动面板，不各自强制生成第二个 modal portal。Categories 可从现有 CategorySettings 编辑 owner 提取同一个完整能力，保留之前的编辑身份与失败重试测试，避免仅抽 JSX 后让 Tasks 继续拥有 CRUD。

### NESTED DIALOG / DRAFT SAFETY

**当前弹窗不能直接安全叠加。** Tasks `ModalPortal` 在 document 注册自己的 Escape / Tab listener；再挂一个相同 Portal 会让 Escape 同时调用两个 onClose。旧 Category／Project editor 没有等价焦点管理；直接塞入也不能补上这一缺口。以下为代码路径审计结论，尚未做浏览器复现。

推荐一个 Tasks-private 的最小组合改动：

1. 一个 Portal / backdrop；主 Bounty form 保持挂载，二级编辑 form 是它的 React 和 DOM 兄弟，不能嵌套在 Bounty form 内。Portal 只改变 DOM 位置，并不阻止 React submit 事件沿组件树冒泡。
2. Tasks 只保存 `activePanel = bounty | category | project` 与当前管理意图。二级活动时父表单 inert、不可点击／聚焦；仅活动面板进入焦点圈和可访问名称。保留唯一活动 dialog，不新增通用 modal stack。
3. Escape／X／外部点击只关闭当前二级面板；回到主表单，焦点恢复到对应字段入口。主层活动时才关闭主弹窗。Tab / Shift+Tab 留在活动面板。
4. 二级表单 `preventDefault` 并隔离 submit；所有非保存按钮 `type=button`。Enter 保存二级表单不能发布 Task。
5. 请求 pending 期间阻止当前管理器关闭与重复保存，父发布不可操作；成功后才结束编辑意图，防止取消后迟到响应错误选择实体。
6. 全局 notice 活动时 Tasks 焦点圈暂停，由已有 FeedbackPopup 管理焦点；关闭 notice 后恢复当前面板。不能仅增加 z-index。
7. 二级取消只丢弃二级未保存草稿。创建／编辑失败保留二级和父草稿；再开启“新建”使用空 draft，再开启“编辑”按明确 ID 初始化，不继承旧 ID。
8. 主弹窗关闭同时清除二级管理意图；沿用原有主草稿关闭／重开语义。已成功创建的分类／项目不会随取消 Bounty 自动删除。

保存与刷新必须区分：POST 已成功但选项 refetch 失败，不等于创建失败；保留已返回的 ID，提供读取重试，不能再次 POST。Category POST 返回完整实体，可由 Categories 先更新现有对应 query snapshot；Project POST 仅返回身份，可由 Projects 刷新／读取现有项目 query 后完成身份回传。读取尚未完成时不能声称已经可选择，不能在 Tasks 保存第二份长期列表。

刷新策略：Category 写入覆盖当前用户的 Today categories、Settings categories、Growth config / overview，以及消费分类元数据的 Task / Timeline snapshots；不得仅调用当前 shell refresh，因为它不刷新 Growth / Settings，且只命中当前日期 Today。Project 写入更新／失效当前用户现有 `projects` / 对应 `project` keys。具体 keys 根据实际消费者收敛，不能全局清缓存。Tasks 新选中 ID 必须在父 select 的可见 snapshot 中存在，否则 `effectiveCategoryId` 会回退为空。

Auth 切换按现有 session 清 QueryClient 和 user-keyed component 边界释放草稿；Tasks 的公开组合需收到 authenticated userId 给域内 query 隔离使用。所有晚到保存回调需确认属于当前仍活动的用户／编辑意图，不可写入另一个用户的缓存。

手机：二级单列，右上共享 IconButton 关闭；复用 `100dvh` / safe-bottom 限高滚动，操作区不被底部导航／FAB 遮挡。必须在真实 375 CSS px viewport 验证，不能缩放桌面截图作为移动端证据。

证据：[ModalPortal](/Users/lijingru/Developer/workbench/apps/web/src/features/tasks/task-ui.tsx:33)、[shell 当前 refresh 与挂载](/Users/lijingru/Developer/workbench/apps/web/src/app/shell/index.tsx:220)、[query identity](/Users/lijingru/Developer/workbench/apps/web/src/app/query.ts:3)、[Settings 分类 refresh](/Users/lijingru/Developer/workbench/apps/web/src/features/settings/index.tsx:123)、[mobile modal 样式](/Users/lijingru/Developer/workbench/apps/web/src/styles.css:2675)。

### API / SCHEMA IMPACT

推荐方案：**API / schema / migrations 均无变更。**

复用 `POST/PUT /api/task-categories`、`GET /api/growth/dimensions`、Projects GET / POST / versioned PUT，以及现有 Task publish command。创建分类时直接提交 mapping，不引入第二个 mapping truth；现有 Growth mapping 管理页保持可用。

编辑只提交本次实际编辑的字段：不能照搬 CategorySettings 的固定 `targetMinutes:6000` 覆盖已有目标；Project 元数据编辑保留其他字段。不会修改 Task 发布事务、Timer、完成奖励或历史归属契约。

领域创建与 Task 发布是独立提交：Category / Project 保存后已成为真实实体；Task 提交失败只保留 Bounty 草稿，不回滚或删除这些实体。

Category / Project POST 目前没有 Task publish 的 operation receipt 契约。pending 能防快速双击，不能保证网络响应丢失后的重试 exactly-once。明确返回成功后的读取失败禁止重发 POST；结果未知的网络失败不能虚称“肯定未保存”。不按同名推断身份，不为本 UI 任务悄悄加入幂等 API。

### IMPLEMENTATION SLICES

以下均为未来计划，需 owner 批准后实施。按完整用户路径交付，不先建空框架。

| 切片 | 当前 owner → proposed owner | 主要文件／能力 | 导航 / API / schema | 验收与回归风险 |
| --- | --- | --- | --- | --- |
| 1. Category 创建闭环 | Tasks 内联 Category POST → Categories public editor；维度列表 → Growth public query；Tasks 保留父 draft / selected ID | `categories/index.tsx` 及必要私有 editor/color workflow；`growth/index.tsx`；`tasks/create-task.tsx`、`task-ui.tsx`；`app/feedback.tsx` 的窄焦点能力；Shell 仅传 userId / feedback presentation；i18n 与局部 CSS | 不换 route；复用现有 Category / Growth API；无 schema | 在未完成悬赏内创建映射分类、成功可见并自动选中、失败可重试；一个活动键盘面板；自定义维度不会丢选项。重点保护原 CategorySettings 身份／目标分钟与 Feedback confirm/reward 行为 |
| 2. Project 创建与轻量编辑闭环 | 私有 Projects editor → Projects public quick manager；Tasks 只消费结果 | `projects/index.tsx` 及必要私有 editor；`tasks/create-task.tsx`；复用切片 1 的局部面板组合；i18n / 局部 CSS | 不换 route；复用现有 Projects API 和 version；无 schema | 创建后关联正确 ID；元数据编辑不改变生命周期，409 留草稿；DONE / archived 不可选；原 Project 页面与 detail 创建 Task 预选保持正确 |
| 3. 完整验收与边界记录 | 既有各 owner → 保持；测试与 architecture 文档记录新公开能力 | Tasks / Categories / Projects / Growth / Feedback / Shell tests；必要 API focused tests；browser evidence；`docs/ARCHITECTURE.md` | 不引入新路由／endpoint／migration | 13 项验收覆盖，真实 MySQL 确认 mapping / ownership / Task linkage；375px 和 desktop 公共 UI。只修由本次验收暴露的 owner-scoped 问题，先前闭环保持关闭 |

每个实现切片运行对应 focused tests、typecheck、lint/i18n、build、架构检查和 diff check；最终跑完整 Web suite。切片 3 是验收阶段，不是追加清理或新 feature。

### TEST PLAN

| # | 必测场景 / 断言 | Web / browser | 真实 MySQL |
| --- | --- | --- | --- |
| 1 | 填写全部 Bounty 字段后新建 Category，原草稿不变 | Workflow test + 公共 UI | Category POST 实际持久化 |
| 2 | 创建时选择一个 GrowthDimension；null、自定义 key、改名、停用不可选 | Query / payload / options tests | 同一次 Category 创建保存 mapping；非法、disabled、foreign-user mapping 拒绝且不留创建行 |
| 3 | Category 成功 notice、选项可见、选择返回 ID；慢刷新不回退 Inbox | Query integration + feedback | API 返回 ID 与行一致 |
| 4 | Category 请求失败保留两个草稿，可重试；成功后读取失败不重复 POST | Web injected failure | 数据库语义由 #2 / #10 验证 |
| 5 | 在同一 Bounty 草稿内创建 Project | Workflow test + 公共 UI | Project POST 实际持久化 |
| 6 | Project 成功选中返回 ID，普通 refetch 不清草稿 | Query integration + feedback | 身份／初始版本正确 |
| 7 | Project 失败／409 保留两个草稿并可 retry，不覆盖他人更新 | Web error tests | version conflict 实际拒绝 |
| 8 | 二级取消恢复父字段／选择，未发 Task POST | Workflow test | 无额外数据库要求 |
| 9 | 新建 A→关→新建 B／编辑 C，不复用旧 draft ID；主关闭不删已保存实体 | Categories / Projects / Tasks tests | 不误更新其他实体；已创建行仍存在 |
| 10 | 新 Category + Project 完成发布／发布并接取，payload 与 Task 对应正确 | Workflow + 公共 UI e2e | 实际 task FK、owner 校验、publish receipt / assignment 事务；Task 失败不回滚已建实体 |
| 11 | 色块 selected / aria-pressed / keyboard，非法 HEX 不保存旧色 | Component + browser keyboard | 无额外数据库要求 |
| 12 | Escape 仅关二级、Tab 圈、focus restore、Enter 不发父表单；notice 接管；375px 无溢出／固定 UI 遮挡 | Component + 真实 viewport browser | 浏览器端到端实例使用隔离数据库 |
| 13 | user A / B 与实体身份隔离；正确 scoped invalidation，慢响应不串用户 | Query / auth integration | foreign-user entity GET / PUT / Task association 拒绝且不误写 |

增加保存 pending 双击断言；测试既有 Settings 分类编辑不会重置目标分钟、Project 简化编辑不会清空隐藏字段；Feedback notice / confirm / reward 的键盘及焦点行为都要有邻近回归。

已有真实 DB 测试可复用：`r2a-projects.test.ts` 覆盖 create/update/version/archive/restore、完成策略和用户隔离；`r2d1-growth.test.ts` 覆盖当前映射解释与停用原子解除映射；`r1_5-g5b.test.ts` 覆盖分类停用保留历史关联。它们不能替代 #2、#10、#13 的这条具体 Category + Project + Bounty 创建组合，需要补 focused integration。

执行环境沿用仓库真实 MySQL 规范：确认当时 migration head，使用新建 `_test` 库，复用既有 Compose / 已知 test service，跑 fresh migration 和相关 integration，验收后清理；不使用生产或长驻开发库。因为本次没有实现，**本次 MySQL / browser / 新方案验收均 NOT_RUN**，不是 BLOCKED，也不是 PASS。

本次实际执行：

```text
npm run test --workspace @workbench/web --
  src/features/tasks/index.test.tsx
  src/features/categories/index.test.tsx
  src/features/projects/index.test.tsx
  src/features/growth/index.test.tsx
  src/app/shell/index.test.tsx
  src/features/settings/index.test.tsx
→ PASS: 6 files / 85 tests

node /Users/lijingru/.codex/skills/engineering-architecture/scripts/architecture-check.mjs --root .
→ PASS: 0 errors / 0 warnings, defaults only

git diff --check
→ PASS
```

完整 Web suite、typecheck、lint/i18n、production build 本次 NOT_RUN：本次交付是报告，以上列为实现验收必跑，不能从 85 个基线 tests 推断已满足新方案。

### ARCHITECTURE CONFORMANCE

系统是已有架构契约的 npm monorepo、Web feature-oriented / API route-centric。本次选择 design 模式，应用 engineering-architecture 与 ponytail 最小实现原则。

| Owner | 推荐边界 |
| --- | --- |
| Tasks | Bounty draft、所选 Category / Project ID、二级管理意图、创建流程组合；不写 Category / Project CRUD |
| Categories | 分类 editor draft、颜色控件、Category POST / PUT 和保存结果；调用 Growth public 维度读能力 |
| Growth | canonical dimension 配置、名称语义、启用列表与 mapping validation capability；不复制 Category facts |
| Projects | Project editor、query、创建／元数据编辑、version conflict、返回保存身份 |
| AppShell | userId / public feature / feedback 接线、路由和日期；不持有编辑草稿或领域请求 |
| ApplicationFeedback | 全局 popup 与自身焦点生命周期；仅暴露派生 presentation 状态 |

现有架构记录 Categories 拥有分类 CRUD，但 Tasks 的 CategoryField 直接创建分类，是本次要收敛的实际 ownership drift；静态 Ability 元数据与用户配置 Growth 的差异需要明确文档，不假装固定 enum 是服务端维度真值。

未来实现需同步在 `docs/ARCHITECTURE.md` 记录新的 public 编辑能力与 `Tasks → Categories / Projects`、`Categories → Growth` 依赖。只经 feature index 导入，不 deep-import 私有 editor。Projects 现有 Task snapshot 依赖只作类型消费，不因公开 quick manager 再引入 Projects→Tasks runtime cycle。

不把上述 domain UI 放进 shared，不新建 generic form / modal / notification framework，不用 Effect 镜像 server entities，不新建全局 drafts 或 mapping source of truth。本次没有改变 durable contract，架构文档保持原样。

### OWNER DECISIONS REQUIRED

建议批准这一份方案时明确以下范围：

1. **映射继续是单个可空维度**，真实选项来自 Growth config；不扩成多维权重模型。
2. **quick manager 只做选择／创建／元数据编辑**；Category 停用／删除和 Project lifecycle 保留原完整页面。
3. **创建实体即时持久化**；取消 Bounty 不删除已保存 Category / Project；主弹窗关闭／重开默认行为维持现状。
4. **现有维度校验／停用竞态独立记录**，本轮 UI 方案不承诺并发串行化。如果需要立即修补，应单独授权最小 API 修复和真实 DB 并发回归。

其余工程选择由上述已建立 owner 和安全契约决定，包括一个活动面板、反馈焦点接管、pending 防双击、只读刷新失败不重发创建、移动端真实验收；无需新增产品偏好字段或路由决策。

### NEXT ACTION

**停止在此报告，等待 owner 批准实施。** 建议批准后先实施切片 1：Category 创建 + Growth 单映射 + 新身份选择 + 现有反馈 + 草稿／键盘安全；再复用同一局部面板组合接 Project。尚未开始任何生产实现。
