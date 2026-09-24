# Personal Workbench vNext PRD

版本：v1.5 · 2026-09-21（R2D0 后路线复审：Finance 优先、Hero/AI 分层推进）

主题：以悬赏板驱动执行的 Personal OS  
状态：持续实施中。R0、R1A–D、R1.5、R2A、R2B、R2C、R2D0 已完成验收；下一核心产品门槛调整为 Finance。R2D0 另有一个 Writing Slot 新用户默认值的小修正待完成。

## 1. 产品决策

Workbench 是个人现实生活的计划、执行、记录与复盘系统。核心体验保持为：**发布悬赏 → 从悬赏板接取 → 开始计时 → 暂停或结束本次投入 → 写入 Timeline → 完成悬赏与结算 → 复盘**。

悬赏板是任务系统的主要交互形式。“悬赏”沿用 Task 数据模型，不再建立一套 Bounty 实体；“接取”沿用 TaskDailyAssignment。悬赏面向自己发布与领取，不引入多人抢单、真实支付或任务市场。

其他领域围绕这条路径补全：Projects 承接长期目标；Calendar 分配时间；Routines 记录重复生活行为；Journal 复盘；Finance 管理真实账本；Search、Settings 和 Integrations 提供长期使用能力。悬赏板不会因导航重组而退化成隐藏的普通任务列表。

新增整合“随手记／灵感库”：先快速捕捉想法，需要行动时再明确转为悬赏。随手记沿用已有 QuickNote 和 `quick_notes`，可以一直作为文字保存；不要求每条记录变成任务，也不自动生成 Timeline 时长。

长期呈现增加“我的成长”个人主页：以英雄培养页的角色卡、等级、N 维成长图、技能进度、里程碑和成长历程展示真实积累，配套周总结与月总结。Today 负责今天怎么做，成长主页负责看到自己如何持续成长；等级沿用现有 XP，能力维度由真实投入与目标推导。

与原始建议的取舍：

| 议题 | 本版决策 |
| --- | --- |
| Tasks 的主要体验 | 明确命名为“悬赏板”，默认卡片视图，另提供紧凑列表；今日接取保持首页主体 |
| Today 只呈现今天 | 采纳；Today 是执行桌面，包含“今日悬赏 + Timeline”，完整任务池独立进入悬赏板 |
| Rewards 降为辅助层 | 商店与成长分析移到 More；悬赏卡保留奖励预期、完成时保留轻量结算，可关闭展示 |
| 随手记／灵感库 | 保留独立记录真值；R1.5 补全局快捷捕捉、Journal 内整理、转悬赏及引用，数据与已有 API 从 R0 起保护 |
| 个人成长主页 | R2 提供独立 `/growth` 与个人头像入口，采用英雄培养式展示；N 维配置、技能进度与周月总结为正式需求，商店仍独立 |
| 结束计时等于完成任务 | 改为两个独立动作；长期任务可以跨多次计时、多个日期推进 |
| 功能补齐 | 全部核心域进入路线图，Finance、通用习惯、Bridge 有独立交付范围，不以空页面视为实现 |
| 后端全面改目录 | 不强制；保留现有 route-centric CRUD，跨表执行工作流才抽明确事务 owner |
| Media | 全链路下线，不迁入 Journal、Together 或 Agent；删除前备份，使用新增迁移 |
| 交付顺序 | 已完成执行主链、Projects、Trash、Habits 与 R2D0 个性化。当前优先顺序调整为：R2D0.1 Writing Slot 默认修正 → R3 Finance 完整首版 → Hero Growth + Pixel Visual V1 → 内部 AI Foundation / Familiar → Writing AI → Period Reviews → Decision / Psychological Bridge / Project Copilot / Ask Workbench → 通用 Import → 外部 Agent Bridge。像素资产制作可并行，不阻塞业务域。 |

## 1.1 2026-09-21 路线复审结论

本次复审不改变已经稳定的 Task / Assignment / Timer / ActualTime / Project / Habit 等领域边界，而是调整 **后续发布优先级**：

1. **Finance 改为当前下一核心域。** R2A/B 所需前置已经成立，R2C Habits 与 R2D0 个性化也已交付；没有技术理由继续让 Finance 排在 Growth 之后。
2. **Growth 仍是英雄培养系统的核心呈现，但不再抢在真实财务域之前。** Finance 完整首版完成后，再进入 Hero Growth 与 Pixel Visual V1。
3. **内部 AI 与外部 Agent Bridge 分开。** 指引魔法使、晨写／日记洞察、决策辅助等属于 Workbench 内部 AI 能力；R4 Agent Bridge 仍是外部受控集成，不与 AI Gateway 混为一层。
4. **AI 不拥有业务真值。** 能用 SQL / code 得出的事实摘要不调用模型；Jev 只用于分类、筛选、路由等判断型工作，生成式 LLM 只承担语义理解、文字生成和复杂推理。任何 Task / Journal / Finance 写入仍由用户确认后交给对应 owner。
5. **Pixel Fantasy Skin 与业务开发解耦。** 视觉资产现在即可并行制作；代码层首先在 Growth / Familiar 等世界观承载面落地，不先全站重做表单与编辑器。
6. **通用 Import 延后于核心体验，但 Finance 的导入不再等待 R2E。** FIN-04 拥有 Finance 自己的 ImportBatch / 去重 / 对账语义；未来通用 Import 复用已验证模式，而不是反向阻塞 Finance。

当前建议主线：

```text
R2D0.1 Writing Slot 默认修正
→ R3 Finance（FIN-01 → FIN-02 → FIN-03 → FIN-04）
→ R2D1 Hero Growth + Pixel Visual V1
→ R3.5A AI Foundation + Familiar Shell
→ R3.5B Morning Writing / Journal / Text→Task AI
→ R2D2 Period Reviews（确定性事实为底，AI 可选增强）
→ R3.5C Decision / Psychological Bridge
→ R3.5D Project Copilot / Ask My Workbench / Stuck Insight
→ R2E 通用 Import / Restore
→ R4 Agent Bridge
→ R5 Finance Projection / Agent Wallet 对账
→ R6 扩展
```

## 2. 文档关系与现状

- 本文负责目标、范围、优先级与验收；[功能设计](FUNCTIONAL_DESIGN_VNEXT.md)负责页面、交互、状态、统计与目标契约。
- [开发计划](DEVELOPMENT_PLAN_VNEXT.md)负责工作包、依赖、迁移与发布门槛。
- [Finance PRD](PERSONAL_WORKBENCH_FINANCE_PRD.md)负责财务领域完整最小闭环。
- [ARCHITECTURE.md](ARCHITECTURE.md)仍是架构唯一记录；设计中的未来能力不代表已落地。
- 根目录[旧 PRD](../个人工作台PRD.md)保留为 v0.1 历史资料。新开发的产品范围以本套 vNext 文档为准。

### 2.1 当前交付状态（2026-09-21）

| 范围 | 当前状态 | 已成立的关键事实 | 仍待实施 |
| --- | --- | --- | --- |
| 执行主链 | **PASS** | Task / Assignment / TimerSegment / ActualTime / continuation / operationId / current-session 单真值 | 仅按后续真实需求继续深化 |
| Today / AppShell | **PASS** | Router、Query、跨页 Timer、桌面 Main + Utility Rail、可折叠侧栏、移动统一 Quick Action | Pixel visual 只作为后续视觉层，不改 ownership |
| Quick Notes / Search / Settings / Trash | **PASS** | 捕捉、转 Task、Journal 草稿引用、Project 素材、Search/Export、QuickNote Trash | 通用 Import 仍待 R2E |
| Projects | **PASS** | 单项目归属、历史 occurrence attribution、Project 投入与进度、Search/Export | ProjectSection / Workstream 仅候选，尚未实现 |
| Habits / Routines | **PASS** | daily / weekdays / weekly-N、rule/goal version、skip、Task link；Water/Writing/Sleep 不双写 | Growth 统计消费尚未实现 |
| Personalization | **PASS_WITH_SMALL_CORRECTION** | 七个通用默认 Task Category、自定义颜色、nullable Growth mapping、Writing Slot 偏好、Sleep wake-date 语义 | 新用户 Writing Slot 目标改为晨写/日记/股市复盘全部显式 opt-in |
| Finance | **NEXT** | PRD 与独立领域边界已冻结 | FIN-01–04 尚未实现 |
| Hero Growth / Reviews | **PENDING** | 数据源已经足够：Task / Project / Habit / ActualTime / Rewards | Growth 页面、N 维配置、Period Review |
| Internal AI / Familiar | **PENDING** | 已有局部 AI Insight / Decision Tools，可迁移复用 | 统一 AI Gateway、cost telemetry、AI Artifact、Familiar shell、Writing AI 等 |
| Agent Bridge | **PENDING** | 核心 owner/version/idempotency 已稳定 | 外部 Grant / Candidate / audit；仍排在 Finance 与内部产品能力之后 |

旧 2026-09-18 的源码核验结论属于历史起点，不再作为当前缺口列表。当前开发以已通过的 R0–R2D0 报告、`ARCHITECTURE.md` 与本文新版路线为准。

## 3. 用户场景与结果

| 场景 | 用户路径 | 应得到的结果 |
| --- | --- | --- |
| 早晨决定做什么 | Today → 接取悬赏 → 筛选项目／类别 → 选择任务 | 今日只出现主动接取和明确结转的任务，建议聚焦 3 项 |
| 长期事务推进 | Project“导游考试” → 发布“第三章练习” → 接取 → 计时 45 分钟 | 保存真实投入，可更新至 40%，任务仍可继续 |
| 临时小事 | Quick Add → 发布并接取 → 直接完成 | 不强迫填写虚构时长，完成状态与结算正常 |
| 临时想法 | Quick Add → 随手记 → 输入正文保存 → 灵感库整理 | 无需标题、项目或任务状态；可保留纯记录 |
| 想法转行动 | 随手记详情 → 转为悬赏 → 确认标题／描述 → 发布并接取 → 计时 | 原记录保留，任务可回溯来源；仅真实计时或补录进入 Timeline |
| 看见成长 | 我的成长 → 角色卡／N 维图 → 点击学习维度 → 查看技能与投入来源 | 既看到积累和阶段变化，也能追溯事实；不只剩一组装饰性分数 |
| 周月复盘 | 成长页 → 本周／本月总结 → 引用随手记 → 写收获与下一步 | 系统事实、可选 AI 草稿、个人总结分开；下一步经确认转为悬赏 |
| 中断后继续 | 暂停 → 切页／刷新 → 继续 → 结束本次 | 空档不算专注，多个实际片段可追溯到同一次 Session |
| 忘记计时 | Timeline 补录 → 可关联任务 → 保存 | 实际投入进入统计；不自动完成任务 |
| 一天没做完 | 次日看到“待续接” → 接取／暂不接取／重新安排 | 不因打开历史日期而偷偷修改任务和日历 |
| 晚间复盘 | Journal → 查看今日完成与投入摘要 → 写日记 | 摘要有来源，个人文字独立保存 |
| 生活维护 | Today 喝水／Routines 打卡 → 周回顾 | 轻量记录不必全部变成悬赏 |
| 真实收支 | Finance → 支出／转账 → 账本／预算 | 金额可核对，与 Workbench 金币完全分离 |
| Agent 建议任务 | Integrations 授权 → 查看候选悬赏 → 确认入池或接取 | Workbench 决定是否写入现实数据，来源与操作可审计 |

## 4. 信息架构

### 4.1 桌面端

| 一级入口 | 职责 | 主要路由 |
| --- | --- | --- |
| 今日 Today | 执行桌面：当前专注、今日悬赏、Timeline、生活摘要、复盘入口 | `/today?date=YYYY-MM-DD`；`/` 重定向当天 |
| 悬赏板 | 发布、发现、接取、管理所有任务 | `/tasks`、`/tasks/:taskId` |
| 项目 | 长期目标与所属悬赏 | `/projects`、`/projects/:projectId` |
| 日历 | 按日／周安排和对比计划与实际 | `/calendar?view=day&date=YYYY-MM-DD` |
| 习惯与生活 | Sleep / Water / 通用习惯与历史 | `/routines` |
| 日记与复盘 | 日记、晨间书写、随手记／灵感库、周／项目／股票复盘与归档 | `/journal`、`/journal/:date`；随手记 `/notes`、`/notes/:noteId` 为二级入口 |
| 我的成长（R2） | 角色档案、N 维成长图、技能积累、里程碑、周总结／月总结 | `/growth`；总结详情 `/journal/reviews/:reviewId` |
| 财务 | 账户、流水、预算、周期收支、报表 | `/finance`；随财务版本上线 |
| 更多 | Insights、成长、Rewards、Tools、Integrations、Settings | `/insights`、`/rewards`、`/tools`、`/settings` |

全局 Quick Add 放在顶栏，R1D 先提供发布悬赏／计划／补录；R1.5 加入随手记与基础 Search，Today 可显示当日最近 3 条的紧凑入口，不展开完整灵感库。Today 到悬赏板是一个主要入口，支持抽屉快捷接取，不要求离开当前时间轴。

### 4.2 移动端

底部：**今日 / 悬赏 / 日历 / 日记 / 更多**。项目、习惯、财务从更多进入，任务详情也可进入所属项目。“我的成长”在 R2 由头像与更多置顶直达，保留固定五个底部入口。跨页 mini timer 固定在底部导航上方，不遮挡提交按钮。移动端优先优化接取、开始／暂停、结束、补录、喝水、随手记、快速记账。

未交付的页面不在日常导航中呈现无功能占位；版本规划在文档中可查。

## 5. 功能范围与优先级

P0 表示该交付阶段必须通过的核心能力，P1 表示该阶段可在核心稳定后交付。领域重要性与发布日期分开：Finance 是长期核心域，但不阻塞首个执行闭环版本。R1A–D 各自有退出门槛；R1D 是第一次可日用的 vNext，R1.5 负责其余页面完善，不能反向阻塞主链。既有生活记录、日记和商店在过渡入口继续可用。

| ID | 功能 | 主要范围 | 阶段 / 优先级 |
| --- | --- | --- | --- |
| WB-01 | Today 执行桌面 | 今日接取、Top 3、当前专注、Timeline、摘要与轻入口 | R1D / P0 |
| WB-02 | 悬赏板 | 发布、筛选、卡片／列表、接取、批量接取、排序、详情、完成／归档 | R1D / P0 |
| WB-03 | 持久化计时 | 全局计时器、暂停续计、结束本次、完成悬赏、恢复、跨日、补录 | R1A–B 语义／命令，R1D 界面 / P0 |
| WB-04 | Timeline / Calendar | 计划与实际分层、日／周、完整 CRUD、来源跳转、重复与冲突处理 | R1D / P0 |
| WB-05 | 日接取与结转 | 主动接取、撤回、待续接、显式幂等结转、历史保存 | R0 纯读与结转分离；R1B/D 完善 / P0 |
| WB-06 | 奖励账本／奖励展示 | 幂等结算、事务一致性与存量保护；卡片反馈、商店、兑换、展示设置 | 账本 R1A–B / P0；展示 R1.5；成长页见 WB-26 |
| WB-07 | 现有生活记录 | Sleep / Water 保留，晨写快捷入口；领域历史 | R1D 保留可用；R1.5 归位 / P0 |
| WB-08 | Journal / Reviews | 日记、晨写、股票复盘归位、归档、草稿保护 | R1D 保留入口和 CRUD；R1.5 完善 / P0 |
| WB-09 | Insights / Tools | 现有 AI Insight、Decision Tools 归位；来源与失败状态 | R1.5 / P1 |
| WB-10 | Settings / Personalization | 用户资料、分类管理、自定义颜色、可选 Growth 映射、Writing Slots、时区、外观、奖励展示、数据入口 | R1.5 基础；R2D0 个性化已交付，Writing Slot 新用户默认值待 R2D0.1 小修 / P0 |
| WB-11 | Projects | 项目 CRUD、所属悬赏、计划与实际投入、进度、笔记、归档、QuickNote 素材 | R2A–B 已交付 / P0 |
| WB-12 | 通用 Routines / Habits | 频率、目标、发生日、次数／数量／时长、历史、跳过、关联任务 | R2C 已交付 / P0 |
| WB-13 | 周月总结 / Reviews | 周总结、月总结、同口径对比、事实摘要、个人反思、可选 AI 草稿、下一步转悬赏；项目／学习复盘 | Finance 与 Growth 后的 R2D2 / P0；AI 为可选增强而非事实依赖 |
| WB-14 | Search | 关键词、类型、日期、分页；先任务／日记／随手记／日历，随新领域扩展 | R1.5 基础；R2B 扩展，新增领域交付时补入 / P0 |
| WB-15 | 数据维护 | 全量导出、回收站、备份恢复流程；受控导入、去重和错误报告 | R1.5 导出；R2B 回收站；R2E 导入 / P1 |
| WB-16 | Agent Bridge | Today + Tasks 受限读取，候选悬赏、确认写入、授权与撤销、审计 | R4 / P0 |
| WB-17 | Finance | 账户、分类、收支、转账、退款/冲正、预算、周期收支、报表、导入/对账 | **当前下一主线 R3 / P0**，FIN-01–04 构成完整首版 |
| WB-18 | Finance Projection | 独立敏感授权下的财务投影；不隐式继承 Today 授权 | R5 / P0 |
| WB-19 | Agent Wallet 对接 | 外部钱包账本关联、支付结果确认、对账；钱包执行归 Agent 产品 | R5 / P1，外部契约依赖 |
| WB-20 | Inventory | 物品、位置、状态、购入／保修记录、维护提醒关联悬赏 | R6 / P1，扩展范围 |
| WB-21 | Calendar 后续 | 月视图、重复计划、提醒；不影响日／周主流程 | R6 / P1 |
| WB-22 | Decision / Psychological Bridge | 问题重构、选项/标准、加权决策、事前推演、心理桥梁、决策日志与回顾；写 Task 需确认 | 内部 AI Foundation 后的 R3.5C / P1 |
| WB-23 | 项目后续 | 里程碑、阶段回顾；保持单人轻量使用 | R6 / P1 |
| WB-24 | Media 下线 | 先停 UI/API／聚合引用；备份恢复与部署历史核验后再物理 DROP | R0 应用下线 / P0；R0.5 独立删除门槛，可延后执行 |
| WB-25 | 随手记／灵感库 | 快速记录、日期／标签／关键词、详情编辑、草稿、归档／回收站、转悬赏、引用到日记、搜索导出、创建幂等与奖励 | R1.5 / P0；项目关联及导入随 R2 |
| WB-26 | 我的成长 / N 维图 | 英雄培养式角色档案、现有 XP 等级、可配置成长维度、目标与投入图、技能进度、里程碑与成长历程；Pixel Visual V1 首次系统落地 | Finance 后的 R2D1 / P0 |
| WB-27 | AI Foundation / 指引魔法使 | AI Gateway、provider routing、预算与成本遥测、AI Artifact、来源版本/stale、Familiar shell；不拥有业务真值 | R3.5A / P0 |
| WB-28 | Writing AI | 晨写梳理、日记洞察、Text→Task 候选；AI 结果是派生物，写入 Task 需用户确认 | R3.5B / P0 |
| WB-29 | Workbench Copilot | Project Copilot、Ask My Workbench、Stuck Insight；代码先算事实，模型只解释/筛选/推理 | R3.5D / P1 |

R0–R2D0 已让执行、项目、习惯、记录与个性化主干成立。当前产品优先级调整为 **先完成 R3 Finance，再完成 Hero Growth / Reviews 与内部 AI**；这是产品顺序调整，不是新的技术依赖。R4–R5 继续保留为外部受控集成路线。任务只按依赖与退出门槛推进，不做人日估算。Activity Feed 保留为可选派生视图，不另建通用业务实体。Shared Life、Together、角色关系、聊天仓库、MCP、桌宠、实时协作和复杂离线同步不进入本轮。

## 6. 核心产品规则

1. **接取不等于开始。** 接取只决定哪天推进；Task 保存长期生命周期，Assignment 保存当天选择。
2. **计时不等于完成。** “结束本次”只记录投入；“完成悬赏”是明确命令，可同时结束运行中的计时。
3. **进度不等于时长。** 记录 30 分钟不自动变成 30% 完成；用户可手动更新进度，完成命令设为 100%。
4. **计划不等于实际。** 计划过期、勾选完成都不自动生成同长度的实际投入；需计时或明确补录。
5. **同一用户默认只有一个未结束 Session。** 运行或暂停均可恢复；切换任务先选择结束旧 Session 或取消切换。
6. **历史事实不被后来状态覆盖。** 后来完成任务不把前几天接取状态改成“当天已完成”；日期统计以发生时间和当日结果为准。
7. **时间与奖励不得重复。** Session 的时间轴展示与源计时是同一份投入；反复点击、断网重试、暂停续计不会重复创建记录或结算。
8. **不强迫游戏化。** XP、金币和动效可隐藏；Task、Timer、Timeline 始终可用。规则失败应回滚本次原子提交并允许原键重试，不能出现“任务成功但账本未知”。
9. **默认不自动塞满今天。** 未完成项进入“待续接”；设置可开启自动接取，但必须走显式命令，不允许 GET 写入。
10. **跨领域只做组合。** 首页摘要、搜索和 AI 洞察不拥有任务、日记、财务的真值；金币、真实财务、Agent 钱包永久分账。
11. **随手记先记录、再决定用途。** 转悬赏保留原记录及来源关联；编辑记录不自动覆盖任务或日记。随手记按个人文字保护，不因 Today + Tasks 的 Agent 授权而暴露正文。
12. **成长可追溯、总结可编辑。** 雷达图反映已记录投入或目标达成，不冒充客观人格／能力测评；XP 不直接等于任意能力分。周月总结由事实摘要辅助，用户文字保持独立，AI 可选且不替用户确认。
13. **续接有处理结果。** 历史接取分别记录待处理／已续接／延后／不再提醒／已改期；“撤回当天任务”不代替历史续接决定，忽略过的来源不会天天重现。
14. **历史归属不漂移。** 每份投入固定发生时项目／类别与记录时区；移动任务或修改偏好只影响新记录。周月总结固定自己的 periodTimezone。
15. **完成事件与奖励分离。** reopen 后再次 DONE 新增完成事件，首次完成奖励按 taskId 仅一次；同一统计周期任务数去重，完成事件不丢失。
16. **一次动作一个身份。** operationId 贯穿重试；同 ID 同参数回放，同 ID 换参数冲突。单活跃执行由数据库每用户 slot 行锁保证，两次合法 resume 使用不同动作 ID。
17. **AI 先读事实、后给建议，不拥有事实。** 统计、金额、日期、完成率等确定性内容由 code / SQL 产生；Jev 仅用于分类、筛选、路由等判断型任务；生成式模型用于语义理解、文字生成与复杂推理。AI 生成的行动、分类或修改都必须经过用户确认并调用真实领域 owner。

## 7. 成功指标与验收

以下为目标值，尚未采集基线；R0 记录当前路径步数和耗时，实施后用同一数据集比较。

| 指标 | 目标／检验方法 |
| --- | --- |
| 接取与开始效率 | Today 单任务“接取并开始”≤ 3 次主要操作；首次创建只强制标题，其余有默认或可选值 |
| 结束记录效率 | 结束本次 ≤ 2 次主要操作，反思非必填；结果立即进入 Timeline |
| 随手记闭环 | 输入正文即可保存；可找到旧记录并编辑、转悬赏、引用；同一创建重试只保存一条、发一次奖励 |
| 成长与周期总结 | 新增维度无需改前端枚举；每条成长分值可查看公式与来源；周／月区间正确、对比同口径、重生成不覆盖个人正文 |
| 一致性 | 重试、双击和并发结束测试：仅一份时间事实、一笔对应奖励、一个完成结果 |
| 恢复能力 | 刷新／切页／重新登录后恢复服务端计时状态，暂停时间不计入投入 |
| 时间正确性 | 跨日样例、计划实际重叠样例、补录去重样例按设计精确通过 |
| 数据可达性 | 每个核心对象有详情入口或日期深链，刷新与浏览器前进后退有效 |
| 历史完整性 | 除明确下线的 Media 外，旧任务、实际记录、文字和奖励总账数量／汇总迁移前后可核对 |
| 读取安全性 | Today、Dashboard 兼容读、Search 和 Bridge 读取均不发生业务写入 |
| 操作反馈 | 各页 Loading / Empty / Error / Ready 完整；失败不清空草稿；冲突不静默覆盖 |
| 可用性 | 375px 移动与 1440px 桌面无关键遮挡；关键交互可键盘完成，触控目标 ≥ 44px |
| 性能预算 | 暖服务、个人量级 1 万任务／5 万时间记录的测试夹具下，核心读接口 p95 < 800ms；指定测试环境记录结果，不当作已达成 |

首个可日用版本 R1D 的里程碑为 `WB-EXECUTION-VERTICAL-SLICE-001`：发布 → 接取 → 计时 → 暂停 → 恢复 → 结束本次（任务未完成）→ 再次投入 → 完成悬赏 → 时间／奖励核对 → 从保留入口写 Journal。还须演示“不计时直接完成”和“仅补录不完成”。随手记完整闭环在 R1.5 验收，英雄培养式成长页及周月总结在 R2 验收，均不作为 R1D 的发布前置。

## 8. 默认方案与后续确认点

本版按个人使用、user.timezone 默认 Asia/Shanghai、周一为一周起点设计。用户可手动更改新记录的默认时区，历史按各自 recordTimezone／periodTimezone 固定；不自动跟随设备切换。默认单活跃 Session、主动续接、单项目归属、进度手动维护、奖励可隐藏、Finance 首版单币种 CNY。新用户 Writing Slots 的目标默认是晨写／日记／股市复盘全部关闭，由 Settings 显式选择启用；既有用户偏好与历史记录不被迁移强改。具体规则与并行任务前置条件已固定，可以从 R0 核验开始；不再以重复全盘审阅作为开发前置。

暂不确定的工程事实：生产 Flyway history、存量计时与 Schedule 的可关联率、是否存在多条长期运行计时、历史数据规模和外部 Agent 钱包协议。它们属于 R0 / R5 调查项，不应靠猜测执行破坏性迁移。
