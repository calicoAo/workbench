# Repository Governance

`docs/ARCHITECTURE.md` is this repository's architecture system of record.

- Before any non-trivial implementation, read `docs/ARCHITECTURE.md` and the relevant nearby code/configuration.
- Use the `engineering-architecture` Skill for changes involving feature or module ownership, state ownership, data flow, entrypoints, public surfaces, dependency direction, or other durable boundaries.
- Respect documented module ownership, dependency direction, and public surfaces. Do not reach through another module's internals or silently create a competing source of truth.
- Do not silently bypass the architecture contract. If a requirement conflicts with it, state the conflict, make the decision deliberately, and update `docs/ARCHITECTURE.md` in the same change when the durable contract changes.
- Preserve existing architecture unless evidence supports a scoped change. Do not introduce layers, shared abstractions, or dependencies only for architectural appearance.
- Documented known exceptions are not patterns to copy or expand. New code must not extend an exception unless the architecture decision is deliberately revisited.
- If the documented architecture and the actual code materially disagree, verify the implementation before proceeding. Do not silently treat either side as authoritative; report the drift and update the contract when it is stale.
- Trivial copy, styling, rename, or isolated local fixes do not require the full architecture workflow; keep them inside the existing owner and boundary.
- For non-trivial work, run the relevant repository checks and review the architecture delta before finishing.
