# 文字工作区：Markdown 与默认阅读态

RESULT：PASS。范围是用户确认的整个文字工作区；没有继续执行旧 milestone。

## ROOT_CAUSE

随手记详情和晨写／日记／复盘页面直接挂载编辑表单，查看与编辑没有区分。正文一直保存为文本，但这些消费入口没有 Markdown 渲染。历史归档详情原本是只读纯文本；灵感与 Writing 归档已经通过来源链接打开 QuickNote。

## FIX

- 随手记、晨写、日记、复盘默认显示已保存正文，只有点击编辑才出现表单。随手记的编辑按钮在详情顶部，回收中的记录继续只读。
- 输入保留 Markdown 源文，可切换预览；阅读支持标题、强调、列表、引用、代码、链接、GFM 表格和任务列表。原始 HTML 不执行，危险链接被过滤。
- 成功保存后回到阅读态。返回阅读／关闭编辑保留现有草稿；失败和版本冲突保留输入供重试。未保存草稿不会作为已保存正文展示。
- 随手记引用日记通过既有 Writing draft bridge，再以显式 `edit=1` 意图打开日期对应的编辑器。历史详情的编辑链接也是 canonical 日期／tab 路由，使用现有 Router Link；AppShell 只传递意图。
- 灵感正文继续由 QuickNote 保存；灵感与 Writing 归档的原文入口默认进入 QuickNote 阅读态。历史归档详情使用同一 Markdown 展示能力。
- 复盘已有 `goodPoints` 字段纳入阅读和编辑。旧表单遗漏此字段，既有全量 upsert 会将它清空；现在从原记录初始化并随其他字段保存，真实浏览器检查确认内容保留。API/schema 不变。
- 长代码行和表格局部滚动，文字网格不撑宽页面。手机上的编辑与保存操作已检查固定底部导航和 FAB 遮挡。

## OWNERSHIP / ARCHITECTURE

Quick Notes 保持其版本化编辑、草稿恢复与生命周期 owner；Writing/Reflection 保持 selected-date drafts、保存、AI 与编辑弹窗 owner。它的阅读快照只反映服务器快照或成功保存的确认结果，和未保存编辑草稿具有不同生命周期，不另行持久化。

`shared/markdown` 仅提供渲染与源码／预览交互，由多个独立消费者复用；不拥有领域事实或 mutation。`reading.tsx` 是 Writing 私有展示模块。没有全局 store、通用 modal 框架、API 或数据库变更。`docs/ARCHITECTURE.md` 已记录边界。

既有 Writing 文件超过 cohesion-review 提示阈值，检查后保留共享日期草稿／bridge owner，并将新的阅读展示放进私有模块；不在本任务重构既有 AI 工作流。

## TESTS_RUN

- 全量 Web：37 个文件，389 项通过，包括默认阅读／显式编辑、Markdown 安全渲染、精确源码写入、保存后阅读、失败重试、草稿保留、历史日期／编辑意图、回收只读、项目关联和 `goodPoints` 保留。
- Web typecheck：PASS。
- Web lint/i18n：PASS；缺失翻译 0，英文中文字 0，未国际化可见中文 0。
- Web production build：PASS。仍报告主 chunk 大于 500 kB 的体积警告；未扩展为打包优化任务。
- Architecture checker：0 errors、0 warnings；既有 architecture tests 同时通过。
- `git diff --check`：PASS。
- 真实浏览器／API／MySQL：PASS。独立 MySQL 8.0.25 数据目录和 `_test` 数据库，从 V1 至 V41 共 42 个 migration 文件初始化。公共 UI 创建和编辑 Markdown 随手记，三个 Writing 类型通过公共 UI 写入，并通过 API 确认原文、刷新后阅读态、复盘既有字段、灵感／归档来源链接与英文提示。
- CSS viewport 明确设置并核验 1440×900、375×812；截图记录实际 innerWidth/innerHeight/scrollWidth，长代码和表格未撑宽页面，手机保存按钮在底部导航上方。
- API/schema 未改变；未运行独立 API 集成测试 suite。上述真实浏览器写入使用独立 MySQL 和真实 API，没有 mock 数据持久化。

证据：`WB-WRITING-MARKDOWN-browser.json`、对应截图、`WB-WRITING-MARKDOWN-verification.json`（含实际测试、typecheck、lint、build 输出）、architecture config/result。复用仓库既有隔离 Chrome CDP 验证方式，脚本为 `scripts/writing-markdown-browser-evidence.mjs`。

## REGRESSION_RISK

主要相邻风险是源码在展示时被改写、草稿被当成已保存内容、历史编辑日期错误、复盘字段遗漏，以及手机代码块横向溢出。上述路径均有永久组件测试或真实浏览器证据。原有输入长度、权限、版本冲突、归档／恢复和领域保存契约继续由既有 owner 处理。

## REMAINING_BLOCKERS

NONE。临时数据库已删除，独立 API／Web／MySQL／Chrome 已停止，临时数据目录及浏览器 profile 已移除；见 `WB-WRITING-MARKDOWN-cleanup.json`。

任务开始前已有的 Calendar 重叠错误国际化改动保留；没有重开先前已关闭的产品切片。
