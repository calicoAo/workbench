# PRODUCT-CLOSURE-02 / BOUNTY-PROJECT-QUICK-MANAGER

## RESULT

**PASS — BOUNTY-PROJECT-QUICK-MANAGER COMPLETE**

2026-10-12。实施批准的 BOUNTY-CREATION-CLOSURE Slice 2。基线 HEAD `ef8eb8796b6093c43bc37c7c2ddc08b3d0d44a87`。创建悬赏时可选择、创建、编辑合格项目；创建后解析规范身份、自动选中，保留完整悬赏草稿。实现、真实 MySQL、桌面及 375 CSS px 浏览器验证均完成。

本次没有生产 API/schema/migration 变更。Category Quick Manager 及其他关闭切片没有重开。任务开始时备份的 98 个 dirty/untracked 文件中，仅六个本次重叠文件增量修改，其余 hash 保持；见 [workspace preservation](./WB-PRODUCT-CLOSURE-02-BOUNTY-PROJECT-workspace-preservation.json)。

## PROJECT OWNER BEFORE / AFTER

之前 Projects 私有 ProjectEditor 只供完整页面；Tasks 仅有项目选择器，选项来自组合输入，不能在悬赏创建期间维护项目。原编辑器每次提交所有 metadata，且草稿随外部实体变化重置。

现在 Projects 保留唯一 editor owner，并分出私有 `editor.tsx`、`queries.ts`、`quick-manager.tsx`。完整 Projects 页面、详情页与嵌入式快速管理器共用同一编辑器、校验、写入、冲突恢复和查询提交。Tasks 不持有项目编辑草稿、不请求 Project POST/PUT、不导入私有模块。AppShell 无本切片修改。

| Owner | 责任 |
| --- | --- |
| Projects | 项目草稿、校验、POST/PUT、expectedVersion、pending/error/retry、保存身份、规范详情解析、用户范围缓存 |
| Tasks | 悬赏草稿、selected projectId、bounty/category/project 面板意图、公开能力组合 |
| ApplicationFeedback | notice、焦点与 Escape 生命周期 |
| AppShell | 既有认证/日期/路由组合 |

## PUBLIC QUICK MANAGER CONTRACT

`features/projects/index.tsx` 公开 `ProjectQuickManager`、`ProjectRefreshStatus`、`useProjects`、`isAssignableProject` 及规范项目类型。`ProjectQuickManager` 接收 authenticated request/userId 和 onPending/onClose/onError/onSelect/onSaved 回调；选择和保存只返回已解析的 Project identity/snapshot，保存额外区分 created。

私有 editor/query 实现不向 Tasks 暴露。没有通用 CRUD 框架、全局 store、第二份长期项目列表或 modal stack。

## CREATE / EDIT FLOW

创建：悬赏草稿 → 项目面板 → Projects POST → canonical `{id,version,status}` receipt → GET detail → 更新 Projects query → 回传实体 → Tasks 选择 ID → 返回原草稿 → 成功 notice。

名称必填，说明/日期/笔记可选；复用原 editor 的优先级及日期字段，保持单列。开始/目标日期倒置会阻止保存。快速管理不包含 archive/restore/status 命令。

编辑：从选定项目初始化一次草稿，仅提交相对初始快照改变的 metadata + expectedVersion。未更改的 notes/dates/priority 等字段不清空。编辑 B 不替换悬赏原选 A；“使用”是独立选择意图。无修改保存直接返回，不产生 PUT 或错误成功提示。

浏览器验证发现并修复了无修改保存的 pending 顺序缺陷：应先判断 no-op，再锁定 pending，否则父面板的 pending guard 会阻止返回。新增永久回归确认随后仍可重新创建。

## PROJECT ELIGIBILITY

`active` API view 表示非归档，仍可能包括 DONE。Projects 公开 predicate 在选择面上另行排除 DONE；API 继续强制同一用户、非归档和可关联状态。

已选项目变得不可用时，保留原 ID 的明确不可用选项，阻止 Task 请求；用户可选择其他项目或 Inbox、重新打开项目管理。服务器仍是最终验证边界，不增加新的生命周期语义。

## IDENTITY RETURN AND QUERY REFRESH

POST receipt 不被当作完整项目。成功 receipt 的 ID 保存在 Projects editor；后续 GET 失败显示“项目已保存，详情尚未加载成功”与 Project #ID，并提供“重试读取项目”。保存按钮锁定，重试只 GET，原悬赏选择不提前变化。

解析出的 detail 写入 `['project', userId, id]`，按 ID 合并对应 `['projects', userId, view]` 快照，再仅 invalidate 当前用户的项目列表及该 detail。另一个用户的缓存不变。列表读取错误有明确刷新动作；不 clear QueryClient，不依赖 AppShell 广泛刷新才能选中。

网络/5xx 造成写入结果未知时提示先核实再重试；不按名称猜身份，不新增幂等 API。已确认 receipt 的读取恢复和未确认写入错误分开。

## BOUNTY DRAFT PRESERVATION

父表单保持 mounted、隐藏且 inert。项目新建/编辑/取消/失败/提示/重开均保留 title、details、category、selected project、priority、difficulty、estimated duration、progress、deadline 日期及时间。

取消只丢弃本次未保存项目草稿；重新打开为新 create intent，选择编辑时按项目 ID 重建 editor。主悬赏的既有关闭/重开与成功重置规则保留。已保存项目不随悬赏取消或发布失败删除。

每次 await 后在写缓存/调用父回调前验证 editor 活跃性与 userId；认证切换、卸载、晚到响应不能回写另一个用户或失效 intent。pending ref 同步阻止重复保存和关闭。

## VERSION CONFLICT HANDLING

PUT 409 保留用户草稿，禁用旧版本保存并明确提示。“读取最新项目版本”只 GET，并展示最新服务器 metadata/version；保持用户草稿，更新 expectedVersion，等待用户核对后再次保存。不自动重发旧 payload，不绕过版本检查，不覆盖未编辑字段。

永久 Web 测试确认 expectedVersion 从 4 显式更新到 5，真实 MySQL 确认 stale version 409 且服务器值未覆盖。

## DIALOG / FOCUS SEMANTICS

复用 Tasks 一个 ModalPortal/backdrop，活动面板为 `bounty | category | project`。Project form 与 Bounty form 同级、独立，不另建 portal。Tab/Shift+Tab 限制在活动面板，Escape 只取消第二面板；pending 防关闭和重复 Enter。Project Enter 不发布 Task。

保存返回父表单，再显示 ApplicationFeedback notice。反馈活动时保持既有焦点所有权；关闭 notice 后恢复项目启动按钮。取消也恢复该按钮。项目顶部可访问关闭控件、滚动高度、安全底边均局限在 Projects quick-manager 样式；375px 控件高 44px。

## TASK PUBLISHING ASSOCIATION

“发布”与“发布并接取”提交真实解析的 projectId。两者保持原 Task 命令及 assignment 规则。任务发布失败保留草稿和已保存 Project，可仅重试 Task。Project 创建与 Task 发布仍是独立事务。

Project detail → 发布所属悬赏的原 options.projectId 路径保留；浏览器实际从详情页启动并断言预选 ID。

## REAL MYSQL TESTS

**PASS：11 tests，0 failed，0 skipped。** 新增 `apps/api/tests/bounty-project-quick-manager.test.ts` 三个测试，与现有 `r2a-projects.test.ts` 八个测试联合执行。API test source typecheck 通过。

```sh
cd apps/api
TZ=UTC ../../node_modules/.bin/tsc -p tsconfig.test.json --noEmit
TEST_DATABASE_URL=mysql://root@127.0.0.1:33307/workbench_bounty_project_browser_test \
  TZ=UTC ../../node_modules/.bin/tsx --test --test-concurrency=1 \
  tests/bounty-project-quick-manager.test.ts tests/r2a-projects.test.ts
```

新增测试自建 disposable `_test` schema，全量应用 42 migrations 至 V41，结束删除。公共 authenticated API + SQL 覆盖 canonical receipt、两种发布 FK/assignment、完整草稿字段、metadata patch 保留 notes/dates、409 stale version、外用户编辑/关联拒绝、归档/DONE 关联拒绝、active view 含 DONE，以及失败 Task 不回滚已保存 Project。

按仓库既有 native MySQL 8.0.25_1 QA 方式启动临时实例，仅绑定 loopback 33307；此前探测 3306/3307/3407/3408/33307。使用隔离 API 3015、Web 5185、Chrome/CDP 9335；未操作长期开发/生产数据库。

## WEB TESTS

**PASS：focused 8 files / 107 tests；full Web 35 files / 328 tests。**

新增 `tasks/create-project.test.tsx` 14 个测试，强化完整 Projects create/edit 测试、Tasks 请求断言及公开边界架构测试。聚焦执行包括 Tasks、Projects、Categories、Growth、ApplicationFeedback、AppShell。

| 用户要求 | 永久证据 |
| --- | --- |
| 1–4. 完整草稿、自动选择、发布/发布并接取 ID | Tasks parameterized tests + MySQL + 两个 CSS viewport |
| 5. POST 失败保留双方草稿 | Tasks 明确重试测试 |
| 6. POST 成功/read 失败不重复创建 | Tasks ID 保留、未提前选择、GET retry、POST count=1 |
| 7–9. 隐藏字段、409、编辑其他项目不替换选择 | Tasks patch/version tests + MySQL + UI 编辑 |
| 10. DONE/归档不选 | Tasks options/invalidation test + MySQL HTTP + UI |
| 11–14. 取消/焦点/键盘/重开身份/pending | Tasks tests + 浏览器 Escape/Tab/Shift+Tab/重复 Enter |
| 15. auth switch/晚到响应 | Tasks deferred POST/GET + 缓存/提示隔离 |
| 16. Category Quick Manager | 原 Category suite + 浏览器在同一草稿创建分类 |
| 17. 完整 Projects create/edit | Projects list/detail permanent tests |
| 18. Detail 创建保留 projectId | Tasks options test + actual routed browser flow |
| 19. Task 发布失败不删/重建项目 | Tasks Task-only retry + MySQL preserved entity |
| 额外 no-op 编辑 | Tasks 无 PUT、恢复父焦点、随后创建可用 |

实际通过的验证命令：

```sh
npm run test -w apps/web -- src/features/projects/index.test.tsx \
  src/features/tasks/create-project.test.tsx src/features/tasks/create-category.test.tsx \
  src/features/tasks/index.test.tsx src/features/growth/index.test.tsx \
  src/features/categories/index.test.tsx src/app/feedback.test.tsx src/app/shell/index.test.tsx
npm run test -w apps/web
npm run typecheck
npm run lint
npm run build
node /Users/lijingru/.codex/skills/engineering-architecture/scripts/architecture-check.mjs --root .
git diff --check
```

API/Web typecheck、lint、生产 build PASS。i18n missing=0、untranslated English=0、visible Chinese=0。构建只有现有工具链非失败提示。

## BROWSER ACCEPTANCE

**PASS：1440×1000 desktop；375×812 mobile。** `scripts/bounty-project-browser-evidence.mjs` 使用生产构建、真实公共 UI/API、独立用户与 MySQL。直接 API 只准备 fixtures，SQL只检查最终事实；没有以 API 创建替代 UI 的项目创建。

两种尺寸均完成完整草稿 → 创建分类 → 项目取消/重开 → 创建项目 → 成功反馈/自动选择 → 编辑其他项目保持选中 → 编辑当前项目保留 metadata → 发布 → SQL 检查 Task FK/完整字段。desktop Publish，mobile Publish & Claim。Project POST 通过 200ms 网络延迟与连续真实 Enter 断言仅一次，发布前 Task count=0。

最后一轮已将填写与草稿断言限定活动/父表单，避免“优先级”误命中列表筛选器；SQL 额外检查 priority=3、difficulty=4，网络 payload 断言截止日期时间。该修正仅属于本切片验收脚本，未修改已关闭 Category 切片。

| 结构 | Desktop | Mobile |
| --- | --- | --- |
| Project panel x | 460…980 | 16…359 |
| Project panel y | 174.22…825.78 | 16…758.97 |
| width / page scrollWidth | 520 / 1440 | 343 / 375 |
| single portal / active dialog | 1 / 1 | 1 / 1 |
| parent inert / separate form | true / true | true / true |
| close header/footer within viewport | true / true | true / true |
| mobile action height | — | 44px |

最终截图已目视复核，无水平溢出、固定导航/FAB 覆盖或项目面板裁切。主悬赏既有滚动方式保留。

- [Structured evidence](./WB-PRODUCT-CLOSURE-02-BOUNTY-PROJECT-browser.json)
- [Desktop editor](./WB-PRODUCT-CLOSURE-02-BOUNTY-PROJECT-editor-1440.png)
- [Desktop selected draft](./WB-PRODUCT-CLOSURE-02-BOUNTY-PROJECT-selected-1440.png)
- [375px editor](./WB-PRODUCT-CLOSURE-02-BOUNTY-PROJECT-editor-375.png)
- [375px selected draft](./WB-PRODUCT-CLOSURE-02-BOUNTY-PROJECT-selected-375.png)
- [Isolated environment cleanup](./WB-PRODUCT-CLOSURE-02-BOUNTY-PROJECT-cleanup.json)

## ARCHITECTURE CONFORMANCE

**PASS。** `docs/ARCHITECTURE.md` 记录实际形成的 Projects 公共快速管理能力、唯一编辑器、receipt/detail 区别、查询提交、Tasks active-panel 边界和独立发布事务。

checker 使用默认配置：0 errors / 0 warnings；不声称默认 checker 等价于仓库完整边界规则。Web architecture test 另保护 Tasks 不包含 Project API/private imports，人工复核私有 draft/query/interaction owners。入口仍只组合公开能力。没有新依赖、API、schema、重复 Project CRUD、全局草稿、第二 modal 系统或生命周期重构。

回归风险主要是共享编辑器的完整页面 create/edit、缓存合并、409 恢复，以及三面板焦点与 pending；对应永久单元、真实 DB 和浏览器证据均通过。

## REMAINING BLOCKERS

**NONE。** 所需验证均执行通过，无 VERIFICATION_INCOMPLETE。隔离 QA 数据库、服务、datadir/profile 已清理，日志保留；见 cleanup evidence。未 reset/提交或覆盖前序工作。
