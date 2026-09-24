# WB-R2B Data Maintenance and Project Materials

Date: 2026-09-21  
Task: `WB-R2B-DATA-MAINTENANCE-AND-PROJECT-MATERIALS-001`  
Branch: `codex/workbench-auth-system`  
Baseline HEAD: `e312009cee1d4ee83782e66da26d65695f78d79e`

## 1. Scope

This package adds the minimum R2B surfaces only:

- a composed, read-and-restore Trash surface for domains that already have a complete soft-delete contract;
- an optional single-Project association owned by Quick Notes;
- a first-party Project material-summary view that links back to the owning Quick Note;
- the Settings Data entry, responsive UI, contracts, tests, migration evidence, and browser evidence required by the gate.

It does not add a universal Trash table, generic item/event model, permanent-delete platform, multi-Project Note relation, import, Habits, Growth, Period Reviews, Finance, Bridge access, or Task/Timer redesign. Existing R2A working-tree changes were preserved. The implementation follows the existing owner boundaries in `docs/ARCHITECTURE.md`; no new shared abstraction was introduced for a two-type problem that currently has one eligible type.

## 2. R2A Baseline

R2A Project ownership remains unchanged: Projects own Project lifecycle and project summaries; Tasks own current Task association; occurrence-time attribution remains snapshotted on Timer Segments and Schedules. R2B does not make Projects an owner of Quick Note text and does not change Task, Assignment, Timer, ActualTime, Search matching, or reward semantics.

The R2A report was present at `docs/reports/WB-R2A-PROJECTS-001.md`, and its screenshots and uncommitted WIP were not reset, stashed, cleaned, or rewritten. V1-V24 were not modified.

## 3. Domain Delete Capability Audit

Eligibility requires a stable user-visible soft delete and a matching restore command. A `deleted_at` column alone is not sufficient.

| Domain | Archive | Soft delete | Restore from delete | Permanent delete | Current owner | R2B Trash status |
| --- | --- | --- | --- | --- | --- | --- |
| Tasks | Yes | Yes, `removeTask` | No delete-restore command | No | Task completion / Tasks | `NOT_TRASH_ELIGIBLE_YET` |
| Quick Notes | Yes | Yes | Yes, versioned and idempotent | No | Quick Notes | ELIGIBLE |
| Journal / Morning Writing | No separate archive | Rows have delete markers, but no complete public delete lifecycle | No | No | Writing | `NOT_TRASH_ELIGIBLE_YET` |
| Calendar / Schedule | Cancellation writes `deletedAt` | Yes for supported cancellation flows | No | No | Schedules / Manual Actual / Timer workflow | `NOT_TRASH_ELIGIBLE_YET` |
| Projects | Yes | No Project delete lifecycle | Archive restore only | No | Projects | `NOT_TRASH_ELIGIBLE_YET` |
| Sleep / Water | No | No public delete command | No | No | Life record routes | `NOT_TRASH_ELIGIBLE_YET` |

Project archive is deliberately absent from Trash. Task archive is likewise not treated as deletion. The Web renders only `All` and `Quick Note` filters; it does not render disabled placeholders for ineligible domains.

## 4. Unified Trash Read Model

`GET /api/trash` is a composition endpoint with no persistence table. Its current source is `quick_notes`, filtered by authenticated `userId` and non-null `deletedAt`.

Contract properties:

- filters: `type=all|quick_note`;
- cursor pagination with a maximum page size of 50;
- deterministic ordering: `deletedAt DESC, id DESC`;
- cursor carries the exact `deletedAt` and `id` tie-breaker;
- response contains type, identity, title, a 160-character normalized excerpt, date/tag/project metadata, version, deletion time, and owner deep link;
- response does not expose a `content` field or generic Project DTO enrichment;
- archived-only and active records are excluded;
- unsupported types fail validation instead of returning a misleading empty result.

The Settings route `/settings/trash` owns only filters, pagination, retry UI, and owner-command dispatch. There is no mobile bottom-tab addition and no permanent-delete control.

## 5. Restore Ownership

Both `POST /api/quick-notes/:id/restore` and `POST /api/trash/quick_note/:id/restore` delegate to the Quick Notes public capability `restoreQuickNote`. The Trash route never updates `quick_notes` directly.

The owner capability:

1. records `operationId`, command type, and request fingerprint through `runMutation`;
2. locks the user-owned Note;
3. verifies `expectedVersion` and deleted state;
4. clears `deletedAt` and increments version once in the same transaction;
5. returns the committed result for an identical replay;
6. returns an explicit `409` for state, version, or changed-fingerprint conflicts.

Restore never calls reward grant logic. The concurrent test proves that distinct operations racing at the same version yield one `200`, one `409`, one version increment, and no extra reward.

## 6. QuickNote -> Project Model

V25 adds `quick_notes.project_id BIGINT UNSIGNED NULL`, the composite lookup index `(user_id, project_id, deleted_at, note_date)`, and a foreign key to `projects.id` with `ON DELETE SET NULL`.

The relation is exactly zero-or-one Project per Quick Note. Create and edit validate through the Projects public capability inside the same transaction:

- Project must belong to the authenticated user;
- a new association requires a non-archived Project;
- association can be changed or cleared;
- an already-linked archived Project remains visible as historical context;
- Project archive does not clear the relation;
- a future physical Project delete can null the relation but cannot delete the Note.

Association only writes `quick_notes.project_id`. Tests prove it creates no Task, Schedule/ActualTime, Timer Segment, or reward event and does not copy text into `projects.notes`.

## 7. Project Materials

`GET /api/projects/:id/materials` first verifies that the Project belongs to the current user, then reads the Quick Notes-owned summary capability. Deleted Notes are excluded; restoring a Note makes its preserved association visible again.

The Project Notes tab displays title, excerpt, `noteDate`, tag, archived marker when applicable, and `/notes/:noteId?date=...` deep link. It remains a light section inside the existing Notes tab. The generic Project detail DTO and Project lifecycle are unchanged.

## 8. Privacy Boundary

The materials endpoint is marked `FIRST_PARTY_PERSONAL_TEXT_SUMMARY` and documented as a personal-text-protected first-party capability. Project ownership alone is not a Bridge or integration permission to read Quick Note bodies.

Trash and Project materials return bounded excerpts, not a `content` field. Full text remains available only through the current user's Quick Notes owner route. Cross-user association and material reads return `404`; deleted Notes are excluded from Search, active Note queries, and Project materials.

## 9. Data / Export Integration

Settings Data now contains both the formal Trash entry and the existing domain Export controls. Export remains user-triggered. `includeTrash=false` is still the default; the existing explicit `includeTrash=true` toggle is preserved. Import remains deferred and no empty Import route was added.

Search was not redesigned. It continues to exclude deleted records and regains a restored Quick Note through its normal owner query. Project-name matching was not added to Quick Note Search.

## 10. Migration

New forward migration: `db/migration/V25__add_quick_note_project_material.sql`.

| Check | Result | Evidence |
| --- | --- | --- |
| V1-V24 unchanged | PASS | Git diff contains only new V25 for R2B schema evolution |
| Empty schema, ordered V1-V25 | PASS | `personal_workbench_r2b_fresh_test`; all 25 files applied in numeric Flyway order including V2 before V2_1 |
| Runtime mapping matches SQL | PASS | nullable unsigned `project_id`, index, and `ON DELETE SET NULL` foreign key confirmed by `SHOW CREATE TABLE quick_notes` |
| Production-like V24 fixture -> V25 | PASS | pre-existing Note body/version survived; new `project_id` began null; later association worked |
| Universal Trash table absent | PASS | fresh schema contains no Trash table |

These local fixture databases intentionally have no `flyway_schema_history`; migrations were applied file-by-file for shape/backfill verification. No production connection, Flyway repair, deployed checksum change, or production data write was performed.

## 11. Real DB Evidence

Backend tests used dedicated MySQL databases whose names end in `_test`. The browser acceptance used `personal_workbench_r1d_e2e_test` on `127.0.0.1:3408`, migrated through V25. This is isolated test evidence, not a production claim.

Focused R2B integration coverage is 7 tests covering all 22 required backend assertions:

- deleted-only eligibility, archive exclusion, user isolation, type validation, cursor pagination, and deterministic ordering;
- owner dispatch, identical-operation replay, concurrent conflict, reward non-duplication, Search removal/reappearance, and normal-query reappearance;
- set/change/clear Project association, cross-user rejection, archived-Project rules, preserved historical relation, owner survival, Project material privacy, delete/hide/restore behavior, and zero Task/time/reward side effects.

For the browser account, before delete/restore the database had one Quick Note creation reward totaling `6 XP / 2 coins`. After restore it still had exactly one event totaling `6 XP / 2 coins`; the Note was active at version 5 and retained no unintended Project link after the explicit unlink flow.

## 12. Browser Evidence

Real browser acceptance used Web `127.0.0.1:5173`, API `127.0.0.1:3000`, and the isolated MySQL database.

Flow A passed:

`create Quick Note -> delete -> open Settings Trash -> restore -> reward count unchanged -> Note visible again in the normal Notes list`.

Flow B passed:

`create Project -> create Quick Note -> associate Project -> material visible in Project Notes -> open Note from deep link -> unlink -> Project material empty state`.

Responsive evidence:

- `docs/reports/WB-R2B-trash-375.png`: 375 x 900, `scrollWidth=375`; readable compact filters/card, visible Restore action, bottom navigation unobstructed.
- `docs/reports/WB-R2B-trash-1440.png`: 1440 x 1000, `scrollWidth=1440`; constrained content width, no viewport-wide record stretching.
- `docs/reports/WB-R2B-project-materials-375.png`: 375 x 900, `scrollWidth=375`; lightweight summary and deep link, no copied full-body presentation.

## 13. R1 / R2A Regression

| Command / evidence | Result |
| --- | --- |
| `TEST_DATABASE_URL=mysql://root@127.0.0.1:3408/personal_workbench_r2b_full_test npm run test:r2b` | PASS, 7/7, 0 skipped/TODO |
| `TEST_DATABASE_URL=mysql://root@127.0.0.1:3408/personal_workbench_r2b_full_test npm test -w apps/api` | PASS, 73/73, 0 skipped/TODO |
| `npm test -w apps/web` | PASS, 91/91 |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS; repository lint remains TypeScript validation |
| `npm run build` | PASS; API TypeScript and Web Vite production build |
| OpenAPI YAML parse | PASS |
| `git diff --check` | PASS |

The final full API run also used the fresh V1-V25 `personal_workbench_r2b_full_test` database. It includes R2A Project/Task ownership, R1D Project-to-Task accept/start/pause/resume/finish workflows, R1.5 QuickNote-to-Task, Search, Journal, Export, and transaction regressions. The full Web suite includes Trash list/empty/filter/restore/failure, Quick Note association/removal, Project material deep link, historical archived Project display, R2A Project UI, R1.5 Quick Notes, and R1D execution UI coverage.

## 14. Deferred Domains

- Tasks remain out of Trash until the Tasks owner defines delete restore and concurrency semantics.
- Schedule/Manual Actual cancellation remains out until each owner defines a restore contract compatible with projection invariants.
- Journal/Morning Writing, Sleep, and Water remain out until they have complete user-visible delete and restore capabilities.
- Project archive remains archive; Project delete is not invented for Trash.
- Permanent delete, retention/cleanup policy, and Import remain later Data Maintenance work.

All are `NOT_TRASH_ELIGIBLE_YET`, not partially implemented or represented by disabled UI.

## 15. Gate

```text
TRASH_DOMAIN_AUDIT:
PASS

UNIFIED_TRASH:
PASS

RESTORE_IDEMPOTENCY:
PASS

QUICKNOTE_PROJECT_ASSOCIATION:
PASS

PROJECT_MATERIALS:
PASS

PRIVACY_BOUNDARY:
PASS

R2A_REGRESSION:
PASS

R2B_GATE:
PASS

READY_FOR_R2C:
YES
```

R2B stops here. No R2C or Habits work was started.
