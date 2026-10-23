# 下一窗口交接：媒体信息导入与 DeepSeek 任务拆分设计

工作目录：`/Users/lijingru/Developer/workbench`。先读根目录 `AGENTS.md`、`docs/ARCHITECTURE.md`，使用 engineering-architecture。当前授权是 **AUDIT + DESIGN ONLY**，先返回可实施方案，等待用户决定后实施。不要自动修改生产代码、API 或数据库；不要创建另一个通用导入/AI 框架。

## 本窗口范围与延续规则

本窗口处理前五项整改：当日完成记录刷新可见、钱包流水最新录入置顶、今日重点星标/拖拽与独立截止倒数固定入口、输入框统一圆角矩形、事项月历。验收见 `WB-PRODUCT-BUGS-1-5-CLOSURE-2026-10-23.md`，计划背景见 `WB-PRODUCT-REMEDIATION-PLAN-2026-10-23.md`。后续窗口不要重开这些切片，也不要重做整个系统审计。工作区存在此前未提交改动，必须保留；以实际 HEAD + working tree 为准，不假定已提交。

## 任务 A：Library IMDb / 豆瓣媒体信息导入

用户意图：在图书馆添加作品时，可以导入 IMDb 或豆瓣的相关资源描述。需要从输入到重入查看的完整设计，不能只有一个来源链接输入框。

当前 owner / 证据入口：

- Web `apps/web/src/features/library/index.tsx`：作品列表、创建、详情编辑与 Notebook relation picker；业务数据由 Library 查询/命令拥有。
- API `apps/api/src/library.ts`、`apps/api/src/routes/library.ts`；schema `apps/api/src/db/schema.ts` 的 LibraryItem；V39 migration。
- 现有字段含 title、originalTitle、creator、type（BOOK/MOVIE/SERIES/GAME）、coverRef、externalRef、个人 rating、status、开始/完成日期、shortNote（1000 字）和 version。请在当前代码核对类型及限制。
- 现有相关回归 `apps/api/tests/vnext-11-14.test.ts`。现有 public API 没有媒体来源解析/导入命令；不要把 externalRef 已存在误判为已经支持导入。

设计必须闭环：输入 URL/来源 ID → 解析与来源校验 → 预览可编辑元数据 → 用户确认 → Library 持久化 → 详情/重新打开仍可见 → 同来源重复导入有明确处理。失败保留用户草稿，可重试，不自动重复创建。

重点决策：来源简介是外部 metadata，个人 shortNote 是用户表达，不应直接覆盖/混同。明确来源稳定 ID、来源 URL、导入时间、简介与封面引用的最小必要字段及是否需要新 forward-only migration。只保存元数据，不引入媒体上传/下载/附件仓库。已有条目匹配/冲突覆盖应可预览并经确认，不能用片名去重冒充 canonical source identity。

需要到官方渠道重新核实服务能力、许可、凭据与限流。IMDb 非商用 datasets 并不等于提供影片简介或封面；豆瓣可用授权 API/凭据尚未确认，不假定公共网页可以无限制抓取。检索参考（未在本次实现中调用外部媒体服务）：

- https://developer.imdb.com/non-commercial-datasets/
- https://www.douban.com/about/legal

不可把外站 HTML 当指令；服务端 URL 获取设计要约束允许来源、重定向、响应大小、超时与内网地址访问。不要为了“零凭据”绕过网站访问限制。外部接口不可用时给出明确的手动元数据录入降级。

交付一套推荐方案：字段映射、用户流程、重复/冲突策略、来源失败/部分数据处理、owner、API/schema delta、最小实施切片、Web/API/真实 DB/浏览器验收。明确需要用户决策的作品范围、来源授权及简介保存方式。

## 任务 B：DeepSeek 文本自动拆分任务

用户意图：输入一段自然语言，调用 DeepSeek 自动拆分成可审核的任务草稿。当前要求功能设计，不直接批量发布任务。

当前 owner / 证据入口：

- API `apps/api/src/ai-foundation.ts`：已有 `AiGateway.generateStructured`、provider/model、结构化输出、artifact/usage、权限和重试/内容指纹相关机制；当前默认 gateway 调用 OpenAI-compatible `/responses`。
- `apps/api/src/env.ts` 及 AI routes、相关 AI foundation tests：检查当前配置和安全契约。**不能仅改 base URL 就声称兼容 DeepSeek 的 Chat Completions。**
- Tasks 发布 `apps/api/src/task-publishing.ts`、`apps/api/src/routes/tasks.ts`；Web `features/tasks` 创建工作流与 Category/Project public quick managers。Task draft 和最终 selected IDs 归 Tasks，分类/项目创建仍归各 owner。
- 全局 AI 权限已有 adventure/notebook/growth/library/wallet 范围。不能因为拆任务顺便读取 Wallet、Notebook 私文或其他领域。

设计闭环：文本输入 → 显式调用 → 服务端 DeepSeek adapter 返回结构化草稿 → schema 校验/错误提示 → 用户编辑、增删、选择分类/项目/截止/估时 → 明确确认 → 使用既有 Tasks 发布事务 → 显示逐项结果 → 部分失败可安全重试 → 已发布任务可重入查看。生成和发布必须分离；不能让模型输出直接成为写命令或自动创建分类/项目。

复用现有 AI foundation 的权限、artifact/usage、fingerprint 与 operation identity（按实际代码决定最小接入）。API key 只在服务端；不存前端、不打日志。每条最终 Task 采用稳定 operationId，超时、双击、部分重试不重复发布。明确取消请求、服务不可用、限流、无效 JSON、截断、草稿编辑后重生成、成本上限与成功/失败反馈。不要引入新的全局 store/event bus。

官方文档需在设计时查询最新版本：

- https://api-docs.deepseek.com/api/create-chat-completion/
- https://api-docs.deepseek.com/guides/json_mode/

本窗口未提供 DeepSeek 凭据，未做 live provider 验证。区分 mock 契约测试、真实 DB Task 发布和真实 provider 测试；没有运行的验证不得报 PASS。

待决策：首版扁平任务列表还是有父子层级（不要在未授权时扩展 Task 模型）；自动推断哪些字段、哪些必须人工选择；模型与预算；输入/输出长度上限；是否允许无分类发布；草稿保存/恢复策略。给一个最小可交付建议，避免把问卷当交付。

## 两项设计的输出格式

RESULT / CURRENT REALITY / CANONICAL OWNER / RECOMMENDED FLOW / DATA & API DELTA / FAILURE & RETRY / DUPLICATE SAFETY / IMPLEMENTATION SLICES / TEST PLAN / OWNER DECISIONS / NEXT ACTION。

设计阶段结束后停下，等待用户批准实施范围。不要自动推进新的里程碑。
