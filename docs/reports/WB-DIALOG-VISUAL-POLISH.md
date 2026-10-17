# WB-DIALOG-VISUAL-POLISH

RESULT: PASS

## ROOT_CAUSE

The shared dialog header/footer used translucent white over a separately translucent panel, producing inset white slabs. The shared footer's end alignment overrode Quick Note's character-count placement. The capture form also combined a wide panel, pill-shaped metadata fields and a strong mint focus ring without a clear visual hierarchy.

## FIX

- Shared dialog panels and sticky headers/footers use the same opaque surface. Hero retains its mint surface and reward feedback retains its gradient. Sticky controls remain inside the panel viewport.
- Quick Note capture has a 640px maximum width, a single title, quieter editor borders/focus, compact Markdown preview control and consistent metadata fields. Character count stays left; actions stay right. Mobile places title metadata above the tag/date row.
- Draft persistence, save/close behavior, API contracts, feature ownership and shared Button/IconButton behavior are unchanged. Markdown preview uses the existing ghost/small Button variant.

## REGRESSION_RISK

Shared surface/sticky styling affects every dialog family. The browser regression exercises all 30 existing scenarios at actual 1440×900 and 375×812 CSS viewports. Quick Note additionally runs at 819×541 and 320×568; assertions cover coherent surfaces, footer alignment, bounded width, normal text weight, Markdown rendering and draft preservation when switching preview/edit modes. Native screenshot dimensions are retained.

## TESTS_RUN

- Focused Quick Note / Markdown / dialog contract: 3 files, 14 tests PASS.
- Full Web suite: 38 files, 391 tests PASS.
- `npm run lint -w apps/web`: typecheck and i18n audit PASS; zero missing/untranslated messages.
- `npm run build -w apps/web`: PASS (existing bundle size advisory remains).
- Existing architecture checker with Writing/Markdown boundary configuration: zero errors/warnings.
- `git diff --check`: PASS.
- Browser: 60 dialog scenarios plus 2 additional capture viewport scenarios PASS. The strengthened permanent browser script also checks Markdown preview/edit round trips at all four capture viewports.

Browser evidence uses real public feature components and production CSS with isolated read fixtures; it makes no database or end-to-end persistence claim. No API/schema behavior changed.

Evidence: [desktop/mobile assertions](WB-DIALOG-VISUAL-POLISH-evidence/browser.json), [compact viewport assertions](WB-DIALOG-VISUAL-POLISH-evidence/compact/browser.json), [architecture](WB-DIALOG-VISUAL-POLISH-evidence/architecture.json).

## REMAINING_BLOCKERS

NONE.
