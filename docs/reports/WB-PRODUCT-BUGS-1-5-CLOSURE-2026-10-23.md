# PRODUCT BUGS 1–5 — Closure · 2026-10-23

## RESULT

**PASS — 五项整改及追加的“拖拽任务进入今日重点”已实现并验收。**

范围为 [原整改计划](WB-PRODUCT-REMEDIATION-PLAN-2026-10-23.md) 的前五个切片，另包含用户明确要求的流水“最后录入置顶”。媒体导入与 DeepSeek 拆任务留在 [设计交接](WB-LIBRARY-AI-DESIGN-HANDOFF-2026-10-23.md)，未实施。

所有验证基于当前工作区；未创建提交。此前工作区已有反馈弹窗、国际化与测试/截图改动予以保留，不将它们重新归为本片新增功能。

## ROOT_CAUSE / FIX

| 切片 | 根因 | 修复与 canonical owner |
| --- | --- | --- |
| TODAY-COMPLETED-VISIBILITY | Today 从当前接取集合及当前 Task.status 推导已完成，接取关系释放或任务重新打开会让历史完成记录消失 | Tasks 复用 CompletionEvent，提供按业务日期读取的公开接口；CompletedDay 独立读取，不依赖当前 Assignment。保留事件身份与生命周期，重新接取/重新打开不删除历史完成事实 |
| WALLET-ENTRY-ORDER | Finance 按发生时间排序，分页却用 ID 游标；既不符合后录入置顶，也可能漏页 | Finance 按不可变 id DESC，与 id < cursor 一致。发生日期仍用于归属/筛选，编辑不改变顺序 |
| TASK-FOCUS-AND-DEADLINE-PIN | 接取面星星写 Assignment.focusRank，冒险列表星星写 Task.pinned，两个不同事实共用视觉语义 | 星星及拖入重点都写原有按日 focusRank；Task.pinned 只用于独立的“固定倒计时到主页”动作。创建/编辑截止时间使用用户时区，移除该路径硬编码 +08 |
| FORM-FIELD-CONSISTENCY | 共享 .field 的 rounded-full 同时用于输入、选择及多行正文，形成大胶囊 | 将共享字段改为 rounded-xl（0.75rem）；多行字段有独立高度、垂直 padding 与 resize。Library 补可访问名称，不改变 checkbox/radio/按钮形状 |
| MONTH-ACTIVITY-CALENDAR | 月视图只读取时长汇总，没有事项明细；仅增大格子无法呈现活动 | Calendar 自有有界读取与月历交互，组合已有 ActualTime、CompletionEvent、待执行计划；AppShell 通过 Calendar public surface 组合 |

浏览器联调发现新月历读取中 CompletionEvent 的 MySQL UTC 字符串不可直接当 Date，已在新展示边界显式 parseUtcDateTime；完成记录响应也输出明确 ISO UTC。永久回归同时断言真实响应时间与排序，避免浏览器本地时区误读或读取 500。

## USER FLOWS

### 今日重点与拖拽

- 点击接取面或冒险列表星星，含义都是“今日重点”，每天最多三项。
- 抓住已接取任务左侧拖拽柄，拖进“今日重点”区域；空区域也可接收。
- 写入原有 task-days 命令，成功后刷新 canonical 查询；重载页面仍保留。
- 已经在重点内的任务继续走现有拖拽排序，不重复写重点。
- 满三项时提示先取消一项；失败保留原状态，允许重试；按钮提供不依赖拖拽的操作方式。

### 截止倒数

设置任务截止日期/时间 → 任务详情点击“固定倒计时到主页”，或冒险列表更多菜单执行同名动作 → Today 倒数显示。可取消固定；无截止日期时先进入编辑。重点与倒数固定互不覆盖，不要求任务先被接取；完成/归档仍遵守既有倒数过滤规则。

### 当日完成记录

公开任务详情完成 → CompletionEvent 持久化 → 当日已完成区显示 → 硬刷新仍显示 → 替换接取列表后仍显示。历史事件保持可读，不用当前 Task 状态覆盖历史；不同完成生命周期保留不同事件身份。

### 流水

成功录入 → 当前过滤范围内最新 ID 位于顶部 → 刷新保持 → 分页同方向且无重复/遗漏。补录更早发生时间不会沉到旧录入之后。ID 表达录入序列，不声称并发 ID 是精确提交时刻。

奖励反馈此前已改为“知道了”，说明奖励已到账；本次公开记支出路径验证它及按钮尺寸/不换行，未改变奖励结算规则。

### 月历

- 固定七列、42 格，查询范围覆盖跨月格子，最多 42 天。
- 日期格显示任务/事项标题、时间/时长、分类色；实际和完成可辨识，计划使用虚线。
- 同 Task/业务日已有实际切片时，完成表现为完成标记，避免再塞一条完成记录；没有实际记录的完成事件独立呈现。
- 每格先显示四项，超出显示“还有 N 项”；点击日期或该入口可在下方读取完整标题和所有事项，并进入任务或当日时间轴。
- 手机保留七列与选中日详情，格内省略时间以保留标题空间；日/周/年视图延续原有能力。
- 不复制 Session note，不新增活动事实、不重复累计时长；跨午夜仍使用已有 ActualTime 业务日期切片。

## REGRESSION_RISK

共享 .field 影响多页，因此完整 Web 回归及 Library/Tasks/Wallet/Writing 四类真实表单截图均已执行。圆角为 rem，紧凑字号下计算约 9.75px，非固定 12px；各表单原有专属尺寸与布局保持。

重点命令仍是现有批量 task-days 写入，保存接受集合与 focus IDs；专项测试覆盖三项限制、写入失败重试及已有重点排序。任务完成语义、Timer 生命周期、Session note owner 和 Finance ledger/reward 事务未改变。

月历新增只读接口，范围及用户隔离在服务端验证。客户端不新增完成列表持久化、重点副本或全局 store。无 schema/migration 变更。媒体来源及 AI provider 均未调用。

## TESTS_RUN

均为实际执行结果；测试输出保存在 [evidence](WB-PRODUCT-BUGS-1-5-evidence/)。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| 完整 Web suite（包含 Tasks、Calendar、AppShell、Reminders 等） | PASS，40 文件 / 416 tests | [Web](WB-PRODUCT-BUGS-1-5-evidence/web-tests.log) |
| API R1B，真实 MySQL | PASS，41 tests，0 skipped | [R1B](WB-PRODUCT-BUGS-1-5-evidence/api-r1b.log) |
| Finance FIN-01，真实 MySQL | PASS，13 tests，0 skipped | [FIN01](WB-PRODUCT-BUGS-1-5-evidence/api-fin01.log) |
| Execution R1D，相邻真实 MySQL 回归 | PASS，8 tests，0 skipped | [R1D](WB-PRODUCT-BUGS-1-5-evidence/api-r1d.log) |
| API test TypeScript compilation | PASS，集成脚本前置检查 | 上述 API logs |
| API + Web typecheck | PASS | [typecheck](WB-PRODUCT-BUGS-1-5-evidence/typecheck.log) |
| lint + i18n audit | PASS，missing 0 / untranslated English 0 / visible Chinese 0 | [lint](WB-PRODUCT-BUGS-1-5-evidence/lint-i18n.log) |
| API + Web production build | PASS | [build](WB-PRODUCT-BUGS-1-5-evidence/build.log) |
| 真实 API/UI/MySQL 浏览器验收，375/1024/1440 CSS viewport | PASS，断言 viewport、无横向溢出、表单圆角/范围及完整交互 | [browser.json](WB-PRODUCT-BUGS-1-5-evidence/browser.json)、[run](WB-PRODUCT-BUGS-1-5-evidence/browser-run.log) |
| architecture checker | PASS，0 errors；2 行数复核提醒，见下文 | [architecture](WB-PRODUCT-BUGS-1-5-evidence/architecture.json) |
| git diff --check | PASS | 收尾执行 |

新增永久回归包括：

- 重点星标、拖入空重点区仅写一次、max3 与失败重试、已重点排序不误写 task-days。
- 完成事件在重新挂载且无当前接取项时仍可见；不同日期及事件身份不混淆。
- 月历完整 42 天、跨月、分类色、事项入口、溢出列表、计划区别、加载失败重试及空态。
- 真实 DB：释放接取、reopen/再次完成、业务午夜边界和用户隔离；23:55–00:15 实际切片 + 完成去重 + 计划、42 天上限、UTC 响应/本地时间顺序。
- 东京截止时间与独立 pin/focus 持久化；Web 同时覆盖东京/纽约格式化与转换。
- Finance 发生时间逆序与同时间记录、两页边界、编辑不重排、用户隔离。

浏览器使用仓库既有 CDP 方式及独立 Chrome profile，原生鼠标拖拽进入重点，不以 dispatch 一个伪 drop 替代整条交互。公开 UI 完成、刷新、更换接取集合、详情固定倒数、记支出均走真实 API。API 仅用于准备可控 fixtures 和核验最终事实；没有 mock 请求。截图等待有限动画结束后拍摄。

实际 viewport 为 375×812、1024×900、1440×900；包含 Today、月历、完整选中日、Library/Tasks/Wallet/Writing 表单。已目视检查移动端完整标题、弹窗 header/关闭/底部操作和固定导航，未用缩图冒充手机。

隔离数据库使用本次启动的 MySQL 8.0.25，127.0.0.1:33307、wb_product_bugs_test，应用全部 43 个 migration（head V42）。FIN-01 内置 fresh/upgrade 验证实际执行，未修改历史 migration。测试期间没有使用生产或长期开发数据。

构建仍给出已有主 bundle >500KB 提醒（约 690KB），未作为本片扩展重构。

## ARCHITECTURE CONFORMANCE

- Tasks 保持任务命令、日重点与完成记录 owner；新增 CompletedDay 拥有自身查询生命周期，useDailyFocus 拥有写入 pending/error 生命周期，不在 AppShell 镜像数据。
- Calendar 的 MonthActivityCalendar 拥有月范围查询与选中日交互；API calendarActivities 仅组合原事实。AppShell 移除旧月统计实现，仅组合 public feature，路由/日期继续归 AppShell。
- Finance 仅在其 canonical 流水读取修改排序，未在 Web 对单页重排。
- 更新 docs/ARCHITECTURE.md 与 docs/openapi.yaml，记录新只读 public 合同、完成事实、focus/pin 区分和流水顺序；不加依赖/全局 store/事实表。
- 专项 checker 除原 Finance/Settings 规则，还验证 Shell 不访问 Tasks/Calendar 私有模块、两 feature 不互相访问内部。0 边界错误。
- 两条 400 行复核信号：AppShell 579 行、Tasks index 449 行。已复核本次 delta：Shell 没有接收新表单/数据生命周期；月历完整移出其根实现。Tasks 的创建、编辑、完成仍由原工作流拥有，新增完成读取与重点写入分别在自己的 owner；保留根内既有列表组合与排序协调。没有为压行数做无关抽取，也没有把新生命周期塞回根组件。提醒是已审阅的规模信号，不是未通过的必需 gate。

## REMAINING_BLOCKERS

NONE。本工作包所需验证全部已运行。后续仅设计任务见交接文档；未自动推进下一项。

验收后清理：已删除 wb_product_bugs_test，停止本次启动的 33307 MySQL、3000 QA API、5187 QA Web 与 9337 独立 Chrome；5186 原开发 Web 保留。
