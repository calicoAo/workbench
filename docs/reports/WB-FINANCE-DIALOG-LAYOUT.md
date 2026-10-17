# Finance dialog layout fix

RESULT: PASS

ROOT_CAUSE: Finance dialog markup already contained a header, but had no header/footer layout rules. The close action therefore stacked below the title. `.finance-dialog label` also overrode `.finance-check` with grid display; the native checkbox stretched across its cell and the label moved onto the next row. Both were reproduced in Chromium before the fix.

FIX: Finance-owned dialog CSS now provides a title/close header, spaced form content, and aligned footer. Ordinary form labels exclude checkbox rows, which remain flex with a compact input and a clickable label. The close button and checkbox label have 44px interaction areas. AccountDialog has an accessible title/dialog association. No API, schema, ledger, global shared UI or navigation changes.

REGRESSION_RISK: Shared Finance dialog layout also affects account editing, expense/income entry and transfers. Browser assertions verified those headers, and the Finance suite verified adjacent interactions and persistence mocks. The account creation browser checks cover 1440×900 and actual 375×812 CSS viewports, vertical checkbox alignment, title/close placement, footer layout, in-viewport bounds and no horizontal overflow.

TESTS_RUN:
- Focused Finance: 5 files, 82 tests PASS.
- Full Web: 37 files, 390 tests PASS.
- Web typecheck/lint/i18n: PASS; no missing translations or visible untranslated Chinese.
- Production Web build: PASS (existing bundle-size advisory).
- Architecture checker with existing Wallet ownership rules: 0 errors, 0 warnings.
- git diff --check: PASS.
- Chromium layout acceptance: PASS. Real FinancePage and production CSS mounted with isolated read fixtures; this verifies UI layout and interactions, not real API/database persistence. No database verification required for this UI-only fix.

Evidence: WB-FINANCE-DIALOG-LAYOUT-browser.json, verification.json, architecture.json, before.png, create-1440.png, create-375.png. Browser assertion script: scripts/finance-dialog-layout-browser-evidence.mjs. Temporary Vite and fresh Chromium processes/profile removed after acceptance; ports 5186/9336 closed.

REMAINING_BLOCKERS: NONE
