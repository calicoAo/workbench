# 媒体导入与 DeepSeek 任务拆分实施记录

## RESULT

已实现批准的首批范围，并完成隔离环境的 API/Web/真实 MySQL/真实 provider/浏览器验收。未部署，未对生产或长期开发数据库执行迁移。游戏 IGDB 因 Twitch 凭据未具备维持 DEFERRED；现有 GAME 手录保留。

批准条件：2026-11-02 用户确认中国部署、个人非商业用途，Open Library 联系邮箱 lijingru300@gmail.com，DeepSeek 测试总预算人民币 8 元。未继续推进附件的“今日回顾”、完成任务写入、父子任务或其他新里程碑。

## CURRENT REALITY

- 从实际 HEAD + working tree 开始；保留已有 `.env.example` 和 `apps/web/src/styles.css` 改动。未提交、未部署。
- 新增 forward-only V43，历史 migration 未改。Library 增加简介/年份和来源表；AI 增加默认关闭的 `allowTasks`、generationContext 和 reasoning token 用量字段。
- 根 `.env` 原有 DS/TMDB key 已在真实请求中验证；未输出密钥。补充独立媒体签名密钥与 Open Library 联系标识，`.gitignore` 覆盖实际 env；示例中只有空 key/占位值。
- 本机代理 DNS 返回 198.18.* 合成地址，被 SSRF 防护拒绝。通过可选 `MEDIA_PUBLIC_DNS=1.1.1.1` 使用公网解析后请求成功，实际 socket 地址仍经过同一校验。没有允许私网/合成地址或绕过网站限制。

## CANONICAL OWNER

Library 管媒体检索、来源解析、预览、确认、解除关联及条目持久化。Tasks 管文本拆分编排、草稿和最终选中实体 ID、逐项发布回执。Projects/Categories 仅增加公开元数据读取及既有 quick manager 的可选初始名称；创建仍由原 owner 处理。AI foundation 保留权限、artifact/usage；DeepSeek 实现现有 structured gateway 契约。App 仅组合显式会话清理，不持有第二份领域草稿。

## RECOMMENDED FLOW（已实现）

- Library → 导入资料：关键词候选或 URL/ID/ISBN → 服务端解析 → 可编辑预览 → 确认 → 作品详情。刷新可恢复导入草稿。手录入口也可填写年份与简介；详情可关联现有条目、预览来源更新、解除来源关联。简介与个人短评独立。来源正文按纯文本处理；封面失败显示占位。
- TMDB 区分电影/整部剧集，动画为结果标注；中文简介缺失时尝试英文回退并标注语言。导演/created_by/制作公司回退按方案执行。页面提供官方 logo、归属声明和来源链接。
- Open Library 将 ISBN/edition 解析到 canonical work，支持 HTTP 和 work JSON 合并重定向，edition/ISBN 为来源属性；作品简介、首位作者、封面和最早出版年按可用数据预览。
- 悬赏板 → 发布悬赏 → AI 整理任务：原文 → 显式生成 → 编辑/增删/选中草稿 → 核对日期用时证据 → 确认发布。分类/项目可推荐现有或新建；新建建议先查完整 owner 目录，不因 prompt 上下文截断而静默新建。
- 超过 50 个项目或分类时要求选择参考范围；不静默截断。超过 20 个候选提示剩余原文；不自动续费生成。没有日期/时长的文本不赋硬值，建议时长需主动采纳。

## DATA & API DELTA

接口契约更新于 `docs/openapi.yaml`；持久边界更新于 `docs/ARCHITECTURE.md`。

- `GET /api/library/import/search`
- `POST /api/library/import/resolve`
- `POST /api/library/import/confirm`
- `GET /api/library/import/operations/:operationId`
- `DELETE /api/library/items/:id/sources/:sourceId`
- `GET /api/tasks/split/context`、`GET /api/tasks/split/name-check`
- `POST /api/tasks/split/preview`、`GET /api/tasks/split/preview/:operationId`
- `GET /api/tasks/split/publish-status/:operationId`

发布复用既有 `POST /api/tasks`，同时提交稳定 operationId 与 recordTimezone，不携带 acceptDate/plannedDate。列表不返回长简介与来源快照；详情返回展示字段和来源归属。Nginx 对媒体搜索关闭 query access log，其他现有代理行为保留。

## FAILURE & RETRY / DUPLICATE SAFETY

- HMAC 预览 10 分钟；confirm 不信任客户端来源 ID/URL/封面，编辑字段严格白名单。已提交同一命令在校验预览过期前重放回执；未提交的过期预览保留编辑并要求重新解析。
- 来源唯一键和同一用户锁保证并发相同来源一条目、一来源。跨条目冲突明确返回；没有片名 canonical 去重、自动合并或 Notebook 迁移。三方比较保留用户改过的字段，快照只推进到归一化来源值。
- DeepSeek 每次只发一次 provider 请求，不对 429/网络错误自动付费重试。claim 先提交再请求；同 operationId 同内容查询/重放，改内容冲突。30 秒请求超时，60 秒后 pending 读出 FAILED_UNKNOWN；GET 不清理写库，下一次显式 POST 清理放弃的 claim。
- 生成未到达服务端时，可显式重试原操作 ID；结果未知时先查询，再明确确认新的计费生成。API key 仅服务端。
- 发布前持久化逐项 operationId 与冻结参数。实际写入后响应丢失、部分完成、刷新重入通过窄回执 GET 恢复，重试不重复创建。明确的验证/权限/实体不可用失败可编辑后再发布。
- 本地草稿按用户隔离，每次编辑及调用前保存，存储失败阻止后续调用；检测跨 tab revision 冲突。认证过期保留草稿；显式退出/换账号清除。未挂载的异步结果不写前用户草稿。

## TEST PLAN / TESTS RUN

| 验证 | 实际结果 |
|---|---|
| 真实 MySQL 全量回归 | 235/235 PASS（含 9 个本次新增聚合场景） |
| 当前媒体/任务拆分 + VNext focused | 9/9 PASS；真实 DB 新建/升级、并发导入、用户隔离、过期回执、三方保留、解除来源、生成并发/过期、发布回放、上下文上限、配额、adapter 协议与来源归一化 |
| Web 全量 | 423/423 PASS，42 个测试文件；含导入响应丢失、草稿恢复、跨窗口冲突、认证过期保留 |
| typecheck / lint | PASS，i18n 无遗漏/裸露中文 |
| build | PASS；已有主 bundle 大小提示，未扩大为打包重构 |
| OpenAPI YAML / diff whitespace | Ruby YAML 解析 165 paths；`git diff --check` PASS |
| 真 provider 质量回归 | 25 份代表样例 × 3 + 附件原文 1 份 × 3 = 78 次；另 1 次真实浏览器生成 |
| 真 provider smoke | completed 响应成功解析、input/output usage 字段可读、reasoningTokens=0；79 次均成功，观察到 schema 形状通过；不据此断言参数永不会被静默忽略 |
| 浏览器真实端到端 | TMDB 搜索/解析/编辑/刷新/确认/详情重开；OL ISBN→work；DS 生成/编辑/刷新/查询不覆盖编辑；真实发布响应丢失+部分成功+刷新恢复；PASS |
| 视口 | 实际 CSS 1280×900 与 390×844；移动端无横向溢出，Projects quick manager 复用单一 dialog；PASS |
| 中国部署服务器出口 / 容器启动 | NOT_RUN：本次没有远程部署目标或容器运行时；本机连通不能替代服务器结论 |
| IGDB / Twitch | DEFERRED；未调用 |

78 次质量回归中，编造硬日期/明确用时 0，基于预设关键词的任务覆盖、数量允许偏差、明确时长提取、日期可复核证据检查通过。另人工查看了日期回退、否定/不确定表达、注入、20 条上限边界和建议时长范围。样例为 25 份代表输入加附件中 1 份真实输入，不能冒称已有 26 份用户长期真实记录的语料库。完整用户场景质量仍需日后使用反馈。

按 2026-11-02 官方高峰价（未计缓存折扣）保守核算，本次 79 次真实 provider 请求总计不超过 **0.257916 元**，低于 8 元。测试脚本每次调用前预留 0.14 元覆盖最大请求/输出，在途或失败请求不释放未知成本；没有自动付费重试。公开证据只含用量摘要，无 key/token。

## 两轮自查

1. 信任与持久化：核对签名字段、纯文本、唯一约束、用户隔离、已提交过期回放、三方快照、生成 claim 与 Tasks 事务。补正来源关联时类型修改限制、Open Library JSON 合并重定向及重复名称/配额回归。
2. 交互与恢复：核对刷新、跨 tab、会话边界、失联、终止等待、部分发布与重入。补正状态查询不覆盖编辑、404 原生成操作重试、过期媒体预览保留、确定失败后的重新编辑、失败封面在新 URL 下重试。浏览器实跑确认。

## OWNER DECISIONS / NEXT ACTION

批准的产品决策已落实；没有新的实施范围审批问题。下一步如需上线，使用既有发布流程在目标服务器执行 V43，并将实际使用的服务端 env 同步到 `deploy/.env`（Compose 使用该文件，根 `.env` 不自动等价于部署配置）。至少含 DS/TMDB 凭据、DeepSeek model/base URL、媒体签名密钥、OL User-Agent；`MEDIA_PUBLIC_DNS` 仅在目标出口确需时配置。上线前从目标服务器验证 API 和封面 CDN 可达性。当前不自动部署，不启动下一里程碑。实际官方地址为 DeepSeek `https://api.deepseek.com/responses`（env base 不含 `/responses`），TMDB `https://api.themoviedb.org/3`，Open Library `https://openlibrary.org`；封面来源为 `image.tmdb.org` 与 `covers.openlibrary.org`。

环境：任务专用 MySQL 8.0.25 / 127.0.0.1:33307；独立 API 3000、Web 5188、Chrome 9338。验收后删除本次 QA 数据库并停止本次临时进程；原开发环境保留。证据位于同目录 `WB-MEDIA-IMPORT-DEEPSEEK-evidence/`。

官方依据（核查于 2026-11-02）：[DeepSeek Responses](https://api-docs.deepseek.com/zh-cn/api/create-response/)、[DeepSeek 价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)、[TMDB FAQ](https://developer.themoviedb.org/docs/faq)、[TMDB 标识](https://developer.themoviedb.org/docs/logos-and-attribution)、[Open Library APIs](https://openlibrary.org/developers/api)。
