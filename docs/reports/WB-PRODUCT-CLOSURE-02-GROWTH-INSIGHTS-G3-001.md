# PRODUCT-CLOSURE-02 / GROWTH-INSIGHTS-G3

## RESULT

**PASS — GROWTH-VISUAL-ALIGNMENT COMPLETE.** 2026-10-12. G3 only; G1/G2 remain closed. Acceptance covers the current working tree, including its existing uncommitted closure work.

## VISUAL INCONSISTENCIES CONFIRMED

Compared the current Growth composition with Today/Adventure, Finance Overview, Task controls, Categories editor, shared UI primitives and Snow Soda semantic tokens. Growth had its own two-pixel pixel borders, offset hard shadows, grid/gradient Hero background, tall portrait area and black XP frame. Distribution was repeated as bars, donut and radar. The radar filtered out zero-investment dimensions and retained a fixed four-axis grid regardless of configured dimensions; custom labels were absent. Trend date labels used a horizontally scrolling strip with low-contrast muted literals. G2 details lacked consistent heading/group spacing and configuration used raw icon buttons.

Existing older [Overview evidence](WB-GROWTH-V2-overview-1440.png) illustrates the decorative Hero treatment; it predates G2 and is not represented as an identical current-data before capture. [G2 mobile detail evidence](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G2-category-375.png) shows the pre-G3 detail and trend label treatment. Current source was the implementation baseline.

## BEFORE / AFTER

| Before | After |
| --- | --- |
| Tall decorative Hero, hard XP border | Compact neutral surface, small portrait, semantic XP progressbar |
| Bars + donut + radar repeating shares | One radar + precise readable text legend |
| Fixed diamond grid / active-only axes | Configured axes, including zero activity; numbered labels match full names |
| Separate pastel literals/shadows | Existing surface/border/text/accent tokens |
| Scrollable trend label strip | Wrapping readable date/value grid |
| Stacked desktop dimension summaries | Compact dimension + metrics rows; nested categories remain distinct |
| Raw configuration icon buttons | Existing labelled shared IconButton |

## OVERVIEW

Hero progression and XP/Coins remain Rewards-owned and separate from period effort. The same canonical summary fields display actual minutes, completion-event count, distinct CLOSED Segment count and Habit completions. `completionEventCount` is used explicitly; G1 guarantees the former `completedTaskCount` compatibility alias is equal. No calculation, rounding, eligibility or reward changes. The existing pixel asset/fallback contract remains, with an 80px desktop / 56px mobile portrait. Today Growth entry and Hero HUD were not changed.

## RADAR

The sole distribution visualization uses configured Dimension order/names/colors. Zero-investment axes remain present. Concentric polygons and axes match the actual dimension count; one/two-dimension configurations use lines/points rather than an empty polygon. Radius represents the existing share directly, without the prior decorative minimum radius. No new score or data normalization is introduced.

A bounded 200px SVG uses numbered labels paired with an ordered HTML legend containing full configured name, existing minute formatting and existing rounded percentage. SVG `desc` provides equivalent values through `aria-describedby`. User names wrap instead of colliding with chart axes or being truncated. Removed unused donut/bar/dimension-card rules after confirming no other consumers.

## DIMENSION BREAKDOWN

Desktop summary places the Dimension toggle next to its three canonical metrics. Mobile retains stacked rows. Expansion has a chevron, underline and unchanged `aria-expanded` / `aria-controls`. Nested Category rows retain exact user-owned category colors, full names, duration, event/Segment counts and existing share calculation. URL remains the only selected-Dimension truth.

## ALL CATEGORIES

Uses the same compact Category rows and current metadata. Zero-activity rows remain selectable, show zero metrics and an explicit existing empty-activity message. Existing unmapped/disabled/unavailable/history labels are preserved; no second editing surface is added.

## CATEGORY DETAIL

Category-colored identity heading groups mapping and selected period/timezone. The order remains identity → period metrics → trend → contributing Tasks → execution/completion detail. Task titles wrap and actions align with the content. Session groups, notes and source execution cards have distinct spacing and neutral surfaces.

Full Segment duration and current-period attributed duration remain separately labelled, with unchanged source intervals and business-date slice disclosure. Session note stays Session-owned and deduplicated; current Task completion reflection remains a separate group. Query keys, pagination, focus placement, API reads and route transitions are unchanged.

## CONFIGURATION

Dimensions and Category mapping retain their existing forms, commands, invalidation and error behavior. Replaced only raw move/rename buttons with shared labelled IconButton; existing optimistic expectedVersion payload is unchanged and tested. Disabled rows use a neutral surface instead of fading all their text. Long custom names/keys wrap. Native mapping select options, enabled behavior, rename prompt and mutations remain unchanged. G4 ownership work is not implemented.

## SHARED PRIMITIVES

Reused existing Button/IconButton and field styles. Management/back/drilldown actions use the existing ghost/small variants where appropriate. Primary/secondary navigation uses the same shared Buttons, existing pressed semantics and a visible selected underline. No shared component implementation, global token, new dependency or presentation framework was introduced. Growth-local selectors in the existing stylesheet consume semantic tokens; pixel classes used by other features remain intact.

## ACCESSIBILITY

- Selected and expanded states are visible through underline/chevron and accessible state, rather than color alone.
- Radar values are readable in HTML and associated SVG description. Trend bucket values/dates remain visible text.
- Full category/task/custom dimension names wrap; important values are not truncated.
- XP exposes progressbar name/min/max/current value. Existing detail focus transfer remains intact with visible scoped focus styling.
- Growth mobile buttons, inputs, selects, details summaries and Task detail link have at least 44px target height; IconButtons also have a 44px minimum width.
- Growth-local reduced-motion rule disables transitions/animations and respects the preference without changing shared primitives.
- Feature body/secondary text uses existing primary/secondary tokens instead of the old low-contrast muted literals. Shared controls retain their existing appearance.

## MOBILE / DESKTOP VISUAL REVIEW

[Permanent CDP acceptance script](../../scripts/growth-g3-browser-evidence.mjs) reuses the established G2 browser mechanism; no additional automation framework. [Machine evidence](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-browser.json).

Real Chrome CSS viewports: **1440×1000, 375×812, 900×900**. Captured and visually reviewed Overview, radar, expanded Dimension, All Categories, Category Detail, Task execution history/Segment groups, dimensions configuration and Category mapping at desktop and mobile. Additional long-name configuration capture proves the full custom name and reachable actions. Reviewed the changed final compact desktop summary and mobile configuration/Segment screenshots after the final spacing pass.

Representative evidence:

- [Desktop Overview](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-overview-1440.png), [mobile Overview](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-overview-375.png)
- [Desktop radar](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-radar-1440.png), [mobile radar](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-radar-375.png), [900px radar](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-radar-900.png)
- [Desktop expanded Dimension](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-expanded-dimension-1440.png), [mobile expanded Dimension](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-expanded-dimension-375.png)
- [Desktop All Categories](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-all-categories-1440.png), [mobile All Categories](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-all-categories-375.png)
- [Desktop Category Detail](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-category-1440.png), [mobile Category Detail](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-category-375.png)
- [Desktop execution](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-history-1440.png), [mobile execution](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-history-375.png), [mobile Segment groups](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-segments-375.png)
- [Desktop configuration](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-configuration-1440.png), [mobile configuration](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-configuration-375.png), [mobile long custom name](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-configuration-long-name-375.png)
- [Desktop mapping](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-mapping-1440.png), [mobile mapping](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-mapping-375.png)

Assertions confirm CSS viewport, no horizontal page overflow, radar labels inside SVG bounds, full text legend rows within width, mobile target heights, Task target hit testing, configuration actions clear of fixed FAB/navigation after scrolling into view, and footer above mobile navigation. Fixed shell UI remains unchanged; all content/actions can scroll clear of it. Keyboard Enter drilldown, Back/Forward, direct-link reload, period selection and AppShell date integration pass.

Browser fixtures use an isolated native MySQL 8.0.25 on 127.0.0.1:33307, fresh `workbench_growth_g3_qa_test`, all 42 SQL migrations through V41, isolated API/Web and fresh Chrome profile. Public authenticated commands create Tasks/Sessions/notes/completion; SQL only retimes disposable positive elapsed-time fixtures as in G2. UI values reconcile exactly with real SQL seconds/events/Segments. [Cleanup evidence](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-cleanup.json) records dropped QA database and stopped temporary processes/profile/datadir. No production/development database was touched.

## TESTS

| Gate | Actual result |
| --- | --- |
| Focused Growth + AppShell | PASS — 84 tests, including Growth 32 / Shell 52 |
| Full Web suite | PASS — 35 files, 357 tests |
| API + Web typecheck | PASS — `npm run typecheck` |
| API/Web lint + i18n audit | PASS — 0 missing, untranslated English or visible Chinese strings |
| Production API + Web build | PASS — `npm run build`; nonblocking Vite >500kB chunk notice retained |
| Architecture checker | PASS — 0 errors / 0 warnings (default checker; manual boundary review below) |
| Diff whitespace / new script syntax | PASS — `git diff --check`, new script no-index whitespace check, `node --check` |
| Real Chrome acceptance | PASS — desktop/mobile flows plus intermediate radar and reduced-motion assertion |
| New API/MySQL integration suite | NOT REQUIRED / NOT RUN — API/data contracts unchanged; browser acceptance itself uses isolated real MySQL |

Five focused permanent G3 regressions cover configured zero axes/long labels/readable exact legend, single-axis nonempty rendering, completion/Segment/XP semantic accessibility, shared labelled configuration controls with unchanged expectedVersion write, and zero-activity Category visibility. G1/G2 Web regressions remain green, including source/attribution distinction and note deduplication. Final CSS spacing pass was rebuilt and rerun through real browser acceptance; no subsequent production code changes.

## ARCHITECTURE CONFORMANCE

Growth remains the presentation owner and consumes existing public contracts; feature root still composes Overview/configuration/contribution/detail owners. AppShell owns canonical date and router composition. Tasks/Categories/Execution/Rewards remain canonical data owners. No query state mirroring, new store, effect synchronization, API/schema/migration/formula/timezone/URL change, cross-feature private import, global shared UI change or G4 work.

No durable ownership contract changed, so `docs/ARCHITECTURE.md` is unchanged in this slice. Compared to the start-of-G3 hash baseline, 561 of 568 preexisting files remain byte-identical. Seven overlapping Growth/style/test files carry this slice's changes; all API, migrations, shared UI, AppShell, contracts and previous reports/scripts remain byte-identical. [Preservation evidence](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3-workspace-preservation.json).

## REMAINING BLOCKERS

**NONE for G3.** No mandatory verification remains. The already-recorded G2 adjacent zero-duration Timer observation remains outside this visual slice and was not changed. G4 is not started.
