# WB-R1.5-G5A-REHOME-AND-CAPTURE-001

Date: 2026-09-20  
Branch: `codex/workbench-auth-system`  
Baseline HEAD: `531569197d64a6d43abfea43be855e77937168d6`

## 1. Scope

G5a rehomes existing life, writing, reward, insight, and decision-tool capabilities and activates the existing `quick_notes` truth as a complete capture library. It does not implement QuickNote-to-Task, QuickNote-to-Journal, Search, Export, Habits, Growth, Projects, Finance, or any G5b capability. Existing dirty R1A-R1D work was preserved; no stash, reset, cleanup, production migration, or production-data operation was performed.

## 2. R1D Regression Baseline

The established Today, Bounty Board, Task detail, CurrentFocus, MiniTimer, Timeline, Calendar, Quick Add, continuation, mobile safe-area, and 62/38 desktop layout remain owned by their R1D features. Full API regression passed 50/50 and full Web Vitest passed 72/72. A real browser `start -> pause -> resume -> finish` smoke completed from Tasks through the cross-route MiniTimer on Notes; finish remained time-only and did not complete the Task.

## 3. Navigation / IA Rehome

- `/journal` is the selected-date writing/review home; `/journal/:date` redirects to the canonical date query form.
- `/notes` and `/notes/:noteId` are the Quick Notes library and detail routes.
- `/routines` composes the existing Sleep and Water owners and links to Morning Writing without inventing a Habits domain.
- Journal subnavigation exposes Today writing, Quick Notes, and archive/insights.
- Desktop navigation adds the transitional Life route. Mobile remains five primary tabs; Quick Notes is not a new primary tab.
- `/rewards`, `/insights`, and `/tools` remain stable and visible.

## 4. Sleep / Water

`SleepFeature` and `WaterFeature` remain the only interaction owners. `/routines` receives Dashboard snapshots and existing callbacks; it does not mirror drafts or change either data model. Browser evidence saved a `23:30-07:30`, quality 4 Sleep record and advanced Water from 0 to 1 cup, then observed the updated summaries.

## 5. Journal / Morning Writing / Stock Review

`WritingReflectionFeature` still owns drafts and mutations. AppShell only adds routes and composition. A browser draft survived `Journal -> Notes -> Journal`, then Morning Writing, Journal, and Stock Review each completed a real isolated-DB write. The Journal archive loaded the saved Journal record. Route focus now uses `focus({ preventScroll: true })`, preserving focus semantics without scrolling the first long-page heading under the sticky top bar.

## 6. Quick Notes Domain Delta

`V22__add_quick_note_library_semantics.sql` is forward-only and adds:

- `archived_at DATETIME NULL`
- optimistic `version INT UNSIGNED NOT NULL DEFAULT 1`
- state/created, tag/created, and note-date/created composite indexes

Existing `deleted_at`, `record_timezone`, 120-character title, 5,000-character content contract, and 64-character tag remain canonical. No old migration was edited. A production-like pre-V19 Quick Note fixture survived V19-V22 with body, date, and default lifecycle state intact.

## 7. Quick Notes Create Atomicity

`quick-note.ts` composes `runMutation` and `grantRewardInClient` inside one database transaction:

```text
mutation receipt claim
-> quick_notes insert
-> reward_events insert
-> user_growth increment
-> committed receipt result
```

The same `operationId` plus identical normalized parameters replays the original result. Reusing it with changed content returns 409. A real MySQL `BEFORE INSERT ON reward_events` failure trigger produced HTTP 500 and left zero Notes, rewards, growth rows, and receipts; retrying the same operation after removing the trigger committed once. The reward remains 6 XP / 2 coins for create only.

## 8. Quick Notes List / Pagination

`GET /api/quick-notes` returns `{ items, nextCursor }`, ordered by `(createdAt DESC, id DESC)`. It supports `state=active|archived|deleted`, opaque cursor, note-date `from`/`to`, exact single tag, keyword, and limit 1-100. A 105-row real-DB fixture was traversed in three 37-row pages with 105 unique IDs, and keyword/tag/date/status filters were asserted. Zero-row, one-row, and greater-than-100 states are covered. There was no existing Web Quick Notes consumer of the old raw-array response, so the new contract is one unambiguous paginated shape rather than a dual-shape compatibility mode.

## 9. Quick Notes Detail / Edit

`GET /:id` and `PUT /:id` are user-scoped. Edit requires `expectedVersion`; a stale edit returns 409 and leaves the committed body unchanged. The Web detail owner initializes once from the server snapshot, stores an unsaved draft under a user-and-note key, and does not overwrite it on conflict. Vitest verifies the visible draft survives a 409.

## 10. Archive / Soft Delete / Restore

Explicit archive, unarchive, soft-delete, and restore commands increment the version under a row lock. Delete sets `deleted_at`; it never removes the row or reward. Restore clears `deleted_at` and does not reward again. The real browser exercised all four transitions. The isolated final row is active, not deleted, and at version 6 after create, edit, archive, unarchive, delete, and restore.

## 11. Rewards Rehome

Rewards retains its existing owner, ledger, growth summary, shop, and redemption history. Browser evidence showed exactly one `记录随手记` event worth `+6 XP / +2 金币`; a reward item was created and deleted through the existing UI. Database evidence for browser Note `id=1` is one event key `quick_note:2:1` and one committed `CREATE_QUICK_NOTE` receipt.

## 12. Insights / Tools Rehome

Insights remains at `/insights` with writing archive, time/category statistics, and Sleep series. AI insight cards now state the source, source date, and generation/update time; the existing analyze action displays loading text and acts as regenerate when a result exists. Global feedback remains the configured failure surface. The isolated environment had no external AI key, so no external generation request was made. Decision Tools remains at `/tools`; a real auxiliary-decision record was written and read back, including its existing reward feedback.

## 13. Mobile

At 375x812:

- Notes capture, state tabs, filters, card metadata, and bottom navigation fit without horizontal overflow.
- `scrollWidth=375`, `innerWidth=375` for Notes and Journal.
- Notes distinguishes record date from creation time.
- Capture/detail controls retain 44px mobile hit targets.
- Capture modal uses the dynamic viewport height and scrollable body, so actions remain reachable with a reduced keyboard viewport.
- A live Timer remained visible and controllable on Notes; MiniTimer and bottom navigation did not interfere with the Note workflow.

## 14. Desktop

At 1440x1000, the Notes content is constrained to a readable library width instead of becoming a full-width text wall. Filters remain one row, the card body stays readable, and `scrollWidth=1440`, `innerWidth=1440`. Desktop sidebar entry points for Life, Insights, Rewards, and Tools remain visible.

## 15. Real DB Evidence

All database tests used `mysql://root@127.0.0.1:3408/personal_workbench_r1d_test`; browser writes used `personal_workbench_r1d_e2e_test`. Both names end in `_test`. V22 was applied only to these isolated databases.

| Evidence | Result |
| --- | --- |
| Focused G5a migration + Quick Note suite | PASS, 15/15, 0 skipped/TODO |
| Full API suite | PASS, 50/50, 0 skipped/TODO |
| Fresh V1-V22 migration | PASS |
| Production-like V18 data then V19-V22 | PASS; legacy Quick Note preserved |
| Reward trigger injection | PASS; complete rollback |
| 105-row cursor traversal | PASS; 105 unique rows |
| Personal body isolation | PASS; another user receives empty list and 404 detail |
| Domain side effects | PASS; Task, Schedule, Session, Segment counts unchanged; no Habit tables exist |

## 16. Browser Evidence

Real Web + API + isolated MySQL completed:

```text
create body-only -> reward once -> refresh -> edit
-> archive -> show archived -> unarchive
-> soft delete -> restore
```

It also completed Journal draft navigation, Morning/Journal/Stock Review writes, Sleep/Water writes, Rewards read/write, Insights/archive read, Tools write/read, and cross-route MiniTimer control.

Screenshots:

- `docs/reports/WB-R1.5-G5A-notes-375.png` (375x812)
- `docs/reports/WB-R1.5-G5A-notes-1440.png` (1440x1000)
- `docs/reports/WB-R1.5-G5A-journal-375.png` (375x812)

## 17. R1D Regression

| Check | Result |
| --- | --- |
| Existing API workflow regression | PASS, included in 50/50 |
| Existing Web regression | PASS, included in 72/72 |
| Browser start/pause/resume/finish | PASS |
| Timer visible on Notes | PASS |
| Finish defaults to time-only | PASS |
| Mobile safe-area and no horizontal overflow | PASS |

## 18. Deferred G5b Work

QuickNote-to-Task and QuickNote-to-Journal are deliberately absent. Search, import/export, universal items, complete Settings, Projects, Habits, Growth, Period Reviews, Finance, Agent Bridge, and Media cleanup remain outside G5a. No placeholder actions were added.

## 19. Gate Assessment

```text
EXISTING_LIFE_REHOME: PASS
WRITING_JOURNAL_REHOME: PASS
QUICK_NOTES_CREATE_ATOMICITY: PASS
QUICK_NOTES_LIBRARY: PASS
QUICK_NOTES_EDIT_ARCHIVE_RESTORE: PASS
REWARDS_REHOME: PASS
INSIGHTS_TOOLS_REHOME: PASS
R1D_REGRESSION: PASS
G5A_GATE: PASS
READY_FOR_G5B: YES
```

## Commands

```text
TEST_DATABASE_URL=mysql://root@127.0.0.1:3408/personal_workbench_r1d_test npm run test:g5a --workspace @workbench/api
TEST_DATABASE_URL=mysql://root@127.0.0.1:3408/personal_workbench_r1d_test npm test --workspace @workbench/api
npm test --workspace @workbench/web
npm run typecheck
npm run lint
npm run build
git diff --check
ruby -e 'require "yaml"; YAML.load_file("docs/openapi.yaml")'
```

Every command above passed. The only emitted warnings were npm's pre-existing `ELECTRON_MIRROR` deprecation warning and Node's Vite-time experimental type-stripping warning.
