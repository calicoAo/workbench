# Wallet / Home UI corrections

Date: 2026-10-22

## Result

PASS. Scope: header reminders, independent deadline countdown, compact Water/Sleep layout, localized Quick Action, noticeable success/reward feedback, canonical Hero EXP refresh, and explicit recurring-entry workflow.

## Root causes and fixes

- Today reminders occupied a second grid row while the Water/Sleep region spanned both rows. The header now composes `ReminderBell`; Today places Current Focus, task-only `DeadlineCountdown`, Water and Sleep in one desktop context row. Cards remain content-sized; mobile stacks the first two cards above the Water/Sleep pair. The active Current Focus card uses a separate actions row internally so its title cannot be squeezed into vertical text.
- The Quick Action trigger contained an untranslated literal. It now uses the existing `快捷操作` translation.
- Identical consecutive success messages reused the same state value, so timing and animation did not restart. ApplicationFeedback now assigns each successful operation a presentation identity, displays a four-second animated status, and animates the reward dialog/cards. Existing reduced-motion and global preference rules remain active.
- Shell refresh invalidated Dashboard/Growth but omitted the Hero query used by the header. It now invalidates the authenticated user's Hero query too. A permanent integration test proves a successful Wallet expense changes header EXP from 30/200 to 35/200.
- Wallet's monthly preparation and occurrence listing ended at the selected day. Both now use the full selected calendar month. Presentation follows saved templates → explicit template selection → generation → confirmation/skip. Generation displays new/existing counts or a no-matching-date explanation. No template implicitly prepares or posts a transaction. See the focused [selection closure report](WB-RECURRING-SELECTION-001.md).
- Finance refresh now invalidates the existing user-scoped reminder query, including after template edits, disable, preparation and occurrence confirmation.

## Ownership and regression risks

AppShell composes feature public surfaces. Reminders owns presentation and popover state only; Task and Finance remain canonical owners. Hero owns its own query; ApplicationFeedback owns feedback. The follow-up selection fix adds optional `templateIds` and preparation result counts to the existing Finance endpoint, documented in OpenAPI; omitted IDs preserve legacy behavior. No schema, new store, event bus, or dependency was introduced. The architecture contract records selection ownership, presentation composition and the monthly range.

Nearby risks covered: date/month boundaries, preparation without posting, header freshness after a reward, repeated feedback, locale switching, mobile overflow, popover dismissal, and reduced-motion settings.

## Tests run

- Focused Reminders / Feedback / AppShell / Finance tests: 71 passed before final localization coverage.
- Final complete Web suite: 39 files / 407 tests passed.
- Focused Finance / AppShell tests after the selection fix: 64 passed.
- Real MySQL FIN-01: 12 passed; FIN-03: 13 passed, including scoped generation, ownership rejection, idempotency, explicit posting and immutable resolved occurrences.
- API + Web typecheck: PASS.
- API + Web lint and i18n audit: PASS; missing/untranslated/visible-Chinese findings: 0.
- Production build: PASS; existing chunk-size advisory remains.
- Architecture checker: 0 errors / 0 warnings.
- `git diff --check`: PASS.
- `node scripts/wallet-home-browser-evidence.mjs`: PASS at exact 1440×900, 1024×900 and 375×812 CSS viewports. Assertions cover all four cards on the same desktop row, readable active-focus copy and in-bounds controls, compact Water/Sleep, header bell visibility, popover bounds, localized trigger, expense reward and Hero refresh, animation styles, recurring selection steps and reduced motion.
- `node scripts/recurring-selection-browser-evidence.mjs`: PASS through the real public Web/API and disposable MySQL database at 1440×900 and 375×812; generation leaves the balance unchanged, explicit confirmation posts exactly once, repeat preparation preserves resolved entries.

The Wallet/Home fixture uses actual public Web components with in-memory test data. Its evidence is separate from the recurring-selection real Web/API/MySQL journey. MySQL suites used fresh disposable test databases with all 43 migrations through V42; no production or long-lived development database was changed.

## Browser evidence

- [Assertions](WB-WALLET-HOME-UI-evidence/browser.json)
- [Desktop Today](WB-WALLET-HOME-UI-evidence/today-1440.png)
- [Active focus at 1024px](WB-WALLET-HOME-UI-evidence/today-focused-1024.png)
- [Mobile reminders](WB-WALLET-HOME-UI-evidence/reminders-375.png)
- [Mobile expense reward](WB-WALLET-HOME-UI-evidence/expense-feedback-375.png)
- [Recurring workflow](WB-WALLET-HOME-UI-evidence/recurring-1440.png)

## Remaining blockers

NONE. The existing user Web server was retained; the isolated headless browser and generated QA HTML wrapper were cleaned up.
