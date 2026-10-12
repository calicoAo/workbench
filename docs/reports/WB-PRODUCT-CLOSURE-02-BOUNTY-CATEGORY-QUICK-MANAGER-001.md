# PRODUCT-CLOSURE-02 / BOUNTY-CATEGORY-QUICK-MANAGER

## RESULT

**PASS — BOUNTY-CATEGORY-QUICK-MANAGER COMPLETE**

2026-10-11。实施批准设计的 Slice 1。基线 HEAD：`ef8eb8796b6093c43bc37c7c2ddc08b3d0d44a87`；工作区原有未提交变更保留。本次实现、实际数据库验证、桌面与 375px 浏览器验收均完成。

创建悬赏时可选择、创建或编辑分类，包含名称、颜色及一个可选成长维度。保存后分类真实 ID 进入选项并自动选中，成功提示明确，悬赏草稿保持完整。Project Quick Manager 未实施，已关闭的其他切片未重开。

## BEFORE

Tasks 的分类字段自行发起简化创建；Settings 有独立的分类编辑草稿和 mutation。静态维度枚举无法表达用户新增或改名的配置，未知字符串映射可能使分类从选项消失。简化创建无法完整管理颜色、映射及已有分类。

旧 Settings 编辑 payload 固定写入未展示的 `targetMinutes`。分类保存和父页面刷新耦合，缺少“写入已成功、后续读取失败”的单独恢复语义。Tasks 对话框也未提供本流程要求的单面板焦点生命周期。

## AFTER

Tasks 经 Categories 的公开 `CategoryQuickManager` 组合分类管理。Categories 私有 `editor.tsx` 同时服务 Settings 和 Quick Manager，持有草稿、校验、颜色与保存行为。Growth 公开配置查询和维度选择能力，保持原查询身份。

Tasks 保留悬赏草稿和 `categoryId`，只切换本地第二面板。保存先提交确定的分类实体，再更新选择、关闭面板和显示 ApplicationFeedback notice；背景刷新不决定写入是否成功。

原 Task 编辑也是被替换的 CategoryField 的消费者，因此同步组合相同公共能力，保留其既有创建分类能力。没有引入另一套 Task 编辑流程。

## CATEGORY OWNERSHIP

| Owner | 实际责任 |
| --- | --- |
| Categories | 共享 metadata editor、分类草稿、颜色校验、POST/PUT、保存实体身份、用户隔离的选项缓存 |
| Growth | 配置维度查询、启用状态、自定义字符串 key、当前显示名称 |
| Tasks | 悬赏草稿、选中 categoryId、第二面板意图、公共能力组合 |
| ApplicationFeedback | notice/confirm/reward 状态、焦点圈、Escape 与关闭恢复 |
| AppShell | 转交认证 userId、日期与路由组合 |

类别持久化仍使用 `/api/task-categories`。Tasks 不发起分类 POST/PUT，不导入 Categories/Growth 私有文件。Settings 保留列表搜索/筛选意图，通过共享编辑器写入。编辑只提交展示字段，保留 `targetMinutes`、icon、sort order 等隐藏字段。Settings 原有背景关闭保留，保存期间阻止关闭。

主要文件：`features/categories/{index,editor,quick-manager,queries,color-control}.tsx/ts`、`features/growth/dimension-selection.tsx`、`features/tasks/{create-task,edit-task,task-ui}.tsx`、`app/feedback.tsx`。入口仅增加公开组合和认证身份传递。

## GROWTH DIMENSION MAPPING

复用 `['growth-config', userId]`，无第二份维度 store。选择器显示启用维度，包括自定义 key 和改名后的名称；默认未改名维度继续翻译。`null` 保持有效。停用维度不能新增选择。

`Category.dimensionKey` 接受服务器规范字符串或 null。未知 key 的分类仍留在 Task 选项中，不被重解释成 null。已有不可用映射保留其原始值并明确提示；不自动清除。服务器原有 ownership/status 验证继续执行，非法、停用和他人维度真实请求均拒绝。

创建一次提交 name + color + dimensionKey。没有新列、mapping 表、额外 mapping mutation 或历史 Growth 统计变更。既有并发 dimension-disable validation race 在本切片范围外；本报告不声称该竞争已完全串行化。

## COLOR CONTROL

共享紧凑预设色块、当前颜色、明确选中标记、自定义颜色和 HEX 输入，无新依赖。色块明确 `type=button`、可访问名称、`aria-pressed` 和键盘焦点。375px 下交互高度为 44px。

HEX 仅接受 `#RRGGBB`，有效保存值转大写。非法输入有 field error、`aria-invalid` 和描述关联，并阻止保存。显示的 HEX 草稿即提交颜色来源；不会偷偷保存旧颜色。

## BOUNTY DRAFT PRESERVATION

创建、取消、保存、重开分类管理均保留 title、details、priority、difficulty、estimated duration、progress、deadline（日期/时间）和 project。主面板保持挂载，但第二面板活动时隐藏且 inert。

主对话框原有关闭/重开语义保留：取消保留原本保留的字段，重新打开仍按旧行为初始化 project；成功发布仍按旧逻辑重置字段并保留 category selection。新增分类成功后，Publish 与 Publish & Claim 都使用真实保存 ID。成功提示关闭后不会丢失草稿。

## DIALOG / FOCUS SEMANTICS

一个 Tasks ModalPortal/backdrop，两个同级面板和独立 DOM form；分类 form 不嵌套在 Bounty form。Escape/背景关闭仅作用当前面板；pending 时第二面板不能关闭或重复保存。取消丢弃未保存的分类草稿，回到原悬赏。

Tab/Shift+Tab 只圈在活动面板，过滤 inert/hidden/disabled 控件；分类 Enter 不提交悬赏。回到悬赏后焦点恢复至“新建 / 管理分类”。ApplicationFeedback popup 活动时拥有焦点及 Escape，Tasks 暂停自己的焦点处理；只公开派生 `popupIsOpen` 信号，没有新增通知 store 或通用 modal stack。

实际浏览器验收暴露并修正了两个本流程缺陷：旧分类样式的隐式网格列影响单列布局；提示关闭和主面板重新激活的焦点恢复时序。修复限制在分类样式和 Tasks/Feedback 各自生命周期。移动端关闭 header 固定于滚动面板顶部，保证长列表下可关闭。

## SUCCESS / FAILURE BEHAVIOR

1. POST 返回规范实体及 ID。
2. Categories 同步提交保存实体至当前用户查询快照。
3. Tasks 选择保存 ID 并关闭第二面板。
4. ApplicationFeedback 显示“分类已创建/分类已更新”。
5. 用户范围的背景查询刷新。

已确认 POST 成功但刷新失败时保留实体和选中 ID，展示读取重试；不会重新 POST，不退回 Inbox。常规写入失败保留分类和悬赏两份草稿，允许重试。pending ref 和禁用控件阻止重复保存。

网络/服务器异常导致结果未知时明确提示先刷新核实，不断言“肯定未创建”；有显式读取动作，不按名称识别重复项，不添加 API idempotency。现有 Task 发布 receipt 语义保持。

旧认证用户或已失效 editor intent 的晚到响应在写缓存/回调前被忽略。测试确认不会将旧用户分类写入新用户 cache，亦不会发布旧用户成功提示。

## QUERY CONSISTENCY

Categories 拥有 `['task-categories', userId]` 选项 query，Tasks 不保存第二份长期列表。保存实体先写入该 key 及已存在的 Today、Settings、Growth config categories 快照；保留快照统计和其他字段，Today/选项只保留可用分类。

按同一 userId 精确 invalidate `task-categories`、`today`、`settings`、`growth-config`、`growth-overview`、`tasks`、`task`、`timeline`。Today categories 是 Task 标签及 Timeline 组合使用的 metadata 来源。无全局 cache clear 或广泛 AppShell refresh 依赖。

测试覆盖另一个用户缓存不变、已有 totalMinutes 不被 metadata edit 覆盖、返回 ID 对应选项先可见、读取失败保留确认实体。

## REAL MYSQL TESTS

**PASS：10 tests，0 failed，0 skipped。** 新增 `apps/api/tests/bounty-category-quick-manager.test.ts` 三个真实 MySQL tests，与现有 `r2d1-growth.test.ts` 七个 tests 联合执行。API test source typecheck 通过。

```sh
cd apps/api
TZ=UTC ../../node_modules/.bin/tsc -p tsconfig.test.json --noEmit
TEST_DATABASE_URL=mysql://root@127.0.0.1:33307/workbench_bounty_browser_test \
  TZ=UTC ../../node_modules/.bin/tsx --test --test-concurrency=1 \
  tests/bounty-category-quick-manager.test.ts tests/r2d1-growth.test.ts
```

新增 suite 自建并清理专用 `_test` database，全量应用 42 个 migration 至 V41。真实 SQL 证明单一 custom mapping、null、规范颜色，以及编辑保留 target=12345/icon/order。非法/停用/他人维度不插入分类；外用户 edit/Task association 和停用分类发布拒绝且不插入 Task。

真实 Task POST 和 Publish & Claim 验证 category FK、project、草稿内容及 assignment 数量，并保持既有 publication receipt replay 行为。Growth 既有 suite 覆盖 V32 fresh、V31→V32 upgrade 和当前映射/历史统计回归。

先探测既有候选端口 3306/3307/3407/3408/33307，再按仓库既有 native MySQL 8.0.25_1 QA 方式启动仅绑定 loopback 的临时实例。未读取或改写长期开发/生产数据库。

## WEB TESTS

**PASS：focused 7 files / 97 tests；full Web 34 files / 310 tests。**

聚焦覆盖 Tasks、Categories、Growth、ApplicationFeedback、AppShell、Settings。新增 Tasks quick-manager tests、Feedback notice/confirm/reward focus tests、Settings pending/backdrop 回归以及架构公开边界检查。

| 要求 | 永久证据 |
| --- | --- |
| 1. 完整悬赏草稿中新建分类 | Tasks tests + 两个 viewport public UI |
| 2. 单一可选 mapping payload | Tasks + MySQL |
| 3. null | Tasks + MySQL + UI metadata edit |
| 4. custom dimension key | Tasks + MySQL + UI |
| 5. renamed dimension | Tasks + UI 当前配置名称断言 |
| 6. disabled/foreign mapping rejection | MySQL HTTP + 无插入 SQL |
| 7. saved visible/selected | Tasks + UI + Task FK SQL |
| 8. success notice | Tasks + UI notice/focus |
| 9. failure/retry drafts | Tasks |
| 10. POST success/read failure | Tasks，GET retry 且 POST 不增加 |
| 11. reopen/cancel identity | Tasks + UI |
| 12. hidden fields preserved | Tasks payload + MySQL + UI edit 后 SQL |
| 13. invalid HEX | Tasks + UI 无保存断言 |
| 14. swatch keyboard/aria | Tasks + UI 实际 Space |
| 15. Escape secondary only | Tasks + UI |
| 16. return focus/Tab/Shift+Tab | Tasks + UI |
| 17. Enter never publishes Task | 独立 form test + UI 实际 Enter + 发布前 SQL count=0 |
| 18. notice/confirm/reward focus | Feedback 三种 popup regression |
| 19. auth switch/late response | Tasks deferred response/cache isolation |
| 20. Publish/Publish & Claim ID | Tasks 两种 payload + MySQL + 两种 public UI |

所有执行命令成功结束：

```sh
npm run test -w apps/web -- src/features/categories/index.test.tsx \
  src/features/tasks/create-category.test.tsx src/features/tasks/index.test.tsx \
  src/features/growth/index.test.tsx src/app/feedback.test.tsx \
  src/app/shell/index.test.tsx src/features/settings/index.test.tsx
npm run test -w apps/web
npm run typecheck
npm run lint
npm run build
node /Users/lijingru/.codex/skills/engineering-architecture/scripts/architecture-check.mjs --root .
git diff --check
```

API/Web typecheck、lint、production build 全部 PASS。i18n：missing=0、untranslated English=0、visible Chinese=0。构建仅有工具链的现有非失败提示。

## BROWSER ACCEPTANCE

**PASS：1440×1000 desktop；375×812 mobile。** 永久脚本：`scripts/bounty-category-browser-evidence.mjs`。新建隔离用户、专用 API 3015、production Vite preview 5185、独立 headless Chrome profile/CDP 9335，实际 public UI 操作经真实 API 保存；直接 API 仅准备维度/project fixtures，SQL仅检查结果及准备隐藏字段 fixture。

浏览器断言明确设置并验证 CSS viewport。两种尺寸均完成完整草稿→新增分类→成功提示→自动选择→重开/取消→编辑映射→发布流程。desktop 使用 Publish，mobile 使用 Publish & Claim。真实键盘 Space/Enter/Escape/Tab/Shift+Tab 验证表单和焦点，分类 Enter 后 Task count=0。

| 布局 | Desktop | Mobile |
| --- | --- | --- |
| Category panel | x=460…980，y=162.83…837.17 | x=16…359，y=16…796 |
| 宽度 | 520px | 343px |
| Tasks portal / active dialog | 1 / 1 | 1 / 1 |
| Parent inert / 独立 form | true / true | true / true |
| Close header visible / footer inside viewport | true / true | true / true |
| Page scrollWidth | 1440 | 375 |
| 移动控件高度 | — | 44px |

最终截图已目视检查。截图和结构化断言：

- [Browser evidence](./WB-PRODUCT-CLOSURE-02-BOUNTY-CATEGORY-browser.json)
- [Desktop editor](./WB-PRODUCT-CLOSURE-02-BOUNTY-CATEGORY-editor-1440.png)
- [Desktop selected draft](./WB-PRODUCT-CLOSURE-02-BOUNTY-CATEGORY-selected-1440.png)
- [375px editor](./WB-PRODUCT-CLOSURE-02-BOUNTY-CATEGORY-editor-375.png)
- [375px selected draft](./WB-PRODUCT-CLOSURE-02-BOUNTY-CATEGORY-selected-375.png)
- [Cleanup](./WB-PRODUCT-CLOSURE-02-BOUNTY-CATEGORY-cleanup.json)

隔离 browser database 已删除；各 integration suite 自建 database 已删除，最终仅余 MySQL 四个系统 schema。临时 MySQL/API/Web/Chrome 均停止，33307/3015/5185/9335 全部关闭；临时 datadir/profile 删除，验证日志保留。

## ARCHITECTURE CONFORMANCE

**PASS。** `docs/ARCHITECTURE.md` 仅新增本次已经形成的 durable contracts：共享 Categories editor/quick manager、Growth configured selection、Tasks 本地单面板与保存身份、ApplicationFeedback focus。

没有生产 API/schema/migration 变更，没有跨 feature 私有导入、第二分类 owner、全局草稿/通知 store、通用 modal manager、multi-dimensional mapping 或 Project Quick Manager。已有 legacy Categories/Ability UI 未扩展为新模式。

架构 checker 输出 0 errors / 0 warnings；其运行使用 defaults，未假装具有仓库专属全覆盖规则。Web architecture test 另外保护 Tasks 无分类 POST/PUT及无 Categories/Growth private import。人工复核确认入口仍组合，草稿随 editor owner，共享代码只服务已存在的 Settings/Tasks 两个消费者，原大型入口未新增相关业务实现。

对任务开始时 72 个 dirty/untracked 文件做 SHA-256 基线；只有本次明确涉及的八个既有 dirty 文件被增量编辑，其他原有文件 hash 全部保持。未 reset、提交或覆盖前序工作。

## REMAINING BLOCKERS

**NONE。** 所需验证均实际执行并通过，无 `VERIFICATION_INCOMPLETE`。

现有并发维度停用竞态、Project Quick Manager 及其他切片不属于本次授权范围。
