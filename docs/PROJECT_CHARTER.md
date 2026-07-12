# Project Charter: academyinfo-mcp

## Purpose and status boundary

`academyinfo-mcp` provides an independent, public-intended, read-only MCP interface for factual Korean university disclosure indicators from an immutable local snapshot. It is a developer-facing package, not an official portal or evaluation service.

This charter defines the release contract. Source present in a checkout is not proof of public npm availability, public-platform support, backend approval, refresh acceptance, client interoperability, publication, promotion, or rollback readiness. Those claims require the protected evidence and administrator transitions described below.

The project is not affiliated with, sponsored by, approved by, endorsed by, or maintained by the Ministry of Education, KCUE, KEDI, data.go.kr, academyinfo.go.kr, or any university. Attribution must remain neutral and source-based.

## Runtime contract

The runtime is file-first, no-key, offline, and read-only:

- normal operation reads an immutable local SQLite seed and performs no network request;
- no service key, account, checkout, compiler, Python, or node-gyp may be required by the supported public invocation;
- raw source files are immutable inputs and are never runtime package contents;
- raw rows and indexed raw-cell text remain available for auditability in the derived model;
- responses fail closed and retain provenance, license, year/base year, unit, source column, derived/bundled state, and warnings;
- stdio stdout contains MCP JSON-RPC only; diagnostics use stderr;
- `ACADEMYINFO_DB_PATH` remains the supported custom local database boundary.

The package engine is exactly Node `>=22 <23`. Public support is limited to Node 22 macOS/arm64, Windows/x64, and Ubuntu glibc/x64 after each lane has public-install evidence. Node 24+ and systems outside that matrix are not claimed.

The public transport contract is intentionally tied to exact runtime dependencies:

- `@modelcontextprotocol/sdk` `1.29.0`;
- `zod` `4.4.3`.

They must be exact package requirements, not ranges. An upgrade requires an explicit contract revision and review of request parsing, omitted/nonobject calls, unknown-key handling, registered JSON Schema, structured content, raw stdio, SDK-client behavior, and installed dependency identities.

## Exact product scope

The server registers exactly eight read-only tools:

1. `list_sources`
2. `list_indicators`
3. `search_university`
4. `get_university_metrics`
5. `compare_universities`
6. `explain_indicator`
7. `validate_source_coverage`
8. `explore_universities`

The first seven registrations and response behavior remain backward compatible. The eighth tool adds a bounded factual exploration-to-comparison journey without changing the legacy tools. It accepts at most 10 university queries and at most 5 indicators, evaluates valid work against a single read-only snapshot, preserves input/catalog order, and returns result arrays only when every university resolves uniquely. Ambiguity returns bounded repository-ordered candidates; no tool guesses, deduplicates a user's choices, sorts by values, scores, weights, ranks, recommends, labels a winner/loser, or performs an official evaluation.

## Data and catalog contract

Dataset `15118998` is the only bundled source. Its five logical indicators are:

- `competition_rate`;
- `fill_rate`;
- `employment_rate` (school-level only);
- `scholarship_per_student`;
- `avg_tuition`.

`data/seed/indicators.json` is the sole packaged source-derived catalog. It is KOGL-attributed JSON data with catalog schema version 1, source/license metadata, and exactly those five indicators. A closed static schema validates it; runtime loading is package-relative and fails closed. There is no hard-coded fallback or generated executable TypeScript/JavaScript catalog. The database logical tables, manifest, and catalog are independently cross-checked.

Dataset `15139279`, granular/per-department/health-insurance-linked employment data, live OpenAPI behavior, and scraping are excluded. No raw, normalized, seed, sample, fixture, SQLite, CSV, JSON, or derived artifact from that dataset may enter the package or default runtime behavior.

Code is MIT licensed. Bundled data remains separately attributed under KOGL Type 1. The code license must not be applied to bundled public data.

## Refresh semantic authority

Annual refresh is governed by meaning, not frozen bytes or a fixed worksheet shape.

`worksheet_blank_v1` is true only for an absent cell or decoded raw text whose Node 22 ECMAScript `String.prototype.trim()` is empty. That one predicate governs header discovery, last populated row, padding/trailer handling, beyond-header cells, and source-row membership. Header matching alone removes a leading BOM and converts CRLF to LF; it does not normalize Unicode, translate, or apply aliases. There must be exactly one header row and exactly one mapping for every required identity/response header and each logical indicator. Any nonblank row is a source candidate; nonblank cells beyond header width block refresh.

Every retained cell has `worksheet_row`, `column_index`, `column_ref`, and unmodified `raw_text`. One source row maps exactly once to a raw row and institution, plus five numeric-or-missing classifications. Therefore source-row, raw-row, and institution counts agree, and classification count is source rows multiplied by five.

After ECMAScript trim, only empty text and ASCII `-` are missing. Numeric text must match either `[0-9]+(?:\.[0-9]+)?` or `[1-9][0-9]{0,2}(?:,[0-9]{3})+(?:\.[0-9]+)?`. Signs, exponent notation, internal whitespace, decimal commas, malformed grouping, Unicode digits, NaN, and infinity are rejected. Commas are removed only after valid grouping; integer leading zeros and fractional trailing zeros are removed; zero is `0`. `001,000` is invalid, while `1,000` canonicalizes to `1000`. A canonical decimal must produce a finite nonnegative JavaScript Number and survive exact shortest-Number-to-plain-decimal round trip. Precision loss blocks refresh; values are never rounded.

Canonical decimal text is semantic authority; any legacy REAL value must equal `Number(canonical_value)` on read and pass the independent round trip. Blocking invariants are official source/workbook/license identity, unique headers and natural key, unique logical mappings, fixed units, nondecreasing integer years, exact numeric/missing domains, and complete row coverage.

Post-download SHA-256 and physical hashes are change/integrity/audit evidence, not authenticity or approval. A matching prior checksum does not approve a source. A changed checksum does not reject it. Row or column counts, institution-set changes, values, unrelated columns, and allowed missingness are reviewed diffs but do not independently approve or block. Valid 23-column, 25-column, and other annual shapes may pass the semantic gates.

Semantic release identity uses closed RFC 8785 JCS/SHA-256 projections with stable order and canonical decimals: source model, seed logical model, full catalog, semantic manifest, then release data. Each digest projection excludes its own digest and nonsemantic physical/workflow/time fields. Physical hashes remain separate.

## Least-privilege supply chain

Acquisition/validation and repository writing are separate trust domains.

The acquisition side has immutable source, read-only repository access, no write/publish secret or OIDC, bounded HTTPS/redirect/body/archive/XML handling, and no workbook execution. It emits only sanitized candidate artifacts and a closed digest-bearing report; it never emits the raw workbook, credentials, a signed query string, or a private path.

The writer has only the repository/PR permissions required for fixed outputs. It verifies the named producer, source commit, policy/schema versions, hashes, complete allowlist, and absence of symlinks, traversal, extra files, or missing files. It executes no candidate content. It may write only the database, manifest, catalog, header/checksum/sample evidence, and one digest-named refresh audit. A failure or no-change path cannot invoke content writes.

## Conditional single-backend gate

Exactly one SQLite backend may ship:

1. `better-sqlite3` is retained only if the same package candidate proves prebuilt-only installation on all three official Node 22 lanes with fresh state, active build-tool traps, and a demonstrated trap canary.
2. If any lane fails, `sql.js` is only a spike until one reviewed version proves legacy behavior, custom/missing/corrupt path behavior, package/WASM/license/security posture, startup and RSS limits, and no-native-build operation.
3. Selecting `sql.js` additionally requires an acyclic backend-selection receipt whose fixed decision digest is separately approved by the Architect and administrator.
4. Without a passing first option or a valid second-option receipt, release state is `BLOCKED_PENDING_BACKEND_SELECTION`. There is no automatic fallback and no dual-backend package.

## Release privilege boundaries

Publication is a chain of separate immutable transitions:

1. An administrator must establish npm identity/history/ownership, 2FA or trusted-publishing readiness, provenance, protected environments, artifact retention, and an unused SemVer.
2. The candidate transition must publish under a non-`latest` candidate tag while the previous `latest` remains available. Its receipt must bind source, package, selected backend, data, dependency, test, audit, and provenance evidence.
3. Public-install verifiers must exercise the exact candidate on the three clean Node 22 lanes. A separate client receipt must join those proofs, a generic stdio journey, and actual Claude Desktop/macOS evidence. Cursor/Codex examples are not evidence unless executed.
4. A protected promotion transition must re-verify predecessor digests and administrator approval before moving that same candidate to `latest`.
5. A protected rollback transition must restore the prior `latest`, deprecate the bad version, preserve the evidence chain, reopen any matching changed-data incident, and require a new SemVer for the fix.

Every receipt uses a closed self-excluding JCS/SHA-256 topology. Candidate creation is not completion; local tarballs cannot replace public evidence; no product or data slice publishes independently.

## Public-install acceptance

Each official lane uses a fresh home, cache, working directory, and configuration outside the checkout, an explicit public registry, no reachable local artifact, and exact `npx -y academyinfo-mcp@<version>`. Evidence must include:

- installed application, SDK, and Zod names, exact versions, registry tarball identities, and integrity matches;
- candidate tag plus available signature/provenance evidence;
- Node, operating system, architecture, and Ubuntu glibc identity;
- active Python/node-gyp/compiler traps and a proven canary;
- sanitized verbose install output;
- initialize, exact eight-tool list, exact eighth-tool schema, bundled query, no-key behavior, and JSON-RPC-only stdout.

No candidate may be promoted when any lane compiles, uses another dependency version, reaches local artifacts, or lacks these proofs.

## Freshness, no-change, and rollback

Freshness timestamps are exact UTC millisecond timestamps. Official date parsing is strict; invalid official timestamps become null with a deterministic failure classification. Invalid workflow times write no state.

A provisional incident is correlated by schema, dataset, page, last accepted source SHA, and the absence of a differing SHA. Its earliest first-seen timestamp and seven-day (`604800000` ms) deadline are immutable across metadata, ETag, or repeated-failure drift. Failure keeps the last-known-good package and data available.

- Reacquired equal bytes may close only after origin/license/workbook validation through an administrator-attested verified-no-change receipt.
- Differing bytes cannot use no-change closure. They enter the changed lifecycle and close only after the matching release-data digest reaches `latest`.
- Rollback reopens the original changed-event clock rather than resetting it.

## Administrator responsibility and stop conditions

Administrators own registry identity and unused-version selection, trusted publication/provenance, protected environments, artifact retention, backend and release approvals, promotion, rollback, and freshness response. Documentation and source code do not imply those actions have occurred.

Stop without reducing scope if official acquisition requires an invented link or scraping; source/license/workbook, header, unit, year, missing, decimal, or key semantics are unclear; exact dependency/schema behavior changes; the writer needs broader privilege; public proof misses a lane or permits compilation; receipt digests disagree; or no single backend is approved. Never round, guess, drop a lane, expose a secret/private path, silently upgrade, or claim unsupported public behavior.
