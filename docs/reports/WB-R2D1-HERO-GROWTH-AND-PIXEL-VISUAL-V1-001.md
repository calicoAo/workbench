# WB-R2D1 Hero Growth + Pixel Visual V1

Date: 2026-09-24  
Scope: R2D1 only. AI Foundation, Familiar, Decision AI, Agent Bridge, Agent Wallet, Finance Projection, inventory, equipment, and skill trees were not started.

## Owner audit

```text
EXISTING_GROWTH_OWNER:
- No canonical GrowthDimension/Ability table existed at V31.
- The existing web-only dimension enum was presentation/config vocabulary, not a durable configurable owner.
- V32 adds one owner only: growth_dimensions.

XP_OWNER:
- apps/api/src/rewards.ts
- growthSummary(), levelFromXp(), and xpForLevel() remain the only progression formula owner.
- Growth reads that owner and does not store or recompute a second formula.

CATEGORY_MAPPING_OWNER:
- task_categories.dimension_key, already nullable before V32.
- V32 points the existing nullable key at the new per-user GrowthDimension configuration.
- "暂不映射" is represented by NULL; no competing mapping table was added.
```

## Delivered behavior

- Added configurable per-user Growth dimensions with six defaults: 事业、学习、创作、生活、身体、社交.
- Registration maps 工作/学习/创作/生活/健康/社交 to those defaults and leaves 其他 unmapped.
- Disabling a dimension atomically clears current category mappings to `NULL`; historical Task, CompletionEvent, ActualTime, and category records remain unchanged.
- Added a Growth composition API for 7/30/90-day periods. It derives all metrics at read time and persists no period totals, shares, chart values, or synthetic Growth events.
- Actual investment consumes the reusable ActualTime read capability. Timer projections remain excluded, while timer segments, Manual Actual, and Legacy Actual are counted once.
- Task counts consume CompletionEvent history, including reopened/recompleted tasks. V32 snapshots the category at completion occurrence so later Task edits do not erase historical attribution.
- Current Category → GrowthDimension mapping deliberately reinterprets historical Growth reports. The UI states this explicitly.
- Habit completions are shown only as an aggregate summary. No name-based dimension inference was introduced.
- Finance transactions, balances, budgets, and amounts do not contribute to XP or Growth dimensions.
- Added `/growth`, desktop navigation between 回看 and 奖励, and a compact read-only Today entry. Mobile bottom navigation remains exactly five items.
- Added Pixel Visual V1 slots, manifest, integer-sized layout slots, `image-rendering: pixelated`, and same-size Lucide fallbacks. No random downloads, generated pixel art, or emoji assets were added.

## Architecture and migration

- V1-V31 were not modified. Schema change is forward-only `V32__add_growth_dimensions.sql`.
- Fresh V1→V32 and upgrade V31→V32 both pass using real MySQL.
- Growth owns only dimension configuration and derived composition.
- Growth does not own Task, ActualTime, CompletionEvent, Rewards, Habit occurrence, or Finance facts.
- Public Growth API is documented in `docs/openapi.yaml`; YAML parse passes.
- `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT_PLAN_VNEXT.md`, and `docs/PIXEL_ASSET_CONTRACT_V1.md` record the durable boundary and asset contract.

## Verification

| Check | Result |
|---|---|
| Growth API focused | PASS — 7/7 |
| Full API | PASS — 126/126 |
| Growth/AppShell Web focused | PASS — 23/23 |
| Full Web | PASS — 140/140 |
| Workspace typecheck | PASS |
| Workspace lint | PASS |
| Production build | PASS |
| `git diff --check` | PASS |
| OpenAPI YAML parse | PASS |
| Migration immutability | PASS — only V32 added |

The full API run initially exposed one stale R2D0 test cleanup path that deleted a newly registered user before deleting its V32 Growth dimensions. The cleanup order was corrected; production behavior was not weakened.

## Browser evidence

The CDP evidence runner used isolated MySQL QA data and exact device metrics. Every mobile capture asserted:

```text
window.innerWidth = 375
window.innerHeight = 812
document.documentElement.scrollWidth = 375
```

Evidence:

- `WB-R2D1-growth-overview-1440.png`
- `WB-R2D1-growth-dimensions-1440.png`
- `WB-R2D1-growth-mapping-1440.png`
- `WB-R2D1-growth-overview-375.png`
- `WB-R2D1-growth-dimensions-375.png`
- `WB-R2D1-today-growth-entry-375.png`

Automated browser assertions also proved:

- six investment bars and six dimension cards;
- no “能力值” presentation;
- no Finance value text in Growth;
- no broken images after asset fallback;
- five mobile bottom-nav items;
- no Growth interaction/FAB collision;
- no FAB/bottom-nav collision;
- dimension controls remain inside the 375px viewport;
- Today entry is fully visible and links to the dated Growth route.

Manual visual review confirmed Hero identity, Level/XP hierarchy, readable modern productivity UI, visible pixel-fantasy accents, visible unmapped attribution, and no horizontal overflow.

## Final gates

```text
EXISTING_GROWTH_OWNER_AUDIT: PASS
GROWTH_DIMENSION_MODEL: PASS
CATEGORY_GROWTH_MAPPING: PASS
HERO_XP_SINGLE_TRUTH: PASS
HERO_LEVEL_SINGLE_TRUTH: PASS
ACTUALTIME_GROWTH_ATTRIBUTION: PASS
TASK_COMPLETION_GROWTH: PASS
UNMAPPED_ATTRIBUTION: PASS
PERIOD_SEMANTICS: PASS
GROWTH_OVERVIEW: PASS
GROWTH_DIMENSION_UI: PASS
PIXEL_VISUAL_V1: PASS_WITH_MISSING_ASSETS
MOBILE_GROWTH: PASS
TODAY_GROWTH_COMPOSITION: PASS
FINANCE_REGRESSION: PASS
FULL_REGRESSION: PASS
R2D1_GATE: PASS
READY_FOR_AI_FOUNDATION: YES
```

`PASS_WITH_MISSING_ASSETS` is intentionally limited to visual assets: the stable slots and fallbacks are complete, while the user-owned final pixel artwork is not present. It does not block Growth functionality or R2D1.
