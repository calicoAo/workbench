# Personal Workbench 媒体导入与 DeepSeek 任务拆分实施方案

状态：**已于 2026-11-02 获批准并实施首批范围**。实际验收见 [实施记录](WB-MEDIA-IMPORT-DEEPSEEK-CLOSURE-2026-11-02.md)。

以下主体保留为 2026-10-26 冻结设计基线，其中“当前代码/NOT_RUN/待批准”描述的是设计时点；不覆盖实施记录中的最新事实。

本方案承接前五项产品整改闭环，不重开已验收切片，设计阶段不修改生产代码、API、数据库或部署配置。范围为影视、图书、游戏和动画媒体导入，以及 DeepSeek 文本拆分为可审核任务草稿。动画首版沿用现有 Library 的 `MOVIE` / `SERIES` 类型：TMDB 的动画电影或动画剧集按来源类型导入，并在预览中标注动画；不新增 `ANIME` Library 类型。

## RESULT

推荐保留两条独立主流程，并按可验收的端到端垂直切片逐步实施：

1. **媒体导入**：TMDB（电影、剧集、动画影视）、Open Library（图书）、IGDB（游戏，当前因 Twitch 凭据暂时不可申请而门控）。统一输入 URL、来源 ID、ISBN 或搜索词，服务端解析官方 API，返回可编辑预览；用户确认后才写入 Library。保存稳定来源身份、来源 URL、导入时间、简介和封面引用，个人 `shortNote` 永不被外部简介覆盖。
2. **任务拆分**：DeepSeek Responses API，默认模型从 env 读取 `deepseek-flash`。输入自然语言和经过筛选的现有项目/分类上下文，生成最多 20 条结构化草稿。优先级、难度、分类、项目均为可编辑建议；没有合适匹配时返回“建议新建分类/项目”，服务端先做同名检查，再由用户进入现有 owner 的快速管理器确认创建后回填 ID。生成、编辑和发布严格分离。

环境模板和本地 `.env` 已存在；2026-10-26 仅检查变量是否非空，`DEEPSEEK_API_KEY`、`TMDB_API_READ_ACCESS_TOKEN` 均已设置，`.env` 被 Git 忽略，未输出密钥值。非空不等于凭据有效或服务已接通。运行时尚未接线；真实 provider、数据库和浏览器验收均为 `NOT_RUN`。本次只修改本设计文档，保留 `.env.example` 和 `apps/web/src/styles.css` 的原有工作树改动。

候选调研记录包括 Trakt、AniList、TVmaze 和 Jikan/MAL 代理。Trakt 图片要求缓存、禁止直链，与本次“只保存封面引用”不符，故不进入首版；其他候选的覆盖、凭据和许可本轮不视为已完成验证。首版用 TMDB 的动画电影/剧集结果标注覆盖动画。免费 API 不等于开源或无条件图片授权。

## CURRENT REALITY

- Library owner 是 `apps/web/src/features/library/index.tsx`；API owner 是 `apps/api/src/library.ts`、`apps/api/src/routes/library.ts`，模型在 `apps/api/src/db/schema.ts`，当前迁移头为 V42。
- 当前 Library 字段只有 `title`、`originalTitle`、`creator`、`type`（`BOOK/MOVIE/SERIES/GAME`）、`coverRef`、`externalRef`、个人评分、状态、日期、`shortNote` 和 `version`。实际限制为标题/原题名 200、creator 160、coverRef/externalRef 500、shortNote 1000 字符，rating 为 1–5。现有 `externalRef` 只是普通字段，不代表已支持来源解析或重复保护。
- 任务发布的权威路径是 `apps/api/src/task-publishing.ts` 与 `/api/tasks`；`runMutation` 已提供 `(userId, operationId)` 收据和相同请求重放。分类和项目创建分别由 Categories / Projects quick manager 负责，不能由 AI 直接创建。
- `apps/api/src/ai-foundation.ts` 当前为 OpenAI-compatible `/responses`，DeepSeek 需要独立 provider 配置和 Responses 行为校验。现有 `generateMorningWritingInsight` 只实现 Writing flow；它会把非成功 artifact 重置为 PENDING，不能直接拿来保证拆任务的单次付费 claim 或并发安全。
- V41 的 `ai_artifacts.status` CHECK 只接受 `PENDING/SUCCEEDED/FAILED`，没有 `FAILED_UNKNOWN` 或 reasoning-token 列；本方案不添加第四个数据库状态，用 `FAILED + errorCode=GENERATION_RESULT_UNKNOWN` 对外表示结果未知。
- 现有 `publishTask` 仅在 `/api/tasks` 同时收到 `operationId + recordTimezone` 时进入 receipt 事务；`dueAt` HTTP 格式为本地 `YYYY-MM-DDTHH:mm`，由 API 按 `recordTimezone` 转 UTC。Task 已有 `sortOrder`，首版只是不给拆分草稿另增排序交互。
- `docs/ARCHITECTURE.md` 要求 GET 查询无业务写入；现有 AI settings 的惰性初始化不作为新 GET 的范式。env.ts/部署 Compose 尚未消费新增 provider 配置，仅在根 `.env` 填 key 不会自动完成运行时注入。

## CANONICAL OWNER

**媒体**：Library 拥有导入预览状态、导入命令、来源记录和 LibraryItem 的外部元数据。Provider adapter 只负责来源校验、请求、字段标准化和许可/限流错误，不拥有 Library 写入。Web 只消费 Library 的 public surface，不直接访问 provider。

**任务**：Tasks 拥有拆分草稿、候选项、选择状态、逐项稳定 `operationId` 和发布结果。AI foundation 只拥有 provider、权限、artifact/usage、fingerprint 和重试契约。Categories / Projects 拥有现有对象列表及创建/编辑；“建议新建”只能携带预填名称和说明，不得绕过 owner 写入。

**草稿恢复**：Tasks feature 拥有本地版本化草稿，Library 拥有自己的导入草稿；各自局部持久化，不抽通用草稿平台。首版使用按用户和草稿 ID 隔离的 `localStorage`，刷新时校验并恢复；不新增全局 store/event bus，不承诺跨设备同步。AI artifact 是一次生成结果，不能成为 Task 发布结果的第二份真值。

## RECOMMENDED FLOW

### 媒体导入

1. Library 的添加入口先选择媒体范围：影视/动画、图书或游戏；接受搜索词、官方 URL、来源 ID，图书额外接受 ISBN。
2. API 拆成 `GET search`（关键词候选、短缓存）与 `POST resolve`（来源 URL/ID/ISBN 详情与签名预览）；搜索词不写入访问日志。IMDb tt ID 只作 TMDB find 的入口，仅接受 movie/tv；其他类型明确拒绝。当前无已确认可用的豆瓣授权 API，豆瓣 URL 显示暂不支持并提供手工录入，不抓 IMDb/Douban HTML。各 provider 执行格式、超时、重定向、响应大小、内容类型和内网访问防护。
3. 服务端返回标准化预览：标题、原题名、创作者、来源类型、年份、纯文本简介、封面引用、稳定来源 ID、服务端生成的 canonical URL、字段来源和缺失提示。简介是外部 metadata；`shortNote` 保留为空或现有用户表达。TMDB 简体中文简介为空时回退英文，并如实记录 `language`。
4. 用户可编辑标题、原题名、简介、年份、创作者，选择“新建”“关联已有手录条目”“刷新本条来源”或取消。`coverReference`、`stableSourceId`、`canonicalUrl`、provider 和 entity type 只能来自服务端短 TTL 签名 token。首版每个 LibraryItem 最多关联一个来源；同来源命中返回已有条目，禁止创建第二条；跨 provider 官方映射或片名相似仅作提示，不能自动合并两条 LibraryItem、迁移 Notebook relations 或移动已有 source。换源先显式解除旧关联，再关联新来源。
5. 确认命令用稳定 import operation identity 写入 LibraryItem 与来源记录；详情页查询同一记录，关闭再打开仍显示简介、年份、来源、封面引用和导入时间。
6. 同来源再次导入展示“已导入”及现有条目，允许刷新外部字段预览或取消。错误导入通过“解除来源关联”命令回到无来源关联状态；只删除 source 关联，保留条目和当前展示字段，并事先说明这不是删除作品或撤销导入字段。首版不增加 Library 删除语义。三方比较以 source 上次归一化值 B、当前 Library 值 C、新来源值 N 为准：C=B 才默认采纳 N；C≠B 保留用户值；来源缺失不默认清空已有值；用户逐字段确认。每次成功确认后 snapshot 推进到 N，而不是推进到用户编辑值；不覆盖 `shortNote`。

### DeepSeek 任务拆分

1. 用户在 Tasks 输入最多 5,000 字，自主点击“生成草稿”；刷新不会自动发起请求。
2. 服务端在任务 AI 权限开启后，选择当前用户可见且可分配的项目（ID、名称、状态、短描述）和分类（ID、名称、维度元数据）作为上下文，禁止读取 Wallet、Notebook 私文或其他领域。
3. DeepSeek Responses `/responses` 使用 env 中的 `deepseek-flash`、JSON Schema、`stream:false`、默认 `reasoning.effort=none`。由于 provider 可能静默忽略不支持参数，真实 smoke 必须核验 status、usage、reasoning tokens 和结构化 JSON 行为；返回前服务端执行 JSON、长度、枚举、ID 所属关系和日期语义校验。
4. promptVersion 绑定现有 priority `1=低、2=中、3=高` 和 difficulty `1=轻松、2=普通、3=困难、4=硬仗`；优先级按显式紧迫性/阻塞影响推荐，难度分别对应熟悉单步、已知多步、重要未知/依赖、高不确定需分解验证，不把时长直接当难度。无证据默认中优先级/普通难度，均为建议。每项含标题/描述、匹配或新建建议、dateCandidate、estimatedMinutes、可选 suggestedEstimatedMinutes、独立日期/时长证据。证据须为原文子串，并校验任务归属、否定语义、明确单位/数值及日期转换；失败仅移除对应正式字段、保留待确认原文。未提及日期不推荐硬截止，建议时长单独标注。
5. 用户可编辑、增删、选择分类/项目、采纳建议时长/日期；首版不提供草稿排序。schema 为 `{candidates:最多20条, hasMore:boolean, unprocessedTextSpans:[]}`；到达上限或有未处理证据时提示可能尚未全部拆出，不声称 hasMore 能保证发现漏项。首版不做自动续拆，用户处理余文用新 generationOperationId。新建前由服务端经各 owner 按完整用户目录核实名称，命中提示已有对象；无匹配才开既有 quick manager 预填并明确保存回填。多个同名建议可选择复用已创建对象，不自动逐条创建。取消创建保留未决建议，发布前明确选择已有对象或本次不分配，不把创建失败静默变成无分类。
6. 确认发布时只调用既有逐项 `/api/tasks` 事务路径，同时提交 `operationId` 和 `recordTimezone`；展示每项成功/失败，失败项可单独重试。已发布项冻结 payload，重开草稿显示 task ID 和详情入口。

### 刷新恢复

保存 `schemaVersion`、`draftId`、用户 ID、输入、业务日期/时区、生成 operation ID、候选编辑值、选择/删除状态、新建建议及解析后的 canonical ID、逐项发布 operation ID、冻结 payload、状态、task ID 和更新时间。每次网络调用前先持久化；刷新后先校验版本和当前用户，再恢复为“可编辑/待确认”，绝不自动生成或发布。成功项不可被重新生成覆盖；重生成只处理未提交项并保留旧草稿直到成功。跨标签页通过 revision/storage event 发现冲突并暂停写入，要求用户选择较新版本。只有用户主动登出或切换账号时清除对应用户草稿；认证过期时保留并锁定草稿，同一用户重新登录后恢复。

身份分开：`draftId` 属于本地草稿；`generationOperationId` 对应唯一 AI artifact；服务端给每个有效候选分配 `candidateId`；每条最终 Task 另有 `publishOperationId`，只在 localStorage 与 `mutation_receipts` 保持相同。artifact 保留 candidateId，不回写成发布账本。编辑已冻结但结果未知的项前，先查询发布状态；结果未确认时不可改 payload 或换 ID 再发。

冻结上下文必须落库：`ai_artifacts` 新增可空 `generationContext` JSON（旧 Writing 记录为 null），保存 draftId、textHash、requestFingerprint、selected IDs、contextFingerprint、provider/model/promptVersion、businessDate/timezone、quotaWindowStart/End UTC、timeoutAt；不含输入原文或目录私文。请求身份对冻结文本 hash/选择 IDs 求 hash；sourceFingerprint 再含完整生成上下文。同 ID 重放先比 requestFingerprint，再使用原上下文，不重取当日/现名来判冲突。此列与 allowTasks/usageReasoningTokens 在切片 5 的新 migration 中一起新增，不改 V41 status CHECK。

恢复细则：随编辑持续保存，不能只在发请求时保存；存储失败/配额满时明确显示尚未保存，阻止新的生成/发布，提供可复制原文与草稿数据。未知 schemaVersion/损坏内容不覆盖，提示复制或手动重置。清理草稿前终止待写回调，主动登出/换账号后旧回调不得写回或进入新用户 UI；认证失效则锁定并隐藏草稿，同用户登录恢复。跨标签 revision 只负责冲突提示，不宣称 localStorage 提供 CAS；防重依靠预先共享的 operationId 与服务端 claim/receipt。

每用户首版保留一个活动拆分草稿，直到用户主动清理或确认开始新草稿；开始新草稿先提示未发布内容。Library 导入草稿也按用户隔离，保存输入、编辑、token、fingerprint、目标/version、importOperationId 和结果。过期 token 先查确认状态，再 resolve；保留用户编辑并重新比较，不自动 confirm。刷新可自动执行无业务副作用的状态 GET；未知结果保持冻结，不直接变成可编辑未发布。

## DATA & API DELTA

### 媒体（预计需要新的 forward-only migration，从实际实施时的当前 head 生成，不能预先假定 V43）

- `library_items` 增加 `releaseYear`（可空 unsigned smallint，允许 1–9999）和独立 `description`（可空 text，纯文本最多 10,000 字符，外部简介的用户可编辑副本）。保留 title/originalTitle/creator/coverRef/externalRef/shortNote 的既有限制。过长来源简介在预览明确标注截取、保留原来源链接，确认后只存展示部分；超长标题/创作者不静默截断，要求用户编辑后确认。`shortNote`、个人 rating/status/日期与 Notebook relations 不随导入覆盖；新建默认 WANT，个人评分/起止日期为空。
- 新增 Library-owned `library_item_sources`：`userId`、`libraryItemId`、`provider`、`entityType`、`stableSourceId`、`canonicalUrl`、`importedAt`、`language`、`attribution`、`metadataUpdatedAt`、`metadataSnapshot`。snapshot 仅存统一版本的 `{title, originalTitle, creator, creatorRole, releaseYear, description, descriptionLanguage, coverRef, isAnimation, editionId?, isbn?}` 归一化字段，不存原始 provider 响应；来源封面不再另设一个可独立编辑的真值，LibraryItem.coverRef 是展示值。`language` 描述来源简介，不声称用户编辑文本仍是该语言。唯一约束 `(userId, provider, entityType, stableSourceId)` 和 `(userId, libraryItemId)`；FK/事务校验 item 与 source 同用户。首次 importedAt 不变，后续确认更新 metadataUpdatedAt。列表在原有卡片字段上只增 releaseYear/hasSource，不带 description/source/snapshot；详情返回展示字段及来源摘要，B/C/N 比较仅由 resolve 返回。来源 URL 与封面只存引用。当前没有 Library 删除命令或 deletedAt，首版不增加删除/软删除。
- 媒体 API 拆为 `GET /api/library/import/search`（返回候选，短缓存、每用户每 provider 限流；搜索词不得进入访问日志）和 `POST /api/library/import/resolve`（按 provider/entityType/stableSourceId 获取详情并签发短时 preview token），以及 `POST /api/library/import/confirm`（只接收签名 token、expectedVersion、operationId 和允许编辑字段）。preview token 使用 `MEDIA_IMPORT_TOKEN_SECRET` HMAC 签名，至少 32 随机字节，过期时间为签发后 10 分钟；载荷包含 userId、fingerprint、provider/entity/source identity、服务端规范化字段和过期时间。不建立 snapshot 表；token 只提供完整性，不提供保密性，因此载荷不得包含用户私密内容。confirm 校验签名、当前 userId、过期时间和 fingerprint，从 token 载荷读取来源 ID、URL、封面和 provider 字段；服务端生成 canonical URL，绝不信任客户端回传。轮换密钥会使未过期 token 失效，用户需重新 resolve。简介转纯文本并限制长度，前端按纯文本渲染。首次执行 token 过期须重新 resolve，已有 receipt 按下面规则重放。提供 `DELETE /api/library/items/:id/sources/:sourceId` 解除来源关联，sourceId 为 Library 本地来源记录 ID，且验证 Library item 与用户归属。公开 OpenAPI 同步更新。
- 统一字段映射：TMDB 电影 `creator=director`（credits/append_to_response），剧集优先 `created_by`，为空时取 production_companies 第一项并标 creatorRole=制作公司，不据公司名臆断是动画工作室；仍为空标记缺失；Open Library `creator=work 的第一作者`，ISBN 先解析 edition 再归一到 `OL...W` work identity，edition/ISBN 作为属性；IGDB `creator=第一开发商`，发行商仅作补充。剧集首版只导入整部剧，不导入季；电影取 release_date 年（来源提供年，不宣称是全球最早公映）；剧集取 first_air_date 年；图书优先 first_publish_year，再取 work 明确首版日期年，最后回退 edition 年并标注版本年份；游戏取 UTC first_release_date 年。IGDB 搜索过滤 DLC、扩展包、合集和重制变体，除非用户明确选择。Open Library work 合并重定向到新 ID 时，先确认新 canonical ID 未被本用户另一条 source 占用，再更新 source identity 和 URL；重定向在 resolve 仅预览，confirm 才按旧/新 ID 与版本更新；新 ID 已被占用时提示已有条目，用户可取消或解除旧关联后转向已有条目，不合并作品或搬迁 relations。
- Provider 配置：TMDB API Read Access Token；Open Library base/covers URL +真实联系邮箱 User-Agent；IGDB base URL + Twitch OAuth URL、Client ID/Secret。Twitch 当前无法申请时，IGDB adapter、env smoke 和游戏来源导入入口保持 disabled/NOT_RUN（既有 GAME 手录/详情继续可用），不阻塞 TMDB/Open Library/DeepSeek 首批切片。TMDB 署名和图片使用规则、Open Library 速率/缓存/封面权利、IGDB Twitch/商业条款必须在实现前记录在 provider adapter 注释和产品归属文案中。
- 动画首版不增 `ANIME` 枚举。TMDB `search/movie` 和 `search/tv` 支持标题 `query`，但不支持 `with_genres`；`discover/movie` 和 `discover/tv` 支持 `with_genres`，但没有文本 `query`。因此首版采用 search，按 `genre_ids` 标注动画；可选“仅看动画”只过滤已取回的当前页，UI 明示这是当前页过滤，不承诺跨页完整动画搜索，不使用 discover 冒充组合搜索。电影映射 `MOVIE`、电视映射 `SERIES`。若未来需要可完整分页的动画关键词搜索，另作产品/接口设计。

媒体命令细化：`resolve` 接受 `{provider, entityType, sourceIdOrInput, targetItemId?}`；只解析用户 URL/ID，不直接获取用户输入 URL。URL 与来源 ID 走 resolve，ISBN 走 ISBN→edition→work；search 只负责关键词候选。confirm body 为 `{previewToken, fingerprint, operationId, mode:create|attach|refresh, targetItemId?, expectedVersion?, edits}`；attach/refresh 必须携带目标 ID/version 且类型兼容；目标、版本也绑定进 token，客户端不能换目标。解除来源关联在 DELETE body 传 `{operationId, expectedVersion}`，与条目 version 递增、source 删除及 receipt 同一事务。解除后不再显示活动来源徽标，保留 metadata 和适用署名（不是删掉内容后免除署名）。

补媒体确认状态纯读 `GET /api/library/import/operations/:operationId`：认证后只返回当前用户允许的 Library 导入/关联/刷新/解绑 receipt 摘要 `{status:committed|not_found,itemId?,outcome?}`，不暴露 requestSnapshot/token。not_found 不证明原请求失败，只可同 ID+冻结请求显式重放，不能换 ID。解绑清除活动来源徽标/自动刷新能力；保留现有字段及提供方要求的内容署名，不把残留外部元数据宣称为原创。

媒体 receipt 与 token 到期顺序：Web 在首个 confirm 前持久化 operationId、fingerprint、mode、目标/version、edits 和 token。先按当前 userId 查已提交同命令 receipt，并比对冻结请求 hash；匹配则直接重放，即使 token 已过期，也不得再创建。无 receipt 的首次执行才校验 HMAC/期限/完整 payload fingerprint，再在短事务中 claim receipt、校验版本、写 item/source。持久化 requestSnapshot 只放规范化命令和 preview fingerprint，不放签名 token/密钥。重新 resolve 导致来源内容或编辑改变时必须展示差异、再确认并换 operationId。新导入/关联/刷新/解绑都在 Library 的短事务遵守 receipt→当前用户行→目标 item/source 的锁顺序，同用户同来源 create 竞争的一方创建、另一方将 existing 结果也写进自己的 receipt，不留孤立 item。数据库唯一约束作最终保护；唯一冲突回滚后重读并在安全事务内确认/记录结果，不把数据库错误直接报给用户。不同目标 attach 冲突返回可恢复 409，不移动已有关联。

缓存与访问边界：search 缓存 5 分钟、resolve 来源元数据缓存 10 分钟（无用户 token、目标 ID、匹配结果）；每次响应在认证后重新计算用户已有匹配并签发用户 token。任何用户草稿/resolve/状态/确认响应 `Cache-Control: private, no-store`，公共缓存只保存 provider 归一化数据。保留 provider 页码；movie/tv 分开分页，不伪造混合总数。search 的 query 在 API、反向代理和错误遥测中脱敏，只记录 path/status/requestId。固定 HTTPS 主机、禁止凭据 URL/非常规端口；每跳验证 host、DNS 和私网/保留 IPv4/IPv6，最多 3 跳，单次请求 10 秒、总 resolve 20 秒、解压后 JSON 最大 2 MiB、preview token 最大 64 KiB；合法 OL 重定向也不得绕过这些限制。

图片引用要在 adapter 归一化时再次验 host/path，不能因为来自 provider 就直接信任任意 URL。TMDB 只从受限 poster_path 和可信配置拼 URL；OL/IGDB 同理。Web `<img>` 使用 `referrerPolicy=no-referrer`、加载失败占位，外链 `noopener noreferrer`；若部署存在 CSP，仅追加必要图片源，不用通配符扩权。本切片不改变已有手录 coverRef API 的任意 URL 语义，但导入入口绝不接受客户端图片覆盖。

### Tasks / DeepSeek

- 新 forward-only migration 增加 `allowTasks`（默认关闭及 0/1 CHECK），更新 AI_DOMAINS、settings GET/PUT、Web 设置和权限文案，授权范围明确包含任务输入及当前用户所选项目/分类的短元数据。禁止读取其他领域正文或调用工具。`ai_artifacts` 增 `usageReasoningTokens` 可空列；继续使用现有 operationId、sourceRefs/sourceVersions、sourceFingerprint、provider/model/promptVersion、usage/cost/status。provider/model/promptVersion/日期/时区/上下文版本必须进入 fingerprint。原文留在 Tasks 本地草稿，artifact 只存输入 hash、所选 source refs/versions、验证后的候选与错误摘要，不存 key、原始 provider 响应或完整 reasoning。对现有 Writing 行为不作顺带改写。

新字段/候选都视为当前用户个人数据，现有 artifact list/usage 仍按本人隔离，不能因跨 feature 查询泄露。输入/目录名称只是数据，不可改 system 指令；不发送 tools，模型不能发布任务或创建分类/项目。用户在 Tasks 输入未来动作时才生成新任务候选；仅已完成事实或无可执行意图可返回空列表。附件 v0.2 的今日回顾、目标层级/继续拆解不进入首版，不能借本次实现增加完成/ActualTime 写操作。
- Tasks-owned `POST /api/tasks/split/preview` 接受 `{operationId, draftId, text, contextSelectionIds?, expectedContextFingerprint?}`；项目/分类说明由服务端经各 owner 读取，禁止客户端注入其他用户的记录。`GET /api/tasks/split/preview/:operationId` 只按 `(userId, operationId, featureKey=TASK_SPLIT)` 查询并返回候选/有效状态/usage；未知或别人的 ID 为 404。POST 重复同 ID 同冻结输入重放，变更返回 409；GET 不初始化 settings、不写 artifact、不调用 provider。候选发布仍走现有 `/api/tasks`，不新增批量写命令。
- DeepSeek adapter 从 DEEPSEEK_BASE_URL 拼一次 `/responses`，模型读取 DEEPSEEK_MODEL，当前为 `deepseek-flash`；固定 `stream:false`、`reasoning.effort=none`、`max_output_tokens=8192`、`text.format={type:json_schema,name,schema}`，不发送 tools、previous_response_id、conversation、background 或自造会话存储参数。按官方字段只读取 `status=completed` 的 assistant message/output_text，不把 reasoning 文本拼进 JSON；拒绝 failed/incomplete/截断/无效 JSON/多余字段。usage 映射 input_tokens、output_tokens、output_tokens_details.reasoning_tokens，未知成本/未提供计数为 null，不能当 0。JSON Schema 约束后仍作 Zod 和领域校验。smoke 核对禁用 reasoning 时计数为 0、schema 是否遵守、JSON Content-Type/status/usage；不能用 mock 推断真实参数生效。
- 日期 prompt 使用请求接收时服务端按用户已保存时区计算的真实业务日期，不使用 UI 正在查看的历史 date；生成上下文的日期/时区与 options fingerprint 一起冻结，午夜或项目更名后 GET/同 ID 重放不重新计算它们。新生成时重新抓上下文并用新 ID。提供证据、归一化日期和解析规则；相对日期歧义保留原文并要求用户补选，不猜“周末”是哪一天。
- 项目/分类建议使用 `{matchId, confidence, reason}` 或 `{suggestNew: true, name, description}`，服务端只接受当前用户选项的 ID。项目/分类创建请求必须由各自 owner 的 quick manager 发出；创建结果不明时先刷新/按名称+owner核实，禁止再次盲目 POST。

上下文边界：最多 50 个可分配项目、50 个启用分类；先用用户选定范围，再按进行中优先、updatedAt 最近、id 排序。名称遵守 owner 限制、每条描述最多 200 字符，序列化 provider 请求体最多 32 KiB。超出即生成前返回 CONTEXT_SELECTION_REQUIRED，由用户缩小范围，不静默截断成无匹配；不发送 Project.notes 或成长统计，仅分类当前维度键/名称。目录由各 owner 的 user-scoped public read 提供。新建建议核名覆盖完整当前用户目录，包括停用/归档的恢复提示，不限于传给 LLM 的 50 项；规则跟随 owner，只给提示，不未经决策新增名称唯一约束。
- 发布请求固定包含 `{operationId:publishOperationId, recordTimezone, title, description, categoryId?, projectId?, priority, difficulty, dueAt?, estimatedMinutes?}`；不发 acceptDate/plannedDate，首版只发布到任务池。dueAt 是 `YYYY-MM-DDTHH:mm` 本地时间，绝不发送 Z/offset 字符串；recordTimezone 使用用户确认且冻结的生成时区，API 负责转 UTC。只有日期的证据保存在草稿的 dateCandidate，提示“补时间或明确本次不设截止”后才发布；estimatedMinutes 只有明确时长或用户主动采纳建议后才进入 payload。title 1–200、description ≤2000、分类/项目选当前有效 ID，沿用 Tasks owner 限制。

claim 原子性：POST 在短事务内锁当前用户行，先查同 operationId，再以相同 featureKey 清理过期 PENDING、检查同用户在途上限及当日配额、插入唯一 artifact，提交后才调用 provider；不持有 DB 锁等待网络。已有 PENDING 返回 202 并使用与 GET 相同的有效超时状态派生，无新付费调用；SUCCEEDED/FAILED 都重放既有结果。同 ID 改 text/context selection 返回 409。result 更新用 `id + status=PENDING + featureKey` 条件更新并要求未超过 timeoutAt，超过有效期的迟到响应不得改成成功或覆盖已终止状态。现有 artifact 唯一键及每用户锁为多实例并发约束，不能复制 Writing 的“重置 PENDING 再调用”逻辑。

结果未知与纯查询：30 秒 provider timeout；GET 对超过 createdAt+60 秒仍 PENDING 的行只派生 `effectiveStatus=FAILED_UNKNOWN`，数据库仍保持 PENDING，不在 GET 写状态。下一次用户显式 POST 才在上述锁内把过期行设 `FAILED/errorCode=GENERATION_RESULT_UNKNOWN` 以释放在途限制（不返还当日次数）；POST 前需明确接受“可能已经计费”，新 operationId 才能重试。已捕获的超时/断线立即落 FAILED+unknown errorCode；正常 provider 失败为 FAILED；FAILED 且 unknown errorCode 同样映射 effectiveStatus=FAILED_UNKNOWN。成功/失败候选只在当前 operation 的终态可读；终态不可因同 ID 重放再次请求 provider。

发布状态补口：新增纯读 `GET /api/tasks/split/publish-status/:publishOperationId`，仅返回当前用户 `PUBLISH_TASK` receipt 的 `{status:committed|not_found, taskId?}`，不暴露 requestSnapshot 或通用 receipt。committed 后通过 Tasks 详情重入；not_found 不证明此前请求失败，可用同 ID+完全相同 frozen payload 显式重放既有 POST，不能换 ID/改内容。任务 title 重复提示首版从现有 Tasks 用户查询规范化精确匹配未完成项，非阻塞、不调 embedding/LLM；同时保留项目/分类 owner 的最终校验。

## FAILURE & RETRY

gateway 最小 delta：AiGateway.generateStructured 输入增加可选 AbortSignal，GatewayResult.usage 增可选 reasoningTokens，未迁移的 Writing caller 不改语义。DeepSeek transport 独立执行 30 秒 timeout、解压后响应 2 MiB 上限，只提取 assistant output_text；不把 reasoning 或其他角色内容拼成 JSON。claim/候选校验留 Tasks，provider 不持有领域写能力。

媒体缺 key、429、超时、格式变化或缺失字段：保留草稿、说明来源和缺失，允许显式重试或手工录入。无简介/封面不阻止确认导入；本地存储失败则先复制保存。封面加载失败用占位图，本次不自动引入图片代理/下载/存储。TMDB 与 Open Library 出口/API 可达性和浏览器图片可达性分别检查，不以本机联网替代部署地域结论。confirm 首次执行校验短 TTL 签名 token；已提交操作按前述 receipt 规则重放，不因 token 到期重复创建。版本冲突保留用户 edits、重新取目标与来源差异后再确认，不盲目覆盖。

DeepSeek 配额建议为 20 次/用户/业务日，输入最多 5,000 Unicode 字符、整个 provider 请求体 32 KiB、输出最多 8,192 tokens、每用户一个 TASK_SPLIT 在途。所有实际 claim（含失败、未知）计次数，同 ID 重放/GET/生成前校验失败不计；配额在同一用户行锁下读取当日 artifact 并插入 claim，日期/时区由服务端确定且落入 generationContext；以服务器计算的业务日 [start,end) UTC 范围统计 TASK_SPLIT.createdAt，忽略客户端传入业务日期，用户改时区也不重算已有操作。次数上限不是人民币硬预算；首版提供次数和 token 上限，价格未知显示未知，金额硬预算和账户可用余额需用户另定；模型价格未验证前不伪造费用估算。

媒体限流首版为每用户 search 20 次/分钟、resolve 10 次/分钟；另设 provider 总出口限制、并发和请求预算，不把每用户限流当作 provider 全站限流。Open Library 未识别应用最多 1 请求/秒，有真实联系标识后最多 3 请求/秒，优先合并搜索/缓存；TMDB 请求预算计入 movie/tv 分页、credits、英文回退和 configuration。先沿用单 API 实例部署的进程内缓存/出口节流；多实例上线前需共享/分摊出口额度，不能直接每实例翻倍。429 遵从 Retry-After，不绕限制。

生成 POST 从不自动重试，包括 429、5xx、断线、超时和 schema 无效。收到有效 provider usage 的失败也保留 usage，不把无 usage 当免费。未知结果先 GET；有效状态 FAILED_UNKNOWN 只表示可能已付费但未得到可用结果，按前述纯 GET/显式 POST 状态机制处理，新 ID 再生成前需用户确认。用户“停止等待”可 AbortController 取消当前浏览器请求，服务端对 provider 做 best-effort abort；不能保证 provider 停算/退款，原 operation 保留可查询、不得自动重发或发布。

局部 schema 错误不发布；未知字段/非法跨用户 ID 拒绝对应生成结果。只有日期/时长证据不合格的可恢复字段按契约降为待确认，不能把被丢弃的值隐藏为已验证。重新生成保留旧编辑；首版替换未发布候选前再次确认，不修改成功项或结果未知的冻结项。项目/分类停用、删除、重名/创建未知均由其 owner 核实，Task 发布最终复核。

已发布 receipt committed：显示 taskId 并重入。发布 not_found/超时：只允许同 publishOperationId+相同 frozen payload 重放；当前请求是否曾提交尚不确定时禁止用户改 payload 换 ID。明确字段校验失败且没有写入后才可修改并重新确认，409 的不同参数冲突不自动换 ID。服务端返回可恢复错误码、requestId；日志只存诊断标识/耗时，不存正文、token、密钥或原始 provider 错误体。

## DUPLICATE SAFETY

- 媒体使用规范化 provider/entity/stableSourceId；数据库同时限制单来源归属和单条目来源数。标题/相似度只能提示。相同操作重放 receipt；不同操作同来源 create 并发一方创建、另一方返回 existing，失败事务无孤立 item；不同目标关联冲突 409。
- 生成使用 generationOperationId 对应 artifact，claim 先落库后付费调用；不同 ID 同用户竞争受用户行锁/在途额度约束。与 Writing 的 artifact 身份碰撞返回 409，不读取或重放别的 feature 内容。
- 发布使用独立 publishOperationId，与 localStorage 冻结 payload、mutation_receipts 一致。candidateId 只用于草稿关联；artifact 不承担发布状态。Task receipt 是发布结果权威，刷新不自动 POST。
- 项目/分类建议新建由用户点击、owner 创建并读取 canonical ID；核名覆盖完整目录，创建结果未知先查，不盲目再次 POST。同名并不证明是同一对象，用户选择。

## IMPLEMENTATION SLICES

切片编号是工作包标识，不代表跨 owner 必须串行。媒体与任务从切片 1 后独立推进；IGDB 门控不能阻塞任务。每片仅同步当片实际落地的 architecture/OpenAPI delta，不把未来规划提前写成生产事实。

| 切片 | 依赖与最小交付 | 验收 Gate |
| --- | --- | --- |
| 1 契约/配置基线 | 重新核对 HEAD/working tree、V42 或实际 migration head，明确字段/权限/状态/安全契约；接 env schema 与实际运行环境（本地根 .env，部署 Compose 使用 deploy/.env）；MEDIA_IMPORT_TOKEN_SECRET 至少 32 随机字节并多实例一致；查 API 部署地域 | 配置解析/密钥脱敏；匿名连通性与图片占位报告；不自动执行付费生成。无部署地域时只报本地连通，部署结论 NOT_RUN |
| 2a TMDB 最小闭环 | 依赖 1；migration、source 唯一键、HMAC token、search→resolve→confirm→详情重开；导入草稿恢复/确认状态/receipt；基本解除来源关联及手工降级一起落地，避免首片误导入无补救 | mock + fresh/upgrade disposable MySQL + 真实浏览器；并发 confirm、过期 token 后重放、跨用户/tamper、个人字段不覆盖；真实 TMDB search/resolve 与图片检查单列 |
| 2b 来源关联与刷新 | 依赖 2a；关联既有无来源条目、B/C/N 三方差异、source version/类型兼容、换源；不实现条目合并/relations 搬迁 | DB/浏览器：手改字段保留、缺失不清空、冲突不搬 source、已有链接保留 |
| 3 Open Library | 依赖 2b；ISBN→edition→work、第一作者、年份、封面、work 合并重定向及人工冲突处理 | mock/真实 DB/浏览器；不同 ISBN 同 work 去重；仅 edition 无 work 不伪造 identity、降级手工；确认后才更新 canonical source |
| 4 IGDB 门控 | 依赖 1、2b，另需 Twitch 凭据/用途及网络可达；游戏搜索与类型/开发商/年份映射 | 当前 DEFERRED，验证 NOT_RUN；门控仅关闭“游戏来源导入”，既有游戏手录/详情照常，不阻塞 5–8 |
| 5 Tasks 可恢复草稿/基础契约 | 只依赖 1；allowTasks/reasoning/context migration、权限设置、claim/纯状态查询、上下文选择、quota、生成/编辑 UI；仅测试环境注入 mock gateway，生产未配置保持 unavailable，不把 mock 作为正常生成 | DB 并发 claim/quota、Web 编辑/刷新/存储失败/认证恢复；不接真实付费 provider、不发布任务，不标 DeepSeek PASS |
| 6 DeepSeek 真实生成 | 依赖 5；adapter、assistant 输出筛选、证据/日期校验、usage、30s timeout/60s unknown；仍只生成草稿 | mock 契约；必须真实 provider smoke；质量集多次真实运行，记录配置与结果；未跑 NOT_RUN |
| 7 明确发布与建议新建 | 依赖 5，真实验收还依赖 6；owner quick managers、完整目录核名、Task duplicate 提示、独立 publishOperationId、status GET、既有 publishTask 事务 | 真实 DB/浏览器发布、双击/超时/部分重试、归属/停用校验，task 重开；不自动 accept/计划/完成 |
| 8 首批整体验收 | 按批准交付范围组合 2a/2b/3 与 5/6/7；4 不作前置 | 桌面/移动真实 viewport，详情重入、刷新草稿、跨标签、认证过期、失败恢复；来源/provider 分别报告 PASS/NOT_RUN，不以部分 green 宣称全量完成 |

切片 1 只确定契约、配置与匿名连通检查；迁移/架构/API 文档随所属垂直切片实施，不先创建通用 provider registry/通用 import engine/新全局 store。Web 导入工作流放 Library 私有文件、拆分工作流放 Tasks 私有文件，现有 feature index 只组合相应入口；API Library 命令留 Library owner，Tasks 生成编排只消费 AI foundation 与目录 public capability。仅因真实 provider 协议差异拆出 DeepSeek adapter，不改所有 AI flow。

## TEST PLAN

- **Mock/安全契约**：服务端固定来源/每跳防护、图片白名单、纯文本/长度、签名篡改/到期/跨用户/跨目标、缓存不混用户、query/正文/凭据不入日志；DeepSeek 官方 Responses fixture 包含 reasoning item、多个 message、completed/failed/incomplete/无效 JSON、usage 缺失。
- **真实 DB**：使用仓库现有测试机制发现/启动测试 MySQL，新建 `_test` disposable DB，分别 fresh migration、V42 或实施前 head 升级；现有 vnext-11-14 与受影响发布回归，保留旧 Writing 行为。检查 source 唯一键/事务回滚/无孤立 item/乐观版本/解绑重放、artifact 终态/并发不同 operationId/配额最后一名竞争、GET 无写入。结束清理 QA 库/临时服务。
- **媒体精确场景**：同来源并发两 confirm；已提交但响应丢失且 token 已过期重放；解绑后旧 confirm 不复建；手录关联类型不符；B/C/N 全组合含来源字段缺失；OL 不同 edition 同 work、合并重定向冲突；人工 description 与 shortNote 不互覆盖；list 响应无长简介或 metadataSnapshot。
- **Tasks 精确场景**：同 ID 双击只一次 provider；同用户不同 ID 只一在途；进程在 claim 后退出、GET 派生 unknown、显式新 POST 终止旧 claim；午夜/时区变更/上下文更名后同 ID 重放无 fingerprint 漂移；迟到响应不翻终态；cancel/429/5xx/JSON 截断不自动重试；分类/project ID 越权拒绝；发布时 body 同时有 operationId/recordTimezone、dueAt 本地格式；receipt 丢响应后查/重放；相似 title 仅提示。
- **真实 provider**：key 非空不算通过。DeepSeek smoke 使用固定匿名最小样本，实测 JSON Schema、status、usage/禁用 reasoning；无效 schema 的负向 fixture 留 mock，不能用一次合法 JSON 推论全面严格。TMDB 真实搜索/详情/中文空值回退/图片与归属分别检查；OL 出口限流/联系标识；未申请 IGDB NOT_RUN。不用生产私文作测试。
- **质量 Gate**：20–30 条匿名人工标注输入，每条同配置独立运行至少 3 次；记录 provider/model/promptVersion/date/timezone/样本 hash、每次输出与评分。包含 0/1/多项、超过20项、中文/emoji长度、项目同名/目录超限、否定/已完成事项、今晚/下周三/月底/周末/闰日/跨年/时区。允许明确的等价拆分列表，不用任务数量相等替代语义覆盖。所有运行编造日期/正式估时为 0、明确日期/时长的保留或显式待确认覆盖 100%；原子任务覆盖 ≥90%、可接受边界 ≥85%、建议时长在人工区间 ≥80%。数量偏差每例不超过 max(1,ceil(期望项数×20%))，超20例按前20和余文提示评分；发布阻塞的 schema/越权 ID 错误零容忍。相对日期按固定上下文真值评分，不把证据子串当正确换算。

质量集预计 60–90 次真实生成，与 20 次/用户/日限额分别记录；在隔离 QA 库使用独立测试用户/分日运行，并给测试费用设已批准的总调用数上限，不调低生产安全约束来跑分。日期只有 dateCandidate 且要求用户补时间可以算显式待确认；对于明确且可唯一解析的日期/时长，正确自动提取率另设 ≥95%，防止全部置空也通过“保留”门槛。类型/协议/越权等机械 Gate 运行稳定通过，主观质量由标注者记录判定。
- **浏览器**：isolated API/DB + public UI，断言实际桌面/移动 CSS viewport，编辑后即刷新恢复、storage 满/坏版本、跨标签冲突、主动登出清理、认证过期锁定同用户恢复、开始新草稿确认、原文证据紧邻日期、部分发布及 task 重开、封面占位与来源署名。mock 浏览器路径明确标记，与真实 provider 路径分开。
- **仓库检查**：实施时按各 owner 跑 `npm run typecheck`、`npm run lint`、相关 focused tests、`npm run build` 和 `git diff --check`；数据库与 provider 不运行不得报 PASS。本轮仅 DESIGN 静态审查及文档检查，不运行实现/DB/浏览器/provider 测试。

## OWNER DECISIONS

本轮已确认并写入方案：

- 媒体范围为影视、图书、游戏、动画；动画首版映射现有 MOVIE/SERIES。
- 影视首选 TMDB，图书 Open Library，游戏 IGDB；Trakt 暂不作为必需依赖。Trakt API 可作为后续同步/发现增强，但图片规范要求缓存且不得热链，不能为“免费”而在首版引入。Twitch 当前暂时无法申请，IGDB 不进入首批可验收范围。
- DeepSeek 使用 Responses API 和 `deepseek-flash`。
- LLM 推荐优先级、难度、分类、项目；日期和正式估时仅采纳原文明确提及，另给建议时长。
- 无匹配项目/分类时推荐新建，由用户确认后复用现有 owner 创建。
- 草稿按用户/草稿 ID versioned localStorage，刷新恢复；不自动生成或发布。
- 任务上下文默认只传进行中的项目优先、最近活跃排序的有限列表；超过上限必须让用户缩小范围。新建建议先服务端同名检查。首版不提供草稿排序。
- 首版扁平任务列表，不增加父子 Task 模型；允许用户确认无分类发布。

仍需在批准实施前确认的外部条件：

- TMDB 与 DeepSeek key 均已非空（2026-10-26，仅检查状态，未输出密钥）；有效性尚未验证。TMDB 使用批准的 logo，并在 About/Credits 展示官方归属声明，Library 详情附来源链接。商业/公开部署用途按 TMDB 条款确认。
- Open Library User-Agent 中的真实联系邮箱；简介/封面缺失和第三方权利按其说明处理。
- IGDB/Twitch Client ID、Client Secret、用途是否符合非商业条款；当前无法申请，后续再补。token 只服务端缓存。
- API 部署地域（尚未确认）及其到各 provider API、浏览器到图片 CDN 的连通性；在切片 1 记录并据此决定是否需要合法的自有缓存方案。
- DeepSeek 真实 smoke 尚未运行；`.env` key 已设置。账户余额/预算仍需确认；key 只放服务端 `.env`。
- 实施默认建议：每条目一个活动来源、媒体不自动合并作品；分类维度及颜色/图标沿用现有 owner 默认值或由用户选，不由模型生成权限/配置。若用户需要多来源或作品合并，须单独批准，不能在实现中扩展。

## NEXT ACTION

等待用户批准实施范围。建议顺序 1→2a→2b→3，以及独立的 1→5→6→7，最后 8；4 因 Twitch 凭据 DEFERRED，不在这两条链上。部署地域尚未确认只限制部署连通结论，不阻塞文档/契约/local isolated QA 的规划。密钥已保存，不再要求重复提供；MEDIA_IMPORT_TOKEN_SECRET 在批准实施后由实施者本地安全生成并注入，不复用 JWT_SECRET，无需用户申请第三方凭据；后续实施分别核验运行环境配置注入和真实 smoke。当前不推进实施、不新增里程碑。

### 双轮自审记录（2026-10-26）

| 自审 | 核对内容 | 发现并修订 | 状态 |
| --- | --- | --- | --- |
| 第一遍 | HEAD/working tree、architecture、schema/routes/receipt、官方 provider 契约 | 非法 DB 状态、GET 写入、生成/发布 ID 混用、claim 并发安全、媒体合并/多来源语义、token 到期后的重放 | 设计已修订；实现/DB/provider NOT_RUN |
| 第二遍 | 输入→预览→确认→重入的失败路径、跨午夜/用户/标签、切片依赖与 Gate | 状态查询缺口、冻结上下文未落库、上下文伪新建、存储失败、截止 HTTP 格式、IGDB 阻塞 Tasks、解绑/手工降级过晚 | 设计已修订；文档静态复核；浏览器 NOT_RUN |

本次结论仅为设计审查。部署地域、授权适配、Open Library 联系标识、DeepSeek 金额预算与真实 smoke 仍须在批准切片中核验。architecture 提到 Library export，但当前 exports route 尚无该 domain，属于已有文档漂移，记录为独立历史问题，不扩成导出实施。本次新增简介不悄悄加入全局搜索正文。

静态核对证据：`db/migration/V41__add_ai_foundation.sql` 的 status CHECK、`apps/api/src/ai-foundation.ts` 的 Writing retry、`apps/api/src/mutation-receipt.ts` 的 commandType/fingerprint replay、`apps/api/src/routes/tasks.ts` 的 operationId+recordTimezone 分支与本地 dueAt 格式，以及 `deploy/docker-compose.yml` 的 deploy/.env 路径。剩余资料不能替代真实运行验收。

### 官方地址与凭据清单

| 用途 | 官方 API 地址 | 需要提供 |
| --- | --- | --- |
| DeepSeek Responses | `https://api.deepseek.com/responses` | DeepSeek API key（申请：[API Keys](https://platform.deepseek.com/api_keys)）；模型由 env 配置，当前 `deepseek-flash` |
| TMDB | `https://api.themoviedb.org/3`；图片 `https://image.tmdb.org/t/p` | TMDB API Read Access Token（申请：[TMDB API settings](https://www.themoviedb.org/settings/api)） |
| Open Library | `https://openlibrary.org`；封面 `https://covers.openlibrary.org` | 真实联系邮箱（用于 User-Agent），无需 API key |
| IGDB（后续门控） | `https://api.igdb.com/v4` | Twitch Developer Client ID + Client Secret（当前暂时无法申请）；OAuth `https://id.twitch.tv/oauth2/token` |

2026-10-26 重新核对的官方文档（非 live provider 测试）：[DeepSeek Responses 兼容性/usage](https://api-docs.deepseek.com/zh-cn/guides/responses_api/)、[TMDB 电影搜索](https://developer.themoviedb.org/reference/search-movie)、[TMDB 剧集搜索](https://developer.themoviedb.org/reference/search-tv)、[TMDB 图片 URL](https://developer.themoviedb.org/docs/image-basics)、[Open Library 用法/速率](https://openlibrary.org/developers/api)。DeepSeek 当前明确列出 deepseek-flash、reasoning.effort、stream、json_schema；API 无状态，不能用 previous_response_id/conversation/background。模型名不作为争议项。

研究参考：[TMDB FAQ](https://developer.themoviedb.org/docs/faq)、[TMDB find by ID](https://developer.themoviedb.org/reference/find-by-id)、[Open Library API](https://openlibrary.org/developers/api)、[Open Library licensing](https://openlibrary.org/developers/licensing)、[IGDB API](https://api-docs.igdb.com/)、[DeepSeek Responses](https://api-docs.deepseek.com/zh-cn/api/create-response)、[Trakt images](https://developer.trakt.tv/docs/images)。


## 2026-11-02 授权记录
用户已批准上述实施范围与推荐决策。部署：中国；用途：个人非商业；Open Library 联系邮箱：lijingru300@gmail.com。DeepSeek live 测试总预算人民币 8 元（按高峰价格保守预留，在途请求也计入，不自动重试）。TMDB / Open Library / DeepSeek 首批；IGDB 等 Twitch 凭据后再接。实施与验收事实另记 closure，不将本计划中的预期验收当成 PASS。
