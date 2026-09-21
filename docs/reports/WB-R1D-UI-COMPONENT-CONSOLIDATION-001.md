# WB-R1D-UI-COMPONENT-CONSOLIDATION-001

Date: 2026-09-20  
Branch: `codex/workbench-auth-system`  
Baseline HEAD: `531569197d64a6d43abfea43be855e77937168d6`

## 1. Scope

This work package closes the R1D interaction hierarchy and consolidates only the stable UI primitives already repeated across the R1D surfaces. It does not change API contracts, database schema, migrations, Task/Assignment/Timer semantics, `operationId`, ActualTime, or query ownership.

The existing dirty worktree and all prior R1A-R1D WIP were preserved. The implementation is limited to Web components/styles, focused tests, the architecture contract, browser evidence, and this report.

## 2. Existing UI Component Audit

Audit method:

```text
rg -n '<button|className="[^"]*(button|command|action|chip|badge|pill)|<Button|<IconButton|<Badge|<FilterChip' apps/web/src --glob '*.tsx' --glob '!**/*.test.tsx'
```

### Existing button-like implementations

| Location | Purpose | Repetition / inconsistency | Decision |
| --- | --- | --- | --- |
| `styles.css`: `.primary-button`, `.secondary-command`, `.danger-secondary` | Text CTAs | Similar borders, radius, weight and heights are repeated with different class names | R1D core consumers moved to shared `Button`; unrelated legacy features remain deferred |
| `styles.css`: `.icon-button`; feature-local `h-7`, `h-8`, `h-9`, `w-7`, `w-8`, `w-9` overrides | Icon-only actions | Visual box and hit target were coupled; mobile targets ranged below 44px | R1D core consumers moved to shared `IconButton` with separate outer and visual boxes |
| `features/timer` | Pause/resume, finish, cancel, navigation | MiniTimer, Current Focus and finish dialog each composed controls independently | All consume shared primitives while Timer retains command ownership |
| `features/tasks` | Publish, accept, start, edit, archive, modal actions | CTA styles and pills were mixed across Today, bounty board and dialogs | R1D task surfaces consume `Button`, `IconButton`, `Badge`, `FilterChip` |
| `features/calendar` and `timeline.tsx` | Add/save/cancel and event edit/delete | Repeated CTA and icon-only styles | R1D calendar surfaces consume shared primitives |
| `app/shell` Quick Add and segmented/layout controls | Menu trigger and mode selectors | Behavior-specific controls, not generic CTA duplicates | Kept local; no speculative component added |
| Auth, Categories, History, Writing, Rewards, Tools | Stable pre-R1D feature controls | Still use legacy classes | Deferred because the task explicitly does not require whole-site replacement |

### Component inventory

| Primitive / component | Owner | Current consumers | Reason to keep / extract |
| --- | --- | --- | --- |
| `Button` | `shared/ui` | Timer, Tasks, task workflows/detail, Calendar | Stable command contract with `primary`, `secondary`, `ghost`, `danger`; `sm`, `md`, `lg`; loading/disabled state |
| `IconButton` | `shared/ui` | MiniTimer, Task row, finish dialog, task modal, TimelineEvent, Calendar | Stable accessible icon action with mandatory label and independent hit/visual boxes |
| `Badge` | `shared/ui` | Timer state, task status/difficulty/category/counts, bounty board | Read-only compact status; four small tone variants |
| `FilterChip` | `shared/ui` | Today task dimension filters | Interactive selected state, counter and optional color marker; distinct from `Badge` |
| `TaskRow` / Task card | `features/tasks` | Today task panel | Domain data and actions; intentionally not promoted to generic UI |
| `BountyCard` | `features/tasks` | Tasks route | Different task-domain object view; stays private to the same owner |
| `CurrentFocusCard` | `features/timer` | Today route | Owns the complete current-session presentation and consumes the one Timer command surface |
| `MiniTimer` | `features/timer` | AppShell on non-Today routes | Cross-route compact Timer control; no independent session state |
| Timeline event rendering | `features/calendar/timeline.tsx` | Today and Calendar | Schedule/ActualTime-specific rendering; only its icon actions are generic |
| Page header / Quick Add | AppShell or route owner | One composition each | Not sufficiently repeated or stable to extract |

## 3. Timer Duplication Fix

`CurrentFocusCard` now lives in `features/timer` and is the only complete Timer controller on `/today`. It shows the task title, RUNNING/PAUSED state, segment-derived net time, pause/resume, finish, and complete-and-finish.

The active Today task row now shows only lightweight execution state, elapsed time and category. Pause, finish, cancel and complete-and-finish controls were removed from that row and secondary edit/category/cancel actions moved under More.

AppShell renders `MiniTimer` only when a current session exists and `location.pathname !== "/today"`. The existing `useCurrentSession` query remains the single source of current-session state; no second query or local session copy was introduced.

Architecture guardrails now assert that `CurrentFocusCard` is exported by Timer, AppShell no longer implements a local CurrentFocus, and the `/today` MiniTimer exclusion remains in route composition.

## 4. Button / IconButton Consolidation

`apps/web/src/shared/ui/index.tsx` provides the minimal common surface:

- `Button`: `primary`, `secondary`, `ghost`, `danger`; `sm`, `md`, `lg`; disabled and `aria-busy` loading semantics.
- `IconButton`: mandatory accessible `label`; `sm`, `md`, `lg`; reusable class helper for link-shaped icon actions.

The conceptual `icon` size is represented by `IconButton`, rather than adding an ambiguous `Button size="icon"` branch. R1D Timer, Today tasks, bounty board, task dialogs/detail, Calendar and Timeline use this surface.

## 5. Chip / Badge Consolidation

The audit resolved the compact visuals into two behaviors:

- `Badge` is read-only status/count/category metadata with neutral, success, warning and danger tones.
- `FilterChip` is interactive, exposes `aria-pressed`, and supports counter and dimension color marker.

RUNNING/PAUSED, difficulty, category, task counts and bounty status use `Badge`. Dimension filters use `FilterChip` and retain horizontal scrolling on narrow screens. Feature-specific reward and progress visuals remain local because they are not equivalent status pills.

## 6. Panel / Card Consolidation

Page-level containers and domain objects remain distinct:

- Panel: existing page/section containers (`glass-panel`, route panels) use a common `.panel-header` title/action layout where R1D pages repeat it.
- Card: Task rows, bounty cards and timeline events remain domain-owned objects with their own responsive layout.

No generic React `Panel` or `Card` wrapper was added. The current reuse is a stable header/layout style, while a wrapper would add an API without removing meaningful behavior or duplication.

## 7. Domain Component Ownership

- `CurrentFocusCard`, `MiniTimer`, `FinishSessionButton`, current-session query and Timer commands are owned by `features/timer`.
- Task row/card, bounty card and task workflows are owned by `features/tasks`.
- Timeline event rendering is owned by Calendar/Timeline.
- AppShell owns route placement only: full control on Today, MiniTimer outside Today.
- `shared/ui` has no dependency on Task, Timer, Calendar, AppShell, API or query modules.

`docs/ARCHITECTURE.md` records the new shared primitive public surface and the Timer ownership boundary.

## 8. Responsive Ownership

Shared button, icon-button, badge and filter-chip sizing is defined once in `styles.css`. Task row owns its desktop/mobile representation; Today owns only its page columns. The active mobile Task row uses two content rows and More, with no page-level override of Timer controls.

At mobile widths:

- text buttons have a minimum 44px height;
- icon buttons use a 44x44 outer target;
- the inner icon visual measured approximately 23x23px in Chromium;
- FilterChip uses a 44px row and remains horizontally scrollable;
- MiniTimer and App content continue to share the bottom-layout variables from the preceding layout correction.

## 9. Accessibility

- `IconButton` requires an `aria-label` through its TypeScript API and supplies the same text as a title.
- `Button` preserves native keyboard behavior, disabled semantics and reports loading with `aria-busy`.
- `FilterChip` reports selection with `aria-pressed`.
- Shared controls have visible `focus-visible` rings.
- Finish dialog focus trap, Escape handling and trigger focus restoration remain intact.
- Real browser measurement confirmed 44x44 mobile MiniTimer targets and 44px Today text-button height.

## 10. Browser Evidence

Browser: headless Google Chrome using a real local Web/API instance and the isolated `r1d_e2e` account/database. No production data was used.

Smoke executed successfully:

```text
start
-> Today (CurrentFocus visible, MiniTimer hidden)
-> pause
-> Tasks (MiniTimer visible)
-> resume
-> Today (MiniTimer hidden, CurrentFocus RUNNING)
-> finish
```

The final state had no active Session, proving the visible controls were connected to the same server-backed current Session.

Measured evidence:

| View | Evidence | Result |
| --- | --- | --- |
| 375 `/today` | `CurrentFocus=1`, `MiniTimer=0`; active row text `RUNNING · elapsed`; no pause/finish row buttons | PASS |
| 375 `/today` | document width 375, viewport width 375 | No horizontal overflow |
| 375 `/today` bottom | last content bottom 723.84px, bottom-nav top 748px | 24.16px visible gap |
| 375 `/tasks` | `CurrentFocus=0`, `MiniTimer=1`; pause/resume, finish, cancel, task navigation present | PASS |
| 375 `/tasks` | each MiniTimer icon target 44x44px; inner visual about 22.75px | PASS |
| 1440 `/today` | `CurrentFocus=1`, `MiniTimer=0`; left/right columns 756.17/453.70px | Approximately 62/38, PASS |
| 1440 `/tasks` | `CurrentFocus=0`, `MiniTimer=1`; no horizontal overflow | PASS |

Screenshots:

- `docs/reports/WB-R1D-components-375-today.png`
- `docs/reports/WB-R1D-components-375-nontoday.png`
- `docs/reports/WB-R1D-components-1440-today.png`

## 11. Regression

| Check | Result | Evidence |
| --- | --- | --- |
| Affected Web tests | PASS | 6 files, 36 tests |
| Full Web tests | PASS | 14 files, 69 tests |
| Web typecheck | PASS | `npm run typecheck -w apps/web` |
| Web lint | PASS | `npm run lint -w apps/web` (`tsc -b --noEmit` in this repository) |
| Web build | PASS | `npm run build -w apps/web`; 1661 modules transformed |
| Diff whitespace | PASS | `git diff --check` |
| Browser interaction smoke | PASS | Real start/pause/navigation/resume/finish sequence above |

Focused test coverage includes shared primitive accessibility/loading behavior, Timer net time and finish payloads, Task interaction contracts, route-level Timer deduplication, architecture ownership, and Calendar controls.

## 12. Deferred UI Cleanup

The following were deliberately not extracted or migrated:

- Legacy button classes in Auth, Categories, History, Writing, Rewards and Tools: outside the R1D core scope; migrate only when those features are next changed.
- Quick Add trigger/menu: one AppShell composition with menu behavior, not a repeated primitive.
- Generic `Panel`, `Card`, `PageHeader` or `TimelineEvent` wrappers: current call sites do not justify stable public APIs.
- Segmented controls, layout toggles, task progress track and More menus: behavior-specific controls, not Button variants.
- Reward/progress pills: domain-specific meaning, not interchangeable with general status badges.

No Storybook, design-token platform, standalone component package or broad CSS rewrite was introduced.

## 13. Final Gate

```text
TODAY_TIMER_DEDUPLICATION:
PASS

BUTTON_SYSTEM:
PASS

ICON_BUTTON_TOUCH_TARGET:
PASS

CHIP_BADGE_CONSISTENCY:
PASS

PANEL_CARD_CONSISTENCY:
PASS

DOMAIN_COMPONENT_OWNERSHIP:
PASS

RESPONSIVE_COMPONENT_OWNERSHIP:
PASS

R1D_INTERACTION_POLISH:
PASS

READY_FOR_R1_5:
YES
```
