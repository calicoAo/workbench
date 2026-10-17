# All application dialog presentation

RESULT: PASS

ROOT_CAUSE: Dialog families independently used plain headers, utility divs and differently sized close controls. Generic label/grid selectors could override checkbox rows. Nested shrink-to-fit wrappers also narrowed task panels on mobile. The prior Finance fix was local; this change extends a common presentation contract to every inventoried application modal panel.

FIX: Existing panels opt into CSS-only `.ui-dialog`. Titles/close actions use a semantic header; actions use a footer, with tool-column actions using `.ui-dialog-actions`. The contract covers header alignment, dividers, spacing, viewport limits, sticky title/actions, 44px controls and checkbox/radio rows. Content-specific widths remain explicit; mobile panels use available viewport width. Backpack and onboarding panels now expose title-bar close actions through their existing close/skip handlers. Feature owners retain drafts, focus handling, queries, saves and confirmations. No new modal runtime/store, dependency, API or schema.

COVERAGE: Tasks create/edit/complete/select/history and Category/Project quick editing; Calendar manual entry/execution detail; Sleep; Categories; Timer finish; Writing and History archive; Quick Note capture/convert/quote; Inspirations; Finance account/record/transfer/transaction detail/refund/correction; Library; Backpack; Hero daily welcome; Onboarding welcome/celebration/guide; ApplicationFeedback confirmation/notice/rewards. Browser-native `window.confirm`/`window.prompt` remain browser-owned and are outside this CSS contract; sensitive Finance maintenance guards are preserved.

REGRESSION_RISK: Shared presentation changes widths, scroll boundaries and action placement across these owners. Permanent source-contract regression checks all existing dialog families for header/close/actions and use of the shared styles. Existing workflow tests retain draft, ownership and confirmation assertions.

TESTS_RUN:
- Full Web: 38 files, 391 tests PASS, including the new dialog presentation guard and existing architecture/workflow tests.
- Web typecheck, lint/i18n: PASS; missing/untranslated/visible-Chinese checks all zero.
- Production Web build: PASS; existing bundle-size advisory only.
- Architecture checker using existing Wallet ownership configuration: 0 errors, 0 warnings; docs/ARCHITECTURE.md records the CSS-only presentation boundary.
- git diff --check: PASS.
- Chromium: 30 actual feature/workflow dialog journeys × 1440×900 and 375×812 CSS viewports = 60 PASS; Hero portrait centering additionally rechecked at both sizes. Header/close placement, 44px targets, checkbox sizing, dialog horizontal overflow/bounds and post-scroll title/actions tested. Screenshots visually inspected for desktop/mobile task creation, Finance, writing and Hero.

BROWSER LIMITS: Real feature components and production CSS use isolated read fixtures, not a real API/database. Assertions target dialog bounds/content overflow; bare Backpack fixture background separately has a pre-existing 4px document overflow without AppShell, recorded in browser.json and not changed in this modal task. No persistence or database acceptance is claimed or required for these presentation-only changes.

REPRODUCTION: Use the repository's established fresh Chrome CDP process on port 9336 and isolated Vite on port 5186, then run `node scripts/all-dialog-layout-browser-evidence.mjs`. The script creates/removes a temporary HTML entry importing scripts/fixtures/dialog-layout.tsx, which is outside production source. Evidence: WB-ALL-DIALOG-LAYOUT-evidence/browser.json, screenshots, hero-final.json, logs and architecture.json.

REMAINING_BLOCKERS: NONE
