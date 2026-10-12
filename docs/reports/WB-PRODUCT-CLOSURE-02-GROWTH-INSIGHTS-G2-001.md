# PRODUCT-CLOSURE-02 / GROWTH-INSIGHTS-G2

## RESULT

**PASS — GROWTH-CATEGORY-DRILLDOWN COMPLETE.** 2026-10-12. G2 only. No schema/migration/write API/Rewards formula changes; no G3/G4, Save Point or AI features.

Acceptance target: current workspace on HEAD `ef8eb8796b6093c43bc37c7c2ddc08b3d0d44a87`, including prior completed closure work. Start baseline hashed all 548 tracked/untracked files; 533 remain identical, 15 overlap files have only scoped G2 increments, and no baseline file was removed. No commit/reset/cleanup of user work was performed.

## G1 PRECONDITION

Inspected the permanent [G1 report](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G1-001.md), evidence/logs, current Growth API/DTO, `growth-contributions.ts`, Tasks completion read and Execution range read. Confirmed exact seconds, immutable completion counts, distinct CLOSED Segment counts, Category identities/current mappings, disabled/unmapped/historical cases and period/timezone reconciliation. Re-ran all 12 G1 tests plus seven legacy Growth tests with current G2. G1's aggregate contract and attribution semantics remain intact.

## BEFORE

Growth exposed overview, dimension configuration and mapping configuration, but the UI could not identify contributing Categories/Tasks/Segments. Navigation was component-local with hash/replaceState changes. Existing ActualTime returned clipped business-date slices; a detail consumer needed the full source bounds separately.

## AFTER

Growth composes private Overview, configuration, contribution-list and on-demand Category detail owners. Three primary sections preserve existing XP/radar/trend/configuration while adding read-only progressive disclosure. No React statistics aggregation, statistics persistence, copied notes or second Task editor exists.

Implementation: [public composition](../../apps/web/src/features/growth/index.tsx), [Category presentation](../../apps/web/src/features/growth/category-insights.tsx), [detail presentation](../../apps/web/src/features/growth/category-detail.tsx), [Growth detail read](../../apps/api/src/growth-category-detail.ts).

## GROWTH NAVIGATION

`总览 → Dimension → Category → Task contributions → Session / Segment / Completion records`; `全部分类 → Category` is independent. `配置` retains both existing configuration workflows. Shared Button primitives expose selected/expanded states, accessible category names and explicit return controls. URL drives meaningful selection; local refs only restore focus to the named Growth content region.

## DIMENSION BREAKDOWN

Enabled configured Dimensions expose exact G1 metrics and an expandable Category list. Rows show current identity/color, duration, completion-event/Segment counts and share of that Dimension's seconds. Custom/renamed Dimensions are preserved. Unknown/disabled dimension deep links show a recoverable message; their Category history remains reachable through All Categories.

## ALL CATEGORIES

Uses the complete G1 `categoryBreakdown`, including current zero-activity definitions, disabled Categories, unmapped Categories, unavailable historical IDs, and supported unassigned/unknown buckets. Current mapping is explicit; missing mapping never invents an ability. No Category editor or mapping ownership move was added.

## CATEGORY DETAIL READ CONTRACT

`GET /api/growth/categories/:ref?period=7|30|90&to=YYYY-MM-DD[&taskRef=task:ID|unassigned][&cursor=...][&limit=1..50]`.

- Authenticated/user-scoped; rejects foreign Category identities (404) and missing identities with no own eligible history (404). Existing empty Category returns 200 and an empty task page. Historical unavailable identity is attested by own canonical facts.
- Uses shared `growthPeriod`, `actualTimeForRange`, `completionEventsForRange`, current configuration and the unchanged `growthContributions` aggregator.
- No taskRef: bounded Task contribution page. With taskRef: bounded canonical execution/completion-reference page. Default 20, maximum 50; stable source-key cursor binds user, Category, canonical period/timezone, Task and limit. Metrics remain whole-period and independent of paging.
- Batch Tasks metadata and Execution source-bound reads avoid DB requests per row. Pagination bounds output; eligible range aggregation uses the established G1 in-memory pattern rather than a new analytics framework/materialized table.
- Task current metadata can be unavailable while its stable historical ID/title snapshot survives. `completionNote` is explicitly current Task reflection, not a historical completion-note snapshot.

See [OpenAPI](../openapi.yaml) for payload fields and errors.

## TASK / EXECUTION DRILLDOWN

Task group metrics use the same eligible occurrence facts. The same Task can appear in multiple Categories. Task history groups records by canonical source, then Timer Session; Session envelope is context only. Each Segment exposes full real start/end/duration and separately the selected-period attributed seconds/slices. OPEN/VOIDED/deleted records and pause gaps are not contributions. Manual/Legacy Actual retains source identity and duration but adds no CLOSED Segment count. Canonical Task detail links are offered only while available.

Completion history exposes stable event ID, stored businessDate, lifecycle sequence and UTC occurrence timestamp. G2 normalizes the SQL UTC timestamp with existing `parseUtcDateTime` to ISO `Z` before presentation; browser acceptance compares the shown user-timezone time with SQL. Existing completion read selection and persisted facts were unchanged.

## METRIC RECONCILIATION

Real MySQL tests prove detail Category = G1 Category exactly for all four metric fields and trend; task sums reconcile seconds/event/source counts to Category; mapped Category totals reconcile to Dimension. No tolerance or separate scoring formula.

Browser fixture A: 900 seconds / 1 completion event / 2 CLOSED Segments. B: 780 seconds / 1 / 1. Their configured Dimension: 1680 seconds. Unmapped C: 360 seconds / 1 / 1. Public UI values match SQL sums/counts in both viewports. Cross-midnight test: full Segment 1200 seconds, two slices, one source identity; terminal excluded-period view attributes 300 seconds while showing the full 1200-second interval.

## HISTORICAL MAPPING SEMANTICS

Historical Category identity → current mapping → current enabled Dimension metadata. A mapping change reclassifies history without altering source Category IDs/timestamps/events. Disabled/unavailable categories retain valid contributions. i18n explanation near statistics makes current-mapping interpretation explicit. G4 mutation ownership remains deferred.

## TIMEZONE / PERIOD SEMANTICS

All surfaces use G1 inclusive 7/30/90 periods and AppShell's selected canonical date. Execution eligibility uses the configured user-timezone UTC window; report trends reuse G1 bucketing. Detail source slices retain original recordTimezone/businessDate. CompletionEvents retain stored business-date eligibility. Partial intervals, changed timezone, sub-minute work and source bounds are covered against real MySQL; no browser date bucketing reimplements this logic.

## URL / BACK-FORWARD BEHAVIOR

`view`, `period`, `dimension`, `category`, `task`, `cursor`, optional configuration `config`, and AppShell `date` live only in the existing Router URL. Back/Forward, direct links and remount/refresh retain these inputs; explicit return removes the current detail level while preserving parent context. `#dimensions` and `#mapping` still open the old configuration surfaces.

Confirmed AppShell date-picker parameter loss. The fix applies only on `/growth`: clone its current query, update date, clear the period-bound cursor and preserve compatibility hash. Other routes keep existing behavior. Invalid refs, failures, loading, empty and retry are recoverable/announced. Server query keys include user/category/period/date/task/cursor, with no previous-user placeholder. Existing Category/mapping invalidation and the Timer/AppShell refresh prefix invalidate the new projections.

## SESSION NOTE HANDLING

`timer_sessions.note` remains the only canonical owner. Fact page `sessions` contains one context per canonical Session ID; execution/slice records only reference it. One inline note per Session on the current page, even for several Segments/midnight slices. Pagination replaces pages instead of accumulating duplicate contexts. Task `completionNote` is separately labeled “任务完成反思（当前）”. Neither note creates an event or XP contribution.

## REAL MYSQL TESTS

Native isolated MySQL 8.0.25 on 127.0.0.1:33307. Probed established candidates; no service was available. Used the previously established native temporary-datadir convention. Source QA database: `workbench_growth_g2_qa_test`; every new detail test also provisions/drops its own `_test` database. All 42 current forward SQL migrations through V41 applied freshly; legacy Growth suite also verified its V31→V32 upgrade. Production/development databases untouched.

- [23 new detail tests](../../apps/api/tests/growth-category-detail.test.ts): all requested scenarios, plus virtual buckets, Manual/Legacy source bounds and missing Task metadata; PASS.
- 12 unchanged G1 + seven legacy Growth tests: PASS. Combined [focused API log](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G2-focused-api.log): 42/42, zero skipped/cancelled.
- [R1B/R1D regression log](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G2-execution-regression.log): 46/46 PASS.
- API source/test TypeScript checks and final API production build: PASS.

Fixture-only foreign-key disabling/deletion for unavailable-history assertions does not modify migrations or weaken production guards.

## WEB TESTS

- [Growth focused tests](../../apps/web/src/features/growth/index.test.tsx): 27 PASS, including all requested G2 scenarios and existing G1/Overview/configuration behavior.
- Growth + AppShell + Timer [focused log](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G2-focused-web.log): 85/85 PASS. Covers scoped date picker, user isolation/late responses, URL history/refresh, error/retry, metric labels, full/clipped intervals, distinct notes, inherited radar/config and authenticated invalidation.
- [Full suite](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G2-full-web.log): 35 files / 352 tests PASS.
- API/Web typecheck, lint/i18n audit and production builds PASS; i18n has zero missing translations, untranslated English or visible unwrapped Chinese. Vite emits the existing bundle-size warning at ~501 kB; no scope expansion into bundle redesign.

## BROWSER ACCEPTANCE

[Permanent existing-mechanism CDP script](../../scripts/growth-g2-browser-evidence.mjs), [machine evidence](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G2-browser.json), fresh headless Chrome profile, isolated API:3000 / Web:5185 / MySQL:33307. Real public Growth UI path in 1440×1000 and 375×812 CSS viewports:

1. Authenticated APIs create custom Dimension X, A/B mapped to X, unmapped C, publish/claim Tasks, start/pause/resume/finish with notes and atomic completion.
2. Fixture SQL adjusts only elapsed-time intervals/session cache in the disposable database to stable positive durations; IDs, assignment, completion and note facts come from real authenticated commands.
3. Keyboard opens Dimension → A → Task → execution, verifies two Segments / one Session note / separate current Task reflection and exact SQL metrics/UTC event display.
4. Browser Back/Forward and explicit Back restore Task/Category/Dimension context.
5. All Categories → C, period 30→7, historical date via real AppShell date input (zero activity), browser Back, direct Category/Task link and real page reload.
6. Assert CSS viewport, no horizontal overflow, visible Task navigation target via hit testing, footer above fixed bottom navigation, and all mobile controls ≥44px. Added only scoped Growth footer scroll margin and navigation target heights after real mobile QA exposed overlap.

Screenshots: [Category desktop](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G2-category-1440.png), [Category mobile](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G2-category-375.png), [history desktop](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G2-history-1440.png), [history mobile](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G2-history-375.png), [restored mobile detail](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G2-direct-375.png). Screenshot scroll positions are intentional; control visibility and bottom overlays are separately asserted by real geometry/hit testing.

## ARCHITECTURE CONFORMANCE

Growth owns the derived read contract/presentation/feature URL state. Tasks owns completion facts and current Task metadata; Execution owns ranges/source bounds; Category owns metadata and the same mapping field; Rewards owns XP. AppShell changes only composition/date navigation plus established projection invalidation. Private Overview/configuration/detail owners keep the public root composition-focused. No new dependency, global store, event bus, generic analytics/maintenance/navigation layer, API write or persistence source.

Updated [architecture record](../ARCHITECTURE.md) and [OpenAPI](../openapi.yaml). [Architecture checker](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G2-architecture.log): 0 errors / 0 warnings under default checker configuration; existing permanent frontend boundary checks also passed in full Web. Tracked + new source/document/script `git diff --check` PASS; source baseline preservation audited separately.

## REMAINING BLOCKERS

**NONE for G2.** All required real-DB reconciliation, UI and browser gates ran successfully. Temporary database/services/profile cleaned; cleanup evidence saved alongside this report.

Separate pre-existing rapid-close observation discovered during fixture preparation is [recorded independently](WB-PRODUCT-CLOSURE-02-GROWTH-G2-ADJACENT-OBSERVATION.md), with no change to the closed Task/Execution/G1 slices. G3/G4 remain unstarted.
