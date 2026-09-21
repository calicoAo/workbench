# WB-R1.5-G5B-LINK-SEARCH-SETTINGS-001

Date: 2026-09-20  
Branch: `codex/workbench-auth-system`  
Baseline HEAD: `531569197d64a6d43abfea43be855e77937168d6`

## 1. Scope

This work package implements only the R1.5 G5b scope: controlled QuickNote-to-Task conversion, QuickNote-to-Journal draft references, basic Settings, direct domain Search, domain Export, Notes mobile filter polish, and R1.5 regression verification. It does not add Projects, Habits, formal Growth, Period Review, Finance, Import, Agent Bridge, a universal item/index, or a new data platform.

The implementation followed the repository architecture contract and the minimal path: one new cross-domain workflow owner where a real transaction exists, route-centric settings/search/export, and direct SQL domain queries rather than a speculative search service or index.

## 2. G5a Baseline

The starting tree already contained the accepted G5a Quick Note lifecycle and its WIP. Existing changes were preserved; no stash, reset, cleanup, or production-data operation was performed.

- G5a report: `docs/reports/WB-R1.5-G5A-REHOME-AND-CAPTURE-001.md`
- Canonical Quick Note source remains `quick_notes`.
- G5a create/reward receipt workflow remains in `apps/api/src/quick-note.ts`.
- G5b extends that capability without changing the G5a source-of-truth rule.
- Node `v24.2.0`; npm `11.3.0`.

## 3. QuickNote -> Task

`POST /api/quick-notes/:id/convert-to-task` accepts a caller `operationId`, a user-confirmed title/action summary, optional Task fields, and optional `acceptDate`.

- `apps/api/src/quick-note-linking.ts` owns conversion.
- `apps/api/src/task-publishing.ts` exposes the transaction-aware `publishTaskInClient` capability; the Quick Notes route never calls a Task route handler.
- `quick_note_task_links` enforces one direct Task per Note and one source Note per linked Task.
- Publish creates Task + relation + receipt atomically.
- Publish-and-accept creates Task + Assignment + relation + receipt atomically.
- The UI shows source length and the 2,000-character Task summary limit. A source over 2,000 characters starts with an empty required summary; there is no silent truncation.
- A linked Note shows the real Task state and removes the second conversion action. Task archive/delete and Note soft-delete do not cascade.
- Conversion never starts a Timer.

Evidence: `apps/api/tests/r1_5-g5b.test.ts` covers create, publish-and-accept, lost-response replay, changed fingerprint, concurrent double-click, source uniqueness, non-cascade lifecycle, and source privacy. The focused database suite passed `8/8`.

## 4. QuickNote -> Journal

Quick Notes can stage selected/edited text and a source marker into a Journal draft for a selected date. The operation never saves a Journal server record.

- `useJournalDraftBridge` remains inside the Writing / Reflection public surface.
- Same-date references append after existing unsaved text.
- Cross-date references are staged in a per-user local key and consumed when the target Writing owner is ready.
- Duplicate identity is `(userId, noteId, journalDate)`; duplicate insertion is blocked unless the user explicitly chooses "再次引用".
- Saved Journal text is a snapshot. Later Note edit/archive/delete cannot alter it.
- Canceling the quote dialog calls neither the draft bridge nor a server mutation.

Evidence: `apps/web/src/features/writing-reflection/index.test.tsx` verifies preservation and duplicate handling; `apps/web/src/features/quick-notes/index.test.tsx` verifies cancel/no-write. Real-browser acceptance preserved existing unsaved text while appending Note `#3`, and a separate Journal save completed successfully.

## 5. Cross-domain Transaction Ownership

The dependency direction is:

```text
quick-notes route
  -> quick-note-linking workflow
    -> mutation receipt
    -> locked QuickNote + source relation
    -> task-publishing transaction capability
      -> Task
      -> optional Assignment
```

The receipt is claimed before domain writes. The source Note is locked before checking/creating the relation. Task publication participates in the same database client/transaction. A matching operation replay returns the stored Task; changed parameters return `409`; a different operation racing on the same Note is stopped by the lock plus source unique constraint. No generic command bus or service/repository layer was added.

## 6. Privacy Boundaries

- Task list/detail DTOs never embed the QuickNote body, tag, or private metadata.
- First-party Task detail receives only `{ type: "QUICK_NOTE", id }`.
- QuickNote detail may show the linked Task's minimal identity/state because it is already inside the authenticated personal-text surface.
- Search returns only type/id/title/snippet/date/deepLink and remains a first-party, user-scoped query.
- Export occurs only after an explicit user action and is never uploaded or retained server-side.

Database evidence for Note `2` shows the original private body remains in `quick_notes`, while Task `4` contains only the user-confirmed action summary `整理 G5b 浏览器验收证据，并核对来源隐私边界。`.

## 7. Settings

`GET/PATCH /api/settings` now provides real settings only:

- profile display name and timezone;
- current light-theme statement plus reduced-motion preference;
- category/dimension mapping and enable/disable controls;
- reward UI visibility without changing reward settlement;
- the existing manual continuation policy and an explicit statement that automatic continuation is unavailable;
- a truthful empty Integrations state;
- domain Export controls and text-only Import deferral.

`GET /api/settings` is observational: absent display preferences are returned as in-memory defaults, not inserted by a GET. When reward UI is hidden, navigation, reward history surfaces, task reward summaries/popups, and Decision Tool reward feedback are suppressed; backend reward writes continue unchanged.

## 8. Timezone Settings

Changing `users.timezone` affects future default contexts only. Existing Note dates, Journal dates, Assignment timezone snapshots, Timer slice dates/timezones, Schedules, and completion history are not rewritten. The UI states: `新的记录将使用此时区；已有历史日期不会重新归属。`

Evidence: the G5b database test changes timezone, verifies prior Task/Assignment data remains stable, and restores the fixture. Existing R1B tests also continue to pass their timezone snapshot invariants.

## 9. Category Semantics

- Settings uses enable/disable, never deletion.
- Default category queries and Task creation surfaces omit disabled categories.
- `includeDisabled=true` is used by Settings to manage all historical categories.
- Task publication rejects a disabled category.
- Existing Task/category references and historical attribution are unchanged and remain searchable/exportable.

Evidence: the G5b database test disables a category, verifies an existing Task still references it, verifies new publication cannot use it, and restores the category.

## 10. Search

`GET /api/search` uses direct, authenticated domain queries across Task, QuickNote, Journal, Morning Writing, and Schedule. It does not create an index or duplicate source records.

- filters: `q`, `type`, `from`, `to`, `cursor`, `limit`;
- ordering: business date descending, creation time descending, type ascending, id descending;
- opaque cursor pagination;
- soft-deleted records excluded;
- archived records deliberately included;
- user isolation applied in every domain branch;
- result dates are serialized as local MySQL DATE values, avoiding UTC date drift.

The API test covers user isolation, Task title/description, Note title/body/tag, Journal, Morning Writing, Schedule title/note, deleted exclusion, multi-page pagination, type filters, and date filters.

## 11. Search Deep Links

Search results link to their real owners:

| Type | Deep link |
| --- | --- |
| Task | `/tasks/:id?date=...` |
| QuickNote | `/notes/:id?date=...` |
| Journal / Morning Writing | `/journal?date=...` |
| Schedule | `/calendar?date=...` |

Real-browser query `q=G5b` returned Calendar, Journal, Task, and QuickNote results dated `2026-09-20`. Task/Note were opened during conversion acceptance; Journal and Calendar links were opened separately and resolved to their canonical pages.

## 12. Export

`GET /api/exports/:domain` supports explicit JSON/CSV exports for Tasks, Writing, Calendar/Time, Rewards, and Life; Writing also supports Markdown.

- Default output excludes soft-deleted records.
- `includeTrash=true` is an explicit opt-in.
- Writing output preserves Note IDs, title/body/tag, Note date, timezone, archive/deletion state, and Task relation IDs.
- Tasks preserve lifecycle and category/source references.
- Calendar/Time exports manual/eligible legacy Actual Schedules plus canonical TimerSegments; TIMER Schedule projections are excluded to prevent double-counting.
- The Web creates a local download only after the user presses Export. There is no Import control and no cloud upload.

Database tests verify JSON content, CSV record counts, Markdown body preservation, relation metadata, deleted-default exclusion, and explicit trash inclusion. Browser acceptance generated a two-record Personal Writing Markdown download.

## 13. Mobile Filter Polish

Both `/notes` and `/search` use the compact default layout `[search] [filter]`. Type/state chips remain lightweight; tag and date ranges are hidden until the collapsible filter surface opens. Notes expose explicit `开始日期` and `结束日期` labels. Search remains a top-bar action and does not add a sixth mobile tab.

The required 375px screenshots show the compact filter region, no horizontal overflow, and an unobstructed five-item bottom navigation.

## 14. Browser Evidence

Environment: real Vite Web at `http://127.0.0.1:5173`, real API at `http://127.0.0.1:3000`, and isolated MySQL database `personal_workbench_r1d_e2e_test` on port `3408`.

- `docs/reports/WB-R1.5-G5B-note-convert-375.png` (`375x900`): explicit action snapshot dialog with editable summary and both publish actions.
- `docs/reports/WB-R1.5-G5B-search-375.png` (`375x900`): compact filters, multiple domain results, correct `2026-09-20` dates, clear bottom navigation.
- `docs/reports/WB-R1.5-G5B-search-1440.png` (`1440x1000`): desktop search composition without overflow.
- `docs/reports/WB-R1.5-G5B-settings-375.png` (`375x900`): profile, timezone warning, categories, appearance, and settings hierarchy.

The Note-to-Task path created Note `2`, edited the summary, published and accepted Task `4`, opened the Task, and then returned to the unchanged Note/source relation. Note `3` exercised Journal draft append/preservation.

## 15. Real DB Evidence

All rows below are from the isolated E2E database; no production database was connected or modified.

- User `3`: `r15_g5b_e2e`, timezone `Asia/Shanghai`.
- Note `2` -> Task `4`; exactly one source relation and one Assignment dated `2026-09-20`.
- Note `3` remains unlinked and retains its original text.
- Mutation receipts: two Note creates; one convert-and-accept; one each for start, pause, resume, and finish.
- Timer Session `10`: status `FINISHED`, Task `4`, note `G5b 布局与交互回归`.
- Segments `17` and `18`: both closed on business date `2026-09-20`, proving the pause gap is excluded.
- Journal `2026-09-20`: `G5b 浏览器回归：Journal 保存正常。`
- Sleep `2026-09-20`: `23:30-07:30`, quality `4/5`.
- Water `2026-09-20`: `1` cup with a persisted drink timestamp.
- V23 was applied only to `personal_workbench_r1d_test` and `personal_workbench_r1d_e2e_test` for this task. Those local databases do not contain a Flyway history table; production Flyway state was not queried and no production migration/repair was run.

## 16. R1D Regression

Real-browser smoke passed:

```text
accepted Task 4
-> start Session 10
-> pause
-> resume
-> finish with note
-> Task remains incomplete by default
```

Journal save, QuickNote create, Sleep write/read, Water write/read, Rewards navigation/visibility, and cross-route MiniTimer behavior also remained functional. The two resulting closed TimerSegments and finished Session provide database evidence beyond the browser state.

## 17. R1.5 Integration Assessment

| Check | Result | Evidence |
| --- | --- | --- |
| G5b MySQL suite | PASS | `npm run test:g5b`: `8/8`, zero skipped/TODO |
| Full API suite | PASS | `npm run test -w apps/api`: `58/58`, zero skipped/TODO |
| Affected Web tests | PASS | final focused run `10/10`; earlier cross-feature run `29/29` |
| Full Web suite | PASS | `npm run test -w apps/web`: `81/81` |
| Typecheck | PASS | both workspaces |
| Lint | PASS | both workspaces; repository lint currently aliases TypeScript checks |
| Production build | PASS | API TypeScript + Web Vite, 1,667 modules |
| Architecture check | PASS | `0 error(s), 0 warning(s)` |
| Diff whitespace | PASS | `git diff --check` |

Architecture delta: one narrow conversion workflow/public Task capability, one Writing-owned local draft bridge, and route-centric query/serialization owners. No durable boundary was bypassed and `docs/ARCHITECTURE.md` was updated in the same change.

## 18. Deferred R2 Work

Intentionally absent: Projects/project selectors, Habits, formal N-dimensional Growth editing, Period Review, Import, Finance, Agent Bridge/scopes, Inventory, vector search, universal indexes/items, and a full Data platform. Search is not an Integration permission surface. Existing Media history is untouched.

## 19. Gate

```text
QUICKNOTE_TO_TASK: PASS
QUICKNOTE_TO_JOURNAL: PASS
CROSS_DOMAIN_IDEMPOTENCY: PASS
PERSONAL_TEXT_PRIVACY: PASS
SETTINGS: PASS
SEARCH: PASS
EXPORT: PASS
MOBILE_FILTER_POLISH: PASS
R1D_REGRESSION: PASS
G5B_GATE: PASS
R1_5_GATE: PASS
READY_FOR_R2: YES
```

This work package stops here. No R2 work was started.

## Evidence Commands

```text
TEST_DATABASE_URL=mysql://root@127.0.0.1:3408/personal_workbench_r1d_test npm run test:g5b
TEST_DATABASE_URL=mysql://root@127.0.0.1:3408/personal_workbench_r1d_test npm run test -w apps/api
npm run test -w apps/web
npm run typecheck
npm run lint
npm run build
node /Users/lijingru/.codex/skills/engineering-architecture/scripts/architecture-check.mjs --root .
git diff --check
```
