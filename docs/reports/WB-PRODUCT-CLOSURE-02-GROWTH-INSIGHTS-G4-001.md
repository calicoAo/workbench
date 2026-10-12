# PRODUCT-CLOSURE-02 / GROWTH-INSIGHTS-G4

Date: 2026-10-12  
Slice: **GROWTH-CATEGORY-MAPPING-OWNERSHIP**

### RESULT

**PASS — G4 COMPLETE. GROWTH-INSIGHTS-AND-UI-CLOSURE COMPLETE.**

G1/G2/G3 and Bounty closure remain closed. No subsequent backlog work is started. No API implementation, schema, migration, scoring, execution lifecycle, Rewards, pagination or routing contract changed.

### BEFORE / AFTER OWNERSHIP

Before: Growth's MappingManager owned its own selection/write/error workflow and called the legacy Growth mapping endpoint. Categories already owned the deployed Settings editor and Bounty Quick Manager.

After: Categories exports the narrow `CategoryMappingEditor` interaction and owns its attempted selection, validation, pending state, errors, confirmed identity and query reconciliation. Settings/Bounty CategoryEditor and the mapping interaction share the private `mutateCategory` request capability. Growth owns its configuration presentation, configured Dimension reads/lifecycle and reports. AppShell only composes the Categories public surface into GrowthPage.

Audit distinguished all paths: deployed Category creation/editing is Categories-owned; Growth mapping now uses that same request capability; Dimension disable remains a Growth-owned server transaction. The older exported CategoriesFeature CRUD implementation has no mounted Shell consumer; it remains inside Categories and was not expanded or migrated in this slice. The legacy server mapping endpoint remains available and permanently tested.

### CATEGORY PUBLIC MUTATION CONTRACT

Public surface: `features/categories/index.tsx` exports `CategoryMappingEditor({request,userId,onNotice})`. Its private adapter handles existing Category POST/PUT, shared with CategoryEditor. Growth never imports Categories, avoiding a cycle with Categories' existing public Growth query/select dependency; AppShell injects the editor as a React node.

A mapping save sends **only `{dimensionKey: configuredKey | null}`** to `PUT /api/task-categories/:id`. PUT returns `{id}`, so the mapping workflow subsequently reads `GET /api/task-categories?includeDisabled=true` and commits the exact saved Category identity from that canonical read. No second mapping source or generic mutation framework was added.

### GROWTH CONFIGURATION INTERACTION

G3 header, tabs, explanatory copy and manager structure are preserved. Each row shows the Category identity, current selection, a shared native Dimension select and explicit Save action. Selection alone never writes. Null clears the mapping; enabled configured custom keys and current renamed labels are supported. Disabled Categories remain editable for historical attribution. Missing/disabled mapped keys remain visible until deliberate valid editing; they are not silently converted to null.

Successful save produces both inline confirmation and the existing ApplicationFeedback notice, preserving configuration URL/context. Keyboard form submission, 44px mobile targets and fixed-navigation clearance were verified.

### DIMENSION LIFECYCLE

The existing server `updateGrowthDimension` owner retains expectedVersion checking, locking and atomic unlinking. No client loop of Category PUTs replaces that transaction. A successful disable now also invalidates the affected user's Category-consuming caches; the existing Growth refresh covers overview/detail. Tests prove stale expectedVersion rejection leaves mappings intact and a valid disable clears two dependent mappings together. The legacy mapping endpoint still works.

The previously identified Category-create versus Dimension-disable validation race remains outside G4, as directed; it was not introduced by this change and does not block this slice's established acceptance criteria.

### HISTORICAL MAPPING RECONCILIATION

Historical Category identity → **current** Category-to-Dimension mapping. Changing A from X to Y reinterprets grouping, not stored occurrences.

Real browser fixtures at both viewports reconcile exactly:

| State | X | Y | Unmapped | Total |
| --- | ---: | ---: | ---: | ---: |
| Before mapping change | 1680s | 0s | 360s | 2040s |
| A mapped to Y | 780s | 900s | 360s | 2040s |
| A mapping cleared | 780s | 0s | 1260s | 2040s |

Category A retains 900s, one CompletionEvent, two closed Segments, the same Task/Session/Segment identities and one Session note. SQL snapshots confirm Tasks, Sessions, Segments, Schedule projections, CompletionEvents and Rewards/user Growth remain unchanged. The permanent public-API test additionally compares daily assignments and canonical G2 Task, execution, Session and completion DTOs before/after. G1 summary totals and Rewards XP remain unchanged.

### METADATA PRESERVATION

No mapping-only payload includes name, color, targetMinutes, enabled, icon or order. Real MySQL checks preserve all those fields, including hidden targetMinutes=12345 and icon=original-icon on a disabled Category. Partial server updates preserve concurrent edits to other fields. Category PUT has no established version field; G4 adds no new same-field conflict semantics. The post-acknowledgment read uses the latest server row rather than manufacturing a row from draft defaults.

### FEEDBACK / RETRY / AUTH SAFETY

- Failed write preserves attempted selection and canonical cache, shows an error and permits retry.
- Pending ref/state guards prevent duplicate writes, including repeated form submission.
- Acknowledged write followed by read failure shows an explicit read-retry action. That retry performs GET only, never another PUT.
- User identity keys the interaction lifetime. Unmounted or previous-user responses cannot commit state/cache or emit notices into the current user's interaction.
- Before committing the confirmed read, affected in-flight user queries are cancelled so an older response cannot revert the saved mapping.

These behaviors have permanent focused regression coverage.

### QUERY INVALIDATION

Categories commits the canonical row into metadata-bearing cached snapshots and invalidates only these authenticated-user prefixes:

`task-categories`, `today`, `settings`, `growth-config`, `growth-overview`, `tasks`, `task`, `timeline`.

The Growth overview prefix also covers G2 All Categories, Category Detail and contribution breakdowns. Bounty Category options share the Category key. Snapshot statistics remain intact when metadata is patched; disabled options stay filtered from active pickers. Other users' queries are untouched. No QueryClient clear or global mapping store was added.

### REAL MYSQL TESTS

**46 / 46 passed**, five suites, real MySQL 8.0.25:

- New `growth-category-mapping-ownership.test.ts`: authenticated public Category/Dimension/Task/Timer journey, historical remapping reconciliation, hidden metadata preservation, foreign/disabled Dimension rejection, cross-user Category ownership, atomic disable/version failure and legacy endpoint compatibility.
- Existing `growth-category-read-contract.test.ts` (G1).
- Existing `growth-category-detail.test.ts` (G2).
- Existing `bounty-category-quick-manager.test.ts`.
- Existing `r2d1-growth.test.ts`, including fresh migration and V31→V32 upgrade preservation.

Run from `apps/api` with `TEST_DATABASE_URL` pointing to the task's isolated `_test` database; `node --import tsx --test --test-concurrency=1 tests/growth-category-mapping-ownership.test.ts tests/growth-category-read-contract.test.ts tests/growth-category-detail.test.ts tests/bounty-category-quick-manager.test.ts tests/r2d1-growth.test.ts`.

Each integration suite creates/drops its own disposable database. Browser QA used a fresh database with all **42 migration files through V41**. Temporary database, processes, profile and native datadir were removed after acceptance; no production/development database was touched. [Cleanup evidence](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G4-cleanup.json).

### WEB TESTS

| Gate | Result |
| --- | --- |
| Focused Categories/Growth/Bounty/Shell/architecture, 7 files | 138 passed |
| Full Web, 36 files | 372 passed |
| API + Web typecheck | PASS |
| API integration-test typecheck | PASS |
| Lint + i18n audit | PASS; missing/untranslated/visible-Chinese findings: 0 |
| API + Web production build | PASS |
| Architecture checker | PASS; 0 errors, 0 warnings |
| git diff --check | PASS |

New mapping tests cover custom/null/current renamed mappings, disabled/missing keys, hidden metadata, retry, pending duplicate prevention, confirmed-write/read-retry separation, user switching/late replies, user-scoped invalidation and stale-read cancellation. Growth tests additionally exercise mapping→overview→canonical detail and server-owned Dimension-disable cache integration. Existing Bounty and Settings tests remain green. Build emits the existing advisory for a bundle over 500kB; it is not a failed gate or expanded into unrelated bundling work.

[Verification record](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G4-verification.json).

### BROWSER ACCEPTANCE

**PASS at 1440×1000 and 375×812 CSS pixels**, explicitly asserted. Real public UI/API journey at each viewport:

Growth direct configuration URL → select configured custom/renamed Dimension → confirm selection alone did not persist → keyboard Save → confirmation → Overview → keyboard-expand target Dimension → Category Detail → canonical Task execution history → Back/Forward → direct configuration reload → clear mapping → Save.

Both journeys assert correct mapping, exact contribution seconds/events/Segments, unchanged source facts/metadata/XP, retained URL context, no horizontal overflow and fixed-navigation clearance. Mobile controls are at least 44px high. Lifecycle fixtures use authenticated public commands; only disposable elapsed-time fixture timestamps were retimed through SQL. Browser acceptance is supplemented by the unretimed public-API integration journey above.

[Browser assertions and fixture evidence](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G4-browser.json). Twelve screenshots were captured; desktop mapping, mobile mapping and mobile Category detail were visually reviewed.

- [Desktop saved mapping](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G4-mapping-saved-1440.png)
- [Mobile saved mapping](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G4-mapping-saved-375.png)
- [Mobile Category detail](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G4-category-375.png)

### ARCHITECTURE CONFORMANCE

Categories owns the mapping interaction and canonical Category mutation lifecycle. Growth owns configured Dimension semantics, atomic lifecycle and historical report interpretation. Tasks owns execution facts. ApplicationFeedback owns notices. AppShell gained only public-surface composition. No private cross-feature import, runtime cycle, duplicate persistent mapping, dependency or generic framework was added.

`docs/ARCHITECTURE.md` records the public contract, dependency direction, canonical refresh behavior, current-mapping historical rule and Dimension ownership. A permanent architecture test rejects Category API paths or Category runtime imports inside Growth, rejects private Growth imports from the mapping interaction and checks reuse of the Categories mutation capability.

The baseline hashes of 595 existing files identify only eleven intended existing-file changes. API production source, migration history, OpenAPI, prior reports and unrelated dirty work are unchanged. New files are limited to owner-scoped implementation/tests and G4 browser/report evidence. [Workspace preservation evidence](WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G4-workspace-preservation.json).

### REMAINING BLOCKERS

**NONE.** No mandatory verification remains. G4 and **GROWTH-INSIGHTS-AND-UI-CLOSURE** are complete.
