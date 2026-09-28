# WB Shell / Adventure Acceptance Correction 001

Date: 2026-09-28

## ROOT_CAUSE

- Adventure 的 Grid 区域顺序正确但顶部状态区仍由两个独立 surface 组成，Current Adventure 高度不足；待续接虽在左列，却仍是 Quest Board 之外的页面级 Card。
- continuation mutation 成功后调用统一 `refresh()`，但该刷新遗漏 `queryKeys.continuations(userId, date)`。Assignment 快照会刷新，continuation 快照仍保留旧值，直到后续 refetch。
- Sidebar 继续把 Task、Project、Calendar、Life、Rewards、Tools 等平铺为一级入口；Hero HUD 也仍在工具按钮容器内。
- 375px 下 `.today-quests` 的隐式 Grid 列按 Task tabs 的 min-content 扩张，造成真实横向溢出。

## FIX

- `app/shell` 现在组合严格的 desktop 两列两行 Adventure：Current Adventure / Quest Board 在左，Water+Sleep compact status / Actual Timeline 在右。两组顶部均对齐。
- Water 与 Sleep 保持各自 feature owner，并在 Today 中以两个独立小块横向排列；8 个杯子与 `+1` 都可加量，任意已填充水杯可减 1，Sleep 保留 owner-owned 编辑入口。
- ContinuationPanel 作为 Quest Board 内部 section 渲染。统一刷新新增精确 continuation query invalidation；成功后同时读取新的 continuation 与 Assignment 真值，失败时不移除本地条目。
- Desktop 一级导航收敛为 Adventure、Notebook、Growth、Wallet、Library、Backpack；Adventure 和 Growth 提供二级导航。Mobile 主导航为 Adventure、Notebook、Growth、Wallet、Settings，Adventure 二级入口继续提供 Task、Project、Calendar、Life。
- Header 移除重复的日期/页面名块，Hero HUD 直接占据左上身份位，并明确显示 avatar、Lv、EXP 数值与进度条。
- Today 的内部 Grid 列固定为 `minmax(0, 1fr)`，消除 375px 的 min-content 溢出。

## REGRESSION_RISK

风险集中在 AppShell 导航 active state、Today 响应式布局、Hero Header 密度以及 continuation 成功后的多 query 同步。旧路由、domain truth、API contract、数据库 schema 和 mutation transaction 均未改变。

## TESTS_RUN

- Focused AppShell/Web: 29/29 PASS，覆盖成功即时迁移、失败保留、major module IA、secondary navigation、compact status 和 Hero HUD placement。
- Full Web: 28 files / 186 tests PASS。
- Real MySQL R1B transaction regression: 22/22 PASS，使用临时 MySQL 8.0.25 与独立 `_test` database。
- Workspace typecheck: PASS。
- Workspace lint + i18n audit: PASS，missing/untranslated/visible Chinese 均为 0。
- Workspace production build: PASS。
- Browser CDP acceptance: PASS at exact `1440x900` and CSS viewport `375x812`; no horizontal overflow。
- Browser Water interaction: PASS；`+1` 加量、空杯加量、任意满杯减 1 均经过真实 API 与刷新链路。
- Browser header/status layout: PASS；重复日期/页面名不存在，Hero 左侧 inset 16.25px，Water/Sleep 为 2 个同顶横向小块，间距 8.125px。
- Browser continuation transition: 82ms from click to continuation absent and accepted Task visible；API confirmed continuation empty and target Assignment present。
- Desktop measured alignment: top row delta 0px, top row height delta 0px, Quest/Timeline top delta 0px。

## Evidence

- `WB-ADVENTURE-correction-1440.png`
- `WB-ADVENTURE-continuation-before-1440.png`
- `WB-ADVENTURE-continuation-after-1440.png`
- `WB-SHELL-major-modules-1440.png`
- `WB-ADVENTURE-correction-375.png`

## Acceptance Gates

```text
ADVENTURE_TOP_ROW_ALIGNMENT: PASS
WATER_SLEEP_HORIZONTAL_BLOCKS: PASS
WATER_CLICK_INCREMENT_DECREMENT: PASS
QUEST_TIMELINE_ALIGNMENT: PASS
CONTINUATION_INSIDE_QUEST_BOARD: PASS
CONTINUATION_IMMEDIATE_UI_UPDATE: PASS
CONTINUATION_FAILURE_ROLLBACK: PASS
SIDEBAR_MAJOR_MODULE_IA: PASS
LEGACY_ROUTE_ACCESS: PASS
HERO_HUD_HEADER_PLACEMENT: PASS
HERO_HEADER_ROUTE_META_REMOVED: PASS
MOBILE_NAV_REGRESSION: PASS
FULL_WEB_REGRESSION: PASS
AFFECTED_API_REGRESSION: PASS
CORRECTION_GATE: PASS
```

## REMAINING_BLOCKERS

NONE.
