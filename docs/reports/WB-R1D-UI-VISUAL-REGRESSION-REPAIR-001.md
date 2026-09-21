# WB-R1D-UI-VISUAL-REGRESSION-REPAIR-001

Date: 2026-09-20  
Branch: `codex/workbench-auth-system`  
Baseline HEAD: `531569197d64a6d43abfea43be855e77937168d6`

## 1. Scope

This repair restores the lighter R1D visual hierarchy while preserving the component ownership and Timer deduplication delivered by `WB-R1D-UI-COMPONENT-CONSOLIDATION-001`.

Changes are limited to shared primitive presentation, R1D Tasks composition styling, one Task card active-state class, focused tests, screenshots, and this report. No API, backend, database, migration, Task/Assignment/Timer semantics, `operationId`, ActualTime, Router, Query ownership, or R1.5 behavior changed.

## 2. Root Cause

The regression came from three narrow causes:

1. `Button` used its interactive element as the visible surface, so the mobile 44px touch target also became a 44px outlined rectangle.
2. A mobile `.bounty-board button, .bounty-board a` rule enlarged every Tasks toolbar, tab and menu control regardless of semantics.
3. The Tasks active tab and active `FilterChip` inherited high-emphasis fills that competed with primary CTAs.

The component extraction and ownership boundaries were not the cause and were retained.

## 3. Repair

### Shared Button contract

`Button` now renders a `.ui-button-visual` inside the interactive button. On mobile the outer button remains a 44px-high touch target, while the visible surface remains compact. `FinishSessionButton` uses the same structure without changing its public props or Timer command behavior.

Variant hierarchy is explicit:

- Primary: solid mint, high-contrast text.
- Secondary: light mint background and subtle mint border.
- Ghost: transparent by default; gains a light surface on interaction.
- Danger: light pink destructive treatment.

### Badge, FilterChip and IconButton

- Neutral Badge lost the button-like white outline and remains compact metadata.
- Active FilterChip now uses pale mint with dark-mint text instead of matching the solid primary CTA.
- IconButton retains the prior 44x44 mobile wrapper and approximately 23x23 visual surface.

### Tasks composition

- The blanket mobile button/link enlargement was removed.
- Header actions use shared compact Button surfaces: secondary accept, primary publish.
- Tabs use mint navigation state instead of near-black.
- Filters use a lighter container, 26px rendered controls, and a two-column category/priority row on 375px.
- The running bounty card receives a light mint active border/background so its status has a visual anchor without restoring duplicate Timer controls.

## 4. Visual Regression Matrix

| Surface | Before extraction | Broken state | Repaired state | Cause |
| --- | --- | --- | --- | --- |
| Today CurrentFocus | Light secondary actions plus one mint primary | Three similar large white outlined rectangles | Two light mint secondary surfaces and one solid mint primary; 44px hit target with ~29px visual surface | Primitive default + size coupling |
| Today header actions | Compact toolbar with one clear primary | Three oversized card-like controls | Ghost completed, light secondary accept, compact mint add | Primitive default + size misuse |
| Today TaskCard | Strong title, mint execution accent, subdued metadata | Timer controls correctly removed but hierarchy became visually flat | Dedup remains; title strongest, RUNNING mint, metadata subdued, More ghost | Context composition |
| Tasks page header | Title-led header with compact actions | Two large white outlined blocks | Compact light secondary accept and solid mint publish | Size misuse + variant hierarchy |
| Tasks tabs | Theme-colored navigation state | Near-black active tab | Pale mint active tab with dark-mint text | Context styling |
| Tasks filters | Light personal-tool controls | Vertically stacked admin-form appearance | Light search row; category and priority side by side; reduced border/background weight | Context composition |
| Tasks TaskCard | Dense task facts with visible active state | Large empty card surface and weak running anchor | Tighter gaps and light mint active border/background; metadata and reward remain subordinate | Context composition |
| MiniTimer | Compact cross-route control | Functionally correct; no repair needed to ownership | Preserved; four 44px targets with ~23px icon visuals | No regression in primitive contract |
| Icon buttons | Compact visual with accessible target | Correct after consolidation | Preserved unchanged | Already correct |
| Filter chips | Mint navigation/filter state | Solid mint competed with primary CTA | Pale mint selected state, dark-mint text, horizontal mobile behavior preserved | Primitive default |

## 5. Component and Ownership Preservation

- `Button`, `IconButton`, `Badge`, and `FilterChip` remain in `shared/ui`.
- `CurrentFocusCard`, `MiniTimer`, `FinishSessionButton`, current-session query, and Timer commands remain in `features/timer`.
- Task cards, bounty cards, and task workflows remain in `features/tasks`.
- AppShell still owns only route placement: `/today` renders CurrentFocus and hides MiniTimer; non-Today routes render MiniTimer when a Session exists.
- The 62/38 Today grid, mobile bottom safe-area variables, Router/Query ownership, and existing feature boundaries are unchanged.

No architecture contract changed, so `docs/ARCHITECTURE.md` required no additional decision record for this repair.

## 6. Browser Evidence

Browser: headless Google Chrome against the running local Web/API and the isolated `r1d_e2e` test account. The smoke finished the Session and left `/api/timer-sessions/current` as `null`.

Executed sequence:

```text
start
-> Today
-> pause
-> Tasks (MiniTimer visible)
-> resume
-> Today (CurrentFocus visible, MiniTimer hidden)
-> finish
```

### 375px Today

- `CurrentFocusCard=1`, `MiniTimer=0`.
- CurrentFocus outer button targets: 44px high.
- CurrentFocus visible surfaces: approximately 29.25px high.
- Secondary surfaces: light mint; complete-and-finish: solid `rgb(53, 201, 154)`.
- Active TaskCard text is limited to title, `RUNNING · elapsed`, category and More; no pause/finish controls.
- Document width equals viewport width: 375px, no horizontal overflow.
- At maximum scroll, the last content ends 24.16px above the bottom navigation.

### 375px Tasks

- `CurrentFocusCard=0`, `MiniTimer=1`.
- Header actions have 44px outer targets and approximately 29.25px visible surfaces.
- Active tab background is mint `rgb(221, 248, 238)`, not ink/black.
- Search occupies one row; category and priority share the next row; each rendered filter control is 26px high.
- Running TaskCard has a light mint active surface and status anchor.
- MiniTimer actions remain four 44x44 targets with approximately 22.75px inner visuals.
- No horizontal overflow; MiniTimer and bottom navigation do not overlap.

### 1440px Today

- `CurrentFocusCard=1`, `MiniTimer=0`.
- CurrentFocus actions render at approximately 29.25px high with clear secondary/primary hierarchy.
- Today task/timeline widths remain 756.17px / 453.70px, approximately 62/38.
- TaskCard remains Timer-deduplicated and Timeline actions remain available.
- No horizontal overflow.

Screenshots:

- `docs/reports/WB-R1D-visual-repair-375-today.png`
- `docs/reports/WB-R1D-visual-repair-375-tasks.png`
- `docs/reports/WB-R1D-visual-repair-1440-today.png`

The earlier UX and broken-state screenshots remain unchanged for comparison.

## 7. Regression

| Check | Result | Evidence |
| --- | --- | --- |
| Component-focused tests | PASS | 4 files, 27 tests |
| Full Web tests | PASS | 14 files, 69 tests |
| Typecheck | PASS | `npm run typecheck -w apps/web` |
| Lint | PASS | `npm run lint -w apps/web` (`tsc -b --noEmit`) |
| Build | PASS | `npm run build -w apps/web`; 1661 modules transformed |
| Diff whitespace | PASS | `git diff --check` |
| Browser Timer smoke | PASS | Real start/pause/navigation/resume/finish sequence |

## 8. Final Gate

```text
CURRENT_FOCUS_HIERARCHY:
PASS

MOBILE_BUTTON_DENSITY:
PASS

TASKS_HEADER_ACTIONS:
PASS

TASK_TABS_THEME:
PASS

FILTER_VISUAL_DENSITY:
PASS

TASK_CARD_HIERARCHY:
PASS

SHARED_COMPONENTS_PRESERVED:
PASS

TIMER_DEDUPLICATION_PRESERVED:
PASS

VISUAL_REGRESSION_REPAIR:
PASS

READY_FOR_R1_5:
YES
```
