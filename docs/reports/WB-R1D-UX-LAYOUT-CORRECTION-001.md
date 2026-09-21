# WB-R1D-UX-LAYOUT-CORRECTION-001

Date: 2026-09-20  
Scope: R1D product UX layout correction only

## Executive Summary

The mobile bottom stack, Today task-card density, dimension filters, desktop Today columns, and global MiniTimer hierarchy were corrected without changing Timer lifecycle, Task/Assignment semantics, operation identity, API contracts, database schema, migrations, or transaction behavior.

Real Chrome acceptance passed at 375, 1024, 1280, and 1440 CSS pixels. The 375px page has no horizontal overflow, active Task controls are 44x44px, and bottom content can scroll 16px clear of the visible MiniTimer. At 1440px the effective Today columns are 756px and 454px, or approximately 62.1% / 37.3%.

## Implementation Evidence

### Mobile bottom geometry

`apps/web/src/styles.css` defines one shared geometry contract:

- `--mobile-bottom-nav-height: 56px`
- `--mobile-mini-timer-height: 56px`
- `--safe-bottom: env(safe-area-inset-bottom, 0px)`
- `--mobile-bottom-spacing: 16px`

The mobile nav offset, MiniTimer offset, and `.app-content` bottom padding all use these variables. `.app-stage:has(.mini-timer)` sets only the visible MiniTimer contribution, so content padding changes from 144px with a visible timer to 88px without one. The latter retains only nav, safe-area, and spacing clearance.

Modal backdrops include `--safe-bottom`; mobile finish/task/time/feedback dialogs are viewport-height bounded and independently scrollable. The modal layer remains above both fixed shell controls.

### Mobile Task cards and dimension filters

`apps/web/src/features/tasks/index.tsx` now exposes:

- Row 1: completion status, readable title, concise execution/category/schedule metadata, and More.
- Row 2: elapsed time plus start or pause/resume and the existing shared finish action.
- More: edit, category, and cancel actions.

The finish action is composed by `apps/web/src/app/shell/index.tsx` using the existing Timer-owned `FinishSessionButton`; no second finish workflow or direct finish semantics were introduced. Mobile completion and execution controls have 44px hit areas. Created time, difficulty, progress detail, desktop editing, and cancel controls no longer compete with primary execution controls at 375px.

Dimension chips retain 12px text and 44px height. The filter container uses horizontal overflow; Chrome measured 335px visible width and 745px scroll width at 375px.

### Desktop ratio and MiniTimer hierarchy

At the existing `xl` breakpoint, Today uses `minmax(0, 5fr) minmax(380px, 3fr)`. Below that breakpoint the layout remains a single responsive column, avoiding an unusably narrow Timeline at 1024px.

The global MiniTimer remains available on every route but is a compact status/control strip: 36.75px high on desktop and one 56px row on mobile. Today retains the larger Current Focus surface as the primary in-page execution view.

## Browser Acceptance

Chrome was launched with device metrics and the authenticated R1D isolated test user. Measurements came from DOM bounding boxes and computed styles, not screenshot estimation.

| Viewport | Tasks | Timeline | Layout | Horizontal overflow |
| --- | ---: | ---: | --- | --- |
| 375x812 | 358.8px | 358.8px | single column | no |
| 1024x800 | 802.0px | 802.0px | single column | no |
| 1280x800 | 656.2px | 393.7px | 62.0% / 37.2% | no |
| 1440x900 | 756.2px | 453.7px | 62.1% / 37.3% | no |

375px evidence:

- MiniTimer: `y=684`, `height=56`, `bottom=740`.
- Mobile nav: `y=748`, `height=56`, `bottom=804`; fixed-layer gap is 8px.
- At maximum document scroll, the Today grid bottom is `667.6`, leaving 16.4px before the MiniTimer top. The Timeline is an earlier grid row and can therefore scroll fully above the fixed layer.
- Active Task card is 319px wide and 120px high. Pause/resume and finish controls are each 44x44px.
- Document and viewport widths are both 375px.
- Finish modal footer bottom is `345.9` inside an 812px viewport; overlay z-index is 1000.
- Removing the MiniTimer from the rendered shell changes computed content padding from 144px to 88px, proving the timer clearance is conditional.

Screenshots:

- `docs/reports/WB-R1D-UX-fixed-375.png`
- `docs/reports/WB-R1D-UX-fixed-1440.png`

## Interaction Smoke

The existing isolated R1D database and real Chrome session were used. One visible Session was exercised through pause, resume, and shared finish. A second cycle was started from the corrected Task card and completed through start, pause, resume, and shared finish. Final `GET /api/timer-sessions/current` returned `data: null`; no active Session was left behind.

Results:

- pause: PASS
- resume: PASS
- finish with shared dialog: PASS
- Task-card start: PASS
- start -> pause -> resume -> finish: PASS

## Regression Baseline

| Check | Command | Result |
| --- | --- | --- |
| Affected Tasks tests | `npm test -w apps/web -- --run src/features/tasks/index.test.tsx` | PASS, 1 file / 7 tests |
| Full Web tests | `npm test -w apps/web` | PASS, 13 files / 67 tests |
| Web typecheck | `npm run typecheck -w apps/web` | PASS |
| Web lint | `npm run lint -w apps/web` | PASS |
| Web production build | `npm run build -w apps/web` | PASS, 1,660 modules transformed |
| Whitespace errors | `git diff --check` | PASS |

The npm commands emitted the existing `ELECTRON_MIRROR` deprecation warning; it did not affect any result. Backend tests were not rerun because this task changed no API, database, workflow, or transaction code.

## Scope Confirmation

No migration, API, OpenAPI, database mapping, Timer command, operationId handling, Task lifecycle, Assignment rule, ActualTime behavior, or production data was changed by this correction. Existing working-tree changes were preserved.

## Acceptance Result

```text
MOBILE_BOTTOM_OVERLAP:
PASS

MOBILE_TASK_CARD:
PASS

DESKTOP_COLUMN_RATIO:
PASS

RESPONSIVE_REGRESSION:
PASS

R1D_PRODUCT_UX_ACCEPTANCE:
PASS

READY_FOR_R1_5:
YES
```
