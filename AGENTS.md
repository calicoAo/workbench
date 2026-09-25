# Repository Governance

`docs/ARCHITECTURE.md` is this repository's architecture system of record.

- Before reporting a task as blocked, distinguish a product/code blocker from a locally resolvable execution-environment issue. Resolve the latter within the repository's established safety boundaries whenever possible.
- Before any non-trivial implementation, read `docs/ARCHITECTURE.md` and the relevant nearby code/configuration.
- Use the `engineering-architecture` Skill for changes involving feature or module ownership, state ownership, data flow, entrypoints, public surfaces, dependency direction, or other durable boundaries.
- Respect documented module ownership, dependency direction, and public surfaces. Do not reach through another module's internals or silently create a competing source of truth.
- Do not silently bypass the architecture contract. If a requirement conflicts with it, state the conflict, make the decision deliberately, and update `docs/ARCHITECTURE.md` in the same change when the durable contract changes.
- Preserve existing architecture unless evidence supports a scoped change. Do not introduce layers, shared abstractions, or dependencies only for architectural appearance.
- Documented known exceptions are not patterns to copy or expand. New code must not extend an exception unless the architecture decision is deliberately revisited.
- If the documented architecture and the actual code materially disagree, verify the implementation before proceeding. Do not silently treat either side as authoritative; report the drift and update the contract when it is stale.
- Trivial copy, styling, rename, or isolated local fixes do not require the full architecture workflow; keep them inside the existing owner and boundary.
- For non-trivial work, run the relevant repository checks and review the architecture delta before finishing.

# Verification Environment Governance

Repository verification is an execution responsibility, not a user prerequisite.

- Do not report integration tests, migration checks, browser QA, or database-backed acceptance as blocked merely because an environment variable such as `TEST_DATABASE_URL` is unset or because the first/default local database port is not running.
- Before declaring a verification environment unavailable, inspect the repository's existing test scripts, package scripts, Docker/Compose files, test configuration, nearby reports, and established local QA conventions to determine how isolated verification has previously been run.
- Reuse established repository verification infrastructure when it exists. Do not invent a parallel test-environment convention unnecessarily.

## Database-backed verification

When a task requires real database integration:

1. Determine the current migration head and the repository's test-database safety requirements.
2. Discover an available local test MySQL instance from repository configuration and previously established test conventions.
3. Probe known test-service candidates before declaring them unavailable. Do not assume that one hard-coded/default port is the only valid database endpoint.
4. If no suitable service is already running, inspect and use the repository's existing Docker/Compose/test-service startup mechanism when available.
5. Create a fresh disposable database dedicated to the current task. Its name must satisfy repository safety guards, such as an `_test` suffix when required.
6. Run the required fresh-migration, upgrade, focused-integration, and regression checks against that disposable database.
7. Keep production and long-lived development databases untouched unless the task explicitly authorizes otherwise.
8. Drop disposable QA databases and stop temporary services after browser/acceptance work unless repository convention explicitly keeps them.

Absence of `TEST_DATABASE_URL` means "resolve or provision the test environment"; it does not by itself mean "verification is blocked".

Never weaken a production invariant or test guard merely to make a disposable environment easier to run.

## Browser acceptance

When browser evidence is required:

- Prefer an isolated QA database and isolated API/Web processes instead of a long-running development environment.
- Use the repository's existing browser-evidence mechanism, such as Chrome CDP or Playwright, when already established.
- For viewport-specific acceptance, explicitly set and assert the CSS viewport. Do not resize desktop screenshots and present them as mobile evidence.
- For file-upload flows, use the browser automation API to bind files to the actual file input; do not treat the native OS file chooser as a blocker when the automation framework can set files directly.
- Use fresh temporary browser profiles/processes if a reused browser session becomes unstable.
- Browser evidence must exercise the real public UI and API path when the acceptance requirement is end-to-end; direct API setup may prepare fixtures but must not replace the user flow being tested.

## Blocker standard

An environment blocker may be reported only after the agent has made a reasonable attempt to resolve the environment itself.

A valid environment blocker report must include:

- what repository configuration/scripts were inspected;
- what service or database endpoints were probed;
- what provisioning/startup action was attempted;
- the concrete command or operation that failed;
- the actual failure/error;
- why continuing would risk production data, violate repository safety rules, or require unavailable external credentials/infrastructure.

Do not use these as sufficient blocker reasons by themselves:

- `TEST_DATABASE_URL` is unset;
- the default database port is closed;
- an old disposable QA database no longer exists;
- a long-running dev server points at the wrong schema;
- a previous temporary browser profile no longer works.

Those conditions require environment setup or rediscovery first.

## Verification completeness

- Compilation, typechecking, mocks, or Web unit tests do not substitute for real database integration when the task explicitly requires database semantics.
- A test that did not run must be reported as `NOT_RUN` or `BLOCKED`, never `PASS`.
- Do not infer a business gate from nearby tests. Execute the requested focused scenario when it materially defines acceptance.
- When an implementation is complete but required verification is missing, distinguish:
  - `IMPLEMENTATION_COMPLETE_CANDIDATE`
  - `VERIFICATION_INCOMPLETE`
    rather than describing the feature itself as complete.
- If real verification exposes a defect, fix the smallest owner-scoped defect when authorized by the task, then rerun the relevant focused and regression checks.
- Do not silently expand scope to unrelated cleanup while closing verification.

## Task continuity

Before executing a non-trivial work package:

- Confirm the exact task/work-package identifier from the latest instruction.
- Do not resume an older report, branch of work, or previously blocked task merely because similarly named files exist.
- Treat earlier reports as evidence/history, not as the current instruction.
- When the latest task is explicitly a closure or acceptance task, continue from the existing implementation instead of re-running an older implementation/audit package.

## Bug Fix Governance

Bug fixing is corrective work, not an invitation to redesign the surrounding system.

Scope discipline

Before modifying code, reproduce the reported issue when reasonably possible and identify the actual root cause.

Prefer the smallest owner-scoped fix that restores the intended behavior.

Do not use a bug fix as an opportunity to refactor unrelated modules, redesign adjacent flows, rename broad surfaces, or introduce new abstractions unless the defect cannot be fixed safely without doing so.

Preserve existing architecture, ownership, public contracts, and business semantics unless the bug itself demonstrates that one of them is incorrect.

If fixing the defect requires a durable architecture, API, schema, ownership, or business-semantics change, state that explicitly before treating it as an ordinary bug fix. Update the relevant architecture/API documentation in the same change when authorized.

Do not turn a local workaround into a new architectural pattern.

Do not add a generic framework, shared layer, event system, or dependency merely to fix one isolated defect.

Product-semantic boundary

Do not silently decide product or domain semantics while fixing a bug.

Treat an issue as requiring an explicit product/domain decision when the expected behavior is not already established by the current architecture, specification, tests, or surrounding implementation.

Examples include questions such as:

whether completing a Task should automatically stop an active Timer;

whether a refund should be represented as negative expense, income, or another accounting semantic;

whether deleting or archiving a Project should affect related Inspiration content;

whether historical Growth attribution should follow current mappings;

which module owns a piece of state or derived data.

When the expected semantic is ambiguous:

report the ambiguity;

identify the competing interpretations and affected owners;

do not choose a new business rule merely to make the failing case pass;

wait for an explicit decision unless an existing source of truth already resolves it.

Straightforward implementation defects may be fixed directly, including:

layout/overflow/collision bugs;

stale UI state;

incorrect rendering or formatting;

duplicate requests or accidental duplicate writes contrary to existing invariants;

crashes and exceptions;

broken navigation;

incorrect API wiring;

regression-test failures whose expected behavior is already defined.

Database and migration safety

If the fix does not require a schema change, do not modify migration history.

If a schema change is genuinely required, use a new forward-only migration from the current migration head.

Never edit an already-applied historical migration merely to repair the current environment.

Do not weaken constraints, ownership boundaries, idempotency guarantees, transaction boundaries, or production safety checks just to make a test pass.

Use the repository's isolated database-verification process when database semantics are involved.

UI bug fixes

For UI-only defects:

Fix the actual interaction or presentation defect without opportunistically redesigning the page.

Reuse the existing design system and component ownership.

Do not modify global Button/Input/Modal/AppShell behavior unless the root cause is actually global.

For responsive defects, verify the real target viewport instead of resizing a desktop screenshot.

Check for overlap with fixed UI such as bottom navigation, FABs, drawers, sticky headers, and safe areas.

Preserve desktop/mobile behavior outside the affected surface unless the root cause is shared.

Regression strategy

Every bug fix should add or strengthen evidence that would have caught the defect before the fix.

Run, as applicable:

a focused reproduction/regression test for the exact bug;

tests for the affected owner/module;

tests for directly adjacent integration surfaces when the fix crosses a boundary;

full regression when the change has broad impact or the task explicitly requires it;

typecheck, lint, build, and git diff --check according to repository convention.

When a UI/browser defect materially depends on viewport or real interaction, add browser evidence or an automated browser assertion instead of relying only on component tests.

When database behavior is involved, Web/unit tests do not substitute for real database integration.

Root-cause reporting

A completed bug-fix report should distinguish at least:

ROOT_CAUSE
FIX
REGRESSION_RISK
TESTS_RUN
REMAINING_BLOCKERS

ROOT_CAUSE should explain why the defect occurred, not merely restate the visible symptom.

FIX should identify the owner and the smallest behavior changed.

REGRESSION_RISK should identify nearby behavior that could plausibly be affected.

TESTS_RUN should state what actually ran and its result.

REMAINING_BLOCKERS should be NONE when no blocker remains. Do not describe unexecuted verification as PASS.

Blocker handling

The existing Verification Environment Governance applies equally to bug fixes.

In particular:

an unset TEST_DATABASE_URL;

an inactive default MySQL port;

a stale temporary QA database;

an unstable reused browser profile;

are not sufficient reasons by themselves to stop a bug-fix closure.

Resolve or provision the isolated verification environment when reasonably possible before reporting BLOCKED.

Stop condition

Once the reported defect is fixed and the necessary regression evidence is green:

stop;

do not continue into unrelated cleanup;

do not implement nearby feature requests unless explicitly requested;

record any newly discovered unrelated issue separately instead of silently expanding the current patch.