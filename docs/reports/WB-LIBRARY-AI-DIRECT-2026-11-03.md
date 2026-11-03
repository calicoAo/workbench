# WB-LIBRARY-AI-DIRECT-2026-11-03

Task: replace mandatory TMDB/Open Library resolution in Library AI search with direct web-evidence preview and explicit import. Base HEAD at start of this change: `4b3ede2`; existing Library UX and completion-date ordering are preserved.

## RESULT

Implemented locally. AI web search is now the default import mode for books, films, whole series/animation, and games. The path is query → DeepSeek Search → structured metadata candidates → editable signed preview → existing Library confirmation transaction → detail reentry. TMDB/Open Library remain optional fallbacks; the AI path does not call their metadata APIs.

Production deployment: **NOT_RUN** in this work package. No commit, push, production schema change, new media store, dependency, or global state framework was introduced.

## ROOT_CAUSE / FIX

The previous AI feature only forwarded a selected title to TMDB/Open Library. It therefore retained the unstable dependency the user intended to replace. Native autonomous web tools also required a separate model and could perform uncontrolled additional calls.

Library now calls the independent DeepSeek Search endpoint once, then reuses the existing configured `DEEPSEEK_MODEL` structured gateway once at most. Search evidence is bounded, treated as untrusted data and indexed by the server. Model references must match those evidence rows. The optional pro-only Library model variable was removed from active configuration; no key values were changed or exposed.

The server constructs `WEB_SEARCH` sources from persisted user-owned artifacts. Clients send only operation identity and candidate index to the new preview endpoint. Source identity, canonical URL, references and cover come from the signed server snapshot. Existing whitelist edits, ten-minute preview expiry, expected versions, user locks, source uniqueness and mutation receipts remain authoritative. Personal `shortNote` is never overwritten.

A secondary lifecycle defect was corrected: an acknowledged import starts a fresh draft on next entry rather than restoring frozen controls. Lost acknowledgments still retain the exact original operation/payload for receipt-based recovery. Search input, candidates and edited previews survive refresh. Another tab's pending identity cannot be overwritten by a new paid request.

## DATA / API

No migration: current V43 `library_item_sources` provider/type strings and normalized JSON metadata support `WEB_SEARCH` and `GAME`.

- POST `/api/library/import/ai-search`: query (1–72 UTF-16 units), mediaType, operationId. At most five candidates; no Library writes.
- GET `/api/library/import/ai-search/:operationId`: user-scoped, permission checked, pure status/result read. Expired pending derives `FAILED_UNKNOWN` after 60 seconds; same-operation replay does not charge again.
- POST `/api/library/import/ai-search/:operationId/preview`: candidateIndex and optional targetItemId. No provider call; produces the existing signed preview and differences.
- Existing confirm optionally accepts `omitCover`; arbitrary image/identity/URL fields remain rejected. Original cover provenance stays in the source snapshot, so an explicitly omitted cover remains a user edit in later three-way comparison.
- Detail returns source reference titles/URLs; lists do not return full source snapshots or long descriptions.

Identity is the hash of the normalized primary source URL within existing user/provider/type uniqueness. URL fragments and common tracking parameters are removed; known book-product tracking URLs are normalized to their product paths. Different URLs for the same work can still require explicit manual association. This is not title-based or globally canonical work matching.

## FAILURE / SECURITY / COST

Only the configured server-side DeepSeek API origin is requested. No arbitrary reference webpage fetch, external HTML execution, Douban crawling or source API fallback occurs in AI mode. Evidence limits: five rows, 1000 text characters each for the model, 16,000 inspected characters per search row, 2 MiB response cap; existing model-request byte cap and 20s Search / 30s model timeouts apply. Search excludes Douban and TMDB domains. Keys stay server-side; `.env` and private QA ledger are gitignored, and `.env.example` contains placeholders only.

No automatic paid retries. Unknown outcomes retain their operation; new paid searches require an explicit user action. Per-user quota is 20 operations per business day/timezone, plus the existing process-local route limiter. Search tool calls and model token usage are retained on the artifact, including search-success/model-failure cases. The existing RMB8 smoke-test budget was respected; the private ledger's conservative cumulative upper bound, including previous unknown timeouts, is below RMB0.74. This is a reservation bound, not a provider invoice.

Covers require BOTH an exact URL in cited search evidence and an allowed dedicated image endpoint: Open Library Covers, Wikimedia raster files or Google Books content. The model cannot synthesize a cover URL. No reliable cover means null; users can omit the offered cover. References are saved, images are not downloaded or cached. Browser image loading can still fail in China and uses the existing placeholder. Web search does not guarantee correct edition matching or a cover for every title; every AI candidate is explicitly for review.

## TESTS_RUN

| Gate | Result / evidence |
| --- | --- |
| API real MySQL + mocked provider contracts | PASS, 20 tests across `media-task-split.test.ts` and `vnext-11-14.test.ts` |
| Fresh / upgrade migrations | PASS; disposable native MySQL on 127.0.0.1:33307, full V43 fresh and V42→V43 upgrade; existing data retained |
| AI import domain cases | PASS; search permission, user ownership, metadata/source persistence, cover trust, rejected client cover tampering, concurrent confirm, reentry, omit-cover three-way preservation, expired pending recovery and no paid replay |
| Web full regression | PASS, 44 files / 435 tests |
| Lint / i18n, API test typecheck, build | PASS; i18n missing=0. Build retains its existing large-chunk warning. |
| Browser real UI + API + MySQL, local provider fixture | PASS at 1440×1000 and 375×812; input/edit recovery, cover reference/provenance, detail reentry, source duplicate handling and absence of TMDB calls; see evidence/browser.json |
| Real DeepSeek Search + structured provider smoke | PASS for metadata: 4,024ms, one Search and one `deepseek-flash` response; 4,795 input / 370 output / 0 reasoning tokens. Three 《十二国记》 candidates with actual web references returned. This was an isolated provider smoke, not production or browser/provider E2E. |
| Real provider cover discovery | NOT_OBTAINED in the live sample; all candidates correctly returned null covers. Cover persistence/selection was verified with provider fixtures, not claimed as successful live image discovery. |
| China production egress / deployed browser | NOT_RUN in this package |

Browser harness: `scripts/library-ai-direct-browser-evidence.mjs`; fixture server: `scripts/library-ai-provider-fixture.mjs` (loopback 33308). API/Web run separately against disposable `wb_library_direct_browser_test` with the fake DeepSeek key/base URL and TMDB key empty. Chrome CDP uses a fresh QA profile on port 9338. The final browser rerun used the built API (`node apps/api/dist/index.js`) and Web build (`vite preview`), and passed again. Disposable QA databases were dropped and temporary API/Web/provider/Chrome/MySQL processes stopped after acceptance. This separates deterministic wire/storage acceptance from the real paid provider smoke.

The browser run also exercised a real execution issue: Vite retained an older transform and a reused browser waited indefinitely for an animation. Restarting the isolated Web process and using a fresh Chrome profile resolved it; screenshots now use bounded waits. No production invariant or safety guard was weakened.

## REGRESSION_RISK / ARCHITECTURE

Changed surfaces stay in Library: web-search evidence adapter, candidate orchestration, preview/confirm and local draft workflow. AI Foundation remains settings/artifact owner; the existing DeepSeek structured adapter remains shared provider infrastructure. No private cross-domain context is read. Existing TMDB/Open Library contracts, Tasks publication and Library completion-date ordering were covered by adjacent regression tests.

Durable contracts updated in `docs/ARCHITECTURE.md` and `docs/openapi.yaml`. Known limits are best-effort cover discovery/loading, review-required bibliographic accuracy and URL-based duplicate identity. Source association remains explicit; existing TMDB items can be unlinked and associated to an AI source through the existing detail action.

REMAINING_BLOCKERS: NONE for the local implementation. Production deployment and China-host connectivity remain separate unexecuted gates.

## OFFICIAL REFERENCES

Checked 2026-11-03: [DeepSeek Search and Fetch](https://api-docs.deepseek.com/zh-cn/guides/search/) documents independent `/v1/tools/search` with query/count/need_content and text evidence; it does not guarantee a cover field. [Responses API](https://api-docs.deepseek.com/zh-cn/guides/responses_api/) documents native tool/model limitations and ignored parameters. The implementation controls paid calls explicitly rather than relying on `max_tool_calls`.
