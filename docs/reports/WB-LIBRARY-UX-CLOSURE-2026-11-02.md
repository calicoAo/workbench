# WB-LIBRARY-UX-2026-11-02

RESULT: 本地实现与验收完成；尚未提交、推送或部署生产。

## ROOT_CAUSE

- Library API 按 `updatedAt` 排序，给旧作品打分或编辑会使它排到前面。
- 详情页面直接承载完整编辑表单，没有阅读/编辑入口区分。
- 编辑表单的简短备注区域误插入第二份 `releaseYear` 和 `description` 控件；同名 FormData 取第一项，第二份输入还会误导用户。
- 来源区使用 grid 将按钮逐项排成竖列。解除来源和丢弃导入草稿仍调用 `window.confirm`。
- 保存后仅失效缓存，编辑界面没有退出；状态更新也没有在界面补全完成日期。

## FIX

- API 以 `createdAt DESC, id DESC` 排序，时间相同时按录入 ID 稳定倒序。
- 默认详情为阅读视图；URL `?edit=1` 打开编辑，支持刷新/直达/前进后退。独立 LibraryItemEditor 拥有一次编辑快照、表单与保存状态，后台刷新不覆盖草稿。
- 编辑保存成功返回上一层详情，直接进入编辑 URL 则回退到对应详情。手录保存关闭弹窗并回到列表；从列表导入保存关闭导入面板并保留列表。
- 详情的状态、评分直接调用既有 Library PUT，保留 expectedVersion 冲突校验。设置已完成且没有完成日期时，由 Shell 注入的用户业务当天补全；已有完成日期和用户明确选择的日期保留。手录创建已完成作品也补全当天。
- 年份、简介各保留一份；简介与 shortNote 仍独立保存。
- 来源按钮横向排列，窄屏可换行。解除来源、丢弃草稿均注入 ApplicationFeedback.confirm；失败经应用通用 notice 展示。
- 优化封面、标题、阅读文字、个人记录、信息双栏和手机布局；表单保存/取消操作成组。
- 经 skill-installer 安装 `anthropics/skills` 的 `frontend-design` 到 `/Users/lijingru/.codex/skills/frontend-design`，下一轮可用。

## CANONICAL OWNER / ARCHITECTURE DELTA

Library API 继续拥有排序与作品持久化，Web Library 继续拥有详情/编辑/来源交互。Shell 仅注入现有业务日期与反馈回调；没有新增 API、schema、migration、全局 store 或 UI 依赖。架构表已记录详情/编辑与排序契约。

## REGRESSION_RISK

重点为详情/编辑的 URL 返回行为、来源刷新后重入、保存失败的草稿保留、状态/评分的版本冲突、创建完成日期与旧作品排序。已通过专项组件测试、真实 API/DB 与浏览器交互覆盖。已有外部简介与个人备注仍分别读写。

## TESTS_RUN

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| Web 全量 `npm run test -w apps/web` | PASS | 43 文件、429 测试；随后补充直达编辑默认日期案例并执行 Library 全部 6 项专项测试通过 |
| Library 专项（最终版本） | PASS | 6 项，覆盖阅读/编辑、唯一字段、保存返回、完成日期、评分、失败保留草稿、应用弹窗 |
| `vnext-11-14.test.ts` | PASS | 真实 MySQL，6 项；新增录入时间/同秒 ID/修改旧条目不重排回归；fresh/upgrade 实际执行 |
| `media-task-split.test.ts` | PASS | 真实 MySQL，9 项；V43 fresh/V42 upgrade、来源确认并发/重放/解除关联、相关事务回归；provider 使用 stub |
| API test TypeScript | PASS | `tsc -p apps/api/tsconfig.test.json --noEmit` |
| `npm run lint` | PASS | API/Web TypeScript 与 i18n audit |
| `npm run build` | PASS | API/Web 均成功；最后文字/CSS调整后 Web build 再次通过；存在既有大 chunk 提示 |
| `git diff --check` | PASS | 无空白错误 |
| `library-ux-browser-evidence.mjs` | PASS | 真实 UI/API/独立 DB；1440×1000、390×844、375×812；读取/编辑、保存返回、录入排序、完成评分、应用弹窗、刷新、无横向溢出、保存按钮避开底部导航 |
| 旧媒体 live browser 脚本 | NOT_RUN | 已适配新阅读视图/保存返回/应用弹窗并通过 `node --check`；本轮不再调用真实 TMDB/Open Library/DeepSeek，不消耗 provider 预算 |

测试环境复用本仓库已建立的本机临时 MySQL 8.0.25 运行方式（127.0.0.1:33307），任务专用 `wb_library_ux_test`，应用全部 migration 至 V43；独立 API 3000、Web 5188、Chrome CDP 9338。生产与长期开发数据库未用于验收。结束后删除任务数据库并停止本轮启动的 MySQL/API/Web/Chrome。

## EVIDENCE

- [浏览器断言](WB-LIBRARY-UX-2026-11-02-evidence/browser.json)
- [桌面详情](WB-LIBRARY-UX-2026-11-02-evidence/detail-final-1440.png)
- [手机详情](WB-LIBRARY-UX-2026-11-02-evidence/detail-final-375.png)
- [手机保存区域](WB-LIBRARY-UX-2026-11-02-evidence/editor-save-final-375.png)
- [通用确认弹窗](WB-LIBRARY-UX-2026-11-02-evidence/unlink-confirm-desktop.png)

REMAINING_BLOCKERS: NONE。本轮完成于本地工作区，生产发布尚未执行。
