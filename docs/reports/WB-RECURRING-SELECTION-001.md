# Recurring selection and Today context row

Date: 2026-10-22

## RESULT

PASS. Scope: select recurring templates before monthly generation; confirm/skip generated pending items; display visible generation outcomes; place Current Focus, deadline countdown, Water and Sleep on one desktop row.

## ROOT_CAUSE

- Monthly preparation had no template-selection input and silently processed all enabled templates. The user could not connect the action to a particular saved template or distinguish newly generated, already existing and no-matching-date outcomes.
- The pending-entry query and preparation range previously ended on the selected day, hiding future occurrences in that month. This branch now uses the whole selected calendar month for both operations.
- Today's grid separated context into multiple rows. Simply narrowing Current Focus to fit four cards also squeezed its three-column active-session content into vertical text at 1024px.

## FIX

Wallet now presents three steps: save a template; select enabled templates and generate this month's pending items; explicitly confirm posting or skip in the pending section. Generation is disabled without selection. An inline status reports newly created/existing counts, or explains that the selected template has no matching date this month. A failed request retains selection for retry. User/month changes reset local selection and results.

The existing Finance preparation endpoint accepts optional `templateIds`, validates that every requested template is enabled and belongs to the authenticated user, and reports `{created, existing}`. Omitted IDs preserve the existing all-enabled contract. Existing mutation receipts, occurrence uniqueness, snapshots, versions and ledger posting remain authoritative. Generation never posts, and repeat generation cannot reset POSTED/SKIPPED records. No schema or migration changes.

AppShell composes the existing public components into one desktop context row at widths >=1024px. Water/Sleep no longer stretch across other content rows. Current Focus keeps its title/time together and actions on a separate internal row. Mobile preserves usable stacking rather than squeezing four cards across a phone.

## REGRESSION_RISK

- Template selection versus disabled/foreign/deleted identities: rejected atomically by Finance; covered with real MySQL.
- Request retries and already resolved occurrences: receipt replay and template/date uniqueness retained; no duplicate ledger writes.
- Month range, zero matching dates, generation feedback and retry selection: covered in focused Web tests and browser acceptance.
- Active Timer layout and mobile controls: actual CSS viewports and browser bounds/readability assertions, with screenshots reviewed.
- API compatibility: explicit selection is additive; existing callers without IDs retain all-enabled behavior.

## TESTS_RUN

- Focused Finance/AppShell Web tests: 64/64 PASS.
- Full Web suite: 39 files, 407/407 PASS.
- API/Web typecheck: PASS.
- API/Web lint and i18n audit: PASS; missing/untranslated/visible-Chinese findings 0.
- Production API/Web build: PASS; existing >500kB chunk advisory remains.
- Architecture checker: 0 errors, 0 warnings.
- JavaScript syntax checks for both browser scripts: PASS.
- `git diff --check`: PASS.
- Real MySQL 8.0 FIN-01: 12/12 PASS; FIN-03: 13/13 PASS. Repository harness ran fresh and upgrade migration checks through V42 (43 migration files) in disposable `_test` databases. Selected template IDs, empty/disabled/missing/foreign rejection, changed receipt payload, scheduled-time snapshot, immutable posted/skipped entries, explicit posting balance, and no duplicate expense are covered.
- Public Web/API/MySQL browser journey: PASS at exact 1440×900 and 375×812. Selected one of two templates, generated only that template, repeated generation without duplicates, confirmed it once, refreshed without returning it to pending, checked a future-only template's zero-result feedback, and generated the second template. Balance remained 100000 cents until confirmation and became 98000 cents with exactly one posted expense. Mobile confirmation stayed above bottom navigation.
- Public component browser fixture: PASS at exact 1440×900, 1024×900, 375×812; four desktop cards share their top coordinate, active-session title has usable width, controls stay inside the card, and page has no horizontal overflow. Header reminders, reward feedback, canonical Hero refresh, localization and reduced motion also pass.

The real-browser test waits for initial Dashboard loading to finish before interacting, consistent with the documented initial loading-to-ready AppShell remount. It does not change that existing lifecycle.

## ARCHITECTURE_CONFORMANCE

Finance owns template validation, snapshots, occurrence identity, transaction/ledger semantics and mutation receipts. Wallet owns temporary selection and generation-result presentation. AppShell owns layout composition through existing public feature exports. No global store, event bus, duplicate reminder data or new dependency. `docs/ARCHITECTURE.md` and `docs/openapi.yaml` record the scoped additive contract.

## EVIDENCE

- [Real Web/API/MySQL assertions](WB-RECURRING-SELECTION-evidence/browser.json)
- [Desktop selected templates](WB-RECURRING-SELECTION-evidence/selection-1440.png)
- [Mobile pending entry](WB-RECURRING-SELECTION-evidence/pending-375.png)
- [Desktop layout and interactions](WB-WALLET-HOME-UI-evidence/browser.json)
- [Active session at 1024px](WB-WALLET-HOME-UI-evidence/today-focused-1024.png)
- Verification logs are retained beside the real-browser assertions.

## REMAINING_BLOCKERS

NONE. Isolated API/Web/Chrome/MySQL resources and the disposable browser database are cleaned up after acceptance. The user's existing server at port 5186 remains untouched.
